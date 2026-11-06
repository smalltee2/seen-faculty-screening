import { useState } from 'react'
import { evaluatePub, toBE, type PersonResult, type Settings } from '../rules'
import { CONFERENCE_TAG } from '../conferences'
import { downloadCsv } from '../download'
import { Button, SHOWN_LEVELS, SHOWN_ROLES, STATUS_LABEL, StatusChip, TYPE_LABEL, displayName, yearLabel } from '../ui'
import { journalLevel, journalTag } from '../tci'
import { TCI } from '../tciIndex'

export function PersonPage({ result, settings }: { result: PersonResult | undefined; settings: Settings }) {
  const [allYears, setAllYears] = useState(false)
  if (!result) return <p>ไม่พบอาจารย์รายนี้ · <a href="#/">กลับหน้าภาพรวม</a></p>
  const p = result.person
  const [from, to] = [settings.year - 4, settings.year]
  // Screening view: list only outputs that count (journal, proceedings, poster); the rest are hidden.
  const inRange = result.pubs
    .map((pub) => evaluatePub(pub, p, settings))
    .filter((e) => allYears || (e.pub.year !== null && e.pub.year >= from && e.pub.year <= to))
  const evals = inRange.filter((e) => e.eligible !== 'no').sort((a, b) => (b.pub.year ?? 0) - (a.pub.year ?? 0))
  const hidden = inRange.length - evals.length
  const scholar = p.scholarId ? `https://scholar.google.com/citations?user=${encodeURIComponent(p.scholarId)}` : null

  const exportRoles = () =>
    downloadCsv(
      `${p.nameEn}-roles-${settings.year}.csv`,
      ['clause', 'role_th', 'role_en', 'status', 'outputs', 'outputs_possible', 'research', 'research_possible', 'reasons'],
      SHOWN_ROLES.map((role) => {
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
        <div><dt>วุฒิสูงสุด</dt><dd>{p.degree ? (p.degreeField ? `${p.degree} (${p.degreeField})` : p.degree) : '—'}</dd></div>
        {/* Empty fields are hidden; they appear once filled in faculty.csv. */}
        {p.degreeYear !== null && <div><dt>ปีที่สำเร็จการศึกษา</dt><dd>พ.ศ. {toBE(p.degreeYear)} (ค.ศ.{p.degreeYear})</dd></div>}
        {p.programs.length > 0 && <div><dt>หลักสูตร (programs)</dt><dd>{p.programs.join(', ')}</dd></div>}
        <div><dt>โปรไฟล์ผลงาน</dt><dd>{scholar ? <a href={scholar} target="_blank" rel="noreferrer">Google Scholar ↗</a> : '—'}</dd></div>
        {p.notes && <div><dt>หมายเหตุ</dt><dd>{p.notes}</dd></div>}
      </dl>

      <div className="table-head">
        <h2>ผลตามหน้าที่ (ปีที่ประเมิน พ.ศ. {toBE(settings.year)})</h2>
        <div className="actions no-print"><Button onClick={exportRoles}>ดาวน์โหลด CSV</Button></div>
      </div>
      {SHOWN_LEVELS.map((l) => (
        <div key={l.id} className="table-wrap">
          <table className="data">
            <caption>{l.th} ({l.clause})</caption>
            <thead>
              <tr><th>ข้อ</th><th>หน้าที่ (Role)</th><th>ผล</th><th className="num">ผลงาน</th><th className="num">วิจัย</th><th>เหตุผล (Reason)</th></tr>
            </thead>
            <tbody>
              {SHOWN_ROLES.filter((r) => r.level === l.id).map((role) => {
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
          ผลงานที่นับ {allYears ? '(ทุกปี)' : `ในช่วง พ.ศ. ${toBE(from)}–${toBE(to)}`} · {evals.length} รายการ
        </h2>
        {hidden > 0 && <span className="muted small">ไม่แสดงผลงานที่ไม่เข้าเกณฑ์ {hidden} รายการ</span>}
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
                    <div className="muted small">{e.pub.venue || '—'}{` · แหล่ง: ${e.pub.sources.map((x) => SRC[x]).join(', ')}`}
                      {e.pub.doi && (
                        <>
                          {' · '}
                          <a href={`https://doi.org/${e.pub.doi}`} target="_blank" rel="noreferrer">
                            DOI
                          </a>
                        </>
                      )}</div>
                  </td>
                  <td>
                    {TYPE_LABEL[e.pub.type]}{e.pub.typeUncertain && ' ?'}
                    {e.pub.type === 'journal' && <div className={`jl jl-${journalLevel(e.pub, TCI)?.level}`}>{journalTag(journalLevel(e.pub, TCI))}</div>}
                    {e.pub.type === 'proceeding' && e.pub.conference && (
                      <div className={`jl cf cf-${e.pub.conference.verdict}`} title={e.pub.conference.reason}>
                        {CONFERENCE_TAG[e.pub.conference.verdict]}
                        {e.pub.conference.entry?.evidenceUrl && (
                          <>
                            {' '}
                            <a href={e.pub.conference.entry.evidenceUrl} target="_blank" rel="noreferrer" title="หลักฐาน">↗</a>
                          </>
                        )}
                      </div>
                    )}
                  </td>
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

const SRC = { scholar: 'Scholar', openalex: 'OpenAlex', scopus: 'Scopus', manual: 'แบบฟอร์ม' } as const

const triLabel = (t: 'yes' | 'maybe' | 'no') => (t === 'yes' ? 'ใช่' : t === 'maybe' ? 'ไม่แน่ใจ' : 'ไม่')
