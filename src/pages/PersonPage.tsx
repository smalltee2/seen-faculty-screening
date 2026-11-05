import { useState } from 'react'
import { LEVELS, ROLES, evaluatePub, toBE, type PersonResult, type Settings } from '../rules'
import { downloadCsv } from '../download'
import { Button, STATUS_LABEL, StatusChip, TYPE_LABEL, displayName, yearLabel } from '../ui'

export function PersonPage({ result, settings }: { result: PersonResult | undefined; settings: Settings }) {
  const [allYears, setAllYears] = useState(false)
  if (!result) return <p>ไม่พบอาจารย์รายนี้ · <a href="#/">กลับหน้าภาพรวม</a></p>
  const p = result.person
  const [from, to] = [settings.year - 4, settings.year]
  const evals = result.pubs
    .map((pub) => evaluatePub(pub, p, settings))
    .filter((e) => allYears || (e.pub.year !== null && e.pub.year >= from && e.pub.year <= to))
    .sort((a, b) => (b.pub.year ?? 0) - (a.pub.year ?? 0))
  const scholar = p.scholarId ? `https://scholar.google.com/citations?user=${encodeURIComponent(p.scholarId)}` : null

  const exportRoles = () =>
    downloadCsv(
      `${p.nameEn}-roles-${settings.year}.csv`,
      ['clause', 'role_th', 'role_en', 'status', 'outputs', 'outputs_possible', 'research', 'research_possible', 'reasons'],
      ROLES.map((role) => {
        const r = result.roles[role.id]
        return [role.clause, role.labelTh, role.labelEn, STATUS_LABEL[r.status].th, r.counts.total, r.counts.totalPossible, r.counts.research, r.counts.researchPossible, r.reasons.join(' | ')]
      }),
    )
  const exportPubs = () =>
    downloadCsv(
      `${p.nameEn}-publications.csv`,
      ['year_ce', 'year_be', 'title', 'venue', 'type', 'research', 'counted', 'reasons'],
      evals.map((e) => [e.pub.year, e.pub.year && toBE(e.pub.year), e.pub.title, e.pub.venue, e.pub.type, e.research, e.eligible, e.reasons.join(' | ')]),
    )

  return (
    <>
      <p className="no-print">
        <a href="#/lecturers">← รายชื่ออาจารย์</a>
      </p>
      <h1 className="person-name">
        {displayName(p)}
      </h1>
      <dl className="profile">
        <div><dt>ตำแหน่งวิชาการ</dt><dd>{p.rank ?? '—'}</dd></div>
        <div><dt>วุฒิสูงสุด</dt><dd>{p.degree ?? '—'}</dd></div>
        <div><dt>ปีที่สำเร็จการศึกษา</dt><dd>{yearLabel(p.degreeYear)}</dd></div>
        <div><dt>หลักสูตร (programs)</dt><dd>{p.programs.join(', ') || '—'}</dd></div>
        <div><dt>Google Scholar</dt><dd>{scholar ? <a href={scholar} target="_blank" rel="noreferrer">{p.scholarId}</a> : '—'}</dd></div>
        {p.notes && <div><dt>หมายเหตุ</dt><dd>{p.notes}</dd></div>}
      </dl>

      <div className="table-head">
        <h2>ผลตามบทบาท (ปีที่ประเมิน พ.ศ. {toBE(settings.year)})</h2>
        <div className="actions no-print"><Button onClick={exportRoles}>ดาวน์โหลด CSV</Button></div>
      </div>
      {LEVELS.map((l) => (
        <div key={l.id} className="table-wrap">
          <table className="data">
            <caption>{l.th} ({l.clause})</caption>
            <thead>
              <tr><th>ข้อ</th><th>บทบาท (Role)</th><th>ผล</th><th className="num">ผลงาน</th><th className="num">วิจัย</th><th>เหตุผล (Reason)</th></tr>
            </thead>
            <tbody>
              {ROLES.filter((r) => r.level === l.id).map((role) => {
                const r = result.roles[role.id]
                return (
                  <tr key={role.id}>
                    <td className="clause">{role.clause}</td>
                    <td>{role.labelTh}<div className="muted small">{role.labelEn}</div></td>
                    <td><StatusChip status={r.status} /></td>
                    <td className="num">{r.counts.total}{r.counts.totalPossible > r.counts.total && <span className="muted"> (+{r.counts.totalPossible - r.counts.total}?)</span>}</td>
                    <td className="num">{r.counts.research}{r.counts.researchPossible > r.counts.research && <span className="muted"> (+{r.counts.researchPossible - r.counts.research}?)</span>}</td>
                    <td className="reasons">{r.reasons.map((x, i) => <div key={i}>{x}</div>)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div className="table-head">
        <h2>
          ผลงาน {allYears ? '(ทุกปี)' : `ในช่วง พ.ศ. ${toBE(from)}–${toBE(to)}`} · {evals.length} รายการ
        </h2>
        <div className="actions no-print">
          <label className="inline-toggle"><input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} /> แสดงทุกปี</label>
          <Button onClick={exportPubs}>ดาวน์โหลด CSV</Button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data pubs">
          <thead>
            <tr><th>ปี</th><th>ชื่อเรื่อง / แหล่งตีพิมพ์</th><th>ประเภท (Type)</th><th>วิจัย</th><th>นับ</th><th>หมายเหตุ</th></tr>
          </thead>
          <tbody>
            {evals.map((e) => {
              const outside = e.pub.year === null || e.pub.year < from || e.pub.year > to
              return (
                <tr key={e.pub.id} className={e.eligible === 'no' || outside ? 'greyed' : ''}>
                  <td className="nowrap">{yearLabel(e.pub.year)}</td>
                  <td>
                    <div className="pub-title">{e.pub.title}</div>
                    <div className="muted small">{e.pub.venue || '—'}{e.pub.duplicates > 0 && ` · รวมรายการซ้ำ ${e.pub.duplicates}`}</div>
                  </td>
                  <td>{TYPE_LABEL[e.pub.type]}{e.pub.typeUncertain && ' ?'}</td>
                  <td>{triLabel(e.research)}</td>
                  <td>{outside ? 'นอกช่วง' : triLabel(e.eligible)}</td>
                  <td className="reasons small">{e.reasons.map((x, i) => <div key={i}>{x}</div>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const triLabel = (t: 'yes' | 'maybe' | 'no') => (t === 'yes' ? 'ใช่' : t === 'maybe' ? 'ไม่แน่ใจ' : 'ไม่')
