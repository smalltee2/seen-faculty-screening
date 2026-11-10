// The register and the history agree on the real data (Tum, 2026-11-11): a conference an admin decided
// leaves the register and is undoable in the history; the undo ("clear") brings it back.
import { describe, expect, it } from 'vitest'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { applyConfDecisions, type ConfDecisionItem } from './confDecisions'
import { buildHistory } from './history'
import { conferenceGroups, undecidedGroups } from './pending'
import { registerWindow } from './pages/AdminPage'
import type { DataBundle } from './types'

const data = raw as unknown as DataBundle
const register = (items: ConfDecisionItem[]) => {
  const pubs = preparePubs(data.publications, data.overrides, applyConfDecisions(data.conferences ?? [], items))
  return undecidedGroups(conferenceGroups(pubs, [], registerWindow(pubs).minYear))
}

describe('register ⇄ history', () => {
  // Start from a conference that an admin decided and that has works inside the register window.
  const decided = (data.conferences ?? []).filter((c) => c.decision)
  const inWindow = (items: ConfDecisionItem[]) => {
    const pubs = preparePubs(data.publications, data.overrides, applyConfDecisions(data.conferences ?? [], items))
    return conferenceGroups(pubs, [], registerWindow(pubs).minYear).map((g) => g.match.key)
  }
  const key = decided.map((c) => c.key).find((k) => inWindow([]).includes(k))
  it('has a decided conference to test with', () => {
    expect(key).toBeTruthy()
  })
  it('a decided conference is not in the register; cancelling brings it back; deciding again removes it', () => {
    const k = key!
    expect(register([]).some((g) => g.match.key === k)).toBe(false)
    const cleared: ConfDecisionItem = { at: '2030-01-01T00:00:00.000Z', key: k, decision: 'clear', by: 'ผู้ดูแลระดับ 2', note: '', name: 'X' }
    expect(register([cleared]).some((g) => g.match.key === k)).toBe(true)
    const again: ConfDecisionItem = { ...cleared, at: '2030-01-01T00:01:00.000Z', decision: 'no_count' }
    expect(register([cleared, again]).some((g) => g.match.key === k)).toBe(false)
    // The history entry for that last press cancels it.
    const undo = buildHistory({ confItems: [cleared, again], formCancels: [], submissions: [], decisionLog: [], notices: [] })[0].undo
    expect(undo).toEqual({ action: 'confDecide', key: k, decision: 'clear', name: 'X' })
  })
})
