// "ผลงานอาจารย์" on a phone (Tum, 2026-11-12: every page of the web app gets a phone layout, like a
// mail list and with little text): a search box, three filter chips, and one row per lecturer that
// opens that lecturer's page. The desktop page (charts, cards, table, CSV, print) is unchanged.
import { useMemo, useState } from 'react'
import { nextYearRisk, type PersonResult, type Settings } from '../rules'
import { SHOWN_ROLES, displayName, isShownLevel } from '../ui'

type Filter = 'all' | 'not_met' | 'risk'

export interface LecturerRow {
  nameEn: string
  name: string
  passed: number
  failed: number
  risk: number
  counted: number
}

/** One row per lecturer: duties passed and failed, duties at risk next year, counted works. Lecturers
 *  failing a duty come first, then those at risk, then by counted works. */
export function lecturerRows(results: PersonResult[], settings: Settings): LecturerRow[] {
  return results
    .map((r) => ({
      nameEn: r.person.nameEn,
      name: displayName(r.person),
      passed: SHOWN_ROLES.filter((x) => r.roles[x.id].status === 'met').length,
      failed: SHOWN_ROLES.filter((x) => r.roles[x.id].status !== 'met').length,
      risk: nextYearRisk(r, settings).filter((x) => isShownLevel(x.level)).length,
      counted: r.roles[SHOWN_ROLES[0].id].counts.total,
    }))
    .sort((a, b) => Number(b.failed > 0) - Number(a.failed > 0) || Number(b.risk > 0) - Number(a.risk > 0) || b.counted - a.counted || a.name.localeCompare(b.name, 'th'))
}

export const initial = (name: string) => name.replace(/^((ศ|รศ|ผศ)\.)?\s*(ดร\.)?\s*(อ\.)?\s*/, '').slice(0, 1)

export function MobileLecturers({ results, settings, filter: first = 'all' }: { results: PersonResult[]; settings: Settings; filter?: Filter }) {
  const rows = useMemo(() => lecturerRows(results, settings), [results, settings])
  const [filter, setFilter] = useState<Filter>(first)
  const [q, setQ] = useState('')
  const failing = rows.filter((r) => r.failed > 0)
  const risky = rows.filter((r) => r.failed === 0 && r.risk > 0)
  const base = filter === 'not_met' ? failing : filter === 'risk' ? risky : rows
  const needle = q.trim().toLowerCase()
  const shown = needle ? base.filter((r) => r.name.toLowerCase().includes(needle) || r.nameEn.toLowerCase().includes(needle)) : base
  return (
    <div className="mme">
      <input className="mlist-search" type="search" inputMode="search" placeholder="ค้นหาชื่อ" aria-label="ค้นหาชื่ออาจารย์" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mme-chips" role="tablist" aria-label="กลุ่ม">
        {(
          [
            ['all', `ทั้งหมด ${rows.length}`],
            ['not_met', `ไม่ผ่าน ${failing.length}`],
            ['risk', `ปีหน้าเสี่ยง ${risky.length}`],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="mme-works">
        {shown.length === 0 && <li className="mme-empty">ไม่พบรายชื่อ</li>}
        {shown.map((r) => {
          const tone = r.failed > 0 ? 'bad' : r.risk > 0 ? 'warn' : 'ok'
          return (
            <li key={r.nameEn}>
              <a className="mme-work mlist-row" href={`#/person/${encodeURIComponent(r.nameEn)}`}>
                <span className={`mme-type mlist-avatar ${tone}`} aria-hidden="true">
                  {initial(r.name)}
                </span>
                <span className="mme-work-main">
                  <span className="mme-title">{r.name}</span>
                  <span className={`mme-venue mlist-${tone}`}>{r.failed > 0 ? `ไม่ผ่าน ${r.failed} หน้าที่` : r.risk > 0 ? `ปีหน้าเสี่ยง ${r.risk} หน้าที่` : 'ผ่านทุกหน้าที่'}</span>
                </span>
                <span className="mlist-count">
                  <b>{r.counted}</b>
                  <small>ผลงาน</small>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
