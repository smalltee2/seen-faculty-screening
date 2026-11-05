import { useState } from 'react'
import { LEVELS, ROLES, programmeCheck, toBE, type Level, type PersonResult, type Settings } from '../rules'
import { downloadCsv } from '../download'
import { Button, Card, STATUS_LABEL, StatusChip } from '../ui'

const TABS: { id: string; th: string; levels: Level[] }[] = [
  { id: 'degree', th: 'ปริญญาโท / ปริญญาเอก (9.3, 9.4)', levels: ['ms', 'phd'] },
  { id: 'diploma', th: 'ประกาศนียบัตรบัณฑิต (9.1, 9.2)', levels: ['gd', 'hgd'] },
]

export function Overview({ results, queueCount, settings }: { results: PersonResult[]; queueCount: number; settings: Settings }) {
  const [tab, setTab] = useState(TABS[0])
  const levels = LEVELS.filter((l) => tab.levels.includes(l.id))
  const roles = ROLES.filter((r) => tab.levels.includes(r.level))
  const checks = levels.map((l) => programmeCheck(l.id, results))
  const sorted = [...results].sort((a, b) => a.person.nameEn.localeCompare(b.person.nameEn))

  const exportMatrix = () =>
    downloadCsv(
      `seen-screening-${tab.id}-${settings.year}.csv`,
      ['name_en', 'name_th', 'rank', 'degree', 'degree_year_ce', ...roles.map((r) => `${r.clause} ${r.labelEn}`)],
      sorted.map((r) => [
        r.person.nameEn,
        r.person.nameTh,
        r.person.rank,
        r.person.degree,
        r.person.degreeYear,
        ...roles.map((role) => STATUS_LABEL[r.roles[role.id].status].th),
      ]),
    )

  return (
    <>
      <div className="print-only print-header">
        <h1>สรุปผลการคัดกรองคุณสมบัติอาจารย์ — {tab.th}</h1>
        <p>
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} · นับโปสเตอร์: {settings.countPosters ? 'นับ' : 'ไม่นับ'} ·
          พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
        </p>
      </div>

      <div className="cards">
        <Card label="จำนวนอาจารย์ (Lecturers)" value={results.length} />
        <Card
          label="รายการรอตรวจสอบ (Review queue)"
          value={<a href="#/review">{queueCount}</a>}
          sub="ผลงานที่จำแนกไม่แน่ชัด"
          tone={queueCount ? 'needs_review' : undefined}
        />
        {checks.map((c) => (
          <Card
            key={c.level.id}
            label={`หลักสูตร${c.level.th}: ผู้รับผิดชอบหลักสูตร (${c.level.clause}.2)`}
            value={
              <>
                {c.met.length} <span className="card-of">/ ต้องการ ≥ 3</span>
              </>
            }
            sub={
              <>
                <StatusChip status={c.status} />{' '}
                {c.usedAll ? 'ไม่มีผู้ระบุ programs สำหรับระดับนี้ — นับจากอาจารย์ทุกคน' : `จากอาจารย์ที่ระบุในหลักสูตร ${c.listed} คน`}
                {c.review.length > 0 && ` · รอตรวจสอบ ${c.review.length}`}
                {c.metNotListed.length > 0 && ` · ผ่านแต่ไม่ได้อยู่ในหลักสูตร ${c.metNotListed.length}`}
              </>
            }
            tone={c.status}
          />
        ))}
      </div>

      <div className="tabs no-print">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${t.id === tab.id ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.th}
          </button>
        ))}
      </div>

      <div className="role-summary">
        {roles.map((role) => {
          const met = results.filter((r) => r.roles[role.id].status === 'met').length
          const rev = results.filter((r) => r.roles[role.id].status === 'needs_review').length
          return (
            <div key={role.id} className="role-sum">
              <span className="clause">{role.clause}</span>
              <span className="role-name">{role.labelTh}</span>
              <span className="role-count">
                <b>{met}</b> ผ่าน{rev > 0 && <span className="muted"> · {rev} รอตรวจ</span>}
              </span>
            </div>
          )
        })}
      </div>

      <div className="table-head">
        <h2>ตารางคุณสมบัติรายบุคคล</h2>
        <div className="actions no-print">
          <Button onClick={exportMatrix}>ดาวน์โหลด CSV</Button>
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky">อาจารย์ (Lecturer)</th>
              {levels.map((l) => (
                <th key={l.id} colSpan={roles.filter((r) => r.level === l.id).length} className="group">
                  {l.th} ({l.clause})
                </th>
              ))}
            </tr>
            <tr>
              {roles.map((r) => (
                <th key={r.id} className="role-col" title={r.labelEn}>
                  <span className="clause">{r.clause}</span>
                  <span>{r.labelTh}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
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
        <StatusChip status="met" /> <StatusChip status="not_met" /> <StatusChip status="needs_review" /> · <sup>ใหม่</sup> = อาจผ่านด้วยเกณฑ์อาจารย์ใหม่วุฒิปริญญาเอก (9.x.4 / 9.x.6)
        · ชี้ที่ช่องเพื่อดูเหตุผล หรือคลิกชื่อเพื่อดูรายละเอียด
      </p>
    </>
  )
}
