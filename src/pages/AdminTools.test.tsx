import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { preparePubs } from '../classify'
import data from '../generated/data.json'
import type { HistoryEntry } from '../history'
import { leavingWorks, outlook } from '../outlook'
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
  it('states the assumption and offers both years', () => {
    expect(html).toContain('สมมติไม่มีผลงานใหม่')
    for (const y of [2027, 2028]) {
      const n = rows.filter((r) => r.firstYear === y).length
      expect(html).toContain(`เริ่มไม่ผ่านปี พ.ศ. ${toBE(y)} (${n} คน)`)
    }
  })
  it('shows the first year by default, every lecturer of that year and no one else', () => {
    for (const r of rows) {
      const link = `#/person/${encodeURIComponent(r.result.person.nameEn)}`
      if (r.firstYear === 2027) expect(html).toContain(link)
      else expect(html).not.toContain(link)
    }
  })
  it('lists each expiring work once per lecturer', () => {
    for (const r of rows.filter((x) => x.firstYear === 2027)) {
      const titles = r.roles.flatMap((o) => o.leaving.map((w) => w.titleNorm))
      expect(leavingWorks(r.roles)).toHaveLength(new Set(titles).size)
    }
    expect(html.split('<td class="small" rowSpan').length - 1).toBe(rows.filter((x) => x.firstYear === 2027).length)
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
