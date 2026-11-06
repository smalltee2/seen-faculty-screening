// "ข้อมูลของฉัน" (/me/): one central page where a lecturer enters a personal code and sees
// only their own results. The data for each lecturer is a separate file at
// ../p/<SHA-256(code)>/data.json (scripts/build-personal.mjs), so this page never loads
// anyone else's data and the folder cannot be found without the code. Codes are issued by
// the admin (npm run personal-codes) from a secret salt.
import { StrictMode, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { preparePubs } from './classify'
import { evaluatePerson, toBE, type Settings } from './rules'
import { PersonPage } from './pages/PersonPage'
import { fetchLiveManual } from './liveManual'
import { initTci } from './tciIndex'
import { reloadForBuild, useAutoRefresh } from './autoRefresh'
import seenLogo from './assets/seen-logo.png'
import type { DataBundle, RawPub } from './types'
import './styles.css'

const CURRENT_YEAR = new Date().getFullYear()

function Personal({ data, onLogout }: { data: DataBundle; onLogout: () => void }) {
  const person = data.faculty[0]
  const [settings, setSettings] = useState<Settings>({ year: CURRENT_YEAR, countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' })
  const [liveRows, setLiveRows] = useState<RawPub[]>([])
  useEffect(() => {
    let on = true
    void fetchLiveManual(data.sources.manualSheetCsvUrl, data.faculty, data.publications).then((rows) => {
      if (on && rows.length) setLiveRows(rows.filter((r) => r.key === person.nameEn))
    })
    return () => {
      on = false
    }
  }, [data, person.nameEn])
  const pubs = useMemo(() => preparePubs([...data.publications, ...liveRows], data.overrides, data.conferences ?? []), [data, liveRows])
  const result = useMemo(() => evaluatePerson(person, pubs, settings), [person, pubs, settings])
  const newerBuild = useAutoRefresh(data.builtAt, true)
  const years: number[] = []
  for (let y = CURRENT_YEAR + 1; y >= CURRENT_YEAR - 10; y--) years.push(y)
  const updated = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.builtAt))

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark">
              <img src={seenLogo} alt="ตราสัญลักษณ์คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา (SEEN)" width={262} height={99} />
            </span>
            <span className="brand-text">
              <span className="brand-name">ข้อมูลคุณสมบัติของฉัน · ระบบตรวจสอบคุณสมบัติอาจารย์</span>
              <small className="brand-sub">คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา · ตามเกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี และระดับบัณฑิตศึกษา พ.ศ. 2565</small>
            </span>
          </span>
        </div>
        <nav className="tabsbar no-print" aria-label="หน้า">
          <div className="tabsbar-inner">
            <button type="button" className="btn btn-small" onClick={onLogout}>
              ออกจากระบบ
            </button>
            <span className="updated-at" title={data.builtAt}>
              <span className="updated-label">ข้อมูลล่าสุด</span>
              <time dateTime={data.builtAt}>{updated} น.</time>
            </span>
          </div>
        </nav>
      </header>
      <div className="page">
        {newerBuild && (
          <div className="update-banner no-print" role="status">
            <span>มีข้อมูลเวอร์ชันใหม่</span>
            <button type="button" className="btn btn-primary" onClick={() => reloadForBuild(newerBuild)}>
              โหลดหน้าใหม่
            </button>
          </div>
        )}
        <section className="controls no-print">
          <label className="control">
            <span className="control-label">ปีที่ประเมิน</span>
            <select value={settings.year} onChange={(e) => setSettings({ ...settings, year: Number(e.target.value) })}>
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
            <span className="control-text">วารสาร, proceedings/โปสเตอร์/บทคัดย่อในงานประชุม ที่มาจากการประชุมโดยสมาคมวิชาการหรือวิชาชีพในสาขาเกี่ยวข้องกับสิ่งแวดล้อม/พลังงาน</span>
          </div>
        </section>
        <main>
          <PersonPage result={result} settings={settings} personal />
        </main>
        <footer className="footer">
          <p>หน้านี้แสดงข้อมูลของท่านเท่านั้น รหัสส่วนตัวใช้ดูข้อมูลของท่าน กรุณาอย่าส่งต่อ · หากข้อมูลไม่ถูกต้อง แจ้งผู้ดูแลระบบของคณะ</p>
        </footer>
      </div>
    </>
  )
}

function Loading({ error }: { error?: string }) {
  return (
    <div className="page">
      <p className="note">{error ?? 'กำลังโหลดข้อมูล…'}</p>
    </div>
  )
}

const CODE_KEY = 'seen-personal-code'

/** Folder of a code: SHA-256 of the code without dashes, upper-case, 24 hex chars (same as scripts/personal-token.mjs). */
async function folderOf(code: string): Promise<string> {
  const norm = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

async function loadFor(code: string): Promise<DataBundle> {
  const res = await fetch(`../p/${await folderOf(code)}/data.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = (await res.json()) as DataBundle
  if (!d.faculty?.length) throw new Error('empty')
  return d
}

function Login({ onData }: { onData: (d: DataBundle, code: string, remember: boolean) => void }) {
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onData(await loadFor(code), code, remember)
    } catch {
      setError('ไม่พบข้อมูลสำหรับรหัสนี้ กรุณาตรวจสอบรหัสที่ได้รับจากผู้ดูแลระบบ')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="gate">
      <form className="panel gate-card" onSubmit={submit}>
        <h1>ข้อมูลคุณสมบัติของฉัน</h1>
        <p className="lede">ระบบตรวจสอบคุณสมบัติอาจารย์ คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา · ใส่รหัสส่วนตัวที่ได้รับจากผู้ดูแลระบบ เพื่อดูผลของท่านเท่านั้น</p>
        <label className="control" htmlFor="personal-code">
          <span className="control-label">รหัสส่วนตัว</span>
          <input id="personal-code" type="password" autoComplete="off" placeholder="XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </label>
        <label className="gate-remember" htmlFor="personal-remember">
          <input id="personal-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            จำรหัสบนเครื่องนี้
            <small>ติ๊กเฉพาะเครื่องส่วนตัว ถ้าไม่ติ๊ก ระบบจำไว้จนปิดเบราว์เซอร์</small>
          </span>
        </label>
        {error && (
          <p className="gate-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/[^0-9A-Za-z]/g, '').length < 8}>
          {busy ? 'กำลังโหลด…' : 'ดูข้อมูลของฉัน'}
        </button>
      </form>
    </div>
  )
}

function Root() {
  const [data, setData] = useState<DataBundle | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let saved = ''
    try {
      saved = localStorage.getItem(CODE_KEY) ?? sessionStorage.getItem(CODE_KEY) ?? ''
    } catch {
      /* storage unavailable */
    }
    if (!saved) {
      setChecking(false)
      return
    }
    loadFor(saved)
      .then((d) => {
        initTci(d)
        setData(d)
      })
      .catch(() => {
        try {
          localStorage.removeItem(CODE_KEY)
          sessionStorage.removeItem(CODE_KEY)
        } catch {
          /* ignore */
        }
      })
      .finally(() => setChecking(false))
  }, [])
  const logout = () => {
    try {
      localStorage.removeItem(CODE_KEY)
      sessionStorage.removeItem(CODE_KEY)
    } catch {
      /* ignore */
    }
    setData(null)
  }
  if (checking) return <Loading />
  if (!data)
    return (
      <Login
        onData={(d, code, remember) => {
          try {
            ;(remember ? localStorage : sessionStorage).setItem(CODE_KEY, code)
          } catch {
            /* ignore */
          }
          initTci(d)
          setData(d)
        }}
      />
    )
  return <Personal data={data} onLogout={logout} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
