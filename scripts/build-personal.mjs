// "ตรวจสอบคุณสมบัติของฉัน" is a tab of the main site (#/me, src/pages/MyPage.tsx). The login
// e-mail (apps-script/Code.gs) links to /me/#login=<code>; this writes dist/me/index.html,
// a small page that forwards to ../#/me/login=<code>, so links in e-mails already sent keep working.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
mkdirSync(join(DIST, 'me'), { recursive: true })
writeFileSync(
  join(DIST, 'me/index.html'),
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>ตรวจสอบคุณสมบัติของฉัน</title>
<script>var m=location.hash.match(/^#login=([0-9a-f]+)$/);location.replace('../#/me'+(m?'/login='+m[1]:''));</script></head>
<body><p><a href="../#/me">ไปที่ ตรวจสอบคุณสมบัติของฉัน</a></p></body></html>\n`,
)
console.log('[personal] dist/me/index.html forwards to #/me')
