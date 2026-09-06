import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoOnboardingTasks, isDemo } from '@/data/demo'
import type { OnboardingTask } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toTask = (r: Row): OnboardingTask => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  label: str(r.label),
  done: !!r.done,
  doneAt: (r.done_at as string | null) ?? null,
  doneBy: (r.done_by as string | null) ?? null,
  sortOrder: Number(r.sort_order) || 0,
})

/**
 * The onboarding checklist. Seeded automatically per employee by a database
 * trigger (0011) — this hook only ever reads, toggles, adds a custom item, or
 * removes one. Toggling and adding are HR/owner-only at the database level;
 * an employee's own screen calls this read-only, same shape as salary.
 */
export function useOnboardingTasks(enabled = true) {
  const [rows, setRows] = useState<OnboardingTask[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    if (isDemo()) {
      setRows(demoOnboardingTasks)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('onboarding_tasks')
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
    const { data, error: err } = await supabase.from('onboarding_tasks').update(patch).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((t) => (t.id === id ? toTask(data as Row) : t)))
    return null
  }, [])

  const add = useCallback(async (employeeId: string, label: string): Promise<string | null> => {
    const clean = label.trim()
    if (!clean) return 'Give the task a name.'
    if (isDemo()) {
      const mine = rows.filter((t) => t.employeeId === employeeId)
      setRows((p) => [...p, {
        id: 'demo-task-' + (p.length + 1), employeeId, label: clean, done: false, doneAt: null, doneBy: null,
        sortOrder: (mine.at(-1)?.sortOrder ?? 0) + 1,
      }])
      return null
    }
    const { data, error: err } = await supabase
      .from('onboarding_tasks').insert({ employee_id: employeeId, label: clean }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toTask(data as Row)])
    return null
  }, [rows])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.filter((t) => t.id !== id))
      return null
    }
    const { error: err } = await supabase.from('onboarding_tasks').delete().eq('id', id)
    if (err) return err.message
    setRows((p) => p.filter((t) => t.id !== id))
    return null
  }, [])

  return { rows, loading, error, reload: load, toggle, add, remove, clearError: () => setError(null) }
}

export type OnboardingTasks = ReturnType<typeof useOnboardingTasks>
