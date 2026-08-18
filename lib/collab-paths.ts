/**
 * Collab Path Resolver — Shared path contract for multi-collab isolation.
 * All runtime files live under /tmp/ensemble/<teamId>/.
 * Shell equivalent: scripts/collab-paths.sh (must stay in sync).
 */

import path from 'path'
import fs from 'fs'

const RUNTIME_ROOT = '/tmp/ensemble'

/** Base runtime directory for a team */
export function collabRuntimeDir(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId)
}

/** JSONL message log */
export function collabMessagesFile(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'messages.jsonl')
}

/** Summary text written on disband */
export function collabSummaryFile(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'summary.txt')
}

/** Bridge process PID file */
export function collabBridgePid(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'bridge.pid')
}

/** Bridge log file */
export function collabBridgeLog(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'bridge.log')
}

/** Poller process PID file */
export function collabPollerPid(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'poller.pid')
}

/** Live feed output file */
export function collabFeedFile(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'feed.txt')
}

/** Per-agent prompt file */
export function collabPromptFile(teamId: string, agentName: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'prompts', `${agentName}.txt`)
}

/** Per-agent system prompt file (collab protocol, kept out of the chat transcript) */
export function collabSystemPromptFile(teamId: string, agentName: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'prompts', `${agentName}.system.txt`)
}

/**
 * Per-agent interjection inbox. User messages are appended here as well as pasted
 * into the pane, so an interjection survives a paste that lands while the agent is
 * busy — the agent picks it up on its next team-read.
 */
export function collabInboxFile(teamId: string, agentName: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'inbox', `${agentName}.md`)
}

/** Per-session delivery file */
export function collabDeliveryFile(teamId: string, sessionName: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'delivery', `${sessionName}.txt`)
}

/** Bridge result file (raw bridge output) */
export function collabBridgeResult(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'bridge-result')
}

/** Bridge posted marker */
export function collabBridgePosted(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'bridge-posted')
}

/** Team ID marker file */
export function collabTeamIdFile(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, 'team-id')
}

/** Finished marker (written on disband, signals cleanup) */
export function collabFinishedMarker(teamId: string): string {
  return path.join(RUNTIME_ROOT, teamId, '.finished')
}

/** Ensure the runtime directory (and subdirs) exist */
export function ensureCollabDirs(teamId: string): void {
  const base = collabRuntimeDir(teamId)
  fs.mkdirSync(path.join(base, 'prompts'), { recursive: true })
  fs.mkdirSync(path.join(base, 'delivery'), { recursive: true })
  fs.mkdirSync(path.join(base, 'inbox'), { recursive: true })
}

/**
 * Where agent transcripts are moved on disband, so collab runs stop appearing
 * in the user's own session history. Kept (not deleted) — the work inside is real.
 */
export function collabTranscriptArchiveDir(teamId: string): string {
  return path.join(
    process.env.ENSEMBLE_DATA_DIR || path.join(process.env.HOME || '/tmp', '.ensemble'),
    'transcripts',
    teamId,
  )
}
