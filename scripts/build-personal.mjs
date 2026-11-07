// "ตรวจสอบคุณสมบัติของฉัน" is a tab of the main site (#/me, src/pages/MyPage.tsx). The login
// e-mail (apps-script/Code.gs) links to /me/#login=<code>; this writes dist/me/index.html,
// a small page that forwards to ../#/me/login=<code>, so links in e-mails already sent keep working.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
mkdirSync(join(DIST, 'me'), { recursive: true })
writeFileSync(
  join(DIST, 'me/index.html'),
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>ตรวจสอบคุณสมบัติของฉัน</title>
<script>var m=location.hash.match(/^#login=([0-9a-f]+)$/);location.replace('../sfs.html#/me'+(m?'/login='+m[1]:''));</script></head>
<body><p><a href="../sfs.html#/me">ไปที่ ตรวจสอบคุณสมบัติของฉัน</a></p></body></html>\n`,
)
console.log('[personal] dist/me/index.html forwards to #/me')

// The site's address is …/seen-faculty-screening/sfs.html (Tum, 2026-11-08). The built app is
// served as sfs.html; index.html only forwards there, keeping ?query and #route, so the old
// address and every link already sent (e-mails, manual, bookmarks) still open the right page.
const app = readFileSync(join(DIST, 'index.html'), 'utf8')
writeFileSync(join(DIST, 'sfs.html'), app)
writeFileSync(
  join(DIST, 'index.html'),
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ระบบตรวจสอบคุณสมบัติอาจารย์ SEEN</title>
<link rel="canonical" href="sfs.html">
<script>location.replace('sfs.html'+location.search+location.hash);</script></head>
<body><p><a href="sfs.html">ไปที่ระบบตรวจสอบคุณสมบัติอาจารย์</a></p></body></html>\n`,
)
console.log('[personal] dist/sfs.html is the app; dist/index.html forwards to it')
