import { describe, expect, it } from 'vitest'
import { SCOPUS_HEADER, authorList, formatIssn, parseVenue, scopusRow } from './exportScopus'
import type { PubEval } from './rules'
import type { Faculty, Pub } from './types'

describe('parseVenue', () => {
  it('reads journal, volume, issue and an article number', () => {
    expect(parseVenue('Sustainability 18 (21), 11212, 2026', 2026)).toMatchObject({ source: 'Sustainability', volume: '18', issue: '21', artNo: '11212', pageStart: '', pageCount: '' })
  })
  it('reads a page range and counts the pages', () => {
    expect(parseVenue('Hungarian Geographical Bulletin 75 (3), 293-306, 2026', 2026)).toMatchObject({ source: 'Hungarian Geographical Bulletin', volume: '75', issue: '3', artNo: '', pageStart: '293', pageEnd: '306', pageCount: '14' })
  })
  it('handles a volume without an issue, a year used as volume, and alphanumeric article ids', () => {
    expect(parseVenue('Journal of Hydrology 681, 136603, 2026', 2026)).toMatchObject({ source: 'Journal of Hydrology', volume: '681', issue: '', artNo: '136603' })
    expect(parseVenue('Advances in Meteorology 2024, 1653062, 2024', 2024)).toMatchObject({ source: 'Advances in Meteorology', volume: '2024', artNo: '1653062' })
    expect(parseVenue('Geophysical Research Letters 49 (19), e2022GL100223, 2022', 2022)).toMatchObject({ volume: '49', issue: '19', artNo: 'e2022GL100223' })
  })
  it('leaves a bare venue name alone', () => {
    expect(parseVenue('Proceedings of EnvSci 2023', 2023)).toMatchObject({ source: 'Proceedings of EnvSci 2023', volume: '', artNo: '' })
    expect(parseVenue('', 2023).source).toBe('')
  })
})

describe('formatIssn and authorList', () => {
  it('hyphenates the first ISSN', () => {
    expect(formatIssn('0177798X;14344483')).toBe('0177-798X')
    expect(formatIssn('')).toBe('')
    expect(formatIssn('abc')).toBe('abc')
  })
  it('separates authors with semicolons', () => {
    expect(authorList('M Ptak, T Amnuaylojaroen')).toBe('M Ptak; T Amnuaylojaroen')
  })
})

describe('scopusRow', () => {
  const person = { nameEn: 'Teerachai Amnuaylojaroen', scopusId: '55555' } as Faculty
  const pub = {
    key: 'Teerachai Amnuaylojaroen', year: 2026, title: 'A work', authors: 'Amnuaylojaroen T.', allAuthors: 'M Ptak, T Amnuaylojaroen',
    venue: 'Sustainability 18 (21), 11212, 2026', cites: 3, doi: '10.3390/su182111212', issn: '20711050', eid: '2-s2.0-1', scopusType: 'Article',
    type: 'journal', sources: ['scholar', 'scopus'],
  } as unknown as Pub
  const ev = { pub, eligible: 'yes', research: 'yes', reasons: [] } as PubEval
  it('fills the 24 template columns in order', () => {
    const row = scopusRow(ev, person)
    expect(row).toHaveLength(SCOPUS_HEADER.length)
    const o = Object.fromEntries(SCOPUS_HEADER.map((h, i) => [h, row[i]]))
    expect(o).toMatchObject({
      Authors: 'M Ptak; T Amnuaylojaroen', 'Author(s) ID': '55555', Title: 'A work', Year: 2026, 'Source title': 'Sustainability', Volume: '18', Issue: '21', 'Art. No.': '11212',
      'Cited by': 3, DOI: '10.3390/su182111212', Link: 'https://www.scopus.com/inward/record.uri?eid=2-s2.0-1&doi=10.3390/su182111212', 'Document Type': 'Article',
      'Publication Stage': 'Final', Source: 'Scopus', EID: '2-s2.0-1', ISSN: '2071-1050', 'Publication date': '', Month: '', 'Research ': 'yes',
    })
  })
  it('falls back to a DOI link and a mapped document type without Scopus', () => {
    const row = scopusRow({ ...ev, research: 'maybe', pub: { ...pub, eid: undefined, scopusType: undefined, type: 'proceeding', sources: ['scholar'] } }, person)
    const o = Object.fromEntries(SCOPUS_HEADER.map((h, i) => [h, row[i]]))
    expect(o).toMatchObject({ Link: 'https://doi.org/10.3390/su182111212', 'Document Type': 'Conference paper', Source: 'Google Scholar', EID: '', 'Research ': 'no' })
  })
})
