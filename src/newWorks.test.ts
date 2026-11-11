import { describe, expect, it } from 'vitest'
import { groupNewWorks } from './newWorks'
import { firstSeen } from '../scripts/new-works.mjs'
import type { NewWork } from './types'

const w = (key: string, title: string, at: string, doi = ''): NewWork => ({ key, title, at, doi, year: '2026', venue: 'J' })

describe('groupNewWorks', () => {
  it('one article by three lecturers is one work with three names', () => {
    const g = groupNewWorks([w('A', 'Duck bone', '2026-11-11T00:21Z', '10.1/x'), w('B', 'Duck bone', '2026-11-11T00:21Z', '10.1/X'), w('C', 'Duck Bone', '2026-11-11T00:21Z', '10.1/x')])
    expect(g).toHaveLength(1)
    expect(g[0].keys).toEqual(['A', 'B', 'C'])
  })
  it('without a DOI the title decides; newest first', () => {
    const g = groupNewWorks([w('A', 'Old one', '2026-11-08T00:00Z'), w('B', 'New one', '2026-11-10T00:00Z'), w('C', 'new  ONE', '2026-11-10T00:00Z')])
    expect(g.map((x) => [x.title, x.keys])).toEqual([['New one', ['B', 'C']], ['Old one', ['A']]])
  })
})

type Row = { key: string; title: string }
const r = (key: string, title: string): Row => ({ key, title })

describe('firstSeen (scripts/new-works.mjs)', () => {
  const baseline = [r('A', 'one'), r('B', 'two')]
  it('a row added by a refresh is new, dated by that refresh; rows in the baseline are not', () => {
    const out = firstSeen(baseline, [{ at: 'd1', rows: [...baseline, r('A', 'three')] }], [...baseline, r('A', 'three')], 'now')
    expect(out.map((x: Row & { at: string }) => [x.title, x.at])).toEqual([['three', 'd1']])
  })
  it('a row not committed yet is dated now; a row that came and went and came back keeps its first date', () => {
    const versions = [{ at: 'd1', rows: [...baseline, r('A', 'x')] }, { at: 'd2', rows: baseline }, { at: 'd3', rows: [...baseline, r('A', 'x')] }]
    const out = firstSeen(baseline, versions, [...baseline, r('A', 'x'), r('B', 'y')], 'now')
    expect(out.map((x: Row & { at: string }) => [x.title, x.at])).toEqual([['x', 'd1'], ['y', 'now']])
  })
  it("a lecturer's first rows in a file are their record arriving, not new works", () => {
    const out = firstSeen(baseline, [{ at: 'd1', rows: [...baseline, r('Z', 'p'), r('Z', 'q')] }], [...baseline, r('Z', 'p'), r('Z', 'q')], 'now')
    expect(out).toEqual([])
  })
  it('a refresh adding more rows than the bulk limit is a bulk load', () => {
    const many = Array.from({ length: 4 }, (_, i) => r('A', `t${i}`))
    expect(firstSeen(baseline, [{ at: 'd1', rows: [...baseline, ...many] }], [...baseline, ...many], 'now', 3)).toEqual([])
    expect(firstSeen(baseline, [{ at: 'd1', rows: [...baseline, ...many] }], [...baseline, ...many], 'now', 4)).toHaveLength(4)
  })
})

import { newWorkId, unseen } from './newWorks'
describe('unseen', () => {
  it('drops works already opened, by DOI or by title', () => {
    const g = groupNewWorks([w('A', 'Duck bone', 't1', '10.1/X'), w('B', 'Other paper', 't2')])
    expect(unseen(g, new Set([newWorkId({ doi: '10.1/x', title: '' })])).map((x) => x.title)).toEqual(['Other paper'])
    expect(unseen(g, new Set([newWorkId({ doi: '', title: 'other  PAPER' })])).map((x) => x.title)).toEqual(['Duck bone'])
    expect(unseen(g, new Set())).toHaveLength(2)
  })
})
