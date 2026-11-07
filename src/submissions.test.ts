import { describe, expect, it } from 'vitest'
import { approvedRows, submittedTag, type Submission } from './submissions'
import type { RawPub } from './types'

const sub = (over: Partial<Submission>): Submission => ({
  id: 'a1', nameEn: 'Teerachai Amnuaylojaroen', year: 2024, title: 'A work', authors: 'T A', type: 'journal', venue: 'J Env', volume: '1(2)',
  doi: 'https://doi.org/10.1234/x.1', research: true, created: '2026-11-07T00:00:00Z', status: 'approved', decidedAt: '', note: '', ...over,
})
const lecturers = new Set(['Teerachai Amnuaylojaroen'])

describe('approvedRows', () => {
  it('turns an approved work into a counted manual row', () => {
    const [r] = approvedRows([sub({})], lecturers, [])
    expect(r).toMatchObject({ source: 'manual', key: 'Teerachai Amnuaylojaroen', year: 2024, extType: 'journal', manualResearch: true, doi: '10.1234/x.1', submitted: 'self:a1', venue: 'J Env 1(2), 2024' })
  })
  it('leaves out pending, rejected and withdrawn works', () => {
    const items = (['pending', 'rejected', 'withdrawn'] as const).map((status, i) => sub({ id: `p${i}`, status }))
    expect(approvedRows(items, lecturers, [])).toEqual([])
  })
  it('leaves out names that are not SEEN lecturers', () => {
    expect(approvedRows([sub({ nameEn: 'Someone Else' })], lecturers, [])).toEqual([])
  })
  it('does not count a work twice once data/self.tsv has it', () => {
    const bundled = [{ submitted: submittedTag('a1') } as RawPub]
    expect(approvedRows([sub({})], lecturers, bundled)).toEqual([])
  })
})
