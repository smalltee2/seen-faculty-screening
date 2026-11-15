import { describe, expect, it } from 'vitest'
import { dashIssn, namesToAsk, normName as normJs, serialIssns, venueName as venueJs } from '../scripts/journal-names.mjs'
import { normName, venueName } from './tci'

describe('Scopus check of journals known only by name (Scholar rows)', () => {
  it('reads a journal name exactly as the page does', () => {
    for (const v of ['Science of The Total Environment 1057, 182370, 2026', 'Journal of Hydrology 681, 136603, 2026', 'วารสาร วิชาการ 12 (1), 1-10', 'Earth Systems and Environment', 'Sustainability (Basel)', 'Water, Air, & Soil Pollution 237 (1), 2', '']) {
      expect(venueJs(v)).toBe(venueName(v))
      expect(normJs(venueJs(v))).toBe(normName(venueName(v)))
    }
  })
  it('asks each new Latin-letter name of the recent years once', () => {
    const rows = [
      { year: '2026', venue: 'Science of The Total Environment 1057, 182370, 2026' },
      { year: '2025', venue: 'Science of the total environment 900, 1, 2025' },
      { year: '2026', venue: 'Environmental Research 12, 3' },
      { year: '2019', venue: 'Old Journal 3, 1' },
      { year: '2026', venue: 'วารสาร วิชาการ 12 (1)' },
      { year: '2026', venue: 'IOP 1' },
      { year: '2026', venue: '' },
    ]
    const m = namesToAsk(rows, { sinceYear: 2021, known: new Set(['environmental research']) })
    expect([...m]).toEqual([['science of total environment', 'Science of The Total Environment']])
  })
  it('takes the ISSNs of the serial with that very title only', () => {
    const answer = { 'serial-metadata-response': { entry: [
      { 'dc:title': 'Environmental Research Letters', 'prism:issn': '1748-9318', 'prism:eIssn': '1748-9326' },
      { 'dc:title': 'Environmental Research', 'prism:issn': '00139351', 'prism:eIssn': '1096-0953' },
    ] } }
    expect(serialIssns(answer, 'Environmental research')).toEqual(['0013-9351', '1096-0953'])
    expect(serialIssns(answer, 'Environmental Research Communications')).toEqual([])
    expect(serialIssns({}, 'x')).toEqual([])
    // "&" in Scholar's name is "and" in Scopus' title.
    expect(serialIssns({ 'serial-metadata-response': { entry: [{ 'dc:title': 'Water, Air, and Soil Pollution', 'prism:issn': '0049-6979' }] } }, 'Water, Air, & Soil Pollution')).toEqual(['0049-6979'])
    // One entry comes as an object, not a list.
    expect(serialIssns({ 'serial-metadata-response': { entry: { 'dc:title': 'Science of the Total Environment', 'prism:issn': '0048-9697' } } }, 'Science of The Total Environment')).toEqual(['0048-9697'])
  })
  it('writes an ISSN with its dash', () => {
    expect(dashIssn('0048969X')).toBe('0048-969X')
    expect(dashIssn('1879-1026')).toBe('1879-1026')
    expect(dashIssn('123')).toBe('')
    expect(dashIssn(undefined)).toBe('')
  })
})
