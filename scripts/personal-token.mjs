// Personal codes for the "ข้อมูลของฉัน" page (/me/): each lecturer gets a code derived from a
// secret salt (HMAC-SHA256 of name_en, 8 characters, shown as XXXX-XXXX). The lecturer's data
// is published at dist/p/<folder>/data.json where folder = SHA-256(code) — so only someone who
// knows the code can find the folder, and the salt never leaves the admin's Mac / the GitHub
// secret PERSONAL_SALT. src/personal.tsx computes the same folder in the browser.
import { createHash, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Crockford base32 without the ambiguous I, L, O, U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function personalCode(salt, nameEn) {
  const h = createHmac('sha256', salt).update(nameEn.trim().toLowerCase()).digest()
  let bits = 0
  let acc = 0
  let out = ''
  for (const byte of h) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5 && out.length < 8) {
      out += ALPHABET[(acc >> (bits - 5)) & 31]
      bits -= 5
    }
    if (out.length >= 8) break
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

/** Folder name for a code: SHA-256 of the normalised code (upper-case, no dash), 24 hex chars. */
export function personalFolder(code) {
  return createHash('sha256').update(code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()).digest('hex').slice(0, 24)
}

/** PERSONAL_SALT env, else the Keychain item on macOS; '' when neither exists. */
export function readSalt() {
  if (process.env.PERSONAL_SALT) return process.env.PERSONAL_SALT.trim()
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'seen-personal-salt', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
