import { useCallback, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { demoSalaryRecords, isDemo } from '@/data/demo'
import type { SalaryRecord, SalaryStatus } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toSalaryRecord = (r: Row): SalaryRecord => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  period: str(r.period),
  grossAmount: Number(r.gross_amount) || 0,
  netAmount: Number(r.net_amount) || 0,
  status: (r.status as SalaryStatus) ?? 'pending',
  paidAt: (r.paid_at as string | null) ?? null,
  paidBy: (r.paid_by as string | null) ?? null,
  notes: str(r.notes),
  createdAt: str(r.created_at),
  payslipSentCount: Number(r.payslip_sent_count) || 0,
  payslipSentAt: (r.payslip_sent_at as string | null) ?? null,
  paidDays: r.paid_days == null ? null : Number(r.paid_days),
  leaveEncashmentDays: Number(r.leave_encashment_days) || 0,
  leaveEncashmentAmount: Number(r.leave_encashment_amount) || 0,
  incentive: Number(r.incentive) || 0,
  otherDeduction: Number(r.other_deduction) || 0,
  tdsRatePercent: r.tds_rate_percent == null ? null : Number(r.tds_rate_percent),
  tdsAmount: Number(r.tds_amount) || 0,
})

export interface SalaryDraft {
  employeeId: string
  period: string
  grossAmount: number
  netAmount: number
  notes: string
  paidDays: number | null
  leaveEncashmentDays: number
  leaveEncashmentAmount: number
  incentive: number
  otherDeduction: number
  tdsRatePercent: number | null
  tdsAmount: number
}

/**
 * Payslips. Unlike useLeaveRequests, there is no self-service write here at
 * all — an employee's own app never calls create/update/markPaid, because RLS
 * (0010) refuses every one of them for anybody but the owner or HR. This hook
 * exists so their own screen can still READ their own history.
 *
 * Nothing here deletes: the table has no delete policy. A wrong amount is
 * corrected in place (update), not erased — the record of what was paid, and
 * when the correction happened, both matter for a financial row.
 */
export function useSalaryRecords(enabled = true) {
  const [rows, setRows] = useState<SalaryRecord[]>([])
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
      setRows(demoSalaryRecords)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('salary_records')
      .select('*')
      .order('period', { ascending: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toSalaryRecord(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const create = useCallback(async (draft: SalaryDraft): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [{
        id: 'demo-salary-' + (p.length + 1),
        employeeId: draft.employeeId,
        period: draft.period,
        grossAmount: draft.grossAmount,
        netAmount: draft.netAmount,
        status: 'pending',
        paidAt: null,
        paidBy: null,
        notes: draft.notes,
        createdAt: new Date().toISOString(),
        payslipSentCount: 0,
        payslipSentAt: null,
        paidDays: draft.paidDays, leaveEncashmentDays: draft.leaveEncashmentDays,
        leaveEncashmentAmount: draft.leaveEncashmentAmount, incentive: draft.incentive,
        otherDeduction: draft.otherDeduction, tdsRatePercent: draft.tdsRatePercent, tdsAmount: draft.tdsAmount,
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('salary_records')
      .insert({
        employee_id: draft.employeeId,
        period: draft.period,
        gross_amount: draft.grossAmount,
        net_amount: draft.netAmount,
        notes: draft.notes.trim() || null,
        paid_days: draft.paidDays,
        leave_encashment_days: draft.leaveEncashmentDays,
        leave_encashment_amount: draft.leaveEncashmentAmount,
        incentive: draft.incentive,
        other_deduction: draft.otherDeduction,
        tds_rate_percent: draft.tdsRatePercent,
        tds_amount: draft.tdsAmount,
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toSalaryRecord(data as Row), ...p])
    return null
  }, [])

  const update = useCallback(async (id: string, patch: Partial<SalaryDraft>): Promise<string | null> => {
    const row: Row = {}
    if (patch.grossAmount !== undefined) row.gross_amount = patch.grossAmount
    if (patch.netAmount !== undefined) row.net_amount = patch.netAmount
    if (patch.notes !== undefined) row.notes = patch.notes.trim() || null
    if (patch.paidDays !== undefined) row.paid_days = patch.paidDays
    if (patch.leaveEncashmentDays !== undefined) row.leave_encashment_days = patch.leaveEncashmentDays
    if (patch.leaveEncashmentAmount !== undefined) row.leave_encashment_amount = patch.leaveEncashmentAmount
    if (patch.incentive !== undefined) row.incentive = patch.incentive
    if (patch.otherDeduction !== undefined) row.other_deduction = patch.otherDeduction
    if (patch.tdsRatePercent !== undefined) row.tds_rate_percent = patch.tdsRatePercent
    if (patch.tdsAmount !== undefined) row.tds_amount = patch.tdsAmount
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('salary_records').update(row).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toSalaryRecord(data as Row) : r)))
    return null
  }, [])

  const markPaid = useCallback(async (id: string, paidBy: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, status: 'paid', paidBy, paidAt: new Date().toISOString() } : r)))
      return null
    }
    // Optimistic, same reasoning as the checkboxes: one chip changing colour
    // should not cost a round trip of staring at the old one.
    let before: SalaryRecord[] = []
    setRows((p) => {
      before = p
      return p.map((r) => (r.id === id ? { ...r, status: 'paid', paidBy, paidAt: new Date().toISOString() } : r))
    })

    const { data, error: err } = await supabase
      .from('salary_records')
      .update({ status: 'paid', paid_by: paidBy, paid_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (err) { setRows(before); return err.message }
    if (data) setRows((p) => p.map((r) => (r.id === id ? toSalaryRecord(data as Row) : r)))
    return null
  }, [])

  /** Round 4: email one payslip via the `send-payslip-email` Edge Function —
   *  same shape as approve-job-application's invite email. The function
   *  re-checks HR/owner itself (it has to: it uses the service role to send
   *  through Resend), so this is a thin call, not a second permission check. */
  const emailPayslip = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r } : r)))
      return null
    }
    const { data, error: err } = await supabase.functions.invoke('send-payslip-email', { body: { salaryRecordId: id } })
    const message = err ? await functionErrorMessage(err) : data?.error ? String(data.error) : null
    if (message) return message
    // Re-read the one row rather than trusting the function's own count —
    // same reasoning as markPaid: the database is what actually changed.
    const { data: fresh } = await supabase.from('salary_records').select('*').eq('id', id).single()
    if (fresh) setRows((p) => p.map((r) => (r.id === id ? toSalaryRecord(fresh as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), create, update, markPaid, emailPayslip, clearError: () => setError(null) }
}

export type SalaryRecords = ReturnType<typeof useSalaryRecords>
