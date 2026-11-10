// E-mail sign-in shared by "ตรวจสอบคุณสมบัติของฉัน" (lecturers) and the work-approval table
// (level-2 admins listed in the backend's admins sheet). The Apps Script web app
// (apps-script/Code.gs) e-mails a one-time link, the link opens #/me/login=<code>, and the
// page exchanges the code for a session kept in this browser.
import { useEffect, useState, type FormEvent } from 'react'
import { DESKTOP, GateShell } from './adminGate'

const SESSION_KEY = 'seen-personal-session'
const API = (import.meta.env.VITE_LOGIN_API as string | undefined) ?? ''

export type ApiOk = { ok: true; session?: string; email?: string; nameEn?: string; folder?: string; expires?: string; isAdmin?: boolean; id?: string; items?: unknown[]; added?: number; skipped?: number; removed?: number; batch?: string }
export type ApiErr = { ok: false; error: string }

/** Public read-only actions. When several are sent at once (every page load sends about seven),
 *  Apps Script can refuse some with an error page that has no CORS header, so the browser reports a
 *  network error and the list came back empty. These are retried; a write never is, because a write
 *  that looked failed may still have been saved (2026-11-11). */
export const READ_ACTIONS = new Set(['confList', 'list', 'formCancelList', 'noticeList', 'scholarJob', 'scholarList', 'decisionLog'])
const RETRY_DELAYS_MS = [700, 2000]

/** POST to the Apps Script web app as text/plain (no CORS preflight); it redirects once. */
export async function api(body: Record<string, unknown>, delays: number[] = RETRY_DELAYS_MS): Promise<ApiOk | ApiErr> {
  if (!API) return { ok: false, error: 'not_configured' }
  const retries = READ_ACTIONS.has(String(body.action)) ? delays : []
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      if (!res.ok) return { ok: false, error: `http_${res.status}` }
      return (await res.json()) as ApiOk | ApiErr
    } catch (e) {
      if (i >= retries.length) throw e
      await new Promise((r) => setTimeout(r, retries[i]))
    }
  }
}
export const loginConfigured = API !== ''

export const sessionStore = {
  get(): string {
    try {
      return localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set(v: string, remember: boolean) {
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
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
  rate_limit: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  invalid_or_expired: 'ลิงก์นี้หมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่',
  not_configured: 'ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล',
  not_found: 'ไม่พบข้อมูลของท่านในระบบ กรุณาติดต่อผู้ดูแลระบบของคณะ',
  no_session: 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  not_lecturer: 'บัญชีนี้ไม่ได้อยู่ในรายชื่ออาจารย์ จึงเพิ่มผลงานไม่ได้',
  not_admin: 'บัญชีนี้ไม่ได้อยู่ในรายชื่อผู้ดูแลที่อนุมัติผลงานได้ (ชีต admins)',
  bad_work: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจปี ชื่อผลงาน ประเภท และชื่อวารสาร/งานประชุม',
  not_pending: 'ผลงานนี้ได้รับการพิจารณาแล้ว จึงถอนไม่ได้',
  notified_recently: 'เพิ่งส่งอีเมลแจ้งเตือนอาจารย์ท่านนี้ไปแล้วภายใน 12 ชั่วโมง',
  busy: 'มีงานอัปเดตที่รอหรือกำลังทำอยู่แล้ว',
  bad_key: 'กุญแจอนุมัติของรหัสผู้ดูแลชุดนี้ใช้ไม่ได้ กรุณาออกจากระบบผู้ดูแลแล้วใส่รหัสระดับ 2 ใหม่',
}
export const errorText = (e: string) => ERRORS[e] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'

export type EmailUser = { email: string; nameEn: string; isAdmin: boolean }

/** Signed-in account, kept for the page's lifetime so switching tabs does not re-check. */
let cached: EmailUser | null = null
let checked = false
/** One "me" request shared by every component that mounts in the same render. */
let inflight: Promise<EmailUser | null> | null = null

async function fromSavedSession(): Promise<EmailUser | null> {
  const saved = sessionStore.get()
  if (!saved) return null
  const r = await api({ action: 'me', session: saved }).catch(() => ({ ok: false, error: '' }) as ApiErr)
  if (r.ok) return { email: r.email ?? '', nameEn: r.nameEn ?? '', isAdmin: !!r.isAdmin }
  if (r.error === 'no_session') sessionStore.clear()
  return null
}

/** Resolves the e-mail session: a one-time code from the link, else the stored session. */
export function useEmailUser(loginCode?: string) {
  const [user, setUser] = useState<EmailUser | null>(cached)
  const [checking, setChecking] = useState(!checked || !!loginCode)
  const [notice, setNotice] = useState<string>()
  useEffect(() => {
    if (checked && !loginCode) return
    let on = true
    if (loginCode) setChecking(true)
    const run = async (): Promise<EmailUser | null> => {
      if (loginCode) {
        try {
          window.history.replaceState(null, '', `${window.location.pathname}#/me`)
        } catch {
          /* ignore */
        }
        const r = await api({ action: 'verify', code: loginCode }).catch(() => ({ ok: false, error: '' }) as ApiErr)
        if (r.ok && r.session) {
          const remember = r.expires ? new Date(r.expires).getTime() - Date.now() > 24 * 3600 * 1000 : false
          sessionStore.set(r.session, remember)
          return { email: r.email ?? '', nameEn: r.nameEn ?? '', isAdmin: !!r.isAdmin }
        }
        // A used or expired link must not log out a session this browser still has.
        const kept = await fromSavedSession()
        if (on && !kept) setNotice(errorText(r.ok ? '' : r.error))
        return kept
      }
      if (!inflight) inflight = fromSavedSession().finally(() => (inflight = null))
      return inflight
    }
    void run()
      .then((v) => {
        cached = v
        checked = true
        if (on) setUser(v)
      })
      .finally(() => on && setChecking(false))
    return () => {
      on = false
    }
  }, [loginCode])
  const logout = () => {
    const s = sessionStore.get()
    sessionStore.clear()
    cached = null
    setUser(null)
    if (s) void api({ action: 'logout', session: s }).catch(() => undefined)
  }
  return { user, checking, notice, logout }
}

/** "Send me a sign-in link" card. */
export function EmailLogin({ notice, eyebrow = 'สำหรับอาจารย์', title = 'ตรวจสอบคุณสมบัติของฉัน', intro, steps }: { notice?: string; eyebrow?: string; title?: string; intro?: string; steps?: string[] }) {
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
      eyebrow={eyebrow}
      title={title}
      intro={intro ?? 'ดูผลการตรวจสอบคุณสมบัติและรายการผลงานของท่านเอง และเพิ่มผลงานที่ยังไม่มีในระบบ โดยไม่ต้องตั้งรหัสผ่าน'}
      steps={steps ?? ['ใส่อีเมลมหาวิทยาลัย @up.ac.th', 'เปิดอีเมลแล้วคลิกลิงก์ภายใน 15 นาที', 'ระบบแสดงเฉพาะข้อมูลของท่าน']}
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
              <input id="personal-email" type="email" autoComplete="email" name="email" inputMode="email" spellCheck={false} autoCapitalize="none" placeholder="name.xx@up.ac.th" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={DESKTOP} />
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
