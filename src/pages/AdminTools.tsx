// Back-office pages for a level-2 admin (Tum, 2026-11-10): everything awaiting a decision, the
// decision history with undo, the outlook for the next two evaluation years, the per-programme
// report (Word), and what each data refresh changed.
import { useEffect, useMemo, useState } from 'react'
import { changeTotals, type ChangeEntry } from '../changes'
import type { ConfDecisionItem } from '../confDecisions'
import { CONFERENCE_TAG } from '../conferences'
import { copyText } from '../download'
import { api, errorText, sessionStore } from '../emailLogin'
import type { FormCancelItem } from '../formCancel'
import { KIND_TH, buildHistory, fetchDecisionLog, type DecisionLogItem, type HistoryEntry, type HistoryKind } from '../history'
import type { Notice } from '../notify'
import { outlook } from '../outlook'
import type { PendingQueue } from '../pending'
import { downloadWord, programmeReport, reportHtml } from '../programmeReport'
import { defaultChoice, overrideLine } from '../review'
import { toBE, type PersonResult, type Settings, type Status } from '../rules'
import { TYPE_TH, type Submission } from '../submissions'
import type { Faculty, Programme } from '../types'
import { SHOWN_ROLES, STATUS_LABEL, Segmented, StatusChip, displayName, roleShort, yearLabel } from '../ui'
import { ConfButtons, LeafSpinner, PAGE_SIZE, Pager } from './AdminPage'

export type AdminView = 'pending' | 'history' | 'outlook' | 'report' | 'changes'
export const ADMIN_VIEWS: { id: AdminView; th: string }[] = [
  { id: 'pending', th: 'รายการรอตัดสิน' },
  { id: 'history', th: 'ประวัติการตัดสิน' },
  { id: 'outlook', th: 'แนวโน้ม 1–2 ปีข้างหน้า' },
  { id: 'report', th: 'รายงานรายหลักสูตร (มคอ.7 / AUN-QA)' },
  { id: 'changes', th: 'สรุปการเปลี่ยนแปลงหลังอัปเดตข้อมูล' },
]
export const isAdminView = (v: string): v is AdminView => ADMIN_VIEWS.some((x) => x.id === v)

const FACULTY_TH = 'คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา'
const when = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso || '—' : new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}
const personLink = (f: Faculty) => <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>{displayName(f)}</a>
const roleName = (id: string) => {
  const r = SHOWN_ROLES.find((x) => x.id === id)
  return r ? `${roleShort(r.id)} (ข้อ ${r.clause})` : id
}

// ───────────────────────── 1. Pending decisions ─────────────────────────

export function PendingPage({ queue, faculty, approvalKey, onConferencesChanged, onSubmissionsChanged }: { queue: PendingQueue; faculty: Faculty[]; approvalKey?: string; onConferencesChanged: () => unknown; onSubmissionsChanged: () => unknown }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [page, setPage] = useState(0)
  const person = (key: string) => faculty.find((f) => f.nameEn === key)
  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id)
    setError('')
    try {
      const r = await api({ action: 'decide', session: sessionStore.get(), adminKey: approvalKey ?? '', id, status })
      if (r.ok) await onSubmissionsChanged()
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy('')
    }
  }
  const pages = Math.max(1, Math.ceil(queue.review.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            รายการรอตัดสิน <small className="title-hint">รวม {queue.total} รายการ</small>
          </h1>
        </div>
      </div>
      <div className="tool-counts">
        <a className="tool-count" href="#pending-conf"><b>{queue.conferences.length}</b> งานประชุมรอ นับ/ไม่นับ</a>
        <a className="tool-count" href="#pending-sub"><b>{queue.submissions.length}</b> ผลงานที่อาจารย์เพิ่มเอง รออนุมัติ</a>
        <a className="tool-count" href="#pending-review"><b>{queue.review.length}</b> ผลงานที่ระบบจัดประเภทไม่ได้ (ต้องตรวจ)</a>
      </div>

      <h2 className="block-title" id="pending-conf">งานประชุมรอ นับ/ไม่นับ ({queue.conferences.length})</h2>
      {queue.conferences.length === 0 ? (
        <p className="note">ไม่มีงานประชุมค้างตัดสิน</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>งานประชุม</th>
                <th>ผลตรวจอัตโนมัติ</th>
                <th>ผลงาน / อาจารย์</th>
                <th>ตัดสิน</th>
              </tr>
            </thead>
            <tbody>
              {queue.conferences.map(({ match, pubs: ps, pending: np }) => {
                const e = match.entry
                const name = e?.conferenceName || ps[0].venue
                return (
                  <tr key={match.key}>
                    <td>
                      <div className="pub-title">{name}</div>
                      {e?.evidenceUrl && <a className="small" href={e.evidenceUrl} target="_blank" rel="noreferrer">หลักฐาน ↗</a>}
                    </td>
                    <td className="small">
                      <div className={`jl cf cf-${match.verdict}`}>{CONFERENCE_TAG[match.verdict]}</div>
                      <div className="muted">{match.reason}</div>
                    </td>
                    <td className="small">
                      {new Set(ps.map((p) => p.titleNorm)).size} รายการ ({[...new Set(ps.map((p) => p.year))].filter(Boolean).sort().join(', ')})
                      {np > 0 && <span className="muted"> · รออนุมัติ {np}</span>}
                      <div className="conf-people">
                        {[...new Set(ps.map((p) => p.key))].map((k) => {
                          const f = person(k)
                          return <span key={k}>{f ? personLink(f) : k}</span>
                        })}
                      </div>
                    </td>
                    <td>
                      <ConfButtons ckey={match.key} name={name} decided={!!e?.decision} approvalKey={approvalKey} onChanged={onConferencesChanged} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="block-title" id="pending-sub">ผลงานที่อาจารย์เพิ่มเอง รออนุมัติ ({queue.submissions.length})</h2>
      {error && <p className="gate-error" role="alert">{error}</p>}
      {queue.submissions.length === 0 ? (
        <p className="note">ไม่มีผลงานรออนุมัติ</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ส่งเมื่อ</th>
                <th>อาจารย์</th>
                <th>ผลงาน</th>
                <th>ประเภท</th>
                <th>ตัดสิน</th>
              </tr>
            </thead>
            <tbody>
              {queue.submissions.map((s) => {
                const f = person(s.nameEn)
                return (
                  <tr key={s.id}>
                    <td className="small">{when(s.created)}</td>
                    <td>{f ? personLink(f) : s.nameEn}</td>
                    <td>
                      <div className="pub-title">{s.title}</div>
                      <div className="muted small">{[s.venue, s.volume, yearLabel(s.year)].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="small">{TYPE_TH[s.type]}{s.research ? ' · งานวิจัย' : ''}</td>
                    <td>
                      <div className="conf-buttons no-print">
                        <button type="button" className="btn btn-small btn-primary" disabled={busy !== ''} onClick={() => void decide(s.id, 'approved')}>อนุมัติ</button>
                        <button type="button" className="btn btn-small" disabled={busy !== ''} onClick={() => void decide(s.id, 'rejected')}>ไม่อนุมัติ</button>
                        {busy === s.id && <LeafSpinner />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="block-title" id="pending-review">ผลงานที่ระบบจัดประเภทไม่ได้ ({queue.review.length})</h2>
      <p className="note">
        เฉพาะผลงานในช่วงประเมิน 5 ปี หรือไม่มีปีที่พิมพ์ · การตัดสินทำในไฟล์ <span className="mono">data/overrides.csv</span>: กด "คัดลอกบรรทัด" แล้วแก้ค่า type / is_research / part_of_own_degree
        ให้ถูกต้องก่อนวางในไฟล์
      </p>
      {queue.review.length === 0 ? (
        <p className="note">ไม่มีผลงานที่ต้องตรวจ</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>อาจารย์</th>
                  <th>ผลงาน</th>
                  <th>สิ่งที่ต้องตรวจ</th>
                  <th className="no-print">overrides.csv</th>
                </tr>
              </thead>
              <tbody>
                {queue.review.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE).map((it) => (
                  <tr key={it.pub.id}>
                    <td>{personLink(it.person)}</td>
                    <td>
                      <div className="pub-title">{it.pub.title}</div>
                      <div className="muted small">{[it.pub.venue, yearLabel(it.pub.year)].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="small">
                      {it.issues.map((x) => (
                        <div key={x}>{x}</div>
                      ))}
                    </td>
                    <td className="no-print">
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => void copyText(overrideLine(it.pub, defaultChoice(it))).then((ok) => setCopied(ok ? it.pub.id : ''))}
                      >
                        {copied === it.pub.id ? 'คัดลอกแล้ว' : 'คัดลอกบรรทัด'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && <Pager page={cur} pages={pages} onPage={setPage} />}
        </>
      )}
    </>
  )
}

// ───────────────────────── 2. Decision history ─────────────────────────

export function HistoryTable({ entries, confirm, busy, onAsk, onUndo }: { entries: HistoryEntry[]; confirm: HistoryEntry | null; busy: boolean; onAsk: (e: HistoryEntry | null) => void; onUndo: (e: HistoryEntry) => void }) {
  if (entries.length === 0) return <p className="note">ยังไม่มีประวัติในหมวดนี้</p>
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>เวลา</th>
            <th>หมวด</th>
            <th>ผู้ตัดสิน</th>
            <th>การตัดสิน</th>
            <th>รายการ</th>
            <th>เหตุผล / หมายเหตุ</th>
            <th className="no-print">ย้อนกลับ</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.at}|${e.kind}|${e.target}|${i}`}>
              <td className="small">{when(e.at)}</td>
              <td className="small">{KIND_TH[e.kind]}</td>
              <td className="small">{e.by || '—'}</td>
              <td>{e.action}</td>
              <td className="small">{e.target}</td>
              <td className="small">{e.note || '—'}</td>
              <td className="no-print">
                {e.undo &&
                  (confirm === e ? (
                    <div className="conf-buttons">
                      <span className="small">{e.undoLabel}?</span>
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => onUndo(e)}>ยืนยัน</button>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => onAsk(null)}>ไม่ย้อน</button>
                      {busy && <LeafSpinner />}
                    </div>
                  ) : (
                    <button type="button" className="btn btn-small" disabled={busy} title={e.undoLabel} onClick={() => onAsk(e)}>ย้อนกลับ</button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HistoryPage({ confItems, formCancels, submissions, notices, faculty, approvalKey, onChanged }: { confItems: ConfDecisionItem[]; formCancels: FormCancelItem[]; submissions: Submission[]; notices: Notice[]; faculty: Faculty[]; approvalKey?: string; onChanged: () => unknown }) {
  // undefined = still loading; null = this backend version has no decision log.
  const [log, setLog] = useState<DecisionLogItem[] | null | undefined>(undefined)
  const [kind, setKind] = useState<HistoryKind | 'all'>('all')
  const [page, setPage] = useState(0)
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadLog = () => fetchDecisionLog().then(setLog)
  useEffect(() => {
    void loadLog()
  }, [])
  const all = useMemo(
    () =>
      buildHistory({
        confItems,
        formCancels,
        submissions,
        decisionLog: log ?? null,
        notices,
        nameOf: (n) => {
          const f = faculty.find((x) => x.nameEn === n)
          return f ? displayName(f) : n
        },
      }),
    [confItems, formCancels, submissions, log, notices, faculty],
  )
  const entries = kind === 'all' ? all : all.filter((e) => e.kind === kind)
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const undo = async (e: HistoryEntry) => {
    if (!e.undo) return
    setBusy(true)
    setError('')
    try {
      const r = await api({ ...e.undo, adminKey: approvalKey ?? '', session: sessionStore.get() })
      if (r.ok) {
        await Promise.all([onChanged(), loadLog()])
        setConfirm(null)
      } else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  const count = (k: HistoryKind) => all.filter((e) => e.kind === k).length
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            ประวัติการตัดสิน <small className="title-hint">{all.length} รายการ ใหม่สุดอยู่บน</small>
          </h1>
        </div>
      </div>
      <p className="note">
        "ย้อนกลับ" มีเฉพาะการตัดสินครั้งล่าสุดของแต่ละรายการ และตัวการย้อนเองก็ถูกบันทึกเป็นอีกหนึ่งรายการ · การถอนผลงานโดยอาจารย์และอีเมลที่ส่งไปแล้วย้อนไม่ได้
        {log === null && ' · ระบบหลังบ้านรุ่นที่ใช้อยู่ยังไม่ส่งประวัติการอนุมัติผลงานแบบเต็ม จึงแสดงเฉพาะผลการตัดสินล่าสุดของแต่ละผลงาน (ไม่มีชื่อผู้ตัดสิน)'}
      </p>
      <div className="register-tools no-print">
        <Segmented
          label="หมวดของประวัติ"
          value={kind}
          onChange={(v) => {
            setKind(v)
            setPage(0)
            setConfirm(null)
          }}
          options={[{ id: 'all' as const, label: `ทั้งหมด (${all.length})` }, ...(Object.keys(KIND_TH) as HistoryKind[]).map((k) => ({ id: k, label: `${KIND_TH[k]} (${count(k)})` }))]}
        />
        {log === undefined && <LeafSpinner />}
      </div>
      {error && <p className="gate-error" role="alert">{error}</p>}
      <HistoryTable entries={entries.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)} confirm={confirm} busy={busy} onAsk={setConfirm} onUndo={(e) => void undo(e)} />
      {pages > 1 && (
        <Pager
          page={cur}
          pages={pages}
          onPage={(p) => {
            setPage(p)
            setConfirm(null)
          }}
        />
      )}
    </>
  )
}

// ───────────────────────── 3. Outlook ─────────────────────────

export function OutlookPage({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const rows = useMemo(() => outlook(results, settings, 2, SHOWN_ROLES), [results, settings])
  const y1 = rows.filter((r) => r.firstYear === settings.year + 1).length
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            แนวโน้ม 1–2 ปีข้างหน้า <small className="title-hint">ปีประเมิน พ.ศ. {toBE(settings.year + 1)} และ {toBE(settings.year + 2)}</small>
          </h1>
        </div>
      </div>
      <p className="note">
        อาจารย์ที่ผ่านเกณฑ์ในปี พ.ศ. {toBE(settings.year)} แต่จะไม่ผ่านในปีถัดไปเมื่อผลงานเก่าพ้นช่วง 5 ปี คำนวณโดย<b>สมมติว่าไม่มีผลงานใหม่เพิ่ม</b>
        และใช้เกณฑ์ชุดเดียวกับหน้าข้อมูลอาจารย์ · "ต้องเพิ่ม" คือจำนวนผลงานขั้นต่ำที่ต้องมีเพิ่มในช่วงประเมินของปีนั้น
      </p>
      <div className="tool-counts">
        <span className="tool-count"><b>{y1}</b> คน เริ่มไม่ผ่านในปี พ.ศ. {toBE(settings.year + 1)}</span>
        <span className="tool-count"><b>{rows.length - y1}</b> คน เริ่มไม่ผ่านในปี พ.ศ. {toBE(settings.year + 2)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="note">ไม่มีอาจารย์ที่จะหลุดเกณฑ์ใน 2 ปีข้างหน้า</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>อาจารย์</th>
                <th>หน้าที่</th>
                <th>ไม่ผ่านตั้งแต่ปี</th>
                <th>ต้องเพิ่ม</th>
                <th>ผลงานที่พ้นช่วง 5 ปี</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((p) =>
                p.roles.map((o, i) => (
                  <tr key={`${p.result.person.nameEn}|${o.role.id}`}>
                    {i === 0 && <td rowSpan={p.roles.length}>{personLink(p.result.person)}</td>}
                    <td className="small">{roleName(o.role.id)}</td>
                    <td>พ.ศ. {toBE(o.lostIn)}</td>
                    <td>
                      {o.need > 0 ? (
                        <>
                          <b>{o.need}</b> รายการ
                          <div className="muted small">
                            {o.shortResearch > 0 && `เป็นงานวิจัยอย่างน้อย ${o.shortResearch}`}
                          </div>
                        </>
                      ) : (
                        <span className="small">{o.reason || '—'}</span>
                      )}
                      {o.path === 'new_grad' && <div className="muted small">ปีนี้ผ่านด้วยข้อยกเว้นผู้สำเร็จการศึกษาใหม่ ซึ่งหมดอายุในปีนั้น</div>}
                    </td>
                    <td className="small">
                      {o.leaving.length === 0
                        ? '—'
                        : o.leaving.map((w) => (
                            <div key={w.id}>
                              {w.title} <span className="muted">({w.year})</span>
                            </div>
                          ))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ───────────────────────── 4. Programme report ─────────────────────────

const cellText = (s: Status | null) => (s === null ? '—' : <StatusChip status={s} compact title={STATUS_LABEL[s].th} />)

export function ReportPage({ programmes, results, settings, builtAt }: { programmes: Programme[]; results: PersonResult[]; settings: Settings; builtAt: string }) {
  const [id, setId] = useState('all')
  const reports = useMemo(() => programmes.filter((p) => id === 'all' || p.id === id).map((p) => programmeReport(p, results, settings)), [programmes, id, results, settings])
  const save = () => downloadWord(`รายงานคุณสมบัติอาจารย์_${id === 'all' ? 'ทุกหลักสูตร' : id}_${toBE(settings.year)}.doc`, reportHtml(reports, { year: settings.year, builtAt, faculty: FACULTY_TH }))
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            รายงานรายหลักสูตร <small className="title-hint">สำหรับ มคอ.7 / AUN-QA · ปีประเมิน พ.ศ. {toBE(settings.year)}</small>
          </h1>
        </div>
      </div>
      {programmes.length === 0 ? (
        <p className="note">ยังไม่มีรายชื่อหลักสูตรใน data/programmes.csv</p>
      ) : (
        <>
          <div className="register-tools no-print">
            <label className="control" htmlFor="report-programme">
              <span className="control-label">หลักสูตร</span>
              <select id="report-programme" value={id} onChange={(e) => setId(e.target.value)}>
                <option value="all">ทุกหลักสูตร ({programmes.length})</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>{p.th}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={save}>ดาวน์โหลด Word (.doc)</button>
          </div>
          <p className="note">
            ไฟล์ Word ใช้ฟอนต์ TH SarabunPSK 16 pt ขนาด A4 มีตารางคุณสมบัติรายหน้าที่และรายการผลงานที่ใช้นับของอาจารย์แต่ละคน · ปีประเมินเปลี่ยนได้จากเมนู "ปีประเมิน" ด้านบน
          </p>
          {reports.map((rep) => (
            <section key={rep.programme.id}>
              <h2 className="block-title">
                {rep.programme.th}{' '}
                <small className="title-hint">
                  ข้อ {rep.level.clause} · อาจารย์ผู้รับผิดชอบหลักสูตรผ่านเกณฑ์ {rep.responsible.met} จาก {rep.responsible.pool} คน (ต้องมีอย่างน้อย {rep.responsible.required})
                  {!rep.responsible.named && ' · ยังไม่ได้ระบุผู้รับผิดชอบในข้อมูล จึงนับจากอาจารย์ทุกคนในรายชื่อ'}
                </small>
              </h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>อาจารย์</th>
                      <th>คุณวุฒิ</th>
                      {rep.roles.map((r) => (
                        <th key={r.id}>{roleShort(r.id)}</th>
                      ))}
                      <th>ผลงานที่ใช้นับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.rows.map((row) => (
                      <tr key={row.member.nameEn}>
                        <td>
                          {row.result ? personLink(row.result.person) : row.name}
                          {row.member.responsible && <div className="muted small">ผู้รับผิดชอบหลักสูตร</div>}
                        </td>
                        <td className="small">{row.degree}</td>
                        {rep.roles.map((r) => (
                          <td key={r.id}>{cellText(row.statuses[r.id] ?? null)}</td>
                        ))}
                        <td>{row.result ? row.works.length : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}

// ───────────────────────── 5. Changes after each refresh ─────────────────────────

const statusTh = (s: Status | null) => (s === null ? '—' : STATUS_LABEL[s].th)

export function ChangeList({ entries }: { entries: ChangeEntry[] }) {
  if (entries.length === 0) return <p className="note">ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้ (ระบบเริ่มบันทึกตั้งแต่การอัปเดตข้อมูลรอบถัดไป)</p>
  return (
    <div className="change-list">
      {entries.map((e, i) => {
        const t = changeTotals(e)
        return (
          <details key={e.at} className="panel change-entry" open={i === 0}>
            <summary>
              <b>{when(e.at)}</b>
              <span className="muted small"> เทียบกับ {when(e.prevAt)}</span>
              <span className="change-totals small">
                {e.people.length} คน · ผลงานเพิ่ม {t.added} · หาย {t.removed} · เปลี่ยนการนับ {t.recounted} · สถานะเปลี่ยน {t.status}
              </span>
              {e.prevYear !== e.year && <span className="fresh-flag small"> ปีประเมินเปลี่ยนจาก พ.ศ. {toBE(e.prevYear)} เป็น {toBE(e.year)} (ช่วง 5 ปีเลื่อน)</span>}
            </summary>
            {e.people.map((p) => (
              <div key={p.nameEn} className="change-person">
                <h4>
                  <a href={`#/person/${encodeURIComponent(p.nameEn)}`}>{p.name}</a>
                  {p.roster && <span className="muted small"> ({p.roster === 'joined' ? 'เพิ่มเข้ารายชื่ออาจารย์' : 'ออกจากรายชื่ออาจารย์'})</span>}
                </h4>
                <ul>
                  {p.status.map((s) => (
                    <li key={s.role}>
                      <b>{roleName(s.role)}</b>: {statusTh(s.from)} → {statusTh(s.to)}
                    </li>
                  ))}
                  {p.added.map((w) => (
                    <li key={`a|${w.title}`}>
                      <span className="change-add">เพิ่ม</span> {w.title} <span className="muted">({w.year ?? '—'}{w.counted ? ', นับ' : ', ไม่นับ'})</span>
                    </li>
                  ))}
                  {p.removed.map((w) => (
                    <li key={`r|${w.title}`}>
                      <span className="change-del">หาย</span> {w.title} <span className="muted">({w.year ?? '—'}{w.counted ? ', เคยนับ' : ''})</span>
                    </li>
                  ))}
                  {p.recounted.map((w) => (
                    <li key={`c|${w.title}`}>
                      <span className="change-mod">{w.counted ? 'เริ่มนับ' : 'เลิกนับ'}</span> {w.title} <span className="muted">({w.year ?? '—'})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )
      })}
    </div>
  )
}

async function fetchChanges(): Promise<ChangeEntry[] | null> {
  if (window.location.protocol === 'file:') return null
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}changes.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const list = (await res.json()) as unknown
    return Array.isArray(list) ? (list as ChangeEntry[]) : null
  } catch {
    return null
  }
}

export function ChangesPage() {
  // undefined = loading; null = the file cannot be read here (dev server, offline copy).
  const [entries, setEntries] = useState<ChangeEntry[] | null | undefined>(undefined)
  useEffect(() => {
    void fetchChanges().then(setEntries)
  }, [])
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            สรุปการเปลี่ยนแปลงหลังอัปเดตข้อมูล <small className="title-hint">เครื่องมือหลังบ้านสำหรับตรวจสอบ</small>
          </h1>
        </div>
      </div>
      <p className="note">
        ทุกครั้งที่ระบบดึงข้อมูลใหม่ จะเทียบกับรอบก่อนและบันทึกเฉพาะรอบที่มีการเปลี่ยนแปลง: ผลงานที่เพิ่มหรือหายไป ผลงานที่เปลี่ยนจากนับเป็นไม่นับ (หรือกลับกัน)
        และอาจารย์ที่สถานะเปลี่ยน · เทียบจากข้อมูลที่รวมไว้ตอน build จึงเห็นการกดอนุมัติหรือ นับ/ไม่นับ บนเว็บในรอบอัปเดตถัดไป · เก็บ 120 รอบล่าสุด
      </p>
      {entries === undefined ? <LeafSpinner /> : entries === null ? <p className="note">อ่านไฟล์ changes.json ไม่ได้ (มีเฉพาะบนเว็บที่เผยแพร่แล้ว)</p> : <ChangeList entries={entries} />}
    </>
  )
}
