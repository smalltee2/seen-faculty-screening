import { useEffect, useMemo, useState } from 'react'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { evaluatePerson, toBE, type Settings } from './rules'
import { reviewItems } from './review'
import type { DataBundle } from './types'
import { Overview } from './pages/Overview'
import { PersonPage } from './pages/PersonPage'
import { ReviewPage } from './pages/ReviewPage'

const data = raw as DataBundle
const pubs = preparePubs(data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key)), data.overrides)
const CURRENT_YEAR = new Date().getFullYear()
const ANNOUNCEMENT_URL = 'https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view'

type Route = { page: 'overview' } | { page: 'person'; key: string } | { page: 'review' }

function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  if (h.startsWith('person/')) return { page: 'person', key: h.slice('person/'.length) }
  if (h === 'review') return { page: 'review' }
  return { page: 'overview' }
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('seen-screening-settings') ?? 'null')
    if (s && Number.isInteger(s.year)) return { year: s.year, countPosters: s.countPosters === true }
  } catch {
    /* storage unavailable: use defaults */
  }
  return { year: CURRENT_YEAR, countPosters: false }
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
  const queue = useMemo(() => reviewItems(results), [results])

  const pubYears = pubs.map((p) => p.year).filter((y): y is number => y !== null)
  const minYear = Math.min(CURRENT_YEAR - 10, ...pubYears.map((y) => y + 4))
  const years: number[] = []
  for (let y = CURRENT_YEAR + 1; y >= minYear; y--) years.push(y)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <a href="#/" className="brand-title">คุณสมบัติอาจารย์หลักสูตรบัณฑิตศึกษา</a>
          <span className="brand-sub">School of Energy and Environment (SEEN), University of Phayao · ข้อ 9 เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565</span>
        </div>
        <nav className="nav no-print">
          <a href="#/" className={route.page === 'overview' ? 'active' : ''}>ภาพรวม</a>
          <a href="#/review" className={route.page === 'review' ? 'active' : ''}>
            รอตรวจสอบ <span className="badge">{queue.length}</span>
          </a>
        </nav>
      </header>

      <section className="settings">
        <label className="field">
          <span>ปีที่ประเมิน (Evaluation year)</span>
          <select value={settings.year} onChange={(e) => setSettings({ ...settings, year: Number(e.target.value) })}>
            {years.map((y) => (
              <option key={y} value={y}>
                พ.ศ. {toBE(y)} (ค.ศ. {y})
              </option>
            ))}
          </select>
        </label>
        <div className="field window">
          <span>ช่วง 5 ปีย้อนหลัง (window)</span>
          <strong>
            พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} <span className="muted">(ค.ศ. {settings.year - 4}–{settings.year})</span>
          </strong>
        </div>
        <label className="field toggle">
          <input type="checkbox" checked={settings.countPosters} onChange={(e) => setSettings({ ...settings, countPosters: e.target.checked })} />
          <span>
            นับโปสเตอร์ / บทคัดย่อ (Count posters / abstracts)
            <small className="warn">
              ⚠ ประกาศนับผลงานที่เผยแพร่ตามหลักเกณฑ์การแต่งตั้งตำแหน่งทางวิชาการ ซึ่งโดยปกติผลงานในที่ประชุมวิชาการนับเฉพาะบทความฉบับสมบูรณ์ (full paper) ใน proceedings ไม่ใช่บทคัดย่อหรือโปสเตอร์
            </small>
          </span>
        </label>
      </section>

      <main>
        {route.page === 'overview' && <Overview results={results} queueCount={queue.length} settings={settings} />}
        {route.page === 'person' && <PersonPage result={results.find((r) => r.person.nameEn === route.key)} settings={settings} />}
        {route.page === 'review' && <ReviewPage items={queue} />}
      </main>

      <footer className="footer">
        <p>
          แหล่งเกณฑ์: ประกาศคณะกรรมการมาตรฐานการอุดมศึกษา เรื่อง เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565 (ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง,
          9 กันยายน 2565) ข้อ 9.1–9.4 ·{' '}
          <a href={ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
            ฉบับเต็ม (PDF, สป.อว.)
          </a>
        </p>
        <p className="disclaimer">
          ผลการคัดกรองนี้คำนวณอัตโนมัติจากข้อมูล Google Scholar ต้องตรวจสอบกับฐานข้อมูลผลงานอย่างเป็นทางการก่อนนำไปใช้ในเอกสารทางราชการ (The screening is automated from
          Google Scholar data and must be checked against the official publication records before being used in official documents.)
        </p>
        <p className="muted">ข้อมูลสร้างเมื่อ {new Date(data.builtAt).toLocaleString('th-TH')}</p>
      </footer>
    </div>
  )
}
