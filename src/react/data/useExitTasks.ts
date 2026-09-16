import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoExitTasks, isDemo } from '@/data/demo'
import type { ExitTask } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toTask = (r: Row): ExitTask => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  label: str(r.label),
  done: !!r.done,
  doneAt: (r.done_at as string | null) ?? null,
  doneBy: (r.done_by as string | null) ?? null,
  sortOrder: Number(r.sort_order) || 0,
})

/**
 * The exit checklist. Auto-seeded by a database trigger the first time an
 * employee's status leaves 'active' (0012) — this hook only ever reads or
 * toggles. An employee's own screen calls this read-only, same reasoning as
 * onboarding: HR confirms a laptop came back, not the person handing it in.
 */
export function useExitTasks(enabled = true) {
  const [rows, setRows] = useState<ExitTask[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    /* Fetch once per mount, not once per visit. Gating these hooks on the
       section that reads them (so opening HR stopped firing nine queries)
       had a cost nobody asked for: `enabled` flips on every tab switch, so
       going Salary → Leave → Salary re-queried Salary each time and the tab
       felt like it was thinking. The rows are already in state and correct;
       re-reading them to learn the same thing is the definition of a slow
       tab. `reload(true)` still forces a genuine re-read, which is what the
       Refresh buttons and the post-write reconciles call. */
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoExitTasks)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('exit_tasks')
      .select('*')
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toTask(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const toggle = useCallback(async (id: string, done: boolean, doneBy: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((t) => (t.id === id ? { ...t, done, doneAt: done ? new Date().toISOString() : null, doneBy: done ? doneBy : null } : t)))
      return null
    }
    const patch = done ? { done, done_by: doneBy, done_at: new Date().toISOString() } : { done, done_by: null, done_at: null }

    // A checkbox that waits for the network before it ticks is the most
    // obviously broken thing in any app — you press it and nothing happens.
    // Tick it now, untick it if the server refuses.
    const before = { done: !done }
    setRows((p) => p.map((t) => (t.id === id
      ? { ...t, done, doneAt: done ? new Date().toISOString() : null, doneBy: done ? doneBy : null } : t)))

    const { data, error: err } = await supabase.from('exit_tasks').update(patch).eq('id', id).select('*').single()
    if (err) {
      setRows((p) => p.map((t) => (t.id === id ? { ...t, ...before } : t)))
      return err.message
    }
    if (data) setRows((p) => p.map((t) => (t.id === id ? toTask(data as Row) : t)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), toggle, clearError: () => setError(null) }
}

export type ExitTasks = ReturnType<typeof useExitTasks>
