import { useState } from 'react'
import { nextYearRisk, programmeCheck, toBE, type PersonResult, type Settings } from '../rules'
import { LecturerOutputs, PubsPerYear, ReadinessPie, levelOf, type OutputsView } from '../charts'
import { Button, LEVEL_GROUPS, Metric, SHOWN_LEVELS, SHOWN_ROLES, Segmented, StatusBar, StatusChip, isShownLevel, levelGroup, roleShort, type LevelGroup } from '../ui'

export function Overview({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const [view, setView] = useState<OutputsView>('research')
  const [group, setGroup] = useState<LevelGroup>('grad')
  const g = LEVEL_GROUPS.find((x) => x.id === group)!
  const countedPubs = new Set(results.flatMap((r) => r.roles.ms_program.used.map((e) => e.pub.titleNorm))).size
  const checks = SHOWN_LEVELS.map((l) => programmeCheck(l.id, results))
  const [ba, ms, phd] = checks
  const fullyMet = results.filter((r) => SHOWN_ROLES.every((x) => r.roles[x.id].status === 'met')).length
  // Per level group: fails now (any duty not met) and next-year risk, for the summary links.
  const failing = (g: 'ba' | 'grad') => results.filter((r) => SHOWN_ROLES.some((x) => levelGroup(x.level) === g && r.roles[x.id].status === 'not_met')).length
  const risking = (g: 'ba' | 'grad') => results.filter((r) => nextYearRisk(r, settings).some((x) => isShownLevel(x.level) && levelGroup(x.level) === g)).length
  const failBa = failing('ba')
  const failGrad = failing('grad')
  const riskBa = risking('ba')
  const riskGrad = risking('grad')
  const Count = ({ n, filter, scope }: { n: number; filter: 'not_met' | 'risk'; scope: 'ba' | 'grad' }) =>
    n > 0 ? (
      <a className="count-link" href={`#/lecturers?filter=${filter}&scope=${scope}`} title="ดูรายชื่อ">
        <b className="mono">{n}</b> คน
      </a>
    ) : (
      <>
        <b className="mono">0</b> คน
      </>
    )
  const Y = toBE(settings.year)

  return (
    <>
      <div className="print-only print-header">
        <h1>สรุปผลการคัดกรองคุณสมบัติอาจารย์</h1>
        <p>
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} · นับวารสาร proceedings และโปสเตอร์ ·
          พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
        </p>
      </div>

      <div className="report-head">
        <div className="min0">
          <h1>รายงานสรุปผลการตรวจสอบคุณสมบัติอาจารย์</h1>
          <p className="lede">
            อาจารย์ {results.length} คน · ข้อ 10 (ป.ตรี) และข้อ 9 (บัณฑิตศึกษา) ประกาศ กมอ. พ.ศ. 2565
          </p>
        </div>
        <div className="actions no-print">
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      <div className="summary-row">
        <div className="finding">
        <p>
          ปีการประเมิน พ.ศ. {Y} อาจารย์ <b className="mono">{fullyMet}</b> จาก <span className="mono">{results.length}</span> คน ผ่านเกณฑ์ครบทุกหน้าที่
        </p>
        <p>
          อาจารย์ที่มีคุณสมบัติเป็นผู้รับผิดชอบหลักสูตรได้ ระดับปริญญาตรี <b className="mono">{ba.met.length}</b> คน (ต้องมีอย่างน้อย 5 คน) ระดับปริญญาโท{' '}
          <b className="mono">{ms.met.length}</b> คน และระดับปริญญาเอก <b className="mono">{phd.met.length}</b> คน (ต้องมีอย่างน้อย 3 คน)
        </p>
      </div>

      {failBa + failGrad + riskBa + riskGrad > 0 && (
        <div className="finding finding-alert" role="note">
          <span className="alert-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M12 3 2.5 20h19L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M12 9v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1.3" fill="currentColor" />
            </svg>
          </span>
          <div className="alert-body">
            {failBa + failGrad > 0 && (
              <p>
                อาจารย์ที่ยังไม่ผ่านเกณฑ์บางหน้าที่ ระดับปริญญาตรี <Count n={failBa} filter="not_met" scope="ba" /> ระดับบัณฑิตศึกษา{' '}
                <Count n={failGrad} filter="not_met" scope="grad" />
              </p>
            )}
            {riskBa + riskGrad > 0 && (
              <p>
                หากไม่มีผลงานเพิ่มในปี พ.ศ. {toBE(settings.year + 1)} จะมีอาจารย์ไม่ผ่านเพิ่ม ระดับปริญญาตรี <Count n={riskBa} filter="risk" scope="ba" /> ระดับบัณฑิตศึกษา{' '}
                <Count n={riskGrad} filter="risk" scope="grad" />
              </p>
            )}
          </div>
        </div>
      )}
      </div>

      <div className="metrics">
        <Metric label="อาจารย์ทั้งหมด" value={results.length} sub={`ผ่านครบทุกหน้าที่ ${fullyMet} คน`} />
        <Metric label="ผู้รับผิดชอบหลักสูตร ป.ตรี (ข้อ 10.1.2)" value={<>{ba.met.length}<small> คน</small></>} sub={<StatusChip status={ba.status} />} tone={ba.status} />
        <Metric label="ผู้รับผิดชอบหลักสูตร ป.โท (ข้อ 9.3.2)" value={<>{ms.met.length}<small> คน</small></>} sub={<StatusChip status={ms.status} />} tone={ms.status} />
        <Metric label="ผู้รับผิดชอบหลักสูตร ป.เอก (ข้อ 9.4.2)" value={<>{phd.met.length}<small> คน</small></>} sub={<StatusChip status={phd.status} />} tone={phd.status} />
        <Metric label="ผลงานที่นับได้ในช่วง 5 ปี" value={countedPubs} />
      </div>

      <div className="dash">
        <section className="panel dash-pie">
          <h3>
            สัดส่วนอาจารย์ตามผลการประเมิน
          </h3>
          <ReadinessPie results={results} compact />
        </section>

        <section className="panel dash-roles">
          <h3>
            จำนวนอาจารย์ที่ผ่านแต่ละหน้าที่
          </h3>
          {SHOWN_LEVELS.map((l) => (
            <div key={l.id} className={`role-level level-${l.id}`}>
              <div className="role-level-head">
                {l.th} <span className="eyebrow">ข้อ {l.clause}</span>
              </div>
              {SHOWN_ROLES.filter((r) => r.level === l.id).map((role) => {
                const st = results.map((r) => r.roles[role.id].status)
                const met = st.filter((x) => x === 'met').length
                const review = st.filter((x) => x === 'needs_review').length
                const notMet = st.length - met - review
                return (
                  <div key={role.id} className="role-row">
                    <span className="clause mono">{role.clause}</span>
                    <span className="role-name" title={role.labelTh}>
                      {roleShort(role.id)}
                    </span>
                    <StatusBar met={met} review={review} notMet={notMet} />
                    <span className="role-num mono">
                      <b>{met}</b>/{st.length}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
          <p className="legend bar-legend">
            <span className="dot dot-met" /> ผ่าน <span className="dot dot-not" /> ไม่ผ่าน · ตัวเลข = ผ่าน / ทั้งหมด
          </p>
        </section>

        <section className="panel dash-pubs">
          <h3>
            จำนวนผลงานต่อปี แยกตามประเภท
          </h3>
          <p className="note">
            รวมทุกคน (ผลงานร่วมนับแยกตามอาจารย์) · แถบสีเขียว = ช่วง 5 ปีที่ใช้ประเมิน · วารสารนานาชาติ = อยู่ใน Scopus · ระดับชาติ = อยู่ใน TCI กลุ่ม 1–2 ·
            นอกฐานข้อมูล = ไม่พบในทั้งสองฐาน
          </p>
          <PubsPerYear pubs={results.flatMap((r) => r.pubs)} settings={settings} />
          <TypeSummary pubs={results.flatMap((r) => r.pubs)} settings={settings} />
        </section>
      </div>

      <div className="block-head">
        <h2 className="block-title">ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน</h2>
        <div className="no-print chart-switches">
          <Segmented label="ระดับหลักสูตร" value={group} onChange={setGroup} options={LEVEL_GROUPS.map((x) => ({ id: x.id, label: x.th }))} />
          <Segmented
            label="มุมมองกราฟผลงาน"
            value={view}
            onChange={setView}
            options={[
              { id: 'research', label: 'งานวิจัย / ผลงานอื่น' },
              { id: 'type', label: 'แยกตามประเภทผลงาน' },
            ]}
          />
        </div>
      </div>
      <p className="note">กรอบสีแดง = ไม่ผ่านบางหน้าที่ของระดับนั้น · กรอบสีเหลือง = ปีหน้าอาจไม่ผ่าน · คลิกชื่อเพื่อดูรายละเอียด</p>
      <section className={`panel level-panel level-${g.id}`}>
        <h3 className="level-title">
          {g.th} <span className="eyebrow">{g.clause}</span>
        </h3>
        <p className="note">เกณฑ์: {g.ruleTh}</p>
        <LecturerOutputs key={g.id} results={results} settings={settings} group={g.id} view={view} />
      </section>
    </>
  )
}

/** Outputs by type in the 5-year window, per year and total: the same counting as the chart above
 *  (every lecturer's own list, so a co-authored paper counts once per lecturer). */
function TypeSummary({ pubs, settings }: { pubs: PersonResult['pubs']; settings: Settings }) {
  const years = Array.from({ length: 5 }, (_, i) => settings.year - 4 + i)
  const types = [
    { id: 'journalIntl', cls: 'c-journal', th: 'วารสารนานาชาติ', match: (p: PersonResult['pubs'][number]) => levelOf(p) === 'intl' },
    { id: 'journalNatl', cls: 'c-journal-natl', th: 'วารสารระดับชาติ', match: (p: PersonResult['pubs'][number]) => levelOf(p) === 'natl' },
    { id: 'journalNone', cls: 'c-journal-none', th: 'วารสารนอกฐานข้อมูล', match: (p: PersonResult['pubs'][number]) => levelOf(p) === 'none' },
    { id: 'proceeding', cls: 'c-proceeding', th: 'Proceedings', match: (p: PersonResult['pubs'][number]) => p.type === 'proceeding' },
    { id: 'poster', cls: 'c-poster', th: 'โปสเตอร์/บทคัดย่อ', match: (p: PersonResult['pubs'][number]) => p.type === 'poster' },
  ]
  const rows = types.map((t) => {
    const perYear = years.map((y) => pubs.filter((p) => p.year === y && t.match(p)).length)
    return { ...t, perYear, total: perYear.reduce((a, b) => a + b, 0) }
  })
  const colTotal = years.map((_, i) => rows.reduce((a, r) => a + r.perYear[i], 0))
  const grand = colTotal.reduce((a, b) => a + b, 0)
  return (
    <div className="table-wrap type-summary">
      <table className="data compact">
        <caption className="sr-only">จำนวนผลงานแยกตามประเภท ช่วง 5 ปีที่ใช้ประเมิน</caption>
        <thead>
          <tr>
            <th>ประเภท</th>
            {years.map((y) => (
              <th key={y} className="num">{toBE(y)}</th>
            ))}
            <th className="num">รวม</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <i className={`swatch ${r.cls}`} /> {r.th}
              </td>
              {r.perYear.map((n, i) => (
                <td key={i} className="num mono">{n}</td>
              ))}
              <td className="num mono"><b>{r.total}</b></td>
            </tr>
          ))}
          <tr className="total">
            <td>รวม</td>
            {colTotal.map((n, i) => (
              <td key={i} className="num mono"><b>{n}</b></td>
            ))}
            <td className="num mono"><b>{grand}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
