// Minimal structural types — we don't depend on claude-hooks' types for the
// predicates because predicates need to accept arbitrary JSON-shaped values
// and narrow them, not just reject the wrong type.

export interface UserMessage {
  type: 'user'
  isSidechain: boolean
  message: {
    role: 'user'
    content: string | Array<{
      type: string
      content?: string
      text?: string
      tool_use_id?: string
    }>
  }
  cwd?: string
  gitBranch?: string
  timestamp?: string
  uuid?: string
}

export interface AssistantMessage {
  type: 'assistant'
  isSidechain: boolean
  message: {
    role: 'assistant'
    model?: string
    content: Array<{
      type: 'text' | 'thinking' | 'tool_use'
      text?: string
      thinking?: string
      name?: string
      input?: Record<string, unknown>
      id?: string
    }>
  }
  cwd?: string
  gitBranch?: string
  timestamp?: string
  uuid?: string
}

export type AnyMessage = UserMessage | AssistantMessage | { type: string; [k: string]: unknown }

export function parseJsonl(text: string): AnyMessage[] {
  const out: AnyMessage[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as AnyMessage)
    } catch {
      // skip malformed lines
    }
  }
  return out
}

export function isRenderableUser(m: AnyMessage): m is UserMessage {
  if (m.type !== 'user') return false
  const u = m as UserMessage
  if (u.isSidechain) return false
  const content = u.message?.content
  if (Array.isArray(content)) {
    if (content.some((c) => c?.type === 'tool_result')) return false
  }
  return true
}

export function isRenderableAssistant(m: AnyMessage): m is AssistantMessage {
  if (m.type !== 'assistant') return false
  const a = m as AssistantMessage
  if (a.isSidechain) return false
  return true
}
