/**
 * Regression test for teams that ended while they were still working.
 *
 * On 2026-08-15 a four-agent research team was auto-disbanded after 4,5 minutes.
 * Two agents had used finishing words about a SUB-STEP:
 *   "Eerste lezing summary.ts klaar; nu tests, schema, restic-hook"
 *   "systematische vergelijking klaar. De vier workers op een rij"
 * Both announce what comes next. After that everyone went quiet to read code,
 * and sixty seconds of silence was enough to end the session. The result was a
 * solid diagnosis but no finished design, because the agent that had the design
 * was killed mid-task.
 *
 * Run: npx tsx tests/premature-disband.test.ts
 */
import { describe, it } from 'vitest'
import assert from 'node:assert'
import { __testing } from '../services/ensemble-service'

const { hasCompletionSignal, TWO_SIGNAL_IDLE_THRESHOLD_MS, SINGLE_SIGNAL_IDLE_THRESHOLD_MS } = __testing



// The two real messages that ended the team.
describe('premature disband', () => {
it('"eerste lezing klaar; nu tests" is progress, not an ending', () => {
  assert.strictEqual(
    hasCompletionSignal('Eerste lezing summary.ts klaar; nu tests, schema, restic-hook en hoe system'),
    false,
  )
})

it('"systematische vergelijking klaar" followed by findings is progress', () => {
  assert.strictEqual(
    hasCompletionSignal('glm-3: systematische vergelijking klaar. De vier workers op een rij, met regels.'),
    false,
  )
})

it('claiming a slice of the work never counts as finishing', () => {
  assert.strictEqual(hasCompletionSignal('Ik pak OPDRACHT 2, dat is klaar voor mij'), false)
  assert.strictEqual(hasCompletionSignal('Mijn kavel is done, ik wacht op codex'), false)
})

// It must still recognise a genuine ending, otherwise teams never close.
it('a real closing statement still counts', () => {
  assert.strictEqual(hasCompletionSignal('Ik ben klaar. Geen openstaande punten meer.'), true)
  assert.strictEqual(hasCompletionSignal('Mijn analyse is afgerond, ik heb niets toe te voegen.'), true)
})

it('idle thresholds leave room for an agent that is reading', () => {
  // A research agent regularly goes minutes without posting. Anything under a
  // few minutes measures thinking, not idleness.
  assert.ok(
    TWO_SIGNAL_IDLE_THRESHOLD_MS >= 300_000,
    `two-signal threshold ${TWO_SIGNAL_IDLE_THRESHOLD_MS}ms is too short for real work`,
  )
  assert.ok(
    SINGLE_SIGNAL_IDLE_THRESHOLD_MS > TWO_SIGNAL_IDLE_THRESHOLD_MS,
    'one signal should need MORE silence than two, not less',
  )
})
})

// A message about the orchestration is not a message about the agent. Seen on a
// review task pointed at scripts/collab-poll.sh: both agents quoted its own
// ---STATUS:{ACTIVE,QUIET,DONE,WAITING} sentinel, and the run ended mid-analysis.
describe('describing the machinery is not finishing', () => {
  it('quoting the DONE sentinel of a script under review is not an ending', () => {
    assert.strictEqual(
      hasCompletionSignal('collab-poll.sh emits TSV lines terminated by a ---STATUS:{ACTIVE,QUIET,DONE,WAITING} sentinel'),
      false,
    )
  })

  it('talking about the DONE protocol is not an ending', () => {
    assert.strictEqual(hasCompletionSignal('I will follow the DONE protocol once we agree'), false)
  })

  it('announcing a team-say is not an ending', () => {
    assert.strictEqual(hasCompletionSignal('I will send the done sentinel via team-say when you agree'), false)
  })

  it('a long analysis that merely contains finishing words is not an ending', () => {
    const analysis = 'Exchange 2: the two scripts disagree about what finished means, and the cursor is done differently in each. '.padEnd(600, 'x')
    assert.strictEqual(hasCompletionSignal(analysis), false)
  })

  it('but a short genuine sign-off still counts', () => {
    assert.strictEqual(hasCompletionSignal('Ik ben klaar'), true)
  })
})
