import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FreshnessList, FreshnessPanel } from './FreshnessPanel'
import { sourceAges } from './freshness'

const now = Date.parse('2026-11-10T12:00:00Z')
const h = (n: number) => new Date(now - n * 3_600_000).toISOString()

describe('FreshnessList', () => {
  const ages = sourceAges(h(1), { scopus: h(3), openalex: h(3), scholar: h(50), forms: null, tci: h(4), crossref: h(5) }, now)
  const html = renderToStaticMarkup(<FreshnessList ages={ages} counts={{ openalex: 441, scopus: 325, tci: 125, forms: 0, scholar: 688, crossref: 271 }} />)
  const rows = html.split('<dt>').slice(1).map((r) => r.slice(0, r.indexOf('</dd>')))

  it('one row per source in display order, each with its time and its row count', () => {
    expect(rows.map((r) => r.replace(/<[^>]+>/g, '').replace('แหล่งข้อมูลเสริม (ไม่เพิ่มรายการผลงาน)', '')).map((r) => r.slice(0, r.indexOf(' (')))).toEqual(['OpenAlex', 'Scopus', 'TCI วารสารไทย', 'แบบฟอร์มผู้ดูแล', 'Google Scholar', 'Crossref รายละเอียดและเดือนตีพิมพ์ตาม DOI'])
    expect(rows[0]).toContain('อัปเดตล่าสุด')
    expect(rows[0]).toContain('3 ชั่วโมงที่แล้ว')
    expect(rows[0]).toContain('จำนวน 441 รายการ')
    expect(rows[1]).toContain('จำนวน 325 รายการ')
    expect(rows[2]).toContain('จำนวน 125 รายการ')
    expect(rows[4]).toContain('จำนวน 688 รายการ')
  })
  it('a count of 0 is still shown, and the form without a stamp is flagged', () => {
    expect(rows[3]).toContain('จำนวน 0 รายการ')
    expect(rows[3]).toContain('ไม่มีบันทึก')
    expect(rows[3]).toContain('ค้างเกิน 2 วัน')
  })
  it('Crossref is listed last, under its own heading, counted in DOIs', () => {
    expect(rows[5]).toContain('จำนวน 271 DOI')
    expect(rows[5]).toContain('5 ชั่วโมงที่แล้ว')
    expect(html.indexOf('แหล่งข้อมูลเสริม')).toBeGreaterThan(html.indexOf('Google Scholar'))
    expect(html.match(/แหล่งข้อมูลเสริม/g)).toHaveLength(1)
  })
  it('the site build is not listed while it is fresh', () => {
    expect(html).not.toContain('การสร้างเว็บ')
  })
  it('a stale site build is listed, with a time and no row count', () => {
    const old = renderToStaticMarkup(<FreshnessList ages={sourceAges(h(72), { scopus: h(3), openalex: h(3), scholar: h(50), forms: h(1), tci: h(3), crossref: h(3) }, now)} counts={{ openalex: 441 }} />)
    const last = old.split('<dt>').slice(1).map((r) => r.slice(0, r.indexOf('</dd>'))).pop()!
    expect(last).toContain('การสร้างเว็บ')
    expect(last).toContain('(3 วันที่แล้ว)')
    expect(last).not.toContain('รายการ')
  })
  it('there is no separate heading for the times', () => {
    expect(html).not.toContain('ข้อมูลล่าสุดของแต่ละแหล่ง')
    expect(html.match(/<dl/g)).toHaveLength(1)
  })
})

describe('FreshnessList new works', () => {
  const ages = sourceAges(h(1), { scopus: h(3), openalex: h(3), scholar: h(50), forms: h(1) }, now)
  const nw = { openalex: [1, 2, 3].map((i) => ({ at: '2026-11-11T00:21:02Z', key: `L${i}`, title: 'Duck bone biochar', year: '2026', venue: 'IJMS', doi: '10.3390/ijms27219991' })) }
  const html = renderToStaticMarkup(<FreshnessList ages={ages} newWorks={nw} nameOf={(k) => `ชื่อ ${k}`} />)
  it('shows "ใหม่ N" after the source with new works, counting works, not rows', () => {
    expect(html.match(/class="new-badge"[^>]*>ใหม่ 1</g)).toHaveLength(1)
    expect(html.split('<dt>')[1]).toContain('new-badge')
    expect(html.split('<dt>')[2]).not.toContain('new-badge')
  })
  it('keeps the list closed until the badge is pressed', () => {
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('class="new-works"')
  })
})

describe('FreshnessList opened works', () => {
  const ages = sourceAges(h(1), { scopus: h(3), openalex: h(3), scholar: h(50), forms: h(1) }, now)
  const nw = { openalex: [{ at: '2026-11-11T00:21:02Z', key: 'L1', title: 'Duck bone', year: '2026', venue: 'IJMS', doi: '10.3390/x' }] }
  it('greys the badge once every work in it was opened, and keeps it', () => {
    const opened = renderToStaticMarkup(<FreshnessList ages={ages} newWorks={nw} seen={new Set(['doi:10.3390/x'])} />)
    expect(opened).toContain('new-badge new-badge-seen')
    const fresh = renderToStaticMarkup(<FreshnessList ages={ages} newWorks={nw} seen={new Set()} />)
    expect(fresh).not.toContain('new-badge-seen')
  })
})

describe('FreshnessPanel', () => {
  it('passes every source\'s time from the bundle to the list, TCI and Crossref included', () => {
    const panel = renderToStaticMarkup(<FreshnessPanel builtAt={new Date(Date.now() - 3_600_000).toISOString()} freshness={{ scopus: new Date().toISOString(), openalex: new Date().toISOString(), scholar: new Date().toISOString(), forms: new Date().toISOString(), tci: new Date().toISOString(), crossref: new Date().toISOString() }} />)
    expect(panel).not.toContain('ไม่มีบันทึก')
    expect(panel).not.toContain('ค้างเกิน 2 วัน')
    expect(panel).toContain('ทุกแหล่งได้ข้อมูลใหม่ภายใน 2 วัน')
  })
})
