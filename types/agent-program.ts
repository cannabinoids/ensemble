/**
 * AgentProgram — Declarative configuration for AI agent programs.
 * Loaded from agents.json at runtime; eliminates hardcoded agent-specific logic.
 */

export interface AgentProgram {
  /** Unique identifier matching the key in agents.json (e.g. "codex", "claude") */
  name: string
  /** CLI command to launch the agent (e.g. "codex", "claude", "glm") */
  command: string
  /** Default flags appended to the command (e.g. ["-m", "gpt-5.4"]) */
  flags: string[]
  /** String that appears in tmux pane when agent is ready for input */
  readyMarker: string
  /** How to deliver multi-line prompts */
  inputMethod: 'pasteFromFile' | 'sendKeys'
  /** Base color name for monitor TUI (e.g. "blue", "green", "magenta", "yellow") */
  color: string
  /** Single-char icon shown in monitor UI (e.g. "◆", "●", "▲", "★") */
  icon: string
  /**
   * Flag that loads a system prompt from a file (e.g. "--append-system-prompt-file").
   * When set, the collab protocol is passed as a system prompt instead of being typed
   * in as a user turn, keeping orchestration text out of the agent's chat history.
   */
  systemPromptFileFlag?: string
  /**
   * Flag that pins the conversation to a caller-supplied UUID (e.g. "--session-id"),
   * which is what makes archiving the transcript on disband deterministic.
   */
  sessionIdFlag?: string
  /**
   * Where this program persists its transcript. Supports {sessionId} and {cwdSlug}.
   * Requires sessionIdFlag.
   */
  transcriptPathTemplate?: string
}

export interface AgentsConfig {
  [key: string]: AgentProgram
}
