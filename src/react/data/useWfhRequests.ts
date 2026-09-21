import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoHolidays, demoWfhRequests, isDemo } from '@/data/demo'
import { workingDaysBetween } from '@/lib/hr'
import type { WfhRequest, LeaveStatus } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

let channelSeq = 0

const toWfhRequest = (r: Row): WfhRequest => ({
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

export interface WfhDraft {
  employeeId: string
  startDate: string
  endDate: string
  reason: string
}

/**
 * Work-from-home requests — same apply/approve shape as useLeaveRequests,
 * its own table and its own hook (0027): it does not spend the paid-leave
 * balance and carries no leave type.
 */
export function useWfhRequests(enabled = true, onIncoming?: (row: WfhRequest) => void) {
  const [rows, setRows] = useState<WfhRequest[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  const rowsRef = useRef<WfhRequest[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoWfhRequests)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('wfh_requests').select('*').order('start_date', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toWfhRequest(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase.channel(`wfh-requests-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wfh_requests' }, (p: any) => {
          const row = toWfhRequest(p.new as Row)
          if (rowsRef.current.some((r) => r.id === row.id)) return
          setRows((prev) => [row, ...prev])
          onIncoming?.(row)
        })
        .subscribe()
    } catch (e) {
      console.error('[Metrol CRM] WFH requests realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled, onIncoming])

  const create = useCallback(async (draft: WfhDraft): Promise<string | null> => {
    if (isDemo()) {
      const days = workingDaysBetween(draft.startDate, draft.endDate, [0], demoHolidays.map((h) => h.date)).total
      setRows((p) => [{
        id: 'demo-wfh-' + (p.length + 1),
        employeeId: draft.employeeId, startDate: draft.startDate, endDate: draft.endDate,
        daysCount: days, reason: draft.reason.trim(),
        status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null,
        createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('wfh_requests')
      .insert({
        employee_id: draft.employeeId,
        start_date: draft.startDate,
        end_date: draft.endDate,
        reason: draft.reason.trim(),
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toWfhRequest(data as Row), ...p])
    return null
  }, [])

  const decide = useCallback(async (id: string, status: 'approved' | 'rejected', decidedBy: string, note?: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status, decidedBy, decidedAt: new Date().toISOString(), decisionNote: note ?? null } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('wfh_requests')
      .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note ?? null })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toWfhRequest(data as Row) : r)))
    return null
  }, [])

  const cancel = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('wfh_requests').update({ status: 'cancelled' }).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toWfhRequest(data as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), create, decide, cancel, clearError: () => setError(null) }
}

export type WfhRequests = ReturnType<typeof useWfhRequests>
