// Background patterns for the sfs_webapp.html top bar (Tum, 2026-11-11: "ลองใส่รูปแบบเป็นพื้นหลัง").
// Every pattern is drawn here as SVG from code (no image files, no image generator), in two colour
// sets so it works on the light and the dark theme. The bar fades the pattern out towards the title.

export type PatternId = 'leaves' | 'contours' | 'waves' | 'hills' | 'dots'

interface Ink {
  green: string
  green2: string
  orange: string
}
const LIGHT: Ink = { green: '#1d5c33', green2: '#2b8a3e', orange: '#f37225' }
const DARK: Ink = { green: '#6fd081', green2: '#3fae5a', orange: '#ff8a3d' }

const W = 640
const H = 130

/** The SEEN leaf: a pointed oval with a midrib, centred on (0, 0), pointing right. */
const leaf = (x: number, y: number, s: number, rot: number, fill: string, op: number) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${op}"><path d="M-12 0C-6-9 6-9 12 0C6 9-6 9-12 0Z" fill="${fill}"/><path d="M-11 0H11" stroke="#fff" stroke-opacity=".45" stroke-width="1"/></g>`

function leaves(c: Ink) {
  // Leaves drift from the right edge, larger and denser towards it; a few in orange.
  const spots: [number, number, number, number, 'g' | 'g2' | 'o'][] = [
    [600, 30, 1.5, -30, 'g'], [560, 88, 1.2, 25, 'g2'], [612, 104, 0.9, 60, 'o'], [520, 40, 1, -55, 'g2'],
    [470, 92, 0.9, 10, 'g'], [430, 28, 0.75, 40, 'o'], [390, 70, 0.8, -20, 'g2'], [340, 105, 0.6, 30, 'g'],
    [300, 34, 0.55, -40, 'g2'], [250, 80, 0.5, 15, 'g'], [585, 62, 0.7, 80, 'g'], [505, 112, 0.7, -70, 'g2'],
  ]
  const col = { g: c.green, g2: c.green2, o: c.orange }
  return spots.map(([x, y, s, r, k]) => leaf(x, y, s, r, col[k], k === 'o' ? 0.55 : 0.32)).join('')
}

function contours(c: Ink) {
  // Topographic lines around a hill near the right edge (land, watershed).
  const rings = Array.from({ length: 9 }, (_, i) => {
    const rx = 40 + i * 34
    const ry = 22 + i * 15
    const wob = 6 + i * 2
    const d = `M${560 - rx} 70C${560 - rx} ${70 - ry - wob} ${560 + rx * 0.4} ${70 - ry} ${560 + rx} ${70 - wob}S${560 + rx * 0.3} ${70 + ry + wob} ${560 - rx * 0.2} ${70 + ry}S${560 - rx - wob} ${70 + wob} ${560 - rx} 70Z`
    return `<path d="${d}" fill="none" stroke="${i === 2 ? c.orange : c.green}" stroke-width="${i === 2 ? 1.4 : 1}" opacity="${i === 2 ? 0.6 : 0.35 - i * 0.02}"/>`
  })
  return rings.join('')
}

function waves(c: Ink) {
  // Flowing lines (energy, air flow); one in orange.
  return Array.from({ length: 7 }, (_, i) => {
    const y = 20 + i * 15
    const a = 10 + i * 2
    const d = `M0 ${y}C${W * 0.2} ${y - a} ${W * 0.35} ${y + a} ${W * 0.5} ${y}S${W * 0.8} ${y - a} ${W} ${y + a / 2}`
    return `<path d="${d}" fill="none" stroke="${i === 4 ? c.orange : c.green2}" stroke-width="${i === 4 ? 1.8 : 1.2}" opacity="${i === 4 ? 0.6 : 0.3}" stroke-linecap="round"/>`
  }).join('')
}

function hills(c: Ink) {
  // Layered northern hills with a low sun (Phayao: hills around Kwan Phayao).
  return [
    `<circle cx="520" cy="58" r="20" fill="${c.orange}" opacity=".35"/>`,
    `<path d="M160 ${H}C240 70 300 62 360 86S470 46 540 66S610 60 ${W} 52V${H}Z" fill="${c.green2}" opacity=".16"/>`,
    `<path d="M220 ${H}C300 92 360 84 420 100S520 74 580 88S620 84 ${W} 80V${H}Z" fill="${c.green}" opacity=".2"/>`,
    `<path d="M300 ${H}C360 108 430 104 480 114S580 100 ${W} 104V${H}Z" fill="${c.green}" opacity=".28"/>`,
  ].join('')
}

function dots(c: Ink) {
  // A dot grid (data) that grows towards the right edge; a few orange points.
  const out: string[] = []
  for (let x = 200; x <= W; x += 16) {
    for (let y = 10; y <= H - 6; y += 16) {
      const t = (x - 200) / (W - 200)
      const r = 0.6 + t * 2
      const orange = (x * 7 + y * 3) % 97 === 0 || (x === 584 && y === 58)
      out.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${orange ? c.orange : c.green}" opacity="${(orange ? 0.7 : 0.18 + t * 0.25).toFixed(2)}"/>`)
    }
  }
  return out.join('')
}

const DRAW: Record<PatternId, (c: Ink) => string> = { leaves, contours, waves, hills, dots }

export const PATTERNS: { id: PatternId; th: string; note: string }[] = [
  { id: 'leaves', th: 'ใบไม้ SEEN', note: 'ใบไม้จากโลโก้ลอยจากขอบขวา' },
  { id: 'contours', th: 'เส้นชั้นความสูง', note: 'แผนที่ภูมิประเทศ สื่อสิ่งแวดล้อมและพื้นที่' },
  { id: 'waves', th: 'คลื่นพลังงาน', note: 'เส้นโค้งไหล สื่อพลังงานและการไหลของอากาศ' },
  { id: 'hills', th: 'ทิวเขาภาคเหนือ', note: 'ทิวเขาซ้อนกับดวงอาทิตย์ยามเย็น' },
  { id: 'dots', th: 'จุดข้อมูล', note: 'ตารางจุดที่หนาขึ้นทางขวา สื่อข้อมูลและการวัด' },
]

/** The pattern as an SVG document. */
export function patternSvg(id: PatternId, dark: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMid slice">${DRAW[id](dark ? DARK : LIGHT)}</svg>`
}

/** The pattern as a CSS url() value. */
export const patternUrl = (id: PatternId, dark: boolean) => `url("data:image/svg+xml,${encodeURIComponent(patternSvg(id, dark))}")`
