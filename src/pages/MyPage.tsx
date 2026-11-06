// Tab "ตรวจสอบคุณสมบัติของฉัน" (#/me): a lecturer signs in with their @up.ac.th e-mail (a one-time
// link sent by the Apps Script backend, apps-script/Code.gs) and sees only their own result.
// The e-mail link opens /me/#login=<code>, which forwards to #/me/login=<code> (scripts/build-personal.mjs).
import { useEffect, useState, type FormEvent } from 'react'
import type { PersonResult, Settings } from '../rules'
import { PersonPage } from './PersonPage'
import { GateShell } from '../adminGate'

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
  not_found: 'ไม่พบข้อมูลของท่านในระบบ กรุณาติดต่อผู้ดูแลระบบของคณะ',
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
    <GateShell
      icon="mail"
      eyebrow="สำหรับอาจารย์"
      title="ตรวจสอบคุณสมบัติของฉัน"
      intro="ดูผลการตรวจสอบคุณสมบัติและรายการผลงานของท่านเอง โดยไม่ต้องตั้งรหัสผ่าน"
      steps={['ใส่อีเมลมหาวิทยาลัย @up.ac.th', 'เปิดอีเมลแล้วคลิกลิงก์ภายใน 15 นาที', 'ระบบแสดงเฉพาะข้อมูลของท่าน']}
    >
      <form className="gate-form" onSubmit={submit}>
        {sent ? (
          <div className="gate-sent" role="status">
            <h2 className="gate-form-title">ส่งลิงก์แล้ว</h2>
            <p>
              ระบบส่งลิงก์เข้าสู่ระบบไปที่ <b>{email.trim()}</b> กรุณาเปิดอีเมลแล้วคลิกลิงก์ภายใน 15 นาที
            </p>
            <p className="muted small">ถ้าไม่พบ ให้ตรวจในกล่อง Junk หรือ Spam</p>
            <button type="button" className="btn" onClick={() => setSent(false)}>
              ใช้อีเมลอื่น
            </button>
          </div>
        ) : (
          <>
            <h2 className="gate-form-title">เข้าสู่ระบบด้วยอีเมล</h2>
            <label className="gate-field" htmlFor="personal-email">
              <span>อีเมล @up.ac.th</span>
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
            <button type="submit" className="btn btn-primary gate-submit" disabled={busy || !/^[^@\s]+@up\.ac\.th$/i.test(email.trim())}>
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ'}
            </button>
          </>
        )}
      </form>
    </GateShell>
  )
}

/** Signed-in lecturer's nameEn, kept for the page's lifetime so switching tabs does not re-check. */
let signedIn: { nameEn: string; email: string } | null = null

export function MyPage({ results, settings, loginCode }: { results: PersonResult[]; settings: Settings; loginCode?: string }) {
  const [me, setMe] = useState(signedIn)
  const [checking, setChecking] = useState(!signedIn)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    if (signedIn && !loginCode) return
    let on = true
    const run = async () => {
      if (loginCode) {
        // 1. A one-time code from the e-mail link; drop it from the address bar first.
        try {
          window.history.replaceState(null, '', `${window.location.pathname}#/me`)
        } catch {
          /* ignore */
        }
        const r = await api({ action: 'verify', code: loginCode }).catch(() => ({ ok: false, error: '' }) as ApiErr)
        if (r.ok && r.session && r.nameEn) {
          const remember = r.expires ? new Date(r.expires).getTime() - Date.now() > 24 * 3600 * 1000 : false
          storage.set(r.session, remember)
          return { nameEn: r.nameEn, email: r.email ?? '' }
        }
        if (on) setNotice(errorText(r.ok ? '' : r.error))
        return null
      }
      // 2. A stored session.
      const saved = storage.get()
      if (!saved) return null
      const r = await api({ action: 'me', session: saved }).catch(() => ({ ok: false, error: '' }) as ApiErr)
      if (r.ok && r.nameEn) return { nameEn: r.nameEn, email: r.email ?? '' }
      if (!r.ok && r.error === 'no_session') storage.clear()
      return null
    }
    void run()
      .then((v) => {
        signedIn = v
        if (on) setMe(v)
      })
      .finally(() => on && setChecking(false))
    return () => {
      on = false
    }
  }, [loginCode])

  const logout = () => {
    const s = storage.get()
    storage.clear()
    signedIn = null
    setMe(null)
    if (s) void api({ action: 'logout', session: s }).catch(() => undefined)
  }

  if (checking) return <p className="note">กำลังตรวจสอบการเข้าสู่ระบบ…</p>
  if (!me) return <Login notice={notice} />
  const result = results.find((r) => r.person.nameEn === me.nameEn)
  return (
    <>
      <div className="me-bar no-print">
        <span>
          เข้าสู่ระบบเป็น <b>{me.email || result?.person.nameTh || me.nameEn}</b> · หน้านี้แสดงเฉพาะข้อมูลของท่าน
        </span>
        <button type="button" className="btn btn-small" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>
      {result ? <PersonPage result={result} settings={settings} personal /> : <p className="gate-error">{errorText('not_found')}</p>}
    </>
  )
}
