// DEMO-NOTICE — remove with src/demoNotice.tsx.
import { describe, expect, it } from 'vitest'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { DEMO_KEEP, DEMO_NAME, demoNoticeOn, demoPubs, isDemoPerson } from './demoNotice'
import { buildNotice, noticeKind } from './notify'
import { evaluatePerson, type Settings } from './rules'
import type { DataBundle } from './types'

const data = raw as unknown as DataBundle
const settings: Settings = { year: 2026, countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' }
const pubs = preparePubs(data.publications, data.overrides, data.conferences ?? [])
const person = data.faculty.find((f) => f.nameEn === DEMO_NAME)!

describe('showcase mode for the reminder e-mail', () => {
  it('is off unless the address asks for it', () => {
    expect(demoNoticeOn()).toBe(false)
    expect(isDemoPerson(DEMO_NAME)).toBe(false)
    expect(isDemoPerson(DEMO_NAME, true)).toBe(true)
    expect(isDemoPerson('Someone Else', true)).toBe(false)
  })
  it('keeps the example lecturer\'s newest works only, and everyone else\'s works', () => {
    const d = demoPubs(pubs)
    expect(d.filter((p) => p.key === DEMO_NAME)).toHaveLength(DEMO_KEEP)
    expect(d.filter((p) => p.key !== DEMO_NAME)).toEqual(pubs.filter((p) => p.key !== DEMO_NAME))
  })
  it('makes the real rules fail some duties, not all, for the example lecturer', () => {
    expect(noticeKind(evaluatePerson(person, pubs, settings), settings)).not.toBe('fail')
    const r = evaluatePerson(person, demoPubs(pubs), settings)
    expect(noticeKind(r, settings)).toBe('fail')
    const statuses = Object.values(r.roles).map((x) => x.status)
    expect(statuses).toContain('met')
    expect(statuses).toContain('not_met')
    const { subject, body } = buildNotice(r, settings, 'fail')
    expect(subject.startsWith('[ตัวอย่าง]')).toBe(false) // the label is added only while the mode is on
    expect(body).toMatch(/ข้อ 9\./)
  })
})
