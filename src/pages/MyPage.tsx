// Tab "ตรวจสอบคุณสมบัติของฉัน" (#/me): a lecturer signs in with their @up.ac.th e-mail (a one-time
// link sent by the Apps Script backend, apps-script/Code.gs), sees only their own result, and
// can add their own works; added works wait for a level-2 admin (src/submissions.ts).
// The e-mail link opens /me/#login=<code>, which forwards to #/me/login=<code> (scripts/build-personal.mjs).
import { useState, type FormEvent } from 'react'
import type { PersonResult, Settings } from '../rules'
import { PersonPage } from './PersonPage'
import { EmailLogin, api, errorText, sessionStore, useEmailUser } from '../emailLogin'
import { STATUS_TH, TYPE_TH, type Submission, type WorkType } from '../submissions'

export function MyPage({ results, settings, loginCode, submissions, onSubmissionsChanged }: { results: PersonResult[]; settings: Settings; loginCode?: string; submissions: Submission[]; onSubmissionsChanged: () => void }) {
  const { user, checking, notice, logout } = useEmailUser(loginCode)

  if (checking) return <p className="note">กำลังตรวจสอบการเข้าสู่ระบบ…</p>
  if (!user) return <EmailLogin notice={notice} />
  const result = results.find((r) => r.person.nameEn === user.nameEn)
  const mine = submissions.filter((s) => s.nameEn === user.nameEn && s.status !== 'withdrawn')
  return (
    <>
      <div className="me-bar no-print">
        <span>
          เข้าสู่ระบบเป็น <b>{user.email || result?.person.nameTh || user.nameEn}</b> · หน้านี้แสดงเฉพาะข้อมูลของท่าน
        </span>
        <button type="button" className="btn btn-small" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>
      {result ? (
        <>
          <PersonPage result={result} settings={settings} personal />
          <AddWork mine={mine} onChanged={onSubmissionsChanged} />
        </>
      ) : user.isAdmin ? (
        <p className="note">บัญชีนี้เป็นผู้ดูแลที่อนุมัติผลงานได้ ไปที่แถบ สำหรับผู้ดูแลระบบ → เพิ่มผลงานด้วยตนเอง</p>
      ) : (
        <p className="gate-error">{errorText('not_found')}</p>
      )}
    </>
  )
}

const EMPTY = { year: '', title: '', authors: '', type: '' as WorkType | '', venue: '', volume: '', doi: '', research: '' as '' | 'yes' | 'no' }

/** Form for a lecturer's own work + the list of works they have added. */
function AddWork({ mine, onChanged }: { mine: Submission[]; onChanged: () => void }) {
  const [w, setW] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  // Withdraw: one click. The row is hidden at once and the button shows progress while the
  // backend answers (2–3 s), so nobody clicks twice (Tum, 2026-11-07).
  const [withdrawing, setWithdrawing] = useState('')
  const [gone, setGone] = useState<string[]>([])
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setW({ ...w, [k]: e.target.value })
  const thisYear = new Date().getFullYear()
  const valid = Number(w.year) >= 1990 && Number(w.year) <= thisYear + 1 && w.title.trim() && w.type && w.venue.trim() && w.research

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError('')
    setDone('')
    try {
      const r = await api({ action: 'submit', session: sessionStore.get(), work: { ...w, year: Number(w.year), research: w.research === 'yes' } })
      if (r.ok) {
        setW(EMPTY)
        setDone('ส่งผลงานแล้ว ผลงานจะแสดงเป็น "รออนุมัติ" และยังไม่นับ จนกว่าผู้ดูแลจะอนุมัติ')
        onChanged()
      } else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (id: string) => {
    if (withdrawing) return
    setWithdrawing(id)
    setError('')
    const r = await api({ action: 'withdraw', session: sessionStore.get(), id }).catch(() => ({ ok: false, error: '' }) as const)
    if (r.ok) {
      setGone((g) => [...g, id])
      onChanged()
    } else setError(errorText(r.error))
    setWithdrawing('')
  }
  const shown = mine.filter((s) => !gone.includes(s.id))

  return (
    <section className="panel add-work no-print" aria-labelledby="add-work-title">
      <h2 id="add-work-title" className="block-title">
        เพิ่มผลงานของฉัน <small className="title-hint">(ผลงานที่ยังไม่มีในระบบ เช่น บทความในวารสารไทย หรือ proceedings ของงานประชุมในประเทศ)</small>
      </h2>
      <p className="note">ผลงานที่ส่งจะแสดงเป็น "รออนุมัติ" และยังไม่นับในการประเมิน จนกว่าผู้ดูแลระดับ 2 จะอนุมัติ</p>
      <form className="work-form" onSubmit={submit}>
        <label className="wf wf-year">
          <span>ปีที่ตีพิมพ์ (ค.ศ.) *</span>
          <input type="number" inputMode="numeric" min={1990} max={thisYear + 1} placeholder={String(thisYear)} value={w.year} onChange={set('year')} required />
        </label>
        <label className="wf wf-type">
          <span>ประเภทผลงาน *</span>
          <select value={w.type} onChange={set('type')} required>
            <option value="">เลือกประเภท…</option>
            {(Object.keys(TYPE_TH) as WorkType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_TH[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="wf wf-wide">
          <span>ชื่อผลงาน *</span>
          <input type="text" value={w.title} onChange={set('title')} maxLength={600} required />
        </label>
        <label className="wf wf-wide">
          <span>ผู้แต่ง</span>
          <input type="text" placeholder="เช่น Teerachai Amnuaylojaroen, Somchai Jaidee…" value={w.authors} onChange={set('authors')} maxLength={800} />
          <small>เขียนชื่อเต็มทุกคนตามลำดับในบทความ คั่นด้วยเครื่องหมายจุลภาค (,)</small>
        </label>
        <label className="wf wf-wide">
          <span>ชื่อวารสารหรืองานประชุม *</span>
          <input type="text" value={w.venue} onChange={set('venue')} maxLength={300} required />
        </label>
        <label className="wf">
          <span>ปีที่/ฉบับที่/หน้า</span>
          <input type="text" placeholder="เช่น 12(3), 45–60" value={w.volume} onChange={set('volume')} maxLength={120} />
        </label>
        <label className="wf">
          <span>DOI หรือ URL</span>
          <input type="text" inputMode="url" spellCheck={false} placeholder="เช่น 10.1234/abcd.2024.001" value={w.doi} onChange={set('doi')} maxLength={300} />
        </label>
        <fieldset className="wf wf-wide wf-radio">
          <legend>เป็นงานวิจัยหรือไม่ *</legend>
          <label>
            <input type="radio" name="research" value="yes" checked={w.research === 'yes'} onChange={set('research')} /> ใช่ (งานวิจัย)
          </label>
          <label>
            <input type="radio" name="research" value="no" checked={w.research === 'no'} onChange={set('research')} /> ไม่ใช่ (เช่น บทความวิชาการ/ปริทัศน์)
          </label>
        </fieldset>
        {error && (
          <p className="gate-error wf-wide" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="wf-done wf-wide" role="status">
            {done}
          </p>
        )}
        <div className="wf-wide">
          <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
            {busy ? 'กำลังส่ง…' : 'ส่งผลงานเพื่อรออนุมัติ'}
          </button>
        </div>
      </form>

      <h3 className="mine-title">ผลงานที่ฉันเพิ่ม ({mine.length})</h3>
      {shown.length === 0 ? (
        <p className="note">ยังไม่มีผลงานที่เพิ่มเอง</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ปี</th>
                <th>ผลงาน</th>
                <th>ประเภท</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{s.year}</td>
                  <td>
                    <div className="pub-title">{s.title}</div>
                    <div className="muted small">{[s.venue, s.volume].filter(Boolean).join(' ')}</div>
                  </td>
                  <td className="small">{TYPE_TH[s.type]}</td>
                  <td>
                    <span className={`sub-status sub-${s.status}`}>{STATUS_TH[s.status]}</span>
                    {s.note && <div className="muted small">{s.note}</div>}
                  </td>
                  <td>
                    {s.status === 'pending' && (
                      <button type="button" className="btn btn-small" disabled={withdrawing === s.id} onClick={() => void withdraw(s.id)}>
                        {withdrawing === s.id ? 'กำลังถอน…' : 'ถอน'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
