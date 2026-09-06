import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
})

export interface SalaryDraft {
  employeeId: string
  period: string
  grossAmount: number
  netAmount: number
  notes: string
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

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
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
    const { data, error: err } = await supabase
      .from('salary_records')
      .update({ status: 'paid', paid_by: paidBy, paid_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toSalaryRecord(data as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: load, create, update, markPaid, clearError: () => setError(null) }
}

export type SalaryRecords = ReturnType<typeof useSalaryRecords>
