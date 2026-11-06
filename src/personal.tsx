// "ข้อมูลของฉัน" (/me/): one central page where a lecturer signs in with their @up.ac.th
// e-mail (a one-time link sent by the Apps Script backend, apps-script/Code.gs) and sees only
// their own results. The backend returns the lecturer's data folder; the data itself is a
// separate file at ../p/<folder>/data.json (scripts/build-personal.mjs), so this page never
// loads anyone else's data. VITE_LOGIN_API (the web-app URL) is set at build time.
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
          <p>หน้านี้แสดงข้อมูลของท่านเท่านั้น ลิงก์เข้าสู่ระบบส่งถึงอีเมลมหาวิทยาลัยของท่านเท่านั้น · หากข้อมูลไม่ถูกต้อง แจ้งผู้ดูแลระบบของคณะ</p>
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

const SESSION_KEY = 'seen-personal-session'
const API = (import.meta.env.VITE_LOGIN_API as string | undefined) ?? ''

type ApiOk = { ok: true; session?: string; email?: string; nameEn?: string; folder?: string; expires?: string }
type ApiErr = { ok: false; error: string }

/** POST to the Apps Script web app as text/plain (no CORS preflight); it redirects once. */
async function api(body: Record<string, unknown>): Promise<ApiOk | ApiErr> {
  if (!API) return { ok: false, error: 'not_configured' }
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
  if (!res.ok) return { ok: false, error: `http_${res.status}` }
  return (await res.json()) as ApiOk | ApiErr
}

async function loadFolder(folder: string): Promise<DataBundle> {
  if (!/^[0-9a-f]{24}$/.test(folder)) throw new Error('bad folder')
  const res = await fetch(`../p/${folder}/data.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = (await res.json()) as DataBundle
  if (!d.faculty?.length) throw new Error('empty')
  return d
}

const storage = {
  get(): string {
    try {
      return localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set(v: string, remember: boolean) {
    try {
      ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, v)
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  },
}

const ERRORS: Record<string, string> = {
  not_up_email: 'กรุณาใช้อีเมลของมหาวิทยาลัย (@up.ac.th)',
  rate_limit: 'ขอลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ (ไม่เกิน 5 ครั้งต่อชั่วโมง)',
  invalid_or_expired: 'ลิงก์นี้หมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่',
  not_configured: 'ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล',
}
const errorText = (e: string) => ERRORS[e] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'

function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(notice ?? '')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api({ action: 'request', email: email.trim(), remember })
      if (r.ok) setSent(true)
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="gate">
      <form className="panel gate-card" onSubmit={submit}>
        <h1>ข้อมูลคุณสมบัติของฉัน</h1>
        <p className="lede">ระบบตรวจสอบคุณสมบัติอาจารย์ คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา · ใส่อีเมลมหาวิทยาลัย ระบบจะส่งลิงก์เข้าสู่ระบบไปที่อีเมลนั้น</p>
        {sent ? (
          <p className="note" role="status">
            ส่งลิงก์ไปที่ <b>{email.trim()}</b> แล้ว กรุณาเปิดอีเมลแล้วคลิกลิงก์ภายใน 15 นาที (ถ้าไม่พบ ตรวจในกล่อง junk/spam)
          </p>
        ) : (
          <>
            <label className="control" htmlFor="personal-email">
              <span className="control-label">อีเมล @up.ac.th</span>
              <input id="personal-email" type="email" autoComplete="email" placeholder="name.xx@up.ac.th" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label className="gate-remember" htmlFor="personal-remember">
              <input id="personal-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                จำเครื่องนี้ไว้ 30 วัน
                <small>ติ๊กเฉพาะเครื่องส่วนตัว ถ้าไม่ติ๊ก ระบบจำไว้ 12 ชั่วโมงหรือจนปิดเบราว์เซอร์</small>
              </span>
            </label>
            {error && (
              <p className="gate-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || !/^[^@\s]+@up\.ac\.th$/i.test(email.trim())}>
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}

function Root() {
  const [data, setData] = useState<DataBundle | null>(null)
  const [checking, setChecking] = useState(true)
  const [notice, setNotice] = useState<string>()
  useEffect(() => {
    const run = async () => {
      // 1. A one-time code from the e-mail link: #login=<code>
      const m = window.location.hash.match(/^#login=([0-9a-f]+)$/)
      if (m) {
        try {
          window.history.replaceState(null, '', window.location.pathname)
        } catch {
          /* ignore */
        }
        const r = await api({ action: 'verify', code: m[1] }).catch(() => ({ ok: false, error: '' }) as ApiErr)
        if (r.ok && r.session && r.folder) {
          const remember = r.expires ? new Date(r.expires).getTime() - Date.now() > 24 * 3600 * 1000 : false
          storage.set(r.session, remember)
          const d = await loadFolder(r.folder).catch(() => null)
          if (d) {
            initTci(d)
            setData(d)
            return
          }
          setNotice(errorText(''))
        } else setNotice(errorText(r.ok ? '' : r.error))
        return
      }
      // 2. A stored session.
      const saved = storage.get()
      if (!saved) return
      const r = await api({ action: 'me', session: saved }).catch(() => ({ ok: false, error: '' }) as ApiErr)
      if (r.ok && r.folder) {
        const d = await loadFolder(r.folder).catch(() => null)
        if (d) {
          initTci(d)
          setData(d)
          return
        }
      }
      storage.clear()
    }
    run().finally(() => setChecking(false))
  }, [])
  const logout = () => {
    const s = storage.get()
    storage.clear()
    setData(null)
    if (s) void api({ action: 'logout', session: s }).catch(() => undefined)
  }
  if (checking) return <Loading />
  if (!data) return <Login notice={notice} />
  return <Personal data={data} onLogout={logout} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
