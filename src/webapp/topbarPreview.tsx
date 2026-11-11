// Local preview of the top-bar background patterns (topbar-preview.html, dev server only; not built).
import { createRoot } from 'react-dom/client'
import seenLogo from '../assets/seen-logo.png'
import { PATTERNS, patternUrl, type PatternId } from './topPatterns'

function Bar({ id, dark }: { id: PatternId | null; dark: boolean }) {
  return (
    <div className={`pv-bar ${dark ? 'pv-dark' : 'pv-light'}`}>
      <div className="pv-brand">
        <img src={seenLogo} alt="" width={120} />
        <b>ระบบตรวจสอบ<br />คุณสมบัติอาจารย์</b>
      </div>
      <div className="pv-top">
        {id && <div className="pv-pattern" style={{ backgroundImage: patternUrl(id, dark) }} />}
        <div className="pv-title">
          <small>ผู้ดูแล ›</small>
          <h1>ผลงานอาจารย์</h1>
          <span className="pv-chip">ช่วงผลงาน พ.ศ. 2565–2569</span>
        </div>
        <div className="pv-tools">
          <span>ทุกหลักสูตร ⌄</span>
          <span>พ.ศ. 2569 ⌄</span>
        </div>
      </div>
    </div>
  )
}

function Preview() {
  return (
    <main className="pv">
      <h1 className="pv-h">พื้นหลังแถบด้านบน · 5 แบบ</h1>
      <p className="pv-lede">ทุกแบบวาดด้วยโค้ด (SVG) ลวดลายอยู่ฝั่งขวาและจางลงทางซ้าย ชื่อหน้าจึงอ่านได้ชัด · ซ้ายโหมดสว่าง ขวาโหมดมืด</p>
      <section className="pv-set">
        <h2>ปัจจุบัน (แบบ C ไม่มีลวดลาย)</h2>
        <div className="pv-pair">
          <Bar id={null} dark={false} />
          <Bar id={null} dark />
        </div>
      </section>
      {PATTERNS.map((p, i) => (
        <section key={p.id} className="pv-set">
          <h2>
            {i + 1}. {p.th} <small>· {p.note}</small>
          </h2>
          <div className="pv-pair">
            <Bar id={p.id} dark={false} />
            <Bar id={p.id} dark />
          </div>
        </section>
      ))}
    </main>
  )
}

const css = `
body { margin: 0; background: #f4f2ec; font-family: 'DM Sans', 'Noto Sans Thai', sans-serif; color: #2c2a25; }
.pv { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
.pv-h { font: 700 1.5rem/1.3 'Source Serif 4', 'Noto Serif Thai', serif; margin: 0 0 4px; }
.pv-lede { color: #5c5850; margin: 0 0 20px; }
.pv-set { margin-bottom: 22px; }
.pv-set h2 { font: 700 1.05rem/1.3 'Source Serif 4', 'Noto Serif Thai', serif; margin: 0 0 8px; }
.pv-set h2 small { font: 400 0.85rem 'DM Sans', 'Noto Sans Thai', sans-serif; color: #5c5850; }
.pv-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(560px, 1fr)); gap: 14px; }
.pv-bar { display: grid; grid-template-columns: 170px 1fr; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
.pv-light { --panel: #fff; --fg: #2c2a25; --muted: #6f6a61; --line: #e2ded6; --green: #1d5c33; --chip: #e8f3ec; --chipfg: #1e6b3a; --rule: #1d5c33; --orange: #f37225; }
.pv-dark { --panel: #22211d; --fg: #eeeae2; --muted: #b6b0a5; --line: #46433b; --green: #7cc796; --chip: #1f3326; --chipfg: #7cc796; --rule: #6fd081; --orange: #ff8a3d; }
.pv-brand { background: var(--panel); padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; gap: 6px; border-right: 1px solid var(--line); border-bottom: 3px solid var(--rule); }
.pv-brand b { color: var(--green); font: 700 0.9rem/1.3 'Source Serif 4', 'Noto Serif Thai', serif; }
.pv-top { position: relative; background: var(--panel); min-height: 118px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px 15px; }
.pv-top::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(to right, var(--rule) 0 80%, var(--orange) 80% 100%); }
.pv-pattern { position: absolute; inset: 0 0 3px 0; background-repeat: no-repeat; background-position: right center; background-size: cover;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 18%, #000 62%); mask-image: linear-gradient(to right, transparent 0%, transparent 18%, #000 62%); pointer-events: none; }
.pv-title { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; color: var(--fg); }
.pv-title small { color: var(--muted); font-size: 0.75rem; }
.pv-title h1 { margin: 0; font: 700 1.45rem/1.25 'Source Serif 4', 'Noto Serif Thai', serif; }
.pv-chip { margin-top: 4px; padding: 2px 10px; border-radius: 999px; background: var(--chip); color: var(--chipfg); font: 600 0.72rem/1.5 'DM Sans', 'Noto Sans Thai', sans-serif; }
.pv-tools { position: relative; display: flex; gap: 8px; }
.pv-tools span { padding: 7px 14px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--fg); font-size: 0.85rem; white-space: nowrap; }
@media (max-width: 640px) { .pv-pair { grid-template-columns: 1fr; } .pv-bar { grid-template-columns: 1fr; } .pv-brand { display: none; } }
`
const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)
createRoot(document.getElementById('root')!).render(<Preview />)
