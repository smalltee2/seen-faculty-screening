// DEMO-NOTICE — TEMPORARY showcase mode (Tum, 2026-11-12). Remove this file and every line marked
// DEMO-NOTICE when Tum says the showcase is over (also delete the demo rows in the backend's
// `notices` sheet).
//
// Opened with ?demo=notice, the site keeps only DEMO_KEEP of one lecturer's works, so the real rules
// show that lecturer as failing some duties and a level-2 admin can send the "ไม่ผ่านบางหน้าที่"
// reminder for real. The e-mail's subject and first line, and a banner on every page, say it is an
// example. Without the address nothing changes: everyone else sees the real result.
import type { Pub } from './types'

export const DEMO_NAME = 'Teerachai Amnuaylojaroen'
/** Works kept for DEMO_NAME: enough for the bachelor's duties, too few for the graduate ones. */
export const DEMO_KEEP = 2
const KEY = 'seen-demo-notice'

/** Read once: ?demo=notice turns the mode on for this tab (kept across reloads), ?demo=off ends it. */
function readDemo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const v = new URLSearchParams(window.location.search).get('demo')
    if (v === 'notice') sessionStorage.setItem(KEY, '1')
    else if (v !== null) sessionStorage.removeItem(KEY)
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const ON = readDemo()
export const demoNoticeOn = () => ON

/** The works with only the `keep` newest of `name`'s (by year, then title); everyone else's stay. */
export function demoPubs(pubs: Pub[], name = DEMO_NAME, keep = DEMO_KEEP): Pub[] {
  const own = pubs.filter((p) => p.key === name).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
  const kept = new Set(own.slice(0, keep))
  return pubs.filter((p) => p.key !== name || kept.has(p))
}

/** True for the lecturer whose result is the example, while the mode is on. */
export const isDemoPerson = (nameEn: string, on = ON) => on && nameEn === DEMO_NAME

export const DEMO_SUBJECT_TAG = '[ตัวอย่าง] '
export const DEMO_BODY_LINE = '*** อีเมลตัวอย่างเพื่อสาธิตระบบ ไม่ใช่ผลการประเมินจริงของท่าน ***'

export function DemoBanner() {
  if (!ON) return null
  return (
    <div
      role="status"
      className="no-print"
      style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: '92vw', zIndex: 1000, background: '#8a4b00', color: '#fff', padding: '8px 16px', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.25)', font: '600 14px/1.5 "Noto Sans Thai", system-ui, sans-serif', textAlign: 'center' }}
    >
      โหมดสาธิต (ตัวอย่าง): ผลของ รศ.ดร.ธีรชัย อำนวยล้อเจริญ ในหน้านี้เป็นข้อมูลสมมติ นับผลงานเพียง {DEMO_KEEP} เรื่อง ไม่ใช่ผลการประเมินจริง ·{' '}
      <a href="?demo=off" style={{ color: '#fff', textDecoration: 'underline' }}>
        ออกจากโหมดสาธิต
      </a>
    </div>
  )
}
