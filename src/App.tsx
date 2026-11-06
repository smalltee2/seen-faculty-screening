import { useEffect, useMemo, useState } from 'react'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { evaluatePerson, toBE, type Settings } from './rules'
import type { DataBundle } from './types'
import { Overview } from './pages/Overview'
import { LecturersPage } from './pages/LecturersPage'
import { PersonPage } from './pages/PersonPage'
import { AdminPage } from './pages/AdminPage'
import seenLogo from './assets/seen-logo.png'
import { reloadForBuild, useAutoRefresh } from './autoRefresh'

const data = raw as DataBundle
// Shown at the top right of the header; data.builtAt is written by scripts/build-data.mjs at build time.
const UPDATED_AT = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.builtAt))
const pubs = preparePubs(data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key)), data.overrides)
const CURRENT_YEAR = new Date().getFullYear()
const ANNOUNCEMENT_URL = 'https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view'
// สป.อว. page for the undergraduate announcement (link given by Tum, 2026-11-06).
const BACHELOR_ANNOUNCEMENT_URL = 'https://www.ops.go.th/th/role/edu-standard/item/6942-2022-07-22-03-17-22'

export type LecturerFilter = 'all' | 'not_met' | 'risk'
export type LecturerScope = 'all' | 'ba' | 'grad'
type Route =
  | { page: 'overview' }
  | { page: 'lecturers'; filter: LecturerFilter; scope: LecturerScope }
  | { page: 'person'; key: string }
  | { page: 'admin' }

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  let h: string
  try {
    h = decodeURIComponent(raw)
  } catch {
    h = raw // a truncated or malformed link (e.g. "%E0") falls through to the overview
  }
  if (h.startsWith('person/')) return { page: 'person', key: h.slice('person/'.length) }
  if (h === 'lecturers' || h.startsWith('lecturers?')) {
    // #/lecturers?filter=not_met&scope=ba — preset filters from the overview summary links.
    const q = new URLSearchParams(h.slice('lecturers'.length + 1))
    const f = q.get('filter')
    const sc = q.get('scope')
    return {
      page: 'lecturers',
      filter: f === 'not_met' || f === 'risk' ? f : 'all',
      scope: sc === 'ba' || sc === 'grad' ? sc : 'all',
    }
  }
  if (h === 'admin') return { page: 'admin' }
  return { page: 'overview' }
}

// The site always opens on the current year; a year picked from the menu lasts only
// until the page is reloaded (decision by Tum, 2026-11-05).
function loadSettings(): Settings {
  try {
    localStorage.removeItem('seen-screening-settings') // year saved by older versions
  } catch {
    /* storage unavailable */
  }
  // Posters/abstracts always count (decision by the programme, 2026-11-05).
  return { year: CURRENT_YEAR, countPosters: true, strict: true }
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    const on = () => {
      setRoute(parseHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const results = useMemo(() => data.faculty.map((f) => evaluatePerson(f, pubs, settings)), [settings])
  // Reload by itself when a newer build is published; on the admin tab only offer it,
  // so a passcode being typed is not lost.
  const newerBuild = useAutoRefresh(data.builtAt, route.page !== 'admin')

  const pubYears = pubs.map((p) => p.year).filter((y): y is number => y !== null)
  const minYear = Math.min(CURRENT_YEAR - 10, ...pubYears.map((y) => y + 4))
  const years: number[] = []
  for (let y = CURRENT_YEAR + 1; y >= minYear; y--) years.push(y)

  const tab = route.page === 'person' ? 'lecturers' : route.page
  const tabs = [
    { id: 'overview', href: '#/', th: 'ภาพรวม', en: 'Overview' },
    { id: 'lecturers', href: '#/lecturers', th: 'รายชื่ออาจารย์', en: 'Lecturers', count: results.length },
    { id: 'admin', href: '#/admin', th: 'เพิ่มผลงาน', en: 'Add works' },
  ]

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            <span className="brand-mark">
              <img src={seenLogo} alt="ตราสัญลักษณ์คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา (SEEN)" width={262} height={99} />
            </span>
            <span className="brand-text">
              <span className="brand-name">ระบบตรวจสอบคุณสมบัติอาจารย์ คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา</span>
              <small className="brand-sub">ตามเกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี และระดับบัณฑิตศึกษา พ.ศ. 2565</small>
            </span>
          </a>
        </div>
        <nav className="tabsbar no-print" aria-label="หน้า">
          <div className="tabsbar-inner">
            {tabs.map((t) => (
              <a key={t.id} href={t.href} aria-current={tab === t.id ? 'page' : undefined}>
                {t.th}
                {t.count !== undefined && <span className="seg-count">{t.count}</span>}
              </a>
            ))}
            <div className="updated-at" title={data.builtAt}>
              <span className="updated-label">ข้อมูลล่าสุด</span>
              <time dateTime={data.builtAt}>{UPDATED_AT} น.</time>
            </div>
          </div>
        </nav>
      </header>

      <div className="page">
        {newerBuild && (
          <div className="update-banner no-print" role="status">
            <span>มีข้อมูลเวอร์ชันใหม่ ({new Date(newerBuild).toLocaleString('th-TH')})</span>
            <button type="button" className="btn btn-primary" onClick={() => reloadForBuild(newerBuild)}>
              โหลดหน้าใหม่
            </button>
          </div>
        )}
        <section className="controls no-print">
          <label className="control">
            <span className="control-label">ปีที่ประเมิน</span>
            <select id="eval-year" value={settings.year} onChange={(e) => setSettings({ ...settings, year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  พ.ศ.{toBE(y)} ({y})
                </option>
              ))}
            </select>
          </label>
          <div className="control">
            <span className="control-label">ช่วงผลงาน 5 ปี</span>
            <span className="control-value">
              {toBE(settings.year - 4)}–{toBE(settings.year)} <span className="muted">({settings.year - 4}–{settings.year})</span>
            </span>
          </div>
          <div className="control">
            <span className="control-label">ผลงานที่นับ ได้แก่</span>
            <span className="control-text">วารสาร, proceedings, โปสเตอร์/บทคัดย่อในงานประชุม</span>
          </div>
        </section>

        <main>
          {route.page === 'overview' && <Overview results={results} settings={settings} />}
          {route.page === 'lecturers' && (
            <LecturersPage key={`${route.filter}|${route.scope}`} results={results} settings={settings} filter={route.filter} scope={route.scope} />
          )}
          {route.page === 'admin' && <AdminPage data={data} pubs={pubs} faculty={data.faculty} />}
          {route.page === 'person' && <PersonPage result={results.find((r) => r.person.nameEn === route.key)} settings={settings} />}
        </main>

        <footer className="footer">
          <p>
            แหล่งเกณฑ์: ประกาศ กมอ. พ.ศ. 2565 (ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง) · เกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี ข้อ 10.1{' '}
            <a href={BACHELOR_ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
              ฉบับปริญญาตรี ↗
            </a>{' '}
            · ระดับบัณฑิตศึกษา ข้อ 9.3–9.4{' '}
            <a href={ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
              ฉบับบัณฑิตศึกษา (PDF) ↗
            </a>
          </p>
        </footer>
      </div>
    </>
  )
}
