# Collab Troubleshooting

## "Agents spawn but no output / Not logged in / DNS errors"

**Recurring root cause** (observed 2026-05-04, 2026-05-06, 2026-05-08): The
ensemble service inherits the env of the shell that started it. If you start
`tsx server.ts` from a shell that lacks credentials (no recent `claude` login,
no `codex login`, missing PATH entries), every agent spawned afterward
inherits that broken env.

Symptoms in the agent panes:
- Claude: `Not logged in · Please run /login`
- Codex: `stream disconnected before completion: failed to lookup address information`

### Fix
```bash
pkill -f 'tsx server.ts'
cd ~/Documents/ensemble && nohup ./node_modules/.bin/tsx server.ts > /tmp/ensemble-server.log 2>&1 &
```

Then re-run `/collab` from the same shell where `claude --print "ok"` and
`codex login status` both succeed.

### Why the preflight catches it
`scripts/collab-preflight.sh` runs before every team spawn:
1. Service health check
2. Service age (>24h = likely stale env, fail loud)
3. DNS resolve api.openai.com + api.anthropic.com
4. `codex login status` returns "Logged in"
5. `claude --print "respond pong"` returns non-empty within 15s

### Why the postcheck catches it
`scripts/collab-postcheck.sh` runs 30s after spawn (background):
- Captures all agent tmux panes
- Greps for "Not logged in", "stream disconnected", "401 Unauthorized"
- If any match: kills team, prints diagnosis + suggested fix

## Bypass for advanced users
- `COLLAB_SKIP_PREFLIGHT=1` — skip preflight (NOT recommended)
- `COLLAB_SKIP_POSTCHECK=1` — skip postcheck
- `COLLAB_SERVICE_MAX_AGE=48` — allow older service (default 24h)
