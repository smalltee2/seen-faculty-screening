import { useState } from 'react'
import { LEVELS, ROLES, toBE, type Level, type PersonResult, type Settings, type Status } from '../rules'
import { downloadCsv } from '../download'
import { Button, STATUS_LABEL, Segmented, StatusChip, roleShort } from '../ui'

type LevelSet = 'degree' | 'diploma'
type View = 'cards' | 'table'
type Filter = 'all' | 'not_met' | 'needs_review'

const LEVEL_SETS: Record<LevelSet, Level[]> = { degree: ['ms', 'phd'], diploma: ['gd', 'hgd'] }

const STATE_KEY = 'seen-screening-lecturers'
function loadState(): { levels: LevelSet; view: View } {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    if (s) return { levels: s.levels === 'diploma' ? 'diploma' : 'degree', view: s.view === 'table' ? 'table' : 'cards' }
  } catch {
    /* ignore */
  }
  return { levels: 'degree', view: 'cards' }
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
  const levels = LEVELS.filter((l) => LEVEL_SETS[state.levels].includes(l.id))
  const roles = ROLES.filter((r) => LEVEL_SETS[state.levels].includes(r.level))
  const needle = q.trim().toLowerCase()
  const shown = [...results]
    .sort((a, b) => (a.person.nameTh || a.person.nameEn).localeCompare(b.person.nameTh || b.person.nameEn, 'th'))
    .filter((r) => !needle || `${r.person.nameTh} ${r.person.nameEn}`.toLowerCase().includes(needle))
    .filter((r) => filter === 'all' || roles.some((role) => r.roles[role.id].status === filter))

  const exportCsv = () =>
    downloadCsv(
      `seen-lecturers-${state.levels}-${settings.year}.csv`,
      ['name_en', 'name_th', 'rank', 'degree', 'degree_year_ce', 'outputs_in_window', 'research_in_window', ...roles.map((r) => `${r.clause} ${r.labelEn}`)],
      shown.map((r) => [
        r.person.nameEn,
        r.person.nameTh,
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
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} · นับโปสเตอร์: {settings.countPosters ? 'นับ' : 'ไม่นับ'}
        </p>
      </div>
      <div className="section-head">
        <div>
          <h1>รายชื่ออาจารย์</h1>
          <p className="lede">คุณสมบัติของอาจารย์แต่ละคนตามบทบาท แสดง {shown.length} จาก {results.length} คน</p>
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
          label="ระดับ"
          value={state.levels}
          onChange={(v) => update({ ...state, levels: v })}
          options={[
            { id: 'degree', label: 'ป.โท / ป.เอก' },
            { id: 'diploma', label: 'ประกาศนียบัตร' },
          ]}
        />
        <Segmented
          label="กรอง"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'ทั้งหมด' },
            { id: 'not_met', label: 'มีบทบาทไม่ผ่าน' },
            { id: 'needs_review', label: 'มีรอตรวจ' },
          ]}
        />
        <Segmented
          label="มุมมอง"
          value={state.view}
          onChange={(v) => update({ ...state, view: v })}
          options={[
            { id: 'cards', label: 'การ์ด' },
            { id: 'table', label: 'ตาราง' },
          ]}
        />
      </div>

      {shown.length === 0 && <p className="note">ไม่พบอาจารย์ตามเงื่อนไขที่เลือก</p>}

      {state.view === 'cards' ? (
        <div className="person-grid">
          {shown.map((r) => (
            <PersonCard key={r.person.nameEn} r={r} levels={levels} />
          ))}
        </div>
      ) : (
        <MatrixTable rows={shown} levels={levels} roles={roles} />
      )}
    </>
  )
}

function PersonCard({ r, levels }: { r: PersonResult; levels: (typeof LEVELS)[number][] }) {
  const p = r.person
  const c = r.roles.ms_program.counts
  const statuses = levels.flatMap((l) => ROLES.filter((x) => x.level === l.id).map((x) => r.roles[x.id].status))
  const tally = (s: Status) => statuses.filter((x) => x === s).length
  const href = `#/person/${encodeURIComponent(p.nameEn)}`
  return (
    <article className="panel person-card">
      <header>
        <div className="min0">
          <a href={href} className="person-title">
            {p.nameTh || p.nameEn}
          </a>
          <div className="muted small">{p.nameEn}</div>
        </div>
        <div className="person-score mono" title="จำนวนบทบาทที่ผ่าน">
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

function MatrixTable({ rows, levels, roles }: { rows: PersonResult[]; levels: (typeof LEVELS)[number][]; roles: typeof ROLES }) {
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
            {rows.map((r) => (
              <tr key={r.person.nameEn}>
                <td className="sticky">
                  <a href={`#/person/${encodeURIComponent(r.person.nameEn)}`}>{r.person.nameTh || r.person.nameEn}</a>
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
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <StatusChip status="met" /> <StatusChip status="not_met" /> <StatusChip status="needs_review" /> · <sup>ใหม่</sup> = อาจผ่านด้วยเกณฑ์อาจารย์ใหม่วุฒิปริญญาเอก · ชี้ที่ช่องเพื่อดูเหตุผล
      </p>
    </>
  )
}
