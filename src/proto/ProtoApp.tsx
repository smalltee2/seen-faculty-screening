// App-shell prototype, design A (Tum, 2026-11-11): a fixed side menu (a bottom bar on phones), one
// page per task, and a task inbox with a list and a detail pane. It reads the same live data as the
// site (src/siteData.ts) but never writes: decisions made here stay in this browser tab.
// Local only: proto.html is not in the build input, so it is not deployed.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import raw from '../generated/data.json'
import { evaluatePerson, toBE, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { useSiteData } from '../siteData'
import { HoverSelect } from '../HoverSelect'
import { ThemeToggle } from '../ThemeToggle'
import { Overview } from '../pages/Overview'
import { LecturersPage } from '../pages/LecturersPage'
import { PersonPage } from '../pages/PersonPage'
import { HistoryTable, OutlookPage } from '../pages/AdminTools'
import { ScholarStatus, useScholarJob } from '../pages/AdminPage'
import { FreshnessPanel } from '../FreshnessPanel'
import { buildHistory } from '../history'
import { conferenceSubmissions, type SubmissionStatus } from '../submissions'
import type { ConfDecisionItem } from '../confDecisions'
import { displayName } from '../ui'
import seenLogo from '../assets/seen-logo.png'
import { Inbox, type InboxKind, type InboxShow } from './Inbox'
import { inboxItems } from './inboxItems'

const data = raw as unknown as DataBundle
const CURRENT_YEAR = new Date().getFullYear()
const UPDATED_AT = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.builtAt))

type Page = 'overview' | 'lecturers' | 'person' | 'inbox' | 'outlook' | 'sources' | 'history'
type Route = { page: Page; id?: string; query?: URLSearchParams }

export function parseProtoHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  let h: string
  try {
    h = decodeURIComponent(raw)
  } catch {
    h = raw
  }
  if (h.startsWith('person/')) return { page: 'person', id: h.slice('person/'.length) }
  if (h.startsWith('inbox/')) return { page: 'inbox', id: h.slice('inbox/'.length) }
  if (h === 'lecturers' || h.startsWith('lecturers?')) return { page: 'lecturers', query: new URLSearchParams(h.slice('lecturers'.length + 1)) }
  const plain = h as Page
  return ['inbox', 'outlook', 'sources', 'history'].includes(plain) ? { page: plain } : { page: 'overview' }
}

const NAV: { page: Page; th: string; short: string; icon: ReactNode }[] = [
  { page: 'overview', th: 'ภาพรวม', short: 'ภาพรวม', icon: <Icon d="M3 10.5 10 4l7 6.5M5 9v7h4v-4h2v4h4V9" /> },
  { page: 'lecturers', th: 'อาจารย์', short: 'อาจารย์', icon: <Icon d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c0-3 2.2-5 5-5s5 2 5 5M14 9a2.5 2.5 0 1 0 0-5M15 12c2 .4 3 2.2 3 5" /> },
  { page: 'inbox', th: 'งานรอดำเนินการ', short: 'งาน', icon: <Icon d="M3 11h4l1 2h4l1-2h4M3 11l2-7h10l2 7v5H3v-5Z" /> },
  { page: 'outlook', th: 'แนวโน้ม 1–2 ปี', short: 'แนวโน้ม', icon: <Icon d="M3 16l5-5 3 3 6-7M13 7h4v4" /> },
  { page: 'sources', th: 'แหล่งข้อมูล', short: 'ข้อมูล', icon: <Icon d="M10 3c3.9 0 7 1.1 7 2.5S13.9 8 10 8 3 6.9 3 5.5 6.1 3 10 3ZM3 5.5v9C3 15.9 6.1 17 10 17s7-1.1 7-2.5v-9M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /> },
  { page: 'history', th: 'ประวัติการตัดสิน', short: 'ประวัติ', icon: <Icon d="M3 10a7 7 0 1 0 2-4.9M3 3v3.5h3.5M10 6v4l3 2" /> },
]

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export function ProtoApp() {
  const [route, setRoute] = useState<Route>(() => parseProtoHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseProtoHash(window.location.hash))
      document.querySelector('.app-content')?.scrollTo(0, 0)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const [settings, setSettings] = useState<Settings>({ year: CURRENT_YEAR, countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' })
  // Decisions tried in the prototype: kept in this tab only, applied on top of the live ones.
  const [localConf, setLocalConf] = useState<ConfDecisionItem[]>([])
  const [localSub, setLocalSub] = useState<Record<string, SubmissionStatus>>({})
  const [toast, setToast] = useState('')
  const site = useSiteData(localConf)
  const results = useMemo(() => data.faculty.map((f) => evaluatePerson(f, site.pubs, settings)), [site.pubs, settings])

  const pendingPubs = useMemo(
    () => conferenceSubmissions(site.submissions.map((s) => ({ ...s, status: localSub[s.id] ?? s.status })), site.conferences).filter((x) => x.sub.status === 'pending').map((x) => x.pub),
    [site.submissions, site.conferences, localSub],
  )
  const items = useMemo(() => inboxItems(site.pubs, pendingPubs, site.submissions, localSub), [site.pubs, pendingPubs, site.submissions, localSub])
  const waiting = items.filter((i) => i.status === 'pending').length
  const [show, setShow] = useState<InboxShow>('pending')
  const [kind, setKind] = useState<InboxKind>('all')

  const say = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast((t) => (t === text ? '' : t)), 3500)
  }
  const decideConf = (key: string, name: string, decision: 'count' | 'no_count' | 'clear') => {
    setLocalConf((xs) => [...xs, { at: new Date().toISOString(), key, decision, by: 'ต้นแบบ (ไม่บันทึก)', note: '', name }])
    say(`${decision === 'count' ? 'นับ' : decision === 'no_count' ? 'ไม่นับ' : 'ยกเลิกการตัดสิน'}: ${name} · ต้นแบบนี้ไม่บันทึกลงระบบจริง`)
  }
  const decideSub = (id: string, status: SubmissionStatus) => {
    setLocalSub((m) => ({ ...m, [id]: status }))
    say(`${status === 'approved' ? 'อนุมัติ' : status === 'rejected' ? 'ไม่อนุมัติ' : 'ยกเลิกการตัดสิน'} · ต้นแบบนี้ไม่บันทึกลงระบบจริง`)
  }

  const scholarReal = useScholarJob(undefined) // reads the job status; no key, so it can never start one
  const scholar = { ...scholarReal, canStart: true, start: async () => say('ต้นแบบนี้ไม่สั่งอัปเดต Google Scholar จริง') }

  const history = useMemo(
    () =>
      buildHistory({
        confItems: [...site.confItems, ...localConf],
        formCancels: site.formCancels ?? [],
        submissions: site.submissions,
        decisionLog: null,
        notices: site.notices,
        nameOf: (n) => {
          const f = data.faculty.find((x) => x.nameEn === n)
          return f ? displayName(f) : n
        },
      }).map((e) => ({ ...e, undo: undefined })),
    [site.confItems, localConf, site.formCancels, site.submissions, site.notices],
  )

  const active: Page = route.page === 'person' ? 'lecturers' : route.page
  const current = NAV.find((n) => n.page === active)!
  const person = route.page === 'person' ? results.find((r) => r.person.nameEn === route.id) : undefined
  const title = route.page === 'person' ? (person ? displayName(person.person) : 'ไม่พบอาจารย์') : current.th
  const q = route.query

  return (
    <div className="app">
      <a className="skip-link" href="#app-main">
        ข้ามไปที่เนื้อหา
      </a>
      <aside className="app-side" aria-label="เมนูหลัก">
        <a href="#/" className="app-brand">
          <img src={seenLogo} alt="SEEN มหาวิทยาลัยพะเยา" width={131} height={50} />
          <span>ระบบตรวจสอบคุณสมบัติอาจารย์</span>
        </a>
        <nav className="app-nav">
          {NAV.map((n) => (
            <a key={n.page} href={n.page === 'overview' ? '#/' : `#/${n.page}`} className="app-nav-link" aria-current={active === n.page ? 'page' : undefined}>
              {n.icon}
              <span className="app-nav-label">{n.th}</span>
              <span className="app-nav-short" aria-hidden="true">
                {n.short}
              </span>
              {n.page === 'inbox' && waiting > 0 && (
                <span className="app-badge" aria-label={`${waiting} งานค้าง`}>
                  {waiting}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="app-side-foot">
          <span className="proto-tag">ต้นแบบ</span>
          <span className="muted small">ข้อมูลล่าสุด {UPDATED_AT} น.</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-top">
          <div className="app-title">
            {route.page === 'person' && (
              <a className="app-crumb" href="#/lecturers">
                อาจารย์ ›
              </a>
            )}
            <h1>{title}</h1>
            <p className="muted small">
              ช่วงผลงาน 5 ปี พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)}
            </p>
          </div>
          <div className="app-top-tools">
            <HoverSelect
              id="proto-year"
              label="ปีที่ประเมิน"
              value={String(settings.year)}
              options={[CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({ value: String(y), label: `พ.ศ. ${toBE(y)}` }))}
              onChange={(v) => setSettings({ ...settings, year: Number(v) })}
            />
            <ThemeToggle />
          </div>
        </header>

        <p className="proto-banner" role="note">
          ต้นแบบ (prototype) ใช้ข้อมูลจริงแบบอ่านอย่างเดียว · ปุ่มตัดสินและปุ่มอัปเดตในหน้านี้ไม่บันทึกลงระบบจริง
        </p>

        <main id="app-main" className={`app-content app-page-${route.page}`} tabIndex={-1}>
          {route.page === 'overview' && <Overview results={results} settings={settings} />}
          {route.page === 'lecturers' && (
            <LecturersPage
              key={q?.toString() ?? ''}
              results={results}
              settings={settings}
              filter={q?.get('filter') === 'not_met' || q?.get('filter') === 'risk' ? (q.get('filter') as 'not_met' | 'risk') : 'all'}
              scope={q?.get('scope') === 'ba' || q?.get('scope') === 'grad' ? (q.get('scope') as 'ba' | 'grad') : 'all'}
              section={q?.get('section') === 'duties' ? 'duties' : q?.get('section') === 'outputs' ? 'outputs' : undefined}
            />
          )}
          {route.page === 'person' && <PersonPage result={person} settings={settings} crossref={data.crossref} />}
          {route.page === 'inbox' && (
            <Inbox items={items} faculty={data.faculty} selectedId={route.id ?? null} show={show} kind={kind} onShow={setShow} onKind={setKind} onConf={decideConf} onSub={decideSub} />
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
                  actions={{
                    scholar: (
                      <button type="button" className="btn btn-small btn-primary source-action" onClick={() => void scholar.start()}>
                        อัปเดตจาก Google Scholar
                      </button>
                    ),
                  }}
                />
              </section>
              <ScholarStatus scholar={scholar}>
                <p className="note">การนำเข้าทีละคนอยู่ในหน้าผู้ดูแลของเว็บจริง</p>
              </ScholarStatus>
            </div>
          )}
          {route.page === 'history' && <HistoryTable entries={history} confirm={null} busy={false} onAsk={() => undefined} onUndo={() => undefined} />}
        </main>
      </div>

      {toast && (
        <div className="app-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
