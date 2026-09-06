import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'
import type { ExitRecord } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toRecord = (r: Row): ExitRecord => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  reason: str(r.reason),
  exitInterviewNotes: str(r.exit_interview_notes),
  rehireEligible: r.rehire_eligible !== false,
  createdAt: str(r.created_at),
})

export interface ExitDraft {
  employeeId: string
  reason: string
  exitInterviewNotes: string
  rehireEligible: boolean
}

/**
 * The HR-only exit record. There is no self-service caller for this hook
 * anywhere in the app — 0012 gives an employee no select policy on this
 * table at all, so it is only ever imported into HrPage.
 */
export function useExitRecords() {
  const [rows, setRows] = useState<ExitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (isDemo()) {
      setRows([])
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('exit_records')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toRecord(r as Row)))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const create = useCallback(async (draft: ExitDraft): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [{
        id: 'demo-exit-' + (p.length + 1), employeeId: draft.employeeId, reason: draft.reason,
        exitInterviewNotes: draft.exitInterviewNotes, rehireEligible: draft.rehireEligible,
        createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('exit_records')
      .insert({
        employee_id: draft.employeeId, reason: draft.reason.trim() || null,
        exit_interview_notes: draft.exitInterviewNotes.trim() || null, rehire_eligible: draft.rehireEligible,
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toRecord(data as Row), ...p])
    return null
  }, [])

  return { rows, loading, error, reload: load, create, clearError: () => setError(null) }
}

export type ExitRecords = ReturnType<typeof useExitRecords>
