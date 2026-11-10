// Per-programme qualification report for มคอ.7 / AUN-QA (Tum, 2026-11-10): every lecturer of the
// programme against each duty of that level, with the works that support the result, and a Word
// file in TH SarabunPSK. The numbers come from the same evaluation the site shows.
import { LEVELS, ROLES, toBE, windowYears, type PersonResult, type RoleSpec, type Settings, type Status } from './rules'
import type { Programme, ProgrammeMember, Pub } from './types'
import { STATUS_LABEL, TYPE_LABEL, displayName, roleShort } from './ui'
import { failReason } from './notify'

export interface ReportRow {
  member: ProgrammeMember
  /** undefined when the member is not in faculty.csv (no evaluation). */
  result?: PersonResult
  name: string
  degree: string
  statuses: Record<string, Status | null>
  /** Works counted for at least one duty of this level, newest first. */
  works: Pub[]
  /** Reason per duty that is not met. */
  failed: { role: RoleSpec; reason: string }[]
}

export interface ProgrammeReport {
  programme: Programme
  level: (typeof LEVELS)[number]
  roles: RoleSpec[]
  window: [number, number]
  rows: ReportRow[]
  /** Responsible-lecturer check: the named responsible lecturers, or everyone listed when none is named. */
  responsible: { pool: number; met: number; required: number; named: boolean }
}

const degreeText = (r: PersonResult) => {
  const p = r.person
  if (!p.degree) return '—'
  return [p.degree, p.degreeField, p.degreeYear ? `พ.ศ. ${toBE(p.degreeYear)}` : ''].filter(Boolean).join(' · ')
}

export function programmeReport(programme: Programme, results: PersonResult[], settings: Settings): ProgrammeReport {
  const level = LEVELS.find((l) => l.id === programme.level)!
  const roles = ROLES.filter((r) => r.level === programme.level)
  const rows: ReportRow[] = programme.members.map((member) => {
    const result = results.find((x) => x.person.nameEn === member.nameEn)
    const seen = new Set<string>()
    const works: Pub[] = []
    const failed: ReportRow['failed'] = []
    const statuses: ReportRow['statuses'] = {}
    for (const role of roles) {
      const rr = result?.roles[role.id]
      statuses[role.id] = rr ? rr.status : null
      if (!rr) continue
      if (rr.status !== 'met') failed.push({ role, reason: failReason(rr.reasons) })
      for (const e of rr.used) {
        if (seen.has(e.pub.id)) continue
        seen.add(e.pub.id)
        works.push(e.pub)
      }
    }
    works.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
    return { member, result, name: result ? displayName(result.person) : member.nameEn, degree: result ? degreeText(result) : '—', statuses, works, failed }
  })
  const named = rows.filter((r) => r.member.responsible)
  const pool = named.length ? named : rows
  return {
    programme,
    level,
    roles,
    window: windowYears(settings.year),
    rows,
    responsible: { pool: pool.length, met: pool.filter((r) => r.statuses[level.responsible] === 'met').length, required: level.minResponsible, named: named.length > 0 },
  }
}

const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One work as a reference line. */
export function workLine(p: Pub): string {
  const bits = [p.authors ? `${p.authors}.` : '', p.year !== null ? `(${p.year}).` : '', `${p.title}.`, p.venue ? `${p.venue}.` : '', p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : '']
  return bits.filter(Boolean).join(' ')
}

const FONT = `'TH SarabunPSK','TH Sarabun New',Sarabun,sans-serif`

/** The report as an HTML document that Word opens as a .doc (A4, TH SarabunPSK 16 pt). */
export function reportHtml(reports: ProgrammeReport[], meta: { year: number; builtAt: string; faculty: string }): string {
  const dataDate = new Date(meta.builtAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })
  const parts: string[] = []
  reports.forEach((rep, i) => {
    const [from, to] = rep.window
    const cell = (s: Status | null) => (s === null ? '—' : `${STATUS_LABEL[s].sym} ${STATUS_LABEL[s].th}`)
    parts.push(`<div${i > 0 ? ' style="page-break-before:always"' : ''}>`)
    parts.push(`<h1>รายงานคุณสมบัติอาจารย์ตามเกณฑ์มาตรฐานหลักสูตร</h1>`)
    parts.push(`<p class="c"><b>${esc(rep.programme.th)}</b><br>${esc(meta.faculty)}</p>`)
    parts.push(
      `<p>ระดับ${esc(rep.level.th)} (ข้อ ${esc(rep.level.clause)}) ปีที่ประเมิน พ.ศ. ${toBE(meta.year)} นับผลงานย้อนหลัง 5 ปี พ.ศ. ${toBE(from)}–${toBE(to)} (ค.ศ. ${from}–${to}) ข้อมูล ณ วันที่ ${esc(dataDate)}</p>`,
    )
    parts.push(`<h2>1. ผลการตรวจคุณสมบัติรายบุคคล</h2>`)
    parts.push(
      `<table><thead><tr><th>ที่</th><th>ชื่อ–สกุล</th><th>ตำแหน่งในหลักสูตร</th><th>คุณวุฒิสูงสุด</th>${rep.roles.map((r) => `<th>${esc(roleShort(r.id))}<br>(ข้อ ${esc(r.clause)})</th>`).join('')}</tr></thead><tbody>`,
    )
    rep.rows.forEach((row, n) => {
      const pos = row.member.role + (row.member.responsible ? ' / อาจารย์ผู้รับผิดชอบหลักสูตร' : '')
      parts.push(
        `<tr><td class="c">${n + 1}</td><td>${esc(row.name)}</td><td>${esc(pos)}</td><td>${esc(row.degree)}</td>${rep.roles.map((r) => `<td class="c">${esc(cell(row.statuses[r.id]))}</td>`).join('')}</tr>`,
      )
    })
    parts.push(`</tbody></table>`)
    const rs = rep.responsible
    parts.push(
      `<p>${rs.named ? 'อาจารย์ผู้รับผิดชอบหลักสูตรตามที่ระบุ' : 'อาจารย์ในหลักสูตร'} ${rs.pool} คน ผ่านคุณสมบัติอาจารย์ผู้รับผิดชอบหลักสูตร (ข้อ ${esc(rep.level.clause)}.2) ${rs.met} คน เกณฑ์กำหนดอย่างน้อย ${rs.required} คน</p>`,
    )
    parts.push(`<h2>2. ผลงานทางวิชาการที่ใช้ประกอบการพิจารณา</h2>`)
    rep.rows.forEach((row, n) => {
      parts.push(`<h3>${n + 1}. ${esc(row.name)}</h3>`)
      if (!row.result) {
        parts.push(`<p>ไม่มีข้อมูลในระบบ</p>`)
        return
      }
      if (row.works.length === 0) parts.push(`<p>ไม่มีผลงานที่นับได้ในช่วง พ.ศ. ${toBE(from)}–${toBE(to)}</p>`)
      else
        parts.push(
          `<ol>${row.works.map((p) => `<li>${esc(workLine(p))} [${esc(TYPE_LABEL[p.type])}${p.isResearch ? ' · ผลงานวิจัย' : ''}]</li>`).join('')}</ol>`,
        )
      for (const f of row.failed) parts.push(`<p class="f">ยังไม่ผ่าน ${esc(roleShort(f.role.id))} (ข้อ ${esc(f.role.clause)}): ${esc(f.reason)}</p>`)
    })
    parts.push(`</div>`)
  })
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>รายงานคุณสมบัติอาจารย์</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: 21cm 29.7cm; margin: 2.54cm 2.54cm 2.54cm 3cm; }
body, p, td, th, li { font-family: ${FONT}; font-size: 16pt; line-height: 1.15; }
h1 { font-family: ${FONT}; font-size: 20pt; text-align: center; margin: 0 0 6pt; }
h2 { font-family: ${FONT}; font-size: 18pt; margin: 12pt 0 4pt; }
h3 { font-family: ${FONT}; font-size: 16pt; margin: 8pt 0 2pt; }
p { margin: 0 0 6pt; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1pt solid #000; padding: 2pt 4pt; vertical-align: top; font-size: 14pt; }
th { text-align: center; }
.c { text-align: center; }
.f { margin-left: 1cm; }
</style></head>
<body>
${parts.join('\n')}
</body></html>`
}

/** Save the HTML as a .doc file (Word opens it and keeps the fonts and tables). */
export function downloadWord(filename: string, html: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
