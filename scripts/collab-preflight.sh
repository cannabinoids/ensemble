#!/usr/bin/env bash
# collab-preflight.sh — Verify collab dependencies BEFORE spawning a team.
#
# Exit codes:
#   0 — all checks passed, safe to launch
#   1 — service down (start required)
#   2 — service is stale (started in shell without auth — restart required)
#   3 — claude CLI broken (auth or binary issue)
#   4 — codex CLI broken (auth or binary issue)
#   5 — DNS/network issue
#
# Each failure prints exactly what's wrong + the fix command.

set -uo pipefail

API="${ENSEMBLE_URL:-http://localhost:23000}"
SERVICE_MAX_AGE_HOURS="${COLLAB_SERVICE_MAX_AGE:-24}"

R='\033[0m'; RED='\033[91m'; GRN='\033[92m'; YEL='\033[93m'; BD='\033[1m'

fail() {
  local code=$1; shift
  echo -e "  ${RED}✗${R} $*" >&2
  exit "$code"
}
ok() {
  echo -e "  ${GRN}✓${R} $*"
}
warn() {
  echo -e "  ${YEL}!${R} $*"
}

echo -e "${BD}collab preflight${R}"

# ─── 1. Ensemble service ───
if ! curl -sf "$API/api/v1/health" > /dev/null 2>&1; then
  fail 1 "Ensemble service NOT running on $API
     Fix: cd ~/Documents/ensemble && nohup ./node_modules/.bin/tsx server.ts > /tmp/ensemble-server.log 2>&1 &"
fi
ok "Ensemble service responding"

# ─── 2. Service age (stale state catches the 2026-05-08 issue) ───
SERVER_PID=$(pgrep -f "tsx server.ts" | head -1)
if [ -n "$SERVER_PID" ]; then
  # Get process start time in seconds (macOS-compatible)
  PROC_START_EPOCH=$(ps -p "$SERVER_PID" -o lstart= 2>/dev/null | xargs -I{} date -j -f "%a %b %d %T %Y" "{}" +%s 2>/dev/null)
  if [ -n "$PROC_START_EPOCH" ]; then
    NOW=$(date +%s)
    AGE_SECS=$((NOW - PROC_START_EPOCH))
    AGE_HRS=$((AGE_SECS / 3600))
    if [ "$AGE_HRS" -gt "$SERVICE_MAX_AGE_HOURS" ]; then
      fail 2 "Ensemble service is ${AGE_HRS}h old (>${SERVICE_MAX_AGE_HOURS}h threshold)
     This is the 2026-05-08 stale-state issue: agents will spawn with broken auth.
     Fix: pkill -f 'tsx server.ts' && cd ~/Documents/ensemble && nohup ./node_modules/.bin/tsx server.ts > /tmp/ensemble-server.log 2>&1 &"
    fi
    ok "Ensemble service age: ${AGE_HRS}h (within ${SERVICE_MAX_AGE_HOURS}h limit)"
  fi
fi

# ─── 3. DNS reachability ───
for host in api.openai.com api.anthropic.com; do
  if ! host "$host" > /dev/null 2>&1; then
    fail 5 "DNS lookup failed for $host
     Fix: check internet connection / VPN / DNS resolver"
  fi
done
ok "DNS resolves api.openai.com + api.anthropic.com"

# ─── 3b. TMUX DNS-staleness check (regression 2026-05-13) ───
# Het tmux-server proces cached zijn eigen libc-resolver. Na uren draaien valt
# getaddrinfo() in tmux-spawned children silent uit ("Unknown host") terwijl
# `host` op shell-niveau het wel doet. Resultaat: codex/claude in tmux krijgen
# stream-disconnects bij elke api-call. Detecteer door ping in verse pane;
# faal → kill-server (effe geen attached clients = veilig).
TMUX_DNS_SESS="preflight-dns-$$"
TMUX_DNS_OUT="/tmp/preflight-dns-$$.out"
rm -f "$TMUX_DNS_OUT"
tmux new-session -d -s "$TMUX_DNS_SESS" -c /tmp 2>/dev/null
tmux send-keys -t "$TMUX_DNS_SESS" -l "ping -c 1 -W 2 api.openai.com > $TMUX_DNS_OUT 2>&1; echo PINGDONE_$$ >> $TMUX_DNS_OUT"
tmux send-keys -t "$TMUX_DNS_SESS" C-m
for _ in $(seq 1 8); do
  grep -q "PINGDONE_$$" "$TMUX_DNS_OUT" 2>/dev/null && break
  sleep 0.5
done
tmux kill-session -t "$TMUX_DNS_SESS" 2>/dev/null
TMUX_DNS_RESULT=$(cat "$TMUX_DNS_OUT" 2>/dev/null || echo "")
rm -f "$TMUX_DNS_OUT"

if echo "$TMUX_DNS_RESULT" | grep -qE "PING api\.openai\.com"; then
  ok "TMUX DNS resolver healthy"
elif echo "$TMUX_DNS_RESULT" | grep -qE "Unknown host|cannot resolve"; then
  warn "TMUX DNS resolver stale — auto-fix: killing tmux server"
  # Save list of any attached clients (rare since iTerm clients live elsewhere)
  ATTACHED=$(tmux list-clients 2>/dev/null | wc -l | tr -d ' ')
  if [ "$ATTACHED" -gt "0" ]; then
    warn "  $ATTACHED tmux client(s) attached — skipping kill (would disrupt user)"
    warn "  Manual fix: detach clients (Ctrl+B d) en re-run /collab"
    fail 5 "TMUX DNS dead and clients attached — cannot auto-fix"
  fi
  tmux kill-server 2>/dev/null
  sleep 0.5
  ok "TMUX server killed; new spawns will inherit fresh resolver"
else
  warn "TMUX DNS probe inconclusive: ${TMUX_DNS_RESULT:0:120}"
fi

# ─── 4. Codex CLI auth ───
if ! command -v codex > /dev/null 2>&1; then
  fail 4 "codex binary not in PATH
     Fix: install codex CLI or check PATH"
fi
CODEX_AUTH=$(codex login status 2>&1 | head -1)
if echo "$CODEX_AUTH" | grep -qiE "logged in"; then
  ok "Codex authenticated: ${CODEX_AUTH:0:60}"
else
  fail 4 "Codex not authenticated. Status: $CODEX_AUTH
     Fix: codex login"
fi

# ─── 4a. Codex quota probe (regression 2026-05-13: 'usage limit hit' isn't ──
#         caught by `codex login status` — only by an actual exec call). Run a
#         minimal `codex exec` and look for the limit-message. Costs ~1 token.
CODEX_QUOTA_OUT=$(timeout 25 codex exec --dangerously-bypass-approvals-and-sandbox "say ok" 2>&1 | tail -5)
if echo "$CODEX_QUOTA_OUT" | grep -qiE "hit your usage limit|usage limit|rate.?limit|quota"; then
  RESET_TIME=$(echo "$CODEX_QUOTA_OUT" | grep -oE "try again at[^.]*\." | head -1)
  warn "Codex quota dead: ${RESET_TIME:-(unknown reset time)} — codex-1 disabled this run"
  CODEX_DEAD=1
else
  ok "Codex quota healthy (probe responded)"
  CODEX_DEAD=0
fi

# ─── 4b. Codex update-prompt suppression (regression van 2026-05-10) ───
# Codex CLI toont op startup een interactieve "Update available!" prompt zodra
# latest_version > dismissed_version in ~/.codex/version.json. De ensemble
# spawn-flow stuurt vervolgens een Enter, wat optie 1 (update now) selecteert
# → codex draait `brew upgrade` en exit terug naar zsh, waarna alle prompt-
# berichten in de zsh shell belanden (en de pane corrupt raakt). Hard-block:
# zet dismissed_version gelijk aan latest_version vóór elke spawn.
CODEX_VERSION_FILE="${HOME}/.codex/version.json"
if [ -f "$CODEX_VERSION_FILE" ]; then
  CODEX_PROMPT_STATE=$(VERSION_FILE="$CODEX_VERSION_FILE" python3 - <<'PY'
import json, os, sys
path = os.environ['VERSION_FILE']
try:
    with open(path) as f:
        data = json.load(f)
except Exception as e:
    print(f"unreadable: {e}")
    sys.exit(0)
latest = data.get('latest_version')
dismissed = data.get('dismissed_version')
if not latest:
    print("no-latest")
    sys.exit(0)
if dismissed == latest:
    print(f"already-dismissed:{latest}")
    sys.exit(0)
data['dismissed_version'] = latest
with open(path, 'w') as f:
    json.dump(data, f)
print(f"dismissed:{latest}")
PY
)
  case "$CODEX_PROMPT_STATE" in
    already-dismissed:*) ok "Codex update-prompt al gedismissed (${CODEX_PROMPT_STATE#already-dismissed:})" ;;
    dismissed:*)         ok "Codex update-prompt onschadelijk gemaakt (${CODEX_PROMPT_STATE#dismissed:})" ;;
    no-latest)           warn "Codex version.json zonder latest_version (kan ok zijn na verse install)" ;;
    unreadable:*)        warn "Codex version.json onleesbaar — startup-prompt kan herstarten ($CODEX_PROMPT_STATE)" ;;
    *)                   warn "Codex version.json check onverwacht: $CODEX_PROMPT_STATE" ;;
  esac
else
  warn "Codex version.json niet gevonden (~/.codex/version.json) — startup-prompt-suppressie skipped"
fi

# ─── 5. Claude CLI auth — test in TMUX-context (where agents actually spawn) ───
# REGRESSION 2026-05-13: previous test ran in caller shell. When the caller is a
# Claude Code session under Happy, that shell has in-process auth that does NOT
# propagate to children. Result: preflight passed but spawned claude in tmux
# was "Not logged in", agents died silently. This test now runs in the same
# context as the real spawn (fresh tmux pane, unset CLAUDECODE).
if ! command -v claude > /dev/null 2>&1; then
  warn "claude binary not in PATH — Claude-2 will be disabled, codex-only mode"
  echo "codex" > /tmp/collab-agents-override.txt
else
  CLAUDE_PROBE_SESS="collab-preflight-claude-$$"
  CLAUDE_PROBE_OUT="/tmp/collab-preflight-claude-$$.out"
  rm -f "$CLAUDE_PROBE_OUT"
  tmux new-session -d -s "$CLAUDE_PROBE_SESS" -c "$HOME" 2>/dev/null
  tmux send-keys -t "$CLAUDE_PROBE_SESS" -l " unset CLAUDECODE; claude auth status > $CLAUDE_PROBE_OUT 2>&1; echo DONE_$$ >> $CLAUDE_PROBE_OUT"
  tmux send-keys -t "$CLAUDE_PROBE_SESS" C-m
  # Wait up to 8s for probe
  for _ in $(seq 1 16); do
    grep -q "DONE_$$" "$CLAUDE_PROBE_OUT" 2>/dev/null && break
    sleep 0.5
  done
  tmux kill-session -t "$CLAUDE_PROBE_SESS" 2>/dev/null

  CLAUDE_PROBE=$(cat "$CLAUDE_PROBE_OUT" 2>/dev/null || echo "")
  rm -f "$CLAUDE_PROBE_OUT"

  if echo "$CLAUDE_PROBE" | grep -q '"loggedIn": true'; then
    ok "Claude auth verified in spawn-context (tmux)"
    CLAUDE_DEAD=0
  elif echo "$CLAUDE_PROBE" | grep -qE '"loggedIn": false|"authMethod": "none"'; then
    warn "Claude NOT logged in in spawn-context"
    warn "  Fix permanent: open fresh terminal (zonder Happy) en run: claude /login"
    CLAUDE_DEAD=1
  else
    warn "Claude auth-probe inconclusive (probe output: ${CLAUDE_PROBE:0:120})"
    CLAUDE_DEAD=1
  fi
fi

# ─── Decide which agents to spawn ───
CODEX_DEAD="${CODEX_DEAD:-0}"
CLAUDE_DEAD="${CLAUDE_DEAD:-0}"

if [ "$CODEX_DEAD" = "1" ] && [ "$CLAUDE_DEAD" = "1" ]; then
  rm -f /tmp/collab-agents-override.txt
  fail 3 "BEIDE agents zijn dood. /collab kan niet draaien:
     - Codex: usage limit hit (zie waarschuwing hierboven)
     - Claude: not logged in in spawn-context
     Fix: wacht tot codex-quota reset OF run 'claude /login' in een fresh terminal"
elif [ "$CODEX_DEAD" = "1" ]; then
  warn "Auto-fallback: claude-only (codex quota op)"
  echo "claude" > /tmp/collab-agents-override.txt
elif [ "$CLAUDE_DEAD" = "1" ]; then
  warn "Auto-fallback: codex-only (claude niet ingelogd)"
  echo "codex" > /tmp/collab-agents-override.txt
else
  rm -f /tmp/collab-agents-override.txt
fi

echo -e "  ${GRN}${BD}All preflight checks passed${R}"
exit 0
