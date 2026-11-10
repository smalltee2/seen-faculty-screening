// Local preview of the three icon styles (icon-preview.html, dev server only; not in the build).
import { createRoot } from 'react-dom/client'
import seenLogo from '../assets/seen-logo.png'
import { ICON_KEYS, ICON_LABEL, SeenIcon, type IconStyle } from './iconSets'

const STYLES: { id: IconStyle; th: string; note: string }[] = [
  { id: 'leaf', th: 'A · เส้นใบไม้', note: 'เส้นบางสีเขียว มีใบไม้จากโลโก้ SEEN แทรกในไอคอน เรียบ สุภาพ' },
  { id: 'duo', th: 'B · สองสี เขียว–ส้ม', note: 'เส้นเดียวกับแบบ A แต่ส่วนสำคัญเป็นสีส้มโลโก้ และมีพื้นอ่อนรองหลัง เด่นและมีชีวิตชีวา' },
  { id: 'solid', th: 'C · ทึบมน', note: 'รูปทรงทึบ มุมมน ใบไม้สีส้ม เห็นชัดแม้ไอคอนเล็ก เหมาะกับจอมือถือ' },
]
const SHORT = ['ภาพรวม', 'ของฉัน', 'ผลงาน อ.', 'งาน', 'เพิ่มผลงาน', 'แนวโน้ม', 'ข้อมูล', 'ประวัติ']

function Panel({ style, dark }: { style: IconStyle; dark: boolean }) {
  return (
    <div className={`pv-theme ${dark ? 'pv-dark' : 'pv-light'}`}>
      <div className="pv-side">
        <img src={seenLogo} alt="" width={96} />
        {ICON_KEYS.map((k, i) => (
          <div key={k} className={`pv-link${i === 3 ? ' pv-active' : ''}`}>
            <SeenIcon name={k} style={style} />
            <span>{ICON_LABEL[k]}</span>
            {i === 3 && <b className="pv-badge">3</b>}
          </div>
        ))}
      </div>
      <div className="pv-right">
        <div className="pv-big">
          {ICON_KEYS.map((k) => (
            <span key={k} title={ICON_LABEL[k]}>
              <SeenIcon name={k} style={style} size={40} />
            </span>
          ))}
        </div>
        <div className="pv-phone">
          {ICON_KEYS.map((k, i) => (
            <div key={k} className={`pv-tab${i === 0 ? ' pv-active' : ''}`}>
              <SeenIcon name={k} style={style} size={20} />
              <span>{SHORT[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Preview() {
  return (
    <main className="pv">
      <h1>ตัวอย่างไอคอนเมนู SEEN · 3 แบบ</h1>
      <p className="pv-lede">แต่ละแบบแสดงในเมนูด้านข้าง (ขนาดจริง 22 px), ขยาย 40 px และแถบล่างบนมือถือ (20 px) ทั้งโหมดสว่างและโหมดมืด · "งานรอดำเนินการ" แสดงเป็นเมนูที่เลือกอยู่</p>
      {STYLES.map((s) => (
        <section key={s.id} className="pv-set">
          <h2>{s.th}</h2>
          <p>{s.note}</p>
          <div className="pv-pair">
            <Panel style={s.id} dark={false} />
            <Panel style={s.id} dark />
          </div>
        </section>
      ))}
    </main>
  )
}

const css = `
body { margin: 0; background: #f4f2ec; font-family: 'DM Sans', 'Noto Sans Thai', sans-serif; color: #2c2a25; }
.pv { max-width: 1240px; margin: 0 auto; padding: 28px max(16px, env(safe-area-inset-left)) 60px; }
.pv h1 { font: 700 1.6rem/1.3 'Source Serif 4', 'Noto Serif Thai', serif; margin: 0 0 6px; }
.pv-lede { color: #5c5850; margin: 0 0 24px; }
.pv-set { margin-bottom: 36px; }
.pv-set h2 { font: 700 1.2rem/1.3 'Source Serif 4', 'Noto Serif Thai', serif; margin: 0 0 2px; }
.pv-set > p { margin: 0 0 12px; color: #5c5850; }
.pv-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 16px; }
.pv-theme { display: grid; grid-template-columns: 230px 1fr; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
.pv-light { --bg: #f8f6f1; --panel: #fff; --fg: #2c2a25; --muted: #5c5850; --line: #e2ded6; --accent: #1d5c33; --accent-soft: rgba(29,92,51,.09); --icon-accent: #d9601a; --icon-cut: #fff; }
.pv-dark { --bg: #181714; --panel: #22211d; --fg: #eeeae2; --muted: #b6b0a5; --line: #46433b; --accent: #7cc796; --accent-soft: rgba(124,199,150,.14); --icon-accent: #f08a4b; --icon-cut: #22211d; }
.pv-side { background: var(--panel); border-right: 1px solid var(--line); padding: 14px 10px; display: flex; flex-direction: column; gap: 2px; }
.pv-side img { margin: 0 8px 10px; }
.pv-link { display: flex; align-items: center; gap: 11px; padding: 8px 10px; border-radius: 8px; color: var(--muted); font-size: .86rem; }
.pv-link.pv-active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.pv-active .pv-badge, .pv-badge { margin-left: auto; background: #b04a0d; color: #fff; border-radius: 10px; padding: 0 7px; font-size: .72rem; }
.pv-right { display: flex; flex-direction: column; justify-content: space-between; gap: 18px; padding: 18px; }
.pv-big { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; color: var(--accent); justify-items: center; }
.pv-big span { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); }
.pv-phone { display: flex; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 4px; }
.pv-tab { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; font-size: .62rem; color: var(--muted); border-radius: 8px; min-width: 0; }
.pv-tab span { white-space: nowrap; }
.pv-tab.pv-active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
@media (max-width: 600px) { .pv-pair { grid-template-columns: 1fr; } .pv-theme { grid-template-columns: 1fr; } .pv-side { display: none; } }
`
const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)
createRoot(document.getElementById('root')!).render(<Preview />)
