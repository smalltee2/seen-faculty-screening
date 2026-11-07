// Reminder e-mails to lecturers who fail a duty now ("fail") or may fail next year ("risk"),
// sent from the lecturer list by a level-2 admin (Tum, 2026-11-07). The login backend
// (apps-script/Code.gs, action "notify") looks the address up in its private users sheet, so
// no e-mail address is ever in the public site; it keeps a log the site reads ("noticeList").
import { api, sessionStore } from './emailLogin'
import { ROLES, nextYearRisk, toBE, type PersonResult, type Settings } from './rules'
import { SHOWN_ROLES, displayName, isShownLevel } from './ui'

export type NoticeKind = 'fail' | 'risk'
export interface Notice {
  at: string
  nameEn: string
  kind: NoticeKind
  by: string
  /** When the lecturer clicked the รับทราบ link in the e-mail; '' until then. */
  ackAt?: string
}

export async function fetchNotices(): Promise<Notice[]> {
  try {
    const r = await api({ action: 'noticeList' })
    return r.ok && Array.isArray(r.items) ? (r.items as Notice[]) : []
  } catch {
    return []
  }
}

/** Which reminder a lecturer needs: failing a shown duty now wins over next-year risk; null when neither. */
export function noticeKind(r: PersonResult, settings: Settings): NoticeKind | null {
  if (SHOWN_ROLES.some((role) => r.roles[role.id].status === 'not_met')) return 'fail'
  if (nextYearRisk(r, settings).some((role) => isShownLevel(role.level))) return 'risk'
  return null
}

/** The reason a duty failed: the output line ("ต้องการ … ; มี …") when the qualification passed,
 *  otherwise every line (review, 2026-11-07: reasons[0] is always the qualification line). */
export const failReason = (reasons: string[]): string => {
  const rest = reasons.filter((x) => !x.startsWith('คุณวุฒิ:'))
  return (rest.length ? rest : reasons).join('; ')
}

const levelTh = (level: string) => (level === 'ba' ? 'ปริญญาตรี' : level === 'ms' ? 'ปริญญาโท' : level === 'phd' ? 'ปริญญาเอก' : level)

/** Subject and body of the reminder, built from the lecturer's own result (plain text, Thai). */
export function buildNotice(r: PersonResult, settings: Settings, kind: NoticeKind): { subject: string; body: string } {
  const Y = toBE(settings.year)
  const window = `พ.ศ. ${toBE(settings.year - 4)}–${Y} (ค.ศ. ${settings.year - 4}–${settings.year})`
  const c = r.roles.ms_program.counts
  const name = displayName(r.person)
  const lines: string[] = [`เรียน ${name}`, '']
  if (kind === 'fail') {
    const failing = ROLES.filter((role) => isShownLevel(role.level) && r.roles[role.id].status === 'not_met')
    lines.push(`จากการตรวจสอบคุณสมบัติอาจารย์ปีการประเมิน พ.ศ. ${Y} ท่านยังไม่ผ่านเกณฑ์ในหน้าที่ต่อไปนี้:`)
    for (const role of failing) lines.push(`  • ${levelTh(role.level)} ข้อ ${role.clause} ${role.labelTh}: ${failReason(r.roles[role.id].reasons)}`)
  } else {
    const risk = nextYearRisk(r, settings).filter((role) => isShownLevel(role.level))
    lines.push(`จากการตรวจสอบคุณสมบัติอาจารย์ ปัจจุบัน (พ.ศ. ${Y}) ท่านผ่านเกณฑ์ แต่หากไม่มีผลงานเพิ่มภายในปี พ.ศ. ${toBE(settings.year + 1)} จะไม่ผ่านเกณฑ์ในหน้าที่ต่อไปนี้:`)
    for (const role of risk) lines.push(`  • ${levelTh(role.level)} ข้อ ${role.clause} ${role.labelTh}`)
  }
  lines.push('')
  lines.push(`ผลงานของท่านที่นับได้ในช่วง ${window}: ${c.total} เรื่อง (งานวิจัย ${c.research} เรื่อง)`)
  lines.push('ผลงานที่นับ ได้แก่ บทความในวารสาร และ proceedings/โปสเตอร์/บทคัดย่อในงานประชุมที่จัดโดยสมาคมวิชาการหรือวิชาชีพในสาขาสิ่งแวดล้อม/พลังงาน')
  lines.push('')
  lines.push('หากท่านมีผลงานที่ยังไม่ปรากฏในระบบ กรุณาเพิ่มได้ที่แถบ "ตรวจสอบคุณสมบัติของฉัน" (เข้าสู่ระบบด้วยอีเมล @up.ac.th) หรือแจ้งผู้ดูแลระบบของคณะ')
  const subject = kind === 'fail' ? `[SEEN] แจ้งเตือน: คุณสมบัติอาจารย์ยังไม่ผ่านเกณฑ์บางหน้าที่ (พ.ศ. ${Y})` : `[SEEN] แจ้งเตือน: ปี พ.ศ. ${toBE(settings.year + 1)} อาจไม่ผ่านเกณฑ์หากไม่มีผลงานเพิ่ม`
  return { subject, body: lines.join('\n') }
}

export async function sendNotice(r: PersonResult, settings: Settings, kind: NoticeKind, approvalKey?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subject, body } = buildNotice(r, settings, kind)
  try {
    const res = await api({ action: 'notify', adminKey: approvalKey ?? '', session: sessionStore.get(), nameEn: r.person.nameEn, kind, subject, body })
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  } catch {
    return { ok: false, error: '' }
  }
}

/** Latest reminder of each kind per lecturer. */
export function lastNotice(notices: Notice[], nameEn: string, kind: NoticeKind): Notice | null {
  let best: Notice | null = null
  for (const n of notices) if (n.nameEn === nameEn && n.kind === kind && (!best || n.at > best.at)) best = n
  return best
}
