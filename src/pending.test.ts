import { describe, expect, it } from 'vitest'
import type { ConferenceMatch } from './conferences'
import { conferenceGroups } from './pending'
import type { Pub } from './types'

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
