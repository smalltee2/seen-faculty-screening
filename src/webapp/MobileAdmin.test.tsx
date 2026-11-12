import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import raw from '../generated/data.json'
import { preparePubs } from '../classify'
import { outlook } from '../outlook'
import { evaluatePerson, type Settings } from '../rules'
import type { HistoryEntry } from '../history'
import type { DataBundle, Pub } from '../types'
import { SHOWN_ROLES } from '../ui'
import { OutlookPage } from '../pages/AdminTools'
import { MobileFormList, MobileHistoryList, MobileOutlook, stampShort } from './MobileAdmin'

const data = raw as unknown as DataBundle
const s: Settings = { year: 2026, period: 'academic', countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' }
const pubs = preparePubs(data.publications, data.overrides, data.conferences ?? [], data.crossref ?? [])
const results = data.faculty.map((f) => evaluatePerson(f, pubs, s))

describe('phone layout of the level-2 pages', () => {
  it('writes a time briefly in Thai time', () => {
    expect(stampShort('2026-11-12T12:20:00Z')).toBe('12 พ.ย. 19:20')
    expect(stampShort('')).toBe('–')
    expect(stampShort('เมื่อวาน')).toBe('เมื่อวาน')
  })
  it('lists one row per lecturer of the outlook year, without the table and its long note', () => {
    const all = outlook(results, s, 2, SHOWN_ROLES)
    const year = s.year + 1
    const rows = all.filter((r) => r.firstYear === year)
    const html = renderToStaticMarkup(<MobileOutlook rows={rows} year={year} />)
    expect(html.match(/class="mme-work mlist-row"/g)?.length ?? 0).toBe(rows.length)
    const page = renderToStaticMarkup(<OutlookPage mobile results={results} settings={s} />)
    expect(page).not.toContain('<table')
    expect(page).not.toContain('เกณฑ์เดียวกับหน้าข้อมูลอาจารย์')
    expect(renderToStaticMarkup(<OutlookPage results={results} settings={s} />)).toContain('เกณฑ์เดียวกับหน้าข้อมูลอาจารย์')
  })
  it('says so when no lecturer starts failing that year', () => {
    expect(renderToStaticMarkup(<MobileOutlook rows={[]} year={2028} />)).toContain('ไม่มีผู้ที่จะเริ่มไม่ผ่านในปี 2571')
  })
  it('shows a decision as action, target and time; details and undo stay closed', () => {
    const e: HistoryEntry = { at: '2026-11-12T12:20:00Z', kind: 'conference', by: 'ผู้ดูแลระดับ 2', action: 'ไม่นับ', target: 'SEE 2024', note: 'เหตุผล ก', undo: { action: 'confDecide' } as never, undoLabel: 'ล้างการตัดสิน' }
    const html = renderToStaticMarkup(<MobileHistoryList entries={[e]} confirm={null} busy={false} onAsk={() => {}} onUndo={() => {}} />)
    expect(html).toContain('ไม่นับ')
    expect(html).toContain('SEE 2024')
    expect(html).toContain('12 พ.ย. 19:20')
    expect(html).not.toContain('เหตุผล ก')
    expect(html).not.toContain('ย้อนกลับ')
    expect(renderToStaticMarkup(<MobileHistoryList entries={[]} confirm={null} busy={false} onAsk={() => {}} onUndo={() => {}} />)).toContain('ยังไม่มีประวัติ')
  })
  it('lists admin-form works by title, lecturer and year', () => {
    const f = data.faculty[0]
    const p = { ...pubs[0], id: 'x1', key: f.nameEn, title: 'งานทดสอบ', year: 2025, venue: 'วารสาร ก' } as Pub
    const html = renderToStaticMarkup(<MobileFormList rows={[p]} person={(k) => data.faculty.find((x) => x.nameEn === k)} action={() => <button>ยกเลิก</button>} />)
    expect(html).toContain('งานทดสอบ')
    expect(html).toContain(f.nameTh || f.nameEn)
    expect(html).not.toContain('วารสาร ก')
    expect(html).not.toContain('ยกเลิก')
  })
})
