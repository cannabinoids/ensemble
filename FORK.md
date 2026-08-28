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
- **Session brief.** `collab-launch --brief <file>` hands the team a curated summary of
  what the human already worked out, injected into every agent's system prompt. A
  written brief rather than a session transcript on purpose: it reaches every agent CLI
  and their archived transcripts, so it is bounded, refused if it carries key-shaped
  strings, and announced in the feed when truncated. Upstream covers the other
  direction — `lib/memory-export.ts` sends finished collabs to claude-mem.
- **Auto-disband correctness** (the three cases from the now-closed issue #4, fixed
  here rather than upstream):
  1. *A trio does not lose its third agent.* The wording path requires every active
     agent, not any two — the bar the sentinel path already holds. Specs: "does NOT
     auto-disband a trio when only two of three used completion wording" / "auto-disbands
     a trio once all three used completion wording".
  2. *Describing the machinery is not finishing.* A sign-off must be short and must not
     quote orchestration vocabulary, so an agent reviewing a script and quoting its
     `---STATUS:{ACTIVE,QUIET,DONE,WAITING}` sentinel no longer ends the run. Specs in
     `tests/premature-disband.test.ts` under "describing the machinery is not finishing".
  3. *A sign-off does not survive a redirect.* Sentinels and wording only count from the
     last `ensemble steer` or resume, so a team cannot disband while an agent is
     answering the user. The cutoff gates completion evidence only — the message count
     and idle clock still read the whole run, or a team steered near the end would never
     meet the message floor again and would hang forever.
- **Cost model documented and guarded.** Preflight warns when `ANTHROPIC_API_KEY` or
  `OPENAI_API_KEY` is exported, because the spawner forwards those into agent panes
  where a CLI may prefer them over the user's subscription.

## Sent upstream

| What | Where | Status |
|---|---|---|
| Auto-disband: wording path, content guards, sign-off vs `steer` | [issue #4](https://github.com/michelhelsdingen/ensemble/issues/4) | **closed by us** — fixed here instead |
| `fix: hold the wording path to the same bar as the sentinel path` | [PR #5](https://github.com/michelhelsdingen/ensemble/pull/5) | **closed by us** |

Nothing else was proposed, and nothing more is planned. PR #5 was closed rather than
left stale: upstream raised the idle thresholds in `1782034`, which absorbed most of
the practical risk, and the remaining changes sit in a function upstream is actively
iterating on — a standing PR there is friction for the maintainer, not help. The
reproductions in issue #4 stand on their own if they are ever wanted.

**Posture from here: track, do not propose.** Read what upstream ships, take what is
better than ours, keep the rest local. Expect convergence rather than conflict — both
sides are solving the same problems from the same evidence, and upstream has repeatedly
arrived at the same conclusions independently (the sentinel-path fix, agent-scoped
preflight, and progress-vs-completion wording all landed there before or beside ours).

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
