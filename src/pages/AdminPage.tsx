import { useState } from 'react'
import type { DataBundle, Pub, PubSource } from '../types'
import { Segmented, TYPE_LABEL, displayName, yearLabel } from '../ui'
import { toBE } from '../rules'
import { CONFERENCE_TAG } from '../conferences'
import { copyText } from '../download'
import { api, errorText, sessionStore, useEmailUser } from '../emailLogin'
import { STATUS_TH, TYPE_TH, type Submission, type SubmissionStatus } from '../submissions'
import type { Faculty } from '../types'

const SOURCE_LABEL: Record<PubSource, string> = {
  scholar: 'Google Scholar (นำเข้าเป็นครั้งคราว)',
  openalex: 'OpenAlex (อัปเดตทุกวัน)',
  scopus: 'Scopus (อัปเดตทุกวัน)',
  manual: 'แบบฟอร์มผู้ดูแล (อัปเดตทุกวัน)',
}

export function AdminPage({ data, pubs, faculty, formUrl, decisionFormUrl, onLock, submissions = [], onSubmissionsChanged = () => undefined }: { data: DataBundle; pubs: Pub[]; faculty: Faculty[]; formUrl: string; decisionFormUrl: string; onLock?: () => void; submissions?: Submission[]; onSubmissionsChanged?: () => void }) {
  const manual = pubs.filter((p) => p.sources.includes('manual')).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const rawCount = (s: PubSource) => data.publications.filter((p) => (p.source ?? 'scholar') === s).length
  const person = (key: string) => faculty.find((f) => f.nameEn === key)

  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            เพิ่มผลงานด้วยตนเอง{' '}
            <small className="title-hint">(เพิ่มผลงานที่ยังไม่มีใน Scholar, OpenAlex หรือ Scopus เช่น บทความในวารสารไทย หรือ proceedings ของงานประชุมในประเทศ)</small>
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
          <h3>ขั้นตอน</h3>
          {/* All admin steps in one list: adding works, then deciding conferences (Tum, 2026-11-07) */}
          <h4 className="steps-sub">เพิ่มผลงาน</h4>
          <ol className="steps">
            <li>กรอกแบบฟอร์มด้วยบัญชี @up.ac.th หนึ่งครั้งต่อหนึ่งผลงาน ถ้ามีผู้เขียนหลายคนในคณะ ให้กรอกแยกทีละคน</li>
            <li>ผลงานที่ส่งจะปรากฏในระบบภายในไม่กี่นาที (อ่านจากชีตคำตอบโดยตรง) และถูกบันทึกถาวรในรอบอัปเดตทุกชั่วโมง</li>
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
          <h4 className="steps-sub">ตัดสินงานประชุม (proceedings)</h4>
          <ol className="steps" start={5}>
            <li>ในทะเบียนงานประชุมด้านล่าง กดปุ่ม "คัดลอก key" ในแถวของงานประชุมที่ต้องการ</li>
            <li>เปิดแบบฟอร์มตัดสินงานประชุม วางรหัสที่คัดลอก แล้วเลือก "นับ" หรือ "ไม่นับ"</li>
            <li>ระบบดึงคำตอบทุกชั่วโมง ถ้าส่งหลายครั้ง ระบบใช้คำตอบล่าสุด</li>
          </ol>
          {decisionFormUrl ? (
            <a className="btn btn-primary" href={decisionFormUrl} target="_blank" rel="noreferrer">
              เปิดแบบฟอร์มตัดสินงานประชุม ↗
            </a>
          ) : (
            <p className="note">ยังไม่ได้ตั้งค่าแบบฟอร์มตัดสินงานประชุม (decisionFormUrl ใน data/sources.json)</p>
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

        <RegisterExplain pubs={pubs} screening={data.conferenceScreening === 'on'} />
      </div>

      <ApproveWorks submissions={submissions} faculty={faculty} onChanged={onSubmissionsChanged} />

      <ConferenceRegister pubs={pubs} />

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

/** Same window as the automatic check: papers that can still fall in this year's or next year's 5-year window. */
function registerWindow(pubs: Pub[]) {
  const minYear = new Date().getFullYear() - 5
  const older = pubs.filter((p) => (p.type === 'proceeding' || p.type === 'poster') && p.conference && (p.year ?? 0) < minYear).length
  return { minYear, older }
}

/** "คำอธิบาย" panel for the conference register, shown beside the data sources. */
function RegisterExplain({ pubs, screening }: { pubs: Pub[]; screening: boolean }) {
  const { minYear, older } = registerWindow(pubs)
  return (
    <section className="panel explain-panel">
      <h3>คำอธิบาย</h3>
      <ul className="explain-list">
        <li>
          <b>ช่วงที่แสดง:</b> ทะเบียนงานประชุมแสดงงานที่มีผลงานของอาจารย์ตั้งแต่ พ.ศ. {toBE(minYear)} ({minYear}) ซึ่งยังอยู่ในช่วงประเมินของปีนี้หรือปีหน้า
          {older > 0 && <span className="muted"> (ผลงานที่เก่ากว่านี้ {older} รายการ ไม่ต้องตรวจ)</span>}
        </li>
        <li>
          <b>เกณฑ์ที่นับ:</b> proceedings นับได้เมื่อ (1) สมาคมวิชาการหรือวิชาชีพเป็นผู้จัดหรือร่วมจัด และ (2) งานประชุมอยู่ในสาขาสิ่งแวดล้อมหรือพลังงาน
        </li>
        <li>
          <b>การตรวจ:</b> AI ค้นหาผู้จัดให้อัตโนมัติ (ดูคอลัมน์ "ตรวจโดย") รายการที่ยังไม่ชัดเจนจะแสดงในตาราง แต่ยังไม่นับจนกว่าผู้ดูแลจะตัดสิน
        </li>
        {!screening && (
          <li>
            <b>หมายเหตุ:</b> ขณะนี้ปิดการใช้ทะเบียนในการคำนวณ จึงยังนับ proceedings ทุกรายการ
          </li>
        )}
      </ul>
    </section>
  )
}

/** Every conference seen among proceedings, with the register's verdict; admins edit data/conferences.csv. */
function ConferenceRegister({ pubs }: { pubs: Pub[] }) {
  const groups = new Map<string, { match: NonNullable<Pub['conference']>; pubs: Pub[] }>()
  const { minYear } = registerWindow(pubs)
  for (const p of pubs) {
    if ((p.type !== 'proceeding' && p.type !== 'poster') || !p.conference) continue
    if ((p.year ?? 0) < minYear) continue
    const g = groups.get(p.conference.key) ?? { match: p.conference, pubs: [] }
    g.pubs.push(p)
    groups.set(p.conference.key, g)
  }
  const order: Record<string, number> = { pending: 0, no_count: 1, count: 2 }
  const rows = [...groups.values()].sort((a, b) => order[a.match.verdict] - order[b.match.verdict] || (b.pubs[0].year ?? 0) - (a.pubs[0].year ?? 0))
  const pending = rows.filter((r) => r.match.verdict === 'pending').length
  // Year filter and 10 conferences per page (Tum, 2026-11-07), so the register stays short as it grows.
  const [year, setYear] = useState<number | 'all'>('all')
  const [page, setPage] = useState(0)
  const yearsInRows = [...new Set(rows.flatMap((r) => r.pubs.map((p) => p.year)).filter((y): y is number => y !== null))].sort((a, b) => b - a)
  const filtered = year === 'all' ? rows : rows.filter((r) => r.pubs.some((p) => p.year === year))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)
  return (
    <>
      <h2 className="block-title">
        ทะเบียนงานประชุม (proceedings) จำนวน {rows.length} งาน{pending > 0 && <span className="muted"> · รอตรวจสอบ {pending}</span>}
      </h2>
      {rows.length > 0 && (
        <div className="register-tools no-print">
          <label className="control" htmlFor="register-year">
            <span className="control-label">ปีของผลงาน</span>
            <select
              id="register-year"
              value={year}
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
        </div>
      )}
      {rows.length === 0 ? (
        <p className="note">ไม่มี proceedings ในข้อมูล</p>
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
              {shown.map(({ match, pubs: ps }) => {
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
                    <td className="small muted">{match.by === 'admin' ? `ผู้ดูแล${e?.decidedBy ? ` (${e.decidedBy})` : ''}` : e ? `AI (${e.checkedAt.slice(0, 10)}) ความมั่นใจ ระดับ ${e.confidence}` : '—'}</td>
                    <td className="small">{ps.length} รายการ · {[...new Set(ps.map((p) => p.year))].filter(Boolean).sort().join(', ')}</td>
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

const PAGE_SIZE = 10

/** Page buttons: previous, numbered pages, next. */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
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

/** Works lecturers added themselves, for a level-2 admin to approve or reject (2026-11-07).
 *  Deciding needs the admin's e-mail sign-in; the backend checks the admins sheet. */
function ApproveWorks({ submissions, faculty, onChanged }: { submissions: Submission[]; faculty: Faculty[]; onChanged: () => void }) {
  const { user, checking } = useEmailUser()
  const [show, setShow] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const name = (key: string) => {
    const f = faculty.find((x) => x.nameEn === key)
    return f ? displayName(f) : key
  }
  const live = submissions.filter((s) => s.status !== 'withdrawn')
  const pending = live.filter((s) => s.status === 'pending')
  const rows = (show === 'pending' ? pending : live).slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.created.localeCompare(a.created))
  const canDecide = !!user?.isAdmin

  const decide = async (id: string, status: SubmissionStatus) => {
    setBusy(id)
    setError('')
    try {
      const r = await api({ action: 'decide', session: sessionStore.get(), id, status })
      if (r.ok) onChanged()
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
        ผลงานที่อาจารย์เพิ่มเอง <small className="title-hint">รออนุมัติ {pending.length} รายการ · ยังไม่นับจนกว่าจะอนุมัติ</small>
      </h2>
      <div className="register-tools no-print">
        <Segmented
          label="แสดงผลงานที่อาจารย์เพิ่มเอง"
          value={show}
          onChange={setShow}
          options={[
            { id: 'pending', label: `รออนุมัติ (${pending.length})` },
            { id: 'all', label: `ทั้งหมด (${live.length})` },
          ]}
        />
        {checking ? (
          <span className="muted small">กำลังตรวจสอบการเข้าสู่ระบบ…</span>
        ) : canDecide ? (
          <span className="muted small">อนุมัติในนาม {user?.email}</span>
        ) : user ? (
          <span className="gate-error small">{errorText('not_admin')}</span>
        ) : (
          <span className="small">
            การอนุมัติต้องเข้าสู่ระบบด้วยอีเมลผู้ดูแล <a className="btn btn-small" href="#/me">เข้าสู่ระบบด้วยอีเมล</a>
          </span>
        )}
      </div>
      {error && (
        <p className="gate-error" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="note">{show === 'pending' ? 'ไม่มีผลงานรออนุมัติ' : 'ยังไม่มีผลงานที่อาจารย์เพิ่มเอง'}</p>
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
                  </td>
                  <td>
                    <span className={`sub-status sub-${s.status}`}>{STATUS_TH[s.status]}</span>
                    <div className="muted small">ส่งเมื่อ {s.created ? new Date(s.created).toLocaleDateString('th-TH') : '—'}</div>
                  </td>
                  <td className="nowrap">
                    {canDecide &&
                      (s.status === 'pending' ? (
                        <>
                          <button type="button" className="btn btn-small btn-primary" disabled={busy === s.id} onClick={() => void decide(s.id, 'approved')}>
                            อนุมัติ
                          </button>{' '}
                          <button type="button" className="btn btn-small" disabled={busy === s.id} onClick={() => void decide(s.id, 'rejected')}>
                            ไม่อนุมัติ
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-small" disabled={busy === s.id} onClick={() => void decide(s.id, 'pending')}>
                          ย้อนเป็นรออนุมัติ
                        </button>
                      ))}
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
