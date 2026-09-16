import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'
import {
  closeLeaveMonthDemo, computeLeaveMonth, toLeaveMonth,
  type LeaveChoice, type LeaveCtx, type LeaveMonth,
} from '@/lib/leaveRules'
import type { AttendanceRow, AttendanceSettings, Holiday } from '@/lib/attendance'
import type { Employee, LeaveRequest } from '@/lib/hr'

type Row = Record<string, unknown>

/** Demo mode's leave_months table: the months HR closed this session. */
let demoClosed: LeaveMonth[] = []

/** What a month is worked out from. The live app sends none of it anywhere —
 *  the database already has it all — but demo mode computes from exactly the
 *  rows on screen, so a request approved in the demo moves the balance. */
export interface LeaveSources {
  employees: Pick<Employee, 'id' | 'fullName' | 'employeeCode' | 'dateOfJoining' | 'lastWorkingDay' | 'status'>[]
  rows: AttendanceRow[]
  leaves: LeaveRequest[]
  holidays: Holiday[]
  settings: AttendanceSettings | null
  today: string
}

function demoCtx(src: LeaveSources, employeeId: string): LeaveCtx | null {
  const e = src.employees.find((x) => x.id === employeeId)
  if (!e || !src.settings) return null
  return {
    employee: { id: e.id, dateOfJoining: e.dateOfJoining, lastWorkingDay: e.lastWorkingDay },
    rows: src.rows.filter((r) => r.employeeId === e.id),
    leaves: src.leaves.filter((l) => l.employeeId === e.id),
    holidays: src.holidays,
    settings: src.settings,
    closed: demoClosed.filter((c) => c.employeeId === e.id),
    today: src.today,
  }
}

/** A missing function is 0022 not having run yet — say THAT, not PostgREST's
 *  "Could not find the function public.leave_month_summary(...) in the schema
 *  cache", which is true and useless to anybody in HR. */
const rpcError = (err: { message: string; code?: string }) =>
  err.code === 'PGRST202' || /could not find the function/i.test(err.message)
    ? 'The leave rules are not installed on the database yet — migration 0022 has to be run first.'
    : err.message

/**
 * One person's month, and the months already closed for them. Their own
 * screen asks this about themselves; HR's record page asks it about anyone.
 * RLS and the function's own check decide who may — this hook just asks.
 */
export function useLeaveMonth(employeeId: string | null, month: string, src: LeaveSources) {
  const [data, setData] = useState<LeaveMonth | null>(null)
  const [history, setHistory] = useState<LeaveMonth[]>([])
  const [loading, setLoading] = useState(Boolean(employeeId))
  const [error, setError] = useState<string | null>(null)
  // Demo needs the rows; live does not. Read through a ref so the fetch does
  // not re-run on every render that hands in a fresh object.
  const srcRef = useRef(src)
  srcRef.current = src

  const load = useCallback(async () => {
    if (!employeeId) { setData(null); setHistory([]); setLoading(false); return }
    if (isDemo()) {
      const ctx = demoCtx(srcRef.current, employeeId)
      setData(ctx ? computeLeaveMonth(ctx, month) : null)
      setHistory(demoClosed.filter((c) => c.employeeId === employeeId).sort((a, b) => b.month.localeCompare(a.month)))
      setLoading(false)
      return
    }
    const [sum, past] = await Promise.all([
      supabase.rpc('leave_month_summary', { p_employee: employeeId, p_month: month }),
      supabase.from('leave_months').select('*').eq('employee_id', employeeId).order('month', { ascending: false }).limit(24),
    ])
    if (sum.error) { setError(rpcError(sum.error)); setLoading(false); return }
    const m = toLeaveMonth((sum.data ?? {}) as Row)
    if (!m.ok) { setError(m.message ?? 'Could not work out this month.'); setLoading(false); return }
    setError(null)
    setData(m)
    // A read refusal here (0022 not installed) is already said above. The
    // table stores the parts; the two sums are the function's, redone here.
    setHistory((past.data ?? []).map((r) => {
      const c = toLeaveMonth({ ...(r as Row), ok: true, counted: true, closed: true })
      return { ...c, available: c.opening + c.accrued, unpaidDays: c.absentDays + c.unpaidLeaveDays + c.unpaidOverflow }
    }))
    setLoading(false)
  }, [employeeId, month])

  // The balance moves when leave is decided or a day is corrected, so those
  // two lists — not the whole source object — are what re-asks.
  useEffect(() => { void load() }, [load, src.leaves, src.rows, src.settings])

  return { data, history, loading, error, reload: load }
}

/**
 * Every person's month, for HR's month-end close. One call for the company
 * (leave_month_board), not one per person.
 */
export function useLeaveBoard(month: string, src: LeaveSources, enabled = true) {
  const [rows, setRows] = useState<LeaveMonth[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const srcRef = useRef(src)
  srcRef.current = src

  const load = useCallback(async () => {
    if (!enabled || !month) { setLoading(false); return }
    if (isDemo()) {
      const s = srcRef.current
      const mStart = month
      const mEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
      setRows(s.employees
        .filter((e) => e.dateOfJoining <= mEnd && (!e.lastWorkingDay || e.lastWorkingDay >= mStart))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((e) => {
          const ctx = demoCtx(s, e.id)
          return { ...(ctx ? computeLeaveMonth(ctx, month) : toLeaveMonth({ ok: true, employee_id: e.id, month })), fullName: e.fullName, employeeCode: e.employeeCode }
        }))
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase.rpc('leave_month_board', { p_month: month })
    if (err) { setError(rpcError(err)); setLoading(false); return }
    setError(null)
    setRows(((data ?? []) as Row[]).map(toLeaveMonth))
    setLoading(false)
  }, [month, enabled])

  useEffect(() => { void load() }, [load, src.leaves, src.rows, src.settings])

  /** Close one person's month. Refusals come back as the database's own
   *  sentence ("Close Aug 2026 first…"), not a generic failure. */
  const close = useCallback(async (employeeId: string, choice: LeaveChoice): Promise<string | null> => {
    const name = srcRef.current.employees.find((e) => e.id === employeeId)?.fullName ?? 'This person'
    if (isDemo()) {
      const ctx = demoCtx(srcRef.current, employeeId)
      if (!ctx) return 'No such employee.'
      const res = closeLeaveMonthDemo(ctx, month, choice, name)
      if (!res.ok) return res.message
      demoClosed = [...demoClosed.filter((c) => !(c.employeeId === employeeId && c.month === month)), res]
      setRows((p) => p.map((r) => (r.employeeId === employeeId ? { ...res, fullName: r.fullName, employeeCode: r.employeeCode } : r)))
      return null
    }
    const { data, error: err } = await supabase.rpc('close_leave_month', { p_employee: employeeId, p_month: month, p_choice: choice })
    if (err) return rpcError(err)
    const res = toLeaveMonth((data ?? {}) as Row)
    if (!res.ok) return res.message ?? 'Could not close this month.'
    setRows((p) => p.map((r) => (r.employeeId === employeeId ? { ...res, fullName: r.fullName, employeeCode: r.employeeCode } : r)))
    return null
  }, [month])

  return { rows, loading, error, reload: load, close }
}
