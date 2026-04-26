import { test, expect, describe, beforeAll, beforeEach } from 'bun:test'
import { renderSession } from '../src/render'
import { existsSync, readFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

beforeAll(() => { process.env.TZ = 'America/New_York' })

function setup() {
  const out = mkdtempSync(join(tmpdir(), 'archiver-test-'))
  return {
    outDir: out,
    cleanup: () => rmSync(out, { recursive: true, force: true }),
  }
}

const SESSION_ID = '7a880cf0-8849-4b4f-bd7f-75f8bbfae80d'

describe('single-day session', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('writes one file with expected name and headings', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/single-day.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir)
    expect(files).toEqual([`2026-04-25_sandbox_${SESSION_ID}.md`])
    const body = readFileSync(join(s.outDir, files[0]!), 'utf8')
    expect(body).toContain('## 👤 User — 11:00:00')
    expect(body).toContain('hi')
    expect(body).toContain('## 🤖 Assistant — 11:00:05')
    expect(body).toContain('hello')
    expect(body).not.toContain('session_ended_at')
    expect(body).not.toContain('continues_into')
    expect(body).not.toContain('continued_from')

    s.cleanup()
  })

  test('SessionEnd adds session_ended_at on the (only) file', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/single-day.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: '2026-04-25T15:30:00Z',
    })
    const f = join(s.outDir, `2026-04-25_sandbox_${SESSION_ID}.md`)
    expect(readFileSync(f, 'utf8')).toContain('session_ended_at: 2026-04-25T15:30:00Z')
    s.cleanup()
  })
})

describe('cross-midnight session', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('produces two files with chain markers; no session_ended_at on day 1; no session_ended_at on day 2 unless SessionEnd', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir).sort()
    expect(files).toEqual([
      `2026-04-25_sandbox_${SESSION_ID}.md`,
      `2026-04-26_sandbox_${SESSION_ID}.md`,
    ])
    const day1 = readFileSync(join(s.outDir, files[0]!), 'utf8')
    const day2 = readFileSync(join(s.outDir, files[1]!), 'utf8')

    expect(day1).toContain('continues_into: 2026-04-26')
    expect(day1).not.toContain('session_ended_at')
    expect(day1).not.toContain('continued_from')
    expect(day1).toContain('_Session continues in [2026-04-26_sandbox_')

    expect(day2).toContain('continued_from: 2026-04-25')
    expect(day2).toContain('original_started_at: 2026-04-26T03:50:00Z')
    expect(day2).not.toContain('session_ended_at')
    expect(day2).not.toContain('continues_into')
    expect(day2).toContain('_Continued from [2026-04-25_sandbox_')
    s.cleanup()
  })

  test('SessionEnd sets session_ended_at on day 2 only', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: '2026-04-26T05:00:00Z',
    })
    const day1 = readFileSync(join(s.outDir, `2026-04-25_sandbox_${SESSION_ID}.md`), 'utf8')
    const day2 = readFileSync(join(s.outDir, `2026-04-26_sandbox_${SESSION_ID}.md`), 'utf8')
    expect(day1).not.toContain('session_ended_at')
    expect(day2).toContain('session_ended_at: 2026-04-26T05:00:00Z')
    s.cleanup()
  })
})

describe('resumed session with gap', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('chain markers point across the gap to the next/previous existing file', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/resumed-with-gap.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir).sort()
    expect(files).toEqual([
      `2026-04-25_sandbox_${SESSION_ID}.md`,
      `2026-04-30_sandbox_${SESSION_ID}.md`,
    ])
    const day1 = readFileSync(join(s.outDir, files[0]!), 'utf8')
    const day5 = readFileSync(join(s.outDir, files[1]!), 'utf8')
    expect(day1).toContain('continues_into: 2026-04-30')
    expect(day5).toContain('continued_from: 2026-04-25')
    s.cleanup()
  })
})

describe('no-renderable-messages safety', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('writes nothing when transcript has only system entries', () => {
    const tmp = join(s.outDir, 'sys-only.jsonl')
    require('node:fs').writeFileSync(tmp, '{"type":"system","subtype":"x"}\n')
    renderSession({
      transcriptPath: tmp,
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    // Only the input file remains; no markdown was written.
    expect(readdirSync(s.outDir)).toEqual(['sys-only.jsonl'])
    s.cleanup()
  })
})

describe('idempotency', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('rendering twice produces identical output', () => {
    const args = {
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    }
    renderSession(args)
    const first = readdirSync(s.outDir).sort().map((f) =>
      readFileSync(join(s.outDir, f), 'utf8'))
    renderSession(args)
    const second = readdirSync(s.outDir).sort().map((f) =>
      readFileSync(join(s.outDir, f), 'utf8'))
    expect(second).toEqual(first)
    s.cleanup()
  })
})
