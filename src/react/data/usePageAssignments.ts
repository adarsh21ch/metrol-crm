import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoPageAssignments, isDemo } from '@/data/demo'
import type { PageAssignment } from '@/lib/hr'

type Row = Record<string, unknown>

const toAssignment = (r: Row): PageAssignment => ({
  id: String(r.id),
  pageId: String(r.page_id),
  employeeId: String(r.employee_id),
  assignedAt: String(r.assigned_at ?? ''),
})

/**
 * Who currently manages which page (0032) — many-to-many, current state
 * only. Realtime for the same reason usePages is: an employee assigned a
 * fresh page, or a department head's roster, should not need a reload.
 * Writes are HR/owner only at the database (page_assignments_write); `assign`
 * and `unassign` below are only ever called from HrPage.
 */
let channelSeq = 0

export function usePageAssignments(enabled = true) {
  const [rows, setRows] = useState<PageAssignment[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoPageAssignments)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase.from('page_assignments').select('*')
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toAssignment(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase.channel(`page-assignments-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'page_assignments' }, (p: any) => {
          const row = toAssignment(p.new as Row)
          setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'page_assignments' }, (p: any) => {
          const gone = String((p.old as Row)?.id ?? '')
          setRows((prev) => prev.filter((r) => r.id !== gone))
        })
        .subscribe()
    } catch (e) {
      console.error('[Metrol CRM] page assignments realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled])

  const assign = useCallback(async (pageId: string, employeeId: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => (p.some((a) => a.pageId === pageId && a.employeeId === employeeId) ? p : [
        ...p, { id: 'demo-pa-' + (p.length + 1), pageId, employeeId, assignedAt: new Date().toISOString() },
      ]))
      return null
    }
    const { data, error: err } = await supabase
      .from('page_assignments').insert({ page_id: pageId, employee_id: employeeId }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toAssignment(data as Row)])
    return null
  }, [])

  const unassign = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) { setRows((p) => p.filter((a) => a.id !== id)); return null }
    const { error: err } = await supabase.from('page_assignments').delete().eq('id', id)
    if (err) return err.message
    setRows((p) => p.filter((a) => a.id !== id))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), assign, unassign, clearError: () => setError(null) }
}

export type PageAssignments = ReturnType<typeof usePageAssignments>
