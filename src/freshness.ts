// When each data source last really answered, and which ones are stale.
//
// The fetch scripts write data/status/<source>.txt only when the source answered (a refused Scopus
// key or an unreachable sheet keeps the previous rows and writes no stamp), so an old stamp means
// "the job ran but got nothing" as well as "the job did not run". The same rule runs in the backend
// (checkFreshness in apps-script/Code.gs), which e-mails the admin once a day while something is stale.
import type { Freshness } from './types'

export const STALE_HOURS = 48

export type SourceKey = keyof Freshness | 'build'

export const SOURCE_TH: Record<SourceKey, string> = {
  build: 'การสร้างเว็บ (GitHub Actions)',
  scopus: 'Scopus (ทุกวัน, 07:30)',
  openalex: 'OpenAlex (ทุกวัน 03:00)',
  forms: 'แบบฟอร์มผู้ดูแล (Google Form ทุกชั่วโมง)',
  scholar: 'Google Scholar (นำเข้าเป็นครั้งคราว)',
  // Added 2026-11-12, after the others so the stale list keeps the order of the backend's STALE_WATCHED.
  tci: 'TCI วารสารไทย (ทุกวัน 03:00)',
  crossref: 'Crossref รายละเอียดและเดือนตีพิมพ์ตาม DOI (ทุกวัน 03:00)',
}

/** Row order of the "แหล่งข้อมูล" list on the admin page: the four data sources. The site build is
 *  not listed (Tum, 2026-11-12); it is still watched, and its row appears only when it is stale, so
 *  the warning under the list always has the row it is about. */
export const DISPLAY_ORDER: SourceKey[] = ['openalex', 'scopus', 'tci', 'forms', 'scholar']
/** Listed after them under "แหล่งข้อมูลเสริม": sources that add no works but fill in what the works carry
 *  (Crossref: journal details and the month of publication, which counting by academic year reads). */
export const SUPPORT_ORDER: SourceKey[] = ['crossref']

/** Scholar is refreshed by hand (the "อัปเดตจาก Google Scholar" button), so its age is shown but never counts as stale. */
export const WATCHED: SourceKey[] = ['build', 'scopus', 'openalex', 'forms', 'tci', 'crossref']

export interface SourceAge {
  key: SourceKey
  at: string | null
  /** Whole hours since `at`; null when there is no readable time. */
  hours: number | null
  stale: boolean
}

export function sourceAges(builtAt: string, f: Freshness | undefined, now: number): SourceAge[] {
  const times: Record<SourceKey, string | null> = {
    build: builtAt,
    scopus: f?.scopus ?? null,
    openalex: f?.openalex ?? null,
    forms: f?.forms ?? null,
    scholar: f?.scholar ?? null,
    tci: f?.tci ?? null,
    crossref: f?.crossref ?? null,
  }
  return (Object.keys(SOURCE_TH) as SourceKey[]).map((key) => {
    const at = times[key]
    const t = at ? Date.parse(at) : NaN
    const hours = Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 3_600_000))
    // A watched source with no stamp at all is reported too: nothing proves it ever answered.
    const stale = WATCHED.includes(key) && (hours === null || hours > STALE_HOURS)
    return { key, at: Number.isNaN(t) ? null : at, hours, stale }
  })
}

export function ageTh(hours: number | null): string {
  if (hours === null) return 'ไม่มีบันทึก'
  if (hours < 1) return 'ไม่ถึง 1 ชั่วโมงที่แล้ว'
  if (hours < 48) return `${hours} ชั่วโมงที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}
