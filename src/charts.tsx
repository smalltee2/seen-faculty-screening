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
  // 15% headroom so the bar totals never collide with the window label.
  const max = niceMax(Math.max(1, ...rows.map((r) => r.journal + r.proceeding + r.poster)) * 1.15)
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

/** Readiness groups over the 10 degree-level roles (strict mode has no needs-review). */
function readinessGroups(results: PersonResult[]) {
  const ids = Object.keys(results[0]?.roles ?? {}).filter((id) => id.startsWith('ms_') || id.startsWith('phd_'))
  const groups = [
    { key: 'all', th: 'ผ่านครบทุกหน้าที่', note: 'ทำได้ทุกหน้าที่ของหลักสูตร ป.โท และ ป.เอก', icon: 'check', n: 0 },
    { key: 'some', th: 'ผ่านบางหน้าที่', note: 'เช่น สอนได้ แต่เป็นผู้รับผิดชอบหรือที่ปรึกษาไม่ได้', icon: 'partial', n: 0 },
    { key: 'review', th: 'มีหน้าที่รอตรวจสอบ', note: '', icon: 'partial', n: 0 },
    { key: 'none', th: 'ไม่ผ่านทุกหน้าที่', note: 'ยังไม่มีผลงานในช่วง 5 ปีตามเกณฑ์', icon: 'cross', n: 0 },
  ]
  for (const r of results) {
    const st = ids.map((id) => r.roles[id].status)
    if (st.every((x) => x === 'met')) groups[0].n++
    else if (st.includes('needs_review')) groups[2].n++
    else if (st.includes('met')) groups[1].n++
    else groups[3].n++
  }
  const shown = groups.filter((g) => g.n > 0 || g.key !== 'review')
  // Percentages that add up to 100 (largest remainder).
  const total = results.length || 1
  const raw = shown.map((g) => (g.n / total) * 100)
  const pct = raw.map(Math.floor)
  let left = 100 - pct.reduce((a, b) => a + b, 0)
  raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left > 0 && shown[i].n > 0) {
      pct[i]++
      left--
    }
  })
  return shown.map((g, i) => ({ ...g, pct: g.n ? pct[i] : 0 }))
}

const SLICE_FILL: Record<string, string> = { all: 'var(--pie-1)', some: 'var(--pie-2)', review: 'var(--pie-3)', none: 'var(--pie-4)' }

function StatusIcon({ kind }: { kind: string }) {
  const stroke = kind === 'check' ? 'var(--met-mark)' : kind === 'cross' ? 'var(--not-mark)' : 'var(--rev-mark)'
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      {kind === 'check' && <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'cross' && <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />}
      {kind === 'partial' && (
        <>
          <circle cx="12" cy="12" r="8" fill="none" stroke={stroke} strokeWidth="2.5" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill={stroke} />
        </>
      )}
    </svg>
  )
}

/** Infographic: solid pie of lecturers by readiness, big percentages, dotted leaders. */
/** compact: always pie-then-labels and shorter notes, for a dashboard column. */
export function ReadinessPie({ results, compact = false }: { results: PersonResult[]; compact?: boolean }) {
  const [ref, width] = useWidth(900)
  const groups = readinessGroups(results)
  const total = results.length
  const wide = width >= 640 && !compact
  const R = wide ? 140 : compact ? 84 : 110
  const H = wide ? 340 : 2 * R + 24
  const W = Math.max(280, width)
  const cx = wide ? W - R - 40 : W / 2
  const cy = H / 2
  let a0 = -Math.PI / 2
  const slices = groups
    .filter((g) => g.n > 0)
    .map((g) => {
      const a1 = a0 + (g.n / total) * Math.PI * 2
      const mid = (a0 + a1) / 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)]
      const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)]
      const d = g.n === total ? '' : `M${cx},${cy} L${p0[0]},${p0[1]} A${R},${R} 0 ${large} 1 ${p1[0]},${p1[1]} Z`
      const anchor = [cx + R * 0.62 * Math.cos(mid), cy + R * 0.62 * Math.sin(mid)]
      a0 = a1
      return { g, d, anchor }
    })
  // Callout rows on the left (wide layout): evenly spaced, leader goes right then to the slice.
  const rowsY = groups.map((_, i) => 46 + i * ((H - 70) / Math.max(1, groups.length - 1)))
  const calloutEnd = Math.min(470, cx - R - 50)

  return (
    <figure className="pie-info">
      <div className="pie-stage" ref={ref as React.RefObject<HTMLDivElement>} style={{ height: wide ? H : undefined }}>
        <svg className="pie-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="สัดส่วนอาจารย์ตามผลการประเมิน">
          {slices.map(({ g, d }) =>
            d ? <path key={g.key} d={d} fill={SLICE_FILL[g.key]} stroke="var(--pie-gap)" strokeWidth={2} /> : <circle key={g.key} cx={cx} cy={cy} r={R} fill={SLICE_FILL[g.key]} />,
          )}
          {wide &&
            groups.map((g, i) => {
              const s = slices.find((x) => x.g.key === g.key)
              if (!s) return null
              const y = rowsY[i]
              const [ax, ay] = s.anchor
              const elbow = Math.max(calloutEnd + 20, ax - 40)
              return (
                <g key={g.key}>
                  <path d={`M${calloutEnd},${y} H${elbow} L${ax},${ay}`} className="pie-leader" />
                  <circle cx={ax} cy={ay} r={4} className="pie-dot" />
                </g>
              )
            })}
          {(() => {
            const big = slices[0]
            if (!big || !wide) return null
            return (
              <text x={cx} y={cy + R + 22} textAnchor="middle" className="pie-total">
                อาจารย์ทั้งหมด {total} คน
              </text>
            )
          })()}
        </svg>
        <ul className={`pie-callouts ${wide ? 'pie-callouts-wide' : ''}`} style={wide ? { width: calloutEnd - 12 } : undefined}>
          {groups.map((g, i) => (
            <li key={g.key} style={wide ? { top: rowsY[i] } : undefined}>
              <span className="pie-icon">
                <StatusIcon kind={g.icon} />
              </span>
              <span className="pie-pct">{g.pct}%</span>
              <span className="pie-label">
                <b>
                  <i className="pie-swatch" style={{ background: SLICE_FILL[g.key] }} />
                  {g.th}
                </b>
                <span>
                  {g.n} คน{g.note && !compact ? ` · ${g.note}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}
