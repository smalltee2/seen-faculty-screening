// Groups the rows new in a data source (one per lecturer, scripts/new-works.mjs) into works, so an
// article written by three SEEN lecturers is one new work listing three names (Tum, 2026-11-11).
import type { NewWork } from './types'

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

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** Works newest first; rows with the same DOI, or else the same title, are one work. */
export function groupNewWorks(rows: NewWork[] = []): NewWorkGroup[] {
  const groups = new Map<string, NewWorkGroup>()
  for (const r of rows) {
    const id = r.doi ? `doi:${r.doi.toLowerCase()}` : `t:${norm(r.title)}`
    const g = groups.get(id)
    if (!g) groups.set(id, { title: r.title, year: r.year, venue: r.venue, doi: r.doi, at: r.at, keys: [r.key] })
    else {
      if (!g.keys.includes(r.key)) g.keys.push(r.key)
      if (r.at > g.at) g.at = r.at
    }
  }
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title))
}

/** A work's id for "already opened" (the DOI, or else the title), the same key the grouping uses. */
export const newWorkId = (g: Pick<NewWorkGroup, 'doi' | 'title'>) => (g.doi ? `doi:${g.doi.toLowerCase()}` : `t:${norm(g.title)}`)

/** Works not opened yet. */
export const unseen = (groups: NewWorkGroup[], seen: ReadonlySet<string>) => groups.filter((g) => !seen.has(newWorkId(g)))
