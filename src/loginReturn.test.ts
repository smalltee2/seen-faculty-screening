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
  it('/me/ forwards with the login code to the remembered page', () => {
    expect(forward('#login=ab12', 'sfs_webapp.html')).toBe('../sfs_webapp.html#/me/login=ab12')
    expect(forward('#login=ab12', 'sfs.html')).toBe('../sfs.html#/me/login=ab12')
  })
  it('/me/ falls back to sfs.html when nothing (or something unexpected) is stored', () => {
    expect(forward('#login=ab12', null)).toBe('../sfs.html#/me/login=ab12')
    expect(forward('#login=ab12', 'https://evil.example/')).toBe('../sfs.html#/me/login=ab12')
    expect(forward('', 'sfs_webapp.html')).toBe('../sfs_webapp.html#/me')
  })
})

// The backend picks the site for the login link from its own list (apps-script/Code.gs).
import gsSource from '../apps-script/Code.gs?raw'
import { siteAddress } from './emailLogin'

describe('login link goes back to the site that asked', () => {
  const { siteOf, SITE, SITES } = new Function(`${gsSource}\nreturn { siteOf, SITE, SITES }`)() as {
    siteOf: (v: unknown) => string
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
})
