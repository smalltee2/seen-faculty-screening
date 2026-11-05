import type { DataBundle, Pub, PubSource } from '../types'
import { TYPE_LABEL, displayName, yearLabel } from '../ui'
import type { Faculty } from '../types'

const SOURCE_LABEL: Record<PubSource, string> = {
  scholar: 'Google Scholar (นำเข้าเป็นครั้งคราว)',
  openalex: 'OpenAlex (อัปเดตทุกวัน)',
  scopus: 'Scopus (อัปเดตทุกวัน)',
  manual: 'แบบฟอร์มผู้ดูแล (อัปเดตทุกวัน)',
}

export function AdminPage({ data, pubs, faculty }: { data: DataBundle; pubs: Pub[]; faculty: Faculty[] }) {
  const formUrl = data.sources.googleFormUrl ?? ''
  const manual = pubs.filter((p) => p.sources.includes('manual')).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const rawCount = (s: PubSource) => data.publications.filter((p) => (p.source ?? 'scholar') === s).length
  const person = (key: string) => faculty.find((f) => f.nameEn === key)

  return (
    <>
      <div className="section-head">
        <div>
          <h1>เพิ่มผลงาน</h1>
          <p className="lede">สำหรับผู้ดูแล: เพิ่มผลงานที่ยังไม่มีใน Scholar, OpenAlex หรือ Scopus เช่น บทความในวารสารไทย หรือ proceedings ของงานประชุมในประเทศ</p>
        </div>
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h3>ขั้นตอน</h3>
          <ol className="steps">
            <li>กรอกแบบฟอร์มด้วยบัญชี @up.ac.th หนึ่งครั้งต่อหนึ่งผลงาน ถ้ามีผู้เขียนหลายคนในคณะ ให้กรอกแยกทีละคน</li>
            <li>ระบบดึงข้อมูลจากแบบฟอร์มทุกวันเวลาประมาณ 03:00 น. แล้วคำนวณผลใหม่</li>
            <li>ผลงานที่เพิ่มจะแสดงในตารางด้านล่าง และนับตามประเภทที่เลือก (วารสาร / proceedings / โปสเตอร์)</li>
            <li>ถ้ากรอกผิด ให้ลบแถวนั้นในชีตคำตอบของแบบฟอร์ม แล้วรอรอบอัปเดตถัดไป</li>
          </ol>
          {formUrl ? (
            <a className="btn btn-primary" href={formUrl} target="_blank" rel="noreferrer">
              เปิดแบบฟอร์มเพิ่มผลงาน
            </a>
          ) : (
            <p className="note">ยังไม่ได้ตั้งค่าลิงก์แบบฟอร์ม (googleFormUrl ใน data/sources.json)</p>
          )}
        </section>

        <section className="panel">
          <h3>แหล่งข้อมูล</h3>
          <dl className="source-list">
            {(['openalex', 'scopus', 'manual', 'scholar'] as PubSource[]).map((s) => (
              <div key={s}>
                <dt>{SOURCE_LABEL[s]}</dt>
                <dd className="mono">{rawCount(s)} รายการ</dd>
              </div>
            ))}
          </dl>
          <p className="note">
            อัปเดตล่าสุด {new Date(data.builtAt).toLocaleString('th-TH')} · รวมรายการซ้ำจากหลายแหล่งด้วย DOI หรือชื่อเรื่อง · Google Scholar ดึงอัตโนมัติไม่ได้
            จึงต้องนำเข้าด้วยมือเป็นครั้งคราว
          </p>
        </section>
      </div>

      <h2 className="block-title">ผลงานที่เพิ่มผ่านแบบฟอร์ม · {manual.length} รายการ</h2>
      {manual.length === 0 ? (
        <p className="note">ยังไม่มีผลงานที่เพิ่มผ่านแบบฟอร์ม</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>อาจารย์</th>
                <th>ปี</th>
                <th>ชื่อผลงาน / แหล่งตีพิมพ์</th>
                <th>ประเภท</th>
                <th>งานวิจัย</th>
                <th>ส่งเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {manual.map((p) => {
                const f = person(p.key)
                return (
                  <tr key={p.id}>
                    <td>{f ? <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>{displayName(f)}</a> : p.key}</td>
                    <td className="nowrap">{yearLabel(p.year)}</td>
                    <td>
                      <div className="pub-title">{p.title}</div>
                      <div className="muted small">{p.venue}</div>
                    </td>
                    <td>{TYPE_LABEL[p.type]}</td>
                    <td>{p.isResearch ? 'ใช่' : 'ไม่'}</td>
                    <td className="small muted">{p.submitted ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
