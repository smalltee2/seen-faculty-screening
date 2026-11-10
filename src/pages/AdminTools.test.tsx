import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChangeEntry } from '../changes'
import { preparePubs } from '../classify'
import data from '../generated/data.json'
import type { HistoryEntry } from '../history'
import { outlook } from '../outlook'
import { pendingQueue } from '../pending'
import { evaluatePerson, toBE, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { SHOWN_ROLES } from '../ui'
import { registerWindow } from './AdminPage'
import { ADMIN_VIEWS, ChangeList, HistoryTable, OutlookPage, PendingPage, ReportPage, isAdminView } from './AdminTools'

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

describe('PendingPage (bundled data)', () => {
  const queue = pendingQueue({ results, pubs, pendingPubs: [], submissions: [], settings: S, minYear: registerWindow(pubs).minYear })
  const html = renderToStaticMarkup(<PendingPage queue={queue} faculty={bundle.faculty} approvalKey="k" onConferencesChanged={noop} onSubmissionsChanged={noop} />)
  it('shows the three counts and their total', () => {
    expect(html).toContain(`รวม ${queue.total} รายการ`)
    expect(html).toContain(`<b>${queue.conferences.length}</b> งานประชุมรอ`)
    expect(html).toContain(`<b>${queue.review.length}</b> ผลงานที่ระบบจัดประเภทไม่ได้`)
    expect(html).toContain('ไม่มีผลงานรออนุมัติ')
  })
  it('has one row of decision buttons per undecided conference', () => {
    const section = html.slice(html.indexOf('id="pending-conf"'), html.indexOf('id="pending-sub"'))
    expect(section.split('<tr').length - 2).toBe(queue.conferences.length || -1)
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

describe('ReportPage (bundled data)', () => {
  const programmes = bundle.programmes ?? []
  const html = renderToStaticMarkup(<ReportPage programmes={programmes} results={results} settings={S} builtAt={bundle.builtAt} />)
  it('shows every programme and the Word button', () => {
    for (const p of programmes) expect(html).toContain(p.th)
    expect(html).toContain('ดาวน์โหลด Word')
  })
  it('says so when there are no programmes', () => {
    expect(renderToStaticMarkup(<ReportPage programmes={[]} results={results} settings={S} builtAt="" />)).toContain('ยังไม่มีรายชื่อหลักสูตร')
  })
})

describe('ChangeList', () => {
  const entry: ChangeEntry = {
    at: '2026-11-10T00:00:00Z', prevAt: '2026-11-09T00:00:00Z', year: 2027, prevYear: 2026,
    people: [{ nameEn: 'A B', name: 'ก ข', added: [{ title: 'New work', year: 2026, counted: true }], removed: [{ title: 'Gone', year: 2021, counted: false }], recounted: [{ title: 'Flip', year: 2023, counted: false, was: true }], status: [{ role: 'ms_teacher', from: 'met', to: 'not_met' }] }],
  }
  const html = renderToStaticMarkup(<ChangeList entries={[entry]} />)
  it('summarises an entry and lists each change', () => {
    expect(html).toContain('ผลงานเพิ่ม 1 · หาย 1 · เปลี่ยนการนับ 1 · สถานะเปลี่ยน 1')
    expect(html).toContain('New work')
    expect(html).toContain('Gone')
    expect(html).toContain('เลิกนับ')
    expect(html).toContain('#/person/A%20B')
  })
  it('flags a change of evaluation year', () => {
    expect(html).toContain(`ปีประเมินเปลี่ยนจาก พ.ศ. ${toBE(2026)} เป็น ${toBE(2027)}`)
  })
  it('has an empty state', () => {
    expect(renderToStaticMarkup(<ChangeList entries={[]} />)).toContain('ยังไม่มีการเปลี่ยนแปลง')
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
