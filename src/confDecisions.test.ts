import { describe, expect, it } from 'vitest'
import { applyConfDecisions, type ConfDecisionItem } from './confDecisions'
import type { ConferenceEntry } from './types'

const entry = (key: string, over: Partial<ConferenceEntry> = {}): ConferenceEntry => ({
  key, displayName: key, conferenceName: key, organiser: '', association: '', associationRole: 'unknown', field: '', relatedField: 'unknown',
  confidence: 'low', evidenceUrl: '', checkedAt: '', checkedBy: 'claude', note: '', decision: '', decidedBy: '', decidedAt: '', decisionNote: '', ...over,
})
const item = (key: string, decision: ConfDecisionItem['decision'], at: string): ConfDecisionItem => ({ key, decision, at, by: 'ผู้ดูแลระดับ 2', note: '', name: 'Conf' })

describe('applyConfDecisions', () => {
  it('applies the latest press per conference', () => {
    const out = applyConfDecisions([entry('venue:a')], [item('venue:a', 'no_count', '2026-11-07T01:00:00Z'), item('venue:a', 'count', '2026-11-07T02:00:00Z')])
    expect(out[0]).toMatchObject({ decision: 'count', decidedBy: 'ผู้ดูแลระดับ 2' })
  })
  it('"clear" goes back to the automatic result', () => {
    const out = applyConfDecisions([entry('venue:a', { decision: 'count', decidedBy: 'x' })], [item('venue:a', 'clear', '2026-11-07T03:00:00Z')])
    expect(out[0]).toMatchObject({ decision: '', decidedBy: '' })
  })
  it('creates an entry for a conference not yet in the register', () => {
    const out = applyConfDecisions([], [item('venue:engineering', 'count', '2026-11-07T01:00:00Z')])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ key: 'venue:engineering', decision: 'count', confidence: 'low' })
  })
  it('leaves the register alone without decisions', () => {
    const list = [entry('venue:a')]
    expect(applyConfDecisions(list, [])).toBe(list)
  })
})
