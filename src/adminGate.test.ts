// Two-level admin passcodes: level 2 (adminGate) opens everything, level 1 (viewerGate) only
// ข้อมูลอาจารย์. Gates are built here with throwaway test passcodes, as set-admin-passcode.mjs does.
import { describe, expect, it } from 'vitest'
import { unlockAny } from './adminGate'

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64')
async function gate(pass: string, payload: object) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
  return { iterations: 1000, salt: b64(salt), iv: b64(iv), data: b64(data) }
}

describe('unlockAny', async () => {
  const admin = await gate('test-level-two', { formUrl: 'F', decisionFormUrl: 'D', level: 2 })
  const viewer = await gate('test-level-one', { level: 1 })

  it('level-2 passcode opens everything with the form links', async () => {
    expect(await unlockAny({ admin, viewer }, 'test-level-two')).toEqual({ formUrl: 'F', decisionFormUrl: 'D', level: 2 })
  })
  it('level-1 passcode opens lecturer data only, no form links', async () => {
    expect(await unlockAny({ admin, viewer }, 'test-level-one')).toEqual({ formUrl: '', decisionFormUrl: '', level: 1 })
  })
  it('a wrong passcode is rejected', async () => {
    await expect(unlockAny({ admin, viewer }, 'nope-nope')).rejects.toThrow()
  })
  it('without a level-1 gate only the admin passcode works', async () => {
    await expect(unlockAny({ admin }, 'test-level-one')).rejects.toThrow()
  })
})
