// Builds standalone/index.html: the whole dashboard (data, CSS, JS) in one file
// that opens by double-click from disk (file://), no server needed.
// Run after editing data/: npm run standalone
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, 'standalone/.build')
const OUT = join(ROOT, 'standalone/index.html')

execFileSync('node', [join(ROOT, 'scripts/build-data.mjs')], { stdio: 'inherit' })
execFileSync(join(ROOT, 'node_modules/.bin/vite'), ['build', '--base', './', '--outDir', TMP, '--emptyOutDir', '--logLevel', 'warn'], {
  cwd: ROOT,
  stdio: 'inherit',
})

const assets = join(TMP, 'assets')
const files = readdirSync(assets)
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
const jsFiles = files.filter((f) => f.endsWith('.js'))
if (jsFiles.length !== 1) throw new Error(`expected one JS bundle, found ${jsFiles.length}: ${jsFiles.join(', ')}`)
const js = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/g, '<\\/script')

let html = readFileSync(join(TMP, 'index.html'), 'utf8')
html = html
  .replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/[^"]*"[^>]*>\s*/g, '')
  .replace('</head>', () => `<style>\n${css}\n</style>\n</head>`)
  .replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`)
  // Small files the HTML links to (the favicon) become data: URIs.
  .replace(/href="\.\/assets\/([^"]+\.png)"/g, (_, f) => `href="data:image/png;base64,${readFileSync(join(assets, f)).toString('base64')}"`)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
rmSync(TMP, { recursive: true, force: true })
console.log(`[standalone] wrote standalone/index.html (${Math.round(html.length / 1024)} KB)`)
