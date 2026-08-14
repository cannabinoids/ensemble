/**
 * Regression test for the agent configuration contract.
 *
 * Two failures this guards against, both observed on 2026-08-14:
 *  1. agents.json was cached for the process lifetime, so adding an agent did
 *     nothing until the service restarted. No warning: the unknown name fell
 *     back to claude, producing a "successful" smoke test of an agent that was
 *     never actually running.
 *  2. An unknown agent name silently became claude, so a team meant to hold
 *     independent models could hold two identical ones. For verification work
 *     that means a model checking itself.
 *
 * Run: npx tsx tests/agent-config-contract.test.ts
 */
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadAgentsConfig,
  clearAgentsConfigCache,
  resolveAgentProgram,
  resolveAgentProgramDetailed,
  availableAgentKeys,
  UnknownAgentError,
} from '../lib/agent-config'

let failures = 0
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensemble-config-'))
const configPath = path.join(tmpDir, 'agents.json')

function writeConfig(agents: Record<string, unknown>) {
  fs.writeFileSync(configPath, JSON.stringify(agents, null, 2))
}

function agent(name: string) {
  return {
    name,
    command: name,
    flags: [],
    readyMarker: '❯',
    inputMethod: 'sendKeys',
    color: 'white',
    icon: '○',
  }
}

async function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures++
    console.error(`  FAIL ${name}\n       ${err instanceof Error ? err.message : err}`)
  }
}

async function main() {
  console.log('agent config contract')
  process.env['ENSEMBLE_AGENTS_CONFIG'] = configPath
  writeConfig({ claude: agent('claude'), codex: agent('codex') })
  clearAgentsConfigCache()

  await check('reads the config', () => {
    assert.deepStrictEqual(availableAgentKeys().sort(), ['claude', 'codex'])
  })

  await check('picks up a NEW agent without a restart (the mtime trap)', () => {
    // Force a distinct mtime; some filesystems have coarse timestamps.
    const cfg = { claude: agent('claude'), codex: agent('codex'), glm: agent('glm') }
    writeConfig(cfg)
    const future = new Date(Date.now() + 2000)
    fs.utimesSync(configPath, future, future)

    assert.ok(availableAgentKeys().includes('glm'), 'glm should be visible without clearing the cache')
    assert.strictEqual(resolveAgentProgram('glm').command, 'glm')
  })

  await check('unknown agent throws in strict mode instead of becoming claude', () => {
    assert.throws(
      () => resolveAgentProgram('aider', { strict: true }),
      (err: unknown) => err instanceof UnknownAgentError && err.requested === 'aider',
    )
  })

  await check('unknown agent still falls back when not strict, but says so', () => {
    const resolved = resolveAgentProgramDetailed('aider')
    assert.strictEqual(resolved.how, 'fallback')
    assert.strictEqual(resolved.agent.command, 'claude', 'fallback target is still claude')
  })

  await check('an exact match reports how=exact, so callers can trust it', () => {
    assert.strictEqual(resolveAgentProgramDetailed('codex').how, 'exact')
  })

  await check('"claude code" still resolves, and is labelled as a substring match', () => {
    const resolved = resolveAgentProgramDetailed('claude code')
    assert.strictEqual(resolved.agent.command, 'claude')
    assert.strictEqual(resolved.how, 'substring')
  })

  await check('keeps serving the last good config if the file disappears', () => {
    loadAgentsConfig()
    fs.unlinkSync(configPath)
    assert.ok(availableAgentKeys().includes('claude'), 'should not crash on a missing file')
  })

  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
