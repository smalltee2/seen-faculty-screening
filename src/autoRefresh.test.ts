import { describe, expect, it } from 'vitest'
import { isNewerBuild } from './autoRefresh'

describe('isNewerBuild', () => {
  const now = '2026-11-10T02:00:00.000Z'
  it('is true only for a later build', () => {
    expect(isNewerBuild('2026-11-10T03:00:00.000Z', now)).toBe(true)
    expect(isNewerBuild(now, now)).toBe(false)
  })
  it('ignores an older copy served by a stale cache', () => {
    expect(isNewerBuild('2026-11-09T20:00:00.000Z', now)).toBe(false)
  })
  it('ignores a missing or unreadable timestamp', () => {
    expect(isNewerBuild(null, now)).toBe(false)
    expect(isNewerBuild('not a date', now)).toBe(false)
  })
})
