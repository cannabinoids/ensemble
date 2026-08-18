# About this fork

Ensemble was created by **[Michel Helsdingen](https://github.com/michelhelsdingen/ensemble)** —
*"Multi-agent collaboration engine — AI agents that work as one."* It is his design, his
architecture, and MIT-licensed under his copyright, which this fork leaves untouched.
Everything below is additive.

This file exists for two reasons: to keep that credit visible, and to stop this fork
from redoing work that has already landed upstream.

## What this fork adds

- **User interjection.** `ensemble steer` writes to a durable per-agent inbox as well as
  pasting into the pane, and waits for the pane to go idle first, so a message sent
  mid-tool-call is not swallowed. Agents are told user messages outrank their teammates
  and their current plan, and asked to reply `ack: <what changed>`.
- **Pause / resume.** `ensemble pause` holds the team after the step in flight and
  exempts it from the watchdog and the idle checker; `resume` releases it.
- **Agent transcript isolation.** Claude agents spawn with `--append-system-prompt-file`
  and a pinned `--session-id`, so the collab protocol is never a user turn in their
  history, and each transcript is archived to `~/.ensemble/transcripts/<team-id>/` on
  disband instead of accumulating in the user's own session list.
- **Ollama-backed agents** via `ollama launch <integration>`, with the `--model` flag
  supplied so startup never blocks on the interactive model picker.
- **Cost model documented and guarded.** Preflight warns when `ANTHROPIC_API_KEY` or
  `OPENAI_API_KEY` is exported, because the spawner forwards those into agent panes
  where a CLI may prefer them over the user's subscription.

## Sent upstream

| What | Where | Status |
|---|---|---|
| Auto-disband: wording path, content guards, sign-off vs `steer` | [issue #4](https://github.com/michelhelsdingen/ensemble/issues/4) | open |
| `fix: hold the wording path to the same bar as the sentinel path` | [PR #5](https://github.com/michelhelsdingen/ensemble/pull/5) | open |

The interjection, transcript-isolation and ollama work has **not** been proposed
upstream. It changes behaviour rather than fixing defects — transcript archiving in
particular moves files under the user's `~/.claude` — so it waits until there is a
reason to think the direction is wanted.

## Before starting work here

```bash
./scripts/fork-status.sh
```

It fetches upstream, lists the commits we lack, and flags every file both sides have
touched. Check that list before concluding a bug is unfixed.

**Why this exists:** on 2026-08-13 this fork prepared a fix for auto-disband ending
three-agent teams early, and only discovered while opening the PR that upstream had
already landed it two days earlier (`78a37eb`, *"stop killing the third agent in a team
of three"*), along with an agent-scoped preflight rewrite that overlapped further work.
The branch had been cut from a base that was 16 commits stale. One fetch would have
caught it.

## Sync ledger

| Date | Base | Upstream head | Notes |
|---|---|---|---|
| 2026-08-13 | `77d18c2` | `390c43d` | Fork created. Base was 16 commits behind; the sentinel-path fix and preflight agent scoping had already landed upstream. |
| 2026-08-13 | `390c43d` | `390c43d` | Rebuilt onto current upstream. Dropped as superseded: our preflight agent-scoping (upstream's is broader, incl. grok), our trio prompt wording, our sentinel-path fix, our launcher template flag. Kept and re-applied onto upstream's code: interjection + inbox, pause/resume, transcript pinning and archiving, watchdog gates, ollama agents, `--roles`, monitor keys 1-9 and `p`, the API-key cost guard, and project-context prompts. |
| 2026-08-18 | `68ab51c` | `68ab51c` | Rebuilt onto upstream again after 8 commits (Aug 14-15). Dropped as superseded: nothing this time — his work was complementary. Merged *onto* his: watchdog gates now sit on top of his failed-nudge ceiling; our capability fields extend his new agent config contract; our API-key guard rides his rewritten preflight. Note: he built `lib/memory-export.ts` (collab outcomes to claude-mem) and `scripts/collab-history.py`, which covers the inbound half of the session-memory idea. |
