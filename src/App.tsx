import { useEffect, useMemo, useState } from 'react'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { evaluatePerson, toBE, type Settings } from './rules'
import type { ConferenceEntry, DataBundle, RawPub } from './types'
import { Overview } from './pages/Overview'
import { LecturersPage } from './pages/LecturersPage'
import { PersonPage } from './pages/PersonPage'
import { AdminPage } from './pages/AdminPage'
import { MyPage } from './pages/MyPage'
import { AdminGateForm, forgetAdmin, initialAdmin, type AdminLinks } from './adminGate'
import seenLogo from './assets/seen-logo.png'
import { reloadForBuild, useAutoRefresh } from './autoRefresh'
import { fetchLiveManual } from './liveManual'
import { approvedRows, dropUnapproved, fetchSubmissions, type Submission } from './submissions'
import { applyConfDecisions, fetchConfDecisions, type ConfDecisionItem } from './confDecisions'
import { fetchNotices, type Notice } from './notify'
import { BackToTop, ThemeToggle, useScrolled } from './ThemeToggle'

const data = raw as DataBundle
// Shown at the top right of the header; data.builtAt is written by scripts/build-data.mjs at build time.
const UPDATED_AT = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.builtAt))
const bundledRows = data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key))
const makePubs = (bundled: RawPub[], extra: RawPub[], conferences: ConferenceEntry[]) => preparePubs([...bundled, ...extra], data.overrides, conferences)
const CURRENT_YEAR = new Date().getFullYear()
const ANNOUNCEMENT_URL = 'https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view'
// สป.อว. page for the undergraduate announcement (link given by Tum, 2026-11-06).
const BACHELOR_ANNOUNCEMENT_URL = 'https://www.ops.go.th/th/role/edu-standard/item/6942-2022-07-22-03-17-22'

export type LecturerFilter = 'all' | 'not_met' | 'risk'
export type LecturerScope = 'all' | 'ba' | 'grad'
export type LecturerView = 'cards' | 'table'
type Route =
  | { page: 'overview' }
  | { page: 'lecturers'; filter: LecturerFilter; scope: LecturerScope; view?: LecturerView; prog?: string }
  | { page: 'person'; key: string }
  | { page: 'admin' }
  | { page: 'me'; login?: string }

/** #/lecturers link that keeps the current filter, scope and view and sets the programme. */
function lecturersHash(route: Route, prog: string): string {
  const q = new URLSearchParams()
  if (route.page === 'lecturers') {
    if (route.filter !== 'all') q.set('filter', route.filter)
    if (route.scope !== 'all') q.set('scope', route.scope)
    if (route.view) q.set('view', route.view)
  }
  if (prog) q.set('prog', prog)
  const qs = q.toString()
  return qs ? `#/lecturers?${qs}` : '#/lecturers'
}

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
    const v = q.get('view')
    return {
      page: 'lecturers',
      filter: f === 'not_met' || f === 'risk' ? f : 'all',
      scope: sc === 'ba' || sc === 'grad' ? sc : 'all',
      view: v === 'table' || v === 'cards' ? v : undefined, // &view=table opens the matrix (used by the manual's screenshots)
      prog: q.get('prog') || undefined, // &prog=<programme_id> (data/programmes.csv), 2026-11-08
    }
  }
  if (h === 'admin') return { page: 'admin' }
  // #/me, or #/me/login=<code> from the e-mail link (forwarded by /me/).
  if (h === 'me' || h.startsWith('me/')) {
    const m = h.match(/^me\/login=([0-9a-f]+)$/)
    return { page: 'me', login: m?.[1] }
  }
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
  return { year: CURRENT_YEAR, countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' }
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  // Works added through the admin form since the last build, read live from its sheet.
  const [liveRows, setLiveRows] = useState<RawPub[]>([])
  useEffect(() => {
    let on = true
    void fetchLiveManual(data.sources.manualSheetCsvUrl, data.faculty, bundledRows).then((rows) => {
      if (on && rows.length) setLiveRows(rows)
    })
    return () => {
      on = false
    }
  }, [])
  // Works lecturers added themselves (src/submissions.ts): approved ones count, pending ones are only shown.
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const refreshSubmissions = () => {
    void fetchSubmissions().then(setSubmissions)
  }
  useEffect(refreshSubmissions, [])
  const lecturerNames = useMemo(() => new Set(data.faculty.map((f) => f.nameEn)), [])
  const selfRows = useMemo(() => approvedRows(submissions, lecturerNames, bundledRows), [submissions, lecturerNames])
  // Conference decisions from the register buttons (src/confDecisions.ts), applied live.
  const [confItems, setConfItems] = useState<ConfDecisionItem[]>([])
  const refreshConf = () => {
    void fetchConfDecisions().then(setConfItems)
  }
  useEffect(refreshConf, [])
  const conferences = useMemo(() => applyConfDecisions(data.conferences ?? [], confItems), [confItems])
  // Reminder e-mails sent to lecturers (src/notify.ts): when each was last notified.
  const [notices, setNotices] = useState<Notice[]>([])
  const refreshNotices = () => {
    void fetchNotices().then(setNotices)
  }
  useEffect(refreshNotices, [])
  // Bundled self-added works withdrawn since the build are dropped (src/submissions.ts).
  const keptBundled = useMemo(() => dropUnapproved(bundledRows, submissions), [submissions])
  const pubs = useMemo(() => makePubs(keptBundled, [...liveRows, ...selfRows], conferences), [keptBundled, liveRows, selfRows, conferences])
  const scrolled = useScrolled()
  // Admin sign-in: level 1 = ข้อมูลอาจารย์ only, level 2 = also เพิ่มผลงานด้วยตนเอง (src/adminGate.tsx).
  const [admin, setAdmin] = useState<AdminLinks | null>(() => initialAdmin(data))
  const lock = data.sources.adminGate
    ? () => {
        forgetAdmin()
        setAdmin(null)
      }
    : undefined

  useEffect(() => {
    const on = () => {
      setRoute(parseHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const results = useMemo(() => data.faculty.map((f) => evaluatePerson(f, pubs, settings)), [pubs, settings])
  // Reload by itself when a newer build is published; where a passcode or e-mail may be
  // being typed, only offer it.
  const newerBuild = useAutoRefresh(data.builtAt, route.page === 'overview' || (admin !== null && (route.page === 'lecturers' || route.page === 'person')))

  const pubYears = pubs.map((p) => p.year).filter((y): y is number => y !== null)
  // Oldest year in the menu: 4 years after the oldest publication, but never more than 30 years back (a mistyped year must not flood the menu).
  const minYear = Math.max(CURRENT_YEAR - 30, Math.min(CURRENT_YEAR - 10, ...pubYears.map((y) => y + 4)))
  const years: number[] = []
  for (let y = CURRENT_YEAR + 1; y >= minYear; y--) years.push(y)

  const programmes = data.programmes ?? []
  // Level 2 only (Tum, 2026-11-08); level 1 sees every lecturer as before.
  const programme = route.page === 'lecturers' && route.prog && admin?.level === 2 ? programmes.find((p) => p.id === route.prog) : undefined

  // รายชื่ออาจารย์ (#/lecturers, #/person/…) and เพิ่มผลงานด้วยตนเอง (#/admin) share one tab (2026-11-07).
  const adminView = (route.page === 'lecturers' || route.page === 'admin' || route.page === 'person') && admin !== null
  const tab = route.page === 'lecturers' || route.page === 'person' || route.page === 'admin' ? 'admin' : route.page
  const tabs = [
    { id: 'overview', href: '#/', th: 'ภาพรวม', en: 'Overview' },
    { id: 'me', href: '#/me', th: 'ตรวจสอบคุณสมบัติของฉัน', en: 'Check my qualifications', count: undefined as number | undefined, locked: false },
    { id: 'admin', href: '#/lecturers', th: 'สำหรับผู้ดูแลระบบ', en: 'Admin', count: undefined as number | undefined, locked: admin === null },
  ]

  return (
    <>
      <a className="skip-link" href="#main">ข้ามไปที่เนื้อหา</a>
      <header className={`site-nav no-print${scrolled ? ' scrolled' : ''}`}>
        <div className="site-nav-inner">
          <a href="#/" className="nav-brand">
            <img src={seenLogo} alt="ตราสัญลักษณ์คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา (SEEN)" width={262} height={99} />
            <span className="nav-brand-text">
              <span className="nav-brand-name">ระบบตรวจสอบคุณสมบัติอาจารย์</span>
              <span className="nav-brand-sub">คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา</span>
            </span>
          </a>
          <nav className="nav-links" aria-label="หน้า">
            {tabs.map((t) => (
              <a key={t.id} href={t.href} className="nav-link" aria-current={tab === t.id ? 'page' : undefined}>
                {t.locked && <LockIcon />}
                {t.th}
              </a>
            ))}
          </nav>
          <div className="nav-tools">
            <span className="updated-at" title={data.builtAt}>
              <span className="updated-label">ข้อมูลล่าสุด</span>
              <time dateTime={data.builtAt}>{UPDATED_AT} น.</time>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="print-only print-brand">ระบบตรวจสอบคุณสมบัติอาจารย์ คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา</div>

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
          {adminView ? (
            <>
              {/* Admin tab (Tum, 2026-11-07): the view drop-down sits beside the year; range and counted-works text are hidden */}
              <label className="control" htmlFor="admin-view">
                <span className="control-label">เลือกดู</span>
                <select id="admin-view" value={route.page === 'admin' ? 'admin' : 'lecturers'} onChange={(e) => (window.location.hash = e.target.value === 'admin' ? '#/admin' : '#/lecturers')}>
                  <option value="lecturers">ข้อมูลอาจารย์</option>
                  <option value="admin">{admin?.level === 1 ? 'เพิ่มผลงานด้วยตนเอง (ผู้ดูแลระดับ 2)' : 'เพิ่มผลงานด้วยตนเอง'}</option>
                </select>
              </label>
              {route.page === 'lecturers' && admin?.level === 2 && programmes.length > 0 && (
                <label className="control" htmlFor="admin-programme">
                  <span className="control-label">หลักสูตร</span>
                  <select id="admin-programme" value={programme?.id ?? ''} onChange={(e) => (window.location.hash = lecturersHash(route, e.target.value))}>
                    <option value="">ทุกหลักสูตร (อาจารย์ทั้งหมด)</option>
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.th.replace(/^หลักสูตร\s*/, '')}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {lock && (
                <div className="control control-end">
                  <span className={`level-badge level-badge-${admin?.level}`}>{admin?.level === 1 ? 'ผู้ดูแลระดับ 1 · ดูข้อมูลอาจารย์' : 'ผู้ดูแลระดับ 2 · สิทธิ์ทั้งหมด'}</span>
                  <button type="button" className="btn" onClick={lock}>
                    ออกจากระบบผู้ดูแล
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="control">
                <span className="control-label">ช่วงผลงาน 5 ปี</span>
                <span className="control-value">
                  {toBE(settings.year - 4)}–{toBE(settings.year)} <span className="muted">({settings.year - 4}–{settings.year})</span>
                </span>
              </div>
              <div className="control">
                <span className="control-label">ผลงานที่นับ ได้แก่</span>
                <span className="control-text">วารสาร, proceedings/โปสเตอร์/บทคัดย่อในงานประชุม ที่มาจากการประชุมโดยสมาคมวิชาการหรือวิชาชีพในสาขาเกี่ยวข้องกับสิ่งแวดล้อม/พลังงาน</span>
              </div>
            </>
          )}
        </section>

        <main id="main" tabIndex={-1}>
          {route.page === 'overview' && <Overview results={results} settings={settings} />}
          {(route.page === 'lecturers' || route.page === 'admin' || route.page === 'person') && admin === null && (
            <AdminGateForm data={data} title="สำหรับผู้ดูแลระบบ" onUnlocked={setAdmin} />
          )}
          {route.page === 'lecturers' && admin !== null && (
            <LecturersPage
              key={`${route.filter}|${route.scope}|${route.view ?? ''}|${programme?.id ?? ''}`}
              results={programme ? results.filter((r) => programme.members.some((m) => m.nameEn === r.person.nameEn)) : results}
              programme={programme}
              settings={settings}
              filter={route.filter}
              scope={route.scope}
              view={route.view}
              notify={admin.level === 2 ? { approvalKey: admin.approvalKey, notices, onSent: refreshNotices } : undefined}
            />
          )}
          {route.page === 'admin' && admin !== null && admin.level === 1 && (
            <AdminGateForm
              data={data}
              title="เพิ่มผลงานด้วยตนเอง"
              needLevel={2}
              note="ส่วนนี้สำหรับผู้ดูแลระดับ 2 (เพิ่มผลงานและตัดสินงานประชุม) กรุณาใส่รหัสผู้ดูแลระดับ 2"
              onUnlocked={setAdmin}
            />
          )}
          {route.page === 'admin' && admin !== null && admin.level === 2 && (
            <AdminPage data={data} pubs={pubs} faculty={data.faculty} formUrl={admin.formUrl} submissions={submissions} onSubmissionsChanged={refreshSubmissions} approvalKey={admin.approvalKey} conferences={conferences} onConferencesChanged={refreshConf} />
          )}
          {route.page === 'person' && admin !== null && (
            <PersonPage
              result={results.find((r) => r.person.nameEn === route.key)}
              settings={settings}
              withdraw={admin.level === 2 ? { approvalKey: admin.approvalKey, submissions, onChanged: refreshSubmissions } : undefined}
              crossref={data.crossref}
            />
          )}
          {route.page === 'me' && <MyPage results={results} settings={settings} loginCode={route.login} submissions={submissions} onSubmissionsChanged={refreshSubmissions} crossref={data.crossref} />}
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
      <BackToTop />
    </>
  )
}

function LockIcon() {
  return (
    <svg className="tab-lock" viewBox="0 0 16 16" width="12" height="12" aria-label="ต้องใช้รหัสผู้ดูแล" role="img">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
