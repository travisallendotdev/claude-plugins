import { test, expect } from 'bun:test'
import { projectSlug } from '../src/slug'

test('basename of typical posix path', () => {
  expect(projectSlug('/Users/travis/dev/ai-agents/sandbox')).toBe('sandbox')
})

test('lowercases the result', () => {
  expect(projectSlug('/Users/travis/dev/My-Project')).toBe('my-project')
})

test('replaces non-[a-z0-9-] characters with -', () => {
  expect(projectSlug('/Users/travis/My Project (v2)')).toBe('my-project--v2-')
})

test('trailing slash is ignored', () => {
  expect(projectSlug('/Users/travis/dev/sandbox/')).toBe('sandbox')
})

test('falls back to "unknown" for root', () => {
  expect(projectSlug('/')).toBe('unknown')
})

test('falls back to "unknown" for empty string', () => {
  expect(projectSlug('')).toBe('unknown')
})
