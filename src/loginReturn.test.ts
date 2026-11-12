import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOGIN_RETURN_KEY, rememberLoginReturn } from './emailLogin'
import buildPersonal from '../scripts/build-personal.mjs?raw'

const fakeStorage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

// The inline script of dist/me/index.html, as written by scripts/build-personal.mjs.
const forwarder = /<script>(var m=location\.hash[\s\S]*?)<\/script>/.exec(buildPersonal)![1]
function forward(hash: string, stored: string | null): string {
  let target = ''
  const location = { hash, replace: (u: string) => (target = u) }
  const localStorage = { getItem: () => stored }
  new Function('location', 'localStorage', forwarder)(location, localStorage)
  return target
}

describe('login link returns to the page that asked for it', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('remembers sfs_webapp.html or sfs.html, and anything else as sfs.html', () => {
    const s = fakeStorage()
    vi.stubGlobal('localStorage', s)
    rememberLoginReturn('/seen-faculty-screening/sfs_webapp.html')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs_webapp.html')
    rememberLoginReturn('/seen-faculty-screening/sfs.html')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs.html')
    // Cloudflare Pages serves the pages without ".html".
    rememberLoginReturn('/sfs_webapp')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs_webapp.html')
    rememberLoginReturn('/sfs')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs.html')
    rememberLoginReturn('/other')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs.html')
    rememberLoginReturn('/seen-faculty-screening/')
    expect(s.getItem(LOGIN_RETURN_KEY)).toBe('sfs.html')
  })
  it('/me/ forwards with the login code to the web app, whatever page asked for the link', () => {
    for (const stored of ['sfs_webapp.html', 'sfs.html', null, 'https://evil.example/']) expect(forward('#login=ab12', stored)).toBe('../sfs_webapp.html#/me/login=ab12')
    expect(forward('', null)).toBe('../sfs_webapp.html#/me')
    expect(forward('#login=NOT-HEX', null)).toBe('../sfs_webapp.html#/me')
  })
  it('the bare address forwards to the web app and keeps the route', () => {
    expect(buildPersonal).toContain("location.replace('sfs_webapp.html'+location.search+location.hash)")
  })
})

// The backend picks the site for the login link from its own list (apps-script/Code.gs).
import gsSource from '../apps-script/Code.gs?raw'
import { api, siteAddress } from './emailLogin'

describe('login link goes back to the site that asked', () => {
  const { siteOf, siteAt, siteNote, SITE, SITES } = new Function(`${gsSource}\nreturn { siteOf, siteAt, siteNote, SITE, SITES }`)() as {
    siteOf: (v: unknown) => string
    siteAt: (v: unknown) => string
    siteNote: (v: unknown) => string
    SITE: string
    SITES: string[]
  }
  const GITHUB = 'https://smalltee2.github.io/seen-faculty-screening/'
  it('knows both published addresses, the main one first', () => {
    expect(SITES).toEqual(['https://seen-education-service.pages.dev/', GITHUB])
    expect(SITES[0]).toBe(SITE)
  })
  it('answers the site that asked when it is one of ours', () => {
    expect(siteOf(siteAddress('https://smalltee2.github.io', '/seen-faculty-screening/'))).toBe(GITHUB)
    expect(siteOf(siteAddress('https://seen-education-service.pages.dev', '/'))).toBe(SITE)
  })
  it('falls back to the main address for anything else', () => {
    for (const v of [undefined, null, '', 42, {}, 'http://localhost:5173/seen-faculty-screening/', 'https://evil.example/', `${GITHUB}x`, `${GITHUB}@evil.example/`, 'https://smalltee2.github.io/'])
      expect(siteOf(v)).toBe(SITE)
  })
  it('the รับทราบ link carries the site as a number in the list, and nothing else picks a site', () => {
    expect(siteAt('1')).toBe(GITHUB)
    for (const v of [undefined, null, '', '0', '2', '-1', '1.5', '01', 'x', GITHUB, 'https://evil.example/']) expect(siteAt(v)).toBe(SITE)
  })
  it('the log says where a link goes and whether the page named the site', () => {
    expect(siteNote(GITHUB)).toBe('link to smalltee2.github.io (sent)')
    expect(siteNote(SITE)).toBe('link to seen-education-service.pages.dev (sent)')
    expect(siteNote(undefined)).toBe('link to seen-education-service.pages.dev (default)')
    expect(siteNote('https://evil.example/')).toBe('link to seen-education-service.pages.dev (default)')
  })
  it('every request to the backend carries the page\'s own address', async () => {
    expect(siteAddress('', '/')).toBe('') // outside a browser
    const sent: Record<string, unknown>[] = []
    vi.stubGlobal('window', { location: { origin: 'https://smalltee2.github.io' } })
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ ok: true }) }
    })
    await api({ action: 'notify', nameEn: 'A B' })
    await api({ action: 'request', email: 'x@up.ac.th', site: 'https://other.example/' })
    vi.unstubAllGlobals()
    expect(sent[0]).toEqual({ site: `https://smalltee2.github.io${import.meta.env.BASE_URL}`, action: 'notify', nameEn: 'A B' })
    expect(sent[1].site).toBe('https://other.example/') // a caller's own value is kept
  })
})
