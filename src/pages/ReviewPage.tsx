import { useState } from 'react'
import { copyText, downloadCsv } from '../download'
import { defaultChoice, overrideLine, type OverrideChoice, type ReviewItem } from '../review'
import { Button, TYPE_LABEL, yearLabel } from '../ui'

const HEADER = 'key,title_normalized,type_override,is_research,part_of_own_degree,note'

export function ReviewPage({ items }: { items: ReviewItem[] }) {
  const [lines, setLines] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const add = (line: string) => {
    setLines((ls) => (ls.includes(line) ? ls : [...ls, line]))
    copyText(line).then((ok) => setMsg(ok ? 'คัดลอกบรรทัดแล้ว และเพิ่มในกล่องด้านล่าง' : 'เพิ่มในกล่องด้านล่างแล้ว'))
  }

  return (
    <>
      <h1>รายการรอตรวจสอบ (Review queue) · {items.length}</h1>
      <p className="muted">
        เว็บนี้เป็นเว็บแบบ static จึงเขียนไฟล์กลับเข้า repository ไม่ได้ เลือกค่าที่ถูกต้องแล้วกด “สร้างบรรทัด” จากนั้นนำบรรทัดไปวางต่อท้าย <code>data/overrides.csv</code> แล้ว push
      </p>
      <div className="actions no-print">
        <Button
          onClick={() =>
            downloadCsv(
              'review-queue.csv',
              ['key', 'year', 'title', 'venue', 'type', 'issues'],
              items.map((i) => [i.pub.key, i.pub.year, i.pub.title, i.pub.venue, i.pub.type, i.issues.join(' | ')]),
            )
          }
        >
          ดาวน์โหลด CSV
        </Button>
      </div>
      {items.length === 0 && <p>ไม่มีรายการรอตรวจสอบ</p>}
      <div className="review-list">
        {items.map((it) => (
          <ReviewRow key={it.pub.id} item={it} onAdd={add} />
        ))}
      </div>

      <div className="collector">
        <div className="table-head">
          <h2>บรรทัดที่สร้างแล้ว ({lines.length})</h2>
          <div className="actions">
            <Button kind="primary" onClick={() => copyText(lines.join('\n')).then(() => setMsg('คัดลอกทั้งหมดแล้ว'))}>คัดลอกทั้งหมด</Button>
            <Button onClick={() => setLines([])} kind="ghost">ล้าง</Button>
          </div>
        </div>
        <textarea readOnly value={lines.length ? lines.join('\n') : `# วางบรรทัดเหล่านี้ใต้หัวตาราง: ${HEADER}`} rows={Math.min(12, Math.max(3, lines.length + 1))} />
        {msg && <p className="toast" role="status">{msg}</p>}
      </div>
    </>
  )
}

function ReviewRow({ item, onAdd }: { item: ReviewItem; onAdd: (line: string) => void }) {
  const [c, setC] = useState<OverrideChoice>(() => defaultChoice(item))
  const p = item.pub
  const set = (k: keyof OverrideChoice) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value })
  return (
    <article className="review-item">
      <div className="review-meta">
        <a href={`#/person/${encodeURIComponent(item.person.nameEn)}`}>{item.person.nameTh || item.person.nameEn}</a> · {yearLabel(p.year)} · ตอนนี้: {TYPE_LABEL[p.type]}
      </div>
      <div className="pub-title">{p.title}</div>
      <div className="muted small">{p.venue || '—'}</div>
      <ul className="issues">
        {item.issues.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
      <div className="review-form no-print">
        <label>ประเภท
          <select value={c.type} onChange={set('type')}>
            <option value="">(ไม่ระบุ)</option>
            <option value="journal">journal</option>
            <option value="proceeding">proceeding</option>
            <option value="poster">poster</option>
            <option value="exclude">exclude</option>
          </select>
        </label>
        <label>งานวิจัย
          <select value={c.isResearch} onChange={set('isResearch')}>
            <option value="">(ไม่ระบุ)</option><option value="yes">yes</option><option value="no">no</option>
          </select>
        </label>
        <label>ส่วนหนึ่งของการศึกษาตนเอง
          <select value={c.ownDegree} onChange={set('ownDegree')}>
            <option value="">(ไม่ระบุ)</option><option value="yes">yes</option><option value="no">no</option>
          </select>
        </label>
        <label className="grow">หมายเหตุ
          <input value={c.note} onChange={set('note')} placeholder="เช่น ตรวจจาก Scopus แล้ว" />
        </label>
        <Button kind="primary" onClick={() => onAdd(overrideLine(p, c))}>สร้างบรรทัด</Button>
        <Button onClick={() => onAdd(overrideLine(p, { type: 'exclude', isResearch: '', ownDegree: '', note: c.note }))} title="ไม่นับผลงานนี้">ไม่นับ</Button>
      </div>
    </article>
  )
}
