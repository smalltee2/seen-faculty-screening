// Groups the rows new in a data source (one per lecturer, scripts/new-works.mjs) into works, so an
// article written by three SEEN lecturers is one new work listing three names (Tum, 2026-11-11).
import { normDoi, normalizeTitle } from './classify'
import type { NewWork } from './types'
import { whenMs } from './when'

export interface NewWorkGroup {
  title: string
  year: string
  venue: string
  doi: string
  /** Latest time one of its rows came in. */
  at: string
  /** Lecturers (name_en), in the order their rows came. */
  keys: string[]
}

const doiId = (doi: string) => {
  const d = normDoi(doi)
  return d ? `doi:${d}` : ''
}
// The site's dedupe key (classify.ts): it keeps combining marks, so two Thai titles that differ
// only in vowels or tone marks stay two works.
const titleId = (title: string) => {
  const t = normalizeTitle(title)
  return t ? `t:${t}` : ''
}
/** The title id as stored before 2026-11-11 (marks stripped), still honoured for "already opened". */
const oldTitleId = (title: string) => `t:${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`

/** Works newest first; rows with the same DOI or the same title are one work (a co-author's row
 *  without a DOI joins the row that has one). */
export function groupNewWorks(rows: NewWork[] = []): NewWorkGroup[] {
  const byId = new Map<string, NewWorkGroup>()
  let groups: NewWorkGroup[] = []
  for (const r of rows) {
    const ids = [doiId(r.doi), titleId(r.title)].filter(Boolean)
    const found = [...new Set(ids.map((id) => byId.get(id)).filter((g): g is NewWorkGroup => !!g))]
    let g = found[0]
    if (!g) {
      g = { title: r.title, year: r.year, venue: r.venue, doi: r.doi, at: r.at, keys: [] }
      groups.push(g)
    }
    // A row that links two groups made earlier (one by DOI, one by title) joins them.
    for (const other of found.slice(1)) {
      for (const k of other.keys) if (!g.keys.includes(k)) g.keys.push(k)
      if (whenMs(other.at) > whenMs(g.at)) g.at = other.at
      if (!g.doi) g.doi = other.doi
      for (const [id, v] of byId) if (v === other) byId.set(id, g)
      groups = groups.filter((x) => x !== other)
    }
    if (!g.keys.includes(r.key)) g.keys.push(r.key)
    if (whenMs(r.at) > whenMs(g.at)) g.at = r.at
    if (!g.doi) g.doi = r.doi
    if (!g.year) g.year = r.year
    if (!g.venue) g.venue = r.venue
    for (const id of ids) byId.set(id, g)
  }
  return groups.sort((a, b) => whenMs(b.at) - whenMs(a.at) || a.title.localeCompare(b.title))
}

/** A work's id for "already opened": the DOI, or else the title. */
export const newWorkId = (g: Pick<NewWorkGroup, 'doi' | 'title'>) => doiId(g.doi) || titleId(g.title) || 't:'

/** Works not opened yet. A work counts as opened under its DOI or its title, so it does not come
 *  back as new when a later refresh adds the DOI. */
export const unseen = (groups: NewWorkGroup[], seen: ReadonlySet<string>) =>
  groups.filter((g) => ![doiId(g.doi), titleId(g.title), oldTitleId(g.title)].some((id) => id && seen.has(id)))
