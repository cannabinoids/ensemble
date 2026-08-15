/**
 * Regression test for the collab memory export.
 *
 * It used to post to a hardcoded http://localhost:37777 with an empty
 * `.catch(() => {})`. The worker on this machine listens on 37703, so every
 * export failed, and the empty catch meant a failing export was indistinguishable
 * from a working one. Measured 2026-08-14: 3 stored observations, all from 08-08,
 * and 29 teams after that which stored nothing.
 *
 * Run: npx tsx tests/memory-export.test.ts
 */
import { afterAll, describe, it } from 'vitest'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveMemoryEndpoint, exportObservation, pendingExportFile } from '../lib/memory-export'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensemble-mem-'))

const OBS = {
  title: 'Collab: test',
  subtitle: 'a + b',
  type: 'discovery',
  narrative: 'narrative',
  project: 'test',
}


describe('memory export', () => {
    const originalUrl = process.env.ENSEMBLE_MEMORY_URL

  it('honours ENSEMBLE_MEMORY_URL above everything else', () => {
    process.env.ENSEMBLE_MEMORY_URL = 'http://example.test/obs'
    assert.strictEqual(resolveMemoryEndpoint(), 'http://example.test/obs')
  })

  it('without an override it does NOT return the old hardcoded 37777', () => {
    delete process.env.ENSEMBLE_MEMORY_URL
    const endpoint = resolveMemoryEndpoint()
    const settings = path.join(os.homedir(), '.claude-mem', 'settings.json')
    if (!fs.existsSync(settings)) {
            return
    }
    const port = Number(JSON.parse(fs.readFileSync(settings, 'utf-8'))['CLAUDE_MEM_WORKER_PORT'])
    if (!Number.isInteger(port) || port <= 0) return
    assert.ok(endpoint.includes(String(port)), `endpoint ${endpoint} should use the configured port ${port}`)
  })

  it('a failing export reports instead of swallowing the error', async () => {
    // Port 1 is never listening, so this is a guaranteed connection failure.
    process.env.ENSEMBLE_MEMORY_URL = 'http://127.0.0.1:1/api/observations'
    const result = await exportObservation(OBS, tmpDir, 1500)
    assert.strictEqual(result.ok, false)
    assert.ok(result.error || result.status, 'a failure must carry a reason')
  })

  it('a failing export parks the payload for a retry', () => {
    const parked = pendingExportFile(tmpDir)
    assert.ok(fs.existsSync(parked), 'pending-observation.json should exist')
    const saved = JSON.parse(fs.readFileSync(parked, 'utf-8'))
    assert.strictEqual(saved.observation.title, OBS.title)
    assert.ok(saved.attemptedAt, 'should record when it was attempted')
  })

  it('never throws, so a disband cannot fail on it', async () => {
    process.env.ENSEMBLE_MEMORY_URL = 'not-a-valid-url'
    const result = await exportObservation(OBS, undefined, 1000)
    assert.strictEqual(result.ok, false)
  })

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.ENSEMBLE_MEMORY_URL
    else process.env.ENSEMBLE_MEMORY_URL = originalUrl
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
