// Hand-built SVG charts (no chart library). Colours come from CSS tokens
// --c-journal / --c-proceeding / --c-poster, validated for colour-blind
// separation in light and dark themes.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { nextYearRisk, toBE, type PersonResult, type Settings } from './rules'
import type { Pub } from './types'
import { SHOWN_ROLES, displayName, levelGroup, type LevelGroup, GROUP_SHORT } from './ui'
import { journalLevel } from './tci'
import { QUARTILES, TCI } from './tciIndex'
import { qualityOf, type QualityKey } from './quality'

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

// Journal level (see tci.ts): Scopus = international, TCI กลุ่ม 1–2 = national, else outside.
export const levelOf = (p: Pub) => journalLevel(p, TCI)?.level ?? null

/** Series of the per-year chart and its table: by type, or by quality (2026-11-08: international
 *  journals by CiteScore quartile, national journals by TCI tier; the rest not split). */
export type YearMode = 'type' | 'quality'
export interface YearSeries { key: string; th: string; cls: string; match: (p: Pub) => boolean }
const isQ = (k: QualityKey) => (p: Pub) => qualityOf(p, TCI, QUARTILES) === k
export const YEAR_SERIES: Record<YearMode, YearSeries[]> = {
  type: [
    { key: 'journalIntl', th: 'วารสารนานาชาติ', cls: 'c-journal', match: (p) => levelOf(p) === 'intl' },
    { key: 'journalNatl', th: 'วารสารระดับชาติ', cls: 'c-journal-natl', match: (p) => levelOf(p) === 'natl' },
    { key: 'journalNone', th: 'วารสารอื่น ๆ', cls: 'c-journal-none', match: (p) => levelOf(p) === 'none' },
    { key: 'proceeding', th: 'Proceedings', cls: 'c-proceeding', match: (p) => p.type === 'proceeding' },
    { key: 'poster', th: 'โปสเตอร์/บทคัดย่อ', cls: 'c-poster', match: (p) => p.type === 'poster' },
  ],
  quality: [
    { key: 'q1', th: 'นานาชาติ Q1', cls: 'c-q1', match: isQ('q1') },
    { key: 'q2', th: 'นานาชาติ Q2', cls: 'c-q2', match: isQ('q2') },
    { key: 'q3', th: 'นานาชาติ Q3', cls: 'c-q3', match: isQ('q3') },
    { key: 'q4', th: 'นานาชาติ Q4', cls: 'c-q4', match: isQ('q4') },
    { key: 'qNone', th: 'นานาชาติ (ไม่มี Quartile)', cls: 'c-qnone', match: isQ('qNone') },
    { key: 'tier1', th: 'TCI กลุ่ม 1', cls: 'c-tier1', match: isQ('tier1') },
    { key: 'tier2', th: 'TCI กลุ่ม 2', cls: 'c-tier2', match: isQ('tier2') },
    { key: 'journalNone', th: 'วารสารอื่น ๆ', cls: 'c-journal-none', match: isQ('journalNone') },
    { key: 'proceeding', th: 'Proceedings', cls: 'c-proceeding', match: (p) => p.type === 'proceeding' },
    { key: 'poster', th: 'โปสเตอร์/บทคัดย่อ', cls: 'c-poster', match: (p) => p.type === 'poster' },
  ],
}

/** Publications per year by type, all lecturers, with the 5-year window shaded. */
export function PubsPerYear({ pubs, settings, mode = 'type' }: { pubs: Pub[]; settings: Settings; mode?: YearMode }) {
  const SERIES = YEAR_SERIES[mode]
  const { show, hide, el } = useTip()
  const [ref, width] = useWidth(640)
  const Y = settings.year
  const years: number[] = []
  for (let y = Y - 9; y <= Y; y++) years.push(y)
  const rows = years.map((y) => {
    const ofYear = pubs.filter((p) => p.year === y)
    const n: Record<string, number> = Object.fromEntries(SERIES.map((sr) => [sr.key, ofYear.filter(sr.match).length]))
    return { y, n, total: SERIES.reduce((a, sr) => a + n[sr.key], 0), excluded: ofYear.filter((p) => p.type === 'exclude' || p.type === 'unknown').length }
  })
  // 15% headroom so the bar totals never collide with the window label.
  const max = niceMax(Math.max(1, ...rows.map((r) => r.total)) * 1.15)
  const W = Math.max(280, width)
  const narrow = W < 480
  const H = narrow ? 280 : 330
  // 3D block style (Tum, 2026-11-07): each year is a stacked prism on a plinth, drawn in
  // oblique projection (depth dx to the right, dy up). Exact values stay in the table below.
  const band0 = (W - 34 - 8) / years.length
  const dx = Math.round(Math.min(16, band0 * 0.2))
  const dy = Math.round(dx * 0.62)
  const m = { t: 26 + dy, r: 8 + dx, b: 46, l: 34 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const band = iw / years.length
  const bw = Math.min(46, band * 0.6)
  const pw = Math.min(band - 2, bw + dx + 10) // plinth width
  const ph = narrow ? 6 : 8 // plinth front height
  const sy = (v: number) => m.t + ih - (v / max) * ih
  const winX = m.l + band * (years.length - 5)
  const face = (cls: string, k: 'front' | 'side' | 'top') => {
    const c = `var(--${cls})`
    return k === 'front' ? c : k === 'side' ? `color-mix(in srgb, ${c} 70%, #000)` : `color-mix(in srgb, ${c} 68%, #fff)`
  }

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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mode === 'quality' ? 'จำนวนผลงานต่อปีแยกตามคุณภาพ' : 'จำนวนผลงานต่อปีแยกตามประเภท'}>
        <rect className="window-band" x={winX} y={m.t - 14 - dy} width={band * 5 + dx} height={ih + 14 + dy + ph + 2} rx={8} />
        <text className="window-label" x={winX + band * 2.5} y={m.t - 4 - dy} textAnchor="middle">
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
        <ellipse className="floor-shadow" cx={m.l + iw / 2} cy={sy(0) + ph + 4} rx={iw / 2} ry={8} />
        {rows.map((r, i) => {
          const cxBand = m.l + band * i + band / 2
          const x = cxBand - (bw + dx) / 2
          const y0 = sy(0)
          const px = cxBand - (pw + dx) / 2
          const total = r.total
          const segs = SERIES.map((sr) => ({ cls: sr.cls, v: r.n[sr.key] })).filter((z) => z.v > 0)
          let acc = 0
          return (
            <g key={r.y}>
              {/* plinth: top, front, side */}
              <path className="plinth-top" d={`M${px},${y0}H${px + pw}L${px + pw + dx},${y0 - dy}H${px + dx}Z`} />
              <rect className="plinth-front" x={px} y={y0} width={pw} height={ph} />
              <path className="plinth-side" d={`M${px + pw},${y0}L${px + pw + dx},${y0 - dy}V${y0 - dy + ph}L${px + pw},${y0 + ph}Z`} />
              {segs.map((sg, si) => {
                const yb = sy(acc)
                acc += sg.v
                const yt = sy(acc)
                const isTop = si === segs.length - 1
                return (
                  <g key={sg.cls}>
                    <path d={`M${x + bw},${yb}L${x + bw + dx},${yb - dy}V${yt - dy}L${x + bw},${yt}Z`} style={{ fill: face(sg.cls, 'side') }} />
                    <rect x={x} y={yt} width={bw} height={Math.max(0, yb - yt)} style={{ fill: face(sg.cls, 'front') }} />
                    {si > 0 && <path className="seg-edge" d={`M${x},${yb}H${x + bw}L${x + bw + dx},${yb - dy}`} />}
                    {isTop && <path d={`M${x},${yt}H${x + bw}L${x + bw + dx},${yt - dy}H${x + dx}Z`} style={{ fill: face(sg.cls, 'top') }} />}
                  </g>
                )
              })}
              {total > 0 && (
                <text className="bar-label" x={x + (bw + dx) / 2} y={sy(total) - dy - 6} textAnchor="middle">
                  {total}
                </text>
              )}
              <text className="axis" x={cxBand} y={y0 + ph + 17} textAnchor="middle">
                {narrow ? String(toBE(r.y)).slice(2) : toBE(r.y)}
              </text>
              {!narrow && (
                <text className="axis axis-sub" x={cxBand} y={y0 + ph + 31} textAnchor="middle">
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
                      {SERIES.map((sr) => (
                        <span key={sr.key}>
                          {sr.th} {r.n[sr.key]}
                        </span>
                      ))}
                      <span className="muted">ไม่นับ/ไม่ทราบประเภท {r.excluded}</span>
                    </>,
                  )
                }
                onMouseLeave={hide}
              />
            </g>
          )
        })}
      </svg>
      {el}
    </figure>
  )
}

/** Each lecturer's eligible outputs in the window: research, other, and uncertain, against the 3-output line. */
type OutputsView = 'research' | 'type' | 'quality'

/** Bar segments per view; colours match the per-year chart in the 'type' view. */
const OUTPUT_SEGS: Record<OutputsView, { key: 'research' | 'other' | 'journalIntl' | 'journalNatl' | QualityKey; cls: string; th: string }[]> = {
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
  // แยกตามคุณภาพผลงาน (Tum, 2026-11-08): international journals by CiteScore quartile (Scopus),
  // national journals by TCI tier; other journals, proceedings and posters are not split.
  quality: [
    { key: 'q1', cls: 'c-q1', th: 'นานาชาติ Q1' },
    { key: 'q2', cls: 'c-q2', th: 'นานาชาติ Q2' },
    { key: 'q3', cls: 'c-q3', th: 'นานาชาติ Q3' },
    { key: 'q4', cls: 'c-q4', th: 'นานาชาติ Q4' },
    { key: 'qNone', cls: 'c-qnone', th: 'นานาชาติ (ไม่มี Quartile)' },
    { key: 'tier1', cls: 'c-tier1', th: 'TCI กลุ่ม 1' },
    { key: 'tier2', cls: 'c-tier2', th: 'TCI กลุ่ม 2' },
    { key: 'journalNone', cls: 'c-journal-none', th: 'วารสารอื่น ๆ' },
    { key: 'proceeding', cls: 'c-proceeding', th: 'Proceedings' },
    { key: 'poster', cls: 'c-poster', th: 'โปสเตอร์/บทคัดย่อ' },
  ],
}

export type { OutputsView }

/** Rows of the per-lecturer outputs chart, in chart order: counted outputs in the window split
 *  every way the chart can show them, plus the frame state. Shared with the lecturers page CSV
 *  so the download is the chart as shown (Tum, 2026-11-09). */
export function outputRows(results: PersonResult[], settings: Settings, group: LevelGroup, view: OutputsView) {
  const roles = SHOWN_ROLES.filter((role) => levelGroup(role.level) === group)
  return results
    .map((r) => {
      const c = r.roles.ms_program.counts
      // Counted outputs (eligible = yes) in the 5-year window, the same set the rules use.
      const used = r.roles.ms_program.used
      const ofType = (t: string) => used.filter((e) => e.pub.type === t).length
      const ofQuality = (k: QualityKey) => used.filter((e) => qualityOf(e.pub, TCI, QUARTILES) === k).length
      return {
        r,
        research: c.research,
        other: c.total - c.research,
        journalIntl: used.filter((e) => levelOf(e.pub) === 'intl').length,
        journalNatl: used.filter((e) => levelOf(e.pub) === 'natl').length,
        journalNone: used.filter((e) => levelOf(e.pub) === 'none').length,
        proceeding: ofType('proceeding'),
        poster: ofType('poster'),
        q1: ofQuality('q1'),
        q2: ofQuality('q2'),
        q3: ofQuality('q3'),
        q4: ofQuality('q4'),
        qNone: ofQuality('qNone'),
        tier1: ofQuality('tier1'),
        tier2: ofQuality('tier2'),
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
}

/** Segment labels of each chart view (for the CSV header). */
export const outputSegments = (view: OutputsView) => OUTPUT_SEGS[view].map((s) => ({ key: s.key, th: s.th }))

/** One chart per level group: `group` picks the duties (10.1.x or 9.3–9.4) and the threshold line. */
export function LecturerOutputs({ results, settings, group, view }: { results: PersonResult[]; settings: Settings; group: LevelGroup; view: OutputsView }) {
  const { show, hide, el } = useTip()
  const [ref, width] = useWidth(1000)
  const roles = SHOWN_ROLES.filter((role) => levelGroup(role.level) === group)
  const threshold = group === 'ba' ? 1 : 3
  const lvl = GROUP_SHORT[group]
  const rows = outputRows(results, settings, group, view)
  const segDefs = OUTPUT_SEGS[view]
  const max = niceMax(Math.max(4, ...rows.map((x) => x.research + x.other + x.maybe)) * 1.12)
  const W = Math.max(280, width)
  const narrow = W < 600
  // Pill-and-bubble style (Tum's reference, 2026-11-07): thick round-ended bars, the total in a
  // speech bubble at the bar end, soft shading at 0.
  const uid = useId().replace(/:/g, '')
  const rowH = narrow ? 30 : 34
  const rankW = 8 // rank numbers removed (Tum, 2026-11-07); small left margin only
  const nameW = Math.round(Math.min(230, Math.max(110, W * 0.3)))
  const m = { t: 24, r: narrow ? 40 : 150, b: 26, l: rankW + nameW }
  const maxChars = Math.floor(nameW / 7)
  const H = m.t + m.b + rows.length * rowH
  const iw = W - m.l - m.r
  const sx = (v: number) => m.l + (v / max) * iw
  const bh = narrow ? 14 : 18
  const bubbles: ReactNode[] = [] // drawn after the threshold line so it never covers a total
  const tone = (x: { failed: number; risk: unknown[] }) => (x.failed > 0 ? 'fail' : x.risk.length > 0 ? 'risk' : 'ok')

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
          <i className="swatch swatch-fail" /> ไม่ผ่านบางหน้าที่ของ{lvl} ในปีที่ประเมิน
        </span>
        <span>
          <i className="swatch swatch-risk" /> ปีหน้าอาจไม่ผ่าน{lvl} ถ้าไม่มีผลงานเพิ่ม
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
                <text className="row-label" x={m.l - 10} y={y + bh - 4} textAnchor="end">
                  {(() => {
                    // Narrow screens drop the title (รศ.ดร.) so the name itself fits.
                    const label = narrow ? x.r.person.nameTh || x.name : x.name
                    // Cut only after a full Thai syllable: drop a dangling vowel/tone mark left at the cut.
                    return label.length > maxChars ? `${label.slice(0, maxChars - 1).replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+$/, '')}…` : label
                  })()}
                </text>
              </a>
              <rect className="pill-track" x={sx(0)} y={y} width={iw} height={bh} rx={bh / 2} />
              <clipPath id={`${uid}-c${i}`}>
                <rect x={sx(0)} y={y} width={Math.max(bh, sx(total + x.maybe) - sx(0))} height={bh} rx={bh / 2} />
              </clipPath>
              <g clipPath={`url(#${uid}-c${i})`}>
                {segs.map((s, si) => {
                  if (!s.v) return null
                  const x0 = sx(acc)
                  acc += s.v
                  const w = sx(acc) - x0 - (segs.slice(si + 1).some((z) => z.v) ? 2 : 0)
                  return <rect key={s.cls} className={s.cls} x={x0} y={y} width={Math.max(0, w)} height={bh} />
                })}
                <rect className="pill-gloss" x={sx(0)} y={y} width={iw} height={bh / 2} />
              </g>
              {void (() => {
                const label = `${total}${x.maybe ? `+${x.maybe}?` : ''}`
                const bwid = 14 + label.length * (narrow ? 7 : 8)
                const bx = Math.max(sx(acc), sx(0) + bh / 2) + 10
                const bhh = narrow ? 18 : 22
                const by = y + bh / 2 - bhh / 2
                bubbles.push(
                  <g key={x.r.person.nameEn} className={`bubble bubble-${tone(x)}`}>
                    <path d={`M${bx},${y + bh / 2 - 5}L${bx - 6},${y + bh / 2}L${bx},${y + bh / 2 + 5}Z`} />
                    <rect x={bx} y={by} width={bwid} height={bhh} rx={6} />
                    <text x={bx + bwid / 2} y={by + bhh / 2 + (narrow ? 4 : 5)} textAnchor="middle">
                      {label}
                    </text>
                  </g>,
                )
              })()}
              {/* On narrow screens the row frame and bubble colour carry the status; the text would overlap the bubble. */}
              {narrow ? null : x.failed > 0 ? (
                <text className="fail-label" x={W - 12} y={y + bh - 2} textAnchor="end">
                  {narrow ? `✗ ${x.failed}` : `✗ ไม่ผ่าน (${lvl}) ${x.failed}/${roles.length} หน้าที่`}
                </text>
              ) : (
                x.risk.length > 0 && (
                  <text className="risk-label" x={W - 12} y={y + bh - 2} textAnchor="end">
                    {narrow ? '⚠︎' : `⚠︎ ปีหน้าอาจไม่ผ่าน (${lvl})`}
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
                          ✗ ปี {toBE(settings.year)} ไม่ผ่าน ({lvl}) {x.failed} จาก {roles.length} หน้าที่
                        </span>
                      )}
                      {x.risk.length > 0 && (
                        <span className="tip-risk">
                          ⚠︎ ถ้าปี {toBE(settings.year + 1)} ไม่มีผลงานเพิ่ม จะไม่ผ่าน ({lvl}): {x.risk.map((role) => role.clause).join(', ')}
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
        <defs>
          <linearGradient id={`${uid}-shade`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" className="shade-0" />
            <stop offset="1" className="shade-1" />
          </linearGradient>
        </defs>
        <rect x={sx(0)} y={m.t - 6} width={Math.min(56, iw * 0.07)} height={H - m.b - m.t + 6} fill={`url(#${uid}-shade)`} pointerEvents="none" />
        {/* Threshold drawn over the bars (with a surface halo) so it stays visible across them */}
        <g className="rule-group">
          <line className="rule-halo" x1={sx(threshold)} x2={sx(threshold)} y1={m.t - 14} y2={H - m.b} />
          <line className="rule" x1={sx(threshold)} x2={sx(threshold)} y1={m.t - 14} y2={H - m.b} />
          <text className="rule-label" x={sx(threshold) + 6} y={m.t - 5}>
            เกณฑ์ ≥ {threshold} เรื่อง
          </text>
        </g>
        {bubbles}
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
              // Labels near the right edge are anchored to the left of the pin so they stay inside the SVG
              // (each pin has its own row, so this cannot collide with another label).
              const flip = !left && x > W - 130
              const tx = left || flip ? x - 10 : x + 10
              const anchor = left || flip ? 'end' : 'start'
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
