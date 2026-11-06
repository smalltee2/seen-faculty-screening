// Step 1: classify Google Scholar rows into journal / proceeding / poster /
// exclude, tag research vs. review/academic articles, merge duplicates and
// apply overrides.csv. Anything decided on weak evidence is marked uncertain
// and goes to the review queue instead of being guessed.
import { buildConferenceIndex, matchConference } from './conferences'
import type { ConferenceEntry, Override, Pub, PubType, RawPub } from './types'

/** Lowercase, Unicode-normalise, and strip punctuation and whitespace. */
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')
}

/** Scholar inserts spaces between Thai syllables ("บัณฑิต วิทยาลัย"); join them so Thai keywords match. */
function joinThai(s: string): string {
  return s.normalize('NFKC').replace(/(?<=[\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '')
}

/** Scholar appends ", <year>" (or ", 0" when unknown) to the venue; drop it before pattern matching. */
function stripYear(venue: string): string {
  return joinThai(venue).replace(/,?\s*\b((19|20)\d{2}|0)\s*$/, '').trim()
}

const PREPRINT = /arxiv|research\s*square|ssrn|eartharxiv|preprints?\.org|\bpreprints?\b|biorxiv|medrxiv|chemrxiv|essoar|authorea|egusphere|awaiting peer review|\bdiscussions\b/i
// Also "Author Correction: …" (Springer Nature), "Publisher Correction: …" and "Correction to “X”" (no colon).
const ERRATUM = /^(author |publisher )?(correction|erratum|corrigendum)( to\b|( notice)?\s*[:.\-–—]|\s*$)|^(retraction( notice)?|retracted|expression of concern)\b/i
const PATENT = /patent|สิทธิบัตร|อนุสิทธิบัตร/i
const DATASET = /zenodo|figshare|pangaea|dryad|mendeley data|\bdata\s?set\b/i
const THESIS = /thesis|dissertation|วิทยานิพนธ์|ปริญญานิพนธ์|การค้นคว้าอิสระ|\bph\.?\s?d\b|master'?s|graduate school|บัณฑิตวิทยาลัย/i
const POSTER = /poster|abstracts?\b|agu fall meeting|egu general assembly|ams annual meeting|goldschmidt|บทคัดย่อ|โปสเตอร์/i
const PROCEEDING = /proceedings?|\bproc\.|conference|symposium|congress|workshop|e3s web of|matec web of|\bspie\b|การประชุมวิชาการ|ประชุมวิชาการ|รายงานสืบเนื่อง/i
const LECTURE_NOTES = /lecture notes in/i
const BOOK = /\bbook\b|chapter|handbook|encyclopedia|\bisbn\b|^in:|หนังสือ|ต(?:ำ|ํา)รา|intechopen/i
const PUBLISHER_ONLY = /^(springer( nature)?( international publishing)?|elsevier|wiley|crc press|routledge|taylor\s*&\s*francis|cambridge university press|oxford university press|academic press|iwa publishing|cuvillier verlag|lap lambert( academic publishing)?)$/i
const REPORT = /\breport\b|technical note|white paper|working paper|policy brief|報告|รายงาน(?!การประชุม|สืบเนื่อง)/i
// Final reports to funding agencies (TSRI / สกสว.), not publications under the rank criteria.
const FUNDER_REPORT = /^(thailand science research and innovation|ส(?:ำ|ํา)นักงานคณะกรรมการส่งเสริมวิทยาศาสตร์วิจัยและนวัตกรรม|สกสว\.?|สกว\.?|thailand research fund)$/i
// IEEE-style conference names start with the year, e.g. "2024 Geoinformatics for Spatial-Infrastructure …".
const YEAR_PREFIX_CONF = /^(19|20)\d{2}\s+\p{L}/u
const UNIVERSITY_ONLY = /^[^\d]*(universit|institute of technology|มหาวิทยาลัย|สถาบัน)[^\d]*$/i
// Volume (issue), page range, or article number, e.g. "12 (3), 45-60", "8, 101234".
const VOL_ISSUE = /\d+\s*\([^)]+\)/
// Scholar truncates long venues: "… Management 7 (3-4 …" still shows a volume and issue.
const VOL_TRUNCATED = /\d+\s*\([^)]*(…|\.\.\.)/ // NFKC turns … into ...
const PAGES = /\d+\s*,\s*[a-z]?\d+\s*[-–]\s*[a-z]?\d+/i
const ARTICLE_NO = /\b\d+\s*,\s*[a-z]?\d{3,}\b/i
// Article number without volume (online first), e.g. "Geophysical Research Letters, e2022GL100223".
const ARTICLE_NO_ONLY = /,\s*(e\d{4}[a-z]{2}\d+|\d{5,})$/i
// "<book title>, 233-254" — a page range with no volume is usually a book chapter.
const PAGES_ONLY = /^[^\d]+,\s*\d+\s*[-–]\s*\d+$/
const JOURNAL_NAME = /journal|วารสาร|letters|transactions|annals|bulletin|reviews?\b|magazine|science of the total environment|atmospheric (environment|research|chemistry and physics)|scientific (reports|data)|plos one|heliyon|chemosphere|sustainability|remote sensing|^atmosphere$|^water$|^toxics$|^climate$|^agriculture$|^forests$|^land$|^hydrology$/i

export interface TypeResult {
  type: PubType
  reason: string
  uncertain: boolean
}

export function hasVolumeOrPages(venue: string): boolean {
  const v = stripYear(venue)
  return VOL_ISSUE.test(v) || VOL_TRUNCATED.test(v) || PAGES.test(v) || ARTICLE_NO.test(v) || ARTICLE_NO_ONLY.test(v)
}

export function classifyType(title: string, venue: string): TypeResult {
  const v = stripYear(venue)
  const both = joinThai(`${title} ${venue}`)
  if (!v) return { type: 'exclude', reason: 'ไม่มีชื่อแหล่งตีพิมพ์ (no venue)', uncertain: false }
  if (ERRATUM.test(joinThai(title).trim())) return { type: 'exclude', reason: 'คำแก้ไข/ถอนบทความ (erratum)', uncertain: false }
  if (PREPRINT.test(both)) return { type: 'exclude', reason: 'ฉบับก่อนตีพิมพ์ (preprint)', uncertain: false }
  if (PATENT.test(v)) return { type: 'exclude', reason: 'สิทธิบัตร (patent)', uncertain: false }
  if (DATASET.test(v)) return { type: 'exclude', reason: 'ชุดข้อมูล (dataset)', uncertain: false }
  if (THESIS.test(v)) return { type: 'exclude', reason: 'วิทยานิพนธ์ (thesis/dissertation)', uncertain: false }
  if (POSTER.test(both)) return { type: 'poster', reason: 'โปสเตอร์/บทคัดย่อ (poster/abstract)', uncertain: false }
  if (PROCEEDING.test(v)) return { type: 'proceeding', reason: 'รายงานการประชุมวิชาการ (proceedings)', uncertain: false }
  if (LECTURE_NOTES.test(v))
    return { type: 'proceeding', reason: 'Lecture Notes series — อาจเป็น proceedings หรือหนังสือ', uncertain: true }
  if (BOOK.test(v) || PUBLISHER_ONLY.test(v)) return { type: 'exclude', reason: 'หนังสือ/บทในหนังสือ (book/chapter)', uncertain: false }
  if (REPORT.test(v)) return { type: 'exclude', reason: 'รายงาน (report)', uncertain: false }
  if (FUNDER_REPORT.test(v)) return { type: 'exclude', reason: 'รายงานวิจัยถึงแหล่งทุน (funder report)', uncertain: false }
  if (PAGES_ONLY.test(v)) return { type: 'exclude', reason: 'มีแต่เลขหน้า ไม่มีเล่ม — น่าจะเป็นบทในหนังสือ', uncertain: true }
  if (hasVolumeOrPages(v)) return { type: 'journal', reason: 'มีเล่ม/ฉบับ/หน้า (volume/issue/pages)', uncertain: false }
  if (YEAR_PREFIX_CONF.test(v))
    return { type: 'proceeding', reason: 'ชื่อขึ้นต้นด้วยปี — มักเป็นการประชุมวิชาการ (เช่น IEEE)', uncertain: true }
  if (JOURNAL_NAME.test(v))
    return { type: 'journal', reason: 'ชื่อคล้ายวารสาร แต่ไม่มีเล่ม/หน้า (journal name, no volume/pages)', uncertain: true }
  if (UNIVERSITY_ONLY.test(v)) return { type: 'exclude', reason: 'มีแต่ชื่อมหาวิทยาลัย — อาจเป็นวิทยานิพนธ์', uncertain: true }
  return { type: 'unknown', reason: 'จำแนกไม่ได้ (unrecognised venue)', uncertain: true }
}

const NOT_RESEARCH = /\breview\b|editorial|บทความวิชาการ|บทความปริทัศน์|ปริทัศน์/i
// These words also appear in research titles ("A machine learning perspective on ...").
const MAYBE_NOT_RESEARCH = /overview|perspective|commentary|viewpoint|opinion/i
const SYSTEMATIC = /systematic review|meta-?analys|scoping review|bibliometric/i
const REVIEW_VENUE = /reviews\b/i

export interface ResearchResult {
  isResearch: boolean
  reason: string
  uncertain: boolean
}

/** Clause 9.4 counts only research outputs (ผลงานวิจัย); review/academic articles are not. */
export function classifyResearch(title: string, venue: string): ResearchResult {
  title = joinThai(title)
  // Systematic reviews, meta-analyses and perspectives count as research (decision by Tum, 2026-11-05).
  if (SYSTEMATIC.test(title))
    return { isResearch: true, reason: 'systematic review / meta-analysis — นับเป็นงานวิจัย', uncertain: false }
  if (NOT_RESEARCH.test(title)) return { isResearch: false, reason: 'บทความปริทัศน์/วิชาการ (review/academic article)', uncertain: false }
  if (MAYBE_NOT_RESEARCH.test(title))
    return { isResearch: true, reason: 'perspective/overview — นับเป็นงานวิจัย', uncertain: false }
  if (REVIEW_VENUE.test(stripYear(venue)))
    return { isResearch: true, reason: 'ตีพิมพ์ในวารสารประเภท Reviews — นับเป็นงานวิจัย', uncertain: false }
  return { isResearch: true, reason: 'งานวิจัย (default)', uncertain: false }
}

// OpenAlex work types that are never counted.
const OA_EXCLUDE: Record<string, string> = {
  dataset: 'ชุดข้อมูล (dataset)',
  preprint: 'ฉบับก่อนตีพิมพ์ (preprint)',
  dissertation: 'วิทยานิพนธ์ (dissertation)',
  book: 'หนังสือ (book)',
  'book-chapter': 'บทในหนังสือ (book chapter)',
  paratext: 'ส่วนประกอบของวารสาร (paratext)',
  'peer-review': 'รายงานผู้ทบทวน (peer review)',
  erratum: 'คำแก้ไข (erratum)',
  retraction: 'ถูกถอนบทความ (retraction)',
  'supplementary-materials': 'ข้อมูลเสริม (supplementary)',
  standard: 'มาตรฐาน (standard)',
  grant: 'ทุนวิจัย (grant)',
  report: 'รายงาน (report)',
}
const SCOPUS_JOURNAL = ['article', 'review', 'letter', 'note', 'short survey', 'data paper', 'editorial']
const SCOPUS_EXCLUDE = ['book chapter', 'book', 'erratum', 'conference review', 'retracted']

/** Type from the row's source: structured types from OpenAlex, Scopus or the admin form first, then the venue string. */
export function classifyRow(p: RawPub): TypeResult {
  const ext = (p.extType ?? '').toLowerCase()
  const st = (p.sourceType ?? '').toLowerCase()
  const isPoster = POSTER.test(joinThai(`${p.title} ${p.venue}`))
  if (p.source === 'manual' && (ext === 'journal' || ext === 'proceeding' || ext === 'poster'))
    return { type: ext, reason: 'เพิ่มโดยผู้ดูแล (Google Form)', uncertain: false }
  if (p.source === 'openalex') {
    if (OA_EXCLUDE[ext]) return { type: 'exclude', reason: `OpenAlex: ${OA_EXCLUDE[ext]}`, uncertain: false }
    if (st === 'repository') return { type: 'exclude', reason: 'OpenAlex: คลังเอกสาร/preprint (repository)', uncertain: false }
    if (st === 'conference')
      return isPoster
        ? { type: 'poster', reason: 'OpenAlex: งานประชุม — บทคัดย่อ/โปสเตอร์', uncertain: false }
        : { type: 'proceeding', reason: 'OpenAlex: งานประชุมวิชาการ (conference)', uncertain: false }
    if ((st === 'journal' || st === 'book series') && ['article', 'review', 'letter', 'editorial'].includes(ext))
      return { type: 'journal', reason: `OpenAlex: วารสาร (${ext})`, uncertain: false }
  }
  if (p.source === 'scopus') {
    if (SCOPUS_EXCLUDE.includes(ext)) return { type: 'exclude', reason: `Scopus: ${p.extType}`, uncertain: false }
    if (ext === 'conference paper')
      return isPoster
        ? { type: 'poster', reason: 'Scopus: งานประชุม — บทคัดย่อ/โปสเตอร์', uncertain: false }
        : { type: 'proceeding', reason: 'Scopus: conference paper', uncertain: false }
    if (SCOPUS_JOURNAL.includes(ext) && st === 'journal') return { type: 'journal', reason: `Scopus: วารสาร (${p.extType})`, uncertain: false }
  }
  return classifyType(p.title, p.venue)
}

const SOURCE_RANK: Record<string, number> = { manual: 4, scopus: 3, openalex: 2, scholar: 1 }

/** Higher = better row to keep: a structured source, then a counted type, then volume/pages, the longer venue, more citations. */
function richness(p: RawPub): number {
  const t = classifyRow(p)
  const typeScore = t.type === 'journal' || t.type === 'proceeding' ? 2 : t.type === 'poster' ? 1 : 0
  // A structured source (admin form, Scopus, OpenAlex) decides the type over Scholar's venue string.
  return (SOURCE_RANK[p.source ?? 'scholar'] ?? 1) * 1e7 + typeScore * 1e6 + (hasVolumeOrPages(p.venue) ? 1e5 : 0) + Math.min(p.venue.length, 900) * 100 + Math.min(p.cites, 99)
}

const TRUNCATED = /(…|\.\.\.)\s*$/
/** Google Scholar cuts long titles at about 150 characters and ends them with "…".
 *  Returns the normalised stem of such a title, or null when it is not truncated or too short to be safe. */
export function truncatedStem(title: string): string | null {
  if (!TRUNCATED.test(title.trim())) return null
  const stem = normalizeTitle(title.replace(TRUNCATED, ''))
  return stem.length >= 30 ? stem : null
}

/** Merge rows of the same person with the same normalised title or DOI; keep the best row.
 *  A Scholar title truncated with "…" also merges with a same-person title that starts with its stem. */
export function dedupe(rows: RawPub[]): { row: RawPub; duplicates: number; members: RawPub[] }[] {
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j)
  }
  const seen = new Map<string, number>()
  const norms = rows.map((r) => normalizeTitle(r.title))
  rows.forEach((r, i) => {
    const keys = [`t\u0000${r.key}\u0000${norms[i]}`]
    if (r.doi) keys.push(`d\u0000${r.key}\u0000${r.doi.toLowerCase()}`)
    for (const k of keys) {
      const j = seen.get(k)
      if (j === undefined) seen.set(k, i)
      else union(i, j)
    }
  })
  rows.forEach((r, i) => {
    const stem = truncatedStem(r.title)
    if (!stem) return
    rows.forEach((o, j) => {
      if (j !== i && o.key === r.key && norms[j].startsWith(stem)) union(i, j)
    })
  })
  const groups = new Map<number, RawPub[]>()
  rows.forEach((r, i) => {
    const g = groups.get(find(i))
    if (g) g.push(r)
    else groups.set(find(i), [r])
  })
  return [...groups.values()].map((g) => {
    const best = g.reduce((a, b) => (richness(b) > richness(a) ? b : a))
    // A duplicate without a year or DOI inherits one from its siblings.
    const year = best.year ?? g.find((r) => r.year !== null)?.year ?? null
    const doi = best.doi || g.find((r) => r.doi)?.doi || ''
    const issn = [...new Set(g.flatMap((r) => (r.issn ?? '').split(';')).filter(Boolean))].join(';')
    return { row: { ...best, year, doi, issn }, duplicates: g.length - 1, members: g }
  })
}

export function overrideKey(key: string, title: string): string {
  return `${key}\u0000${normalizeTitle(title)}`
}

/** A correction / erratum / retraction notice rather than an article. */
export function isErratumNotice(p: RawPub): boolean {
  const ext = (p.extType ?? '').toLowerCase()
  return ext === 'erratum' || ext === 'retraction' || ERRATUM.test(joinThai(p.title).trim())
}

/** Drop correction notices whose original article is in the same person's list, so the
 *  original is shown once (the notice never counts anyway). Unmatched notices stay. */
export function hideMatchedErrata(pubs: Pub[]): Pub[] {
  const originals = pubs.filter((p) => !isErratumNotice(p) && p.titleNorm.length >= 20)
  return pubs.filter((p) => {
    if (!isErratumNotice(p)) return true
    return !originals.some((o) => o.key === p.key && p.titleNorm.includes(o.titleNorm))
  })
}

export function preparePubs(rows: RawPub[], overrides: Override[], conferences: ConferenceEntry[] = []): Pub[] {
  return hideMatchedErrata(preparePubsAll(rows, overrides, conferences))
}

function preparePubsAll(rows: RawPub[], overrides: Override[], conferences: ConferenceEntry[]): Pub[] {
  const confIdx = buildConferenceIndex(conferences)
  const byKey = new Map(overrides.map((o) => [overrideKey(o.key, o.titleNormalized), o]))
  return dedupe(rows).map(({ row, duplicates, members }) => {
    const titleNorm = normalizeTitle(row.title)
    const t = classifyRow(row)
    const r =
      row.source === 'manual' && row.manualResearch !== undefined
        ? { isResearch: row.manualResearch, reason: 'ระบุโดยผู้ดูแล (Google Form)', uncertain: false }
        : (row.extType ?? '').toLowerCase() === 'editorial'
          ? { isResearch: false, reason: 'บทบรรณาธิการ (editorial)', uncertain: false }
          : classifyResearch(row.title, row.venue)
    // An override written for any version of the title applies to the merged work.
    const o = members.map((m) => byKey.get(overrideKey(row.key, m.title))).find(Boolean) ?? null
    const pub: Pub = {
      ...row,
      id: `${row.key}|${titleNorm}`,
      titleNorm,
      type: t.type,
      typeReason: t.reason,
      typeUncertain: t.uncertain,
      isResearch: r.isResearch,
      researchReason: r.reason,
      researchUncertain: r.uncertain,
      ownDegree: null,
      duplicates,
      sources: [...new Set(members.map((m) => m.source ?? 'scholar'))],
      override: o,
    }
    if (o?.type) Object.assign(pub, { type: o.type, typeReason: `แก้ไขด้วยมือ (override)${o.note ? `: ${o.note}` : ''}`, typeUncertain: false })
    if (o?.isResearch !== null && o?.isResearch !== undefined)
      Object.assign(pub, { isResearch: o.isResearch, researchReason: 'แก้ไขด้วยมือ (override)', researchUncertain: false })
    if (o?.ownDegree !== null && o?.ownDegree !== undefined) pub.ownDegree = o.ownDegree
    if (pub.type === 'proceeding') pub.conference = matchConference(pub, confIdx)
    return pub
  })
}
