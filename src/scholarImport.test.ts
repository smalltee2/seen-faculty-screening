import { describe, expect, it } from 'vitest'
import { dropRemovedScholar, newScholarRows, parseScholarTsv, scholarImportRows, snippetFor } from './scholarImport'
import type { RawPub } from './types'

const paste = [
  'key\tyear\ttitle\tauthors\tvenue\tcites',
  'A B\t2025\tA brand new paper on haze\tA B, C D\tAtmosphere 16 (2), 100, 2025\t3',
  'A B\t2024\tKnown Paper On PM2.5\tA B\tJ 1, 2024\t0',
  'A B\t2023\tLong title that Scholar cut off at the end of the …\tA B\tJ, 2023\t1',
  'A B\tbad\tYear is wrong\tA B\tJ\t0',
  '',
  'X Y\t2025\tSomeone else\tX Y\tJ\t0',
].join('\n')

describe('Scholar import (2026-11-08)', () => {
  it('parses the snippet rows, skips the header and reports bad lines', () => {
    const { rows, bad } = parseScholarTsv(paste)
    expect(rows.map((r) => r.title)).toEqual(['A brand new paper on haze', 'Known Paper On PM2.5', 'Long title that Scholar cut off at the end of the …', 'Someone else'])
    expect(bad).toBe(1)
    expect(rows[0]).toMatchObject({ key: 'A B', year: 2025, cites: 3 })
  })

  it('keeps only rows not yet in the system, including cut titles', () => {
    const known = [
      { key: 'A B', title: 'Known paper on PM2.5' },
      { key: 'A B', title: 'Long title that Scholar cut off at the end of the sentence in the list' },
      { key: 'X Y', title: 'A brand new paper on haze' },
    ]
    const rows = parseScholarTsv(paste).rows.filter((r) => r.key === 'A B')
    expect(newScholarRows(rows, 'A B', known).map((r) => r.title)).toEqual(['A brand new paper on haze'])
  })

  it('fills the lecturer into the snippet', () => {
    expect(snippetFor('A "B"')).toContain('const PRESET_KEY = "A \\"B\\""')
  })

  it('shows live imports once and drops undone batches from the build', () => {
    const items = [{ at: '2026-11-08T00:00:00Z', nameEn: 'A B', year: 2025, title: 'T', authors: '', venue: 'V', cites: 0, by: 'x', batch: 'b123456789' }]
    const bundled: RawPub[] = [
      { line: 1, source: 'scholar', key: 'A B', year: 2025, title: 'T', authors: '', venue: 'V', cites: 0, submitted: 'scholar:b123456789' },
      { line: 2, source: 'scholar', key: 'A B', year: 2020, title: 'Old', authors: '', venue: 'V', cites: 0, submitted: 'scholar:b000000000' },
      { line: 3, source: 'scholar', key: 'A B', year: 2019, title: 'First import', authors: '', venue: 'V', cites: 0 },
    ]
    expect(scholarImportRows(items, new Set(['A B']), bundled)).toEqual([])
    expect(dropRemovedScholar(bundled, items).map((p) => p.title)).toEqual(['T', 'First import'])
    expect(dropRemovedScholar(bundled, null)).toHaveLength(3)
  })
})
