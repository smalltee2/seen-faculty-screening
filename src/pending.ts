// The conference register shown on the admin page: one row per conference.
import type { ConferenceMatch } from './conferences'
import type { Pub } from './types'

export interface ConfGroup {
  match: ConferenceMatch
  pubs: Pub[]
  /** How many of `pubs` are self-submitted works still awaiting approval. */
  pending: number
}

const VERDICT_ORDER: Record<string, number> = { pending: 0, no_count: 1, count: 2 }

/** The conference register: proceedings and posters from `minYear` on, one row per conference,
 *  undecided first, then newest. `pendingPubs` are self-submitted works not approved yet. */
export function conferenceGroups(pubs: Pub[], pendingPubs: Pub[], minYear: number): ConfGroup[] {
  const groups = new Map<string, ConfGroup>()
  const add = (p: Pub, isPending: boolean) => {
    if ((p.type !== 'proceeding' && p.type !== 'poster') || !p.conference) return
    if ((p.year ?? 0) < minYear) return
    const g = groups.get(p.conference.key) ?? { match: p.conference, pubs: [], pending: 0 }
    g.pubs.push(p)
    if (isPending) g.pending++
    groups.set(p.conference.key, g)
  }
  for (const p of pubs) add(p, false)
  for (const p of pendingPubs) add(p, true)
  return [...groups.values()].sort(
    (a, b) => VERDICT_ORDER[a.match.verdict] - VERDICT_ORDER[b.match.verdict] || (b.pubs[0].year ?? 0) - (a.pubs[0].year ?? 0),
  )
}
