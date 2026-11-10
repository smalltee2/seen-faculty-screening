// Everything that waits for an admin decision, in one place (Tum, 2026-11-10): conferences
// without a นับ/ไม่นับ decision, self-submitted works awaiting approval, and works the
// classifier could not settle ("ต้องตรวจ").
import { windowYears, type PersonResult, type Settings } from './rules'
import { reviewItems, type ReviewItem } from './review'
import type { Submission } from './submissions'
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

export interface PendingQueue {
  conferences: ConfGroup[]
  submissions: Submission[]
  review: ReviewItem[]
  total: number
}

export function pendingQueue(input: {
  results: PersonResult[]
  pubs: Pub[]
  /** Self-submitted conference works not approved yet, classified (conferenceSubmissions). */
  pendingPubs: Pub[]
  submissions: Submission[]
  settings: Settings
  /** First year of the conference register (registerWindow). */
  minYear: number
}): PendingQueue {
  const conferences = conferenceGroups(input.pubs, input.pendingPubs, input.minYear).filter((g) => g.match.verdict === 'pending')
  const submissions = input.submissions.filter((s) => s.status === 'pending').sort((a, b) => a.created.localeCompare(b.created))
  // Only works that can change this year's result: inside the 5-year window, or with no year yet.
  const [from, to] = windowYears(input.settings.year)
  const review = reviewItems(input.results).filter((it) => it.pub.year === null || (it.pub.year >= from && it.pub.year <= to))
  return { conferences, submissions, review, total: conferences.length + submissions.length + review.length }
}
