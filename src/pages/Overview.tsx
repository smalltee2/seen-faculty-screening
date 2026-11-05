import { programmeCheck, toBE, type PersonResult, type Settings } from '../rules'
import { LecturerOutputs, PubsPerYear, ReadinessDonut } from '../charts'
import { Button, Metric, SHOWN_LEVELS, SHOWN_ROLES, StatusBar, StatusChip } from '../ui'

export function Overview({ results, queueCount, settings }: { results: PersonResult[]; queueCount: number; settings: Settings }) {
  const checks = SHOWN_LEVELS.map((l) => programmeCheck(l.id, results))
  const [ms, phd] = checks
  const fullyMet = results.filter((r) => SHOWN_ROLES.every((x) => r.roles[x.id].status === 'met')).length

  return (
    <>
      <div className="print-only print-header">
        <h1>สรุปผลการคัดกรองคุณสมบัติอาจารย์</h1>
        <p>
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)} · นับวารสาร proceedings และโปสเตอร์ ·
          พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
        </p>
      </div>

      <div className="section-head">
        <div>
          <h1>ภาพรวม</h1>
          <p className="lede">
            อาจารย์ {results.length} คน ประเมินตามข้อ 9 ด้วยผลงานปี พ.ศ. {toBE(settings.year - 4)}–{toBE(settings.year)}
          </p>
        </div>
        <div className="actions no-print">
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      <div className="metrics">
        <Metric label="อาจารย์ทั้งหมด" value={results.length} sub={`ผ่านทุกบทบาท ป.โท/เอก ${fullyMet} คน`} />
        <Metric label="ผู้รับผิดชอบ ป.โท (9.3.2)" value={<>{ms.met.length}<small>/3</small></>} sub={<StatusChip status={ms.status} />} tone={ms.status} />
        <Metric label="ผู้รับผิดชอบ ป.เอก (9.4.2)" value={<>{phd.met.length}<small>/3</small></>} sub={<StatusChip status={phd.status} />} tone={phd.status} />
        <Metric label="รายการรอตรวจสอบ" value={<a href="#/review">{queueCount}</a>} sub="ผลงานที่จำแนกไม่แน่ชัด" tone={queueCount ? 'needs_review' : undefined} />
      </div>

      <div className="viz-grid">
        <section className="panel">
          <h3>สถานะอาจารย์ (ป.โท + ป.เอก 10 บทบาท)</h3>
          <ReadinessDonut results={results} />
        </section>
        <section className="panel">
          <h3>ผลงานต่อปี แยกตามประเภท (ทุกคนรวมกัน)</h3>
          <PubsPerYear pubs={results.flatMap((r) => r.pubs)} settings={settings} />
        </section>
      </div>

      <section className="panel">
        <h3>ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน</h3>
        <p className="note">
          ป.โท ต้องมีผลงาน ≥ 3 เรื่อง (วิจัย ≥ 1) · ป.เอก ต้องมีงานวิจัย ≥ 3 เรื่อง · คลิกชื่อเพื่อดูรายละเอียด
        </p>
        <LecturerOutputs results={results} settings={settings} />
      </section>

      <h2 className="block-title">จำนวนอาจารย์ที่ผ่านแต่ละบทบาท</h2>
      <div className="role-levels">
        {SHOWN_LEVELS.map((l) => (
          <section key={l.id} className="panel role-level">
            <h3>
              {l.th} <span className="eyebrow">ข้อ {l.clause}</span>
            </h3>
            {SHOWN_ROLES.filter((r) => r.level === l.id).map((role) => {
              const st = results.map((r) => r.roles[role.id].status)
              const met = st.filter((s) => s === 'met').length
              const review = st.filter((s) => s === 'needs_review').length
              const notMet = st.length - met - review
              return (
                <div key={role.id} className="role-row">
                  <span className="clause mono">{role.clause}</span>
                  <span className="role-name">{role.labelTh}</span>
                  <StatusBar met={met} review={review} notMet={notMet} />
                  <span className="role-num mono">
                    <b>{met}</b>/{st.length}
                  </span>
                </div>
              )
            })}
          </section>
        ))}
      </div>
      <p className="legend">
        <span className="dot dot-met" /> ผ่าน <span className="dot dot-review" /> รอตรวจสอบ <span className="dot dot-not" /> ไม่ผ่าน · ดูรายบุคคลที่แท็บ{' '}
        <a href="#/lecturers">รายชื่ออาจารย์</a>
      </p>
    </>
  )
}
