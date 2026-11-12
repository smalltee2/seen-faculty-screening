// "ตรวจสอบคุณสมบัติของฉัน" is a tab of the main site (#/me, src/pages/MyPage.tsx). The login
// e-mail (apps-script/Code.gs) links to /me/#login=<code>; this writes dist/me/index.html,
// a small page that forwards to ../#/me/login=<code>, so links in e-mails already sent keep working.
// It forwards to the web app, sfs_webapp.html, the site's main page since 2026-11-12 (Tum): a link
// opened on another device than the one that asked for it used to land on the older sfs.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
mkdirSync(join(DIST, 'me'), { recursive: true })
writeFileSync(
  join(DIST, 'me/index.html'),
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>ตรวจสอบคุณสมบัติของฉัน</title>
<script>var m=location.hash.match(/^#login=([0-9a-f]+)$/);location.replace('../sfs_webapp.html#/me'+(m?'/login='+m[1]:''));</script></head>
<body><p><a href="../sfs_webapp.html#/me">ไปที่ ตรวจสอบคุณสมบัติของฉัน</a></p></body></html>\n`,
)
console.log('[personal] dist/me/index.html forwards to #/me on sfs_webapp.html')

// The site's address is …/seen-faculty-screening/sfs.html (Tum, 2026-11-08): the page for real use,
// whose data-years makes the year menu offer only the current and the next year (src/App.tsx →
// REAL_USE). sfs-test.html is the same app with the full year range. index.html and sfs-real.html
// only forward to the main page, sfs_webapp.html since 2026-11-12, keeping ?query and #route, so
// the old address and every link already sent (e-mails, manual, bookmarks) still open the right page.
const app = readFileSync(join(DIST, 'index.html'), 'utf8')
if (!/<html[^>]*>/.test(app)) throw new Error('[personal] dist/index.html has no <html> tag')
writeFileSync(join(DIST, 'sfs.html'), app.replace(/<html([^>]*)>/, '<html$1 data-years="current-next">'))
writeFileSync(join(DIST, 'sfs-test.html'), app)
const forward = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ระบบตรวจสอบคุณสมบัติอาจารย์ SEEN</title>
<link rel="canonical" href="sfs_webapp.html">
<script>location.replace('sfs_webapp.html'+location.search+location.hash);</script></head>
<body><p><a href="sfs_webapp.html">ไปที่ระบบตรวจสอบคุณสมบัติอาจารย์</a></p></body></html>\n`
writeFileSync(join(DIST, 'index.html'), forward)
writeFileSync(join(DIST, 'sfs-real.html'), forward)
console.log('[personal] dist/sfs.html (current and next year) and dist/sfs-test.html (all years) are the older layout; index.html and sfs-real.html forward to sfs_webapp.html, the main page')
