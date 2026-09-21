import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoVisitPurposes, isDemo } from '@/data/demo'
import type { VisitPurpose } from '@/lib/hr'

type Row = Record<string, unknown>

const toPurpose = (r: Row): VisitPurpose => ({
  id: String(r.id),
  label: String(r.label ?? ''),
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

/**
 * HR's own dropdown for "what kind of visit is this" — Shoot / Client
 * meeting / Branch visit to start, editable without a deploy (0027). Small
 * and rarely changed, so unlike leave/visit/WFH requests this carries no
 * realtime subscription — a Refresh or the next reload picks up an edit.
 */
export function useVisitPurposes(enabled = true) {
  const [rows, setRows] = useState<VisitPurpose[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoVisitPurposes)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('visit_purposes').select('*').order('sort_order', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toPurpose(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** Adding is also how HR renames one in practice — the modal that calls
   *  this always has an id when it means to edit. */
  const add = useCallback(async (label: string): Promise<string | null> => {
    const clean = label.trim()
    if (!clean) return 'Give the purpose a name.'
    if (isDemo()) {
      setRows((p) => [...p, { id: 'demo-vp-' + (p.length + 1), label: clean, sortOrder: p.length + 1, isActive: true }])
      return null
    }
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1
    const { data, error: err } = await supabase
      .from('visit_purposes').insert({ label: clean, sort_order: nextOrder }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toPurpose(data as Row)])
    return null
  }, [rows])

  const rename = useCallback(async (id: string, label: string): Promise<string | null> => {
    const clean = label.trim()
    if (!clean) return 'Give the purpose a name.'
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, label: clean } : r)))
      return null
    }
    const { error: err } = await supabase.from('visit_purposes').update({ label: clean }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, label: clean } : r)))
    return null
  }, [])

  /** Retiring an option, not deleting it — a visit_entries row filed under it
   *  must keep reading its original name (0027). */
  const setActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
      return null
    }
    const { error: err } = await supabase.from('visit_purposes').update({ is_active: isActive }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), add, rename, setActive, clearError: () => setError(null) }
}

export type VisitPurposes = ReturnType<typeof useVisitPurposes>
