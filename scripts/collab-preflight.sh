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

# ─── 5. Claude CLI auth (3-second smoke test) ───
if ! command -v claude > /dev/null 2>&1; then
  fail 3 "claude binary not in PATH
     Fix: check PATH / reinstall claude CLI"
fi

# Run claude --print with timeout; expect non-empty, non-error output
CLAUDE_OUTPUT=$(timeout 15 claude --permission-mode auto --print "respond with exactly 'pong'" 2>&1)
CLAUDE_EXIT=$?

if [ "$CLAUDE_EXIT" -ne 0 ]; then
  fail 3 "Claude CLI failed (exit $CLAUDE_EXIT). Output: ${CLAUDE_OUTPUT:0:200}
     Fix: claude  (interactive login)"
fi

if echo "$CLAUDE_OUTPUT" | grep -qiE "not logged in|please run /login|authentication required"; then
  fail 3 "Claude not logged in. Output: $CLAUDE_OUTPUT
     Fix: claude  (interactive login)"
fi

if [ -z "$CLAUDE_OUTPUT" ] || [ "${#CLAUDE_OUTPUT}" -lt 2 ]; then
  fail 3 "Claude returned empty output (likely auth issue or hung process)
     Fix: claude  (interactive login or restart)"
fi

ok "Claude responded: ${CLAUDE_OUTPUT:0:60}"

echo -e "  ${GRN}${BD}All preflight checks passed${R}"
exit 0
