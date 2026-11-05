import { useEffect, useMemo, useState } from 'react'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { evaluatePerson, toBE, type Settings } from './rules'
import type { DataBundle } from './types'
import { Overview } from './pages/Overview'
import { LecturersPage } from './pages/LecturersPage'
import { PersonPage } from './pages/PersonPage'
import { AdminPage } from './pages/AdminPage'

const data = raw as DataBundle
const pubs = preparePubs(data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key)), data.overrides)
const CURRENT_YEAR = new Date().getFullYear()
const ANNOUNCEMENT_URL = 'https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view'

type Route = { page: 'overview' } | { page: 'lecturers' } | { page: 'person'; key: string } | { page: 'admin' }

function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  if (h.startsWith('person/')) return { page: 'person', key: h.slice('person/'.length) }
  if (h === 'lecturers') return { page: 'lecturers' }
  if (h === 'admin') return { page: 'admin' }
  return { page: 'overview' }
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('seen-screening-settings') ?? 'null')
    if (s && Number.isInteger(s.year)) return { year: s.year, countPosters: true, strict: true }
  } catch {
    /* storage unavailable: use defaults */
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
  useEffect(() => {
    try {
      localStorage.setItem('seen-screening-settings', JSON.stringify(settings))
    } catch {
      /* ignore */
    }
  }, [settings])

  const results = useMemo(() => data.faculty.map((f) => evaluatePerson(f, pubs, settings)), [settings])

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
            <span className="brand-name">
              SEEN<span>·</span>Qualify Screening
            </span>
            <small>ตามเกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565</small>
          </a>
          <nav className="seg no-print" aria-label="หน้า">
            {tabs.map((t) => (
              <a key={t.id} href={t.href} aria-current={tab === t.id ? 'page' : undefined}>
                {t.th}
                {t.count !== undefined && <span className="seg-count">{t.count}</span>}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="page">
        <section className="controls no-print">
          <label className="control">
            <span className="control-label">ปีที่ประเมิน</span>
            <select id="eval-year" value={settings.year} onChange={(e) => setSettings({ ...settings, year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {toBE(y)} · ค.ศ. {y}
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
            <span className="control-label">ผลงานที่นับ</span>
            <span className="control-text">วารสาร · proceedings · โปสเตอร์/บทคัดย่อในงานประชุม</span>
          </div>
        </section>

        <main>
          {route.page === 'overview' && <Overview results={results} settings={settings} />}
          {route.page === 'lecturers' && <LecturersPage results={results} settings={settings} />}
          {route.page === 'admin' && <AdminPage data={data} pubs={pubs} faculty={data.faculty} />}
          {route.page === 'person' && <PersonPage result={results.find((r) => r.person.nameEn === route.key)} settings={settings} />}
        </main>

        <footer className="footer">
          <p>
            แหล่งเกณฑ์: ประกาศคณะกรรมการมาตรฐานการอุดมศึกษา เรื่อง เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565 (ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง,
            9 กันยายน 2565) ข้อ 9.3–9.4 (ปริญญาโท และปริญญาเอก) ·{' '}
            <a href={ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
              ฉบับเต็ม (PDF, สป.อว.)
            </a>
          </p>
          <p className="disclaimer">
            ผลการคัดกรองนี้คำนวณอัตโนมัติจากข้อมูล Google Scholar ต้องตรวจสอบกับฐานข้อมูลผลงานอย่างเป็นทางการก่อนนำไปใช้ในเอกสารทางราชการ (The screening is automated from
            Google Scholar data and must be checked against the official publication records before being used in official documents.)
          </p>
          <p className="mono muted">ข้อมูลสร้างเมื่อ {new Date(data.builtAt).toLocaleString('th-TH')}</p>
        </footer>
      </div>
    </>
  )
}
