import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoHolidays, demoVisitEntries, isDemo } from '@/data/demo'
import { workingDaysBetween } from '@/lib/hr'
import type { VisitEntry, VisitType, LeaveStatus } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

let channelSeq = 0

const toVisitEntry = (r: Row): VisitEntry => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  purposeId: (r.purpose_id as string | null) ?? null,
  detail: str(r.detail),
  visitType: (r.visit_type as VisitType) ?? 'full_day',
  startDate: str(r.start_date),
  endDate: str(r.end_date),
  daysCount: Number(r.days_count) || 0,
  status: (r.status as LeaveStatus) ?? 'pending',
  decidedBy: (r.decided_by as string | null) ?? null,
  decidedAt: (r.decided_at as string | null) ?? null,
  decisionNote: (r.decision_note as string | null) ?? null,
  createdAt: str(r.created_at),
})

export interface VisitEntryDraft {
  employeeId: string
  purposeId: string | null
  detail: string
  visitType: VisitType
  startDate: string
  endDate: string
}

/**
 * Visit entries — a day away from the office for work, applied for and
 * approved the same shape as useLeaveRequests, deliberately its own table
 * and its own hook (0027): it does not spend the paid-leave balance, so it
 * has no business sharing state with leave.
 */
export function useVisitEntries(enabled = true, onIncoming?: (row: VisitEntry) => void) {
  const [rows, setRows] = useState<VisitEntry[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  const rowsRef = useRef<VisitEntry[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoVisitEntries)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('visit_entries').select('*').order('start_date', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toVisitEntry(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase.channel(`visit-entries-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_entries' }, (p: any) => {
          const row = toVisitEntry(p.new as Row)
          if (rowsRef.current.some((r) => r.id === row.id)) return
          setRows((prev) => [row, ...prev])
          onIncoming?.(row)
        })
        .subscribe()
    } catch (e) {
      console.error('[Metrol CRM] visit entries realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled, onIncoming])

  const create = useCallback(async (draft: VisitEntryDraft): Promise<string | null> => {
    if (isDemo()) {
      const end = draft.visitType === 'custom' ? draft.endDate : draft.startDate
      const days = draft.visitType === 'half_day' ? 0.5 : workingDaysBetween(draft.startDate, end, [0], demoHolidays.map((h) => h.date)).total
      setRows((p) => [{
        id: 'demo-visit-' + (p.length + 1),
        employeeId: draft.employeeId, purposeId: draft.purposeId, detail: draft.detail.trim(),
        visitType: draft.visitType, startDate: draft.startDate, endDate: end,
        daysCount: days,
        status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null,
        createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('visit_entries')
      .insert({
        employee_id: draft.employeeId,
        purpose_id: draft.purposeId,
        detail: draft.detail.trim(),
        visit_type: draft.visitType,
        start_date: draft.startDate,
        // end_date is forced back to start_date by the trigger for full/half
        // day anyway — sending draft.endDate for those is harmless.
        end_date: draft.visitType === 'custom' ? draft.endDate : draft.startDate,
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toVisitEntry(data as Row), ...p])
    return null
  }, [])

  const decide = useCallback(async (id: string, status: 'approved' | 'rejected', decidedBy: string, note?: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status, decidedBy, decidedAt: new Date().toISOString(), decisionNote: note ?? null } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('visit_entries')
      .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note ?? null })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toVisitEntry(data as Row) : r)))
    return null
  }, [])

  const cancel = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('visit_entries').update({ status: 'cancelled' }).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toVisitEntry(data as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), create, decide, cancel, clearError: () => setError(null) }
}

export type VisitEntries = ReturnType<typeof useVisitEntries>
