import { test, expect, describe } from 'bun:test'
import { buildFrontmatter, type FrontmatterFields } from '../src/frontmatter'

describe('buildFrontmatter', () => {
  test('emits all required fields in order', () => {
    const fields: FrontmatterFields = {
      session_id: 'abc-123',
      project: 'sandbox',
      cwd: '/Users/travis/dev/sandbox',
      started_at: '2026-04-25T23:07:54Z',
      last_updated_at: '2026-04-25T23:42:11Z',
    }
    const out = buildFrontmatter(fields)
    expect(out).toBe(
      '---\n' +
      'session_id: abc-123\n' +
      'project: sandbox\n' +
      "cwd: '/Users/travis/dev/sandbox'\n" +
      'started_at: 2026-04-25T23:07:54Z\n' +
      'last_updated_at: 2026-04-25T23:42:11Z\n' +
      '---\n'
    )
  })

  test('omits optional fields when not provided', () => {
    const fields: FrontmatterFields = {
      session_id: 'a',
      project: 'p',
      cwd: '/p',
      started_at: 't1',
      last_updated_at: 't2',
    }
    const out = buildFrontmatter(fields)
    expect(out).not.toContain('git_branch')
    expect(out).not.toContain('model')
    expect(out).not.toContain('session_ended_at')
    expect(out).not.toContain('continues_into')
    expect(out).not.toContain('continued_from')
    expect(out).not.toContain('original_started_at')
  })

  test('includes git_branch and model when provided', () => {
    const out = buildFrontmatter({
      session_id: 'a',
      project: 'p',
      cwd: '/p',
      git_branch: 'main',
      model: 'claude-opus-4-7',
      started_at: 't1',
      last_updated_at: 't2',
    })
    expect(out).toContain('git_branch: main\n')
    expect(out).toContain('model: claude-opus-4-7\n')
  })

  test('continues_into and session_ended_at are mutually exclusive (caller responsibility but both renderable individually)', () => {
    const a = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      session_ended_at: 't3',
    })
    expect(a).toContain('session_ended_at: t3\n')
    expect(a).not.toContain('continues_into')

    const b = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      continues_into: '2026-04-26',
    })
    expect(b).toContain('continues_into: 2026-04-26\n')
    expect(b).not.toContain('session_ended_at')
  })

  test('original_started_at and continued_from on continuation files', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      original_started_at: 't0',
      continued_from: '2026-04-25',
    })
    expect(out).toContain('original_started_at: t0\n')
    expect(out).toContain('continued_from: 2026-04-25\n')
  })

  test('quotes string values containing spaces or special chars', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p',
      cwd: '/Users/travis/My Project',
      started_at: 't1', last_updated_at: 't2',
    })
    expect(out).toContain("cwd: '/Users/travis/My Project'\n")
  })

  test('escapes single quotes inside quoted values', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p',
      cwd: "/path/with'apostrophe",
      started_at: 't1', last_updated_at: 't2',
    })
    expect(out).toContain("cwd: '/path/with''apostrophe'\n")
  })
})
