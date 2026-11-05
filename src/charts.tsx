// Hand-built SVG charts (no chart library). Colours come from CSS tokens
// --c-journal / --c-proceeding / --c-poster, validated for colour-blind
// separation in light and dark themes.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextYearRisk, toBE, type PersonResult, type Settings } from './rules'
import type { Pub } from './types'
import { SHOWN_ROLES, displayName, levelGroup, type LevelGroup } from './ui'

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

// Journals are split by database (decision by Tum, 2026-11-06): found in Scopus = international,
// otherwise national. Display only; the clause-9/10 evaluation counts every journal alike.
export const isInternational = (p: Pub) => p.sources.includes('scopus')

const SERIES = [
  { key: 'journalIntl', th: 'วารสารนานาชาติ', cls: 'c-journal' },
  { key: 'journalNatl', th: 'วารสารระดับชาติ', cls: 'c-journal-natl' },
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
      journalIntl: ofYear.filter((p) => p.type === 'journal' && isInternational(p)).length,
      journalNatl: ofYear.filter((p) => p.type === 'journal' && !isInternational(p)).length,
      proceeding: ofYear.filter((p) => p.type === 'proceeding').length,
      poster: ofYear.filter((p) => p.type === 'poster').length,
      excluded: ofYear.filter((p) => p.type === 'exclude' || p.type === 'unknown').length,
    }
  })
  // 15% headroom so the bar totals never collide with the window label.
  const max = niceMax(Math.max(1, ...rows.map((r) => r.journalIntl + r.journalNatl + r.proceeding + r.poster)) * 1.15)
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
        <defs>
          <pattern id="hatch-natl" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-natl-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-natl-line" />
          </pattern>
        </defs>
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
          const total = r.journalIntl + r.journalNatl + r.proceeding + r.poster
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
                      <span>วารสารนานาชาติ {r.journalIntl}</span>
                      <span>วารสารระดับชาติ {r.journalNatl}</span>
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
type OutputsView = 'research' | 'type'

/** Bar segments per view; colours match the per-year chart in the 'type' view. */
const OUTPUT_SEGS: Record<OutputsView, { key: 'research' | 'other' | 'journalIntl' | 'journalNatl' | 'proceeding' | 'poster'; cls: string; th: string }[]> = {
  research: [
    { key: 'research', cls: 'c-journal', th: 'งานวิจัย' },
    { key: 'other', cls: 'hatched', th: 'ผลงานอื่น (บทความวิชาการ/ปริทัศน์)' },
  ],
  type: [
    { key: 'journalIntl', cls: 'c-journal', th: 'วารสารนานาชาติ' },
    { key: 'journalNatl', cls: 'c-journal-natl', th: 'วารสารระดับชาติ' },
    { key: 'proceeding', cls: 'c-proceeding', th: 'Proceedings' },
    { key: 'poster', cls: 'c-poster', th: 'โปสเตอร์/บทคัดย่อ' },
  ],
}

export type { OutputsView }

/** One chart per level group: `group` picks the duties (10.1.x or 9.3–9.4) and the threshold line. */
export function LecturerOutputs({ results, settings, group, view }: { results: PersonResult[]; settings: Settings; group: LevelGroup; view: OutputsView }) {
  const { show, hide, el } = useTip()
  const [ref, width] = useWidth(1000)
  const roles = SHOWN_ROLES.filter((role) => levelGroup(role.level) === group)
  const threshold = group === 'ba' ? 1 : 3
  const rows = results
    .map((r) => {
      const c = r.roles.ms_program.counts
      // Counted outputs (eligible = yes) in the 5-year window, the same set the rules use.
      const used = r.roles.ms_program.used
      const ofType = (t: string) => used.filter((e) => e.pub.type === t).length
      return {
        r,
        research: c.research,
        other: c.total - c.research,
        journalIntl: used.filter((e) => e.pub.type === 'journal' && isInternational(e.pub)).length,
        journalNatl: used.filter((e) => e.pub.type === 'journal' && !isInternational(e.pub)).length,
        proceeding: ofType('proceeding'),
        poster: ofType('poster'),
        maybe: c.totalPossible - c.total,
        name: displayName(r.person),
        risk: nextYearRisk(r, settings).filter((role) => levelGroup(role.level) === group),
        // Duties of this level group not passed in the evaluation year.
        failed: roles.filter((role) => r.roles[role.id].status !== 'met').length,
      }
    })
    .sort((a, b) =>
      view === 'research'
        ? b.research - a.research || b.research + b.other - (a.research + a.other) || a.name.localeCompare(b.name, 'th')
        : b.research + b.other - (a.research + a.other) || b.journalIntl + b.journalNatl - (a.journalIntl + a.journalNatl) || a.name.localeCompare(b.name, 'th'),
    )
  const segDefs = OUTPUT_SEGS[view]
  const max = niceMax(Math.max(4, ...rows.map((x) => x.research + x.other + x.maybe)) * 1.12)
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
        {segDefs.map((s) => (
          <span key={s.key}>
            <i className={`swatch ${s.cls === 'hatched' ? 'swatch-hatch' : s.cls}`} /> {s.th}
          </span>
        ))}
        <span>
          <i className="swatch swatch-rule" /> เกณฑ์ ≥ {threshold} เรื่อง
        </span>
        <span>
          <i className="swatch swatch-fail" /> ไม่ผ่านบางหน้าที่ในปีที่ประเมิน
        </span>
        <span>
          <i className="swatch swatch-risk" /> ปีหน้าอาจไม่ผ่าน ถ้าไม่มีผลงานเพิ่ม
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`จำนวนผลงานในช่วง 5 ปีของอาจารย์แต่ละคน (${group === 'ba' ? 'ระดับปริญญาตรี' : 'ระดับบัณฑิตศึกษา'})`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
          <pattern id="hatch-natl" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-natl-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-natl-line" />
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
        {rows.map((x, i) => {
          const y = m.t + i * rowH + (rowH - bh) / 2
          const segs = [...segDefs.map((s) => ({ v: x[s.key], cls: s.cls })), { v: x.maybe, cls: 'maybe' }]
          let acc = 0
          const total = x.research + x.other
          return (
            <g key={x.r.person.nameEn}>
              {/* Red = fails now (takes precedence); yellow = passes now but may fail next year */}
              {(x.failed > 0 || x.risk.length > 0) && (
                <rect className={x.failed > 0 ? 'fail-frame' : 'risk-frame'} x={4} y={m.t + i * rowH + 1} width={W - 8} height={rowH - 2} rx={6} />
              )}
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
              {x.failed > 0 ? (
                <text className="fail-label" x={W - 12} y={y + bh - 2} textAnchor="end">
                  {narrow ? `✗ ${x.failed}` : `✗ ไม่ผ่าน ${x.failed}/${roles.length} หน้าที่`}
                </text>
              ) : (
                x.risk.length > 0 && (
                  <text className="risk-label" x={W - 12} y={y + bh - 2} textAnchor="end">
                    {narrow ? '⚠' : '⚠ ปีหน้าอาจไม่ผ่าน'}
                  </text>
                )
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
                      {segDefs.map((s) => (
                        <span key={s.key}>
                          {s.th} {x[s.key]}
                        </span>
                      ))}
                      {x.maybe > 0 && <span>ยังไม่แน่ใจ {x.maybe}</span>}
                      <span className="muted">
                        ปี {toBE(settings.year - 4)}–{toBE(settings.year)}
                      </span>
                      {x.failed > 0 && (
                        <span className="tip-fail">
                          ✗ ปี {toBE(settings.year)} ไม่ผ่าน {x.failed} จาก {roles.length} หน้าที่
                        </span>
                      )}
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
        {/* Threshold drawn over the bars (with a surface halo) so it stays visible across them */}
        <g className="rule-group">
          <line className="rule-halo" x1={sx(threshold)} x2={sx(threshold)} y1={m.t - 14} y2={H - m.b} />
          <line className="rule" x1={sx(threshold)} x2={sx(threshold)} y1={m.t - 14} y2={H - m.b} />
          <text className="rule-label" x={sx(threshold) + 6} y={m.t - 5}>
            เกณฑ์ ≥ {threshold} เรื่อง
          </text>
        </g>
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
    { key: 'all', th: 'ผ่านครบทุกหน้าที่', note: 'ทำได้ทุกหน้าที่ของหลักสูตร ป.ตรี ป.โท และ ป.เอก', icon: 'check', n: 0 },
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

/** Infographic: 3D extruded pie of lecturers by readiness, numbered pins, callouts below.
 *  Drawn back-to-front (painter's order) on a tilted ellipse; smaller slices are raised. */
export function ReadinessPie({ results, compact = false }: { results: PersonResult[]; compact?: boolean }) {
  const [ref, width] = useWidth(420)
  const groups = readinessGroups(results)
  const total = results.length || 1
  const W = Math.max(260, width)
  // The pie fills the width it is given (the dashboard panel on desktop), capped so labels stay legible.
  const R = Math.min(compact ? 170 : 150, W / 2 - (compact ? 8 : 18))
  const tilt = 0.5 // vertical squash of the top face
  const base = Math.round(R * 0.22) // extrusion of the largest slice
  const lift = Math.round(R * 0.14) // extra height of the other slices
  const LEVEL = 46 // vertical step between stacked pin labels
  const levels = Math.max(1, groups.filter((g) => g.n > 0).length - 1)
  const top = 72 + levels * LEVEL // room for the pin labels above the pie
  const cx = W / 2
  const cy = top + R * tilt + lift
  const H = cy + R * tilt + base + 22
  const pt = (a: number, r: number, z: number) => [cx + r * Math.cos(a), cy + r * tilt * Math.sin(a) - z] as const
  const arc = (a0: number, a1: number, r: number, z: number) => {
    const n = Math.max(2, Math.ceil(((a1 - a0) / Math.PI) * 36))
    return Array.from({ length: n + 1 }, (_, i) => pt(a0 + ((a1 - a0) * i) / n, r, z))
  }
  const poly = (ps: readonly (readonly [number, number])[]) => 'M' + ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z'

  const shown = groups.filter((g) => g.n > 0)
  const biggest = shown.reduce((m, g) => (g.n > m.n ? g : m), shown[0])
  let a = -Math.PI / 2
  const slices = shown.map((g, i) => {
    const a0 = a
    const a1 = a + (g.n / total) * Math.PI * 2
    a = a1
    const h = g === biggest ? base : base + lift
    return { g, a0, a1, h, mid: (a0 + a1) / 2, no: String(i + 1).padStart(2, '0'), fill: SLICE_FILL[g.key] }
  })
  const shade = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #0b2413)`
  // Back slices first: depth grows with sin(mid) (lower on screen = nearer).
  const order = [...slices].sort((p, q) => Math.sin(p.mid) - Math.sin(q.mid))

  return (
    <figure className="pie-info pie3d">
      <div className="pie-stage" ref={ref as React.RefObject<HTMLDivElement>}>
        <svg className="pie-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="สัดส่วนอาจารย์ตามผลการประเมิน">
          <defs>
            <filter id="pie-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>
          <ellipse cx={cx + 8} cy={cy + base + 6} rx={R * 1.02} ry={R * tilt * 0.95} className="pie-floor" filter="url(#pie-shadow)" />
          {order.map((sl) => {
            const { a0, a1, h, fill } = sl
            const full = a1 - a0 >= Math.PI * 2 - 1e-6
            // Front part of the outer wall lies where sin(angle) > 0 (0..π).
            const f0 = Math.max(a0, 0)
            const f1 = Math.min(a1, Math.PI)
            const wraps = a1 > Math.PI * 2 ? [Math.max(a0, Math.PI * 2), Math.min(a1, Math.PI * 3)] : null
            const walls = [[f0, f1], wraps].filter((w): w is number[] => !!w && w[1] > w[0])
            return (
              <g key={sl.g.key}>
                {!full &&
                  [a0, a1].map((e, k) => (
                    <path key={k} d={poly([pt(e, 0, 0), pt(e, R, 0), pt(e, R, h), pt(e, 0, h)])} style={{ fill: shade(fill, 62) }} />
                  ))}
                {walls.map(([w0, w1], k) => (
                  <path key={`w${k}`} d={poly([...arc(w0, w1, R, h), ...arc(w0, w1, R, 0).reverse()])} style={{ fill: shade(fill, 78) }} />
                ))}
                <path d={poly([pt(0, 0, h), ...arc(a0, a1, R, h)])} style={{ fill }} className="pie3d-top" />
              </g>
            )
          })}
          {(() => {
            // All labels sit above the pie. The leftmost pin's text goes left; the other
            // pins' text goes right, stacked one level higher per pin from right to left,
            // so no two labels share a row on the same side.
            const pins = slices
              .map((sl) => {
                const r = sl.a1 - sl.a0 > 5 ? R * 0.45 : R * 0.62
                const [x, y] = pt(sl.mid, r, sl.h)
                return { sl, x, y }
              })
              .sort((p, q) => p.x - q.x)
            const pieTop = cy - R * tilt - lift
            return pins.map(({ sl, x, y }, i) => {
              const left = i === 0 && pins.length > 1
              const level = left ? 0 : pins.length - 1 - i
              const yTop = pieTop - 24 - level * LEVEL
              const tx = left ? x - 10 : x + 10
              const anchor = left ? 'end' : 'start'
              const g = sl.g
              return (
                <g key={`pin-${g.key}`} className="pie3d-pin">
                  <line x1={x} y1={y} x2={x} y2={yTop} />
                  <circle cx={x} cy={y} r={3} className="pie3d-pin-foot" />
                  <circle cx={x} cy={yTop} r={5} className="pie3d-pin-head" style={{ fill: sl.fill }} />
                  <text x={tx} y={yTop - 28} textAnchor={anchor} className="pie3d-pct">
                    {g.pct}%
                  </text>
                  <text x={tx} y={yTop - 11} textAnchor={anchor} className="pie3d-name">
                    {g.th}
                  </text>
                  <text x={tx} y={yTop + 4} textAnchor={anchor} className="pie3d-count">
                    {g.n} คน
                  </text>
                </g>
              )
            })
          })()}
        </svg>
        <p className="sr-only">
          {groups.map((g) => `${g.th} ${g.pct}% (${g.n} คน)`).join(' · ')}
        </p>
      </div>
    </figure>
  )
}
