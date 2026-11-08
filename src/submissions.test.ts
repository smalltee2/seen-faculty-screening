import { describe, expect, it } from 'vitest'
import { approvedRows, dropUnapproved, findDuplicate, selfSubmission, submittedTag, type Submission } from './submissions'
import type { PubSource, RawPub } from './types'

const sub = (over: Partial<Submission>): Submission => ({
  id: 'a1', nameEn: 'Teerachai Amnuaylojaroen', year: 2024, title: 'A work', authors: 'T A', type: 'journal', venue: 'J Env', volume: '1(2)',
  doi: 'https://doi.org/10.1234/x.1', research: true, created: '2026-11-07T00:00:00Z', status: 'approved', decidedAt: '', note: '', ...over,
})
const lecturers = new Set(['Teerachai Amnuaylojaroen'])

describe('approvedRows', () => {
  it('turns an approved work into a counted manual row', () => {
    const [r] = approvedRows([sub({})], lecturers, [])
    expect(r).toMatchObject({ source: 'manual', key: 'Teerachai Amnuaylojaroen', year: 2024, extType: 'journal', manualResearch: true, doi: '10.1234/x.1', submitted: 'self:a1', venue: 'J Env 1(2), 2024' })
  })
  it('leaves out pending, rejected and withdrawn works', () => {
    const items = (['pending', 'rejected', 'withdrawn'] as const).map((status, i) => sub({ id: `p${i}`, status }))
    expect(approvedRows(items, lecturers, [])).toEqual([])
  })
  it('leaves out names that are not SEEN lecturers', () => {
    expect(approvedRows([sub({ nameEn: 'Someone Else' })], lecturers, [])).toEqual([])
  })
  it('does not count a work twice once data/self.tsv has it', () => {
    const bundled = [{ submitted: submittedTag('a1') } as RawPub]
    expect(approvedRows([sub({})], lecturers, bundled)).toEqual([])
  })
})

describe('dropUnapproved', () => {
  const bundled = [{ submitted: submittedTag('a1') }, { submitted: submittedTag('b2') }, { submitted: 'manual:3' }, {}] as RawPub[]
  it('drops a bundled self-added work once it is rejected (withdrawn) or withdrawn', () => {
    expect(dropUnapproved(bundled, [sub({ id: 'a1', status: 'rejected' }), sub({ id: 'b2', status: 'withdrawn' })])).toEqual([{ submitted: 'manual:3' }, {}])
  })
  it('keeps approved works and works the backend no longer lists', () => {
    expect(dropUnapproved(bundled, [sub({ id: 'a1', status: 'approved' })])).toEqual(bundled)
  })
})

describe('selfSubmission', () => {
  it('returns the approved submission behind a work, and null otherwise', () => {
    expect(selfSubmission({ submitted: 'self:a1' }, [sub({})])?.id).toBe('a1')
    expect(selfSubmission({ submitted: 'self:a1' }, [sub({ status: 'rejected' })])).toBeNull()
    expect(selfSubmission({ submitted: 'manual:3' }, [sub({})])).toBeNull()
    expect(selfSubmission({}, [sub({})])).toBeNull()
  })
})

describe('conferenceSubmissions', () => {
  it('gives pending and approved proceedings/posters a conference check; skips journals and withdrawn', async () => {
    const { conferenceSubmissions } = await import('./submissions')
    const items = [
      sub({ id: 'c1', type: 'proceeding', venue: 'Engineering', status: 'pending' }),
      sub({ id: 'c2', type: 'poster', venue: 'Thai Env Conf', status: 'approved' }),
      sub({ id: 'c3', type: 'journal', status: 'pending' }),
      sub({ id: 'c4', type: 'proceeding', status: 'withdrawn' }),
    ]
    const out = conferenceSubmissions(items, [])
    expect(out.map((x) => x.sub.id)).toEqual(['c1', 'c2'])
    expect(out[0].pub.conference?.verdict).toBe('pending')
    expect(out[0].pub.conference?.key).toMatch(/^venue:engineering/)
  })
})

describe('findDuplicate (2026-11-08: same title or DOI = same work)', () => {
  const pubs = [
    { title: 'Projected Crop-Calendar Shifts in Mainland Southeast Asia', year: 2026, doi: '10.3390/resources15110142', sources: ['scopus', 'openalex'] as PubSource[] },
    { title: 'A long Scholar title that was cut off at the end of the …', year: 2023, doi: undefined, sources: ['scholar'] as PubSource[] },
  ]
  const mine = [{ id: 'w1', nameEn: 'A', year: 2025, title: 'My pending Thai journal paper', authors: '', type: 'journal', venue: 'V', volume: '', doi: '', research: true, created: '', status: 'pending', decidedAt: '', note: '' }] as Submission[]
  it('matches a title ignoring case, spaces and punctuation', () => {
    expect(findDuplicate({ title: 'projected crop calendar shifts in mainland southeast asia.', doi: '' }, pubs, [])).toMatchObject({ kind: 'system', sources: ['Scopus', 'OpenAlex'], year: 2026 })
  })
  it('matches by DOI, also as a doi.org link', () => {
    expect(findDuplicate({ title: 'Different words', doi: 'https://doi.org/10.3390/RESOURCES15110142' }, pubs, [])?.kind).toBe('system')
  })
  it('matches a full title against a Scholar title cut with …', () => {
    expect(findDuplicate({ title: 'A long Scholar title that was cut off at the end of the sentence here', doi: '' }, pubs, [])?.sources).toEqual(['Google Scholar'])
  })
  it('reports the lecturer’s own pending submission first', () => {
    expect(findDuplicate({ title: 'My pending Thai journal paper', doi: '' }, pubs, mine)?.kind).toBe('pending')
  })
  it('lets a new work through', () => {
    expect(findDuplicate({ title: 'A genuinely new paper', doi: '10.1/xyz' }, pubs, mine)).toBeNull()
  })
})
