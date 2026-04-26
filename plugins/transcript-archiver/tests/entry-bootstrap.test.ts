import { test, expect, describe } from 'bun:test'
import { ensureDeps } from '../src/entry'
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ensureDeps', () => {
  test('returns true (no install needed) when node_modules exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ensure-deps-'))
    mkdirSync(join(dir, 'node_modules'))
    expect(ensureDeps(dir)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test('returns false when CLAUDE_PLUGIN_ROOT-style path is empty', () => {
    expect(ensureDeps('')).toBe(false)
  })

  test('returns false when path does not exist', () => {
    expect(ensureDeps('/nonexistent/path/that/should/not/exist/zzz')).toBe(false)
  })
})
