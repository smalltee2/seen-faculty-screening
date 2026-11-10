// The task inbox of sfs_webapp.html (Tum, 2026-11-11, design A): conferences awaiting นับ/ไม่นับ and
// works lecturers added themselves awaiting approval, as one list.
import { conferenceGroups, undecidedGroups, type ConfGroup } from '../pending'
import { registerWindow } from '../pages/AdminPage'
import type { Submission } from '../submissions'
import type { Pub } from '../types'

export type InboxStatus = 'pending' | 'decided'

export type InboxItem =
  | { kind: 'conference'; id: string; title: string; status: InboxStatus; group: ConfGroup }
  | { kind: 'submission'; id: string; title: string; status: InboxStatus; sub: Submission }

export const confId = (key: string) => `conf:${key}`
export const subId = (id: string) => `sub:${id}`

/** Conference groups in the register window plus self-added works (withdrawn ones left out). */
export function inboxItems(pubs: Pub[], pendingPubs: Pub[], submissions: Submission[]): InboxItem[] {
  const groups = conferenceGroups(pubs, pendingPubs, registerWindow(pubs).minYear)
  const waiting = new Set(undecidedGroups(groups))
  const conf: InboxItem[] = groups.map((g) => ({
    kind: 'conference',
    id: confId(g.match.key),
    title: g.match.entry?.conferenceName || g.pubs[0]?.venue || g.match.key,
    status: waiting.has(g) ? 'pending' : 'decided',
    group: g,
  }))
  const subs: InboxItem[] = submissions
    .filter((s) => s.status !== 'withdrawn')
    .map((s) => ({ kind: 'submission', id: subId(s.id), title: s.title, status: s.status === 'pending' ? 'pending' : 'decided', sub: s }))
  // Waiting items first, then by kind (conferences first), then by title.
  const rank = (i: InboxItem) => (i.status === 'pending' ? 0 : 2) + (i.kind === 'conference' ? 0 : 1)
  return [...conf, ...subs].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'th'))
}
