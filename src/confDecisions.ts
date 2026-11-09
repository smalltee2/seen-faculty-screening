// Conference decisions made with the "นับ / ไม่นับ / ยกเลิกการตัดสิน" buttons in the register
// (2026-11-07; replaces the decision Google Form). The login backend keeps every press in its
// private conf_decisions sheet; the site reads the public list and applies the latest press per
// conference over data/conferences.csv, and the hourly job writes the same into that file.
import { api } from './emailLogin'
import type { ConferenceEntry } from './types'

export type ConfDecision = 'count' | 'no_count' | 'clear'
export interface ConfDecisionItem {
  at: string
  key: string
  decision: ConfDecision
  by: string
  note: string
  name: string
}

export async function fetchConfDecisions(): Promise<ConfDecisionItem[]> {
  try {
    const r = await api({ action: 'confList' })
    return r.ok && Array.isArray(r.items) ? (r.items as ConfDecisionItem[]) : []
  } catch {
    return []
  }
}

const blank = (key: string, name: string): ConferenceEntry => ({
  key,
  displayName: name || key,
  conferenceName: name,
  organiser: '',
  association: '',
  associationRole: 'unknown',
  field: '',
  relatedField: 'unknown',
  confidence: 'low',
  evidenceUrl: '',
  checkedAt: '',
  checkedBy: '',
  note: '',
  decision: '',
  decidedBy: '',
  decidedAt: '',
  decisionNote: '',
})

/** The register with the latest button decision per key applied ("clear" = back to the automatic result).
 *  A key not yet in the register gets a minimal entry so its decision still counts. */
export function applyConfDecisions(entries: ConferenceEntry[], items: ConfDecisionItem[]): ConferenceEntry[] {
  if (!items.length) return entries
  const latest = new Map<string, ConfDecisionItem>()
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) latest.set(it.key, it)
  const out = entries.map((e) => {
    const d = latest.get(e.key)
    if (!d) return e
    latest.delete(e.key)
    return d.decision === 'clear'
      ? { ...e, decision: '' as const, decidedBy: '', decidedAt: '', decisionNote: '' }
      : { ...e, decision: d.decision, decidedBy: d.by, decidedAt: d.at, decisionNote: d.note }
  })
  for (const d of latest.values()) {
    if (d.decision === 'clear') continue
    out.push({ ...blank(d.key, d.name), decision: d.decision, decidedBy: d.by, decidedAt: d.at, decisionNote: d.note })
  }
  return out
}
