// Journal level for display: international / national / outside both databases.
//
// Rule (decided by Tum, 2026-11-06): a journal article is international when it is found
// in Scopus, or when its journal is indexed in Scopus (ISSN or name in data/scopus_journals.csv,
// so a new article counts before Scopus has indexed it); otherwise it is national when its journal is in the
// TCI database กลุ่ม 1 or 2, matched by ISSN first (OpenAlex / Scopus rows carry ISSNs)
// and by journal name as a fallback (Scholar rows carry only a venue string such as
// "Thai Environmental Engineering Journal 36 (2), 1-10, 2022"). Anything else is shown
// as outside the databases. Display only: clause 9/10 counts every journal alike.
import type { Pub, TciJournal } from './types'

export type JournalLevel = { level: 'intl' } | { level: 'natl'; tier: '1' | '2'; by: 'issn' | 'name' } | { level: 'none'; tier?: '3'; by?: 'issn' | 'name' }

export interface TciIndex {
  byIssn: Map<string, TciJournal>
  byName: Map<string, TciJournal>
  /** Scopus-indexed journals: normalised ISSNs and names. */
  scopusIssn: Set<string>
  scopusName: Set<string>
}

export const normIssn = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase()

/** Journal name for matching: lower case, no punctuation, single spaces, no "the";
 *  Thai text loses the spaces Scholar inserts between syllables ("วารสาร วิชาการ"). */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(?<=[\u0e00-\u0e7f])\s+(?=[\u0e00-\u0e7f])/g, '')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Journal Name 36 (2), 1-10, 2022" → "Journal Name": cut at the first volume number or
 *  comma, then drop a trailing abbreviation such as "(GTSJ.)". */
export function venueName(venue: string): string {
  const cut = venue.search(/\s\d|,/)
  let v = cut >= 0 ? venue.slice(0, cut) : venue
  v = v.replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s:;.-]+$/, '')
  return v.trim()
}

export function buildTciIndex(list: TciJournal[], scopusJournals: { issn: string; name: string }[] = []): TciIndex {
  const byIssn = new Map<string, TciJournal>()
  const byName = new Map<string, TciJournal>()
  const scopusIssn = new Set(scopusJournals.map((j) => normIssn(j.issn)))
  const scopusName = new Set(scopusJournals.map((j) => normName(j.name)).filter((n) => n.length >= 4))
  for (const j of list) {
    for (const i of [j.issn, j.eissn]) if (i) byIssn.set(normIssn(i), j)
    for (const n of [j.nameEng, j.nameLocal, j.abbrev]) {
      const k = normName(n)
      if (k.length >= 4 && !byName.has(k)) byName.set(k, j)
    }
  }
  return { byIssn, byName, scopusIssn, scopusName }
}

export function inScopusJournal(pub: Pick<Pub, 'venue' | 'issn'>, idx: TciIndex): boolean {
  if ((pub.issn ?? '').split(';').some((i) => i && idx.scopusIssn.has(normIssn(i)))) return true
  const k = normName(venueName(pub.venue))
  return k.length >= 4 && idx.scopusName.has(k)
}

export function matchTci(pub: Pick<Pub, 'venue' | 'issn'>, idx: TciIndex): { j: TciJournal; by: 'issn' | 'name' } | null {
  for (const i of (pub.issn ?? '').split(';')) {
    const j = i && idx.byIssn.get(normIssn(i))
    if (j) return { j, by: 'issn' }
  }
  const k = normName(venueName(pub.venue))
  const j = k ? idx.byName.get(k) : undefined
  return j ? { j, by: 'name' } : null
}

/** Level of a journal article; null for other output types. */
export function journalLevel(pub: Pub, idx: TciIndex): JournalLevel | null {
  if (pub.type !== 'journal') return null
  if (pub.sources.includes('scopus') || inScopusJournal(pub, idx)) return { level: 'intl' }
  const m = matchTci(pub, idx)
  if (!m) return { level: 'none' }
  if (m.j.tier === '1' || m.j.tier === '2') return { level: 'natl', tier: m.j.tier, by: m.by }
  return { level: 'none', tier: '3', by: m.by }
}

/** Short tag for tables: "Scopus", "TCI 1", "TCI 2", "TCI 3", "—". */
export function journalTag(l: JournalLevel | null): string {
  if (!l) return ''
  if (l.level === 'intl') return 'Scopus'
  if (l.level === 'natl') return `TCI ${l.tier}`
  return l.tier ? `TCI ${l.tier}` : 'ไม่พบในฐานข้อมูล'
}
