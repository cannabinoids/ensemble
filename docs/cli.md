---
title: CLI Reference
nav_order: 5
---

# CLI Reference

## ensemble CLI

```bash
# Run via tsx
npx tsx cli/ensemble.ts <command>

# Or if linked
ensemble <command>
```

### Commands

| Command | Description |
|---|---|
| `status` | Check server health |
| `teams` / `ls` | List all teams |
| `monitor [teamId]` | Open TUI monitor |
| `monitor --latest` | Monitor most recent team |
| `steer <teamId> "msg"` | Send steering message to team |
| `pause <teamId>` | Tell the team to stand down after the current step |
| `resume <teamId>` | Release a paused team |
| `help` | Show help |

### Examples

```bash
# Check server
ensemble status

# List active teams
ensemble teams

# Watch the latest team
ensemble monitor --latest

# Redirect a team's focus
ensemble steer abc-123 "Stop the current approach and focus on testing"
```

---

## TUI Monitor

The terminal monitor (`cli/monitor.ts`) provides a real-time view of agent collaboration.

### Keybindings

| Key | Action |
|---|---|
| `s` | Steer entire team (opens input) |
| `1`-`4` | Steer specific agent by index (1 = lead, then the workers in order) |
| `j` / `k` or `↓` / `↑` | Scroll message history |
| `d` | Disband team |
| `q` | Quit monitor |
| `ESC` | Cancel input |

### Where the monitor opens

`collab-launch.sh` starts the monitor for you, in a herdr pane, an iTerm2 split, a tmux split or
a detached tmux session depending on where you are. In the herdr and iTerm cases the pane closes
itself when the team disbands, so `q` is only needed if you want to stop watching early. See
[Collab Scripts](collab-scripts#collab-launchsh) for the selection order.

### Idle detection

After 60 seconds of no activity combined with completion signals, the monitor shows an action menu:

- Show summary
- Let team continue working
- Steer with new goal
- Disband team

---

## npm scripts

```bash
npm run dev       # Start server (development)
npm run start     # Start server (production)
npm run build     # TypeScript typecheck (no emit)
npm run lint      # ESLint
npm run monitor   # Open TUI monitor for latest team
npm run cli       # Run ensemble CLI
```

## Interjections

`steer` is the supported way to talk to a running team — never paste into agent panes
directly. Each interjection is appended to the recipient's inbox
(`/tmp/ensemble/<teamId>/inbox/<agent>.md`) *and* pasted into its pane once the pane
goes idle, so it survives a paste that would otherwise land mid-tool-call. Agents treat
`user` messages as outranking their teammates and their current plan, and reply with
`ack: <what changed>` before continuing.

```bash
ensemble steer abc-123 "focus on the retry path"
ensemble steer abc-123 --to claude-2 "you take the tests"
ensemble pause abc-123
ensemble resume abc-123
```
