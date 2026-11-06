import { useState, type FormEvent } from 'react'
import type { DataBundle, Pub, PubSource } from '../types'
import { TYPE_LABEL, displayName, yearLabel } from '../ui'
import { toBE } from '../rules'
import { CONFERENCE_TAG } from '../conferences'
import { copyText } from '../download'
import type { Faculty } from '../types'

const SOURCE_LABEL: Record<PubSource, string> = {
  scholar: 'Google Scholar (นำเข้าเป็นครั้งคราว)',
  openalex: 'OpenAlex (อัปเดตทุกวัน)',
  scopus: 'Scopus (อัปเดตทุกวัน)',
  manual: 'แบบฟอร์มผู้ดูแล (อัปเดตทุกวัน)',
}

type Links = { formUrl: string; decisionFormUrl: string }

function AdminContent({ data, pubs, faculty, formUrl, decisionFormUrl, onLock }: { data: DataBundle; pubs: Pub[]; faculty: Faculty[]; formUrl: string; decisionFormUrl: string; onLock?: () => void }) {
  const manual = pubs.filter((p) => p.sources.includes('manual')).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const rawCount = (s: PubSource) => data.publications.filter((p) => (p.source ?? 'scholar') === s).length
  const person = (key: string) => faculty.find((f) => f.nameEn === key)

  return (
    <>
      <div className="section-head">
        <div>
          <h1>เพิ่มผลงานด้วยตนเอง</h1>
          <p className="lede">สำหรับผู้ดูแล: เพิ่มผลงานที่ยังไม่มีใน Scholar, OpenAlex หรือ Scopus เช่น บทความในวารสารไทย หรือ proceedings ของงานประชุมในประเทศ</p>
        </div>
        {onLock && (
          <div className="actions no-print">
            <button type="button" className="btn" onClick={onLock}>
              ออกจากระบบผู้ดูแล
            </button>
          </div>
        )}
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h3>ขั้นตอน</h3>
          <ol className="steps">
            <li>กรอกแบบฟอร์มด้วยบัญชี @up.ac.th หนึ่งครั้งต่อหนึ่งผลงาน ถ้ามีผู้เขียนหลายคนในคณะ ให้กรอกแยกทีละคน</li>
            <li>ผลงานที่ส่งจะปรากฏในระบบภายในไม่กี่นาที (อ่านจากชีตคำตอบโดยตรง) และถูกบันทึกถาวรในรอบอัปเดต 03:00 น.</li>
            <li>ผลงานที่เพิ่มจะแสดงในตารางด้านล่าง และนับตามประเภทที่เลือก (วารสาร / proceedings / โปสเตอร์)</li>
            <li>ถ้ากรอกผิด ให้ลบแถวนั้นในชีตคำตอบของแบบฟอร์ม แล้วรอรอบอัปเดตถัดไป</li>
          </ol>
          {formUrl ? (
            <a className="btn btn-primary" href={formUrl} target="_blank" rel="noreferrer">
              เปิดแบบฟอร์มเพิ่มผลงาน
            </a>
          ) : (
            <p className="note">ยังไม่ได้ตั้งค่าลิงก์แบบฟอร์ม (googleFormUrl ใน data/sources.json)</p>
          )}
        </section>

        <section className="panel">
          <h3>แหล่งข้อมูล</h3>
          <dl className="source-list">
            {(['openalex', 'scopus', 'manual', 'scholar'] as PubSource[]).map((s) => (
              <div key={s}>
                <dt>{SOURCE_LABEL[s]}</dt>
                <dd className="mono">{rawCount(s)} รายการ</dd>
              </div>
            ))}
          </dl>
          <p className="note">
            อัปเดตล่าสุด {new Date(data.builtAt).toLocaleString('th-TH')} · รวมรายการซ้ำจากหลายแหล่งด้วย DOI หรือชื่อเรื่อง · Google Scholar ดึงอัตโนมัติไม่ได้
            จึงต้องนำเข้าด้วยมือเป็นครั้งคราว
          </p>
        </section>
      </div>

      <ConferenceRegister pubs={pubs} screening={data.conferenceScreening === 'on'} decisionFormUrl={decisionFormUrl} />

      <h2 className="block-title">ผลงานที่เพิ่มผ่านแบบฟอร์ม · {manual.length} รายการ</h2>
      {manual.length === 0 ? (
        <p className="note">ยังไม่มีผลงานที่เพิ่มผ่านแบบฟอร์ม</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>อาจารย์</th>
                <th>ปี</th>
                <th>ชื่อผลงาน / แหล่งตีพิมพ์</th>
                <th>ประเภท</th>
                <th>งานวิจัย</th>
                <th>ส่งเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {manual.map((p) => {
                const f = person(p.key)
                return (
                  <tr key={p.id}>
                    <td>{f ? <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>{displayName(f)}</a> : p.key}</td>
                    <td className="nowrap">{yearLabel(p.year)}</td>
                    <td>
                      <div className="pub-title">{p.title}</div>
                      <div className="muted small">{p.venue}</div>
                    </td>
                    <td>{TYPE_LABEL[p.type]}</td>
                    <td>{p.isResearch ? 'ใช่' : 'ไม่'}</td>
                    <td className="small muted">
                      {p.submitted ?? ''}
                      {p.live && <div className="jl cf-pending">สด · ยังไม่ได้บันทึกในระบบ (จะบันทึกในรอบ 03:00)</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** Every conference seen among proceedings, with the register's verdict; admins edit data/conferences.csv. */
function ConferenceRegister({ pubs, screening, decisionFormUrl }: { pubs: Pub[]; screening: boolean; decisionFormUrl: string }) {
  const groups = new Map<string, { match: NonNullable<Pub['conference']>; pubs: Pub[] }>()
  // Same window as the automatic check: papers that can still fall in this year's or next year's 5-year window.
  const minYear = new Date().getFullYear() - 5
  let older = 0
  for (const p of pubs) {
    if ((p.type !== 'proceeding' && p.type !== 'poster') || !p.conference) continue
    if ((p.year ?? 0) < minYear) {
      older++
      continue
    }
    const g = groups.get(p.conference.key) ?? { match: p.conference, pubs: [] }
    g.pubs.push(p)
    groups.set(p.conference.key, g)
  }
  const order: Record<string, number> = { pending: 0, no_count: 1, count: 2 }
  const rows = [...groups.values()].sort((a, b) => order[a.match.verdict] - order[b.match.verdict] || (b.pubs[0].year ?? 0) - (a.pubs[0].year ?? 0))
  const pending = rows.filter((r) => r.match.verdict === 'pending').length
  return (
    <>
      <h2 className="block-title">
        ทะเบียนงานประชุม (proceedings) · {rows.length} งาน{pending > 0 && <span className="muted"> · รอตรวจสอบ {pending}</span>}
      </h2>
      <p className="note">
        แสดงเฉพาะงานประชุมที่มีผลงานตั้งแต่ปี {toBE(minYear)} ({minYear}) ซึ่งยังอยู่ในช่วงประเมินของปีนี้หรือปีหน้า{older > 0 && ` · ผลงานเก่ากว่านั้น ${older} รายการไม่ต้องตรวจ`}
      </p>
      <p className="note">
        proceedings นับเมื่องานประชุมมีสมาคมวิชาการ/วิชาชีพจัดหรือร่วมจัด และอยู่ในสาขาสิ่งแวดล้อมหรือพลังงาน
        ระบบค้นหาผู้จัดให้อัตโนมัติ (คอลัมน์ "ตรวจโดย") รายการที่ยังไม่ชัดเจนจะแสดงแต่ไม่นับจนกว่าผู้ดูแลจะยืนยันในไฟล์ data/conferences.csv (คอลัมน์ decision)
        {!screening && ' · ขณะนี้ปิดการใช้ทะเบียนในการคำนวณ (data/rules.json) จึงยังนับ proceedings ทุกรายการ'}
      </p>
      {decisionFormUrl ? (
        <p className="note">
          ตัดสินผ่านแบบฟอร์ม: คัดลอกรหัสงานประชุม (ปุ่ม "คัดลอก key" ในตาราง) ไปกรอกใน{' '}
          <a className="btn btn-primary" href={decisionFormUrl} target="_blank" rel="noreferrer">
            แบบฟอร์มตัดสินงานประชุม
          </a>{' '}
          ระบบดึงคำตอบทุกวันเวลาประมาณ 03:00 น. คำตอบล่าสุดของแต่ละงานมีผล
        </p>
      ) : (
        <p className="note">ยังไม่ได้ตั้งค่าแบบฟอร์มตัดสินงานประชุม (decisionFormUrl ใน data/sources.json)</p>
      )}
      {rows.length === 0 ? (
        <p className="note">ไม่มี proceedings ในข้อมูล</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>งานประชุม (ตามที่ปรากฏ)</th>
                <th>ผู้จัด / สมาคม</th>
                <th>สาขา</th>
                <th>ผล</th>
                <th>ตรวจโดย</th>
                <th>ผลงาน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ match, pubs: ps }) => {
                const e = match.entry
                return (
                  <tr key={match.key}>
                    <td>
                      <div className="pub-title">{e?.conferenceName || ps[0].venue}</div>
                      <div className="muted small">{match.key.startsWith('work:') ? ps[0].title : ps[0].venue}</div>
                      <CopyKey value={match.key} />
                    </td>
                    <td className="small">
                      {e ? (
                        <>
                          <div>{e.organiser || '—'}</div>
                          {e.association && <div>สมาคม: {e.association} ({e.associationRole === 'organiser' ? 'จัด' : e.associationRole === 'co_organiser' ? 'ร่วมจัด' : e.associationRole})</div>}
                          {e.evidenceUrl && <a href={e.evidenceUrl} target="_blank" rel="noreferrer">หลักฐาน ↗</a>}
                        </>
                      ) : (
                        <span className="muted">ยังไม่ได้ตรวจ</span>
                      )}
                    </td>
                    <td className="small">{e ? `${e.field || '—'} (${e.relatedField === 'yes' ? 'เกี่ยวข้อง' : e.relatedField === 'no' ? 'ไม่เกี่ยวข้อง' : 'ไม่แน่ใจ'})` : '—'}</td>
                    <td>
                      <div className={`jl cf cf-${match.verdict}`}>{CONFERENCE_TAG[match.verdict]}</div>
                      <div className="muted small">{match.reason}</div>
                    </td>
                    <td className="small muted">{match.by === 'admin' ? `ผู้ดูแล${e?.decidedBy ? ` (${e.decidedBy})` : ''}` : e ? `${e.checkedBy} ${e.checkedAt.slice(0, 10)} · ความมั่นใจ ${e.confidence}` : '—'}</td>
                    <td className="small">{ps.length} รายการ · {[...new Set(ps.map((p) => p.year))].filter(Boolean).sort().join(', ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function CopyKey({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-small no-print"
      title={value}
      onClick={async () => {
        setDone(await copyText(value))
        window.setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? 'คัดลอกแล้ว' : 'คัดลอก key'}
    </button>
  )
}

const SESSION_KEY = 'seen-admin-form'

/** Read/write the unlocked form link: localStorage when "remember on this device", else sessionStorage. */
function readSaved(): Links | null {
  try {
    const v = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    if (!v) return null
    // Older versions saved the bare form link.
    if (!v.startsWith('{')) return { formUrl: v, decisionFormUrl: '' }
    const o = JSON.parse(v) as Partial<Links>
    return { formUrl: o.formUrl ?? '', decisionFormUrl: o.decisionFormUrl ?? '' }
  } catch {
    return null
  }
}
function save(links: Links, remember: boolean) {
  try {
    ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(links))
  } catch {
    /* storage unavailable: stays unlocked until reload */
  }
}
function forget() {
  try {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Decrypts the admin form link with the passcode; a wrong passcode fails AES-GCM authentication. */
async function unlock(gate: NonNullable<DataBundle['sources']['adminGate']>, pass: string): Promise<Links> {
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

/** The admin tab: open only after the passcode is entered (kept for this browser session). */
export function AdminPage(props: { data: DataBundle; pubs: Pub[]; faculty: Faculty[] }) {
  const gate = props.data.sources.adminGate
  const [links, setLinks] = useState<Links | null>(() => {
    if (!gate) return { formUrl: props.data.sources.googleFormUrl ?? '', decisionFormUrl: props.data.sources.decisionFormUrl ?? '' }
    return readSaved()
  })
  const [remember, setRemember] = useState(false)
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (links !== null)
    return (
      <AdminContent
        {...props}
        formUrl={links.formUrl}
        decisionFormUrl={links.decisionFormUrl || props.data.sources.decisionFormUrl || ''}
        onLock={
          gate
            ? () => {
                forget()
                setLinks(null)
              }
            : undefined
        }
      />
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!gate) return
    setBusy(true)
    setError('')
    try {
      const v = await unlock(gate, pass)
      save(v, remember)
      setPass('')
      setLinks(v)
    } catch (e) {
      setError(e instanceof Error && e.message === 'nocrypto' ? 'เบราว์เซอร์นี้ถอดรหัสไม่ได้: ต้องเปิดผ่าน https:// หรือเปิดไฟล์โดยตรง' : 'รหัสไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <form className="panel gate-card" onSubmit={submit}>
        <h1>เพิ่มผลงานด้วยตนเอง</h1>
        <p className="lede">ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น กรุณาใส่รหัสผู้ดูแล</p>
        <label className="control" htmlFor="admin-pass">
          <span className="control-label">รหัสผู้ดูแล</span>
          <input id="admin-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
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
        <button type="submit" className="btn btn-primary" disabled={busy || !pass}>
          {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ส่วนผู้ดูแล'}
        </button>
      </form>
    </div>
  )
}
