import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FreshnessList } from './FreshnessPanel'
import { sourceAges } from './freshness'

const now = Date.parse('2026-11-10T12:00:00Z')
const h = (n: number) => new Date(now - n * 3_600_000).toISOString()

describe('FreshnessList', () => {
  const ages = sourceAges(h(1), { scopus: h(3), openalex: h(3), scholar: h(50), forms: null }, now)
  const html = renderToStaticMarkup(<FreshnessList ages={ages} counts={{ openalex: 441, scopus: 325, forms: 0, scholar: 688 }} />)
  const rows = html.split('<dt>').slice(1).map((r) => r.slice(0, r.indexOf('</dd>')))

  it('one row per source in display order, each with its time and its row count', () => {
    expect(rows.map((r) => r.slice(0, r.indexOf(' (')))).toEqual(['OpenAlex', 'Scopus', 'แบบฟอร์มผู้ดูแล', 'Google Scholar', 'การสร้างเว็บ'])
    expect(rows[0]).toContain('อัปเดตล่าสุด')
    expect(rows[0]).toContain('3 ชั่วโมงที่แล้ว')
    expect(rows[0]).toContain('จำนวน 441 รายการ')
    expect(rows[1]).toContain('จำนวน 325 รายการ')
    expect(rows[3]).toContain('จำนวน 688 รายการ')
  })
  it('a count of 0 is still shown, and the form without a stamp is flagged', () => {
    expect(rows[2]).toContain('จำนวน 0 รายการ')
    expect(rows[2]).toContain('ไม่มีบันทึก')
    expect(rows[2]).toContain('ค้างเกิน 2 วัน')
  })
  it('the site build has a time but no row count', () => {
    expect(rows[4]).toContain('(1 ชั่วโมงที่แล้ว)')
    expect(rows[4]).not.toContain('รายการ')
  })
  it('there is no separate heading for the times', () => {
    expect(html).not.toContain('ข้อมูลล่าสุดของแต่ละแหล่ง')
    expect(html.match(/<dl/g)).toHaveLength(1)
  })
})
