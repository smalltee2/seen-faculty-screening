import { describe, expect, it } from 'vitest'
import { parseWebAppHash } from './WebApp'

describe('parseWebAppHash', () => {
  it('reads the same lecturer, person and me links as sfs.html', () => {
    expect(parseWebAppHash('#/lecturers?filter=not_met&prog=x')).toMatchObject({ page: 'lecturers' })
    expect(parseWebAppHash('#/lecturers?filter=not_met&prog=x').query?.get('prog')).toBe('x')
    expect(parseWebAppHash('#/person/Chaiwat%20Photong')).toEqual({ page: 'person', id: 'Chaiwat Photong' })
    expect(parseWebAppHash('#/me/login=ab12')).toEqual({ page: 'me', login: 'ab12' })
  })
  it('opens an inbox item, and old admin links land on the matching page', () => {
    expect(parseWebAppHash('#/inbox/conf%3Avenue%3Ax')).toEqual({ page: 'inbox', id: 'conf:venue:x' })
    expect(parseWebAppHash('#/admin')).toEqual({ page: 'inbox' })
    expect(parseWebAppHash('#/admin/history')).toEqual({ page: 'history' })
  })
  it('anything unknown or malformed opens the overview', () => {
    expect(parseWebAppHash('#/nope')).toEqual({ page: 'overview' })
    expect(parseWebAppHash('#/%E0')).toEqual({ page: 'overview' })
    expect(parseWebAppHash('')).toEqual({ page: 'overview' })
  })
})

describe('sign-in page', () => {
  it('#/login is its own page', () => {
    expect(parseWebAppHash('#/login')).toEqual({ page: 'login' })
  })
})
