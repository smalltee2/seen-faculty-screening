// "ดาวน์โหลด CSV" on the person page writes the lecturer's counted works in the university's
// Scopus-style import layout (Tum, 2026-11-07; template ตัวอย่าง_ไฟล์นำเข้า_Scopus.csv): the 24
// Scopus export columns plus "Research ". Fields the sources do not give (publication day and
// month, open access, page count without pages) stay empty rather than guessed.
import type { PubEval } from './rules'
import type { CrossrefEntry, Faculty, Pub } from './types'

/** Exact header of the template, trailing space in "Research " included. */
export const SCOPUS_HEADER = [
  'Authors', 'Author full names', 'Author(s) ID', 'Title', 'Year', 'Source title', 'Volume', 'Issue', 'Art. No.',
  'Page start', 'Page end', 'Page count', 'Cited by', 'DOI', 'Link', 'Document Type', 'Publication Stage',
  'Open Access', 'Source', 'EID', 'ISSN', 'Publication date', 'Month', 'Research ',
]

export interface VenueParts {
  source: string
  volume: string
  issue: string
  artNo: string
  pageStart: string
  pageEnd: string
  pageCount: string
}

/** Split a Scholar-style venue string "Name Vol (Issue), pages-or-article, Year" into its parts. */
export function parseVenue(venue: string, year: number | null): VenueParts {
  const out: VenueParts = { source: '', volume: '', issue: '', artNo: '', pageStart: '', pageEnd: '', pageCount: '' }
  let v = venue.trim()
  if (!v) return out
  // The year Scholar puts last. It can differ by one from the work's year (online first against the
  // issue year), and a work with no year still has it; an unrelated number is kept as the location.
  const tail = /,\s*((?:19|20)\d{2}|0)$/.exec(v)
  if (tail && (year === null || tail[1] === '0' || Math.abs(Number(tail[1]) - year) <= 1)) v = v.slice(0, tail.index)
  // Journal names may hold commas ("Water, Air, & Soil Pollution 234 (6), 396"): the name ends at the
  // first comma that is followed by a number (volume, pages or article number), as tci.venueName does.
  const cut = v.search(/,\s*(?=[a-z]?\d)/i)
  const head = (cut >= 0 ? v.slice(0, cut) : v).trim()
  const loc = cut >= 0 ? v.slice(cut + 1).trim() : ''
  const parts = [head, ...(loc ? loc.split(/,\s*/) : [])]
  const m = /^(.*?)(?:\s+(\d+[A-Za-z]?))?(?:\s*\(([^)]*)\))?$/.exec(head)
  if (m) {
    out.source = (m[1] ?? '').trim()
    out.volume = m[2] ?? ''
    out.issue = (m[3] ?? '').trim()
    // "Proceedings of X 2023" alone: the year is part of the name, not a volume.
    if (parts.length === 1 && !out.issue && year !== null && out.volume === String(year)) {
      out.source = head
      out.volume = ''
    }
  } else out.source = head
  // Loose data: "Name, Vol (Issue)" with the volume after a comma.
  if (!out.volume && parts.length > 2) {
    const mv = /^(\d+[A-Za-z]?)(?:\s*\(([^)]*)\))?$/.exec(parts[1] ?? '')
    if (mv) {
      out.volume = mv[1]
      out.issue = mv[2] ?? ''
      return { ...out, ...pages(parts.slice(2).join(', ')) }
    }
  }
  return { ...out, ...pages(loc) }
}

function pages(loc: string): Pick<VenueParts, 'artNo' | 'pageStart' | 'pageEnd' | 'pageCount'> {
  const r = { artNo: '', pageStart: '', pageEnd: '', pageCount: '' }
  if (!loc) return r
  // "293-306", and lettered ranges such as "S12-S20" or "e101-e110" (counted when the letters agree).
  const m = /^([A-Za-z]?)(\d+)\s*[-–]\s*([A-Za-z]?)(\d+)$/.exec(loc)
  if (m) {
    const a = Number(m[2])
    const b = Number(m[4])
    const same = m[1].toLowerCase() === m[3].toLowerCase()
    return { artNo: '', pageStart: m[1] + m[2], pageEnd: m[3] + m[4], pageCount: same && b >= a ? String(b - a + 1) : '' }
  }
  const one = /^(\d+)$/.exec(loc)
  // A lone number is an article number (Sustainability 18 (21), 11212) in today's journals.
  return one ? { ...r, artNo: one[1] } : { ...r, artNo: loc }
}

/** "0177798X;14344483" → "0177-798X" (first ISSN, hyphenated like a Scopus export). */
export function formatIssn(issn: string | undefined): string {
  const first = (issn ?? '').split(';').map((x) => x.trim()).find(Boolean) ?? ''
  const raw = first.replace(/-/g, '').toUpperCase()
  return /^\d{7}[\dX]$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}` : first
}

/** Author list with "; " between names, as Scopus writes it. */
export const authorList = (authors: string) =>
  authors
    // With ";" between names, a comma is inside a name ("Ptak, M.; Amnuaylojaroen, T.").
    .split(authors.includes(';') ? /\s*;\s*/ : /\s*,\s*/)
    .filter(Boolean)
    .join('; ')

const DOC_TYPE: Record<string, string> = { journal: 'Article', proceeding: 'Conference paper', poster: 'Conference paper' }
const SOURCE_NAME = { scopus: 'Scopus', openalex: 'OpenAlex', scholar: 'Google Scholar', manual: 'Manual' } as const
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-05-14" → { date: "14/5/2026", month: "May" }; "2026-05" → { date: "5/2026", month: "May" }; "2026" → { date: "", month: "" }. */
export function formatDate(iso: string): { date: string; month: string } {
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(iso.trim())
  if (!m) return { date: '', month: '' }
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return { date: '', month: '' }
  return { date: m[3] ? `${Number(m[3])}/${mo}/${m[1]}` : `${mo}/${m[1]}`, month: MONTHS[mo - 1] }
}

export type CrossrefIndex = Map<string, CrossrefEntry>
export const crossrefIndex = (items: CrossrefEntry[] | undefined): CrossrefIndex => new Map((items ?? []).map((c) => [c.doi.toLowerCase(), c]))

/** Venue parts for a work: Crossref (by DOI) first, then the merged Scopus row, then the venue string. */
export function biblioOf(p: Pub, crossref: CrossrefIndex): VenueParts & { date: string } {
  const v = parseVenue(p.venue, p.year)
  const cr = p.doi ? crossref.get(p.doi.toLowerCase()) : undefined
  const sc = p.biblio
  const scPages = sc?.pages ? pages(sc.pages) : null
  const artNo = cr?.articleNumber || sc?.articleNumber || (cr?.pageStart || scPages?.pageStart ? '' : scPages?.artNo || v.artNo)
  const pageStart = cr?.pageStart || scPages?.pageStart || v.pageStart
  const pageEnd = cr?.pageEnd || scPages?.pageEnd || v.pageEnd
  const digits = (s: string) => Number(s.replace(/^[A-Za-z]/, ''))
  const n = digits(pageEnd) - digits(pageStart) + 1
  // Crossref sometimes files an article number as the page ("11212"): then it is not a page range.
  const samePage = pageStart && pageStart === pageEnd && !cr?.articleNumber && !sc?.articleNumber && !v.pageEnd
  return {
    source: cr?.journal || v.source || '',
    volume: cr?.volume || sc?.volume || v.volume,
    issue: cr?.issue || sc?.issue || v.issue,
    artNo: samePage ? pageStart : artNo,
    pageStart: samePage ? '' : pageStart,
    pageEnd: samePage ? '' : pageEnd,
    pageCount: !samePage && pageStart && pageEnd && Number.isFinite(n) && n > 0 ? String(n) : '',
    // A full date wins over a year-month (an issue date Crossref gives without a day): the print
    // date when complete, else the complete online date, else whatever is there.
    date: [cr?.published, cr?.publishedOnline].find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) || cr?.published || cr?.publishedOnline || sc?.date || '',
  }
}

/** Values the import system requires but no source gives (Tum's decision, 2026-11-07):
 *  a work without pages is written as pages 1–14, a journal without issues as issue 1. */
export const DEFAULTS = { issue: '1', pageStart: '1', pageEnd: '14' }

export function scopusRow(e: PubEval, person: Faculty, crossref: CrossrefIndex = new Map()): (string | number)[] {
  const p: Pub = e.pub
  const b = biblioOf(p, crossref)
  const v = {
    ...b,
    issue: b.issue || DEFAULTS.issue,
    pageStart: b.pageStart || DEFAULTS.pageStart,
    // A first page with no last page (Crossref gives only one): a one-page range, not an empty cell.
    pageEnd: b.pageStart ? b.pageEnd || b.pageStart : DEFAULTS.pageEnd,
    pageCount: b.pageStart ? b.pageCount || (b.pageEnd ? '' : '1') : String(Number(DEFAULTS.pageEnd) - Number(DEFAULTS.pageStart) + 1),
  }
  const when = formatDate(v.date)
  const authors = authorList(p.allAuthors || p.authors)
  const link = p.eid ? `https://www.scopus.com/inward/record.uri?eid=${p.eid}${p.doi ? `&doi=${p.doi}` : ''}` : p.doi ? `https://doi.org/${p.doi}` : ''
  const source = p.sources.includes('scopus') ? 'Scopus' : SOURCE_NAME[p.sources[0] ?? 'scholar']
  return [
    authors,
    authors,
    person.scopusId ?? '',
    p.title,
    p.year ?? '',
    v.source,
    v.volume,
    v.issue,
    v.artNo,
    v.pageStart,
    v.pageEnd,
    v.pageCount,
    p.cites ?? 0,
    p.doi ?? '',
    link,
    p.scopusType || DOC_TYPE[p.type] || '',
    'Final',
    '',
    source,
    p.eid ?? '',
    formatIssn(p.issn),
    when.date,
    when.month,
    e.research === 'yes' ? 'yes' : 'no',
  ]
}
