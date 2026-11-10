import { describe, expect, it } from 'vitest'
import { buildHistory, type DecisionLogItem } from './history'
import type { ConfDecisionItem } from './confDecisions'
import type { FormCancelItem } from './formCancel'
import type { Submission } from './submissions'
import code from '../apps-script/Code.gs?raw'

const conf = (at: string, key: string, decision: ConfDecisionItem['decision'], note = ''): ConfDecisionItem => ({ at, key, decision, by: 'ผู้ดูแลระดับ 2', note, name: key.replace('venue:', '') })
const sub = (id: string, status: Submission['status'], over: Partial<Submission> = {}): Submission => ({
  id, nameEn: 'A', year: 2025, title: `work ${id}`, authors: '', type: 'journal', venue: 'J', volume: '', doi: '', research: true,
  created: '2026-11-01T00:00:00.000Z', status, decidedAt: status === 'pending' ? '' : '2026-11-03T00:00:00.000Z', note: '', ...over,
})
const empty = { confItems: [], formCancels: [], submissions: [], decisionLog: [] as DecisionLogItem[], notices: [] }

describe('buildHistory', () => {
  it('keeps every conference press and undoes only the latest, back to the one before', () => {
    const h = buildHistory({ ...empty, confItems: [conf('2026-11-01T01:00:00Z', 'venue:x', 'count'), conf('2026-11-02T01:00:00Z', 'venue:x', 'no_count', 'ไม่เกี่ยวกับสาขา')] })
    expect(h).toHaveLength(2)
    expect(h[0].action).toBe('ไม่นับ')
    expect(h[0].note).toBe('ไม่เกี่ยวกับสาขา')
    expect(h[0].undo).toEqual({ action: 'confDecide', key: 'venue:x', decision: 'count', name: 'x' })
    expect(h[1].undo).toBeUndefined()
  })
  it('undoes a first conference decision with "clear", and offers nothing when nothing would change', () => {
    const one = buildHistory({ ...empty, confItems: [conf('2026-11-01T01:00:00Z', 'venue:x', 'count')] })
    expect(one[0].undo).toMatchObject({ decision: 'clear' })
    const cleared = buildHistory({ ...empty, confItems: [conf('2026-11-01T01:00:00Z', 'venue:y', 'clear')] })
    expect(cleared[0].undo).toBeUndefined()
  })
  it('undoes a form cancel with a restore and the other way round', () => {
    const f = (at: string, action: FormCancelItem['action']): FormCancelItem => ({ at, nameEn: 'A', titleNorm: 't', title: 'T', action, by: 'ผู้ดูแลระดับ 2' })
    const h = buildHistory({ ...empty, formCancels: [f('2026-11-01T01:00:00Z', 'cancel'), f('2026-11-02T01:00:00Z', 'restore')] })
    expect(h[0].undo).toEqual({ action: 'formCancel', nameEn: 'A', title: 'T', mode: 'cancel' })
    expect(h[1].undo).toBeUndefined()
  })
  it('lists every decision on a work from the log and undoes the one in force', () => {
    const log: DecisionLogItem[] = [
      { at: '2026-11-02T00:00:00.000Z', action: 'decide', by: 'ผู้ดูแลระดับ 2', id: '7', status: 'rejected' },
      { at: '2026-11-03T00:00:00.000Z', action: 'decide', by: 'ผู้ดูแล (somchai)', id: '7', status: 'approved' },
      { at: '2026-11-04T00:00:00.000Z', action: 'withdraw', by: 'อาจารย์เจ้าของผลงาน', id: '8', status: 'withdrawn' },
    ]
    const h = buildHistory({ ...empty, submissions: [sub('7', 'approved', { note: 'ตรวจแล้ว' }), sub('8', 'withdrawn')], decisionLog: log, nameOf: () => 'อ.ก' })
    expect(h.map((x) => x.action)).toEqual(['อาจารย์ถอนผลงาน', 'อนุมัติ', 'ไม่อนุมัติ'])
    expect(h[1].undo).toEqual({ action: 'decide', id: '7', status: 'pending' })
    expect(h[1].note).toBe('ตรวจแล้ว')
    expect(h[1].target).toBe('อ.ก — work 7')
    expect(h[0].undo).toBeUndefined()
    expect(h[2].undo).toBeUndefined()
    expect(h[2].note).toBe('')
  })
  it('offers no undo once a work is back to pending', () => {
    const log: DecisionLogItem[] = [
      { at: '2026-11-02T00:00:00.000Z', action: 'decide', by: 'x', id: '7', status: 'approved' },
      { at: '2026-11-03T00:00:00.000Z', action: 'decide', by: 'x', id: '7', status: 'pending' },
    ]
    const h = buildHistory({ ...empty, submissions: [sub('7', 'pending')], decisionLog: log })
    expect(h.every((x) => !x.undo)).toBe(true)
  })
  it('falls back to the latest decision per work when the backend has no log action', () => {
    const h = buildHistory({ ...empty, submissions: [sub('7', 'approved'), sub('8', 'pending'), sub('9', 'withdrawn')], decisionLog: null })
    expect(h).toHaveLength(1)
    expect(h[0].action).toBe('อนุมัติแล้ว')
    expect(h[0].undo).toEqual({ action: 'decide', id: '7', status: 'pending' })
  })
  it('sorts all kinds newest first', () => {
    const h = buildHistory({
      ...empty,
      confItems: [conf('2026-11-05T00:00:00.000Z', 'venue:x', 'count')],
      notices: [{ at: '2026-11-06T00:00:00.000Z', nameEn: 'A', kind: 'risk', by: 'ผู้ดูแลระดับ 2', ackAt: '' }],
    })
    expect(h.map((x) => x.kind)).toEqual(['notice', 'conference'])
  })
})

// The backend half is plain Apps Script; run its pure helper here so the two sides stay in step.
describe('Code.gs decisionLogItems', () => {
  const body = code.slice(code.indexOf('function decisionLogItems('))
  const fn = new Function(`${body.slice(0, body.indexOf('\n}\n') + 3)}; return decisionLogItems`)() as (rows: Record<string, unknown>[]) => DecisionLogItem[]
  it('returns decisions and withdrawals without e-mail addresses', () => {
    const items = fn([
      { time: new Date('2026-11-02T00:00:00Z'), action: 'decide', email: 'Somchai@up.ac.th', ok: 'yes', note: 'abc123 approved' },
      { time: new Date('2026-11-03T00:00:00Z'), action: 'decide', email: 'ผู้ดูแลระดับ 2', ok: 'yes', note: 'abc123 pending' },
      { time: new Date('2026-11-04T00:00:00Z'), action: 'withdraw', email: 'lecturer@up.ac.th', ok: 'yes', note: 'zzz' },
      { time: new Date('2026-11-04T00:00:00Z'), action: 'request', email: 'lecturer@up.ac.th', ok: 'yes', note: '' },
      { time: new Date('2026-11-04T00:00:00Z'), action: 'decide', email: 'x@up.ac.th', ok: 'no', note: 'abc bad' },
    ])
    expect(items).toEqual([
      { at: '2026-11-02T00:00:00.000Z', action: 'decide', by: 'ผู้ดูแล (somchai)', id: 'abc123', status: 'approved' },
      { at: '2026-11-03T00:00:00.000Z', action: 'decide', by: 'ผู้ดูแลระดับ 2', id: 'abc123', status: 'pending' },
      { at: '2026-11-04T00:00:00.000Z', action: 'withdraw', by: 'อาจารย์เจ้าของผลงาน', id: 'zzz', status: 'withdrawn' },
    ])
    expect(JSON.stringify(items)).not.toContain('@')
  })
})
