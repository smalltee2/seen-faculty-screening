// Screenshots for the PowerPoint user manual (docs/manual/ppt), taken from the live web app with
// headless Google Chrome driven over the DevTools protocol (Node's built-in WebSocket, no packages).
//
//   node scripts/manual/ppt-shots.mjs [base-url]     (default: the main address)
//   → docs/manual/ppt/shots/*.png
//
// Two views need a signed-in visitor. Nothing is sent to the backend in their name:
//  - A lecturer's own page (ตรวจสอบคุณสมบัติของฉัน): the page is given a placeholder session, and
//    every backend request carrying it is answered here (`me` → the example lecturer); requests
//    without it (public lists) go to the backend as for any visitor.
//  - The programme chair's pages (level 1): the browser is given the state the level-1 passcode
//    leaves behind (the gate's public salt from the data bundle); no passcode is used.
// On the chair's pages every lecturer's name except the example lecturer's is blurred, because
// those pages show colleagues' pass/fail results and the manual goes to all lecturers.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = process.env.SHOTS_OUT ?? join(ROOT, 'docs/manual/ppt/shots')
// SET=phone takes only the phone views of the personal page (for reviewing that layout).
const SET = process.env.SET ?? 'manual'
const BASE = (process.argv[2] ?? 'https://seen-education-service.pages.dev/').replace(/\/?$/, '/')
// Cloudflare Pages serves pages without ".html"; GitHub Pages and the dev server need it.
const PAGE = `${BASE}sfs_webapp${BASE.includes('pages.dev') ? '' : '.html'}`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const data = JSON.parse(readFileSync(join(ROOT, 'src/generated/data.json'), 'utf8'))
const EXAMPLE = data.faculty.find((f) => f.nameEn === 'Teerachai Amnuaylojaroen')
if (!EXAMPLE) throw new Error('example lecturer not in the data bundle')
const SESSION = 'manual-screenshot-placeholder'
const viewerSalt = data.sources.viewerGate?.salt
const adminSalt = data.sources.adminGate?.salt
if (!viewerSalt) throw new Error('no viewer gate in the data bundle')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(OUT, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'seen-shots-'))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

let ws
let nextId = 1
const pending = new Map()
const listeners = []
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject, method })
    ws.send(JSON.stringify({ id, method, params }))
  })

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((r, j) => {
          ws.onopen = r
          ws.onerror = j
        })
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data)
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id)
            pending.delete(m.id)
            m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result)
          } else if (m.method) for (const l of listeners) l(m)
        }
        return
      }
    } catch {
      /* Chrome not up yet */
    }
    await sleep(200)
  }
  throw new Error('Chrome did not start')
}

/** Answer backend requests that carry the placeholder session; let the rest through. */
function interceptBackend() {
  listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    const body = request.postData ?? ''
    if (!body.includes(SESSION)) return void send('Fetch.continueRequest', { requestId }).catch(() => {})
    let action = ''
    try {
      action = JSON.parse(body).action
    } catch {
      /* not JSON */
    }
    const answer = action === 'me' ? { ok: true, email: 'teerachai.am@up.ac.th', nameEn: EXAMPLE.nameEn, isAdmin: false } : { ok: true, items: [] }
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(JSON.stringify(answer)).toString('base64'),
    }).catch(() => {})
  })
  return send('Fetch.enable', { patterns: [{ urlPattern: 'https://script.google.com/*', requestStage: 'Request' }] })
}

/** Blur every lecturer's name except the example lecturer's (chair pages). */
const BLUR = `(() => {
  const names = ${JSON.stringify(data.faculty.filter((f) => f.nameEn !== EXAMPLE.nameEn).flatMap((f) => [f.nameTh, f.nameEn]).filter(Boolean))};
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
  for (const el of document.querySelectorAll('body *')) {
    const t = own(el) || (el.tagName === 'text' || el.tagName === 'tspan' ? el.textContent : '');
    if (t && names.some((n) => t.includes(n))) el.style.filter = 'blur(6px)';
  }
})()`

async function shot(name, { hash, width = 1440, height = 900, scale = 1.5, mobile = false, as = 'visitor', scrollTo = null, scrollText = null, scrollBy = 0, blur = false, wait = 3500, marks = [], act = null }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile })
  // Start each view from a clean origin state, then set what this visitor would have.
  await send('Network.clearBrowserCookies')
  await send('Page.navigate', { url: `${PAGE}#/overview` })
  await sleep(1500)
  const state =
    as === 'lecturer'
      ? `sessionStorage.setItem('seen-personal-session', ${JSON.stringify(SESSION)}); sessionStorage.removeItem('seen-admin-form');`
      : as === 'chair' || as === 'admin'
        ? // 'admin' = the level-2 state without its approval key: the pages open, and nothing can be approved or sent.
          `sessionStorage.setItem('seen-admin-form', ${JSON.stringify(JSON.stringify(as === 'admin' ? { formUrl: '', decisionFormUrl: '', level: 2, gate: adminSalt } : { formUrl: '', decisionFormUrl: '', level: 1, gate: viewerSalt }))}); sessionStorage.removeItem('seen-personal-session');`
        : `sessionStorage.clear(); localStorage.removeItem('seen-admin-form'); localStorage.removeItem('seen-personal-session');`
  await send('Runtime.evaluate', { expression: state })
  // A fresh document for the view (a hash change alone would keep the page that is already open).
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await send('Page.navigate', { url: `${PAGE}#/${hash}` })
  await sleep(wait)
  if (act) {
    await send('Runtime.evaluate', { expression: act })
    await sleep(800)
  }
  if (scrollTo) {
    // The web app scrolls its content card, not the window, on desktop: scroll whatever holds the element.
    await send('Runtime.evaluate', { expression: `(() => { const el = document.querySelector(${JSON.stringify(scrollTo)}); if (el) el.scrollIntoView({ block: 'start' }); })()` })
  }
  if (scrollText) {
    await send('Runtime.evaluate', { expression: `(() => { const el = [...document.querySelectorAll('h2,h3')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(scrollText)})); if (el) el.scrollIntoView({ block: 'start' }); })()` })
  }
  if (scrollBy) await send('Runtime.evaluate', { expression: `(() => { const c = document.querySelector('#app-main') || document.scrollingElement; c.scrollBy(0, ${scrollBy}); })()` })
  if (blur) await send('Runtime.evaluate', { expression: BLUR })
  await sleep(600)
  // Where the numbered markers of the manual go: each mark is [number, CSS selector, text]; the
  // smallest visible element matching both is taken. Saved next to the picture, in CSS pixels.
  const found = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(${JSON.stringify(marks)}).map(([n, sel, text]) => {
      const vis = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      const hits = [...document.querySelectorAll(sel || 'body *')]
        .filter((el) => !text || el.textContent.replace(/\\s+/g, ' ').includes(text))
        .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => vis(r))
        .sort((a, b) => a[1].width * a[1].height - b[1].width * b[1].height);
      if (!hits.length) return { n, missing: true };
      const r = hits[0][1];
      return { n, x: r.left, y: r.top, w: r.width, h: r.height };
    })`,
  })
  const placed = found.result.value
  for (const m of placed) if (m.missing) console.log(`  ! ${name}: mark ${m.n} not found`)
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ width, height, marks: placed }))
  const { data: png } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png, 'base64'))
  console.log(`  ${name}.png`)
}

try {
  await connect()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await interceptBackend()
  console.log(`Screenshots from ${PAGE}`)
  if (SET === 'phone') {
    const phone = { as: 'lecturer', width: 390, height: 844, scale: 2, mobile: true, hash: 'me' }
    const click = (sel, text = '') => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)})); el && el.click(); })()`
    await shot('m-me', phone)
    await shot('m-me-level', { ...phone, act: click('.mme-row', 'ป.เอก') })
    await shot('m-me-works', { ...phone, scrollTo: '.mme-chips' })
    await shot('m-me-work-open', { ...phone, act: click('.mme-work'), scrollTo: '.mme-chips' })
    await shot('m-me-not', { ...phone, act: click('.mme-chips button', 'ไม่นับ'), scrollTo: '.mme-chips' })
    await shot('m-me-sheet', { ...phone, act: click('.mme-fab') })
    const chair = { as: 'chair', width: 390, height: 844, scale: 2, mobile: true }
    await shot('m-overview', { hash: 'overview', width: 390, height: 844, scale: 2, mobile: true })
    await shot('m-overview-2', { hash: 'overview', width: 390, height: 844, scale: 2, mobile: true, scrollBy: 700 })
    await shot('m-lecturers', { ...chair, hash: 'lecturers', blur: true })
    await shot('m-lecturers-fail', { ...chair, hash: 'lecturers?filter=not_met', blur: true })
    await shot('m-person', { ...chair, hash: `person/${encodeURIComponent(EXAMPLE.nameEn)}` })
    const admin = { as: 'admin', width: 390, height: 844, scale: 2, mobile: true, blur: true }
    for (const page of ['inbox', 'forms', 'outlook', 'sources', 'history']) await shot(`m-admin-${page}`, { ...admin, hash: page })
  } else {
  // อาจารย์ทั่วไป
  await shot('g-overview', { hash: 'overview', marks: [[1, '#app-side a', 'ภาพรวม'], [2, '.app-window-chip'], [3, 'button', 'ปีการศึกษา 2569'], [4, 'button,a', 'เข้าสู่ระบบผู้ดูแล'], [5, 'p', 'ผ่านเกณฑ์ครบทุกหน้าที่'], [6, 'p', 'ยังไม่ผ่านเกณฑ์บางหน้าที่'], [7, '*', 'อาจารย์ทั้งหมด'], [8, '*', 'ผลงานรวมที่นับได้']] })
  await shot('g-overview-charts', { hash: 'overview', scrollText: 'สัดส่วนอาจารย์ตามผลการประเมิน', marks: [[1, 'h2,h3', 'สัดส่วนอาจารย์ตามผลการประเมิน'], [2, 'h2,h3', 'จำนวนอาจารย์ที่ผ่านแต่ละหน้าที่'], [3, 'h2,h3', 'จำนวนผลงานต่อปี'], [4, 'button', 'แยกตามคุณภาพ']] })
  await shot('g-login', { hash: 'me', marks: [[1, 'input[type=email]'], [2, 'label', 'จำเครื่องนี้'], [3, 'button', 'ส่งลิงก์'], [4, 'li', 'ใส่อีเมลมหาวิทยาลัย']] })
  await shot('g-me-top', { hash: 'me', as: 'lecturer', marks: [[1, '.me-bar', 'เข้าสู่ระบบเป็น'], [2, 'button', 'ออกจากระบบ'], [3, '*', 'ตำแหน่งวิชาการ'], [4, 'h2', 'ผลตามหน้าที่'], [5, 'button', 'ดาวน์โหลด CSV'], [6, 'th', 'เหตุผล']] })
  await shot('g-me-works', { hash: 'me', as: 'lecturer', scrollText: 'ผลงานที่นับ', marks: [[1, 'h2', 'ผลงานที่นับ'], [2, 'label', 'แสดงทุกปี'], [3, 'button', 'ดาวน์โหลด CSV'], [4, 'th', 'ประเภท'], [5, 'th', 'นับ']] })
  await shot('g-me-add', { hash: 'me', as: 'lecturer', scrollTo: '.add-work', marks: [[1, 'h2', 'เพิ่มผลงานของฉัน'], [2, 'label', 'ปีที่ตีพิมพ์'], [3, 'label', 'ประเภทผลงาน'], [4, 'label', 'ชื่อวารสารหรืองานประชุม'], [5, '*', 'เป็นงานวิจัยหรือไม่'], [6, 'button', 'ส่งผลงานเพื่อรออนุมัติ']] })
  await shot('g-me-mine', { hash: 'me', as: 'lecturer', scrollText: 'ผลงานที่ฉันเพิ่ม', marks: [[1, 'h3', 'ผลงานที่ฉันเพิ่ม']] })
  await shot('g-mobile', { hash: 'overview', width: 390, height: 844, scale: 2, mobile: true })
  await shot('g-mobile-me', { hash: 'me', as: 'lecturer', width: 390, height: 844, scale: 2, mobile: true })
  // ประธานหลักสูตร
  await shot('c-gate', { hash: 'login', marks: [[1, 'button,a', 'เข้าสู่ระบบผู้ดูแล'], [2, 'input[type=password]'], [3, 'label', 'จำรหัส'], [4, 'button', 'เข้าสู่ส่วนผู้ดูแล']] })
  await shot('c-lecturers', { hash: 'lecturers', as: 'chair', blur: true, marks: [[1, '#app-side a', 'ผลงานอาจารย์'], [2, '*', 'ประธานหลักสูตร'], [3, 'button', 'ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน'], [4, 'button', 'ผลการประเมินรายบุคคลตามหน้าที่'], [5, 'button', 'ดาวน์โหลด CSV'], [6, 'button', 'พิมพ์'], [7, 'button', 'ระดับบัณฑิตศึกษา'], [8, 'button', 'แยกตามประเภทผลงาน']] })
  await shot('c-lecturers-chart', { hash: 'lecturers', as: 'chair', blur: true, scrollBy: 760 })
  await shot('c-lecturers-eval', { hash: 'lecturers?filter=not_met&scope=grad', as: 'chair', blur: true, marks: [[1, 'button', 'มีหน้าที่ไม่ผ่าน'], [2, 'button', 'บัณฑิตศึกษา'], [3, 'button', 'คอลัมน์'], [4, 'button', 'ตาราง']] })
  await shot('c-lecturers-fail', { hash: 'lecturers?filter=not_met&scope=grad', as: 'chair', blur: true, scrollBy: 760 })
  await shot('c-lecturers-table', { hash: 'lecturers?view=table', as: 'chair', blur: true, scrollBy: 760 })
  await shot('c-person', { hash: `person/${encodeURIComponent(EXAMPLE.nameEn)}`, as: 'chair', marks: [[1, 'a', 'รายชื่ออาจารย์'], [2, '*', 'ตำแหน่งวิชาการ'], [3, 'h2', 'ผลตามหน้าที่'], [4, 'button', 'ดาวน์โหลด CSV']] })
  }
} finally {
  try {
    ws?.close()
  } catch {
    /* already closed */
  }
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
