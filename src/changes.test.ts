import { describe, expect, it } from 'vitest'
import { MAX_ENTRIES, appendChange, changeTotals, diffSnapshots, type ChangeEntry, type Snapshot } from './changes'

const snap = (at: string, year: number, people: Snapshot['people']): Snapshot => ({ at, year, people })
const base = snap('2026-11-09T00:00:00Z', 2026, {
  A: { name: 'ก', roles: { ms_teacher: 'met', ms_advisor: 'met' }, works: { 'A|x': ['X', 2022, true], 'A|y': ['Y', 2021, true] } },
  B: { name: 'ข', roles: { ms_teacher: 'not_met' }, works: {} },
})

describe('diffSnapshots', () => {
  it('returns null when nothing changed', () => {
    expect(diffSnapshots(base, { ...base, at: '2026-11-10T00:00:00Z' })).toBeNull()
  })

  it('lists added, removed and recounted works and status changes per lecturer', () => {
    const next = snap('2026-11-10T00:00:00Z', 2026, {
      A: { name: 'ก', roles: { ms_teacher: 'met', ms_advisor: 'not_met' }, works: { 'A|x': ['X', 2022, false], 'A|z': ['Z', 2026, true] } },
      B: base.people.B,
    })
    const e = diffSnapshots(base, next)!
    expect(e.people).toHaveLength(1)
    const a = e.people[0]
    expect(a.added).toEqual([{ title: 'Z', year: 2026, counted: true }])
    expect(a.removed).toEqual([{ title: 'Y', year: 2021, counted: true }])
    expect(a.recounted).toEqual([{ title: 'X', year: 2022, counted: false, was: true }])
    expect(a.status).toEqual([{ role: 'ms_advisor', from: 'met', to: 'not_met' }])
    expect(changeTotals(e)).toEqual({ added: 1, removed: 1, recounted: 1, status: 1 })
    expect(e.prevAt).toBe(base.at)
  })

  it('marks lecturers who joined or left the roster', () => {
    const next = snap('2026-11-10T00:00:00Z', 2026, {
      A: base.people.A,
      C: { name: 'ค', roles: { ms_teacher: 'met' }, works: { 'C|q': ['Q', 2025, true] } },
    })
    const e = diffSnapshots(base, next)!
    expect(e.people.map((p) => [p.nameEn, p.roster])).toEqual([['B', 'left'], ['C', 'joined']])
    expect(e.people[1].status).toEqual([{ role: 'ms_teacher', from: null, to: 'met' }])
  })

  it('carries both years so a year rollover can be labelled', () => {
    const next = snap('2027-01-01T00:00:00Z', 2027, { ...base.people, B: { ...base.people.B, roles: { ms_teacher: 'met' } } })
    const e = diffSnapshots(base, next)!
    expect([e.prevYear, e.year]).toEqual([2026, 2027])
  })
})

describe('appendChange', () => {
  const entry = (at: string): ChangeEntry => ({ at, prevAt: '', year: 2026, prevYear: 2026, people: [] })
  it('puts the newest first, ignores null and keeps the cap', () => {
    const log = Array.from({ length: MAX_ENTRIES }, (_, i) => entry(String(i)))
    expect(appendChange(log, null)).toBe(log)
    const out = appendChange(log, entry('new'))
    expect(out).toHaveLength(MAX_ENTRIES)
    expect(out[0].at).toBe('new')
  })
})
