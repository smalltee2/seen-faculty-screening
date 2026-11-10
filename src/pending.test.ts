import { describe, expect, it } from 'vitest'
import type { ConferenceMatch } from './conferences'
import { conferenceGroups, pendingQueue } from './pending'
import { evaluatePerson, type Settings } from './rules'
import type { Submission } from './submissions'
import type { Faculty, Pub } from './types'

const S: Settings = { year: 2026, countPosters: true, strict: true }
const P: Faculty = { nameEn: 'P', nameTh: 'พ', scholarId: '', rank: 'ผศ.', degree: 'ปริญญาเอก', degreeYear: 2005, programs: [], notes: '' }
let n = 0
const pub = (year: number | null, over: Partial<Pub> = {}): Pub => {
  n++
  return {
    line: n, key: 'P', year, title: `t${n}`, authors: '', venue: 'J 1 (1), 1-2', cites: 0, id: `P|t${n}`, titleNorm: `t${n}`,
    type: 'journal', typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false,
    ownDegree: null, duplicates: 0, sources: ['scholar'], override: null, ...over,
  }
}
const conf = (key: string, verdict: ConferenceMatch['verdict']): ConferenceMatch => ({ entry: null, key, verdict, reason: '', by: 'none' as ConferenceMatch['by'] })
const sub = (id: string, status: Submission['status'], created: string): Submission =>
  ({ id, nameEn: 'P', year: 2026, title: id, authors: '', type: 'journal', venue: 'J', volume: '', doi: '', research: true, created, status, decidedAt: '', note: '' }) as Submission

describe('conferenceGroups', () => {
  const pubs = [
    pub(2025, { type: 'proceeding', conference: conf('a', 'count') }),
    pub(2024, { type: 'poster', conference: conf('b', 'pending') }),
    pub(2026, { type: 'proceeding', conference: conf('b', 'pending') }),
    pub(2019, { type: 'proceeding', conference: conf('old', 'pending') }),
    pub(2025, { type: 'journal', conference: conf('j', 'pending') }),
    pub(2025, { type: 'proceeding' }),
  ]
  it('groups conference works from minYear on, undecided first', () => {
    const g = conferenceGroups(pubs, [], 2022)
    expect(g.map((x) => x.match.key)).toEqual(['b', 'a'])
    expect(g[0].pubs).toHaveLength(2)
    expect(g[0].pending).toBe(0)
  })
  it('counts self-submitted works that are still awaiting approval', () => {
    const g = conferenceGroups(pubs, [pub(2026, { type: 'poster', conference: conf('c', 'pending') }), pub(2026, { type: 'poster', conference: conf('b', 'pending') })], 2022)
    expect(g.find((x) => x.match.key === 'c')).toMatchObject({ pending: 1 })
    expect(g.find((x) => x.match.key === 'b')).toMatchObject({ pending: 1 })
    expect(g.find((x) => x.match.key === 'b')!.pubs).toHaveLength(3)
  })
})

describe('pendingQueue', () => {
  const pubs = [
    pub(2025, { type: 'proceeding', conference: conf('a', 'count') }),
    pub(2026, { type: 'proceeding', conference: conf('b', 'pending') }),
    pub(2025, { typeUncertain: true, typeReason: 'ไม่ชัด' }), // in the 2022–2026 window
    pub(2018, { typeUncertain: true, typeReason: 'ไม่ชัด' }), // outside: cannot change this year's result
    pub(null), // no year: listed
  ]
  const results = [evaluatePerson(P, pubs, S)]
  const q = pendingQueue({
    results, pubs, pendingPubs: [], settings: S, minYear: 2022,
    submissions: [sub('s2', 'pending', '2026-11-02'), sub('s0', 'approved', '2026-10-01'), sub('s1', 'pending', '2026-11-01')],
  })
  it('keeps only undecided conferences', () => {
    expect(q.conferences.map((g) => g.match.key)).toEqual(['b'])
  })
  it('lists submissions awaiting approval, oldest first', () => {
    expect(q.submissions.map((s) => s.id)).toEqual(['s1', 's2'])
  })
  it('lists review items inside the window or without a year', () => {
    expect(q.review.map((it) => it.pub.year).sort()).toEqual([2025, null])
  })
  it('totals the three lists', () => {
    expect(q.total).toBe(1 + 2 + 2)
  })
})
