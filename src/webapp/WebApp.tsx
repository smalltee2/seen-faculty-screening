// sfs_webapp.html (Tum, 2026-11-11): the site as a web app, design A. A fixed side menu (a bottom bar
// on phones), one page per task, and a task inbox with a list and a detail pane. It runs on the same
// data, sign-in and backend actions as sfs.html (src/App.tsx), which stays as it is.
//
// Who sees what is the same as on sfs.html: ภาพรวม and ของฉัน are open; อาจารย์ needs an admin
// passcode (level 1 = ประธานหลักสูตร or 2 = รองฯวิชาการ/ผู้ดูแลระบบ); the inbox, form works, sources,
// outlook and history need level 2.
// The menu lists only what the visitor may open (Tum, 2026-11-11): a lecturer sees the two open
// pages, level 1 adds ผลงานอาจารย์, level 2 sees everything. Admins sign in at #/login.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import raw from '../generated/data.json'
import { evaluatePerson, toBE, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { useSiteData } from '../siteData'
import { HoverSelect } from '../HoverSelect'
import { ThemeToggle } from '../ThemeToggle'
import { AdminGateForm, forgetAdmin, initialAdmin, type AdminLinks } from '../adminGate'
import { reloadForBuild, useAutoRefresh } from '../autoRefresh'
import { Overview } from '../pages/Overview'
import { LecturersPage } from '../pages/LecturersPage'
import { PersonPage } from '../pages/PersonPage'
import { MyPage } from '../pages/MyPage'
import { HistoryPage, OutlookPage } from '../pages/AdminTools'
import { FormWorks, ScholarButton, ScholarImport, ScholarStatus, useScholarJob } from '../pages/AdminPage'
import { FreshnessPanel } from '../FreshnessPanel'
import { conferenceSubmissions } from '../submissions'
import { displayName } from '../ui'
import seenLogo from '../assets/seen-logo.png'
import { Inbox, type InboxKind, type InboxShow } from './Inbox'
import { inboxItems } from './inboxItems'
import { useStoredChoice } from './storedChoice'

const data = raw as unknown as DataBundle
const CURRENT_YEAR = new Date().getFullYear()
const UPDATED_AT = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.builtAt))
const ANNOUNCEMENT_URL = 'https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view'
/** What the two admin levels are called on this page (Tum, 2026-11-11); sfs.html keeps "ผู้ดูแลระดับ 1/2". */
export const LEVEL_TH = { 1: 'ประธานหลักสูตร', 2: 'รองฯวิชาการ/ผู้ดูแลระบบ' } as const
const BACHELOR_ANNOUNCEMENT_URL = 'https://www.ops.go.th/th/role/edu-standard/item/6942-2022-07-22-03-17-22'

type Page = 'overview' | 'me' | 'lecturers' | 'person' | 'inbox' | 'forms' | 'outlook' | 'sources' | 'history' | 'login'
type Route = { page: Page; id?: string; query?: URLSearchParams; login?: string }

/** Hash routes; the overview, lecturer and person links are the same as on sfs.html. */
export function parseWebAppHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  let h: string
  try {
    h = decodeURIComponent(raw)
  } catch {
    h = raw // a truncated or malformed link falls through to the overview
  }
  if (h.startsWith('person/')) return { page: 'person', id: h.slice('person/'.length) }
  if (h.startsWith('inbox/')) return { page: 'inbox', id: h.slice('inbox/'.length) }
  if (h === 'lecturers' || h.startsWith('lecturers?')) return { page: 'lecturers', query: new URLSearchParams(h.slice('lecturers'.length + 1)) }
  if (h === 'me' || h.startsWith('me/')) return { page: 'me', login: h.match(/^me\/login=([0-9a-f]+)$/)?.[1] }
  // Old sfs.html admin links land on the matching page here.
  if (h === 'admin') return { page: 'inbox' }
  if (h === 'admin/history') return { page: 'history' }
  if (h === 'admin/outlook') return { page: 'outlook' }
  const plain = h as Page
  return ['inbox', 'forms', 'outlook', 'sources', 'history', 'login'].includes(plain) ? { page: plain } : { page: 'overview' }
}

/** Pages and the admin level each needs (0 = open to everyone). */
const NAV: { page: Page; th: string; short: string; level: 0 | 1 | 2; icon: ReactNode }[] = [
  { page: 'overview', th: 'ภาพรวม', short: 'ภาพรวม', level: 0, icon: <Icon d="M3 10.5 10 4l7 6.5M5 9v7h4v-4h2v4h4V9" /> },
  { page: 'me', th: 'ตรวจสอบคุณสมบัติของฉัน', short: 'ของฉัน', level: 0, icon: <Icon d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /> },
  { page: 'lecturers', th: 'ผลงานอาจารย์', short: 'ผลงาน อ.', level: 1, icon: <Icon d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c0-3 2.2-5 5-5s5 2 5 5M14 9a2.5 2.5 0 1 0 0-5M15 12c2 .4 3 2.2 3 5" /> },
  { page: 'inbox', th: 'งานรอดำเนินการ', short: 'งาน', level: 2, icon: <Icon d="M3 11h4l1 2h4l1-2h4M3 11l2-7h10l2 7v5H3v-5Z" /> },
  { page: 'forms', th: 'เพิ่มผลงานด้วยตัวเอง', short: 'เพิ่มผลงาน', level: 2, icon: <Icon d="M6 3h6l4 4v10H6V3Zm6 0v4h4M8 11h6M8 14h4" /> },
  { page: 'outlook', th: 'แนวโน้ม 1–2 ปี', short: 'แนวโน้ม', level: 2, icon: <Icon d="M3 16l5-5 3 3 6-7M13 7h4v4" /> },
  { page: 'sources', th: 'แหล่งข้อมูล', short: 'ข้อมูล', level: 2, icon: <Icon d="M10 3c3.9 0 7 1.1 7 2.5S13.9 8 10 8 3 6.9 3 5.5 6.1 3 10 3ZM3 5.5v9C3 15.9 6.1 17 10 17s7-1.1 7-2.5v-9M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /> },
  { page: 'history', th: 'ประวัติการตัดสิน', short: 'ประวัติ', level: 2, icon: <Icon d="M3 10a7 7 0 1 0 2-4.9M3 3v3.5h3.5M10 6v4l3 2" /> },
]

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export function WebApp() {
  const [route, setRoute] = useState<Route>(() => parseWebAppHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseWebAppHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // The year menu offers this year and next year, as on sfs.html; the page always opens on this year.
  const [settings, setSettings] = useState<Settings>({ year: CURRENT_YEAR, countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' })
  const site = useSiteData()
  const results = useMemo(() => data.faculty.map((f) => evaluatePerson(f, site.pubs, settings)), [site.pubs, settings])

  const [admin, setAdmin] = useState<AdminLinks | null>(() => initialAdmin(data))
  const level = admin?.level ?? 0
  const lock = data.sources.adminGate
    ? () => {
        forgetAdmin()
        setAdmin(null)
      }
    : undefined
  const newerBuild = useAutoRefresh(data.builtAt, route.page === 'overview' || (admin !== null && (route.page === 'lecturers' || route.page === 'person')))

  const pendingPubs = useMemo(
    () => conferenceSubmissions(site.submissions, site.conferences).filter((x) => x.sub.status === 'pending').map((x) => x.pub),
    [site.submissions, site.conferences],
  )
  const items = useMemo(() => inboxItems(site.pubs, pendingPubs, site.submissions), [site.pubs, pendingPubs, site.submissions])
  const waiting = items.filter((i) => i.status === 'pending').length
  const [show, setShow] = useState<InboxShow>('pending')
  // Side menu shown or hidden (Tum, 2026-11-11), kept per browser.
  const [nav, setNav] = useStoredChoice('seen-webapp-nav', 'shown', ['shown', 'hidden'] as const)
  const [kind, setKind] = useState<InboxKind>('all')
  const scholar = useScholarJob(admin?.level === 2 ? admin.approvalKey : undefined)

  const programmes = data.programmes ?? []
  const progId = route.page === 'lecturers' && level === 2 ? route.query?.get('prog') ?? '' : ''
  const programme = programmes.find((p) => p.id === progId)
  const lecturersHash = (prog: string) => {
    const q = new URLSearchParams(route.query)
    if (prog) q.set('prog', prog)
    else q.delete('prog')
    const qs = q.toString()
    return qs ? `#/lecturers?${qs}` : '#/lecturers'
  }

  const visibleNav = NAV.filter((n) => level >= n.level)
  const active: Page = route.page === 'person' ? 'lecturers' : route.page
  const current = NAV.find((n) => n.page === active) ?? { page: 'login' as const, th: 'เข้าสู่ระบบผู้ดูแล', level: 1 as const }
  const person = route.page === 'person' ? results.find((r) => r.person.nameEn === route.id) : undefined
  const title = route.page === 'person' ? (person ? displayName(person.person) : 'ไม่พบอาจารย์') : current.th
  const need = route.page === 'person' || route.page === 'login' ? 1 : current.level
  const allowed = level >= need
  // Signed in at #/login: go on to the first admin page of that level.
  useEffect(() => {
    if (route.page === 'login' && admin) window.location.hash = admin.level === 2 ? '#/inbox' : '#/lecturers'
  }, [route.page, admin])
  const q = route.query
  const approvalKey = admin?.level === 2 ? admin.approvalKey : undefined

  return (
    <div className={`app${nav === 'hidden' ? ' app-nav-hidden' : ''}`}>
      <a className="skip-link" href="#app-main">
        ข้ามไปที่เนื้อหา
      </a>
      <aside id="app-side" className="app-side no-print" aria-label="เมนูหลัก">
        <a href="#/" className="app-brand">
          <img src={seenLogo} alt="ตราสัญลักษณ์คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา (SEEN)" width={131} height={50} />
          <span>ระบบตรวจสอบคุณสมบัติอาจารย์</span>
        </a>
        <nav className="app-nav">
          {visibleNav.map((n) => (
            <a key={n.page} href={n.page === 'overview' ? '#/' : `#/${n.page}`} className={`app-nav-link${n.level > 0 ? ' app-nav-admin' : ''}`} aria-current={active === n.page ? 'page' : undefined}>
              {n.icon}
              <span className="app-nav-label">{n.th}</span>
              <span className="app-nav-short" aria-hidden="true">
                {n.short}
              </span>
              {n.page === 'inbox' && level === 2 && waiting > 0 && (
                <span className="app-badge" aria-label={`${waiting} งานค้าง`}>
                  {waiting}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="app-side-foot">
          {admin && lock ? (
            <>
              <span className={`level-badge level-badge-${admin.level}`}>{LEVEL_TH[admin.level]}</span>
              <button type="button" className="btn btn-small" onClick={lock}>
                ออกจากระบบผู้ดูแล
              </button>
            </>
          ) : (
            <a className="btn btn-small" href="#/login">
              เข้าสู่ระบบผู้ดูแล
            </a>
          )}
          <span className="muted small">ข้อมูลล่าสุด {UPDATED_AT} น.</span>
        </div>
      </aside>
      {/* A tab on the menu's edge hides or shows it (computers and tablets; phones use the bottom bar). */}
      <button
        type="button"
        className="app-nav-tab no-print"
        aria-controls="app-side"
        aria-expanded={nav === 'shown'}
        aria-label={nav === 'shown' ? 'ซ่อนเมนูด้านข้าง' : 'แสดงเมนูด้านข้าง'}
        onClick={() => setNav(nav === 'shown' ? 'hidden' : 'shown')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {nav === 'shown' ? <path d="M10 3.5 5.5 8l4.5 4.5" /> : <path d="M6 3.5 10.5 8 6 12.5" />}
        </svg>
        <span className="app-nav-tip" aria-hidden="true">
          {nav === 'shown' ? 'ซ่อนเมนูด้านข้าง' : 'แสดงเมนูด้านข้าง'}
        </span>
      </button>

      <div className="app-main">
        <header className="app-top no-print">
          <div className="app-title">
            {route.page === 'person' && (
              <a className="app-crumb" href="#/lecturers">
                ผลงานอาจารย์ ›
              </a>
            )}
            <h1>{title}</h1>
            <p className="muted small">
              ช่วงผลงาน 5 ปี พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} ({settings.year - 4}–{settings.year})
            </p>
          </div>
          <div className="app-top-tools">
            {route.page === 'lecturers' && level === 2 && programmes.length > 0 && (
              <HoverSelect
                id="app-programme"
                label="หลักสูตร"
                value={programme?.id ?? ''}
                options={[{ value: '', label: 'ทุกหลักสูตร' }, ...programmes.map((p) => ({ value: p.id, label: p.th.replace(/^หลักสูตร\s*/, '') }))]}
                onChange={(v) => (window.location.hash = lecturersHash(v))}
              />
            )}
            <HoverSelect
              id="app-year"
              label="ปีที่ประเมิน"
              value={String(settings.year)}
              options={[CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({ value: String(y), label: `พ.ศ. ${toBE(y)}` }))}
              onChange={(v) => setSettings({ ...settings, year: Number(v) })}
            />
            <ThemeToggle />
            {/* Phones have no side-menu footer, so sign-in and sign-out sit here (CSS shows it ≤760 px). */}
            {admin && lock ? (
              <button type="button" className="btn btn-small app-top-admin" onClick={lock}>
                ออกจากระบบ
              </button>
            ) : (
              !admin && (
                <a className="btn btn-small app-top-admin" href="#/login">
                  ผู้ดูแล
                </a>
              )
            )}
          </div>
        </header>

        {newerBuild && (
          <div className="update-banner app-update no-print" role="status">
            <span>มีข้อมูลเวอร์ชันใหม่ ({new Date(newerBuild).toLocaleString('th-TH')})</span>
            <button type="button" className="btn btn-primary btn-small" onClick={() => reloadForBuild(newerBuild)}>
              โหลดหน้าใหม่
            </button>
          </div>
        )}

        <main id="app-main" className={`app-content app-page-${allowed ? route.page : 'gate'}`} tabIndex={-1}>
          {!allowed ? (
            <AdminGateForm
              data={data}
              title={route.page === 'login' ? 'เข้าสู่ระบบผู้ดูแล' : title}
              needLevel={need === 2 ? 2 : 1}
              note={need === 2 && admin?.level === 1 ? `หน้านี้สำหรับ${LEVEL_TH[2]} กรุณาใส่รหัสของ${LEVEL_TH[2]}` : undefined}
              onUnlocked={setAdmin}
            />
          ) : (
            <>
              {route.page === 'overview' && <Overview results={results} settings={settings} />}
              {route.page === 'me' && <MyPage approverTh={LEVEL_TH[2]} results={results} settings={settings} loginCode={route.login} submissions={site.submissions} onSubmissionsChanged={site.refreshSubmissions} crossref={data.crossref} />}
              {route.page === 'lecturers' && (
                <LecturersPage
                  key={`${q?.toString() ?? ''}`}
                  results={programme ? results.filter((r) => programme.members.some((m) => m.nameEn === r.person.nameEn)) : results}
                  programme={programme}
                  settings={settings}
                  filter={q?.get('filter') === 'not_met' || q?.get('filter') === 'risk' ? (q.get('filter') as 'not_met' | 'risk') : 'all'}
                  scope={q?.get('scope') === 'ba' || q?.get('scope') === 'grad' ? (q.get('scope') as 'ba' | 'grad') : 'all'}
                  view={q?.get('view') === 'table' || q?.get('view') === 'cards' ? (q.get('view') as 'table' | 'cards') : undefined}
                  section={q?.get('section') === 'duties' ? 'duties' : q?.get('section') === 'outputs' ? 'outputs' : undefined}
                  notify={approvalKey ? { approvalKey, notices: site.notices, onSent: site.refreshNotices } : undefined}
                />
              )}
              {route.page === 'person' && (
                <PersonPage result={person} settings={settings} withdraw={approvalKey ? { approvalKey, submissions: site.submissions, onChanged: site.refreshSubmissions } : undefined} crossref={data.crossref} />
              )}
              {route.page === 'inbox' && (
                <Inbox
                  items={items}
                  faculty={data.faculty}
                  selectedId={route.id ?? null}
                  show={show}
                  kind={kind}
                  onShow={setShow}
                  onKind={setKind}
                  approvalKey={approvalKey}
                  onConfChanged={site.refreshConf}
                  onSubChanged={site.refreshSubmissions}
                />
              )}
              {route.page === 'forms' && admin && (
                <FormWorks pubs={site.pubs} faculty={data.faculty} formUrl={admin.formUrl} approvalKey={approvalKey} formCancelled={[...site.cancelled.values()]} onFormChanged={site.refreshFormCancels} />
              )}
              {route.page === 'outlook' && <OutlookPage results={results} settings={settings} />}
              {route.page === 'sources' && (
                <div className="sources-page">
                  <section className="panel">
                    <h3>แหล่งข้อมูล</h3>
                    <FreshnessPanel
                      builtAt={data.builtAt}
                      freshness={data.freshness}
                      counts={{
                        openalex: data.publications.filter((p) => p.source === 'openalex').length,
                        scopus: data.publications.filter((p) => p.source === 'scopus').length,
                        forms: data.publications.filter((p) => p.source === 'manual').length,
                        scholar: data.publications.filter((p) => (p.source ?? 'scholar') === 'scholar').length,
                      }}
                      actions={{ scholar: <ScholarButton scholar={scholar} /> }}
                    />
                    <p className="note">รวมรายการซ้ำจากหลายแหล่งด้วย DOI หรือชื่อเรื่อง · Google Scholar ดึงอัตโนมัติไม่ได้ จึงให้{LEVEL_TH[2]}กด "อัปเดตจาก Google Scholar" เป็นครั้งคราว</p>
                  </section>
                  <ScholarStatus scholar={scholar}>
                    <ScholarImport faculty={data.faculty} pubs={site.pubs} raw={data.publications} items={site.scholarItems} approvalKey={approvalKey} onChanged={site.refreshScholar} />
                  </ScholarStatus>
                </div>
              )}
              {route.page === 'history' && (
                <HistoryPage
                  confItems={site.confItems}
                  formCancels={site.formCancels ?? []}
                  submissions={site.submissions}
                  notices={site.notices}
                  faculty={data.faculty}
                  approvalKey={approvalKey}
                  onChanged={() => Promise.all([site.refreshConf(), site.refreshSubmissions(), site.refreshFormCancels()])}
                />
              )}
            </>
          )}
        </main>

        <footer className="app-footer">
          แหล่งเกณฑ์: ประกาศ กมอ. พ.ศ. 2565 · ปริญญาตรี ข้อ 10.1{' '}
          <a href={BACHELOR_ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
            ฉบับปริญญาตรี ↗
          </a>{' '}
          · บัณฑิตศึกษา ข้อ 9.3–9.4{' '}
          <a href={ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
            ฉบับบัณฑิตศึกษา (PDF) ↗
          </a>
        </footer>
      </div>
    </div>
  )
}
