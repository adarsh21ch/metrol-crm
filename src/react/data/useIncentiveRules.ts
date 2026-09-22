import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoIncentiveRules, isDemo } from '@/data/demo'
import type { IncentiveRule, IncentivePageType } from '@/lib/hr'

type Row = Record<string, unknown>

const toRule = (r: Row): IncentiveRule => ({
  id: String(r.id),
  departmentId: String(r.department_id),
  pageType: (r.page_type as IncentivePageType) ?? 'main',
  label: String(r.label ?? ''),
  minViews: Number(r.min_views) || 0,
  amount: Number(r.amount) || 0,
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

/**
 * HR's own incentive tiers, per department (0031) — Social Media's four
 * rows (main/fan × 1M/10M) seeded to start, editable and extendable to any
 * other department without a deploy. Same shape as useTdsCategories: small,
 * rarely changed, no realtime subscription.
 */
export function useIncentiveRules(enabled = true) {
  const [rows, setRows] = useState<IncentiveRule[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoIncentiveRules)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('incentive_rules').select('*').order('sort_order', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toRule(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const add = useCallback(async (draft: {
    departmentId: string; pageType: IncentivePageType; label: string; minViews: number; amount: number
  }): Promise<string | null> => {
    const clean = draft.label.trim()
    if (!clean) return 'Give the tier a name.'
    if (isDemo()) {
      setRows((p) => [...p, {
        id: 'demo-ir-' + (p.length + 1), departmentId: draft.departmentId, pageType: draft.pageType,
        label: clean, minViews: draft.minViews, amount: draft.amount, sortOrder: p.length + 1, isActive: true,
      }])
      return null
    }
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1
    const { data, error: err } = await supabase
      .from('incentive_rules').insert({
        department_id: draft.departmentId, page_type: draft.pageType, label: clean,
        min_views: draft.minViews, amount: draft.amount, sort_order: nextOrder,
      }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toRule(data as Row)])
    return null
  }, [rows])

  const update = useCallback(async (id: string, patch: { label?: string; minViews?: number; amount?: number }): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      return null
    }
    const row: Row = {}
    if (patch.label !== undefined) row.label = patch.label.trim()
    if (patch.minViews !== undefined) row.min_views = patch.minViews
    if (patch.amount !== undefined) row.amount = patch.amount
    const { error: err } = await supabase.from('incentive_rules').update(row).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch, ...(patch.label !== undefined ? { label: patch.label.trim() } : {}) } : r)))
    return null
  }, [])

  /** Retiring a tier, not deleting it — a claim already paid under it must
   *  keep reading the amount it was actually paid at. */
  const setActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
      return null
    }
    const { error: err } = await supabase.from('incentive_rules').update({ is_active: isActive }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), add, update, setActive, clearError: () => setError(null) }
}

export type IncentiveRules = ReturnType<typeof useIncentiveRules>
