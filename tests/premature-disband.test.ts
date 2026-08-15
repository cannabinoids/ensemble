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
import assert from 'node:assert'
import { __testing } from '../services/ensemble-service'

const { hasCompletionSignal, TWO_SIGNAL_IDLE_THRESHOLD_MS, SINGLE_SIGNAL_IDLE_THRESHOLD_MS } = __testing

let failures = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures++
    console.error(`  FAIL ${name}\n       ${err instanceof Error ? err.message : err}`)
  }
}

console.log('premature disband')

// The two real messages that ended the team.
check('"eerste lezing klaar; nu tests" is progress, not an ending', () => {
  assert.strictEqual(
    hasCompletionSignal('Eerste lezing summary.ts klaar; nu tests, schema, restic-hook en hoe system'),
    false,
  )
})

check('"systematische vergelijking klaar" followed by findings is progress', () => {
  assert.strictEqual(
    hasCompletionSignal('glm-3: systematische vergelijking klaar. De vier workers op een rij, met regels.'),
    false,
  )
})

check('claiming a slice of the work never counts as finishing', () => {
  assert.strictEqual(hasCompletionSignal('Ik pak OPDRACHT 2, dat is klaar voor mij'), false)
  assert.strictEqual(hasCompletionSignal('Mijn kavel is done, ik wacht op codex'), false)
})

// It must still recognise a genuine ending, otherwise teams never close.
check('a real closing statement still counts', () => {
  assert.strictEqual(hasCompletionSignal('Ik ben klaar. Geen openstaande punten meer.'), true)
  assert.strictEqual(hasCompletionSignal('Mijn analyse is afgerond, ik heb niets toe te voegen.'), true)
})

check('idle thresholds leave room for an agent that is reading', () => {
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

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
