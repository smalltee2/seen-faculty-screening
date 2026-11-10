import { describe, expect, it } from 'vitest'
import raw from '../generated/data.json'
import { preparePubs } from '../classify'
import { applyConfDecisions } from '../confDecisions'
import type { Submission } from '../submissions'
import type { DataBundle } from '../types'
import { confId, inboxItems, subId } from './inboxItems'

const data = raw as unknown as DataBundle
const sub = (id: string, status: Submission['status']): Submission => ({
  id, nameEn: data.faculty[0].nameEn, year: 2025, title: `งาน ${id}`, authors: '', type: 'journal', venue: 'J', volume: '', doi: '', research: true,
  created: '2026-11-01T00:00:00.000Z', status, decidedAt: '', note: '',
})

describe('inboxItems', () => {
  const decided = (data.conferences ?? []).find((c) => c.decision)!
  const pubs = (cleared: boolean) =>
    preparePubs(data.publications, data.overrides, applyConfDecisions(data.conferences ?? [], cleared ? [{ at: '2030-01-01T00:00:00Z', key: decided.key, decision: 'clear', by: 'x', note: '', name: 'x' }] : []))

  it('a decided conference is "decided"; cleared again it is "pending" and listed first', () => {
    const before = inboxItems(pubs(false), [], [])
    const after = inboxItems(pubs(true), [], [])
    const item = (xs: typeof before) => xs.find((i) => i.id === confId(decided.key))
    if (!item(before)) return // that conference has no works in the register window
    expect(item(before)!.status).toBe('decided')
    expect(item(after)!.status).toBe('pending')
    expect(after[0].status).toBe('pending')
  })
  it('submissions: withdrawn ones are left out; pending ones wait, decided ones do not', () => {
    const items = inboxItems(pubs(false), [], [sub('a', 'pending'), sub('b', 'withdrawn'), sub('c', 'approved')])
    expect(items.some((i) => i.id === subId('b'))).toBe(false)
    expect(items.find((i) => i.id === subId('a'))?.status).toBe('pending')
    expect(items.find((i) => i.id === subId('c'))?.status).toBe('decided')
  })
})
