// Hand-built SVG charts (no chart library). Colours come from CSS tokens
// --c-journal / --c-proceeding / --c-poster, validated for colour-blind
// separation in light and dark themes.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextYearRisk, toBE, type PersonResult, type Settings } from './rules'
import type { Pub } from './types'
import { displayName } from './ui'

interface Tip {
  x: number
  y: number
  body: ReactNode
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, body: ReactNode) => {
    const box = (e.currentTarget as Element).closest('.chart')!.getBoundingClientRect()
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, body })
  }
  const el = tip && (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.body}
    </div>
  )
  return { show, hide: () => setTip(null), el }
}

/** Rendered width of the chart container, so the SVG is drawn at 1:1 and text keeps its size on every screen. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLElement | null>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const first = Math.round(el.getBoundingClientRect().width)
    if (first) setW(first)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, w] as const
}

const stepFor = (v: number) => (v <= 5 ? 1 : v <= 20 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : v <= 250 ? 50 : 100)
const niceMax = (v: number) => (v <= 5 ? 5 : Math.ceil(v / stepFor(v)) * stepFor(v))
const ticks = (max: number) => {
  const step = stepFor(max)
  const out: number[] = []
  for (let t = 0; t <= max; t += step) out.push(t)
  return out
}

/** Rounded top only: the data end gets a 3px radius, the baseline stays square. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  r = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

const SERIES = [
  { key: 'journal', th: 'วารสาร', cls: 'c-journal' },
  { key: 'proceeding', th: 'Proceedings', cls: 'c-proceeding' },
  { key: 'poster', th: 'โปสเตอร์/บทคัดย่อ', cls: 'c-poster' },
] as const

/** Publications per year by type, all lecturers, with the 5-year window shaded. */
export function PubsPerYear({ pubs, settings }: { pubs: Pub[]; settings: Settings }) {
  const { show, hide, el } = useTip()
  const [ref, width] = useWidth(640)
  const Y = settings.year
  const years: number[] = []
  for (let y = Y - 9; y <= Y; y++) years.push(y)
  const rows = years.map((y) => {
    const ofYear = pubs.filter((p) => p.year === y)
    return {
      y,
      journal: ofYear.filter((p) => p.type === 'journal').length,
      proceeding: ofYear.filter((p) => p.type === 'proceeding').length,
      poster: ofYear.filter((p) => p.type === 'poster').length,
      excluded: ofYear.filter((p) => p.type === 'exclude' || p.type === 'unknown').length,
    }
  })
  const max = niceMax(Math.max(1, ...rows.map((r) => r.journal + r.proceeding + r.poster)))
  const W = Math.max(280, width)
  const H = W < 480 ? 230 : 260
  const narrow = W < 480
  const m = { t: 22, r: 8, b: 40, l: 34 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const band = iw / years.length
  const bw = Math.min(36, band * 0.62)
  const sy = (v: number) => m.t + ih - (v / max) * ih
  const winX = m.l + band * (years.length - 5)

  return (
    <figure className="chart" ref={ref}>
      <div className="chart-legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i className={`swatch ${s.cls}`} /> {s.th}
          </span>
        ))}
        <span>
          <i className="swatch swatch-window" /> ช่วง 5 ปีที่ใช้ประเมิน
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="จำนวนผลงานต่อปีแยกตามประเภท">
        <rect className="window-band" x={winX} y={m.t - 14} width={band * 5} height={ih + 14} rx={6} />
        <text className="window-label" x={winX + band * 2.5} y={m.t - 4} textAnchor="middle">
          ช่วงประเมิน {toBE(Y - 4)}–{toBE(Y)}
        </text>
        {ticks(max).map((t) => (
          <g key={t}>
            <line className="grid" x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />
            <text className="axis" x={m.l - 8} y={sy(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = m.l + band * i + (band - bw) / 2
          let acc = 0
          const total = r.journal + r.proceeding + r.poster
          return (
            <g key={r.y}>
              {SERIES.map((s, si) => {
                const v = r[s.key]
                if (!v) return null
                const y0 = sy(acc)
                acc += v
                const y1 = sy(acc)
                const top = SERIES.slice(si + 1).every((x) => !r[x.key])
                const h = y0 - y1 - (top ? 0 : 2)
                return top ? (
                  <path key={s.key} className={s.cls} d={barPath(x, y1, bw, h, 3)} />
                ) : (
                  <rect key={s.key} className={s.cls} x={x} y={y1 + 2} width={bw} height={Math.max(0, h)} />
                )
              })}
              {total > 0 && (
                <text className="bar-label" x={x + bw / 2} y={sy(total) - 5} textAnchor="middle">
                  {total}
                </text>
              )}
              <text className="axis" x={m.l + band * i + band / 2} y={H - m.b + 16} textAnchor="middle">
                {narrow ? String(toBE(r.y)).slice(2) : toBE(r.y)}
              </text>
              {!narrow && (
                <text className="axis axis-sub" x={m.l + band * i + band / 2} y={H - m.b + 29} textAnchor="middle">
                  {r.y}
                </text>
              )}
              <rect
                className="hit"
                x={m.l + band * i}
                y={m.t}
                width={band}
                height={ih}
                onMouseMove={(e) =>
                  show(
                    e,
                    <>
                      <b>
                        พ.ศ. {toBE(r.y)} ({r.y})
                      </b>
                      <span>วารสาร {r.journal}</span>
                      <span>Proceedings {r.proceeding}</span>
                      <span>โปสเตอร์/บทคัดย่อ {r.poster}</span>
                      <span className="muted">ไม่นับ/ไม่ทราบประเภท {r.excluded}</span>
                    </>,
                  )
                }
                onMouseLeave={hide}
              />
            </g>
          )
        })}
        <line className="baseline" x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} />
      </svg>
      {el}
    </figure>
  )
}

/** Each lecturer's eligible outputs in the window: research, other, and uncertain, against the 3-output line. */
export function LecturerOutputs({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const { show, hide, el } = useTip()
  const [ref, width] = useWidth(1000)
  const rows = results
    .map((r) => {
      const c = r.roles.ms_program.counts
      return {
        r,
        research: c.research,
        other: c.total - c.research,
        maybe: c.totalPossible - c.total,
        name: displayName(r.person),
        risk: nextYearRisk(r, settings).filter((role) => role.level === 'ms' || role.level === 'phd'),
      }
    })
    .sort((a, b) => b.research - a.research || b.research + b.other - (a.research + a.other) || a.name.localeCompare(b.name, 'th'))
  const max = niceMax(Math.max(4, ...rows.map((x) => x.research + x.other + x.maybe)))
  const W = Math.max(280, width)
  const narrow = W < 600
  const rowH = 26
  const m = { t: 22, r: narrow ? 34 : 50, b: 26, l: Math.round(Math.min(240, Math.max(118, W * 0.36))) }
  const maxChars = Math.floor(m.l / 7)
  const H = m.t + m.b + rows.length * rowH
  const iw = W - m.l - m.r
  const sx = (v: number) => m.l + (v / max) * iw
  const bh = 14

  return (
    <figure className="chart" ref={ref}>
      <div className="chart-legend">
        <span>
          <i className="swatch c-journal" /> งานวิจัย
        </span>
        <span>
          <i className="swatch swatch-hatch" /> ผลงานอื่น (บทความวิชาการ/ปริทัศน์)
        </span>
        <span>
          <i className="swatch swatch-rule" /> เกณฑ์ 3 เรื่อง
        </span>
        <span>
          <i className="swatch swatch-risk" /> ปีหน้าอาจไม่ผ่าน ถ้าไม่มีผลงานเพิ่ม
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="จำนวนผลงานในช่วง 5 ปีของอาจารย์แต่ละคน">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>
        {ticks(max).map((t) => (
          <g key={t}>
            <line className="grid" x1={sx(t)} x2={sx(t)} y1={m.t - 6} y2={H - m.b} />
            <text className="axis" x={sx(t)} y={H - m.b + 16} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <line className="rule" x1={sx(3)} x2={sx(3)} y1={m.t - 12} y2={H - m.b} />
        <text className="rule-label" x={sx(3) + 4} y={m.t - 6}>
          ≥ 3 เรื่อง
        </text>
        {rows.map((x, i) => {
          const y = m.t + i * rowH + (rowH - bh) / 2
          const segs = [
            { v: x.research, cls: 'c-journal' },
            { v: x.other, cls: 'hatched' },
            { v: x.maybe, cls: 'maybe' },
          ]
          let acc = 0
          const total = x.research + x.other
          return (
            <g key={x.r.person.nameEn}>
              {x.risk.length > 0 && <rect className="risk-frame" x={4} y={m.t + i * rowH + 1} width={W - 8} height={rowH - 2} rx={6} />}
              <a href={`#/person/${encodeURIComponent(x.r.person.nameEn)}`}>
                <text className="row-label" x={m.l - 10} y={y + bh - 2} textAnchor="end">
                  {(() => {
                    // Narrow screens drop the title (รศ.ดร.) so the name itself fits.
                    const label = narrow ? x.r.person.nameTh || x.name : x.name
                    return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label
                  })()}
                </text>
              </a>
              {segs.map((s, si) => {
                if (!s.v) return null
                const x0 = sx(acc)
                acc += s.v
                const w = sx(acc) - x0 - (segs.slice(si + 1).some((z) => z.v) ? 2 : 0)
                return <rect key={s.cls} className={s.cls} x={x0} y={y} width={Math.max(0, w)} height={bh} rx={2} />
              })}
              <text className="bar-label" x={sx(acc) + 6} y={y + bh - 2}>
                {total}
                {x.maybe ? `+${x.maybe}?` : ''}
              </text>
              {x.risk.length > 0 && (
                <text className="risk-label" x={W - 12} y={y + bh - 2} textAnchor="end">
                  {narrow ? '⚠' : '⚠ ปีหน้าอาจไม่ผ่าน'}
                </text>
              )}
              <rect
                className="hit"
                x={0}
                y={m.t + i * rowH}
                width={W}
                height={rowH}
                onMouseMove={(e) =>
                  show(
                    e,
                    <>
                      <b>{x.name}</b>
                      <span>งานวิจัย {x.research}</span>
                      <span>ผลงานอื่น {x.other}</span>
                      {x.maybe > 0 && <span>ยังไม่แน่ใจ {x.maybe}</span>}
                      <span className="muted">
                        ปี {toBE(settings.year - 4)}–{toBE(settings.year)}
                      </span>
                      {x.risk.length > 0 && (
                        <span className="tip-risk">
                          ⚠ ถ้าปี {toBE(settings.year + 1)} ไม่มีผลงานเพิ่ม จะไม่ผ่าน: {x.risk.map((role) => role.clause).join(', ')}
                        </span>
                      )}
                    </>,
                  )
                }
                onMouseLeave={hide}
              />
            </g>
          )
        })}
        <line className="baseline" x1={m.l} x2={m.l} y1={m.t - 6} y2={H - m.b} />
      </svg>
      {el}
    </figure>
  )
}

/** Donut of people by how many of the 10 degree-level roles they meet. */
export function ReadinessDonut({ results }: { results: PersonResult[] }) {
  const ids = Object.keys(results[0]?.roles ?? {}).filter((id) => id.startsWith('ms_') || id.startsWith('phd_'))
  const groups = [
    { th: 'ผ่านครบทุกบทบาท', cls: 'd-met', n: 0 },
    { th: 'ผ่านบางบทบาท', cls: 'd-partial', n: 0 },
    { th: 'ไม่ผ่านเลย', cls: 'd-not', n: 0 },
  ]
  for (const r of results) {
    const st = ids.map((id) => r.roles[id].status)
    if (st.every((s) => s === 'met')) groups[0].n++
    else if (st.includes('met')) groups[1].n++
    else groups[2].n++
  }
  const total = results.length || 1
  const R = 52
  const C = 2 * Math.PI * R
  let off = 0
  return (
    <figure className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="สัดส่วนอาจารย์ตามผลการประเมิน">
        <circle cx="70" cy="70" r={R} className="donut-track" />
        {groups.map((g) => {
          if (!g.n) return null
          const len = (g.n / total) * C
          const gap = groups.filter((x) => x.n).length > 1 ? 2 : 0
          const seg = (
            <circle key={g.cls} cx="70" cy="70" r={R} className={g.cls} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />
          )
          off += len
          return seg
        })}
        <text x="70" y="68" textAnchor="middle" className="donut-num">
          {groups[0].n}/{results.length}
        </text>
        <text x="70" y="86" textAnchor="middle" className="donut-cap">
          ผ่านครบ
        </text>
      </svg>
      <figcaption>
        {groups.map((g) => (
          <span key={g.cls}>
            <i className={`swatch ${g.cls}-sw`} /> {g.th} <b className="mono">{g.n}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
