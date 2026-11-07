// Admin passcodes for the tab "สำหรับผู้ดูแลระบบ": level 2 (adminGate) opens ข้อมูลอาจารย์ and เพิ่มผลงานด้วยตนเอง,
// level 1 (viewerGate) only ข้อมูลอาจารย์. The passcode decrypts the admin form links (data/sources.json adminGate, AES-GCM);
// a wrong passcode fails authentication. This hides the views in the browser only: the site's
// data are bundled with the page, so it is not access control against a determined reader.
import { useState, type FormEvent, type ReactNode } from 'react'
import type { DataBundle } from './types'

/** level 1 = ข้อมูลอาจารย์ only; level 2 = everything incl. เพิ่มผลงาน and conference decisions (2026-11-07). */
export type AdminLevel = 1 | 2
export type AdminLinks = { formUrl: string; decisionFormUrl: string; level: AdminLevel }
/** What is saved in the browser: the links plus the salt of the gate that opened them, so a
 *  sign-in made with an old passcode is dropped once that passcode is changed. */
type Saved = AdminLinks & { gate?: string }

const SESSION_KEY = 'seen-admin-form'
/** Focus the first field only on desktop; on phones autofocus pops the keyboard over the card. */
export const DESKTOP = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true

/** The unlocked links: localStorage when "remember on this device", else sessionStorage. */
export function readSavedAdmin(): Saved | null {
  try {
    const v = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    if (!v) return null
    // Older versions saved the bare form link.
    if (!v.startsWith('{')) return { formUrl: v, decisionFormUrl: '', level: 2 }
    const o = JSON.parse(v) as Partial<Saved>
    return { formUrl: o.formUrl ?? '', decisionFormUrl: o.decisionFormUrl ?? '', level: o.level === 1 ? 1 : 2, gate: o.gate }
  } catch {
    return null
  }
}
function save(links: AdminLinks, gate: string, remember: boolean) {
  // Clear both stores first, so an older remembered sign-in cannot shadow this one.
  forgetAdmin()
  try {
    ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify({ ...links, gate } satisfies Saved))
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

type Gate = NonNullable<DataBundle['sources']['adminGate']>

/** Tries the level-2 passcode first, then level 1; a wrong passcode fails AES-GCM authentication. */
export async function unlockAny(gates: { admin?: Gate; viewer?: Gate }, pass: string): Promise<AdminLinks> {
  if (gates.admin) {
    try {
      const v = await unlock(gates.admin, pass)
      return { ...v, level: 2 }
    } catch (e) {
      if (e instanceof Error && e.message === 'nocrypto') throw e
    }
  }
  if (gates.viewer) {
    await unlock(gates.viewer, pass)
    return { formUrl: '', decisionFormUrl: '', level: 1 }
  }
  throw new Error('wrong')
}

async function unlock(gate: Gate, pass: string): Promise<Omit<AdminLinks, 'level'>> {
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
  const v = JSON.parse(new TextDecoder().decode(plain)) as { formUrl?: string; decisionFormUrl?: string }
  return { formUrl: v.formUrl ?? '', decisionFormUrl: v.decisionFormUrl ?? '' }
}

/** Initial admin state: open when the site has no gate configured, else whatever was saved. */
export function initialAdmin(data: DataBundle): AdminLinks | null {
  if (!data.sources.adminGate) return { formUrl: data.sources.googleFormUrl ?? '', decisionFormUrl: data.sources.decisionFormUrl ?? '', level: 2 }
  const saved = readSavedAdmin()
  if (!saved) return null
  // Keep a saved sign-in only while the passcode that made it is still the current one
  // (sign-ins saved before 2026-11-07 carry no gate and must sign in again).
  const current = saved.level === 2 ? data.sources.adminGate.salt : data.sources.viewerGate?.salt
  if (!saved.gate || saved.gate !== current) {
    forgetAdmin()
    return null
  }
  return { formUrl: saved.formUrl, decisionFormUrl: saved.decisionFormUrl, level: saved.level }
}

/** The passcode card shown in place of an admin-only tab. */
export function AdminGateForm({ data, title, onUnlocked, needLevel = 1, note }: { data: DataBundle; title: string; onUnlocked: (l: AdminLinks) => void; needLevel?: AdminLevel; note?: string }) {
  const gate = data.sources.adminGate
  const viewer = data.sources.viewerGate
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
      const v = await unlockAny({ admin: gate, viewer }, pass)
      if (v.level < needLevel) throw new Error('level')
      save(v, (v.level === 2 ? gate.salt : viewer?.salt) ?? '', remember)
      setPass('')
      onUnlocked(v)
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      setError(m === 'nocrypto' ? 'เบราว์เซอร์นี้ถอดรหัสไม่ได้: ต้องเปิดผ่าน https:// หรือเปิดไฟล์โดยตรง' : m === 'level' ? 'รหัสนี้เป็นของผู้ดูแลระดับ 1 ซึ่งดูได้เฉพาะข้อมูลอาจารย์' : 'รหัสไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <GateShell
      icon="lock"
      eyebrow="เฉพาะผู้ที่มีรหัสผู้ดูแล"
      title={title}
      intro={note ?? 'ระดับ 1 ดูข้อมูลอาจารย์ · ระดับ 2 ดูข้อมูลอาจารย์ เพิ่มผลงาน และตัดสินงานประชุม'}
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
