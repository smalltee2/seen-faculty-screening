// One log of every admin press (Tum, 2026-11-10): conference นับ/ไม่นับ, approval of self-submitted
// works, cancel/restore of admin-form works, reminder e-mails, and lecturers' withdrawals. Each
// entry says who, when and why; the latest press per item carries the call that undoes it.
import type { ConfDecision, ConfDecisionItem } from './confDecisions'
import { api } from './emailLogin'
import { formKey, type FormCancelItem } from './formCancel'
import type { Notice } from './notify'
import { STATUS_TH, type Submission } from './submissions'
import { byWhenAsc, byWhenDesc } from './when'

/** A row of the backend's log sheet for works: who approved, rejected, reopened or withdrew which id. */
export interface DecisionLogItem {
  at: string
  action: 'decide' | 'withdraw'
  by: string
  id: string
  status: string
}

/** null = the backend does not have the action yet (older deployment) or is unreachable. */
export async function fetchDecisionLog(): Promise<DecisionLogItem[] | null> {
  try {
    const r = await api({ action: 'decisionLog' })
    return r.ok && Array.isArray(r.items) ? (r.items as DecisionLogItem[]) : null
  } catch {
    return null
  }
}

/** The backend call that puts an item back to its state before the press (session and key are added by the page). */
export type Undo =
  | { action: 'confDecide'; key: string; decision: ConfDecision; name: string }
  | { action: 'decide'; id: string; status: 'pending' }
  | { action: 'formCancel'; nameEn: string; title: string; mode: 'cancel' | 'restore' }

export type HistoryKind = 'conference' | 'submission' | 'form' | 'notice'

export interface HistoryEntry {
  at: string
  kind: HistoryKind
  by: string
  /** What was pressed, in Thai. */
  action: string
  /** The conference, work or lecturer it was pressed on. */
  target: string
  note: string
  undo?: Undo
  /** What the undo does, for the button's label and confirmation. */
  undoLabel?: string
}

export const KIND_TH: Record<HistoryKind, string> = {
  conference: 'งานประชุม',
  submission: 'ผลงานที่อาจารย์เพิ่มเอง',
  form: 'ผลงานจากแบบฟอร์มผู้ดูแล',
  notice: 'อีเมลแจ้งเตือน',
}

const CONF_TH: Record<string, string> = { count: 'นับ', no_count: 'ไม่นับ', clear: 'ล้างการตัดสิน (ใช้ผลอัตโนมัติ)' }
const DECIDE_TH: Record<string, string> = { approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', pending: 'ยกเลิกการตัดสิน (กลับเป็นรออนุมัติ)' }
const byTime = <T extends { at: string }>(items: T[]) => [...items].sort((a, b) => byWhenAsc(a.at, b.at))

export function buildHistory(input: {
  confItems: ConfDecisionItem[]
  formCancels: FormCancelItem[]
  submissions: Submission[]
  /** null when the backend cannot give the full log: then only the latest decision per work is known. */
  decisionLog: DecisionLogItem[] | null
  notices: Notice[]
  /** Display name per lecturer (nameEn → Thai name). */
  nameOf?: (nameEn: string) => string
}): HistoryEntry[] {
  const nameOf = input.nameOf ?? ((n: string) => n)
  const out: HistoryEntry[] = []

  // Conferences: every press is kept by the backend; undo re-applies the decision before the latest one.
  const confByKey = new Map<string, ConfDecisionItem[]>()
  for (const it of byTime(input.confItems)) confByKey.set(it.key, [...(confByKey.get(it.key) ?? []), it])
  for (const list of confByKey.values()) {
    list.forEach((it, i) => {
      const e: HistoryEntry = { at: it.at, kind: 'conference', by: it.by, action: CONF_TH[it.decision] ?? it.decision, target: it.name || it.key, note: it.note }
      if (i === list.length - 1) {
        const before: ConfDecision = i > 0 ? list[i - 1].decision : 'clear'
        if (before !== it.decision) {
          e.undo = { action: 'confDecide', key: it.key, decision: before, name: it.name }
          e.undoLabel = before === 'clear' ? 'กลับไปใช้ผลอัตโนมัติ' : `กลับเป็น "${CONF_TH[before]}"`
        }
      }
      out.push(e)
    })
  }

  // Admin-form works: undo is the opposite press.
  const formByKey = new Map<string, FormCancelItem[]>()
  for (const it of byTime(input.formCancels)) {
    const k = formKey(it.nameEn, it.titleNorm)
    formByKey.set(k, [...(formByKey.get(k) ?? []), it])
  }
  for (const list of formByKey.values()) {
    list.forEach((it, i) => {
      const e: HistoryEntry = {
        at: it.at, kind: 'form', by: it.by, action: it.action === 'cancel' ? 'ยกเลิกผลงาน' : 'นำผลงานกลับมา', target: `${nameOf(it.nameEn)} — ${it.title}`, note: '',
      }
      if (i === list.length - 1) {
        const mode = it.action === 'cancel' ? 'restore' : 'cancel'
        e.undo = { action: 'formCancel', nameEn: it.nameEn, title: it.title, mode }
        e.undoLabel = mode === 'restore' ? 'นำผลงานกลับมา' : 'ยกเลิกผลงานอีกครั้ง'
      }
      out.push(e)
    })
  }

  // Self-submitted works. The submissions sheet keeps only the latest decision; the log sheet has every press.
  const subById = new Map(input.submissions.map((s) => [s.id, s]))
  const subTarget = (id: string) => {
    const s = subById.get(id)
    return s ? `${nameOf(s.nameEn)} — ${s.title}` : `ผลงานรหัส ${id}`
  }
  const undoable = (s: Submission | undefined) => !!s && (s.status === 'approved' || s.status === 'rejected')
  if (input.decisionLog) {
    const lastDecide = new Map<string, DecisionLogItem>()
    for (const it of byTime(input.decisionLog)) if (it.action === 'decide') lastDecide.set(it.id, it)
    for (const it of input.decisionLog) {
      const s = subById.get(it.id)
      const e: HistoryEntry = {
        at: it.at,
        kind: 'submission',
        by: it.by,
        action: it.action === 'withdraw' ? 'อาจารย์ถอนผลงาน' : (DECIDE_TH[it.status] ?? it.status),
        target: subTarget(it.id),
        // The note belongs to the decision that is still in force.
        note: s && lastDecide.get(it.id) === it && it.status === s.status ? s.note : '',
      }
      if (it.action === 'decide' && lastDecide.get(it.id) === it && it.status !== 'pending' && undoable(s) && s!.status === it.status) {
        e.undo = { action: 'decide', id: it.id, status: 'pending' }
        e.undoLabel = 'กลับเป็นรออนุมัติ'
      }
      out.push(e)
    }
  } else {
    for (const s of input.submissions) {
      if (!s.decidedAt || !undoable(s)) continue
      out.push({
        at: s.decidedAt, kind: 'submission', by: '', action: STATUS_TH[s.status], target: subTarget(s.id), note: s.note,
        undo: { action: 'decide', id: s.id, status: 'pending' }, undoLabel: 'กลับเป็นรออนุมัติ',
      })
    }
  }

  for (const n of input.notices)
    out.push({ at: n.at, kind: 'notice', by: n.by, action: n.kind === 'fail' ? 'ส่งอีเมลแจ้งไม่ผ่านเกณฑ์' : 'ส่งอีเมลแจ้งความเสี่ยงปีหน้า', target: nameOf(n.nameEn), note: n.ackAt ? 'อาจารย์กดรับทราบแล้ว' : '' })

  return out.sort((a, b) => byWhenDesc(a.at, b.at))
}
