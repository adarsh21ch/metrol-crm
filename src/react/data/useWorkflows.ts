import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoContentFormats, demoTaskStatuses, demoWorkflowStages, demoWorkflows, isDemo } from '@/data/demo'
import { loadTable, newId, numOrNull, str, type Row } from '@/data/agencySchema'
import type { ListItem, PageKind, StageDraft, TaskStatus, Tone, Workflow, WorkflowStage } from '@/lib/agency'

const toWorkflow = (r: Row): Workflow => ({
  id: str(r.id),
  name: str(r.name),
  pageType: (r.page_type as PageKind | null) ?? null,
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

const toStage = (r: Row): WorkflowStage => ({
  id: str(r.id),
  workflowId: str(r.workflow_id),
  name: str(r.name),
  sortOrder: Number(r.sort_order) || 0,
  ownerRoleId: (r.owner_role_id as string | null) ?? null,
  isReview: r.is_review === true,
  clientVisible: r.client_visible === true,
  isDone: r.is_done === true,
  tone: (r.tone as Tone) ?? 'mute',
  slaHours: numOrNull(r.sla_hours),
  isActive: r.is_active !== false,
})

const toStatus = (r: Row): TaskStatus => ({
  id: str(r.id),
  name: str(r.name),
  tone: (r.tone as Tone) ?? 'mute',
  sortOrder: Number(r.sort_order) || 0,
  isDone: r.is_done === true,
  isActive: r.is_active !== false,
})

const toFormat = (r: Row): ListItem => ({
  id: str(r.id),
  name: str(r.name),
  tone: 'mute',
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
const nextOrder = (rows: { sortOrder: number }[]) => rows.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1

/** The lists a drag can reorder — the same four reorder_workflow_list() takes. */
type ListTable = 'workflows' | 'workflow_stages' | 'task_statuses' | 'content_formats'

/** Postgres' answer, in words somebody can act on. */
function sentence(err: { code?: string; message: string }, duplicate: string): string {
  if (err.code === '23505') return duplicate
  if (err.code === '42501') return 'You do not have permission to change this list.'
  return err.message
}

/**
 * Workflows, their stages, task statuses and content formats (0043) — the
 * lists Phase 2 runs on, edited on Settings → Workflows & lists. Small and
 * rarely changed: loaded once, no realtime, same as useAgencyLists.
 *
 * Before 0043 is on the database every list is empty and `installed` is
 * false, so the screen can say so instead of showing an error.
 */
export function useWorkflows(enabled = true) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [formats, setFormats] = useState<ListItem[]>([])
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setWorkflows(demoWorkflows); setStages(demoWorkflowStages)
      setStatuses(demoTaskStatuses); setFormats(demoContentFormats)
      setLoading(false)
      return
    }
    const [w, s, t, f] = await Promise.all([
      loadTable('workflows', toWorkflow),
      loadTable('workflow_stages', toStage),
      loadTable('task_statuses', toStatus),
      loadTable('content_formats', toFormat),
    ])
    setInstalled(!w.missing)
    setError(w.error ?? s.error ?? t.error ?? f.error)
    setWorkflows(w.rows.sort(byOrder)); setStages(s.rows.sort(byOrder))
    setStatuses(t.rows.sort(byOrder)); setFormats(f.rows.sort(byOrder))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** Insert or update one row and hand back what the database kept. An
   *  update RLS filters out returns no row at all — say so, never "Saved." */
  const write = async (table: ListTable, id: string | null, row: Row, duplicate: string) => {
    const q = id ? supabase.from(table).update(row).eq('id', id) : supabase.from(table).insert(row)
    const { data, error: err } = await q.select('*').maybeSingle()
    if (err) return { data: null, error: sentence(err, duplicate) }
    if (!data) return { data: null, error: 'You do not have permission to change this list.' }
    return { data: data as Row, error: null }
  }

  /* ------------------------------------------------------------ workflows */

  const saveWorkflow = useCallback(async (
    id: string | null,
    patch: { name: string; pageType: PageKind | null; isActive: boolean },
    copyFrom: string | null = null,
  ): Promise<{ error: string | null; id: string | null }> => {
    const name = patch.name.trim()
    if (!name) return { error: 'Give it a name.', id: null }
    const row: Row = { name, page_type: patch.pageType, is_active: patch.isActive }
    if (!id) row.sort_order = nextOrder(workflows)
    const copied = copyFrom ? stages.filter((s) => s.workflowId === copyFrom).sort(byOrder) : []
    if (isDemo()) {
      const wf: Workflow = id
        ? { ...workflows.find((w) => w.id === id)!, name, pageType: patch.pageType, isActive: patch.isActive }
        : { id: newId('wf'), name, pageType: patch.pageType, isActive: true, sortOrder: Number(row.sort_order) }
      setWorkflows((p) => (id ? p.map((w) => (w.id === id ? wf : w)) : [...p, wf]))
      if (!id && copied.length) setStages((p) => [...p, ...copied.map((s) => ({ ...s, id: newId('st'), workflowId: wf.id }))])
      return { error: null, id: wf.id }
    }
    const r = await write('workflows', id, row, 'There is already a workflow by that name.')
    if (r.error || !r.data) return { error: r.error, id: null }
    const wf = toWorkflow(r.data)
    setWorkflows((p) => (id ? p.map((w) => (w.id === id ? wf : w)) : [...p, wf]))
    if (!id && copied.length) {
      const { data, error: err } = await supabase.from('workflow_stages').insert(copied.map((s) => ({
        workflow_id: wf.id, name: s.name, sort_order: s.sortOrder, owner_role_id: s.ownerRoleId,
        is_review: s.isReview, client_visible: s.clientVisible, is_done: s.isDone, tone: s.tone,
        sla_hours: s.slaHours, is_active: s.isActive,
      }))).select('*')
      if (err) return { error: `The workflow was added, but its stages were not copied: ${err.message}`, id: wf.id }
      setStages((p) => [...p, ...((data ?? []) as Row[]).map(toStage)].sort(byOrder))
    }
    return { error: null, id: wf.id }
  }, [workflows, stages])

  /* --------------------------------------------------------------- stages */

  const saveStage = useCallback(async (id: string | null, workflowId: string, d: StageDraft): Promise<string | null> => {
    const name = d.name.trim()
    if (!name) return 'Give the stage a name.'
    const row: Row = {
      name, owner_role_id: d.ownerRoleId, is_review: d.isReview, client_visible: d.clientVisible,
      is_done: d.isDone, tone: d.tone, sla_hours: d.slaHours, is_active: d.isActive,
    }
    const flow = stages.filter((s) => s.workflowId === workflowId).sort(byOrder)
    if (!id) { row.workflow_id = workflowId; row.sort_order = nextOrder(flow) }
    // A new stage goes in just above the finish, not under it: a reel stops at
    // the finish, so a stage after "Posted" could never be reached. A new
    // finish still goes last. The whole order is saved in one call.
    const finish = !id && !d.isDone ? flow.find((s) => s.isDone) : undefined
    const orderWith = (newStageId: string) => {
      const ids = flow.map((s) => s.id)
      ids.splice(ids.indexOf(finish!.id), 0, newStageId)
      return ids
    }
    const renumber = (ids: string[]) => {
      const at = new Map(ids.map((x, i) => [x, i + 1]))
      return (rows: WorkflowStage[]) => rows.map((s) => (at.has(s.id) ? { ...s, sortOrder: at.get(s.id)! } : s)).sort(byOrder)
    }
    if (isDemo()) {
      const st: WorkflowStage = id
        ? { ...stages.find((s) => s.id === id)!, ...d, name }
        : { ...d, name, id: newId('st'), workflowId, sortOrder: Number(row.sort_order) }
      setStages((p) => {
        const next = id ? p.map((s) => (s.id === id ? st : s)) : [...p, st]
        return finish ? renumber(orderWith(st.id))(next) : next
      })
      return null
    }
    const r = await write('workflow_stages', id, row, 'This workflow already has a stage by that name.')
    if (r.error || !r.data) return r.error
    const st = toStage(r.data)
    if (finish) {
      const ids = orderWith(st.id)
      const { error: err } = await supabase.rpc('reorder_workflow_list', { p_table: 'workflow_stages', p_ids: ids })
      if (err) {
        // Saved, but not in its place — say so rather than let it look right.
        setStages((p) => [...p, st])
        return `Saved, but it went to the bottom of the list. Drag it above "${finish.name}".`
      }
      setStages((p) => renumber(ids)([...p, st]))
      return null
    }
    setStages((p) => (id ? p.map((s) => (s.id === id ? st : s)) : [...p, st]))
    return null
  }, [stages])

  /** The owner role alone — the row's own dropdown. Optimistic: the answer
   *  is already on screen; a refusal puts the old one back and says why. */
  const setStageOwner = useCallback(async (stage: WorkflowStage, ownerRoleId: string | null): Promise<string | null> => {
    setStages((p) => p.map((s) => (s.id === stage.id ? { ...s, ownerRoleId } : s)))
    if (isDemo()) return null
    const r = await write('workflow_stages', stage.id, { owner_role_id: ownerRoleId }, '')
    if (r.error) {
      setStages((p) => p.map((s) => (s.id === stage.id ? { ...s, ownerRoleId: stage.ownerRoleId } : s)))
      return r.error
    }
    return null
  }, [])

  /** Delete a stage nothing uses; one that content items sit in (Round 2)
   *  is refused by the database, and is retired instead. */
  const removeStage = useCallback(async (stage: WorkflowStage): Promise<{ error: string | null; retired: boolean }> => {
    if (isDemo()) { setStages((p) => p.filter((s) => s.id !== stage.id)); return { error: null, retired: false } }
    const { data, error: err } = await supabase.from('workflow_stages').delete().eq('id', stage.id).select('id')
    if (err?.code === '23503') {
      const r = await write('workflow_stages', stage.id, { is_active: false }, '')
      if (r.error || !r.data) return { error: r.error, retired: false }
      const st = toStage(r.data)
      setStages((p) => p.map((s) => (s.id === stage.id ? st : s)))
      return { error: null, retired: true }
    }
    if (err) return { error: sentence(err, ''), retired: false }
    if (!data?.length) return { error: 'You do not have permission to change this list.', retired: false }
    setStages((p) => p.filter((s) => s.id !== stage.id))
    return { error: null, retired: false }
  }, [])

  /* ------------------------------------------------------------- ordering */

  /** One call for the whole new order, so a list is never half-saved. */
  const reorder = useCallback(async (table: 'workflow_stages' | 'task_statuses', ids: string[]): Promise<string | null> => {
    const rank = new Map(ids.map((id, i) => [id, i + 1]))
    const apply = <T extends { id: string; sortOrder: number; name: string }>(rows: T[]) =>
      rows.map((r) => (rank.has(r.id) ? { ...r, sortOrder: rank.get(r.id)! } : r)).sort(byOrder)
    const beforeStages = stages
    const beforeStatuses = statuses
    if (table === 'workflow_stages') setStages(apply); else setStatuses(apply)
    if (isDemo()) return null
    const { error: err } = await supabase.rpc('reorder_workflow_list', { p_table: table, p_ids: ids })
    if (err) {
      if (table === 'workflow_stages') setStages(beforeStages); else setStatuses(beforeStatuses)
      return err.message
    }
    return null
  }, [stages, statuses])

  /* ---------------------------------------------------- statuses, formats */

  const saveStatus = useCallback(async (
    id: string | null, patch: { name: string; tone: Tone; isDone: boolean; isActive: boolean },
  ): Promise<string | null> => {
    const name = patch.name.trim()
    if (!name) return 'Give it a name.'
    const row: Row = { name, tone: patch.tone, is_done: patch.isDone, is_active: patch.isActive }
    if (!id) row.sort_order = nextOrder(statuses)
    if (isDemo()) {
      const st: TaskStatus = id
        ? { ...statuses.find((s) => s.id === id)!, ...patch, name }
        : { ...patch, name, id: newId('ts'), isActive: true, sortOrder: Number(row.sort_order) }
      setStatuses((p) => (id ? p.map((s) => (s.id === id ? st : s)) : [...p, st]))
      return null
    }
    const r = await write('task_statuses', id, row, 'That status is already on the list.')
    if (r.error || !r.data) return r.error
    const st = toStatus(r.data)
    setStatuses((p) => (id ? p.map((s) => (s.id === id ? st : s)) : [...p, st]))
    return null
  }, [statuses])

  const saveFormat = useCallback(async (id: string | null, patch: { name: string; isActive: boolean }): Promise<string | null> => {
    const name = patch.name.trim()
    if (!name) return 'Give it a name.'
    const row: Row = { name, is_active: patch.isActive }
    if (!id) row.sort_order = nextOrder(formats)
    if (isDemo()) {
      const f: ListItem = id
        ? { ...formats.find((x) => x.id === id)!, name, isActive: patch.isActive }
        : { id: newId('cf'), name, tone: 'mute', isActive: true, sortOrder: Number(row.sort_order) }
      setFormats((p) => (id ? p.map((x) => (x.id === id ? f : x)) : [...p, f]))
      return null
    }
    const r = await write('content_formats', id, row, 'That format is already on the list.')
    if (r.error || !r.data) return r.error
    const f = toFormat(r.data)
    setFormats((p) => (id ? p.map((x) => (x.id === id ? f : x)) : [...p, f]))
    return null
  }, [formats])

  return {
    workflows, stages, statuses, formats, installed, loading, error,
    reload: () => load(true),
    saveWorkflow, saveStage, setStageOwner, removeStage, reorder, saveStatus, saveFormat,
  }
}

export type Workflows = ReturnType<typeof useWorkflows>
