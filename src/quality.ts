// Output quality for the "แยกตามคุณภาพผลงาน" chart view (Tum, 2026-11-08): international journals
// by CiteScore quartile (Scopus), national journals by TCI tier; other journals, proceedings and
// posters are not split.
import { journalLevel, normIssn, type TciIndex } from './tci'
import type { Pub } from './types'

/** normalised ISSN → complete CiteScore years, oldest first, with the quartile (1–4). */
export type QuartileIndex = Map<string, { year: number; q: number }[]>

export function buildQuartileIndex(rows: [string, number, number][]): QuartileIndex {
  const idx: QuartileIndex = new Map()
  for (const [issn, year, q] of rows) {
    const k = normIssn(issn)
    if (!idx.has(k)) idx.set(k, [])
    idx.get(k)!.push({ year, q })
  }
  for (const v of idx.values()) v.sort((a, b) => a.year - b.year)
  return idx
}

/** Quartile of the journal in the work's publication year. Years without a complete CiteScore
 *  take the nearest earlier complete year (a 2026 paper uses CiteScore 2025). Works older than
 *  the journal's first CiteScore year get none (Tum, 2026-11-08: follow Scopus coverage, do not
 *  borrow a later year). null = no CiteScore for that year or any ISSN. */
export function quartileOf(pub: Pick<Pub, 'issn' | 'year'>, idx: QuartileIndex): number | null {
  const years = (pub.issn ?? '')
    .split(';')
    .map((i) => idx.get(normIssn(i)))
    .find((v) => v && v.length)
  if (!years) return null
  if (pub.year === null) return years[years.length - 1].q
  const before = years.filter((y) => y.year <= pub.year!)
  return before.length ? before[before.length - 1].q : null
}

export type QualityKey = 'q1' | 'q2' | 'q3' | 'q4' | 'qNone' | 'tier1' | 'tier2' | 'journalNone' | 'proceeding' | 'poster'

export function qualityOf(pub: Pub, tci: TciIndex, quartiles: QuartileIndex): QualityKey | null {
  if (pub.type === 'proceeding') return 'proceeding'
  if (pub.type === 'poster') return 'poster'
  if (pub.type !== 'journal') return null
  const lv = journalLevel(pub, tci)
  if (lv?.level === 'intl') {
    const q = quartileOf(pub, quartiles)
    return q ? (`q${q}` as QualityKey) : 'qNone'
  }
  if (lv?.level === 'natl') return lv.tier === '1' ? 'tier1' : 'tier2'
  return 'journalNone'
}
