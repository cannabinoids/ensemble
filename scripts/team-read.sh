#!/usr/bin/env bash
# team-read — Read messages from your team feed, plus your priority inbox.
# Usage: team-read <team-id> [agent-name]
#
# Passing your agent name also surfaces user interjections that were routed to you.
# Those outrank teammate messages: act on them before continuing your current plan.
URL="${ENSEMBLE_URL:-http://localhost:23000}"
TEAM_ID="${1:?Usage: team-read <team-id> [agent-name]}"
AGENT_NAME="${2:-}"

if [ -n "$AGENT_NAME" ]; then
  INBOX="/tmp/ensemble/$TEAM_ID/inbox/$AGENT_NAME.md"
  if [ -s "$INBOX" ]; then
    echo "⚡ USER INTERJECTIONS (highest priority — these override your current plan):"
    cat "$INBOX"
    echo "--- end inbox ---"
    echo ""
  fi
fi

curl -sf "$URL/api/ensemble/teams/$TEAM_ID/feed" | python3 -c "
import json,sys
for m in json.load(sys.stdin).get('messages',[]):
  print(f'{m[\"from\"]} -> {m[\"to\"]}: {m[\"content\"]}')
" 2>/dev/null
