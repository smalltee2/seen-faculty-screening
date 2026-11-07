import { describe, expect, it } from 'vitest'
import { manualRowsFromCsv, newLiveRows, parseCsv } from './liveManual'
import type { Faculty, RawPub } from './types'

const faculty: Faculty[] = [{ nameEn: 'Teerachai Amnuaylojaroen', nameTh: 'ธีรชัย', scholarId: '', rank: 'รศ.', degree: 'ปริญญาเอก', degreeYear: 2014, programs: [], notes: '' }]
const header = 'Timestamp,อาจารย์ (name_en),ปีที่ตีพิมพ์ (ค.ศ.),ชื่อผลงาน,ผู้แต่ง,ประเภทผลงาน,ชื่อวารสารหรืองานประชุม,ปีที่/ฉบับที่/หน้า,DOI หรือ URL,เป็นงานวิจัยหรือไม่'
const csv = `${header}
11/6/2026 12:05:48,ธีรชัย อำนวยล้อเจริญ (Teerachai Amnuaylojaroen),2026,test,Teerachai Amnuaylojaroen,บทความฉบับสมบูรณ์ในงานประชุม (proceedings),Engineering 2026,,https://doi.org/10.1000/xyz,ใช่
11/6/2026 12:06:00,Nobody (Unknown Person),2026,x,,บทความวารสาร (journal),J,,,ไม่ใช่
`

describe('live form rows', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b, c",d\n1,"x""y",\n')).toEqual([['a', 'b, c', 'd'], ['1', 'x"y', '']])
  })
  it('maps the sheet like the nightly import and skips unknown lecturers', () => {
    const rows = manualRowsFromCsv(csv, faculty)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'manual', key: 'Teerachai Amnuaylojaroen', year: 2026, title: 'test', venue: 'Engineering 2026, 2026', doi: '10.1000/xyz', extType: 'proceeding', manualResearch: true, submitted: '11/6/2026 12:05:48', live: true })
  })
  it('drops rows already in the bundle', () => {
    const rows = manualRowsFromCsv(csv, faculty)
    const bundled: RawPub[] = [{ line: 1, source: 'manual', key: 'Teerachai Amnuaylojaroen', year: 2026, title: 'test', authors: '', venue: 'Engineering 2026, 2026', cites: 0, submitted: '11/6/2026 12:05:48' }]
    expect(newLiveRows(rows, bundled)).toHaveLength(0)
    expect(newLiveRows(rows, [])).toHaveLength(1)
  })
  it('returns nothing when the header does not match', () => {
    expect(manualRowsFromCsv('a,b\n1,2\n', faculty)).toEqual([])
  })
})

describe('live rows: year validation and whitespace (2026-11-07)', () => {
  it('skips a row with a blank year instead of taking year 0', () => {
    const header = ['Timestamp', 'อาจารย์ (name_en)', 'ปีที่ตีพิมพ์ (ค.ศ.)', 'ชื่อผลงาน', 'ผู้แต่ง', 'ประเภทผลงาน', 'ชื่อวารสารหรืองานประชุม', 'ปีที่/ฉบับที่/หน้า', 'DOI หรือ URL', 'เป็นงานวิจัยหรือไม่']
    const row = ['2026-11-07 10:00', 'ธีรชัย (Teerachai Amnuaylojaroen)', '', 'A work', '', 'บทความวารสาร (journal)', 'J', '', '', 'ใช่']
    const csv = [header, row].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    expect(manualRowsFromCsv(csv, [{ nameEn: 'Teerachai Amnuaylojaroen' } as never])).toEqual([])
  })
  it('matches bundled and live rows even when inner whitespace differs', () => {
    const live = [{ key: 'A', title: 'Two  spaces', submitted: 't1' } as never]
    const bundled = [{ key: 'A', title: 'Two spaces', submitted: 't1', source: 'manual' } as never]
    expect(newLiveRows(live, bundled)).toEqual([])
  })
})
