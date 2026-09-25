import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoAdjustments, demoTargetPeriods, demoTargets, isDemo } from '@/data/demo'
import { loadTable, newId, numOrNull, str, type Row } from '@/data/agencySchema'
import type { Platform, ViewAdjustment, ViewTarget, ViewTargetPeriod, WeekRule } from '@/lib/agency'

const toTarget = (r: Row): ViewTarget => ({
  id: str(r.id),
  clientId: str(r.client_id),
  label: str(r.label),
  totalViews: Number(r.total_views) || 0,
  startsOn: str(r.starts_on),
  endsOn: str(r.ends_on),
  countMain: r.count_main !== false,
  countFan: r.count_fan !== false,
  platforms: ((r.platforms as string[] | null) ?? ['instagram', 'youtube']) as Platform[],
  weekCountsIn: (r.week_counts_in as WeekRule) ?? 'start',
  isActive: r.is_active !== false,
  notes: str(r.notes),
})

const toPeriod = (r: Row): ViewTargetPeriod => ({
  id: str(r.id),
  targetId: str(r.target_id),
  label: str(r.label),
  startsOn: str(r.starts_on),
  endsOn: str(r.ends_on),
  sharePct: numOrNull(r.share_pct),
  targetViews: numOrNull(r.target_views),
  sortOrder: Number(r.sort_order) || 0,
})

const toAdjustment = (r: Row): ViewAdjustment => ({
  id: str(r.id),
  targetId: str(r.target_id),
  periodId: (r.period_id as string | null) ?? null,
  weekStart: (r.week_start as string | null) ?? null,
  typeId: str(r.type_id),
  views: Number(r.views) || 0,
  note: str(r.note),
  createdAt: str(r.created_at),
})

export type TargetDraft = Omit<ViewTarget, 'id' | 'isActive'>
/** id is null for a period added in this save. */
export type PeriodDraft = Omit<ViewTargetPeriod, 'id' | 'targetId'> & { id: string | null }
export type AdjustmentDraft = Omit<ViewAdjustment, 'id' | 'createdAt'>

/**
 * View targets, their periods and their adjustments (0037). RLS returns only
 * the targets this person may see (view_targets) — an empty list for
 * everybody else, which is how a screen knows to leave the Targets tab out.
 */
export function useTargets(enabled = true) {
  const [targets, setTargets] = useState<ViewTarget[]>([])
  const [periods, setPeriods] = useState<ViewTargetPeriod[]>([])
  const [adjustments, setAdjustments] = useState<ViewAdjustment[]>([])
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setTargets(demoTargets); setPeriods(demoTargetPeriods); setAdjustments(demoAdjustments)
      setLoading(false)
      return
    }
    const [t, p, a] = await Promise.all([
      loadTable('view_targets', toTarget, (q) => q.order('starts_on', { ascending: false })),
      loadTable('view_target_periods', toPeriod, (q) => q.order('starts_on', { ascending: true })),
      loadTable('view_adjustments', toAdjustment, (q) => q.order('created_at', { ascending: true })),
    ])
    setInstalled(!t.missing)
    setError(t.error ?? p.error ?? a.error)
    setTargets(t.rows); setPeriods(p.rows); setAdjustments(a.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** A target and its whole period list, in one transaction
   *  (save_view_target, 0037) — so moving one period's end and the next
   *  one's start in the same save is never refused as an overlap. */
  const saveTarget = useCallback(async (id: string | null, d: TargetDraft, ps: PeriodDraft[]): Promise<{ error: string | null; id: string | null }> => {
    if (!d.label.trim()) return { error: 'Give the target a name.', id: null }
    if (!(d.totalViews > 0)) return { error: 'The target needs a number of views.', id: null }
    if (d.endsOn < d.startsOn) return { error: 'The target ends before it starts.', id: null }
    for (const p of ps) {
      if (!p.label.trim()) return { error: 'Every period needs a name.', id: null }
      if (p.endsOn < p.startsOn) return { error: `${p.label} ends before it starts.`, id: null }
      if (p.sharePct == null && p.targetViews == null) return { error: `${p.label} needs a share or its own number.`, id: null }
    }
    if (isDemo()) {
      const tid = id ?? newId('vt')
      setTargets((p) => {
        const row: ViewTarget = { ...d, id: tid, isActive: true, label: d.label.trim() }
        return id ? p.map((t) => (t.id === id ? row : t)) : [row, ...p]
      })
      setPeriods((p) => [
        ...p.filter((x) => x.targetId !== tid),
        ...ps.map((x) => ({ ...x, id: x.id ?? newId('tp'), targetId: tid, label: x.label.trim() })),
      ])
      return { error: null, id: tid }
    }
    const { data, error: err } = await supabase.rpc('save_view_target', {
      p_target: {
        id, client_id: d.clientId, label: d.label.trim(), total_views: d.totalViews, starts_on: d.startsOn, ends_on: d.endsOn,
        count_main: d.countMain, count_fan: d.countFan, platforms: d.platforms, week_counts_in: d.weekCountsIn, notes: d.notes,
      },
      p_periods: ps.map((x) => ({
        id: x.id, label: x.label.trim(), starts_on: x.startsOn, ends_on: x.endsOn,
        share_pct: x.sharePct, target_views: x.targetViews, sort_order: x.sortOrder,
      })),
    })
    if (err) return { error: err.message, id: null }
    await load(true)
    return { error: null, id: String(data) }
  }, [load])

  /** Retire, never delete — the weekly numbers that counted toward it stay. */
  const setTargetActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    setTargets((p) => p.map((t) => (t.id === id ? { ...t, isActive } : t)))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('view_targets').update({ is_active: isActive }).eq('id', id).select('id')
    if (err || !data?.length) {
      setTargets((p) => p.map((t) => (t.id === id ? { ...t, isActive: !isActive } : t)))
      return err?.message ?? 'You do not have permission to change this target.'
    }
    return null
  }, [])

  const saveAdjustment = useCallback(async (id: string | null, d: AdjustmentDraft): Promise<string | null> => {
    if (!d.views) return 'An adjustment needs a number — negative takes views away.'
    const row = { target_id: d.targetId, period_id: d.periodId, week_start: d.weekStart, type_id: d.typeId, views: d.views, note: d.note.trim() || null }
    if (isDemo()) {
      const saved: ViewAdjustment = { ...d, id: id ?? newId('va'), createdAt: new Date().toISOString(), note: d.note.trim() }
      setAdjustments((p) => (id ? p.map((a) => (a.id === id ? saved : a)) : [...p, saved]))
      return null
    }
    const q = id ? supabase.from('view_adjustments').update(row).eq('id', id) : supabase.from('view_adjustments').insert(row)
    const { data, error: err } = await q.select('*').single()
    if (err) return err.message
    if (!data) return 'You do not have permission to change this target.'
    const saved = toAdjustment(data as Row)
    setAdjustments((p) => (id ? p.map((a) => (a.id === id ? saved : a)) : [...p, saved]))
    return null
  }, [])

  const removeAdjustment = useCallback(async (id: string): Promise<string | null> => {
    const before = adjustments
    setAdjustments((p) => p.filter((a) => a.id !== id))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('view_adjustments').delete().eq('id', id).select('id')
    if (err || !data?.length) { setAdjustments(before); return err?.message ?? 'You do not have permission to change this target.' }
    return null
  }, [adjustments])

  return {
    targets, periods, adjustments, installed, loading, error, reload: () => load(true),
    saveTarget, setTargetActive, saveAdjustment, removeAdjustment,
  }
}

export type Targets = ReturnType<typeof useTargets>
