import { describe, expect, it } from 'vitest'
import { buildTciIndex, journalLevel, journalTag, matchTci, normIssn, normName, venueName } from './tci'
import type { Pub, TciJournal } from './types'

const tci: TciJournal[] = [
  { nameEng: 'Thai Environmental Engineering Journal', nameLocal: 'วารสารวิศวกรรมสิ่งแวดล้อมไทย', abbrev: 'Thai Environ. Eng. J.', issn: '1686-2961', eissn: '2673-0359', tier: '1', status: 'active' },
  { nameEng: 'The Journal of Industrial Technology Thepsatri Rajabhat University', nameLocal: '', abbrev: '', issn: '', eissn: '3027-849X', tier: '2', status: 'active' },
  { nameEng: 'Some Tier Three Journal', nameLocal: '', abbrev: '', issn: '1111-1111', eissn: '', tier: '3', status: 'active' },
]
const scopusJournals = [{ issn: '2079-9276', name: 'Resources' }]
const idx = buildTciIndex(tci, scopusJournals)

const pub = (over: Partial<Pub>): Pub =>
  ({ type: 'journal', venue: '', sources: ['scholar'], issn: '', ...over }) as Pub

describe('TCI / Scopus journal level', () => {
  it('normalises ISSNs and names', () => {
    expect(normIssn('2673-0359')).toBe('26730359')
    expect(normIssn('3027-849x')).toBe('3027849X')
    expect(normName('The Journal of Industrial Technology, Thepsatri Rajabhat University')).toBe('journal of industrial technology thepsatri rajabhat university')
  })
  it('strips volume, issue, pages and year from a Scholar venue', () => {
    expect(venueName('Thai Environmental Engineering Journal 36 (2), 1-10, 2022')).toBe('Thai Environmental Engineering Journal')
    expect(venueName('Resources 15 (11), 142, 2026')).toBe('Resources')
    expect(venueName('วารสารวิชาการพลังงานทดแทนสู่ชุมชน 5 (3), 94-112, 2022')).toBe('วารสารวิชาการพลังงานทดแทนสู่ชุมชน')
  })
  it('matches TCI by ISSN first, then by name', () => {
    expect(matchTci({ venue: 'Unknown name 1 (1), 2022', issn: '2673-0359' }, idx)?.by).toBe('issn')
    expect(matchTci({ venue: 'Thai Environmental Engineering Journal 36 (2), 1-10, 2022', issn: '' }, idx)?.by).toBe('name')
    expect(matchTci({ venue: 'Nature 600, 1-2, 2022', issn: '0028-0836' }, idx)).toBeNull()
  })
  it('Scopus article → international; Scopus-indexed journal (by ISSN or name) → international', () => {
    expect(journalLevel(pub({ sources: ['scholar', 'scopus'] }), idx)).toEqual({ level: 'intl' })
    expect(journalLevel(pub({ venue: 'Resources 15 (11), 142, 2026' }), idx)).toEqual({ level: 'intl' })
    expect(journalLevel(pub({ venue: 'X', issn: '2079-9276' }), idx)).toEqual({ level: 'intl' })
  })
  it('TCI กลุ่ม 1–2 → national; กลุ่ม 3 or unmatched → outside', () => {
    expect(journalLevel(pub({ venue: 'Thai Environmental Engineering Journal 36 (2), 1-10, 2022' }), idx)).toEqual({ level: 'natl', tier: '1', by: 'name' })
    expect(journalLevel(pub({ venue: 'Z', issn: '3027-849X' }), idx)).toEqual({ level: 'natl', tier: '2', by: 'issn' })
    expect(journalLevel(pub({ venue: 'Z', issn: '1111-1111' }), idx)).toEqual({ level: 'none', tier: '3', by: 'issn' })
    expect(journalLevel(pub({ venue: 'Unknown Local Bulletin 3 (1), 2023' }), idx)).toEqual({ level: 'none' })
  })
  it('only journal articles get a level', () => {
    expect(journalLevel(pub({ type: 'proceeding', sources: ['scopus'] }), idx)).toBeNull()
  })
  it('Scopus beats TCI when a Thai journal is in both', () => {
    expect(journalLevel(pub({ venue: 'Thai Environmental Engineering Journal 36 (2), 1-10, 2022', sources: ['scopus'] }), idx)?.level).toBe('intl')
  })
  it('tags', () => {
    expect(journalTag({ level: 'intl' })).toBe('Scopus')
    expect(journalTag({ level: 'natl', tier: '2', by: 'issn' })).toBe('TCI 2')
    expect(journalTag({ level: 'none' })).toBe('ไม่พบในฐานข้อมูล')
  })
})
