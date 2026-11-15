// Water and glass drawn with WebGL2 behind the window (Tum, 2026-11-16: "ถ้าใช้ javascript webgl2
// เพื่อทำ water/glass"), computers and tablets only. A shader cannot read the page's HTML, so it
// bends only what it draws itself: the slow green-and-orange "water" behind the window. The side
// menu, its tab and the round controls of the top bar are panes of glass over that water: their
// rims bend it like a thick pane, and a highlight follows the pointer. The content card and
// everything on phones are HTML and are untouched. One pass, no texture, no library.
// Drawing stops a few seconds after the last movement, while the tab is hidden, and under
// "reduce motion" (one still frame). Without WebGL2 the CSS glass of webapp.css stays.

/** Glass panes the shader can draw at once. */
export const MAX_PANES = 8
/** Panes, in the order they are drawn. */
export const PANE_SELECTOR = '.app-side, .app-nav-tab, .app-top-tools .hover-select-button, .app-top-tools .icon-btn'
/** Drawing goes on this long after the last movement. */
export const IDLE_MS = 4000

export interface Pane {
  x: number
  y: number
  w: number
  h: number
  r: number
}

/** "rgb(29, 92, 51)" or "rgba(…)" or "color(srgb 0.1 0.3 0.2)" → [r, g, b] in 0–1; null when unreadable. */
export function cssRgb(s: string): [number, number, number] | null {
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s.trim())
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])]
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s.trim())
  return m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255] : null
}

/** A pane from an element's box and its corner radius ("26px", "50%", "999px"): the radius never
 *  exceeds half the shorter side; boxes with no size (hidden elements) are left out. */
export function paneOf(box: { left: number; top: number; width: number; height: number }, radius: string): Pane | null {
  if (!(box.width > 0 && box.height > 0)) return null
  const half = Math.min(box.width, box.height) / 2
  const n = parseFloat(radius)
  const r = !Number.isFinite(n) ? 0 : radius.trim().endsWith('%') ? (half * 2 * n) / 100 : n
  return { x: box.left, y: box.top, w: box.width, h: box.height, r: Math.max(0, Math.min(half, r)) }
}

/** The visible panes of the page, at most MAX_PANES. */
export function measurePanes(root: ParentNode): Pane[] {
  const out: Pane[] = []
  for (const el of root.querySelectorAll<HTMLElement>(PANE_SELECTOR)) {
    const p = paneOf(el.getBoundingClientRect(), getComputedStyle(el).borderTopLeftRadius)
    if (p) out.push(p)
    if (out.length === MAX_PANES) break
  }
  return out
}

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;      // window, CSS px
uniform float uDpr, uTime, uDark;
uniform vec2 uPtr;      // pointer, CSS px
uniform vec3 uBase, uA, uB, uPanel;
uniform vec4 uRect[${MAX_PANES}];
uniform float uRad[${MAX_PANES}];
uniform int uN;

float blob(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return exp(-dot(d, d) * 1.6); }

// The water: three soft pools of colour that drift, warped slowly, with faint bands of light.
vec3 field(vec2 p) {
  float t = uTime;
  float asp = uRes.x / uRes.y;
  vec2 w = p / uRes; w.x *= asp;
  w += 0.035 * vec2(sin(w.y * 3.1 + t * 0.21) + 0.5 * sin(w.y * 7.3 - t * 0.17), cos(w.x * 2.7 - t * 0.19) + 0.5 * cos(w.x * 6.1 + t * 0.13));
  float a1 = blob(w, vec2(-0.05 + 0.05 * sin(t * 0.11), -0.08), vec2(0.75, 0.62));
  float b1 = blob(w, vec2(0.05, 1.08 + 0.04 * cos(t * 0.09)), vec2(0.6, 0.5));
  float a2 = blob(w, vec2(asp * 1.05, -0.05 + 0.05 * sin(t * 0.07 + 1.0)), vec2(0.7, 0.5));
  float sa = mix(0.30, 0.17, uDark), sb = mix(0.22, 0.15, uDark);
  vec3 c = uBase;
  c = mix(c, uA, sa * a1); c = mix(c, uB, sb * b1); c = mix(c, uA, sa * 0.85 * a2);
  float k = sin(w.x * 9.0 + sin(w.y * 5.0 + t * 0.25) * 1.6 + t * 0.12) * sin(w.y * 8.0 - sin(w.x * 4.0 - t * 0.2) * 1.4);
  k = smoothstep(0.55, 1.0, k);
  c += mix(0.05, 0.03, uDark) * k * (a1 + b1 + a2 + 0.25);
  return c;
}

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec3 col = field(p);
  for (int i = 0; i < ${MAX_PANES}; i++) {
    if (i >= uN) break;
    vec2 hb = uRect[i].zw * 0.5;
    vec2 q = p - (uRect[i].xy + hb);
    float r = uRad[i];
    float d = sdRR(q, hb, r);
    if (d < 0.0) {
      // Inside a pane: the rim bends the water like the edge of a thick pane.
      // A small pane (a round control) has a thin rim, or it would be all highlight.
      float bez = min(26.0, min(hb.x, hb.y) * 0.5);
      float e = 1.0 - clamp(-d / bez, 0.0, 1.0);
      float e3 = e * e * e;
      vec2 n = normalize(vec2(sdRR(q + vec2(1.0, 0.0), hb, r) - sdRR(q - vec2(1.0, 0.0), hb, r), sdRR(q + vec2(0.0, 1.0), hb, r) - sdRR(q - vec2(0.0, 1.0), hb, r)) + 1e-5);
      vec3 g = field(p - n * e3 * bez * 2.2);
      g.r = field(p - n * e3 * bez * 2.6).r; // the colours part slightly at the rim
      g = mix(g, uPanel, mix(0.44, 0.30, e));
      vec2 l = normalize(uPtr - p + 1e-3);
      g += mix(0.35, 0.10, uDark) * pow(max(dot(n, l), 0.0), 2.0) * e3;
      g += mix(0.22, 0.06, uDark) * max(dot(n, vec2(0.0, -1.0)), 0.0) * e3;
      g -= 0.045 * max(dot(n, vec2(0.0, 1.0)), 0.0) * e3;
      g += mix(0.30, 0.10, uDark) * smoothstep(1.5, 0.0, -d);
      col = g;
    } else {
      col *= 1.0 - mix(0.07, 0.25, uDark) * exp(-d / 14.0);
    }
  }
  o = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s
  console.warn('[water] shader:', gl.getShaderInfoLog(s))
  return null
}

/** Starts drawing on `canvas` for the shell `root` (.app). Returns the stop function, or null when
 *  WebGL2 or the shader is not available (the page then keeps its CSS glass). `onDrawn` is called
 *  after the first frame is on the canvas (a tab opened in the background draws nothing until it
 *  is shown, and an undrawn canvas is black); `onLost` if the browser takes the context away later. */
export function startWater(canvas: HTMLCanvasElement, root: HTMLElement, onDrawn: () => void, onLost: () => void): (() => void) | null {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[water] program:', gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(prog, name)
  const U = { res: u('uRes'), dpr: u('uDpr'), time: u('uTime'), dark: u('uDark'), ptr: u('uPtr'), base: u('uBase'), a: u('uA'), b: u('uB'), panel: u('uPanel'), rect: u('uRect'), rad: u('uRad'), n: u('uN') }

  // The theme's colours, read through a hidden element so var() and color-mix() are resolved.
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'
  root.appendChild(probe)
  const colour = (v: string, fallback: [number, number, number]) => {
    probe.style.color = v
    return cssRgb(getComputedStyle(probe).color) ?? fallback
  }
  let colours = { base: [0.91, 0.93, 0.9], a: [0.11, 0.36, 0.2], b: [0.71, 0.33, 0.06], panel: [1, 1, 1], dark: 0 }
  const readColours = () => {
    const base = colour('var(--app-canvas)', [0.91, 0.93, 0.9])
    colours = { base, a: colour('var(--accent)', [0.11, 0.36, 0.2]), b: colour('var(--ember, #b5530f)', [0.71, 0.33, 0.06]), panel: colour('var(--panel)', [1, 1, 1]), dark: base[0] + base[1] + base[2] < 1.2 ? 1 : 0 }
  }
  readColours()

  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const ptr = { x: 260, y: -200, tx: 260, ty: -200 }
  let time = 0
  let last = 0
  let until = 0
  let frame = 0
  let stopped = false
  let drawn = false

  const draw = (now: number) => {
    frame = 0
    if (stopped || document.hidden) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = window.innerWidth
    const h = window.innerHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    if (!still.matches) {
      time += last ? Math.min(0.1, (now - last) / 1000) : 0
      ptr.x += (ptr.tx - ptr.x) * 0.12
      ptr.y += (ptr.ty - ptr.y) * 0.12
    }
    last = now
    const panes = measurePanes(root)
    const rect = new Float32Array(MAX_PANES * 4)
    const rad = new Float32Array(MAX_PANES)
    panes.forEach((p, i) => {
      rect.set([p.x, p.y, p.w, p.h], i * 4)
      rad[i] = p.r
    })
    gl.uniform2f(U.res, w, h)
    gl.uniform1f(U.dpr, dpr)
    gl.uniform1f(U.time, time)
    gl.uniform1f(U.dark, colours.dark)
    gl.uniform2f(U.ptr, ptr.x, ptr.y)
    gl.uniform3fv(U.base, colours.base)
    gl.uniform3fv(U.a, colours.a)
    gl.uniform3fv(U.b, colours.b)
    gl.uniform3fv(U.panel, colours.panel)
    gl.uniform4fv(U.rect, rect)
    gl.uniform1fv(U.rad, rad)
    gl.uniform1i(U.n, panes.length)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!drawn) {
      drawn = true
      onDrawn()
    }
    if (!still.matches && now < until) frame = requestAnimationFrame(draw)
    else last = 0
  }
  /** Something moved: draw, and keep drawing for a while. */
  const kick = () => {
    until = performance.now() + IDLE_MS
    if (!frame && !stopped) frame = requestAnimationFrame(draw)
  }
  const onPointer = (e: PointerEvent) => {
    ptr.tx = e.clientX
    ptr.ty = e.clientY
    kick()
  }
  const onTheme = () => {
    readColours()
    kick()
  }
  const onContextLost = (e: Event) => {
    e.preventDefault()
    onLost()
  }
  const themeWatch = new MutationObserver(onTheme)
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const scheme = window.matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', onTheme)
  const sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(kick) : null
  sizeWatch?.observe(root)
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('resize', kick)
  window.addEventListener('hashchange', kick)
  window.addEventListener('keydown', kick)
  document.addEventListener('scroll', kick, { passive: true, capture: true })
  document.addEventListener('visibilitychange', kick)
  root.addEventListener('transitionend', kick)
  canvas.addEventListener('webglcontextlost', onContextLost)
  kick()

  return () => {
    stopped = true
    if (frame) cancelAnimationFrame(frame)
    themeWatch.disconnect()
    scheme.removeEventListener('change', onTheme)
    sizeWatch?.disconnect()
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('resize', kick)
    window.removeEventListener('hashchange', kick)
    window.removeEventListener('keydown', kick)
    document.removeEventListener('scroll', kick, { capture: true })
    document.removeEventListener('visibilitychange', kick)
    root.removeEventListener('transitionend', kick)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    probe.remove()
  }
}
