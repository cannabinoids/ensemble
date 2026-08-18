import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnsembleTeam } from '../types/ensemble'
import { resolveTranscriptPath } from '../lib/agent-spawner'

function makeTeam(overrides: Partial<EnsembleTeam> = {}): EnsembleTeam {
  return {
    id: 'team-1',
    name: 'test-team',
    description: 'test',
    status: 'active',
    agents: [
      { agentId: 'a1', name: 'codex-1', program: 'codex', role: 'lead', hostId: 'local', status: 'active' },
      { agentId: 'a2', name: 'claude-2', program: 'claude', role: 'worker', hostId: 'local', status: 'active' },
    ],
    createdBy: 'test',
    createdAt: '2026-03-18T10:00:00.000Z',
    feedMode: 'live',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────
// Prompt split — orchestration text stays out of chat history
// ─────────────────────────────────────────────────────
describe('buildCollabPrompt() — system/task split', () => {
  async function build(agentCount = 2) {
    const { buildCollabPrompt } = await import('../services/ensemble-service')
    return buildCollabPrompt({
      teamId: 'team-1',
      teamName: 'test-team',
      description: 'Review the auth module',
      agentName: 'claude-2',
      teammateNames: agentCount === 2 ? ['codex-1'] : ['codex-1', 'gemini-3'],
      agentIndex: 1,
      agentRole: 'worker',
    })
  }

  it('keeps the orchestration protocol out of the typed-in task', async () => {
    const { system, task } = await build()

    expect(system).toContain('COMMUNICATION RULES')
    expect(system).toContain('team-say.sh')
    expect(system).toContain('<<COLLAB_DONE>>')

    // The task is what lands in the visible transcript — it must read like a task,
    // not like scripted machinery.
    expect(task).toContain('Review the auth module')
    expect(task).not.toContain('COMMUNICATION RULES')
    expect(task).not.toContain('<<COLLAB_DONE>>')
  })

  it('gives user interjections priority over teammates and the current plan', async () => {
    const { system } = await build()

    expect(system).toContain('USER INTERJECTIONS')
    expect(system).toContain('outrank')
    expect(system).toContain('ack:')
    expect(system).toContain('HOLD')
  })

  it('requires every teammate to agree before the done sentinel', async () => {
    const { system } = await build(3)
    // Upstream's phrasing counts teammates and agents explicitly.
    expect(system).toContain('ALL 2 of your teammates have')
    expect(system).toContain('all 3 agents have sent')
  })

  it('points team-read at the agent so its priority inbox is included', async () => {
    const { system } = await build()
    expect(system).toMatch(/team-read\.sh team-1 claude-2/)
  })
})

// ─────────────────────────────────────────────────────
// Transcript path resolution — deterministic archiving
// ─────────────────────────────────────────────────────
describe('resolveTranscriptPath()', () => {
  it('maps a working directory to Claude Code\'s project slug', () => {
    const result = resolveTranscriptPath(
      '~/.claude/projects/{cwdSlug}/{sessionId}.jsonl',
      'abc-123',
      '/Users/someone/Documents/Claude',
    )
    expect(result).toBe(
      path.join(process.env.HOME || '', '.claude/projects/-Users-someone-Documents-Claude/abc-123.jsonl'),
    )
  })

  it('leaves absolute templates untouched', () => {
    const result = resolveTranscriptPath('/var/log/{sessionId}.jsonl', 'xyz', '/tmp')
    expect(result).toBe('/var/log/xyz.jsonl')
  })
})

// ─────────────────────────────────────────────────────
// User interjection delivery
// ─────────────────────────────────────────────────────
describe('sendTeamMessage() — user interjections', () => {
  const originalDataDir = process.env.ENSEMBLE_DATA_DIR
  let tempRoot: string
  let pasteFromFile: ReturnType<typeof vi.fn>
  let capturePane: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ensemble-interject-'))
    process.env.ENSEMBLE_DATA_DIR = tempRoot
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.doUnmock('../lib/ensemble-registry')
    vi.doUnmock('../lib/agent-runtime')
    vi.doUnmock('../lib/hosts-config')
    vi.doUnmock('../lib/agent-config')
    vi.doUnmock('../lib/agent-spawner')
    vi.doUnmock('../lib/collab-paths')
    if (originalDataDir === undefined) delete process.env.ENSEMBLE_DATA_DIR
    else process.env.ENSEMBLE_DATA_DIR = originalDataDir
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  async function setup(team: EnsembleTeam, paneOutput = '❯ ') {
    pasteFromFile = vi.fn(async () => {})
    capturePane = vi.fn(async () => paneOutput)

    vi.doMock('../lib/ensemble-registry', () => ({
      getTeam: vi.fn(() => team),
      loadTeams: vi.fn(() => [team]),
      getMessages: vi.fn(() => []),
      appendMessage: vi.fn(),
      updateTeam: vi.fn(),
      createTeam: vi.fn(),
      saveTeams: vi.fn(),
    }))
    vi.doMock('../lib/agent-runtime', () => ({
      getRuntime: vi.fn(() => ({
        sessionExists: vi.fn(async () => true),
        capturePane,
        pasteFromFile,
        sendKeys: vi.fn(async () => {}),
      })),
    }))
    vi.doMock('../lib/hosts-config', () => ({
      isSelf: vi.fn(() => true),
      getHostById: vi.fn(),
      getSelfHostId: vi.fn(() => 'local'),
    }))
    vi.doMock('../lib/agent-config', () => ({
      resolveAgentProgram: vi.fn(() => ({ readyMarker: '❯', inputMethod: 'sendKeys' })),
    }))
    vi.doMock('../lib/agent-spawner', () => ({
      spawnLocalAgent: vi.fn(), killLocalAgent: vi.fn(), spawnRemoteAgent: vi.fn(),
      killRemoteAgent: vi.fn(), postRemoteSessionCommand: vi.fn(),
      isRemoteSessionReady: vi.fn(), getAgentTokenUsage: vi.fn(async () => 'unknown'),
      archiveAgentTranscript: vi.fn(() => ({ archived: false })),
    }))
    vi.doMock('../lib/collab-paths', () => ({
      ensureCollabDirs: vi.fn(),
      collabPromptFile: vi.fn((t: string, a: string) => path.join(tempRoot, `${t}-${a}.prompt.txt`)),
      collabSystemPromptFile: vi.fn((t: string, a: string) => path.join(tempRoot, `${t}-${a}.system.txt`)),
      collabInboxFile: vi.fn((t: string, a: string) => path.join(tempRoot, 'inbox', `${t}-${a}.md`)),
      collabDeliveryFile: vi.fn((t: string, s: string) => path.join(tempRoot, `${t}-${s}.delivery.txt`)),
      collabSummaryFile: vi.fn((t: string) => path.join(tempRoot, `${t}.summary.txt`)),
      collabMessagesFile: vi.fn((t: string) => path.join(tempRoot, `${t}.messages.jsonl`)),
      collabRuntimeDir: vi.fn((t: string) => path.join(tempRoot, t)),
      collabFinishedMarker: vi.fn((t: string) => path.join(tempRoot, `${t}.finished`)),
      collabBridgePosted: vi.fn((t: string) => path.join(tempRoot, `${t}.posted`)),
      collabBridgeResult: vi.fn((t: string) => path.join(tempRoot, `${t}.result`)),
      collabTranscriptArchiveDir: vi.fn((t: string) => path.join(tempRoot, `${t}-archive`)),
    }))

    return import('../services/ensemble-service')
  }

  it('writes the interjection to every recipient inbox', async () => {
    const team = makeTeam()
    const mod = await setup(team)

    await mod.sendTeamMessage('team-1', 'team', 'drop the caching work, fix the retry path', 'user')

    const codexInbox = fs.readFileSync(path.join(tempRoot, 'inbox', 'team-1-codex-1.md'), 'utf-8')
    const claudeInbox = fs.readFileSync(path.join(tempRoot, 'inbox', 'team-1-claude-2.md'), 'utf-8')
    expect(codexInbox).toContain('drop the caching work, fix the retry path')
    expect(claudeInbox).toContain('from user')
  })

  it('marks the pane delivery as an override, not a peer message', async () => {
    const team = makeTeam()
    const mod = await setup(team)

    await mod.sendTeamMessage('team-1', 'team', 'focus on security', 'user')

    const delivered = fs.readFileSync(path.join(tempRoot, 'team-1-test-team-codex-1.delivery.txt'), 'utf-8')
    expect(delivered).toContain('⚡ USER INTERJECTION')
    expect(delivered).toContain('overrides your current plan')
    expect(delivered).toContain('ack:')
  })

  it('waits for the pane to go idle before pasting an interjection', async () => {
    const team = makeTeam()
    const mod = await setup(team)

    await mod.sendTeamMessage('team-1', 'team', 'switch targets', 'user')

    expect(capturePane).toHaveBeenCalled()
    expect(pasteFromFile).toHaveBeenCalled()
  })

  it('does not inbox or gate agent-to-agent messages', async () => {
    const team = makeTeam()
    const mod = await setup(team)

    await mod.sendTeamMessage('team-1', 'team', 'here are my findings', 'codex-1')

    expect(fs.existsSync(path.join(tempRoot, 'inbox', 'team-1-claude-2.md'))).toBe(false)
    expect(capturePane).not.toHaveBeenCalled()
    const delivered = fs.readFileSync(path.join(tempRoot, 'team-1-test-team-claude-2.delivery.txt'), 'utf-8')
    expect(delivered).toContain('[Team message from codex-1]')
  })
})
