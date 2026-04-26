import type { UserMessage, AssistantMessage } from './filter'
import { localTime } from './tz'
import { renderToolBreadcrumb } from './tools'

function userBody(m: UserMessage): string {
  const c = m.message.content
  if (typeof c === 'string') {
    return c.length === 0 ? '_[empty message]_' : c
  }
  const segments: string[] = []
  for (const part of c) {
    if (part.type === 'text') {
      const s = part.text ?? part.content ?? ''
      if (s) segments.push(s)
    } else if (part.type === 'image') {
      segments.push('_[image attached]_')
    } else if (part.type === 'tool_result') {
      // filtered upstream, but keep defensive
      continue
    }
  }
  return segments.length === 0 ? '_[empty message]_' : segments.join('\n\n')
}

export function formatUserTurn(m: UserMessage): string {
  const time = localTime(m.timestamp ?? '')
  return `## 👤 User — ${time}\n\n${userBody(m)}\n`
}

function blockquote(text: string): string {
  return text.split('\n').map((l) => `> ${l}`).join('\n')
}

export function formatAssistantTurn(m: AssistantMessage): string {
  const time = localTime(m.timestamp ?? '')
  const parts = m.message.content
  // Build segments preserving order; group consecutive tool_use into one line each.
  const segments: string[] = []
  for (const p of parts) {
    if (p.type === 'thinking') {
      const t = p.thinking ?? ''
      if (t) segments.push(blockquote(t))
    } else if (p.type === 'text') {
      const t = p.text ?? ''
      if (t) segments.push(t)
    } else if (p.type === 'tool_use') {
      segments.push(renderToolBreadcrumb(p.name ?? 'Tool', p.input ?? {}))
    }
  }
  // Join: tool_use lines should be tight (no blank line between consecutive
  // breadcrumbs), but separate from prose by a blank line.
  const out: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const isCrumb = seg.startsWith('_[') && seg.endsWith(']_')
    const prev = i > 0 ? segments[i - 1] : undefined
    const prevIsCrumb = prev !== undefined && prev.startsWith('_[') && prev.endsWith(']_')
    if (i === 0) {
      out.push(seg)
    } else if (isCrumb && prevIsCrumb) {
      out.push('\n', seg)
    } else {
      out.push('\n\n', seg)
    }
  }
  const body = out.join('')
  return `## 🤖 Assistant — ${time}\n\n${body}\n`
}
