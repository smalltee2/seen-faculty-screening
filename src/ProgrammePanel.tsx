// Admin tab, "หลักสูตร" drop-down (Tum, 2026-11-08): the lecturers of one programme with their
// role in it, contact details and the result for that level's responsible-lecturer duty.
import { LEVELS, type PersonResult } from './rules'
import type { Programme } from './types'
import { StatusChip, displayName } from './ui'

const degreeText = (r: PersonResult) => {
  const p = r.person
  if (!p.degree) return '—'
  const bits = [p.degree, p.degreeField, p.degreeYear ? `พ.ศ. ${p.degreeYear + 543}` : ''].filter(Boolean)
  return bits.join(' · ')
}

const LEVEL_SHORT = { ba: 'ป.ตรี', ms: 'ป.โท', phd: 'ป.เอก' } as const

export function ProgrammePanel({ programme, results }: { programme: Programme; results: PersonResult[] }) {
  const lv = LEVELS.find((l) => l.id === programme.level)!
  const rows = programme.members.map((m) => ({ m, r: results.find((x) => x.person.nameEn === m.nameEn) }))
  const isMet = ({ r }: (typeof rows)[number]) => r?.roles[lv.responsible].status === 'met'
  // When the programme document names its responsible lecturers, count those; otherwise everyone listed.
  const named = rows.filter(({ m }) => m.responsible)
  const pool = named.length ? named : rows
  const met = pool.filter(isMet).length
  return (
    <section className="panel programme-panel">
      <div className="programme-head">
        <span className={`programme-level lvl-${programme.level}`}>{LEVEL_SHORT[programme.level]}</span>
        <h2>{programme.th}</h2>
      </div>
      <p className="programme-summary">
        อาจารย์ในหลักสูตร <b>{rows.length}</b> คน
        {named.length > 0 && (
          <>
            {' '}· อาจารย์ผู้รับผิดชอบหลักสูตร <b>{named.length}</b> คน
          </>
        )}{' '}
        · ผ่านคุณสมบัติอาจารย์ผู้รับผิดชอบหลักสูตร (ข้อ {lv.clause}.2) <b>{met}</b>
        {named.length > 0 ? ` จาก ${named.length}` : ''} คน
        <span className="muted"> (ต้องมีอย่างน้อย {lv.minResponsible} คน)</span>
      </p>
      <div className="programme-table">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">ชื่อ</th>
              <th scope="col">ตำแหน่งในหลักสูตร</th>
              {named.length > 0 && <th scope="col">อาจารย์ผู้รับผิดชอบหลักสูตร</th>}
              <th scope="col">คุณวุฒิสูงสุด</th>
              <th scope="col">อีเมล</th>
              <th scope="col">โทรภายใน</th>
              <th scope="col">ผลคุณสมบัติ (ข้อ {lv.clause}.2)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, r }) => (
              <tr key={m.nameEn}>
                <td>
                  <a href={`#/person/${encodeURIComponent(m.nameEn)}`}>{r ? displayName(r.person) : m.nameEn}</a>
                </td>
                <td>{m.role === 'ประธานหลักสูตร' ? <b>{m.role}</b> : m.role}</td>
                {named.length > 0 && <td className="programme-resp">{m.responsible ? '✓' : ''}</td>}
                <td>{r ? degreeText(r) : '—'}</td>
                <td className="mono">{m.email || '—'}</td>
                <td className="mono">{m.ext || '—'}</td>
                <td>{r ? <StatusChip status={r.roles[lv.responsible].status} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
