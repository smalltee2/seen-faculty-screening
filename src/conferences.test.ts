import { describe, expect, it } from 'vitest'
import { conferenceKey, conferenceName, conferenceVerdict, matchConference } from './conferences'
import { evaluatePub } from './rules'
import type { ConferenceEntry, Pub } from './types'

const entry = (over: Partial<ConferenceEntry> = {}): ConferenceEntry => ({
  key: 'venue:x', displayName: '', conferenceName: 'X', organiser: 'Y', association: 'Z', associationRole: 'organiser', field: 'environment',
  relatedField: 'yes', confidence: 'high', evidenceUrl: 'https://example.org', checkedAt: '2026-11-06', checkedBy: 'claude-code', note: '',
  decision: '', decidedBy: '', decidedAt: '', decisionNote: '', ...over,
})

describe('conference keys', () => {
  it('maps every edition of a conference to one key', () => {
    expect(conferenceName('The 24th National Environmental Conference, 20-21 May 2568, Bangsaen …, 2025')).toBe('National Environmental Conference')
    expect(conferenceName('the 24th National Environmental Conference. 24 (1), 22-27, 2025')).toBe('National Environmental Conference')
    expect(conferenceName('การประชุมวิชาการระดับชาติพะเยาวิจัย ครั้งที่ 11, 25-28 มกราคม 2565, มหาวิทยาลัยพะเยา จ …, 2022')).toBe('การประชุมวิชาการระดับชาติพะเยาวิจัย')
    expect(conferenceName('การประชุมวิชาการเทคโนโลยีสิ่งแวดล้อมประจำปี ครั้งที่ 36 สวสท.’67, 318-325, 2024')).toBe('การประชุมวิชาการเทคโนโลยีสิ่งแวดล้อมประจำปี')
    expect(conferenceName('The 19th KU KPS National Conference 19 (1), 2239-2248, 2022')).toBe('KU KPS National Conference')
    expect(conferenceName('the 5th National Conference on Science Technology and Innovation (CSTI-MJU …, 2024')).toBe('National Conference on Science Technology and Innovation')
    expect(conferenceName('Asia Conference on Environment and Sustainable Development, 261-273, 2023')).toBe('Asia Conference on Environment and Sustainable Development')
    const a = conferenceKey({ venue: 'การประชุมวิชาการระดับชาติพะเยาวิจัย ครั้งที่ 11, 25-28 มกราคม 2565, 2022', titleNorm: 'a' })
    const b = conferenceKey({ venue: 'การประชุมวิชาการระดับชาติ พะเยาวิจัย ครั้งที่ 12, 2023', titleNorm: 'b' })
    expect(a).toBe(b)
  })
  it('keys publisher series per paper', () => {
    expect(conferenceKey({ venue: 'AIP Conference Proceedings 2681 (1), 020003, 2022', titleNorm: 'densification of corn residues' })).toBe('work:densification of corn residues')
    expect(conferenceKey({ venue: 'Materials Today: Proceedings 47, 3525-3528, 2021', titleNorm: 't' })).toBe('work:t')
    expect(conferenceKey({ venue: 'Conference Book, 82, 2022', titleNorm: 't' })).toBe('work:t')
  })
})

describe('conference verdict', () => {
  it('unchecked, low confidence or unknown → pending (shown, not counted)', () => {
    expect(conferenceVerdict(null).verdict).toBe('pending')
    expect(conferenceVerdict(entry({ confidence: 'low' })).verdict).toBe('pending')
    expect(conferenceVerdict(entry({ associationRole: 'unknown' })).verdict).toBe('pending')
    expect(conferenceVerdict(entry({ relatedField: 'unknown' })).verdict).toBe('pending')
    expect(conferenceVerdict(entry({ confidence: 'medium' })).verdict).toBe('pending')
  })
  it('high confidence + association + environment/energy is only a suggestion → pending until an admin confirms', () => {
    expect(conferenceVerdict(entry()).verdict).toBe('pending')
    expect(conferenceVerdict(entry()).reason).toContain('รอผู้ดูแลยืนยัน')
    expect(conferenceVerdict(entry({ associationRole: 'co_organiser' })).verdict).toBe('pending')
  })
  it('no association, or unrelated field, is only a suggestion → pending until an admin decides', () => {
    expect(conferenceVerdict(entry({ associationRole: 'none', association: '' })).verdict).toBe('pending')
    expect(conferenceVerdict(entry({ associationRole: 'none', association: '' })).reason).toContain('แนะนำไม่นับ')
    expect(conferenceVerdict(entry({ relatedField: 'no', field: 'business' })).verdict).toBe('pending')
  })
  it('admin decision overrides everything', () => {
    expect(conferenceVerdict(entry({ confidence: 'low', decision: 'count' })).verdict).toBe('count')
    expect(conferenceVerdict(entry({ decision: 'no_count' })).verdict).toBe('no_count')
  })
})

describe('rule: proceedings count only when the conference is endorsed', () => {
  const person = { nameEn: 'P', nameTh: 'พ', scholarId: '', rank: 'ผศ.' as const, degree: 'ปริญญาเอก' as const, degreeYear: 2005, programs: [], notes: '' }
  const pub = (venue: string, idx: Map<string, ConferenceEntry>): Pub => {
    const base = { line: 1, key: 'P', year: 2024, title: 'T', titleNorm: 't', authors: '', venue, cites: 0, id: 'P|t', type: 'proceeding' as const, typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false, ownDegree: null, duplicates: 0, sources: ['scholar' as const], override: null }
    return { ...base, conference: matchConference(base, idx) }
  }
  const S = { year: 2026, countPosters: true, strict: true }
  it('screening off → counts as before', () => {
    expect(evaluatePub(pub('X Conf, 1-2, 2024', new Map()), person, S).eligible).toBe('yes')
  })
  it('screening on → unchecked or AI-only is not counted, admin-confirmed is', () => {
    expect(evaluatePub(pub('X Conf, 1-2, 2024', new Map()), person, { ...S, screenConferences: true }).eligible).toBe('no')
    const ai = new Map([['venue:x conf', entry({ key: 'venue:x conf' })]])
    expect(evaluatePub(pub('X Conf, 1-2, 2024', ai), person, { ...S, screenConferences: true }).eligible).toBe('no')
    const admin = new Map([['venue:x conf', entry({ key: 'venue:x conf', decision: 'count' })]])
    expect(evaluatePub(pub('X Conf, 1-2, 2024', admin), person, { ...S, screenConferences: true }).eligible).toBe('yes')
  })
})
