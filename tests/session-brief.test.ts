import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  loadSessionBrief, formatBriefBlock, findSecrets, briefMaxChars,
} from '../lib/session-brief'

describe('session brief', () => {
  const originalMax = process.env.ENSEMBLE_BRIEF_MAX_CHARS
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensemble-brief-'))
  })

  afterEach(() => {
    if (originalMax === undefined) delete process.env.ENSEMBLE_BRIEF_MAX_CHARS
    else process.env.ENSEMBLE_BRIEF_MAX_CHARS = originalMax
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function write(content: string): string {
    const file = path.join(dir, 'brief.md')
    fs.writeFileSync(file, content)
    return file
  }

  it('loads a brief and reports it untruncated', () => {
    const { brief, problem } = loadSessionBrief(write('We decided to keep the tmux runtime.'))
    expect(problem).toBeUndefined()
    expect(brief?.text).toBe('We decided to keep the tmux runtime.')
    expect(brief?.truncated).toBe(false)
  })

  it('reports a missing file rather than launching without context', () => {
    const { brief, problem } = loadSessionBrief(path.join(dir, 'nope.md'))
    expect(brief).toBeUndefined()
    expect(problem?.kind).toBe('unreadable')
  })

  it('treats a whitespace-only brief as empty', () => {
    const { problem } = loadSessionBrief(write('   \n\t\n'))
    expect(problem?.kind).toBe('empty')
  })

  it('truncates past the cap and says so', () => {
    process.env.ENSEMBLE_BRIEF_MAX_CHARS = '50'
    const { brief } = loadSessionBrief(write('x'.repeat(200)))
    expect(brief?.truncated).toBe(true)
    expect(brief?.originalLength).toBe(200)
    expect(brief?.text).toContain('[brief truncated at 50 characters]')
  })

  it('honours the default cap when the override is nonsense', () => {
    process.env.ENSEMBLE_BRIEF_MAX_CHARS = 'banana'
    expect(briefMaxChars()).toBe(2000)
  })

  // The brief reaches every agent CLI on the team and their archived transcripts, so
  // a credential in it is a credential handed to third-party tools.
  it('refuses a brief carrying a credential, naming the shape and not the value', () => {
    const { brief, problem } = loadSessionBrief(
      write('Use the key sk-ant-abcdefghijklmnopqrstuvwxyz012345 for testing'),
    )
    expect(brief).toBeUndefined()
    expect(problem?.kind).toBe('secret')
    expect(problem?.detail).toContain('Anthropic API key')
    expect(problem?.detail).not.toContain('abcdefghijklmnop')
  })

  it('recognises the common credential shapes', () => {
    expect(findSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123')).toContain('GitHub token')
    expect(findSecrets('AKIAIOSFODNN7EXAMPLE')).toContain('AWS access key id')
    expect(findSecrets('-----BEGIN OPENSSH PRIVATE KEY-----')).toContain('private key block')
    expect(findSecrets('password: hunter2222')).toContain('assigned password')
    expect(findSecrets('we discussed the auth module and the retry path')).toEqual([])
  })

  it('labels the block as background rather than instructions', () => {
    const block = formatBriefBlock({ text: 'Decided: keep tmux.', truncated: false, originalLength: 19 })
    expect(block).toContain('SESSION BRIEF')
    expect(block).toContain('the repository wins')
    expect(block).toContain('Decided: keep tmux.')
  })
})

// The brief must ride in the system prompt, not the typed-in task. That is the same
// hygiene rule as the collab protocol itself: scaffolding the human never wrote should
// not appear as a user turn in the agent's own chat history.
describe('session brief in the built prompt', () => {
  it('lands in the system half and never in the task half', async () => {
    const { buildCollabPrompt } = await import('../services/ensemble-service')
    const block = formatBriefBlock({
      text: 'Decided: keep the tmux runtime. Out of scope: rewriting the monitor.',
      truncated: false,
      originalLength: 68,
    })

    const { system, task } = buildCollabPrompt({
      teamId: 'team-1',
      teamName: 'test-team',
      description: 'Review the retry path',
      agentName: 'claude-2',
      teammateNames: ['codex-1'],
      agentIndex: 1,
      contextSnippet: block,
    })

    expect(system).toContain('SESSION BRIEF')
    expect(system).toContain('keep the tmux runtime')
    expect(system).toContain('the repository wins')
    expect(task).toContain('Review the retry path')
    expect(task).not.toContain('SESSION BRIEF')
    expect(task).not.toContain('keep the tmux runtime')
  })
})
