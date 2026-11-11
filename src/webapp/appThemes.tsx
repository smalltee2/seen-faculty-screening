// Picture themes for sfs_webapp.html, like Gmail's themes (Tum, 2026-11-11): a full-window picture
// behind the logo, menu and top bar, with the page content on a frosted card. Every picture is drawn
// here as SVG from code (no photo, no image generator). The choice is remembered in this browser.
import { useEffect, useRef, useState } from 'react'

export type AppThemeId = 'none' | 'phayao' | 'mist' | 'terraces' | 'autumn' | 'night'

const W = 1600
const H = 1000

/** Deterministic pseudo-random numbers, so a picture is the same on every visit. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const ridge = (base: number, amp: number, seed: number, step = 80) => {
  const r = rng(seed)
  let d = `M0 ${H}V${base}`
  for (let x = 0; x <= W + step; x += step) d += `L${x} ${(base - r() * amp).toFixed(0)}`
  return `${d}V${H}Z`
}
const smoothRidge = (base: number, amp: number, seed: number) => {
  const r = rng(seed)
  const pts = Array.from({ length: 9 }, (_, i) => [i * 200, base - r() * amp])
  let d = `M0 ${H}V${pts[0][1].toFixed(0)}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    d += `C${x0 + 100} ${y0.toFixed(0)} ${x1 - 100} ${y1.toFixed(0)} ${x1} ${y1.toFixed(0)}`
  }
  return `${d}V${H}Z`
}

/** Kwan Phayao at dusk: warm sky, low sun, Doi Bussaracum ridges, the lake with the sun's path. */
function phayao() {
  const ripples = Array.from({ length: 14 }, (_, i) => {
    const y = 760 + i * 17
    const w = 40 + i * 14
    return `<rect x="${1080 - w / 2}" y="${y}" width="${w}" height="3" rx="1.5" fill="#ffd9a8" opacity="${(0.55 - i * 0.03).toFixed(2)}"/>`
  }).join('')
  return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4a7a"/><stop offset=".45" stop-color="#c9727a"/><stop offset=".72" stop-color="#f5a35f"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e48e62"/><stop offset="1" stop-color="#40456b"/></linearGradient>
<radialGradient id="sun" cx="1080" cy="640" r="220" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff1c9"/><stop offset=".25" stop-color="#ffcf87" stop-opacity=".8"/><stop offset="1" stop-color="#ffcf87" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="1080" cy="640" r="220" fill="url(#sun)"/><circle cx="1080" cy="650" r="48" fill="#fff3d6"/>
<path d="${smoothRidge(610, 170, 7)}" fill="#7b5a7e" opacity=".75"/><path d="${smoothRidge(680, 120, 11)}" fill="#5a4670"/>
<path d="${smoothRidge(735, 70, 3)}" fill="#3d3558"/>
<rect y="740" width="${W}" height="${H - 740}" fill="url(#w)"/>${ripples}
<path d="M0 ${H}V880C200 860 360 900 560 880S900 905 ${W} 870V${H}Z" fill="#2b2a44" opacity=".55"/>`
}

/** Misty northern mountains in the morning: pale sky and ridges fading into the mist. */
function mist() {
  const cols = ['#c9d6d2', '#a9bfb9', '#87a69e', '#668b82', '#4b6f67', '#33544e']
  const layers = cols.map((c, i) => `<path d="${smoothRidge(380 + i * 95, 120 - i * 8, 20 + i)}" fill="${c}"/><rect y="${430 + i * 95}" width="${W}" height="70" fill="#eef3ef" opacity=".35"/>`).join('')
  return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4efe4"/><stop offset="1" stop-color="#dfe8e4"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="1180" cy="250" r="70" fill="#fff8e6" opacity=".9"/>${layers}`
}

/** Northern rice terraces under a clear sky. */
function terraces() {
  const greens = ['#b8d86b', '#9fcb55', '#86bb45', '#6fa83a', '#5a9432', '#47802a', '#3a6c24', '#2e5a1f']
  const bands = greens.map((g, i) => {
    const y = 360 + i * 82
    const d = `M0 ${y}C300 ${y - 60} 520 ${y + 50} 820 ${y - 10}S1300 ${y - 70} ${W} ${y - 20}V${H}H0Z`
    const edge = `M0 ${y}C300 ${y - 60} 520 ${y + 50} 820 ${y - 10}S1300 ${y - 70} ${W} ${y - 20}`
    return `<path d="${d}" fill="${g}"/><path d="${edge}" fill="none" stroke="#e9f3c4" stroke-width="3" opacity=".55"/>`
  }).join('')
  return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc4e8"/><stop offset="1" stop-color="#e3f1f7"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><path d="${smoothRidge(380, 110, 31)}" fill="#7d9fae" opacity=".7"/>${bands}`
}

/** Autumn forest floor: SEEN-shaped leaves in warm colours on a dark ground. */
function autumn() {
  const r = rng(42)
  const cols = ['#e2732a', '#f0a03a', '#c9472b', '#f3c64f', '#a3522a', '#7f8f35']
  const leaves = Array.from({ length: 170 }, () => {
    const x = r() * W
    const y = r() * H
    const s = 1.4 + r() * 3.2
    const rot = r() * 360
    const c = cols[Math.floor(r() * cols.length)]
    const op = (0.55 + r() * 0.45).toFixed(2)
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot.toFixed(0)}) scale(${s.toFixed(2)})" opacity="${op}"><path d="M-12 0C-6-9 6-9 12 0C6 9-6 9-12 0Z" fill="${c}"/><path d="M-11 0H11" stroke="#3a2416" stroke-opacity=".35" stroke-width=".8"/></g>`
  }).join('')
  return `<defs><radialGradient id="g" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#5a3a22"/><stop offset="1" stop-color="#231610"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>${leaves}`
}

/** A clear night over the hills: stars, a moon, dark ridges. */
function night() {
  const r = rng(9)
  const stars = Array.from({ length: 220 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * 620).toFixed(0)}" r="${(0.6 + r() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`).join('')
  return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset=".7" stop-color="#23305e"/><stop offset="1" stop-color="#3b3f6e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/>${stars}<circle cx="1240" cy="200" r="46" fill="#f4f0dc"/><circle cx="1262" cy="188" r="44" fill="#0f1836" opacity=".9"/>
<path d="${ridge(760, 160, 5, 60)}" fill="#1b2347"/><path d="${smoothRidge(840, 90, 6)}" fill="#11162e"/>`
}

export interface AppTheme {
  id: Exclude<AppThemeId, 'none'>
  th: string
  /** 'dark' pictures get light text on the menu and top bar. */
  tone: 'light' | 'dark'
  draw: () => string
}

export const APP_THEMES: AppTheme[] = [
  { id: 'phayao', th: 'กว๊านพะเยายามเย็น', tone: 'dark', draw: phayao },
  { id: 'mist', th: 'ทะเลหมอกภาคเหนือ', tone: 'light', draw: mist },
  { id: 'terraces', th: 'นาขั้นบันได', tone: 'light', draw: terraces },
  { id: 'autumn', th: 'ใบไม้ร่วง', tone: 'dark', draw: autumn },
  { id: 'night', th: 'ฟ้าคืนดาว', tone: 'dark', draw: night },
]
export const APP_THEME_IDS: readonly AppThemeId[] = ['none', ...APP_THEMES.map((t) => t.id)]

const urls = new Map<string, string>()
/** The picture as a CSS url() value (built once per theme). */
export function themeUrl(t: AppTheme) {
  let u = urls.get(t.id)
  if (!u) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${t.draw()}</svg>`
    u = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    urls.set(t.id, u)
  }
  return u
}

const PaletteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z" />
    <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
    <circle cx="10" cy="7" r="1.2" fill="currentColor" />
    <circle cx="14.5" cy="7" r="1.2" fill="currentColor" />
  </svg>
)

/** The top-bar button and its panel of thumbnails (Gmail: Settings → Themes). */
export function ThemePicker({ value, onChange }: { value: AppThemeId; onChange: (v: AppThemeId) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="app-themes" ref={box}>
      <button type="button" className="theme-toggle app-themes-btn" aria-expanded={open} aria-haspopup="dialog" aria-label="เลือกภาพธีม" title="เลือกภาพธีม" onClick={() => setOpen((o) => !o)}>
        <PaletteIcon />
      </button>
      {open && (
        <div className="app-themes-panel" role="dialog" aria-label="ภาพธีม">
          <p className="app-themes-head">ภาพธีม</p>
          <div className="app-themes-grid">
            <button type="button" className="app-themes-item" aria-pressed={value === 'none'} onClick={() => onChange('none')}>
              <span className="app-themes-thumb app-themes-plain" />
              <span>ไม่มีภาพ</span>
            </button>
            {APP_THEMES.map((t) => (
              <button key={t.id} type="button" className="app-themes-item" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
                <span className="app-themes-thumb" style={{ backgroundImage: themeUrl(t) }} />
                <span>{t.th}</span>
              </button>
            ))}
          </div>
          <p className="app-themes-note">ภาพวาดด้วยโค้ด · จำไว้ในเบราว์เซอร์นี้</p>
        </div>
      )}
    </div>
  )
}
