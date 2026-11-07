import { describe, expect, it } from 'vitest'
import { SCOPUS_HEADER, authorList, biblioOf, crossrefIndex, formatDate, formatIssn, parseVenue, scopusRow } from './exportScopus'
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
  it('keeps commas inside a journal name', () => {
    expect(parseVenue('Water, Air, & Soil Pollution 234 (6), 396, 2023', 2023)).toMatchObject({ source: 'Water, Air, & Soil Pollution', volume: '234', issue: '6', artNo: '396' })
    expect(parseVenue('Journal of Human, Earth, and Future 6 (1), 166-179, 2025', 2025)).toMatchObject({ source: 'Journal of Human, Earth, and Future', volume: '6', issue: '1', pageStart: '166', pageEnd: '179', pageCount: '14' })
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
  it('writes the agreed defaults for missing pages and issue', () => {
    const row = scopusRow({ ...ev, pub: { ...pub, venue: 'Journal of Hydrology 681, 136603, 2026' } }, person)
    const o = Object.fromEntries(SCOPUS_HEADER.map((h, i) => [h, row[i]]))
    expect(o).toMatchObject({ Volume: '681', Issue: '1', 'Art. No.': '136603', 'Page start': '1', 'Page end': '14', 'Page count': '14' })
    const real = scopusRow({ ...ev, pub: { ...pub, venue: 'Hungarian Geographical Bulletin 75 (3), 293-306, 2026' } }, person)
    const r = Object.fromEntries(SCOPUS_HEADER.map((h, i) => [h, real[i]]))
    expect(r).toMatchObject({ Issue: '3', 'Page start': '293', 'Page end': '306', 'Page count': '14' })
  })
})

describe('biblioOf and formatDate', () => {
  it('formats dates like the template and names the month', () => {
    expect(formatDate('2021-04-20')).toEqual({ date: '20/4/2021', month: 'April' })
    expect(formatDate('2026-05')).toEqual({ date: '5/2026', month: 'May' })
    expect(formatDate('2026')).toEqual({ date: '', month: '' })
    expect(formatDate('')).toEqual({ date: '', month: '' })
  })
  const base = { venue: 'Sustainability 18 (21), 11212, 2026', year: 2026, doi: '10.1/A' } as Pub
  it('prefers Crossref issue, pages and date over the venue string', () => {
    const idx = crossrefIndex([{ doi: '10.1/a', journal: 'Sustainability', volume: '18', issue: '21', pageStart: '1', pageEnd: '20', articleNumber: '11212', published: '2026-10-15', publishedOnline: '2026-10-10' }])
    expect(biblioOf(base, idx)).toMatchObject({ source: 'Sustainability', volume: '18', issue: '21', artNo: '11212', pageStart: '1', pageEnd: '20', pageCount: '20', date: '2026-10-15' })
    expect(biblioOf({ ...base, venue: 'Sustainability Switzerland 18 (21), 11212, 2026' }, idx).source).toBe('Sustainability')
  })
  it('treats a Crossref page equal to the article number as an article number, not a page range', () => {
    const idx = crossrefIndex([{ doi: '10.1/a', journal: '', volume: '18', issue: '', pageStart: '11212', pageEnd: '11212', articleNumber: '', published: '', publishedOnline: '2026-10-10' }])
    expect(biblioOf(base, idx)).toMatchObject({ artNo: '11212', pageStart: '', pageEnd: '', pageCount: '', issue: '21', date: '2026-10-10' })
  })
  it('falls back to the Scopus row, then the venue string', () => {
    const sc = { ...base, biblio: { date: '2026-11-01', volume: '18', issue: '21', pages: '293-306', articleNumber: '' } } as Pub
    expect(biblioOf(sc, new Map())).toMatchObject({ pageStart: '293', pageEnd: '306', pageCount: '14', artNo: '', date: '2026-11-01' })
    expect(biblioOf(base, new Map())).toMatchObject({ artNo: '11212', date: '' })
  })
})
