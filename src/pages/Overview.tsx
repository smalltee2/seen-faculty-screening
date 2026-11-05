import { nextYearRisk, programmeCheck, toBE, type PersonResult, type Settings } from '../rules'
import { LecturerOutputs, PubsPerYear, ReadinessPie } from '../charts'
import { Button, Metric, SHOWN_LEVELS, SHOWN_ROLES, StatusBar, StatusChip, roleShort } from '../ui'

export function Overview({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const countedPubs = new Set(results.flatMap((r) => r.roles.ms_program.used.map((e) => e.pub.titleNorm))).size
  const checks = SHOWN_LEVELS.map((l) => programmeCheck(l.id, results))
  const [ms, phd] = checks
  const fullyMet = results.filter((r) => SHOWN_ROLES.every((x) => r.roles[x.id].status === 'met')).length
  const atRisk = results.filter((r) => nextYearRisk(r, settings).some((x) => x.level === 'ms' || x.level === 'phd')).length
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
            อาจารย์ {results.length} คน · ข้อ 9 ประกาศ กมอ. พ.ศ. 2565 · ผลงานปี พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)}
          </p>
        </div>
        <div className="actions no-print">
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      <div className="finding">
        <span>
          ปีการประเมิน พ.ศ. {Y}: ผ่านครบทุกหน้าที่ <b className="mono">{fullyMet}</b> จาก <span className="mono">{results.length}</span> คน · ผู้รับผิดชอบหลักสูตรที่มีคุณสมบัติ ป.โท{' '}
          <b className="mono">{ms.met.length}</b> คน ป.เอก <b className="mono">{phd.met.length}</b> คน (เกณฑ์ ≥ 3)
          {atRisk > 0 && (
            <>
              {' '}
              · <a href="#/lecturers">{atRisk} คน</a> อาจไม่ผ่านในปี พ.ศ. {toBE(settings.year + 1)} ถ้าไม่มีผลงานเพิ่ม
            </>
          )}
        </span>
      </div>

      <div className="metrics">
        <Metric label="อาจารย์ทั้งหมด" value={results.length} sub={`ผ่านครบทุกหน้าที่ ${fullyMet} คน`} />
        <Metric label="ผู้รับผิดชอบหลักสูตร ป.โท (ข้อ 9.3.2)" value={<>{ms.met.length}<small> คน</small></>} sub={<StatusChip status={ms.status} />} tone={ms.status} />
        <Metric label="ผู้รับผิดชอบหลักสูตร ป.เอก (ข้อ 9.4.2)" value={<>{phd.met.length}<small> คน</small></>} sub={<StatusChip status={phd.status} />} tone={phd.status} />
        <Metric label="ผลงานที่นับได้ในช่วง 5 ปี" value={countedPubs} sub="ผลงานที่มีผู้เขียนร่วมหลายคนนับครั้งเดียว" />
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
            <div key={l.id} className="role-level">
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
          <p className="note">รวมทุกคน (ผลงานร่วมนับแยกตามอาจารย์) · แถบสีเขียว = ช่วง 5 ปีที่ใช้ประเมิน</p>
          <PubsPerYear pubs={results.flatMap((r) => r.pubs)} settings={settings} />
        </section>
      </div>

      <h2 className="block-title">
        ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน
      </h2>
      <section className="panel">
        <p className="note">
          เกณฑ์ ป.โท: ผลงานอย่างน้อย 3 เรื่อง (เป็นงานวิจัยอย่างน้อย 1 เรื่อง) · เกณฑ์ ป.เอก: งานวิจัยอย่างน้อย 3 เรื่อง · กรอบสีแดง = ไม่ผ่านบางหน้าที่ · กรอบสีเหลือง = ปีหน้าอาจไม่ผ่าน ·
          คลิกชื่อเพื่อดูรายละเอียด
        </p>
        <LecturerOutputs results={results} settings={settings} />
      </section>
    </>
  )
}
