import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoTdsCategories, isDemo } from '@/data/demo'
import type { TdsCategory } from '@/lib/hr'

type Row = Record<string, unknown>

const toCategory = (r: Row): TdsCategory => ({
  id: String(r.id),
  label: String(r.label ?? ''),
  ratePercent: Number(r.rate_percent) || 0,
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

/**
 * HR's own TDS categories — "Contract" (1%) and "Professional" (10%) to
 * start (0029), editable without a deploy. Same shape as useVisitPurposes:
 * small, rarely changed, no realtime subscription.
 */
export function useTdsCategories(enabled = true) {
  const [rows, setRows] = useState<TdsCategory[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoTdsCategories)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('tds_categories').select('*').order('sort_order', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toCategory(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const add = useCallback(async (label: string, ratePercent: number): Promise<string | null> => {
    const clean = label.trim()
    if (!clean) return 'Give the category a name.'
    if (isDemo()) {
      setRows((p) => [...p, { id: 'demo-tds-' + (p.length + 1), label: clean, ratePercent, sortOrder: p.length + 1, isActive: true }])
      return null
    }
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1
    const { data, error: err } = await supabase
      .from('tds_categories').insert({ label: clean, rate_percent: ratePercent, sort_order: nextOrder }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toCategory(data as Row)])
    return null
  }, [rows])

  const update = useCallback(async (id: string, patch: { label?: string; ratePercent?: number }): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.ratePercent !== undefined ? { ratePercent: patch.ratePercent } : {}) } : r)))
      return null
    }
    const row: Row = {}
    if (patch.label !== undefined) row.label = patch.label.trim()
    if (patch.ratePercent !== undefined) row.rate_percent = patch.ratePercent
    const { error: err } = await supabase.from('tds_categories').update(row).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...(patch.label !== undefined ? { label: patch.label!.trim() } : {}), ...(patch.ratePercent !== undefined ? { ratePercent: patch.ratePercent! } : {}) } : r)))
    return null
  }, [])

  const setActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
      return null
    }
    const { error: err } = await supabase.from('tds_categories').update({ is_active: isActive }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), add, update, setActive, clearError: () => setError(null) }
}

export type TdsCategories = ReturnType<typeof useTdsCategories>
