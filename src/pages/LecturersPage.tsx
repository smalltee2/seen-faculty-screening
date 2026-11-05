import { useState } from 'react'
import { LEVELS, ROLES, nextYearRisk, toBE, type PersonResult, type Settings, type Status } from '../rules'
import { downloadCsv } from '../download'
import { Button, SHOWN_LEVELS, SHOWN_ROLES, STATUS_LABEL, Segmented, StatusChip, displayName, roleShort } from '../ui'

type View = 'cards' | 'table'
type Filter = 'all' | 'not_met'


// v3: "คอลัมน์" (one card column per lecturer) is the default, "ตาราง" the matrix (2026-11-05).
const STATE_KEY = 'seen-screening-lecturers-v3'
function loadState(): { view: View } {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    if (s) return { view: s.view === 'table' ? 'table' : 'cards' }
  } catch {
    /* ignore */
  }
  return { view: 'cards' }
}

export function LecturersPage({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const [state, setState] = useState(loadState)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const update = (s: typeof state) => {
    setState(s)
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }
  const levels = SHOWN_LEVELS
  const roles = SHOWN_ROLES
  const needle = q.trim().toLowerCase()
  const shown = [...results]
    .sort((a, b) => (a.person.nameTh || a.person.nameEn).localeCompare(b.person.nameTh || b.person.nameEn, 'th'))
    .filter((r) => !needle || `${r.person.nameTh} ${r.person.nameEn}`.toLowerCase().includes(needle))
    .filter((r) => filter === 'all' || roles.some((role) => r.roles[role.id].status === filter))

  const exportCsv = () =>
    downloadCsv(
      `seen-lecturers-${settings.year}.csv`,
      ['name_th', 'name_en', 'rank', 'degree', 'degree_year_ce', 'outputs_in_window', 'research_in_window', ...roles.map((r) => `${r.clause} ${r.labelEn}`)],
      shown.map((r) => [
        displayName(r.person),
        r.person.nameEn,
        r.person.rank,
        r.person.degree,
        r.person.degreeYear,
        r.roles.ms_program.counts.total,
        r.roles.ms_program.counts.research,
        ...roles.map((role) => STATUS_LABEL[r.roles[role.id].status].th),
      ]),
    )

  return (
    <>
      <div className="print-only print-header">
        <h1>คุณสมบัติอาจารย์รายบุคคล</h1>
        <p>
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} · นับวารสาร proceedings และโปสเตอร์
        </p>
      </div>
      <div className="section-head">
        <div>
          <h1>รายชื่ออาจารย์</h1>
          <p className="lede">ผลของอาจารย์แต่ละคนตามหน้าที่ แสดง {shown.length} จาก {results.length} คน</p>
        </div>
        <div className="actions no-print">
          <Button onClick={exportCsv}>ดาวน์โหลด CSV</Button>
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      <div className="toolbar no-print">
        <input id="lecturer-search" type="search" className="search" placeholder="ค้นหาชื่อ…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented
          label="กรอง"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'ทั้งหมด' },
            { id: 'not_met', label: 'มีหน้าที่ไม่ผ่าน' },
          ]}
        />
        <Segmented
          label="มุมมอง"
          value={state.view}
          onChange={(v) => update({ ...state, view: v })}
          options={[
            { id: 'cards', label: 'คอลัมน์' },
            { id: 'table', label: 'ตาราง' },
          ]}
        />
      </div>

      {shown.length === 0 && <p className="note">ไม่พบอาจารย์ตามเงื่อนไขที่เลือก</p>}

      {state.view === 'cards' ? (
        <div className="person-grid">
          {shown.map((r) => (
            <PersonCard key={r.person.nameEn} r={r} levels={levels} settings={settings} />
          ))}
        </div>
      ) : (
        <MatrixTable rows={shown} levels={levels} roles={roles} settings={settings} />
      )}
    </>
  )
}

function PersonCard({ r, levels, settings }: { r: PersonResult; levels: (typeof LEVELS)[number][]; settings: Settings }) {
  const risk = nextYearRisk(r, settings).filter((x) => x.level === 'ms' || x.level === 'phd')
  const p = r.person
  const c = r.roles.ms_program.counts
  const statuses = levels.flatMap((l) => ROLES.filter((x) => x.level === l.id).map((x) => r.roles[x.id].status))
  const tally = (s: Status) => statuses.filter((x) => x === s).length
  const href = `#/person/${encodeURIComponent(p.nameEn)}`
  // Red = fails a duty now (takes precedence), yellow = passes now but may fail next year (same as the overview chart).
  const frame = tally('not_met') > 0 ? 'card-fail' : risk.length > 0 ? 'card-risk' : ''
  return (
    <article className={`panel person-card ${frame}`}>
      <header>
        <div className="min0">
          <a href={href} className="person-title">
            {displayName(p)}
          </a>
        </div>
        <div className="person-score mono" title="จำนวนหน้าที่ที่ผ่าน">
          <b>{tally('met')}</b>/{statuses.length}
        </div>
      </header>
      <div className="person-meta">
        <span className="tag">{p.rank ?? 'ไม่ระบุตำแหน่ง'}</span>
        <span className="tag">{p.degree ?? 'ไม่ระบุวุฒิ'}</span>
        {p.degreeYear && <span className="tag">จบ {toBE(p.degreeYear)}</span>}
        {p.programs.map((x) => (
          <span key={x} className="tag tag-accent">
            {x}
          </span>
        ))}
      </div>
      {risk.length > 0 && (
        <div className="risk-note" title={risk.map((x) => `${x.clause} ${x.labelTh}`).join('\n')}>
          ⚠ ถ้าปี {toBE(settings.year + 1)} ไม่มีผลงานเพิ่ม จะไม่ผ่าน {risk.length} หน้าที่
        </div>
      )}
      <div className="person-counts">
        <span>
          ผลงาน 5 ปี <b className="mono">{c.total}</b>
          {c.totalPossible > c.total && <span className="muted"> +{c.totalPossible - c.total}?</span>}
        </span>
        <span>
          งานวิจัย <b className="mono">{c.research}</b>
          {c.researchPossible > c.research && <span className="muted"> +{c.researchPossible - c.research}?</span>}
        </span>
      </div>
      {levels.map((l) => (
        <div key={l.id} className="role-list">
          <div className="role-list-head">
            {l.th} <span className="eyebrow">ข้อ {l.clause}</span>
          </div>
          {ROLES.filter((x) => x.level === l.id).map((role) => {
            const res = r.roles[role.id]
            return (
              <div key={role.id} className={`role-item role-item-${res.status}`} title={res.reasons.join('\n')}>
                <span className="role-item-name">
                  {roleShort(role.id)}
                  {res.path === 'new_grad' && <sup>ใหม่</sup>}
                </span>
                <StatusChip status={res.status} />
              </div>
            )
          })}
        </div>
      ))}
      <a href={href} className="card-link no-print">
        ดูเหตุผลและรายการผลงาน →
      </a>
    </article>
  )
}

function MatrixTable({ rows, levels, roles, settings }: { rows: PersonResult[]; levels: (typeof LEVELS)[number][]; roles: typeof ROLES; settings: Settings }) {
  return (
    <>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky">
                อาจารย์
              </th>
              {levels.map((l) => (
                <th key={l.id} colSpan={roles.filter((r) => r.level === l.id).length} className="group">
                  {l.th} ({l.clause})
                </th>
              ))}
            </tr>
            <tr>
              {roles.map((r) => (
                <th key={r.id} className="role-col" title={r.labelEn}>
                  <span className="clause mono">{r.clause}</span>
                  <span>{roleShort(r.id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const risk = nextYearRisk(r, settings).filter((x) => x.level === 'ms' || x.level === 'phd')
              const fails = roles.some((role) => r.roles[role.id].status === 'not_met')
              return (
              <tr key={r.person.nameEn} className={fails ? 'row-fail' : risk.length ? 'row-risk' : ''}>
                <td className="sticky">
                  <a href={`#/person/${encodeURIComponent(r.person.nameEn)}`}>{displayName(r.person)}</a>
                  {risk.length > 0 && (
                    <div className="risk-inline" title={risk.map((x) => `${x.clause} ${x.labelTh}`).join('\n')}>
                      ⚠ ปี {toBE(settings.year + 1)} อาจไม่ผ่าน {risk.length} หน้าที่
                    </div>
                  )}
                  <div className="muted small">
                    {r.person.rank ?? '—'} · {r.person.degree ?? 'ไม่ระบุวุฒิ'}
                  </div>
                </td>
                {roles.map((role) => {
                  const res = r.roles[role.id]
                  return (
                    <td key={role.id} className="cell">
                      <StatusChip status={res.status} compact title={res.reasons.join('\n')} />
                      {res.path === 'new_grad' && <sup title="ผ่านทางเกณฑ์อาจารย์ใหม่">ใหม่</sup>}
                    </td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <StatusChip status="met" /> <StatusChip status="not_met" /> · แถบซ้ายสีแดง = ไม่ผ่านบางหน้าที่ · <span className="risk-inline">⚠</span> แถบซ้ายสีเหลือง = ปีหน้าอาจไม่ผ่านถ้าไม่มีผลงานเพิ่ม · ชี้ที่ช่องเพื่อดูเหตุผล
      </p>
    </>
  )
}
