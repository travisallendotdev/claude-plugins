import { test, expect } from 'bun:test'
import { localDate, localTime } from '../src/tz'

// These tests use the system local timezone; values below assume process.env.TZ is set
// in the test runner. We force TZ via Bun.env in beforeAll.
import { beforeAll } from 'bun:test'
beforeAll(() => { process.env.TZ = 'America/New_York' })

test('localDate formats ISO timestamp as YYYY-MM-DD in local TZ', () => {
  // 2026-04-26T03:30:00Z is 2026-04-25T23:30 EDT
  expect(localDate('2026-04-26T03:30:00Z')).toBe('2026-04-25')
})

test('localTime formats ISO timestamp as HH:MM:SS in local TZ', () => {
  expect(localTime('2026-04-26T03:30:15Z')).toBe('23:30:15')
})

test('localDate handles a timestamp already in local-day range', () => {
  // 2026-04-25T15:00:00Z is 2026-04-25T11:00 EDT
  expect(localDate('2026-04-25T15:00:00Z')).toBe('2026-04-25')
})

test('localTime pads single-digit components', () => {
  // 2026-04-25T13:05:09Z is 2026-04-25T09:05:09 EDT
  expect(localTime('2026-04-25T13:05:09Z')).toBe('09:05:09')
})
