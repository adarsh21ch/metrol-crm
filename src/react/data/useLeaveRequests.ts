import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoHolidays, demoLeaveRequests, isDemo } from '@/data/demo'
import { workingDaysBetween } from '@/lib/hr'
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Makes every realtime topic its own — see the subscribe effect below. */
let channelSeq = 0

const toLeaveRequest = (r: Row): LeaveRequest => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  startDate: str(r.start_date),
  endDate: str(r.end_date),
  daysCount: Number(r.days_count) || 0,
  leaveType: (r.leave_type as LeaveType) ?? 'casual',
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
  leaveType: LeaveType
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
export function useLeaveRequests(enabled = true, onIncoming?: (row: LeaveRequest) => void) {
  const [rows, setRows] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  // Mirrors `rows` for the realtime handler below, which needs to know
  // whether an insert is one this client just made itself (already in state
  // by the time Postgres echoes it back) without becoming a dependency that
  // would tear the channel down and rebuild it on every request.
  const rowsRef = useRef<LeaveRequest[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

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

  /* Somebody else's request landing while this browser is open — the case
   * `onIncoming` exists for. 0009 already put this table on the realtime
   * publication; nothing before this subscribed to it, so a request from
   * another browser sat invisible until the next reload. RLS applies to this
   * stream exactly as it does to a query (see useWorkspace's leads channel),
   * so this widens nothing: HR/owner already see every row, an employee only
   * their own.
   *
   * `known` (via rowsRef, not `rows`) is what tells this client's own insert
   * apart from somebody else's: `create` below already pushes the new row
   * into state before this echo can arrive, so a row already present is this
   * browser's own write coming back, not news. */
  useEffect(() => {
    if (!enabled || isDemo()) return
    /* The topic is unique per mount, never the bare 'leave-requests-live' it
       used to be. supabase.channel() hands back an EXISTING channel when the
       topic matches, and .on('postgres_changes') THROWS on a channel that has
       already subscribed — an uncaught throw in an effect, which unmounts the
       whole tree and paints the window white. That is the 2026-09-18 crash.
       Member and HrPage are mutually exclusive routes today, so only one of
       them ever holds this hook; a topic nobody else can collide with is what
       keeps that from being load-bearing. It also settles the unmount/remount
       race — removeChannel() is async, so navigating away and straight back
       re-enters this effect while the old channel is still in the client's
       list, and this effect re-runs on every change of `onIncoming`. */
    const channel = supabase.channel(`leave-requests-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leave_requests' }, (p: any) => {
          const row = toLeaveRequest(p.new as Row)
          if (rowsRef.current.some((r) => r.id === row.id)) return
          setRows((prev) => [row, ...prev])
          onIncoming?.(row)
        })
        .subscribe()
    } catch (e) {
      /* The list itself still loads above and every Refresh re-reads it. What
         is lost is somebody else's request arriving unprompted — the alert
         stack stays quiet until the next reload. Losing the subscription must
         cost the live alert, never the screen. */
      console.error('[Metrol CRM] leave requests realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled, onIncoming])

  const create = useCallback(async (draft: LeaveDraft): Promise<string | null> => {
    if (isDemo()) {
      // The same rule 0016's trigger applies, so demo mode cannot show a day
      // count the real database would never produce.
      const days = workingDaysBetween(draft.startDate, draft.endDate, [0], demoHolidays.map((h) => h.date)).total
      setRows((p) => [{
        id: 'demo-leave-' + (p.length + 1),
        employeeId: draft.employeeId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        daysCount: days,
        leaveType: draft.leaveType,
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
        leave_type: draft.leaveType,
        reason: draft.reason.trim(),
        // days_count is deliberately not sent. 0016's trigger works it out
        // from the two dates, minus Sundays and holidays, and overwrites
        // anything the client puts here.
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

  return { rows, loading, error, reload: () => load(true), create, decide, cancel, clearError: () => setError(null) }
}

export type LeaveRequests = ReturnType<typeof useLeaveRequests>
