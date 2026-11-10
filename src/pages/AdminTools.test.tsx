import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { preparePubs } from '../classify'
import data from '../generated/data.json'
import type { HistoryEntry } from '../history'
import { outlook } from '../outlook'
import { evaluatePerson, toBE, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { SHOWN_ROLES } from '../ui'
import { ADMIN_VIEWS, HistoryTable, OutlookPage, isAdminView } from './AdminTools'

const bundle = data as unknown as DataBundle
const S: Settings = { year: 2026, countPosters: true, strict: true, screenConferences: bundle.conferenceScreening === 'on' }
const pubs = preparePubs(bundle.publications, bundle.overrides, bundle.conferences ?? [])
const results = bundle.faculty.map((f) => evaluatePerson(f, pubs, S))
const noop = () => undefined

describe('admin views', () => {
  it('knows its own route names only', () => {
    expect(ADMIN_VIEWS.map((v) => v.id).every(isAdminView)).toBe(true)
    expect(isAdminView('nope')).toBe(false)
    expect(isAdminView('')).toBe(false)
  })
})

describe('OutlookPage (bundled data)', () => {
  const html = renderToStaticMarkup(<OutlookPage results={results} settings={S} />)
  const rows = outlook(results, S, 2, SHOWN_ROLES)
  it('states the assumption and both years', () => {
    expect(html).toContain('สมมติว่าไม่มีผลงานใหม่เพิ่ม')
    expect(html).toContain(String(toBE(2027)))
    expect(html).toContain(String(toBE(2028)))
  })
  it('lists every lecturer the outlook finds', () => {
    for (const r of rows) expect(html).toContain(`#/person/${encodeURIComponent(r.result.person.nameEn)}`)
    const y1 = rows.filter((r) => r.firstYear === 2027).length
    expect(html).toContain(`<b>${y1}</b> คน เริ่มไม่ผ่านในปี พ.ศ. ${toBE(2027)}`)
  })
})

describe('HistoryTable', () => {
  const undoable: HistoryEntry = { at: '2026-11-10T01:00:00Z', kind: 'conference', by: 'ผู้ดูแล (x)', action: 'นับ', target: 'Conf A', note: 'เหตุผล', undo: { action: 'confDecide', key: 'a', decision: 'clear', name: 'Conf A' }, undoLabel: 'ยกเลิกการตัดสิน' }
  const plain: HistoryEntry = { at: '2026-11-09T01:00:00Z', kind: 'notice', by: '', action: 'ส่งอีเมลแจ้งเตือน', target: 'ก ข', note: '' }
  it('offers undo only where an undo exists', () => {
    const html = renderToStaticMarkup(<HistoryTable entries={[undoable, plain]} confirm={null} busy={false} onAsk={noop} onUndo={noop} />)
    expect(html.split('>ย้อนกลับ</button>').length - 1).toBe(1)
    expect(html).not.toContain('ยืนยัน')
  })
  it('asks for confirmation in the page before undoing', () => {
    const html = renderToStaticMarkup(<HistoryTable entries={[undoable, plain]} confirm={undoable} busy={false} onAsk={noop} onUndo={noop} />)
    expect(html).toContain('ยกเลิกการตัดสิน?')
    expect(html).toContain('ยืนยัน')
  })
  it('has an empty state', () => {
    expect(renderToStaticMarkup(<HistoryTable entries={[]} confirm={null} busy={false} onAsk={noop} onUndo={noop} />)).toContain('ยังไม่มีประวัติ')
  })
})
