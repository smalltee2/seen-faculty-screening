import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConferenceEntry, DataBundle, Pub, PubSource } from '../types'
import { Segmented, TYPE_LABEL, displayName, yearLabel } from '../ui'
import { toBE } from '../rules'
import { CONFERENCE_TAG } from '../conferences'
import { api, errorText, sessionStore, useEmailUser } from '../emailLogin'
import { STATUS_TH, TYPE_TH, conferenceSubmissions, type Submission, type SubmissionStatus } from '../submissions'
import type { Faculty } from '../types'
import type { FormCancelItem } from '../formCancel'
import leafIcon from '../assets/leaf-spinner.png'
import { FreshnessPanel } from '../FreshnessPanel'
import { InfoTip } from '../InfoTip'
import { conferenceGroups, undecidedGroups } from '../pending'
import { byWhenDesc } from '../when'
import { fetchScholarJob, newScholarRows, parseScholarTsv, scholarUrl, snippetFor, type ScholarImportItem, type ScholarJob } from '../scholarImport'

export function AdminPage({ data, pubs, scholarItems = null, onScholarChanged = () => undefined, faculty, formUrl, onLock, submissions = [], onSubmissionsChanged = () => undefined, approvalKey, conferences = data.conferences ?? [], onConferencesChanged = () => undefined, formCancelled = [], onFormChanged = () => undefined }: { data: DataBundle; pubs: Pub[]; scholarItems?: ScholarImportItem[] | null; onScholarChanged?: () => void; faculty: Faculty[]; formUrl: string; onLock?: () => void; submissions?: Submission[]; onSubmissionsChanged?: () => unknown; approvalKey?: string; conferences?: ConferenceEntry[]; onConferencesChanged?: () => unknown; formCancelled?: FormCancelItem[]; onFormChanged?: () => unknown }) {
  const rawCount = (s: PubSource) => data.publications.filter((p) => (p.source ?? 'scholar') === s).length
  const scholar = useScholarJob(approvalKey)

  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            เพิ่มผลงานด้วยตนเอง{' '}
            <small className="title-hint">(เพิ่มผลงานที่ยังไม่มีใน Scholar, OpenAlex หรือ Scopus เช่น บทความในวารสารไทย หรือ proceedings ของงานประชุมในประเทศ)</small>{' '}
            <InfoTip label="คำอธิบาย">
              <RegisterExplain pubs={pubs} screening={data.conferenceScreening === 'on'} />
            </InfoTip>
          </h1>
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
          <h3>แหล่งข้อมูล</h3>
          <FreshnessPanel
            builtAt={data.builtAt}
            freshness={data.freshness}
            counts={{ openalex: rawCount('openalex'), scopus: rawCount('scopus'), tci: rawCount('tci'), forms: rawCount('manual'), scholar: rawCount('scholar'), crossref: data.crossref?.length ?? 0 }}
            actions={{ scholar: <ScholarButton scholar={scholar} /> }}
            newWorks={data.newWorks}
            nameOf={(k) => { const f = data.faculty.find((x) => x.nameEn === k); return f ? displayName(f) : k }}
          />
          <p className="note">
            รวมรายการซ้ำจากหลายแหล่งด้วย DOI หรือชื่อเรื่อง · Google Scholar ดึงอัตโนมัติไม่ได้ จึงให้ผู้ดูแลระดับ 2 กด "อัปเดตจาก Google Scholar" เป็นครั้งคราว
          </p>
        </section>

        <ScholarStatus scholar={scholar}>
          <ScholarImport faculty={faculty} pubs={pubs} raw={data.publications} items={scholarItems} approvalKey={approvalKey} onChanged={onScholarChanged} />
        </ScholarStatus>
      </div>

      {/* Coloured frames so the three work lists are easy to tell apart (Tum, 2026-11-11) */}
      <section className="admin-box admin-box-self" aria-label="ผลงานที่อาจารย์เพิ่มเอง">
        <ApproveWorks submissions={submissions} faculty={faculty} onChanged={onSubmissionsChanged} approvalKey={approvalKey} conferences={conferences} onConfChanged={onConferencesChanged} />
      </section>

      {/* Pending proceedings/posters lecturers added also enter the register, so the conference can be judged before approval */}
      <section className="admin-box admin-box-conf" aria-label="ทะเบียนงานประชุม">
        <ConferenceRegister pubs={pubs} faculty={faculty} pendingPubs={conferenceSubmissions(submissions, conferences).filter((x) => x.sub.status === 'pending').map((x) => x.pub)} approvalKey={approvalKey} onChanged={onConferencesChanged} />
      </section>

      <FormWorks pubs={pubs} faculty={faculty} formUrl={formUrl} approvalKey={approvalKey} formCancelled={formCancelled} onFormChanged={onFormChanged} />
    </>
  )
}

/** "ผลงานที่เพิ่มผ่านแบบฟอร์ม": works added through the admin Google Form, with cancel/restore.
 *  Used by AdminPage (sfs.html) and by the web app's own page (sfs_webapp.html), 2026-11-11. */
export function FormWorks({ pubs, faculty, formUrl, approvalKey, formCancelled = [], onFormChanged = () => undefined }: { pubs: Pub[]; faculty: Faculty[]; formUrl: string; approvalKey?: string; formCancelled?: FormCancelItem[]; onFormChanged?: () => unknown }) {
  // Admin-form works only; works lecturers added themselves (submitted "self:…") are in the approval table.
  const manual = pubs.filter((p) => p.sources.includes('manual') && !p.submitted?.startsWith('self:')).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const person = (key: string) => faculty.find((f) => f.nameEn === key)
  return (
    <>
      {/* Steps box removed (Tum, 2026-11-07); the admin form button moved here */}
      <section className="admin-box admin-box-form" aria-label="ผลงานที่เพิ่มผ่านแบบฟอร์ม">
      <div className="block-head-row">
        <h2 className="block-title">ผลงานที่เพิ่มผ่านแบบฟอร์ม · {manual.length} รายการ</h2>
        {formUrl ? (
          <a className="btn btn-primary no-print" href={formUrl} target="_blank" rel="noreferrer">
            เปิดแบบฟอร์มเพิ่มผลงาน ↗
          </a>
        ) : (
          <span className="note">ยังไม่ได้ตั้งค่าลิงก์แบบฟอร์ม</span>
        )}
      </div>
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
                <th>การจัดการ</th>
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
                    <td className="nowrap">
                      <FormCancelButton nameEn={p.key} title={p.title} action="cancel" approvalKey={approvalKey} onChanged={onFormChanged} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {formCancelled.length > 0 && (
        <details className="form-cancelled">
          <summary>ผลงานจากแบบฟอร์มที่ยกเลิกแล้ว · {formCancelled.length} รายการ (ไม่นับ)</summary>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>อาจารย์</th>
                  <th>ชื่อผลงาน</th>
                  <th>ยกเลิกเมื่อ / โดย</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {formCancelled.map((c) => {
                  const f = person(c.nameEn)
                  return (
                    <tr key={`${c.nameEn}|${c.titleNorm}`} className="greyed">
                      <td>{f ? displayName(f) : c.nameEn}</td>
                      <td><div className="pub-title">{c.title}</div></td>
                      <td className="small muted">{c.at ? new Date(c.at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—'} · {c.by}</td>
                      <td className="nowrap"><FormCancelButton nameEn={c.nameEn} title={c.title} titleNorm={c.titleNorm} action="restore" approvalKey={approvalKey} onChanged={onFormChanged} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      </section>
    </>
  )
}

/** "ยกเลิกผลงาน" / "คืนผลงาน" for one admin-form work (level-2 admin; src/formCancel.ts). */
function FormCancelButton({ nameEn, title, titleNorm, action, approvalKey, onChanged }: { nameEn: string; title: string; titleNorm?: string; action: 'cancel' | 'restore'; approvalKey?: string; onChanged: () => unknown }) {
  const { user } = useEmailUser()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  if (!approvalKey && !user?.isAdmin) return null
  const send = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api({ action: 'formCancel', adminKey: approvalKey ?? '', session: sessionStore.get(), nameEn, title, titleNorm: titleNorm ?? '', mode: action })
      if (r.ok) {
        await onChanged() // spinner stays until the table shows the change
        setConfirm(false)
      } else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  if (action === 'restore')
    return (
      <span className="conf-buttons no-print">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void send()}>คืนผลงาน</button>
        {busy && <LeafSpinner />}
        {error && <span className="gate-error small">{error}</span>}
      </span>
    )
  return (
    <span className="conf-buttons no-print">
      {confirm ? (
        <>
          <span className="small">ยกเลิกผลงานนี้? ระบบจะไม่นับ</span>{' '}
          <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void send()}>ยืนยัน</button>{' '}
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirm(false)}>ไม่</button>
        </>
      ) : (
        <button type="button" className="btn btn-small" onClick={() => setConfirm(true)}>ยกเลิกผลงาน</button>
      )}
      {busy && <LeafSpinner />}
      {error && <span className="gate-error small">{error}</span>}
    </span>
  )
}

/** Same window as the automatic check: papers that can still fall in this year's or next year's 5-year window. */
export function registerWindow(pubs: Pub[]) {
  const minYear = new Date().getFullYear() - 5
  const older = pubs.filter((p) => (p.type === 'proceeding' || p.type === 'poster') && p.conference && (p.year ?? 0) < minYear).length
  return { minYear, older }
}

/** "คำอธิบาย" for the admin page, shown by the (i) after the page title (Tum, 2026-11-11). Spans only, as it sits inside the <h1>. */
function RegisterExplain({ pubs, screening }: { pubs: Pub[]; screening: boolean }) {
  const { minYear, older } = registerWindow(pubs)
  return (
    <span className="explain-pop">
      <span className="explain-pop-title">คำอธิบาย</span>
      <span className="explain-list">
        <span className="explain-item">
          <b>ช่วงที่แสดง:</b> ทะเบียนงานประชุมแสดงงานที่มีผลงานของอาจารย์ตั้งแต่ พ.ศ. {toBE(minYear)} ({minYear}) ซึ่งยังอยู่ในช่วงประเมินของปีนี้หรือปีหน้า
          {older > 0 && <span className="muted"> (ผลงานที่เก่ากว่านี้ {older} รายการ ไม่ต้องตรวจ)</span>}
        </span>
        <span className="explain-item">
          <b>เกณฑ์ที่นับ:</b> proceedings นับได้เมื่อ (1) สมาคมวิชาการหรือวิชาชีพเป็นผู้จัดหรือร่วมจัด และ (2) งานประชุมอยู่ในสาขาสิ่งแวดล้อมหรือพลังงาน
        </span>
        <span className="explain-item">
          <b>การตรวจ:</b> AI ค้นหาผู้จัดให้อัตโนมัติ (ดูคอลัมน์ "ตรวจโดย") ผล AI เป็นเพียงคำแนะนำ (แนะนำให้นับ / แนะนำไม่นับ) ทุกงานประชุมจะอยู่ในสถานะ "รอตรวจสอบ" และยังไม่นับ จนกว่าผู้ดูแลระดับ 2 จะกด "นับ" หรือ "ไม่นับ" เมื่อกดแล้วงานประชุมจะย้ายไปอยู่ในแถบ "ตัดสินแล้ว" และกด "ยกเลิกการตัดสิน" ได้ที่นั่น
        </span>
        {!screening && (
          <span className="explain-item">
            <b>หมายเหตุ:</b> ขณะนี้ปิดการใช้ทะเบียนในการคำนวณ จึงยังนับ proceedings ทุกรายการ
          </span>
        )}
      </span>
    </span>
  )
}

/** Every conference seen among proceedings, with the register's verdict; admins edit data/conferences.csv. */
function ConferenceRegister({ pubs, faculty, pendingPubs = [], approvalKey, onChanged }: { pubs: Pub[]; faculty: Faculty[]; pendingPubs?: Pub[]; approvalKey?: string; onChanged: () => unknown }) {
  const { minYear } = registerWindow(pubs)
  // Status tabs like "ผลงานที่อาจารย์เพิ่มเอง" (Tum, 2026-11-11): awaiting นับ/ไม่นับ, decided, all.
  // "ยกเลิกการตัดสิน" on a decided row puts it back under รอตัดสิน.
  const all = conferenceGroups(pubs, pendingPubs, minYear)
  const waiting = undecidedGroups(all)
  const decided = all.filter((g) => !waiting.includes(g))
  const [show, setShow] = useState<'pending' | 'decided' | 'all'>('pending')
  const rows = show === 'pending' ? waiting : show === 'decided' ? decided : all
  // Year filter and 10 conferences per page (Tum, 2026-11-07), so the register stays short as it grows.
  const [year, setYear] = useState<number | 'all'>('all')
  const [page, setPage] = useState(0)
  const yearsInRows = [...new Set(rows.flatMap((r) => r.pubs.map((p) => p.year)).filter((y): y is number => y !== null))].sort((a, b) => b - a)
  const filtered = year === 'all' || !yearsInRows.includes(year) ? rows : rows.filter((r) => r.pubs.some((p) => p.year === year))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)
  return (
    <>
      <h2 className="block-title">
        ทะเบียนงานประชุม (proceedings) จำนวน {all.length} งาน <small className="title-hint">รอตัดสิน {waiting.length} งาน</small>
      </h2>
      {all.length > 0 && (
        <div className="register-tools no-print">
          <Segmented
            label="แสดงงานประชุม"
            value={show}
            onChange={(v) => {
              setShow(v)
              setPage(0)
            }}
            options={[
              { id: 'pending', label: `รอตัดสิน (${waiting.length})` },
              { id: 'decided', label: `ตัดสินแล้ว (${decided.length})` },
              { id: 'all', label: `ทั้งหมด (${all.length})` },
            ]}
          />
          {rows.length > 0 && (
            <>
          <label className="control" htmlFor="register-year">
            <span className="control-label">ปีของผลงาน</span>
            <select
              id="register-year"
              value={year !== 'all' && yearsInRows.includes(year) ? year : 'all'}
              onChange={(e) => {
                setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))
                setPage(0)
              }}
            >
              <option value="all">ทุกปี</option>
              {yearsInRows.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {toBE(y)} ({y})
                </option>
              ))}
            </select>
          </label>
          <span className="muted small">
            {filtered.length === 0 ? 'ไม่มีงานประชุมในปีนี้' : `แสดง ${cur * PAGE_SIZE + 1}–${cur * PAGE_SIZE + shown.length} จาก ${filtered.length} งาน`}
          </span>
            </>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="note">{all.length === 0 ? 'ไม่มี proceedings ในข้อมูล' : show === 'pending' ? 'ไม่มีงานประชุมรอตัดสิน' : 'ยังไม่มีงานประชุมที่ตัดสินแล้ว'}</p>
      ) : filtered.length === 0 ? null : (
        <>
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
              {shown.map(({ match, pubs: ps, pending: np }) => {
                const e = match.entry
                return (
                  <tr key={match.key}>
                    <td>
                      <div className="pub-title">{e?.conferenceName || ps[0].venue}</div>
                      <div className="muted small">{match.key.startsWith('work:') ? ps[0].title : ps[0].venue}</div>
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
                      <ConfButtons ckey={match.key} name={e?.conferenceName || ps[0].venue} decided={!!e?.decision} approvalKey={approvalKey} onChanged={onChanged} />
                    </td>
                    <td className="small muted">{match.by === 'admin' ? (e?.decidedBy?.startsWith('ผู้ดูแล') ? e.decidedBy : `ผู้ดูแล${e?.decidedBy ? ` (${e.decidedBy})` : ''}`) : e ? `AI (${e.checkedAt.slice(0, 10)}) ความมั่นใจ ระดับ ${e.confidence}` : '—'}</td>
                    <td className="small">
                      {new Set(ps.map((p) => p.titleNorm)).size} รายการ · {[...new Set(ps.map((p) => p.year))].filter(Boolean).sort().join(', ')}
                      {np > 0 && <div className="sub-status sub-pending">รออนุมัติ {np} (อาจารย์เพิ่มเอง)</div>}
                      {/* Each work at this conference with its lecturers (Tum, 2026-11-10) */}
                      <ul className="conf-works">
                        {[...new Map(ps.map((p) => [p.titleNorm, p])).values()].map((w) => (
                          <li key={w.titleNorm}>
                            <div className="conf-work-title">{w.title} <span className="muted">({w.year ?? '—'})</span></div>
                            <div className="conf-people">
                              {[...new Set(ps.filter((p) => p.titleNorm === w.titleNorm).map((p) => p.key))].map((k) => {
                                const f = faculty.find((x) => x.nameEn === k)
                                return <span key={k}>{f ? <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>{displayName(f)}</a> : k}</span>
                              })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && <Pager page={cur} pages={pages} onPage={setPage} />}
        </>
      )}
    </>
  )
}

export const PAGE_SIZE = 10

/** Page buttons: previous, numbered pages, next. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <nav className="pager no-print" aria-label="เลือกหน้าทะเบียนงานประชุม">
      <button type="button" className="btn btn-small" disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹ ก่อนหน้า
      </button>
      {Array.from({ length: pages }, (_, i) => (
        <button key={i} type="button" className={`btn btn-small${i === page ? ' btn-primary' : ''}`} aria-current={i === page ? 'page' : undefined} onClick={() => onPage(i)}>
          {i + 1}
        </button>
      ))}
      <button type="button" className="btn btn-small" disabled={page === pages - 1} onClick={() => onPage(page + 1)}>
        ถัดไป ›
      </button>
    </nav>
  )
}


/** Works lecturers added themselves, for a level-2 admin to approve or reject (2026-11-07).
 *  The level-2 sign-in carries an approval key the backend checks; an admin signed in by e-mail
 *  (listed in the admins sheet) can also decide. */
function ApproveWorks({ submissions, faculty, onChanged, approvalKey, conferences, onConfChanged }: { submissions: Submission[]; faculty: Faculty[]; onChanged: () => unknown; approvalKey?: string; conferences: ConferenceEntry[]; onConfChanged: () => unknown }) {
  const { user, checking } = useEmailUser()
  const [show, setShow] = useState<'pending' | 'decided' | 'all'>('pending')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const name = (key: string) => {
    const f = faculty.find((x) => x.nameEn === key)
    return f ? displayName(f) : key
  }
  const live = submissions.filter((s) => s.status !== 'withdrawn')
  const pending = live.filter((s) => s.status === 'pending')
  const decided = live.filter((s) => s.status !== 'pending')
  const rows = (show === 'pending' ? pending : show === 'decided' ? decided : live).slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || byWhenDesc(a.created, b.created))
  const canDecide = !!approvalKey || !!user?.isAdmin
  // Conference check for proceedings/posters, same register as below (src/conferences.ts).
  const confOf = new Map(conferenceSubmissions(submissions, conferences).map((x) => [x.sub.id, x.pub.conference]))

  const decide = async (id: string, status: SubmissionStatus) => {
    setBusy(id)
    setError('')
    try {
      const r = await api({ action: 'decide', session: sessionStore.get(), adminKey: approvalKey ?? '', id, status })
      if (r.ok) await onChanged() // spinner stays until the table shows the new status
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <h2 className="block-title">
        ผลงานที่อาจารย์เพิ่มเอง <small className="title-hint">รออนุมัติ {pending.length} รายการ</small>
      </h2>
      <div className="register-tools no-print">
        <Segmented
          label="แสดงผลงานที่อาจารย์เพิ่มเอง"
          value={show}
          onChange={setShow}
          options={[
            { id: 'pending', label: `รออนุมัติ (${pending.length})` },
            { id: 'decided', label: `ตัดสินแล้ว (${decided.length})` },
            { id: 'all', label: `ทั้งหมด (${live.length})` },
          ]}
        />
        {approvalKey ? (
          null
        ) : checking ? (
          <span className="muted small">กำลังตรวจสอบการเข้าสู่ระบบ…</span>
        ) : canDecide ? (
          <span className="muted small">อนุมัติในนาม {user?.email}</span>
        ) : user ? (
          <span className="gate-error small">{errorText('not_admin')}</span>
        ) : (
          <span className="small">
            รหัสผู้ดูแลชุดนี้ยังไม่มีกุญแจอนุมัติ ใส่รหัสระดับ 2 ใหม่ หรือ <a className="btn btn-small" href="#/me">เข้าสู่ระบบด้วยอีเมลผู้ดูแล</a>
          </span>
        )}
      </div>
      {error && (
        <p className="gate-error" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="note">{show === 'pending' ? 'ไม่มีผลงานรออนุมัติ' : show === 'decided' ? 'ยังไม่มีผลงานที่ตัดสินแล้ว' : 'ยังไม่มีผลงานที่อาจารย์เพิ่มเอง'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>อาจารย์</th>
                <th>ปี</th>
                <th>ผลงาน</th>
                <th>ประเภท</th>
                <th>สถานะ</th>
                <th>การอนุมัติ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap small">{name(s.nameEn)}</td>
                  <td className="nowrap">{s.year}</td>
                  <td>
                    <div className="pub-title">{s.title}</div>
                    <div className="muted small">{[s.authors, [s.venue, s.volume].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
                    {s.doi && (
                      <a className="small" href={/^https?:/i.test(s.doi) ? s.doi : `https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
                        {s.doi} ↗
                      </a>
                    )}
                  </td>
                  <td className="small">
                    {TYPE_TH[s.type]}
                    <div className="muted">{s.research ? 'งานวิจัย' : 'ไม่ใช่งานวิจัย'}</div>
                    {(() => {
                      const c = confOf.get(s.id)
                      if (!c) return null
                      return (
                        <div className="sub-conf">
                          <span className={`jl cf cf-${c.verdict}`}>งานประชุม: {CONFERENCE_TAG[c.verdict]}</span>
                          <ConfButtons ckey={c.key} name={s.venue} decided={!!c.entry?.decision} approvalKey={approvalKey} onChanged={onConfChanged} />
                        </div>
                      )
                    })()}
                  </td>
                  <td>
                    <span className={`sub-status sub-${s.status}`}>{STATUS_TH[s.status]}</span>
                    <div className="muted small">ส่งเมื่อ {s.created ? new Date(s.created).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—'}</div>
                  </td>
                  <td className="nowrap">
                    {canDecide &&
                      (s.status === 'pending' ? (
                        <>
                          <button type="button" className="btn btn-small btn-primary" disabled={!!busy} onClick={() => void decide(s.id, 'approved')}>
                            อนุมัติ
                          </button>{' '}
                          <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => void decide(s.id, 'rejected')}>
                            ไม่อนุมัติ
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => void decide(s.id, 'pending')}>
                          ยกเลิกการตัดสิน
                        </button>
                      ))}
                    {busy === s.id && <LeafSpinner />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** "นับ / ไม่นับ / ยกเลิกการตัดสิน" for one conference (replaces the decision form, 2026-11-07).
 *  Allowed with the level-2 approval key, or for an admin signed in by e-mail. */
export function ConfButtons({ ckey, name, decided, approvalKey, onChanged }: { ckey: string; name: string; decided: boolean; approvalKey?: string; onChanged: () => unknown }) {
  const { user } = useEmailUser()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!approvalKey && !user?.isAdmin) return null
  const send = async (decision: 'count' | 'no_count' | 'clear') => {
    setBusy(true)
    setError('')
    try {
      const r = await api({ action: 'confDecide', adminKey: approvalKey ?? '', session: sessionStore.get(), key: ckey, decision, name })
      if (r.ok) await onChanged() // spinner stays until the register shows the new result
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="conf-buttons no-print">
      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void send('count')}>
        นับ
      </button>
      <button type="button" className="btn btn-small" disabled={busy} onClick={() => void send('no_count')}>
        ไม่นับ
      </button>
      {decided && (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void send('clear')}>
          ยกเลิกการตัดสิน
        </button>
      )}
      {busy && <LeafSpinner />}
      {error && <span className="gate-error small">{error}</span>}
    </div>
  )
}

/** Turning three-leaf icon shown while a decision is saved (Tum, 2026-11-10). */
export function LeafSpinner() {
  return (
    <span className="leaf-spinner" role="status">
      <img src={leafIcon} alt="" width={22} height={22} />
      <span className="sr-only">กำลังบันทึก…</span>
    </span>
  )
}

/** "นำเข้าจาก Google Scholar" (Tum, 2026-11-08): a level-2 admin copies a lecturer's Scholar list in
 *  their own browser with the export snippet, pastes it here, checks which rows are new and imports
 *  them (Apps Script scholarImport). Nothing here contacts Scholar. Each import can be undone. */
export function ScholarImport({ faculty, pubs, raw, items, approvalKey, onChanged }: { faculty: Faculty[]; pubs: Pub[]; raw: { key: string; title: string }[]; items: ScholarImportItem[] | null; approvalKey?: string; onChanged: () => void }) {
  const [nameEn, setNameEn] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState<'' | 'ok' | 'manual'>('')
  const [armed, setArmed] = useState('')
  const person = faculty.find((f) => f.nameEn === nameEn)
  const sorted = [...faculty].sort((a, b) => (a.nameTh || a.nameEn).localeCompare(b.nameTh || b.nameEn, 'th'))
  const lastAt = new Map<string, string>()
  for (const it of items ?? []) if (it.at > (lastAt.get(it.nameEn) ?? '')) lastAt.set(it.nameEn, it.at)
  const parsed = useMemo(() => parseScholarTsv(text), [text])
  const other = parsed.rows.filter((r) => r.key !== nameEn)
  const known = useMemo(() => [...pubs.map((p) => ({ key: p.key, title: p.title })), ...raw], [pubs, raw])
  const fresh = useMemo(() => (nameEn ? newScholarRows(parsed.rows.filter((r) => r.key === nameEn), nameEn, known) : []), [parsed, nameEn, known])
  const batches = useMemo(() => {
    const m = new Map<string, { batch: string; nameEn: string; at: string; by: string; n: number }>()
    for (const it of items ?? []) {
      const b = m.get(it.batch) ?? { batch: it.batch, nameEn: it.nameEn, at: it.at, by: it.by, n: 0 }
      b.n++
      m.set(it.batch, b)
    }
    return [...m.values()].sort((a, b) => byWhenDesc(a.at, b.at))
  }, [items])
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '—')
  const nameOf = (key: string) => {
    const f = faculty.find((x) => x.nameEn === key)
    return f ? displayName(f) : key
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippetFor(nameEn))
      setCopied('ok')
    } catch {
      setCopied('manual')
    }
  }
  const doImport = async () => {
    if (!approvalKey || !fresh.length) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api({ action: 'scholarImport', adminKey: approvalKey, nameEn, rows: fresh.map(({ key: _k, ...w }) => w) })
      if (r.ok) {
        setMsg({ ok: true, text: `นำเข้าแล้ว ${Number(r.added) || 0} รายการ${Number(r.skipped) ? ` · ข้าม ${Number(r.skipped)} รายการที่มีอยู่แล้ว` : ''}` })
        setText('')
        onChanged()
      } else setMsg({ ok: false, text: errorText(r.error) })
    } catch {
      setMsg({ ok: false, text: errorText('') })
    } finally {
      setBusy(false)
    }
  }
  const undo = async (batch: string) => {
    if (armed !== batch) return setArmed(batch)
    setArmed('')
    setBusy(true)
    try {
      const r = await api({ action: 'scholarRemove', adminKey: approvalKey, batch })
      setMsg(r.ok ? { ok: true, text: `ยกเลิกการนำเข้าแล้ว ${Number(r.removed) || 0} รายการ` } : { ok: false, text: errorText(r.error) })
      if (r.ok) onChanged()
    } catch {
      setMsg({ ok: false, text: errorText('') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scholar-import">
      <ol className="scholar-steps">
        <li>
          <label htmlFor="scholar-person">เลือกอาจารย์</label>{' '}
          <select id="scholar-person" value={nameEn} onChange={(e) => { setNameEn(e.target.value); setText(''); setMsg(null); setCopied('') }}>
            <option value="">— เลือก —</option>
            {sorted.map((f) => (
              <option key={f.nameEn} value={f.nameEn} disabled={!f.scholarId}>
                {displayName(f)}
                {!f.scholarId ? ' (ไม่มีโปรไฟล์ Scholar)' : lastAt.has(f.nameEn) ? ` · นำเข้าล่าสุด ${new Date(lastAt.get(f.nameEn)!).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })}` : ''}
              </option>
            ))}
          </select>
        </li>
        <li>
          {person?.scholarId ? (
            <>
              <a className="btn" href={scholarUrl(person.scholarId)} target="_blank" rel="noreferrer">เปิดหน้า Scholar ของอาจารย์ ↗</a>{' '}
              <button type="button" className="btn" onClick={() => void copy()}>คัดลอกสคริปต์</button>{' '}
              {copied === 'ok' && <span className="note">คัดลอกแล้ว</span>}
            </>
          ) : (
            <span className="note">เปิดหน้า Scholar และคัดลอกสคริปต์ (เลือกอาจารย์ก่อน)</span>
          )}
          <p className="note">
            ที่หน้า Scholar กด Cmd+Option+J (Windows: Ctrl+Shift+J) เพื่อเปิด Console วางสคริปต์แล้วกด Enter (Chrome ครั้งแรกให้พิมพ์ allow pasting ก่อน) สคริปต์จะโหลดรายการทั้งหมดและคัดลอกให้อัตโนมัติ
          </p>
          {copied === 'manual' && <textarea className="scholar-snippet" readOnly rows={4} value={snippetFor(nameEn)} onFocus={(e) => e.currentTarget.select()} aria-label="สคริปต์สำหรับคัดลอก" />}
        </li>
        <li>
          <label htmlFor="scholar-paste">วางรายการที่คัดลอกมา</label>
          <textarea id="scholar-paste" className="scholar-paste" rows={5} value={text} disabled={!nameEn} onChange={(e) => { setText(e.target.value); setMsg(null) }} placeholder="วางที่นี่ (Cmd+V)" />
        </li>
      </ol>

      {text.trim() && nameEn && (
        <div className="scholar-preview">
          <p>
            อ่านได้ <b>{parsed.rows.length}</b> รายการ · มีในระบบแล้ว <b>{parsed.rows.length - other.length - fresh.length}</b> · ใหม่ <b>{fresh.length}</b>
            {parsed.bad > 0 && <span className="muted"> · อ่านไม่ได้ {parsed.bad} บรรทัด</span>}
          </p>
          {other.length > 0 && <p className="warn-text">มี {other.length} รายการเป็นของ {[...new Set(other.map((r) => r.key))].join(', ')} ไม่ใช่อาจารย์ที่เลือก จะไม่นำเข้า</p>}
          {fresh.length > 0 && (
            <div className="table-wrap scholar-new">
              <table className="data compact">
                <thead>
                  <tr><th>ปี</th><th>ชื่อเรื่อง</th><th>แหล่งตีพิมพ์</th></tr>
                </thead>
                <tbody>
                  {fresh.map((r, i) => (
                    <tr key={`${i}|${r.title}`}><td className="mono">{r.year ? toBE(r.year) : '—'}</td><td>{r.title}</td><td>{r.venue}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {approvalKey ? (
            <button type="button" className="btn btn-primary" disabled={busy || !fresh.length} onClick={() => void doImport()}>
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${fresh.length} รายการ`}
            </button>
          ) : (
            <p className="note">ต้องเข้าสู่ระบบด้วยรหัสผู้ดูแลระดับ 2 จึงจะนำเข้าได้</p>
          )}
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-text' : 'warn-text'} role="status">{msg.text}</p>}

      {batches.length > 0 && (
        <details className="scholar-history">
          <summary>ประวัติการนำเข้า · {batches.length} ครั้ง</summary>
          <div className="table-wrap">
            <table className="data compact">
              <thead>
                <tr><th>เวลา</th><th>อาจารย์</th><th className="num">รายการ</th><th>โดย</th><th /></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch}>
                    <td>{when(b.at)}</td>
                    <td>{nameOf(b.nameEn)}</td>
                    <td className="num mono">{b.n}</td>
                    <td>{b.by}</td>
                    <td>
                      {approvalKey && (
                        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void undo(b.batch)}>
                          {armed === b.batch ? 'กดอีกครั้งเพื่อยืนยัน' : 'ยกเลิกการนำเข้า'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {items === null && <p className="note">อ่านรายการนำเข้าจากระบบไม่ได้ในขณะนี้</p>}
    </div>
  )
}

const JOB_TH: Record<ScholarJob['status'], string> = {
  requested: 'รอระบบรับงาน',
  running: 'กำลังดึงข้อมูลจาก Google Scholar',
  done: 'เสร็จแล้ว',
  blocked: 'หยุด: Google Scholar ขอให้ยืนยันว่าไม่ใช่บอต',
  failed: 'ไม่สำเร็จ',
}

/** "อัปเดตจาก Google Scholar" (Tum, 2026-11-08): one button queues a refresh of every lecturer's
 *  Scholar list; the iMac job (scripts/scholar-poll.sh, every 5 min) runs it and reports here.
 *  The paste method stays below as the fallback when Scholar blocks the iMac. */
export type ScholarState = ReturnType<typeof useScholarJob>

/** The Google Scholar update job (Apps Script scholarRequest; the iMac picks it up every 5 minutes).
 *  Shared by the button on the Scholar row of "แหล่งข้อมูล" and the status panel beside it (Tum, 2026-11-11). */
export function useScholarJob(approvalKey?: string) {
  const [job, setJob] = useState<ScholarJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const active = job?.status === 'requested' || job?.status === 'running'
  // Answers are numbered: one that was asked for before a newer answer came in is dropped, so a slow
  // poll cannot put an older state back over the answer to "start".
  const asked = useRef(0)
  useEffect(() => {
    let stop = false
    const tick = () => {
      const n = ++asked.current
      void fetchScholarJob().then((j) => !stop && n === asked.current && setJob(j))
    }
    tick()
    const t = window.setInterval(tick, active ? 10000 : 60000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [active])
  const waitingLong = job?.status === 'requested' && Date.now() - new Date(job.at).getTime() > 15 * 60000
  const start = async () => {
    if (!approvalKey) return
    setBusy(true)
    setErr('')
    try {
      const r = await api({ action: 'scholarRequest', adminKey: approvalKey })
      const j = (r as { job?: ScholarJob }).job
      if (j) {
        asked.current++ // a poll still on its way is older than this answer
        setJob(j)
      }
      if (!r.ok && r.error !== 'busy') setErr(errorText(r.error))
    } catch {
      setErr(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  return { job, busy, err, active, waitingLong, start, canStart: !!approvalKey }
}

/** "อัปเดตจาก Google Scholar", on the Google Scholar row of the data sources (level-2 admins only). */
export function ScholarButton({ scholar }: { scholar: ScholarState }) {
  if (!scholar.canStart) return null
  return (
    <button type="button" className="btn btn-small btn-primary source-action" disabled={scholar.busy || scholar.active} onClick={() => void scholar.start()}>
      {scholar.active ? 'กำลังอัปเดต…' : scholar.busy ? 'กำลังส่งคำขอ…' : 'อัปเดตจาก Google Scholar'}
    </button>
  )
}

/** The panel beside the data sources: where the Google Scholar update stands, plus the manual fallback. */
export function ScholarStatus({ scholar, children }: { scholar: ScholarState; children: React.ReactNode }) {
  const { job, err, waitingLong } = scholar
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '')
  return (
    <section className="panel scholar-update">
      <h3>สถานะการอัปเดต Google Scholar</h3>
      {job ? (
        <p className={`scholar-job scholar-job-${job.status}`} role="status">
          <b>{JOB_TH[job.status]}</b>
          {job.status === 'running' && job.progress && ` · ${job.progress} คน${job.message ? ` (${job.message})` : ''}`}
          {(job.status === 'done' || job.status === 'blocked' || job.status === 'failed') && job.message && ` · ${job.message}`}
          <span className="muted"> · สั่งเมื่อ {when(job.at)} โดย {job.by}{job.updated && job.status !== 'requested' ? ` · ล่าสุด ${when(job.updated)}` : ''}</span>
          {waitingLong && <span className="warn-text"> ระบบยังไม่รับงานเกิน 15 นาที เครื่องที่ทำงานอาจปิดอยู่หรือไม่ได้เชื่อมต่ออินเทอร์เน็ต</span>}
        </p>
      ) : (
        <p className="scholar-job" role="status">ยังไม่มีการสั่งอัปเดต</p>
      )}
      {err && <p className="warn-text">{err}</p>}
      <p className="note">
        {scholar.canStart ? 'กด "อัปเดตจาก Google Scholar" ที่แถว Google Scholar ทางซ้าย ' : 'ผู้ดูแลระดับ 2 กด "อัปเดตจาก Google Scholar" ได้ที่แถว Google Scholar ทางซ้าย '}
        ระบบจะดึงรายการผลงานจากโปรไฟล์ Google Scholar ของอาจารย์ทุกคน แล้วเพิ่มผลงานใหม่ให้อัตโนมัติ (รับงานทุก 5 นาที ใช้เวลาประมาณ 5–10 นาที)
      </p>
      <details className="scholar-fallback">
        <summary>วิธีสำรอง: นำเข้าทีละคนด้วยการวางรายการเอง (ใช้เมื่อ Scholar บล็อกระบบ)</summary>
        {children}
      </details>
    </section>
  )
}
