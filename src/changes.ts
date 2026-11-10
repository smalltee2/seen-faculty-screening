// What changed between two data refreshes (Tum, 2026-11-10): a back-office check for the admin.
// scripts/snapshot.ts keeps data/snapshot.json (each lecturer's status per duty and list of
// works at the last refresh) and appends the difference to data/changes.json.
import type { PersonResult, RoleSpec, Status } from './rules'

/** [title, year, counted in at least one duty] */
export type SnapWork = [title: string, year: number | null, counted: boolean]

export interface SnapPerson {
  name: string
  roles: Record<string, Status>
  /** By publication id (lecturer|normalised title). */
  works: Record<string, SnapWork>
}

export interface Snapshot {
  /** builtAt of the data bundle the snapshot was taken from. */
  at: string
  /** Evaluation year (CE). */
  year: number
  people: Record<string, SnapPerson>
}

export interface WorkChange {
  title: string
  year: number | null
  counted: boolean
}

export interface PersonChange {
  nameEn: string
  name: string
  /** In the data now, not at the last refresh. */
  added: WorkChange[]
  /** At the last refresh, not in the data now. */
  removed: WorkChange[]
  /** Same work, but counted before and not now, or the reverse. */
  recounted: (WorkChange & { was: boolean })[]
  status: { role: string; from: Status | null; to: Status | null }[]
  /** Lecturer added to or taken off data/faculty.csv. */
  roster?: 'joined' | 'left'
}

export interface ChangeEntry {
  at: string
  prevAt: string
  year: number
  /** The evaluation year moved on since the last snapshot, so the 5-year window moved too. */
  prevYear: number
  people: PersonChange[]
}

/** The latest entries kept in data/changes.json. */
export const MAX_ENTRIES = 120

export function takeSnapshot(results: PersonResult[], roles: RoleSpec[], at: string, year: number, nameOf: (r: PersonResult) => string): Snapshot {
  const people: Snapshot['people'] = {}
  for (const r of results) {
    const counted = new Set<string>()
    for (const role of roles) for (const e of r.roles[role.id].used) counted.add(e.pub.id)
    const works: SnapPerson['works'] = {}
    for (const p of [...r.pubs].sort((a, b) => a.id.localeCompare(b.id))) works[p.id] = [p.title, p.year, counted.has(p.id)]
    people[r.person.nameEn] = { name: nameOf(r), roles: Object.fromEntries(roles.map((role) => [role.id, r.roles[role.id].status])), works }
  }
  return { at, year, people }
}

const work = (w: SnapWork): WorkChange => ({ title: w[0], year: w[1], counted: w[2] })
const byYear = <T extends WorkChange>(list: T[]) => list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))

/** null when nothing a reader would see has changed. */
export function diffSnapshots(prev: Snapshot, next: Snapshot): ChangeEntry | null {
  const people: PersonChange[] = []
  for (const nameEn of [...new Set([...Object.keys(prev.people), ...Object.keys(next.people)])].sort()) {
    const a = prev.people[nameEn]
    const b = next.people[nameEn]
    const aw = a?.works ?? {}
    const bw = b?.works ?? {}
    const added = byYear(Object.keys(bw).filter((id) => !(id in aw)).map((id) => work(bw[id])))
    const removed = byYear(Object.keys(aw).filter((id) => !(id in bw)).map((id) => work(aw[id])))
    const recounted = byYear(
      Object.keys(bw)
        .filter((id) => id in aw && aw[id][2] !== bw[id][2])
        .map((id) => ({ ...work(bw[id]), was: aw[id][2] })),
    )
    const roleIds = [...new Set([...Object.keys(a?.roles ?? {}), ...Object.keys(b?.roles ?? {})])]
    const status = roleIds
      .map((role) => ({ role, from: a?.roles[role] ?? null, to: b?.roles[role] ?? null }))
      .filter((x) => x.from !== x.to)
    const roster = !a ? 'joined' : !b ? 'left' : undefined
    if (!added.length && !removed.length && !recounted.length && !status.length && !roster) continue
    people.push({ nameEn, name: (b ?? a).name, added, removed, recounted, status, ...(roster ? { roster } : {}) })
  }
  if (people.length === 0) return null
  return { at: next.at, prevAt: prev.at, year: next.year, prevYear: prev.year, people }
}

/** Newest first, capped. */
export function appendChange(log: ChangeEntry[], entry: ChangeEntry | null): ChangeEntry[] {
  return entry ? [entry, ...log].slice(0, MAX_ENTRIES) : log
}

export function changeTotals(e: ChangeEntry): { added: number; removed: number; recounted: number; status: number } {
  const sum = (f: (p: PersonChange) => number) => e.people.reduce((n, p) => n + f(p), 0)
  return { added: sum((p) => p.added.length), removed: sum((p) => p.removed.length), recounted: sum((p) => p.recounted.length), status: sum((p) => p.status.length) }
}
