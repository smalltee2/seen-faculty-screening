// The admin passcode for the tab "สำหรับผู้ดูแลระบบ" (ข้อมูลอาจารย์ and เพิ่มผลงานด้วยตนเอง). The passcode decrypts the admin form links (data/sources.json adminGate, AES-GCM);
// a wrong passcode fails authentication. This hides the views in the browser only: the site's
// data are bundled with the page, so it is not access control against a determined reader.
import { useState, type FormEvent, type ReactNode } from 'react'
import type { DataBundle } from './types'

export type AdminLinks = { formUrl: string; decisionFormUrl: string }

const SESSION_KEY = 'seen-admin-form'
/** Focus the first field only on desktop; on phones autofocus pops the keyboard over the card. */
export const DESKTOP = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true

/** The unlocked links: localStorage when "remember on this device", else sessionStorage. */
export function readSavedAdmin(): AdminLinks | null {
  try {
    const v = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    if (!v) return null
    // Older versions saved the bare form link.
    if (!v.startsWith('{')) return { formUrl: v, decisionFormUrl: '' }
    const o = JSON.parse(v) as Partial<AdminLinks>
    return { formUrl: o.formUrl ?? '', decisionFormUrl: o.decisionFormUrl ?? '' }
  } catch {
    return null
  }
}
function save(links: AdminLinks, remember: boolean) {
  try {
    ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(links))
  } catch {
    /* storage unavailable: stays unlocked until reload */
  }
}
export function forgetAdmin() {
  try {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function unlock(gate: NonNullable<DataBundle['sources']['adminGate']>, pass: string): Promise<AdminLinks> {
  // WebCrypto is only available on https://, localhost and file:// (not a plain http:// LAN share).
  if (!globalThis.crypto?.subtle) throw new Error('nocrypto')
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(gate.salt), iterations: gate.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(gate.iv) }, key, fromB64(gate.data))
  const v = JSON.parse(new TextDecoder().decode(plain)) as { formUrl: string; decisionFormUrl?: string }
  return { formUrl: v.formUrl, decisionFormUrl: v.decisionFormUrl ?? '' }
}

/** Initial admin state: open when the site has no gate configured, else whatever was saved. */
export function initialAdmin(data: DataBundle): AdminLinks | null {
  if (!data.sources.adminGate) return { formUrl: data.sources.googleFormUrl ?? '', decisionFormUrl: data.sources.decisionFormUrl ?? '' }
  return readSavedAdmin()
}

/** The passcode card shown in place of an admin-only tab. */
export function AdminGateForm({ data, title, onUnlocked }: { data: DataBundle; title: string; onUnlocked: (l: AdminLinks) => void }) {
  const gate = data.sources.adminGate
  const [remember, setRemember] = useState(false)
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!gate) return
    setBusy(true)
    setError('')
    try {
      const v = await unlock(gate, pass)
      save(v, remember)
      setPass('')
      onUnlocked(v)
    } catch (e) {
      setError(e instanceof Error && e.message === 'nocrypto' ? 'เบราว์เซอร์นี้ถอดรหัสไม่ได้: ต้องเปิดผ่าน https:// หรือเปิดไฟล์โดยตรง' : 'รหัสไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <GateShell
      icon="lock"
      eyebrow="เฉพาะผู้ที่มีรหัสผู้ดูแล"
      title={title}
      intro="ดูผลงานและผลการประเมินของอาจารย์ทุกคน และเพิ่มผลงานด้วยตนเอง"
      aside={
        <p className="gate-aside-note">
          อาจารย์ที่ต้องการดูข้อมูลของตนเอง ไปที่แถบ <a href="#/me">ตรวจสอบคุณสมบัติของฉัน</a>
        </p>
      }
    >
      <form className="gate-form" onSubmit={submit}>
        <h2 className="gate-form-title">ใส่รหัสผู้ดูแล</h2>
        <label className="gate-field" htmlFor="admin-pass">
          <span>รหัสผู้ดูแล</span>
          <input id="admin-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus={DESKTOP} name="admin-pass" />
        </label>
        <label className="gate-remember" htmlFor="admin-remember">
          <input id="admin-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
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
        <button type="submit" className="btn btn-primary gate-submit" disabled={busy || !pass}>
          {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ส่วนผู้ดูแล'}
        </button>
      </form>
    </GateShell>
  )
}

const ICONS = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="16" r="1.4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
}

/** Two-panel sign-in card: a green band with the purpose (and optional steps), the form on the right;
 *  stacks on narrow screens. Used by the admin passcode and the lecturer e-mail login. */
export function GateShell(props: { icon: keyof typeof ICONS; eyebrow: string; title: string; intro: string; steps?: string[]; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-shell">
        <div className="gate-aside">
          <span className="gate-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[props.icon]}
            </svg>
          </span>
          <span className="gate-eyebrow">{props.eyebrow}</span>
          <h1 className="gate-title">{props.title}</h1>
          <p className="gate-intro">{props.intro}</p>
          {props.steps && (
            <ol className="gate-steps">
              {props.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          )}
          {props.aside}
        </div>
        <div className="gate-main">{props.children}</div>
      </div>
    </div>
  )
}
