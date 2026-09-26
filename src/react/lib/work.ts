/* Phase 2, Round 2 (0044) — content items and tasks. What the database does
   is in 0044_content_and_tasks.sql; this file is the vocabulary the screens
   share, plus the few rules the screens restate (and demo mode runs) —
   each one names the SQL it mirrors, and the two are kept in step. */
import type { PageKind, Role, TaskStatus, Tone, Workflow, WorkflowStage } from './agency'
import type { Access } from './access'
import { isOwnerLevel, type Client } from './hr'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

/** Most urgent first — the order a picker lists them in. */
export const PRIORITIES: { key: Priority; label: string; tone: Tone }[] = [
  { key: 'urgent', label: 'Urgent', tone: 'bad' },
  { key: 'high', label: 'High', tone: 'warn' },
  { key: 'normal', label: 'Normal', tone: 'mute' },
  { key: 'low', label: 'Low', tone: 'mute' },
]
export const priorityOf = (p: Priority) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[2]!

/** One reel or post (C-00001), sitting in one stage of its workflow. */
export interface ContentItem {
  id: string
  code: string
  clientId: string
  pageId: string | null
  workflowId: string
  stageId: string
  title: string
  formatId: string | null
  script: string
  scriptUrl: string
  plannedPostOn: string | null
  stageEnteredAt: string
  /** Set while it sits in a finish stage. */
  completedAt: string | null
  createdBy: string | null
  createdAt: string
}

/** Who does a role on THIS item, when the client's team has more than one. */
export interface ItemPerson {
  id: string
  itemId: string
  roleId: string
  employeeId: string
}

/** T-00001 — a stage's task (the hand-off made it) or one on its own. */
export interface Task {
  id: string
  code: string
  title: string
  description: string
  clientId: string | null
  contentItemId: string | null
  stageId: string | null
  roleId: string | null
  assigneeId: string | null
  assigneeName: string
  assigneeProfileId: string | null
  priority: Priority
  dueAt: string | null
  statusId: string
  completedAt: string | null
  /** A profile id — HR's login may have no employee record. */
  createdBy: string | null
  creatorName: string
  createdAt: string
}

/** A task's timeline: comments and what the database recorded, one list. */
export interface ThreadEntry {
  kind: 'comment' | 'event'
  id: string
  at: string
  who: string
  /** A comment's text, or an event's note ("Closed: the item moved to …"). */
  body: string
  event: 'created' | 'status' | 'assigned' | 'due' | 'priority' | null
  fromValue: string | null
  toValue: string | null
}

export interface ItemDraft {
  clientId: string
  pageId: string | null
  workflowId: string
  title: string
  formatId: string | null
  script: string
  scriptUrl: string
  plannedPostOn: string | null
  people: { roleId: string; employeeId: string }[]
}

export type ItemPatch = Partial<Pick<ContentItem, 'title' | 'pageId' | 'formatId' | 'script' | 'scriptUrl' | 'plannedPostOn'>>

export interface TaskDraft {
  title: string
  description: string
  clientId: string | null
  assigneeId: string | null
  dueAt: string | null
  priority: Priority
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'assigneeId' | 'dueAt' | 'priority' | 'statusId'>>

/* ------------------------------------------------------------------ rules */

/** can_edit_work(), restated: the owner and HR, whoever may edit the client,
 *  and anybody on its team. The database decides; this hides the buttons. */
export const canEditWorkOn = (
  ws: Parameters<typeof isOwnerLevel>[0], access: Access, c: Pick<Client, 'id' | 'departmentId'>,
) => isOwnerLevel(ws) || access.canForClient(c, 'manage_clients') || access.isOnClient(c.id)

export const doneStatusIds = (statuses: TaskStatus[]) => new Set(statuses.filter((s) => s.isDone).map((s) => s.id))

export const isOpen = (t: Task, done: Set<string>) => !done.has(t.statusId)

export const isOverdue = (t: Task, done: Set<string>, now = Date.now()) =>
  !!t.dueAt && !done.has(t.statusId) && new Date(t.dueAt).getTime() < now

/** Overdue first, then the soonest due, then the newest. */
export const byUrgency = (done: Set<string>) => (a: Task, b: Task) => {
  const oa = isOpen(a, done) ? 0 : 1
  const ob = isOpen(b, done) ? 0 : 1
  if (oa !== ob) return oa - ob
  const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
  const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
  if (da !== db) return da - db
  return b.createdAt.localeCompare(a.createdAt)
}

/** The next stage an item moves to when its stage's task is finished — the
 *  same rule task_after() runs: the next ACTIVE stage by order. */
export function nextStage(stages: WorkflowStage[], current: WorkflowStage): WorkflowStage | null {
  return stages
    .filter((s) => s.workflowId === current.workflowId && s.isActive
      && (s.sortOrder > current.sortOrder || (s.sortOrder === current.sortOrder && s.name > current.name)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0] ?? null
}

/** The stages a board shows for a workflow: the active ones in order, plus a
 *  retired one while items still sit in it (so nothing disappears). */
export function boardStages(stages: WorkflowStage[], workflowId: string, items: ContentItem[]): WorkflowStage[] {
  return stages
    .filter((s) => s.workflowId === workflowId && (s.isActive || items.some((i) => i.stageId === s.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** The roles that act in a workflow, in the order they first act. */
export function actingRoles(stages: WorkflowStage[], workflowId: string, roles: Role[]): Role[] {
  const seen: string[] = []
  for (const s of stages.filter((x) => x.workflowId === workflowId && x.isActive && !x.isDone)
    .sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (s.ownerRoleId && !seen.includes(s.ownerRoleId)) seen.push(s.ownerRoleId)
  }
  return seen.map((id) => roles.find((r) => r.id === id)).filter((r): r is Role => !!r)
}

/** Which workflow a new item on a page of this kind starts on: the first
 *  active one for that kind, else the first for any page. */
export function workflowFor(workflows: Workflow[], pageType: PageKind | null): Workflow | null {
  const live = workflows.filter((w) => w.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  return live.find((w) => pageType && w.pageType === pageType)
    ?? live.find((w) => w.pageType === null)
    ?? live[0] ?? null
}

/** Who a role on an item falls to — content_item_person()'s order: the
 *  person named on the item; for the role pages are held in, the page's
 *  holder; else the only person in that role on the client's team. */
export function personFor(o: {
  named: string | null
  isPageHolderRole: boolean
  pageHolders: string[]
  teamHolders: string[]
}): string | null {
  if (o.named) return o.named
  if (o.isPageHolderRole && o.pageHolders.length > 0) return o.pageHolders[0]!
  const team = [...new Set(o.teamHolders)]
  return team.length === 1 ? team[0]! : null
}

/* ------------------------------------------------------------------ words */

const OFFICE_TZ = 'Asia/Kolkata'

/** "28 Sep, 6:00 pm" in the office's time. */
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: OFFICE_TZ })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: OFFICE_TZ })
  return `${day}, ${time.toLowerCase().replace(/\s+/g, ' ')}`
}

/** A due time as a person reads it: "Today, 6:00 pm", "Tomorrow", a date. */
export function fmtDue(iso: string | null, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const key = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: OFFICE_TZ })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: OFFICE_TZ }).toLowerCase()
  const today = key(now)
  const tomorrow = key(new Date(now.getTime() + 86_400_000))
  const yesterday = key(new Date(now.getTime() - 86_400_000))
  const k = key(d)
  if (k === today) return `Today, ${time}`
  if (k === tomorrow) return `Tomorrow, ${time}`
  if (k === yesterday) return `Yesterday, ${time}`
  return fmtStamp(iso)
}

/** An ISO time → the value a datetime-local input takes, in this browser's time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null)

/** One timeline line, as words. */
export function eventWords(e: ThreadEntry): string {
  switch (e.event) {
    case 'created': return e.toValue ? `created it for ${e.toValue}` : 'created it — nobody holds it yet'
    case 'status': return `moved it ${e.fromValue ? `from ${e.fromValue} ` : ''}to ${e.toValue ?? '—'}`
    case 'assigned': return e.toValue ? `gave it to ${e.toValue}` : `took it off ${e.fromValue ?? 'its holder'}`
    case 'due': return e.toValue ? `set it due ${e.toValue}` : 'cleared the due date'
    case 'priority': return `set priority to ${priorityOf((e.toValue ?? 'normal') as Priority).label}`
    default: return ''
  }
}
