import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  demoAccess, demoClientAssignments, demoClients, demoContentItems, demoDepartments, demoEmployees, demoItemPeople, demoMe,
  demoPageAssignments, demoReviews, demoShootItems, demoShoots, demoTaskStatuses, demoTasks, demoThreads, demoVersions,
  demoWorkflowStages, isDemo,
} from '@/data/demo'
import { HR_DEPARTMENT } from '@/lib/hr'
import { agencySchema, loadTable, newId, str, type Row } from '@/data/agencySchema'
import { flushPushes } from '@/data/useNotifications'
import type { StaffPick } from '@/data/useClientTeam'
import {
  backStage, firstNoteLine, fmtStamp, nextStage, normalizeUrl, personFor, postCode, reviewWords, safeUrl, shootDayLabel,
  shootStageFor,
  type ContentItem, type ContentReview, type ContentVersion, type ItemDraft, type ItemPatch, type ItemPerson, type Priority,
  type ReviewDraft, type ReviewNote, type Shoot, type ShootDraft, type ShootItem, type ShootStatus, type Task, type TaskDraft,
  type TaskPatch, type ThreadEntry,
} from '@/lib/work'

const toItem = (r: Row): ContentItem => ({
  id: str(r.id),
  code: str(r.code),
  clientId: str(r.client_id),
  pageId: (r.page_id as string | null) ?? null,
  workflowId: str(r.workflow_id),
  stageId: str(r.stage_id),
  title: str(r.title),
  formatId: (r.format_id as string | null) ?? null,
  script: str(r.script),
  scriptUrl: str(r.script_url),
  plannedPostOn: (r.planned_post_on as string | null) ?? null,
  stageEnteredAt: str(r.stage_entered_at),
  completedAt: (r.completed_at as string | null) ?? null,
  createdBy: (r.created_by as string | null) ?? null,
  createdAt: str(r.created_at),
  postedUrl: str(r.posted_url),
  postShortCode: (r.post_short_code as string | null) ?? null,
  postedAt: (r.posted_at as string | null) ?? null,
})

const toShoot = (r: Row): Shoot => ({
  id: str(r.id),
  code: str(r.code),
  clientId: str(r.client_id),
  clientName: str(r.client_name),
  shootOn: str(r.shoot_on),
  startsAt: r.starts_at ? str(r.starts_at).slice(0, 5) : null,
  location: str(r.location),
  dopId: (r.dop_id as string | null) ?? null,
  dopName: str(r.dop_name),
  smmId: (r.smm_id as string | null) ?? null,
  smmName: str(r.smm_name),
  brief: str(r.brief),
  equipment: str(r.equipment),
  footageUrl: str(r.footage_url),
  status: r.status === 'done' || r.status === 'cancelled' ? r.status : 'planned',
  completedAt: (r.completed_at as string | null) ?? null,
  createdBy: (r.created_by as string | null) ?? null,
  creatorName: str(r.creator_name),
  createdAt: str(r.created_at),
  itemCount: Number(r.item_count ?? 0),
})

const toShootItem = (r: Row): ShootItem => ({
  shootId: str(r.shoot_id),
  itemId: str(r.item_id),
  itemCode: str(r.item_code),
  itemTitle: str(r.item_title),
  stageName: str(r.stage_name),
  stageDone: r.stage_done === true,
})

const toPerson = (r: Row): ItemPerson => ({
  id: str(r.id), itemId: str(r.item_id), roleId: str(r.role_id), employeeId: str(r.employee_id),
})

const toTask = (r: Row): Task => ({
  id: str(r.id),
  code: str(r.code),
  title: str(r.title),
  description: str(r.description),
  clientId: (r.client_id as string | null) ?? null,
  contentItemId: (r.content_item_id as string | null) ?? null,
  stageId: (r.stage_id as string | null) ?? null,
  roleId: (r.role_id as string | null) ?? null,
  assigneeId: (r.assignee_id as string | null) ?? null,
  assigneeName: str(r.assignee_name),
  assigneeProfileId: (r.assignee_profile_id as string | null) ?? null,
  priority: ((r.priority as Priority | null) ?? 'normal'),
  dueAt: (r.due_at as string | null) ?? null,
  statusId: str(r.status_id),
  completedAt: (r.completed_at as string | null) ?? null,
  createdBy: (r.created_by as string | null) ?? null,
  creatorName: str(r.creator_name),
  createdAt: str(r.created_at),
})

const toVersion = (r: Row): ContentVersion => ({
  id: str(r.id),
  itemId: str(r.item_id),
  number: Number(r.number ?? 0),
  url: str(r.url),
  note: str(r.note),
  stageId: (r.stage_id as string | null) ?? null,
  createdBy: (r.created_by as string | null) ?? null,
  authorName: str(r.author_name),
  createdAt: str(r.created_at),
})

const toNotes = (v: unknown): ReviewNote[] =>
  (Array.isArray(v) ? v : []).map((n: { at?: unknown; text?: unknown }) => ({
    at: typeof n?.at === 'number' ? n.at : null,
    text: str(n?.text),
  })).filter((n) => n.text)

const toReview = (r: Row): ContentReview => ({
  id: str(r.id),
  itemId: str(r.item_id),
  versionId: (r.version_id as string | null) ?? null,
  stageId: str(r.stage_id),
  decision: r.decision === 'changes' ? 'changes' : 'approved',
  notes: toNotes(r.notes),
  forClient: !!r.for_client,
  backToStageId: (r.back_to_stage_id as string | null) ?? null,
  reviewerId: (r.reviewer_id as string | null) ?? null,
  reviewerName: str(r.reviewer_name),
  createdAt: str(r.created_at),
})

const toEntry = (r: Row): ThreadEntry => ({
  kind: r.kind === 'comment' ? 'comment' : 'event',
  id: str(r.id),
  at: str(r.at),
  who: str(r.who) || 'Someone',
  body: str(r.body),
  event: (r.event as ThreadEntry['event']) ?? null,
  fromValue: (r.from_value as string | null) ?? null,
  toValue: (r.to_value as string | null) ?? null,
})

/** Postgres' answer, in words somebody can act on. The triggers already
 *  raise sentences ("A task stays with the stage it was made for."). */
function sentence(err: { code?: string; message: string }): string {
  if (err.code === '42501') return 'You do not have permission to do that.'
  if (err.code === '23503') return 'Something it points at no longer exists — reload and try again.'
  return err.message
}

/** Finished work older than this stays in the database, not on the screen. */
const KEEP_DONE_DAYS = 30
/** Shoots: every planned one, and the done or cancelled ones of this long. */
const KEEP_SHOOT_DAYS = 180

/* ---------------------------------------------------------------- demo mode
   The same rules 0044's triggers run, restated, so the demo hands work on
   the way the live site does. Plain module state: the demo is one page. */

const demoName = (employeeId: string | null) =>
  demoEmployees.find((e) => e.id === employeeId)?.fullName ?? ''
const demoProfileOf = (employeeId: string | null) =>
  demoEmployees.find((e) => e.id === employeeId)?.profileId ?? null
const demoFirstStatus = () =>
  demoTaskStatuses.filter((s) => s.isActive && !s.isDone).sort((a, b) => a.sortOrder - b.sortOrder)[0]!.id
const demoDoneStatus = () =>
  demoTaskStatuses.filter((s) => s.isActive && s.isDone).sort((a, b) => a.sortOrder - b.sortOrder)[0]!.id
let demoSeq = 100

function demoLog(taskId: string, e: Omit<ThreadEntry, 'id' | 'at' | 'who' | 'kind'> & { kind?: ThreadEntry['kind'] }) {
  const list = demoThreads[taskId] ?? (demoThreads[taskId] = [])
  list.push({ kind: e.kind ?? 'event', id: newId('ev'), at: new Date().toISOString(), who: demoMe.name, ...e })
}

/** content_item_person() — who a role on this item falls to. */
function demoPersonFor(it: ContentItem, roleId: string, people: ItemPerson[]): string | null {
  const role = demoAccess.roles.find((r) => r.id === roleId)
  return personFor({
    named: people.find((p) => p.itemId === it.id && p.roleId === roleId)?.employeeId ?? null,
    isPageHolderRole: !!role?.pageHolder,
    pageHolders: demoPageAssignments.filter((a) => a.pageId === it.pageId)
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt)).map((a) => a.employeeId),
    teamHolders: demoClientAssignments.filter((a) => a.clientId === it.clientId && a.roleId === roleId && !a.endedAt)
      .map((a) => a.employeeId),
  })
}

/** What the demo's login would see on the live site: task_visible() and the
 *  content_items read rule (0044), restated. The demo has no database to
 *  hide anything, so without this a salesperson's "All" listed the content
 *  team's reels — which the live site never shows them. */
function demoVisible(): { items: ContentItem[]; tasks: Task[]; shoots: Shoot[] } {
  const dept = demoDepartments.find((d) => d.id === demoMe.departmentId)?.name
  if (demoMe.role === 'owner' || dept === HR_DEPARTMENT) return { items: demoContentItems, tasks: demoTasks, shoots: demoShoots }
  const me = demoEmployees.find((e) => e.profileId === demoMe.id)?.id ?? null
  // can_see_client(): the client's team; a department head sees all of theirs.
  const clients = new Set(demoClients.filter((c) =>
    demoClientAssignments.some((a) => a.clientId === c.id && !!me && a.employeeId === me && !a.endedAt)
    || (demoMe.isTeamLead && c.departmentId === demoMe.departmentId)).map((c) => c.id))
  const reports = new Set(demoEmployees.filter((e) => !!me && e.reportingTo === me).map((e) => e.id))
  const tasks = demoTasks.filter((t) => (!!me && t.assigneeId === me) || t.createdBy === demoMe.id
    || (!!t.clientId && clients.has(t.clientId)) || (!!t.assigneeId && reports.has(t.assigneeId)))
  const items = demoContentItems.filter((i) => clients.has(i.clientId)
    || demoItemPeople.some((p) => p.itemId === i.id && !!me && p.employeeId === me)
    || demoTasks.some((t) => t.contentItemId === i.id && !!me && t.assigneeId === me))
  // shoot_visible() (0046): the client's team, and the shoot's own DOP and SMM.
  const shoots = demoShoots.filter((s) => clients.has(s.clientId) || (!!me && (s.dopId === me || s.smmId === me)))
  return { items, tasks, shoots }
}

/** shoot_name_dop() (0046), restated: a planned shoot's DOP is named for
 *  the shoot stage's role on each of its reels not yet past it, and a task
 *  waiting there goes to them — the content_item_person_changed hand-over. */
function demoNameDop(sh: Shoot, items: ContentItem[], tasks: Task[], people: ItemPerson[]): { tasks: Task[]; people: ItemPerson[] } {
  if (sh.status !== 'planned' || !sh.dopId) return { tasks, people }
  const dop = sh.dopId
  const doneIds = new Set(demoTaskStatuses.filter((s) => s.isDone).map((s) => s.id))
  let ppl = people
  let list = tasks
  for (const si of demoShootItems.filter((x) => x.shootId === sh.id)) {
    const it = items.find((x) => x.id === si.itemId)
    const st = it ? shootStageFor(demoWorkflowStages, it) : null
    if (!it || !st?.ownerRoleId) continue
    const role = st.ownerRoleId
    ppl = [...ppl.filter((p) => !(p.itemId === it.id && p.roleId === role)), { id: newId('cip'), itemId: it.id, roleId: role, employeeId: dop }]
    list = list.map((t) => {
      if (t.contentItemId !== it.id || t.stageId !== st.id || t.roleId !== role || doneIds.has(t.statusId) || t.assigneeId === dop) return t
      demoLog(t.id, { event: 'assigned', body: `Named on ${sh.code}`, fromValue: t.assigneeName || null, toValue: demoName(dop) })
      return { ...t, assigneeId: dop, assigneeName: demoName(dop), assigneeProfileId: demoProfileOf(dop) }
    })
  }
  return { tasks: list, people: ppl }
}

/** shoot_move_on() (0046), restated: each reel on a done shoot that has not
 *  passed its shoot stage moves to the stage after it, the notes saying why. */
function demoShotOn(sh: Shoot, itemIds: string[], items: ContentItem[], tasks: Task[], people: ItemPerson[]): { items: ContentItem[]; tasks: Task[] } {
  let out = items
  let list = tasks
  const now = new Date().toISOString()
  for (const id of itemIds) {
    const it = out.find((x) => x.id === id)
    const st = it ? shootStageFor(demoWorkflowStages, it) : null
    const nx = st ? nextStage(demoWorkflowStages, st) : null
    if (!it || !nx) continue
    const moved = { ...it, stageId: nx.id, stageEnteredAt: now, completedAt: nx.isDone ? now : null }
    out = out.map((x) => (x.id === id ? moved : x))
    list = demoEnterStage(moved, list, people, {
      closeNote: `Shot on ${sh.code} — moved to ${nx.name}`,
      handoffNote: `Shot on ${sh.code}` + (sh.footageUrl ? ' — the raw footage link is on the shoot' : ''),
    })
  }
  return { items: out, tasks: list }
}

/** shoot_clashes(): reels already on ANOTHER planned shoot, as words. */
function demoClashes(shootId: string | null, itemIds: string[]): string | null {
  const bad = demoShootItems.filter((x) => itemIds.includes(x.itemId) && x.shootId !== shootId)
    .map((x) => ({ x, s: demoShoots.find((s) => s.id === x.shootId) }))
    .filter((r) => r.s?.status === 'planned')
    .map((r) => `${r.x.itemCode} (on ${r.s!.code}, ${shootDayLabel(r.s!.shootOn, r.s!.startsAt)})`)
  return bad.length ? bad.sort().join(', ') : null
}

/** content_item_enter_stage(): close what the move left behind, then make
 *  the new stage's task unless one is open already. A stage the reel comes
 *  BACK to goes to whoever held it last time, unless somebody is named for
 *  the role (0045); a review that sent it back says so on both tasks. */
function demoEnterStage(
  it: ContentItem, tasks: Task[], people: ItemPerson[], why?: { closeNote: string; handoffNote: string },
): Task[] {
  const st = demoWorkflowStages.find((s) => s.id === it.stageId)
  if (!st) return tasks
  const done = demoDoneStatus()
  const doneIds = new Set(demoTaskStatuses.filter((s) => s.isDone).map((s) => s.id))
  let out = tasks.map((t) => {
    if (t.contentItemId !== it.id || t.stageId === it.stageId || doneIds.has(t.statusId)) return t
    demoLog(t.id, { event: 'status', body: why?.closeNote ?? 'Closed: the item moved to ' + st.name,
      fromValue: demoTaskStatuses.find((s) => s.id === t.statusId)?.name ?? null, toValue: 'Completed' })
    return { ...t, statusId: done, completedAt: new Date().toISOString() }
  })
  if (st.isDone) return out
  if (out.some((t) => t.contentItemId === it.id && t.stageId === st.id && !doneIds.has(t.statusId))) return out
  const active = (id: string | null) => !!id && demoEmployees.some((e) => e.id === id && e.status !== 'resigned')
  const named = people.find((p) => p.itemId === it.id && p.roleId === st.ownerRoleId && active(p.employeeId))?.employeeId ?? null
  const lastTime = out.filter((t) => t.contentItemId === it.id && t.stageId === st.id && t.roleId === st.ownerRoleId && active(t.assigneeId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.assigneeId ?? null
  const assigneeId = st.ownerRoleId ? named ?? lastTime ?? demoPersonFor(it, st.ownerRoleId, people) : null
  const n = ++demoSeq
  const t: Task = {
    id: 'td' + n, code: 'T-' + String(n).padStart(5, '0'), title: `${st.name} — ${it.title}`, description: '',
    clientId: it.clientId, contentItemId: it.id, stageId: st.id, roleId: st.ownerRoleId, assigneeId,
    assigneeName: demoName(assigneeId), assigneeProfileId: demoProfileOf(assigneeId), priority: 'normal',
    dueAt: st.slaHours ? new Date(Date.now() + st.slaHours * 3600000).toISOString() : null,
    statusId: demoFirstStatus(), completedAt: null, createdBy: demoMe.id, creatorName: demoMe.name,
    createdAt: new Date().toISOString(),
  }
  demoLog(t.id, { event: 'created', body: why?.handoffNote ?? 'Hand-off: the item reached ' + st.name, fromValue: null, toValue: t.assigneeName || null })
  out = [t, ...out]
  return out
}

/**
 * Content items and tasks (0044), their versions and reviews (0045). Loaded
 * once per screen that shows them;
 * every write that can hand work on reloads both lists, because the
 * database may have closed one task and made another — the app never
 * guesses what the triggers did, it reads it back.
 *
 * Before 0044 is on the database every list is empty and `installed` is
 * false, so a screen can say so instead of showing an error.
 */
export function useWork(enabled = true) {
  const [items, setItems] = useState<ContentItem[]>([])
  const [people, setPeople] = useState<ItemPerson[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [versions, setVersions] = useState<ContentVersion[]>([])
  const [reviews, setReviews] = useState<ContentReview[]>([])
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [shootItems, setShootItems] = useState<ShootItem[]>([])
  const [installed, setInstalled] = useState(true)
  // 0046 (shoots) and 0047 (posting): each screen part waits for its SQL.
  const [shootsOn, setShootsOn] = useState(false)
  const [postingOn, setPostingOn] = useState(false)
  // 0045 — versions and reviews. Until it is on the database the screens
  // stay exactly as Round 2 left them.
  const [versionsOn, setVersionsOn] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  // Demo writes read the latest lists without widening every callback's deps.
  const cur = useRef({ items, people, tasks, versions, reviews, shoots, shootItems })
  cur.current = { items, people, tasks, versions, reviews, shoots, shootItems }

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    // Switched on after mount (a tab opened later): say so until it lands,
    // or a screen reads "nothing here" / "not installed" meanwhile.
    if (!force) setLoading(true)
    if (isDemo()) {
      const v = demoVisible()
      setItems(v.items); setTasks(v.tasks)
      const seen = (itemId: string) => v.items.some((i) => i.id === itemId)
      setPeople(demoItemPeople.filter((p) => seen(p.itemId)))
      setVersions(demoVersions.filter((x) => seen(x.itemId)))
      setReviews(demoReviews.filter((x) => seen(x.itemId)))
      setShoots([...v.shoots].sort((a, b) => a.shootOn.localeCompare(b.shootOn)))
      setShootItems(demoShootItems.filter((x) => v.shoots.some((s) => s.id === x.shootId)))
      setVersionsOn(true); setShootsOn(true); setPostingOn(true)
      setLoading(false)
      return
    }
    const since = new Date(Date.now() - KEEP_DONE_DAYS * 86400000).toISOString()
    const recent = `completed_at.is.null,completed_at.gte.${since}`
    // A version or review loads with its reel: the views carry the reel's finish time.
    const withItem = `item_completed_at.is.null,item_completed_at.gte.${since}`
    const shootSince = new Date(Date.now() - KEEP_SHOOT_DAYS * 86400000).toISOString().slice(0, 10)
    const [i, p, t, v, r, s, si, schema] = await Promise.all([
      loadTable('content_items', toItem, (q) => q.or(recent).order('created_at', { ascending: false })),
      loadTable('content_item_assignees', toPerson),
      loadTable('v_tasks', toTask, (q) => q.or(recent).order('created_at', { ascending: false })),
      loadTable('v_content_versions', toVersion, (q) => q.or(withItem).order('number', { ascending: false })),
      loadTable('v_content_reviews', toReview, (q) => q.or(withItem).order('created_at', { ascending: true })),
      loadTable('v_shoots', toShoot, (q) => q.or(`status.eq.planned,shoot_on.gte.${shootSince}`)
        .order('shoot_on', { ascending: true }).order('starts_at', { ascending: true, nullsFirst: true })),
      loadTable('v_shoot_items', toShootItem, (q) => q.or(`shoot_status.eq.planned,shoot_on.gte.${shootSince}`)),
      agencySchema(),
    ])
    setInstalled(!i.missing)
    setVersionsOn(!i.missing && !v.missing && !r.missing)
    setShootsOn(!i.missing && !s.missing)
    setPostingOn(!i.missing && schema.posting)
    setError(i.error ?? p.error ?? t.error ?? v.error ?? r.error ?? s.error ?? si.error)
    setItems(i.rows); setPeople(p.rows); setTasks(t.rows); setVersions(v.rows); setReviews(r.rows)
    setShoots(s.rows); setShootItems(si.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** After anything that can hand work on: read back what the database did,
   *  then ask for the phone pushes it wrote. */
  const settle = useCallback(async () => {
    await load(true)
    flushPushes()
  }, [load])

  /* -------------------------------------------------------------- items */

  const createItem = useCallback(async (d: ItemDraft): Promise<{ error: string | null; item: ContentItem | null }> => {
    const title = d.title.trim()
    if (!title) return { error: 'Give it a title.', item: null }
    if (isDemo()) {
      const n = ++demoSeq
      const first = demoWorkflowStages.filter((s) => s.workflowId === d.workflowId && s.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0]
      if (!first) return { error: 'This workflow has no stages in use — add one on Settings → Workflows & lists.', item: null }
      const it: ContentItem = {
        id: 'cid' + n, code: 'C-' + String(n).padStart(5, '0'), clientId: d.clientId, pageId: d.pageId,
        workflowId: d.workflowId, stageId: first.id, title, formatId: d.formatId, script: d.script.trim(),
        scriptUrl: d.scriptUrl.trim(), plannedPostOn: d.plannedPostOn, stageEnteredAt: new Date().toISOString(),
        completedAt: null, createdBy: demoMe.id, createdAt: new Date().toISOString(),
        postedUrl: '', postShortCode: null, postedAt: null,
      }
      const ppl = [...cur.current.people, ...d.people.map((x) => ({ id: newId('cip'), itemId: it.id, ...x }))]
      setPeople(ppl)
      setItems((p) => [it, ...p])
      setTasks(demoEnterStage(it, cur.current.tasks, ppl))
      return { error: null, item: it }
    }
    const { data, error: err } = await supabase.rpc('create_content_item', {
      p_client: d.clientId, p_page: d.pageId, p_workflow: d.workflowId, p_title: title,
      p_format: d.formatId, p_script: d.script.trim() || null, p_script_url: d.scriptUrl.trim() || null,
      p_planned_post_on: d.plannedPostOn, p_people: d.people.map((x) => ({ role_id: x.roleId, employee_id: x.employeeId })),
    })
    if (err) return { error: sentence(err), item: null }
    await settle()
    return { error: null, item: data ? toItem(data as Row) : null }
  }, [settle])

  /** Title, page, format, script, post date — never the stage (moveItem). */
  const updateItem = useCallback(async (id: string, patch: ItemPatch): Promise<string | null> => {
    const before = cur.current.items.find((x) => x.id === id)
    if (!before) return 'That item is no longer on the list.'
    if (patch.title !== undefined && !patch.title.trim()) return 'Give it a title.'
    setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    if (isDemo()) return null
    const row: Row = {}
    if (patch.title !== undefined) row.title = patch.title.trim()
    if (patch.pageId !== undefined) row.page_id = patch.pageId
    if (patch.formatId !== undefined) row.format_id = patch.formatId
    if (patch.script !== undefined) row.script = patch.script.trim() || null
    if (patch.scriptUrl !== undefined) row.script_url = patch.scriptUrl.trim() || null
    if (patch.plannedPostOn !== undefined) row.planned_post_on = patch.plannedPostOn
    const { data, error: err } = await supabase.from('content_items').update(row).eq('id', id).select('*').maybeSingle()
    if (err || !data) {
      setItems((p) => p.map((x) => (x.id === id ? before : x)))
      return err ? sentence(err) : 'You cannot change this item.'
    }
    setItems((p) => p.map((x) => (x.id === id ? toItem(data as Row) : x)))
    return null
  }, [])

  /** The board's drag and the modal's "Move to" — one write, and the
   *  database hands the work on (closes the old stage's task, makes the new). */
  const moveItem = useCallback(async (id: string, stageId: string): Promise<string | null> => {
    const before = cur.current.items.find((x) => x.id === id)
    if (!before) return 'That item is no longer on the list.'
    if (before.stageId === stageId) return null
    if (isDemo()) {
      const st = demoWorkflowStages.find((s) => s.id === stageId)
      const it = { ...before, stageId, stageEnteredAt: new Date().toISOString(),
        completedAt: st?.isDone ? new Date().toISOString() : null }
      setItems((p) => p.map((x) => (x.id === id ? it : x)))
      setTasks(demoEnterStage(it, cur.current.tasks, cur.current.people))
      return null
    }
    setItems((p) => p.map((x) => (x.id === id ? { ...x, stageId } : x)))
    const { data, error: err } = await supabase.from('content_items').update({ stage_id: stageId }).eq('id', id).select('id').maybeSingle()
    if (err || !data) {
      setItems((p) => p.map((x) => (x.id === id ? before : x)))
      return err ? sentence(err) : 'You cannot move this item.'
    }
    await settle()
    return null
  }, [settle])

  const deleteItem = useCallback(async (id: string): Promise<string | null> => {
    const before = cur.current
    setItems((p) => p.filter((x) => x.id !== id))
    setTasks((p) => p.filter((t) => t.contentItemId !== id))
    setPeople((p) => p.filter((x) => x.itemId !== id))
    setVersions((p) => p.filter((x) => x.itemId !== id))
    setReviews((p) => p.filter((x) => x.itemId !== id))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('content_items').delete().eq('id', id).select('id')
    if (err || !data || data.length === 0) {
      setItems(before.items); setTasks(before.tasks); setPeople(before.people)
      setVersions(before.versions); setReviews(before.reviews)
      return err ? sentence(err) : 'Only management or the client\'s manager can delete an item.'
    }
    return null
  }, [])

  /** Name who does a role on this reel (or null: "decide by the team"). The
   *  database hands the open task over to them if it is waiting on that role. */
  const setPerson = useCallback(async (itemId: string, roleId: string, employeeId: string | null): Promise<string | null> => {
    const before = cur.current.people
    const kept = before.filter((x) => !(x.itemId === itemId && x.roleId === roleId))
    const next = employeeId ? [...kept, { id: newId('cip'), itemId, roleId, employeeId }] : kept
    setPeople(next)
    if (isDemo()) {
      if (!employeeId) return null
      const it = cur.current.items.find((x) => x.id === itemId)
      const doneIds = new Set(demoTaskStatuses.filter((s) => s.isDone).map((s) => s.id))
      setTasks(cur.current.tasks.map((t) => {
        if (!it || t.contentItemId !== itemId || t.roleId !== roleId || t.stageId !== it.stageId || doneIds.has(t.statusId)
            || t.assigneeId === employeeId) return t
        demoLog(t.id, { event: 'assigned', body: '', fromValue: t.assigneeName || null, toValue: demoName(employeeId) })
        return { ...t, assigneeId: employeeId, assigneeName: demoName(employeeId), assigneeProfileId: demoProfileOf(employeeId) }
      }))
      return null
    }
    const q = employeeId
      ? supabase.from('content_item_assignees')
        .upsert({ item_id: itemId, role_id: roleId, employee_id: employeeId }, { onConflict: 'item_id,role_id' }).select('id')
      : supabase.from('content_item_assignees').delete().eq('item_id', itemId).eq('role_id', roleId).select('id')
    const { data, error: err } = await q
    if (err || (employeeId && (!data || data.length === 0))) {
      setPeople(before)
      return err ? sentence(err) : 'You cannot change who works on this item.'
    }
    await settle()
    return null
  }, [settle])

  /* -------------------------------------------------------------- tasks */

  const createTask = useCallback(async (d: TaskDraft): Promise<string | null> => {
    const title = d.title.trim()
    if (!title) return 'Say what the task is.'
    if (isDemo()) {
      const n = ++demoSeq
      const t: Task = {
        id: 'td' + n, code: 'T-' + String(n).padStart(5, '0'), title, description: d.description.trim(),
        clientId: d.clientId, contentItemId: null, stageId: null, roleId: null, assigneeId: d.assigneeId,
        assigneeName: demoName(d.assigneeId), assigneeProfileId: demoProfileOf(d.assigneeId), priority: d.priority,
        dueAt: d.dueAt, statusId: demoFirstStatus(), completedAt: null, createdBy: demoMe.id, creatorName: demoMe.name,
        createdAt: new Date().toISOString(),
      }
      demoLog(t.id, { event: 'created', body: '', fromValue: null, toValue: t.assigneeName || null })
      setTasks((p) => [t, ...p])
      return null
    }
    const { error: err } = await supabase.from('tasks').insert({
      title, description: d.description.trim() || null, client_id: d.clientId, assignee_id: d.assigneeId,
      due_at: d.dueAt, priority: d.priority,
    })
    if (err) return err.code === '42501' ? 'You cannot give a task to that person.' : sentence(err)
    await settle()
    return null
  }, [settle])

  /** Status, and — for whoever gave it or manages it — everything else. A
   *  stage task finished here moves its reel on (the database does that). */
  const updateTask = useCallback(async (id: string, patch: TaskPatch): Promise<string | null> => {
    const before = cur.current.tasks.find((x) => x.id === id)
    if (!before) return 'That task is no longer on the list.'
    if (patch.title !== undefined && !patch.title.trim()) return 'Say what the task is.'
    const doneIds = new Set(demoTaskStatuses.filter((s) => s.isDone).map((s) => s.id))
    if (isDemo()) {
      let t: Task = { ...before, ...patch }
      if (patch.assigneeId !== undefined) {
        t = { ...t, assigneeName: demoName(patch.assigneeId), assigneeProfileId: demoProfileOf(patch.assigneeId) }
        if (patch.assigneeId !== before.assigneeId) {
          demoLog(id, { event: 'assigned', body: '', fromValue: before.assigneeName || null, toValue: t.assigneeName || null })
        }
      }
      if (patch.statusId !== undefined && patch.statusId !== before.statusId) {
        const name = (sid: string) => demoTaskStatuses.find((s) => s.id === sid)?.name ?? null
        demoLog(id, { event: 'status', body: '', fromValue: name(before.statusId), toValue: name(patch.statusId) })
        t.completedAt = doneIds.has(patch.statusId) ? (before.completedAt ?? new Date().toISOString()) : null
      }
      if (patch.dueAt !== undefined && patch.dueAt !== before.dueAt) {
        demoLog(id, { event: 'due', body: '', fromValue: fmtStamp(before.dueAt) || null, toValue: fmtStamp(patch.dueAt) || null })
      }
      if (patch.priority !== undefined && patch.priority !== before.priority) {
        demoLog(id, { event: 'priority', body: '', fromValue: before.priority, toValue: patch.priority })
      }
      let list = cur.current.tasks.map((x) => (x.id === id ? t : x))
      // task_after(): the stage's last open task finished → the reel moves on.
      const it = t.contentItemId ? cur.current.items.find((x) => x.id === t.contentItemId) : null
      if (it && doneIds.has(t.statusId) && !doneIds.has(before.statusId) && t.stageId === it.stageId
          && !list.some((x) => x.contentItemId === it.id && x.stageId === it.stageId && !doneIds.has(x.statusId))) {
        const st = demoWorkflowStages.find((s) => s.id === it.stageId)
        const nx = st ? nextStage(demoWorkflowStages, st) : null
        if (nx) {
          const moved = { ...it, stageId: nx.id, stageEnteredAt: new Date().toISOString(),
            completedAt: nx.isDone ? new Date().toISOString() : null }
          setItems((p) => p.map((x) => (x.id === it.id ? moved : x)))
          list = demoEnterStage(moved, list, cur.current.people)
        }
      }
      setTasks(list)
      return null
    }
    setTasks((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    const row: Row = {}
    if (patch.title !== undefined) row.title = patch.title.trim()
    if (patch.description !== undefined) row.description = patch.description.trim() || null
    if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId
    if (patch.dueAt !== undefined) row.due_at = patch.dueAt
    if (patch.priority !== undefined) row.priority = patch.priority
    if (patch.statusId !== undefined) row.status_id = patch.statusId
    const { data, error: err } = await supabase.from('tasks').update(row).eq('id', id).select('id').maybeSingle()
    if (err || !data) {
      setTasks((p) => p.map((x) => (x.id === id ? before : x)))
      return err ? sentence(err) : 'You cannot change this task.'
    }
    await settle()
    return null
  }, [settle])

  const deleteTask = useCallback(async (id: string): Promise<string | null> => {
    const before = cur.current.tasks
    setTasks((p) => p.filter((x) => x.id !== id))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('tasks').delete().eq('id', id).select('id')
    if (err || !data || data.length === 0) {
      setTasks(before)
      return err ? sentence(err) : 'Only whoever gave a task (or management) can delete it — and an item\'s tasks stay with the item.'
    }
    return null
  }, [])

  /** Comments and history, one timeline, oldest first. */
  const thread = useCallback(async (taskId: string): Promise<{ rows: ThreadEntry[]; error: string | null }> => {
    if (isDemo()) {
      const t = cur.current.tasks.find((x) => x.id === taskId)
      const seeded = demoThreads[taskId]
      if (!seeded && t) {
        demoThreads[taskId] = [{ kind: 'event', id: newId('ev'), at: t.createdAt, who: t.creatorName, body: '',
          event: 'created', fromValue: null, toValue: t.assigneeName || null }]
      }
      return { rows: [...(demoThreads[taskId] ?? [])], error: null }
    }
    const { data, error: err } = await supabase.rpc('task_thread', { p_task: taskId })
    if (err) return { rows: [], error: sentence(err) }
    return { rows: ((data ?? []) as Row[]).map(toEntry), error: null }
  }, [])

  const comment = useCallback(async (taskId: string, body: string): Promise<string | null> => {
    const text = body.trim()
    if (!text) return 'Write something first.'
    if (isDemo()) {
      demoLog(taskId, { kind: 'comment', event: null, body: text, fromValue: null, toValue: null })
      return null
    }
    const { error: err } = await supabase.from('task_comments').insert({ task_id: taskId, body: text })
    if (err) return sentence(err)
    flushPushes()
    return null
  }, [])

  /* --------------------------------------------- versions & reviews (0045) */

  /** V1, V2… — a link. The database numbers it and notes the stage it was made in. */
  const addVersion = useCallback(async (itemId: string, url: string, note: string): Promise<string | null> => {
    const link = normalizeUrl(url)
    if (!safeUrl(link)) return 'Paste the whole link — it starts with https://'
    if (isDemo()) {
      const it = cur.current.items.find((x) => x.id === itemId)
      const n = cur.current.versions.filter((x) => x.itemId === itemId).reduce((m, x) => Math.max(m, x.number), 0) + 1
      setVersions((p) => [{
        id: newId('cv'), itemId, number: n, url: link, note: note.trim(), stageId: it?.stageId ?? null,
        createdBy: demoMe.id, authorName: demoMe.name, createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase.from('content_versions')
      .insert({ item_id: itemId, url: link, note: note.trim() || null }).select('id').maybeSingle()
    if (err || !data) return err ? sentence(err) : 'You cannot add a version to this item.'
    // Read it back through the view, for the author's name.
    const back = await supabase.from('v_content_versions').select('*').eq('id', (data as Row).id).maybeSingle()
    if (back.data) setVersions((p) => [toVersion(back.data as Row), ...p])
    return null
  }, [])

  /** A wrong link, corrected — only until somebody reviews that version. */
  const fixVersion = useCallback(async (id: string, url: string, note: string): Promise<string | null> => {
    const before = cur.current.versions.find((x) => x.id === id)
    if (!before) return 'That version is no longer on the list.'
    if (cur.current.reviews.some((r) => r.versionId === id)) return `V${before.number} has been reviewed — add a new version instead.`
    const link = normalizeUrl(url)
    if (!safeUrl(link)) return 'Paste the whole link — it starts with https://'
    setVersions((p) => p.map((x) => (x.id === id ? { ...x, url: link, note: note.trim() } : x)))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('content_versions')
      .update({ url: link, note: note.trim() || null }).eq('id', id).select('id').maybeSingle()
    if (err || !data) {
      setVersions((p) => p.map((x) => (x.id === id ? before : x)))
      return err ? sentence(err) : 'Only whoever added a version can correct it.'
    }
    return null
  }, [])

  /** Approve (the reel moves on) or ask for changes (it goes back, and whoever
   *  made it there last time gets the task with the notes). One call; the
   *  database does the moving — review_content_item(). */
  const review = useCallback(async (d: ReviewDraft): Promise<string | null> => {
    if (d.decision === 'changes' && d.notes.length === 0) return 'Say what to change.'
    if (isDemo()) {
      const it = cur.current.items.find((x) => x.id === d.itemId)
      if (!it) return 'That item is no longer on the list.'
      const st = demoWorkflowStages.find((s) => s.id === it.stageId)
      if (!st?.isReview) return `It is not waiting for a review any more — it is at ${st?.name ?? 'another stage'}.`
      const mine = cur.current.versions.filter((x) => x.itemId === it.id)
      const v = mine.find((x) => x.id === d.versionId) ?? null
      const back = d.decision === 'changes'
        ? demoWorkflowStages.find((s) => s.id === d.backToStageId) ?? backStage(demoWorkflowStages, st, mine, d.versionId)
        : null
      if (d.decision === 'changes' && !back) return 'Changes go back to an earlier stage of this workflow that is in use.'
      const now = new Date().toISOString()
      const what = reviewWords(d.decision, st.clientVisible, v?.number ?? null)
      setReviews((p) => [...p, {
        id: newId('cr'), itemId: it.id, versionId: v?.id ?? null, stageId: st.id, decision: d.decision, notes: d.notes,
        forClient: st.clientVisible, backToStageId: back?.id ?? null, reviewerId: demoMe.id, reviewerName: demoMe.name,
        createdAt: now,
      }])
      const doneIds = new Set(demoTaskStatuses.filter((s) => s.isDone).map((s) => s.id))
      if (back) {
        const moved = { ...it, stageId: back.id, stageEnteredAt: now, completedAt: null }
        setItems((p) => p.map((x) => (x.id === it.id ? moved : x)))
        setTasks(demoEnterStage(moved, cur.current.tasks, cur.current.people, {
          closeNote: `${what} — back to ${back.name}`, handoffNote: `${what}: ${firstNoteLine(d.notes)}`,
        }))
        return null
      }
      // Approved: the review's task is finished, and the reel moves on.
      let list = cur.current.tasks.map((t) => {
        if (t.contentItemId !== it.id || t.stageId !== it.stageId || doneIds.has(t.statusId)) return t
        demoLog(t.id, { event: 'status', body: what,
          fromValue: demoTaskStatuses.find((s) => s.id === t.statusId)?.name ?? null, toValue: 'Completed' })
        return { ...t, statusId: demoDoneStatus(), completedAt: now }
      })
      const nx = nextStage(demoWorkflowStages, st)
      if (nx) {
        const moved = { ...it, stageId: nx.id, stageEnteredAt: now, completedAt: nx.isDone ? now : null }
        setItems((p) => p.map((x) => (x.id === it.id ? moved : x)))
        list = demoEnterStage(moved, list, cur.current.people)
      }
      setTasks(list)
      return null
    }
    const { error: err } = await supabase.rpc('review_content_item', {
      p_item: d.itemId, p_version: d.versionId, p_decision: d.decision,
      p_notes: d.notes.map((n) => ({ at: n.at, text: n.text })), p_back_to: d.backToStageId,
    })
    if (err) return sentence(err)
    await settle()
    return null
  }, [settle])

  /* ------------------------------------------------------ shoots (0046) */

  /** Plan a shoot (id null) or change one — the day, the place, the DOP, the
   *  reels. One call; the database names the DOP on the reels and tells the
   *  people once — save_shoot(). */
  const saveShoot = useCallback(async (id: string | null, d: ShootDraft): Promise<{ error: string | null; id: string | null }> => {
    if (!d.shootOn) return { error: 'Pick the day of the shoot.', id: null }
    const footage = normalizeUrl(d.footageUrl)
    if (footage && !safeUrl(footage)) return { error: 'Paste the whole footage link — it starts with https://', id: null }
    const wanted = [...new Set(d.itemIds)]
    if (isDemo()) {
      const prev = id ? demoShoots.find((s) => s.id === id) ?? null : null
      if (id && !prev) return { error: 'That shoot no longer exists.', id: null }
      const clientId = prev?.clientId ?? d.clientId
      const items = cur.current.items
      const had = demoShootItems.filter((x) => x.shootId === id).map((x) => x.itemId)
      const added = wanted.filter((x) => !had.includes(x))
      const removed = had.filter((x) => !wanted.includes(x))
      const codes = (ids: string[]) => ids.map((x) => items.find((i) => i.id === x)?.code ?? '?').sort().join(', ')
      if (prev?.status === 'done' && removed.length) return { error: `${prev.code} is done — the reels it shot stay on it.`, id: null }
      if (prev?.status === 'cancelled' && added.length) return { error: `${prev.code} is cancelled — put it back on before adding reels.`, id: null }
      const other = added.filter((x) => items.find((i) => i.id === x)?.clientId !== clientId)
      if (other.length) return { error: `Another client's reel: ${codes(other)}.`, id: null }
      const finished = added.filter((x) => demoWorkflowStages.find((s) => s.id === items.find((i) => i.id === x)?.stageId)?.isDone)
      if (finished.length) return { error: `Already finished: ${codes(finished)}.`, id: null }
      const clash = demoClashes(id, added)
      if (clash) return { error: `Already on another shoot: ${clash} — take it off that one first.`, id: null }
      const n = demoShoots.reduce((m, s) => Math.max(m, Number(s.code.slice(2)) || 0), 0) + 1
      const sh: Shoot = {
        id: prev?.id ?? newId('sh'), code: prev?.code ?? 'S-' + String(n).padStart(4, '0'), clientId,
        clientName: demoClients.find((c) => c.id === clientId)?.name ?? '', shootOn: d.shootOn, startsAt: d.startsAt,
        location: d.location.trim(), dopId: d.dopId, dopName: demoName(d.dopId), smmId: d.smmId, smmName: demoName(d.smmId),
        brief: d.brief.trim(), equipment: d.equipment.trim(), footageUrl: footage, status: prev?.status ?? 'planned',
        completedAt: prev?.completedAt ?? null, createdBy: prev?.createdBy ?? demoMe.id,
        creatorName: prev?.creatorName ?? demoMe.name, createdAt: prev?.createdAt ?? new Date().toISOString(),
        itemCount: wanted.length,
      }
      if (prev) demoShoots.splice(demoShoots.indexOf(prev), 1, sh)
      else demoShoots.push(sh)
      for (let k = demoShootItems.length - 1; k >= 0; k--) {
        if (demoShootItems[k]!.shootId === sh.id && removed.includes(demoShootItems[k]!.itemId)) demoShootItems.splice(k, 1)
      }
      for (const x of added) {
        const it = items.find((i) => i.id === x)!
        demoShootItems.push({ shootId: sh.id, itemId: x, itemCode: it.code, itemTitle: it.title,
          stageName: demoWorkflowStages.find((s) => s.id === it.stageId)?.name ?? '', stageDone: false })
      }
      let nextItems = items
      let nextTasks = cur.current.tasks
      let nextPeople = cur.current.people
      if (sh.status === 'planned' && sh.dopId && (!prev || prev.dopId !== sh.dopId || added.length)) {
        const r = demoNameDop(sh, nextItems, nextTasks, nextPeople)
        nextTasks = r.tasks; nextPeople = r.people
      }
      if (sh.status === 'done' && added.length) {
        const r = demoShotOn(sh, added, nextItems, nextTasks, nextPeople)
        nextItems = r.items; nextTasks = r.tasks
      }
      setItems(nextItems); setTasks(nextTasks); setPeople(nextPeople)
      setShoots((p) => (prev ? p.map((s) => (s.id === sh.id ? sh : s)) : [...p, sh]).sort((a, b) => a.shootOn.localeCompare(b.shootOn)))
      setShootItems(demoShootItems.filter((x) => x.shootId === sh.id || cur.current.shoots.some((s) => s.id === x.shootId)))
      return { error: null, id: sh.id }
    }
    const { data, error: err } = await supabase.rpc('save_shoot', {
      p_id: id, p_client: d.clientId, p_shoot_on: d.shootOn, p_starts_at: d.startsAt, p_location: d.location.trim() || null,
      p_dop: d.dopId, p_smm: d.smmId, p_brief: d.brief.trim() || null, p_equipment: d.equipment.trim() || null,
      p_footage_url: footage || null, p_items: wanted,
    })
    if (err) return { error: sentence(err), id: null }
    await settle()
    return { error: null, id: data ? str((data as Row).id) : id }
  }, [settle])

  /** Done (its reels move on past the shoot), cancelled, or back on. */
  const setShootStatus = useCallback(async (id: string, status: ShootStatus, footageUrl?: string): Promise<string | null> => {
    const footage = footageUrl !== undefined ? normalizeUrl(footageUrl) : ''
    if (footage && !safeUrl(footage)) return 'Paste the whole footage link — it starts with https://'
    if (isDemo()) {
      const sh = demoShoots.find((s) => s.id === id)
      if (!sh) return 'That shoot no longer exists.'
      if (sh.status === status) return null
      if (sh.status === 'done') return `${sh.code} is done — its reels have moved on.`
      if (status === 'done' && sh.status === 'cancelled') return `${sh.code} is cancelled — put it back on first.`
      const mine = demoShootItems.filter((x) => x.shootId === id).map((x) => x.itemId)
      if (status === 'planned') {
        const clash = demoClashes(id, mine)
        if (clash) return `Already on another shoot: ${clash} — take it off that one first.`
      }
      const next: Shoot = { ...sh, status, footageUrl: footage || sh.footageUrl,
        completedAt: status === 'done' ? new Date().toISOString() : sh.completedAt }
      demoShoots.splice(demoShoots.indexOf(sh), 1, next)
      if (status === 'done') {
        const r = demoShotOn(next, mine, cur.current.items, cur.current.tasks, cur.current.people)
        setItems(r.items); setTasks(r.tasks)
      } else if (status === 'planned') {
        const r = demoNameDop(next, cur.current.items, cur.current.tasks, cur.current.people)
        setTasks(r.tasks); setPeople(r.people)
      }
      setShoots((p) => p.map((s) => (s.id === id ? next : s)))
      return null
    }
    const { error: err } = await supabase.rpc('set_shoot_status', {
      p_shoot: id, p_status: status, p_footage_url: footage || null,
    })
    if (err) return sentence(err)
    await settle()
    return null
  }, [settle])

  /** A planned or cancelled shoot, gone. A done one stays on record. */
  const deleteShoot = useCallback(async (id: string): Promise<string | null> => {
    const before = cur.current
    const sh = before.shoots.find((s) => s.id === id)
    if (!sh) return 'That shoot is no longer on the list.'
    if (sh.status === 'done') return `${sh.code} is done — it stays on record.`
    setShoots((p) => p.filter((s) => s.id !== id))
    setShootItems((p) => p.filter((x) => x.shootId !== id))
    if (isDemo()) {
      demoShoots.splice(demoShoots.findIndex((s) => s.id === id), 1)
      for (let k = demoShootItems.length - 1; k >= 0; k--) if (demoShootItems[k]!.shootId === id) demoShootItems.splice(k, 1)
      return null
    }
    const { data, error: err } = await supabase.from('shoots').delete().eq('id', id).select('id')
    if (err || !data || data.length === 0) {
      setShoots(before.shoots); setShootItems(before.shootItems)
      return err ? sentence(err) : 'Only the client\'s team (or whoever manages it) can delete a shoot.'
    }
    return null
  }, [])

  /* ------------------------------------------------------ posting (0047) */

  /** The live post's link. Posting finishes the reel; an empty link takes the
   *  post off and leaves the reel where it is — post_content_item(). */
  const postItem = useCallback(async (itemId: string, url: string): Promise<string | null> => {
    const link = normalizeUrl(url)
    if (link && !safeUrl(link)) return 'Paste the whole link — it starts with https://'
    if (link && /instagram\.com/i.test(link) && !postCode(link)) {
      return 'That Instagram link hides the reel — open the reel and copy its link (instagram.com/reel/…), not a share link.'
    }
    if (isDemo()) {
      const it = cur.current.items.find((x) => x.id === itemId)
      if (!it) return 'That item is no longer on the list.'
      const code = postCode(link)
      const other = code ? cur.current.items.find((x) => x.id !== itemId && x.postShortCode === code) : null
      if (other) return `That reel is already posted as ${other.code}.`
      const now = new Date().toISOString()
      let next: ContentItem = { ...it, postedUrl: link, postShortCode: code, postedAt: link ? (it.postedUrl ? it.postedAt : now) : null }
      const st = demoWorkflowStages.find((s) => s.id === it.stageId)
      const finish = demoWorkflowStages.filter((s) => s.workflowId === it.workflowId && s.isActive && s.isDone)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0]
      if (link && !st?.isDone && finish) {
        next = { ...next, stageId: finish.id, stageEnteredAt: now, completedAt: now }
        setTasks(demoEnterStage(next, cur.current.tasks, cur.current.people, { closeNote: 'Posted', handoffNote: '' }))
      }
      setItems((p) => p.map((x) => (x.id === itemId ? next : x)))
      return null
    }
    const { error: err } = await supabase.rpc('post_content_item', { p_item: itemId, p_url: link || null })
    if (err) return sentence(err)
    await settle()
    return null
  }, [settle])

  /* ------------------------------------------------------ history */

  /** Tasks finished between two moments — one person's, or everyone's this
   *  login may see. Read fresh: the lists above keep only 30 days. */
  const doneBetween = useCallback(async (employeeId: string | null, from: string, to: string): Promise<{ rows: Task[]; error: string | null }> => {
    if (isDemo()) {
      const rows = cur.current.tasks.filter((t) => !!t.completedAt && t.completedAt >= from && t.completedAt < to
        && (!employeeId || t.assigneeId === employeeId))
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
      return { rows, error: null }
    }
    let q = supabase.from('v_tasks').select('*').gte('completed_at', from).lt('completed_at', to)
      .order('completed_at', { ascending: false }).limit(1000)
    if (employeeId) q = q.eq('assignee_id', employeeId)
    const { data, error: err } = await q
    if (err) return { rows: [], error: sentence(err) }
    return { rows: ((data ?? []) as Row[]).map(toTask), error: null }
  }, [])

  /** Who this person may give a task to — on a client, or anyone at all. */
  const assignable = useCallback(async (clientId: string | null): Promise<{ rows: StaffPick[]; error: string | null }> => {
    if (isDemo()) {
      const team = clientId
        ? new Set(demoClientAssignments.filter((a) => a.clientId === clientId && !a.endedAt).map((a) => a.employeeId))
        : null
      const rows = demoEmployees
        .filter((e) => e.status !== 'resigned' && (!team || team.has(e.id) || e.id === 'e0'))
        .map((e) => ({ id: e.id, fullName: e.fullName, designation: e.designation, departmentId: e.departmentId }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
      return { rows, error: null }
    }
    const { data, error: err } = await supabase.rpc('task_people', { p_client: clientId })
    if (err) return { rows: [], error: sentence(err) }
    return {
      rows: ((data ?? []) as Row[]).map((r) => ({
        id: str(r.id), fullName: str(r.full_name), designation: str(r.designation),
        departmentId: (r.department_id as string | null) ?? null,
      })),
      error: null,
    }
  }, [])

  return {
    items, people, tasks, versions, reviews, shoots, shootItems, installed, versionsOn, shootsOn, postingOn, error,
    // The render between switching on and the first load starting counts too.
    loading: loading || (enabled && !fetched.current),
    reload: () => load(true),
    createItem, updateItem, moveItem, deleteItem, setPerson,
    createTask, updateTask, deleteTask, thread, comment, assignable,
    addVersion, fixVersion, review,
    saveShoot, setShootStatus, deleteShoot, postItem, doneBetween,
  }
}

export type Work = ReturnType<typeof useWork>
