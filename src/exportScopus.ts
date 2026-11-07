// "ดาวน์โหลด CSV" on the person page writes the lecturer's counted works in the university's
// Scopus-style import layout (Tum, 2026-11-07; template ตัวอย่าง_ไฟล์นำเข้า_Scopus.csv): the 24
// Scopus export columns plus "Research ". Fields the sources do not give (publication day and
// month, open access, page count without pages) stay empty rather than guessed.
import type { PubEval } from './rules'
import type { Faculty, Pub } from './types'

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
  if (year !== null) v = v.replace(new RegExp(`,\\s*${year}$`), '')
  const parts = v.split(/,\s*/)
  const head = parts[0] ?? ''
  const loc = parts.slice(1).join(', ').trim()
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
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(loc)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { artNo: '', pageStart: m[1], pageEnd: m[2], pageCount: b >= a ? String(b - a + 1) : '' }
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
export const authorList = (authors: string) => authors.split(/\s*[;,]\s*/).filter(Boolean).join('; ')

const DOC_TYPE: Record<string, string> = { journal: 'Article', proceeding: 'Conference paper', poster: 'Conference paper' }
const SOURCE_NAME = { scopus: 'Scopus', openalex: 'OpenAlex', scholar: 'Google Scholar', manual: 'Manual' } as const

export function scopusRow(e: PubEval, person: Faculty): (string | number)[] {
  const p: Pub = e.pub
  const v = parseVenue(p.venue, p.year)
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
    '',
    '',
    e.research === 'yes' ? 'yes' : 'no',
  ]
}
