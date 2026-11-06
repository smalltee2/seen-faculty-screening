// Hand-built SVG charts (no chart library). Colours come from CSS tokens
// --c-journal / --c-proceeding / --c-poster, validated for colour-blind
// separation in light and dark themes.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextYearRisk, toBE, type PersonResult, type Settings } from './rules'
import type { Pub } from './types'
import { SHOWN_ROLES, displayName, levelGroup, type LevelGroup } from './ui'
import { journalLevel } from './tci'
import { TCI } from './tciIndex'

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

// Journal level (see tci.ts): Scopus = international, TCI กลุ่ม 1–2 = national, else outside.
export const levelOf = (p: Pub) => journalLevel(p, TCI)?.level ?? null

const SERIES = [
  { key: 'journalIntl', th: 'วารสารนานาชาติ', cls: 'c-journal' },
  { key: 'journalNatl', th: 'วารสารระดับชาติ', cls: 'c-journal-natl' },
  { key: 'journalNone', th: 'วารสารอื่น ๆ', cls: 'c-journal-none' },
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
      journalIntl: ofYear.filter((p) => levelOf(p) === 'intl').length,
      journalNatl: ofYear.filter((p) => levelOf(p) === 'natl').length,
      journalNone: ofYear.filter((p) => levelOf(p) === 'none').length,
      proceeding: ofYear.filter((p) => p.type === 'proceeding').length,
      poster: ofYear.filter((p) => p.type === 'poster').length,
      excluded: ofYear.filter((p) => p.type === 'exclude' || p.type === 'unknown').length,
    }
  })
  // 15% headroom so the bar totals never collide with the window label.
  const max = niceMax(Math.max(1, ...rows.map((r) => r.journalIntl + r.journalNatl + r.journalNone + r.proceeding + r.poster)) * 1.15)
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
          const total = r.journalIntl + r.journalNatl + r.journalNone + r.proceeding + r.poster
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
                  <path key={s.key} className={s.cls} d={barPath(x, y1, bw, h, 4)} />
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
                      <span>วารสารอื่น ๆ {r.journalNone}</span>
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
const OUTPUT_SEGS: Record<OutputsView, { key: 'research' | 'other' | 'journalIntl' | 'journalNatl' | 'journalNone' | 'proceeding' | 'poster'; cls: string; th: string }[]> = {
  research: [
    { key: 'research', cls: 'c-journal', th: 'งานวิจัย' },
    { key: 'other', cls: 'c-other', th: 'ผลงานอื่น (บทความวิชาการ/ปริทัศน์)' },
  ],
  type: [
    { key: 'journalIntl', cls: 'c-journal', th: 'วารสารนานาชาติ' },
    { key: 'journalNatl', cls: 'c-journal-natl', th: 'วารสารระดับชาติ' },
    { key: 'journalNone', cls: 'c-journal-none', th: 'วารสารอื่น ๆ' },
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
        journalIntl: used.filter((e) => levelOf(e.pub) === 'intl').length,
        journalNatl: used.filter((e) => levelOf(e.pub) === 'natl').length,
        journalNone: used.filter((e) => levelOf(e.pub) === 'none').length,
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
        : b.research + b.other - (a.research + a.other) || b.journalIntl + b.journalNatl + b.journalNone - (a.journalIntl + a.journalNatl + a.journalNone) || a.name.localeCompare(b.name, 'th'),
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
            <i className={`swatch ${s.cls}`} /> {s.th}
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
                    {narrow ? '⚠︎' : '⚠︎ ปีหน้าอาจไม่ผ่าน'}
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
                          ⚠︎ ถ้าปี {toBE(settings.year + 1)} ไม่มีผลงานเพิ่ม จะไม่ผ่าน: {x.risk.map((role) => role.clause).join(', ')}
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
    { key: 'all', th: 'ผ่านครบทุกหน้าที่', note: 'ทำได้ทุกหน้าที่ของหลักสูตร ป.โท และ ป.เอก', icon: 'check', n: 0 },
    { key: 'some', th: 'ผ่านบางหน้าที่', note: 'เช่น สอนได้ แต่เป็นผู้รับผิดชอบหรือที่ปรึกษาไม่ได้', icon: 'partial', n: 0 },
    { key: 'review', th: 'มีหน้าที่รอตรวจสอบ', note: '', icon: 'partial', n: 0 },
    { key: 'none', th: 'ไม่ผ่านทุกหน้าที่', note: 'ไม่ผ่านหน้าที่ระดับบัณฑิตศึกษาทุกข้อ', icon: 'cross', n: 0 },
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

const DONUT_FILL: Record<string, string> = { all: 'var(--met-mark)', some: 'var(--rev-mark)', review: 'var(--partial-mark)', none: 'var(--not-mark)' }

/** Flat donut of lecturers by readiness (graduate duties), hero count in the centre and a
 *  legend list with counts and shares. Replaced the 3D pie on 2026-11-07 (business style;
 *  3D distorts slice areas). Segments are separated by a 2px surface gap. */
export function ReadinessPie({ results }: { results: PersonResult[]; compact?: boolean }) {
  const groups = readinessGroups(results)
  const total = results.length || 1
  const [hover, setHover] = useState<string | null>(null)
  const S = 220
  const c = S / 2
  const R = 104
  const r = 70
  const gap = 2 / R // 2px surface gap expressed as an angle at the outer edge
  const pt = (a: number, rad: number) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`
  let a = -Math.PI / 2
  const shown = groups.filter((g) => g.n > 0)
  const segs = shown.map((g) => {
    const sweep = (g.n / total) * Math.PI * 2
    const a0 = a + (shown.length > 1 ? gap / 2 : 0)
    const a1 = a + sweep - (shown.length > 1 ? gap / 2 : 0)
    a += sweep
    const large = a1 - a0 > Math.PI ? 1 : 0
    const d =
      shown.length === 1
        ? `M${c},${c - R}A${R},${R} 0 1 1 ${c - 0.01},${c - R}L${c - 0.01},${c - r}A${r},${r} 0 1 0 ${c},${c - r}Z`
        : `M${pt(a0, R)}A${R},${R} 0 ${large} 1 ${pt(a1, R)}L${pt(a1, r)}A${r},${r} 0 ${large} 0 ${pt(a0, r)}Z`
    return { g, d }
  })
  const all = groups.find((g) => g.key === 'all')!
  const focus = hover ? groups.find((g) => g.key === hover)! : all
  return (
    <figure className="donut">
      <div className="donut-plot">
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label="สัดส่วนอาจารย์ตามผลการประเมินระดับบัณฑิตศึกษา">
          <circle cx={c} cy={c} r={(R + r) / 2} className="donut-track" strokeWidth={R - r} />
          {segs.map(({ g, d }) => (
            <path
              key={g.key}
              d={d}
              style={{ fill: DONUT_FILL[g.key] }}
              className={`donut-seg${hover && hover !== g.key ? ' is-dim' : ''}`}
              onMouseEnter={() => setHover(g.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${g.th} ${g.n} คน (${g.pct}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <span className="donut-value">
            {focus.n}
            <small>/{total}</small>
          </span>
          <span className="donut-caption">{focus.th}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {groups.map((g) => (
          <li key={g.key} className={hover && hover !== g.key ? 'is-dim' : ''} onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)}>
            <i className="donut-swatch" style={{ background: DONUT_FILL[g.key] }} />
            <span className="donut-name">
              {g.th}
              {g.note && <small>{g.note}</small>}
            </span>
            <span className="donut-num">
              <b>{g.n}</b> คน
            </span>
            <span className="donut-pct">{g.pct}%</span>
          </li>
        ))}
      </ul>
      <figcaption className="donut-foot">นับจาก 10 หน้าที่ระดับบัณฑิตศึกษา (ข้อ 9.3–9.4) ของอาจารย์ {total} คน</figcaption>
    </figure>
  )
}
