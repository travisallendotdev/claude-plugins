import { test, expect, describe } from 'bun:test'
import { isRenderableUser, isRenderableAssistant, parseJsonl } from '../src/filter'

describe('parseJsonl', () => {
  test('parses one message per line, skipping blanks and parse errors', () => {
    const text = [
      '{"type":"user","isSidechain":false,"message":{"role":"user","content":"hi"}}',
      '',
      'not-json',
      '{"type":"assistant","isSidechain":false,"message":{"role":"assistant","content":[]}}',
    ].join('\n')
    const out = parseJsonl(text)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ type: 'user' })
    expect(out[1]).toMatchObject({ type: 'assistant' })
  })
})

describe('isRenderableUser', () => {
  test('keeps a real user prompt with string content', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: 'hello' },
    })).toBe(true)
  })

  test('rejects sidechain user messages', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: true,
      message: { role: 'user', content: 'sub' },
    })).toBe(false)
  })

  test('rejects synthetic tool_result user messages', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    })).toBe(false)
  })

  test('keeps a user message whose array content has only text', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: [{ type: 'text', content: 'hi' }] },
    })).toBe(true)
  })

  test('rejects non-user types', () => {
    expect(isRenderableUser({ type: 'system', subtype: 'x' })).toBe(false)
    expect(isRenderableUser({ type: 'summary', summary: 'x', leafUuid: 'y' })).toBe(false)
  })
})

describe('isRenderableAssistant', () => {
  test('keeps a normal assistant message', () => {
    expect(isRenderableAssistant({
      type: 'assistant', isSidechain: false,
      message: { role: 'assistant', content: [] },
    })).toBe(true)
  })
  test('rejects sidechain assistant messages', () => {
    expect(isRenderableAssistant({
      type: 'assistant', isSidechain: true,
      message: { role: 'assistant', content: [] },
    })).toBe(false)
  })
  test('rejects non-assistant types', () => {
    expect(isRenderableAssistant({ type: 'user', isSidechain: false } as any)).toBe(false)
  })
})
