import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoLeaveRequests, isDemo } from '@/data/demo'
import type { LeaveRequest, LeaveStatus } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toLeaveRequest = (r: Row): LeaveRequest => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  startDate: str(r.start_date),
  endDate: str(r.end_date),
  daysCount: Number(r.days_count) || 0,
  reason: str(r.reason),
  status: (r.status as LeaveStatus) ?? 'pending',
  decidedBy: (r.decided_by as string | null) ?? null,
  decidedAt: (r.decided_at as string | null) ?? null,
  decisionNote: (r.decision_note as string | null) ?? null,
  createdAt: str(r.created_at),
})

export interface LeaveDraft {
  employeeId: string
  startDate: string
  endDate: string
  reason: string
}

/**
 * Leave requests, kept apart from useEmployees the way useEmployees is kept
 * apart from useWorkspace — a salesperson's own app makes this request (it
 * needs their own balance and history), but never useEmployees, which policy
 * would hand back only their own single row for anyway.
 *
 * Nothing here deletes: the table has no delete policy. A mistaken request is
 * cancelled, which is a status change, not a disappearance.
 */
export function useLeaveRequests(enabled = true) {
  const [rows, setRows] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    if (isDemo()) {
      setRows(demoLeaveRequests)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*')
      .order('start_date', { ascending: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toLeaveRequest(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const create = useCallback(async (draft: LeaveDraft): Promise<string | null> => {
    if (isDemo()) {
      const days = Math.round((new Date(draft.endDate).getTime() - new Date(draft.startDate).getTime()) / 86400000) + 1
      setRows((p) => [{
        id: 'demo-leave-' + (p.length + 1),
        employeeId: draft.employeeId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        daysCount: days,
        reason: draft.reason,
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: draft.employeeId,
        start_date: draft.startDate,
        end_date: draft.endDate,
        reason: draft.reason.trim(),
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toLeaveRequest(data as Row), ...p])
    return null
  }, [])

  /** HR/owner approve or reject. Only they can reach this — RLS refuses
   *  anybody else, so the UI hiding the buttons is a convenience only. */
  const decide = useCallback(async (id: string, status: 'approved' | 'rejected', decidedBy: string, note?: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status, decidedBy, decidedAt: new Date().toISOString(), decisionNote: note ?? null } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('leave_requests')
      .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note ?? null })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toLeaveRequest(data as Row) : r)))
    return null
  }, [])

  /** A person cancelling their own still-pending request. */
  const cancel = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('leave_requests').update({ status: 'cancelled' }).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toLeaveRequest(data as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: load, create, decide, cancel, clearError: () => setError(null) }
}

export type LeaveRequests = ReturnType<typeof useLeaveRequests>
