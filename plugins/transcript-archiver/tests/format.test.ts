import { test, expect, describe, beforeAll } from 'bun:test'
import { formatUserTurn, formatAssistantTurn } from '../src/format'
import type { UserMessage, AssistantMessage } from '../src/filter'

beforeAll(() => { process.env.TZ = 'America/New_York' })

describe('formatUserTurn', () => {
  test('string content becomes the body', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: 'hello there' },
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\nhello there\n')
  })

  test('array content with text-only joins text segments', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ]},
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\nfirst\n\nsecond\n')
  })

  test('image attachment shows marker', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: [{ type: 'image' } as any] },
    }
    expect(formatUserTurn(m)).toContain('_[image attached]_')
  })

  test('empty content shows attachment-only marker placeholder', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: '' },
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\n_[empty message]_\n')
  })
})

describe('formatAssistantTurn', () => {
  test('text-only assistant turn', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'text', text: 'I will do X.' },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe('## 🤖 Assistant — 11:00:05\n\nI will do X.\n')
  })

  test('thinking renders as blockquote before text', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'Let me think.\nMore thoughts.' },
        { type: 'text', text: 'Here is my answer.' },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      '> Let me think.\n> More thoughts.\n\n' +
      'Here is my answer.\n'
    )
  })

  test('tool calls render as italic breadcrumb lines', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'text', text: 'Reading files.' },
        { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
        { type: 'tool_use', name: 'Read', input: { file_path: 'b.ts' } },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      'Reading files.\n\n' +
      '_[Read a.ts]_\n' +
      '_[Read b.ts]_\n'
    )
  })

  test('tool-call-only turn still gets a heading', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      '_[Bash: ls]_\n'
    )
  })
})
