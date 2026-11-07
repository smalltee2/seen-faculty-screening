import { describe, expect, it } from 'vitest'
import { buildNotice, lastNotice, noticeKind, type Notice } from './notify'
import { evaluatePerson } from './rules'
import type { Faculty } from './types'

const settings = { year: 2026, countPosters: true, strict: true, screenConferences: false }
const person = (over: Partial<Faculty>): Faculty => ({ nameEn: 'Test Person', nameTh: 'ทดสอบ ทดสอบ', rank: 'ผศ.', degree: 'ปริญญาเอก', degreeYear: 2010, degreeField: '', programs: [], ...over } as Faculty)

describe('reminder e-mails', () => {
  it('a lecturer with no outputs needs a "fail" reminder whose body names the failing duties', () => {
    const r = evaluatePerson(person({}), [], settings)
    expect(noticeKind(r, settings)).toBe('fail')
    const { subject, body } = buildNotice(r, settings, 'fail')
    expect(subject).toContain('ไม่ผ่านเกณฑ์')
    expect(body).toContain('เรียน ผศ.ดร.ทดสอบ ทดสอบ')
    expect(body).toContain('ข้อ 9.3.1')
    expect(body).toContain('0 เรื่อง')
    // The reason after each duty is the output shortfall, not the (satisfied) qualification line.
    expect(body).toMatch(/ข้อ 9\.3\.1 [^\n]*: ต้องการ /)
    expect(body).not.toMatch(/ข้อ 9\.3\.1 [^\n]*: คุณวุฒิ:/)
    expect(body).not.toMatch(/\S@up\.ac\.th/) // the domain is named as an instruction, never as someone's address
  })
  it('the body never contains an e-mail address placeholder', () => {
    const r = evaluatePerson(person({}), [], settings)
    expect(buildNotice(r, settings, 'risk').body).not.toMatch(/\S@up\.ac\.th/)
  })
  it('lastNotice picks the newest of the right kind', () => {
    const n: Notice[] = [
      { at: '2026-11-01T00:00:00Z', nameEn: 'A', kind: 'fail', by: 'x' },
      { at: '2026-11-05T00:00:00Z', nameEn: 'A', kind: 'fail', by: 'x' },
      { at: '2026-11-06T00:00:00Z', nameEn: 'A', kind: 'risk', by: 'x' },
    ]
    expect(lastNotice(n, 'A', 'fail')?.at).toBe('2026-11-05T00:00:00Z')
    expect(lastNotice(n, 'B', 'fail')).toBeNull()
  })
  it('acknowledgement time travels with the notice', () => {
    const n: Notice[] = [{ at: '2026-11-07T03:07:00Z', nameEn: 'A', kind: 'fail', by: 'x', ackAt: '2026-11-08T02:15:00Z' }]
    expect(lastNotice(n, 'A', 'fail')?.ackAt).toBe('2026-11-08T02:15:00Z')
  })
})
