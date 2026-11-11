// sfs_webapp.html (Tum, 2026-11-11): the site as a web app, design A. A fixed side menu (a bottom bar
// on phones), one page per task, and a task inbox with a list and a detail pane. It runs on the same
// data, sign-in and backend actions as sfs.html (src/App.tsx), which stays as it is.
//
// Who sees what is the same as on sfs.html: ภาพรวม and ของฉัน are open; อาจารย์ needs an admin
// passcode (level 1 = ประธานหลักสูตร or 2 = รองฯวิชาการ/ผู้ดูแลระบบ); the inbox, form works, sources,
// outlook and history need level 2.
// The menu lists only what the visitor may open (Tum, 2026-11-11): a lecturer sees the two open
// pages, level 1 adds ผลงานอาจารย์, level 2 sees everything. Admins sign in at #/login.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import raw from '../generated/data.json'
import { evaluatePerson, toBE, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { useSiteData } from '../siteData'
import { HoverSelect } from '../HoverSelect'
import { ThemeToggle, useScrolled } from '../ThemeToggle'
import { AdminGateForm, forgetAdmin, initialAdmin, type AdminLinks } from '../adminGate'
import { reloadForBuild, useAutoRefresh } from '../autoRefresh'
import { Overview } from '../pages/Overview'
import { LecturersPage } from '../pages/LecturersPage'
import { PersonPage } from '../pages/PersonPage'
import { MyPage } from '../pages/MyPage'
import { HistoryPage, OutlookPage } from '../pages/AdminTools'
import { FormWorks, ScholarButton, ScholarImport, ScholarStatus, useScholarJob } from '../pages/AdminPage'
import { FreshnessPanel } from '../FreshnessPanel'
import { StackedChartsContext } from '../charts'
import { conferenceSubmissions } from '../submissions'
import { outlook } from '../outlook'
import { groupNewWorks, newWorkId, unseen } from '../newWorks'
import { useSeenNew } from './seenNew'
import { PATTERNS, patternUrl, type PatternId } from './topPatterns'
import { APP_THEMES, APP_THEME_IDS, ThemePicker, themeUrl, type AppThemeId } from './appThemes'
import { SHOWN_ROLES, displayName } from '../ui'
import seenLogo from '../assets/seen-logo.png'
import { Inbox, type InboxKind, type InboxShow } from './Inbox'
import { inboxItems } from './inboxItems'
import { SeenIcon, type IconKey } from './iconSets'
import { useStoredChoice } from './storedChoice'
import { labelTables } from './tableLabels'

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
const NAV: { page: IconKey; th: string; short: string; level: 0 | 1 | 2 }[] = [
  { page: 'overview', th: 'ภาพรวม', short: 'ภาพรวม', level: 0 },
  { page: 'me', th: 'ตรวจสอบคุณสมบัติของฉัน', short: 'ของฉัน', level: 0 },
  { page: 'lecturers', th: 'ผลงานอาจารย์', short: 'ผลงาน อ.', level: 1 },
  { page: 'inbox', th: 'งานรอดำเนินการ', short: 'งาน', level: 2 },
  { page: 'forms', th: 'เพิ่มผลงานด้วยตัวเอง', short: 'เพิ่มผลงาน', level: 2 },
  { page: 'outlook', th: 'แนวโน้ม 1–2 ปี', short: 'แนวโน้ม', level: 2 },
  { page: 'sources', th: 'แหล่งข้อมูล', short: 'ข้อมูล', level: 2 },
  { page: 'history', th: 'ประวัติการตัดสิน', short: 'ประวัติ', level: 2 },
]

export function WebApp() {
  const [route, setRoute] = useState<Route>(() => parseWebAppHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseWebAppHash(window.location.hash))
      window.scrollTo(0, 0)
      // On desktop the content card scrolls by itself (Gmail-like layout); start each page at its top.
      document.getElementById('app-main')?.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Phones show data tables as cards; label every cell with its column header, now and whenever
  // React adds rows (src/webapp/tableLabels.ts).
  useEffect(() => {
    const root = document.getElementById('app-main')
    if (!root) return
    let queued = 0
    const run = () => {
      queued = 0
      labelTables(root)
    }
    run()
    // A short timer, not requestAnimationFrame: that one pauses in a background tab, which would
    // leave a page switched there unlabelled until the tab is shown.
    const mo = new MutationObserver(() => {
      if (!queued) queued = window.setTimeout(run, 30)
    })
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      if (queued) window.clearTimeout(queued)
    }
  }, [])

  // The year menu offers this year and next year, as on sfs.html; the page always opens on this year.
  const scrolled = useScrolled()
  // Trial of a background pattern in the top bar (Tum, 2026-11-11): sfs_webapp.html?topbg=leaves …
  // shows it for that visit only; without the parameter the bar stays plain.
  const topBg = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('topbg')
    return PATTERNS.some((p) => p.id === v) ? (v as PatternId) : null
  }, [])
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
  // Counts beside the menu items, like an inbox's unread count (Tum, 2026-11-11). Orange = needs
  // attention, green = new since the last week. Only pages the visitor may open are listed anyway.
  const notFullyMet = useMemo(() => results.filter((r) => !SHOWN_ROLES.every((x) => r.roles[x.id].status === 'met')).length, [results])
  const atRisk = useMemo(() => (level === 2 ? outlook(results, settings, 2, SHOWN_ROLES).length : 0), [results, settings, level])
  // Green counts are works not opened yet in this browser (Tum: "หายเมื่อเปิดดู"); opening a source's
  // list in แหล่งข้อมูl, or the form-works page, marks them as seen.
  const NEW_SRC = ['openalex', 'scopus', 'forms', 'scholar'] as const
  const newIds = useMemo(() => NEW_SRC.flatMap((src) => groupNewWorks(data.newWorks?.[src]).map(newWorkId)), [])
  const [seenNew, markSeen] = useSeenNew(newIds)
  const newCount = (src: (typeof NEW_SRC)[number]) => unseen(groupNewWorks(data.newWorks?.[src]), seenNew).length
  const newInSources = new Set(NEW_SRC.flatMap((src) => unseen(groupNewWorks(data.newWorks?.[src]), seenNew).map(newWorkId))).size
  useEffect(() => {
    if (route.page === 'forms') markSeen(groupNewWorks(data.newWorks?.forms).map(newWorkId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page])
  const navCounts: Partial<Record<Page, { n: number; tone: 'alert' | 'info'; label: string }>> = {
    lecturers: { n: notFullyMet, tone: 'alert', label: `อาจารย์ที่ยังไม่ผ่านบางหน้าที่ ${notFullyMet} คน` },
    inbox: { n: waiting, tone: 'alert', label: `งานรอดำเนินการ ${waiting} รายการ` },
    forms: { n: newCount('forms'), tone: 'info', label: `ผลงานใหม่จากแบบฟอร์มที่ยังไม่ได้เปิดดู ${newCount('forms')} เรื่อง` },
    outlook: { n: atRisk, tone: 'alert', label: `อาจารย์ที่อาจไม่ผ่านใน 1–2 ปี ${atRisk} คน` },
    sources: { n: newInSources, tone: 'info', label: `ผลงานใหม่ที่ยังไม่ได้เปิดดู ${newInSources} เรื่อง` },
  }
  const countOf = (p: Page) => {
    const c = navCounts[p]
    return c && c.n > 0 ? c : null
  }
  const navCount = (page: Page) => {
    const c = countOf(page)
    return c ? (
      <span className={`app-count app-count-${c.tone}`} title={c.label}>
        <span aria-hidden="true">{c.n}</span>
        <span className="sr-only">{c.label}</span>
      </span>
    ) : null
  }
  const [show, setShow] = useState<InboxShow>('pending')
  // Side menu shown or hidden (Tum, 2026-11-11), kept per browser.
  const [nav, setNav] = useStoredChoice('seen-webapp-nav', 'shown', ['shown', 'hidden'] as const)
  // Picture theme, as in Gmail (Tum, 2026-11-11); remembered in this browser, none by default.
  const [themeId, setThemeId] = useStoredChoice<AppThemeId>('seen-webapp-theme', 'none', APP_THEME_IDS)
  const picTheme = APP_THEMES.find((t) => t.id === themeId)
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
  // Phones: the bottom bar holds at most 5 slots (Tum, 2026-11-11). With more pages, the first 4 stay
  // in the bar and the rest open from a "เพิ่มเติม" sheet; the side menu on larger screens lists all.
  const PHONE_SLOTS = 5
  const extraNav = visibleNav.length > PHONE_SLOTS ? visibleNav.slice(PHONE_SLOTS - 1) : []
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => setMoreOpen(false), [route])
  useEffect(() => {
    if (!moreOpen) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [moreOpen])
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
    <div
      className={`app${nav === 'hidden' ? ' app-nav-hidden' : ''}${picTheme ? ` app-pictured app-pictured-${picTheme.tone}` : ''}`}
      style={picTheme ? ({ '--app-picture': themeUrl(picTheme) } as CSSProperties) : undefined}
    >
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
            <a
              key={n.page}
              href={n.page === 'overview' ? '#/' : `#/${n.page}`}
              className={`app-nav-link${n.level > 0 ? ' app-nav-admin' : ''}${extraNav.includes(n) ? ' app-nav-extra' : ''}`}
              aria-current={active === n.page ? 'page' : undefined}
            >
              {/* SEEN icons (Tum, 2026-11-11): style A (leaf outline) in the side menu, style C (solid) in the phone bar. */}
              <span className="app-icon app-icon-side">
                <SeenIcon name={n.page} style="leaf" size={22} />
              </span>
              <span className="app-icon app-icon-phone">
                <SeenIcon name={n.page} style="solid" size={22} />
              </span>
              <span className="app-nav-label">{n.th}</span>
              <span className="app-nav-short" aria-hidden="true">
                {n.short}
              </span>
              {navCount(n.page)}
            </a>
          ))}
          {extraNav.length > 0 && (
            <button
              type="button"
              className="app-nav-link app-nav-more"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls="app-more"
              aria-current={extraNav.some((n) => n.page === active) ? 'page' : undefined}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <span className="app-icon app-icon-phone">
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <circle cx="5" cy="12" r="2.2" />
                  <circle cx="12" cy="12" r="2.2" />
                  <circle cx="19" cy="12" r="2.2" fill="var(--icon-accent)" />
                </svg>
              </span>
              <span className="app-nav-short">เพิ่มเติม</span>
              {extraNav.some((n) => countOf(n.page)) && <span className="app-count-dot" aria-label="มีรายการใหม่หรือคงค้างในเมนูเพิ่มเติม" />}
            </button>
          )}
        </nav>
        {/* The data time stays at the foot of the side menu (Tum, 2026-11-11). */}
        <div className="app-side-foot">
          <span className="muted small">
            ข้อมูลล่าสุด <time dateTime={data.builtAt}>{UPDATED_AT} น.</time>
          </span>
        </div>
      </aside>
      {moreOpen && extraNav.length > 0 && (
        <>
          <div className="app-more-backdrop" onClick={() => setMoreOpen(false)} />
          <div id="app-more" className="app-more" role="dialog" aria-modal="true" aria-label="เมนูเพิ่มเติม">
            <div className="app-more-head">
              <b>เมนูเพิ่มเติม</b>
              <button type="button" className="icon-btn" aria-label="ปิดเมนูเพิ่มเติม" onClick={() => setMoreOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="เมนูเพิ่มเติม">
              {extraNav.map((n) => (
                <a key={n.page} href={`#/${n.page}`} className="app-more-link" aria-current={active === n.page ? 'page' : undefined}>
                  <SeenIcon name={n.page} style="solid" size={26} />
                  <span>{n.th}</span>
                  {navCount(n.page)}
                </a>
              ))}
            </nav>
          </div>
        </>
      )}
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
        {/* Top bar, style A (Tum, 2026-11-11): on the page background, no band; a line and shadow
            appear only once the page is scrolled. A small trail above the title, the 5-year window
            as a chip, and the menus as round chips. */}
        <header className={`app-top no-print${scrolled ? ' app-top-scrolled' : ''}${route.page === 'lecturers' && level === 2 && programmes.length > 0 ? ' app-top-many' : ''}`}>
          {topBg && (
            <div
              className="app-top-pattern"
              aria-hidden="true"
              style={{ '--pat-light': patternUrl(topBg, false), '--pat-dark': patternUrl(topBg, true) } as CSSProperties}
            />
          )}
          <div className="app-title">
            {/* Trail removed (Tum, 2026-11-11); a lecturer's page keeps a link back to the list. */}
            {route.page === 'person' && (
              <a className="app-crumb" href="#/lecturers">
                ‹ ผลงานอาจารย์
              </a>
            )}
            <div className="app-title-row">
              <h1>{title}</h1>
              <span className="app-window-chip" title={`ช่วงผลงาน 5 ปี ค.ศ. ${settings.year - 4}–${settings.year}`}>
                <span className="app-window-word">ช่วงผลงาน</span>พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)}
              </span>
            </div>
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
            {/* Sign-in status and sign-out, moved from the side menu (Tum, 2026-11-11). */}
            <div className="app-top-account">
              {admin && lock ? (
                <>
                  <span className={`level-badge level-badge-${admin.level}`}>{LEVEL_TH[admin.level]}</span>
                  <button type="button" className="btn btn-small" onClick={lock}>
                    ออกจากระบบผู้ดูแล
                  </button>
                </>
              ) : (
                !admin && (
                  <a className="btn btn-small" href="#/login">
                    เข้าสู่ระบบผู้ดูแล
                  </a>
                )
              )}
            </div>
            <ThemePicker value={themeId} onChange={setThemeId} />
            <ThemeToggle />
            {/* Phones show sign-in and sign-out as an icon here instead (CSS shows it ≤760 px). */}
            {admin && lock ? (
              <button type="button" className="icon-btn app-top-admin" onClick={lock} aria-label="ออกจากระบบผู้ดูแล" title="ออกจากระบบผู้ดูแล">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10" />
                </svg>
              </button>
            ) : (
              !admin && (
                <a className="icon-btn app-top-admin" href="#/login" aria-label="เข้าสู่ระบบผู้ดูแล" title="เข้าสู่ระบบผู้ดูแล">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="15" r="4" />
                    <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
                  </svg>
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

        <StackedChartsContext.Provider value>
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
                      newWorks={data.newWorks}
                      seen={seenNew}
                      onOpen={(src) => markSeen(groupNewWorks(data.newWorks?.[src as (typeof NEW_SRC)[number]]).map(newWorkId))}
                      nameOf={(k) => { const f = data.faculty.find((x) => x.nameEn === k); return f ? displayName(f) : k }}
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
          {/* Inside the content card, so on desktop it scrolls with the page content. */}
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
        </main>
        </StackedChartsContext.Provider>
      </div>
    </div>
  )
}
