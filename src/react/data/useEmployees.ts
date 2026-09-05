import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoEmployees, isDemo } from '@/data/demo'
import type { Employee } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toEmployee = (r: Row): Employee => ({
  id: str(r.id),
  employeeCode: str(r.employee_code),
  profileId: (r.profile_id as string | null) ?? null,
  fullName: str(r.full_name),
  designation: str(r.designation),
  departmentId: (r.department_id as string | null) ?? null,
  employmentType: (r.employment_type as Employee['employmentType']) ?? 'full_time',
  dateOfJoining: str(r.date_of_joining),
  reportingTo: (r.reporting_to as string | null) ?? null,
  workEmail: str(r.work_email),
  personalEmail: str(r.personal_email),
  phone: str(r.phone),
  dateOfBirth: (r.date_of_birth as string | null) || null,
  address: str(r.address),
  emergencyName: str(r.emergency_name),
  emergencyRelation: str(r.emergency_relation),
  emergencyPhone: str(r.emergency_phone),
  status: (r.status as Employee['status']) ?? 'active',
  lastWorkingDay: (r.last_working_day as string | null) || null,
  notes: str(r.notes),
  createdAt: str(r.created_at),
})

export type EmployeeDraft = Omit<Employee, 'id' | 'employeeCode' | 'createdAt'>

/** Empty is not the same as null to Postgres: a date column rejects '', and a
 *  foreign key rejects it too. Anything optional and blank goes in as null. */
const orNull = (v: string | null | undefined) => (v == null || v === '' ? null : v)

const toRow = (p: Partial<EmployeeDraft>): Row => {
  const r: Row = {}
  if (p.profileId !== undefined) r.profile_id = orNull(p.profileId)
  if (p.fullName !== undefined) r.full_name = p.fullName.trim()
  if (p.designation !== undefined) r.designation = p.designation.trim()
  if (p.departmentId !== undefined) r.department_id = orNull(p.departmentId)
  if (p.employmentType !== undefined) r.employment_type = p.employmentType
  if (p.dateOfJoining !== undefined) r.date_of_joining = orNull(p.dateOfJoining)
  if (p.reportingTo !== undefined) r.reporting_to = orNull(p.reportingTo)
  if (p.workEmail !== undefined) r.work_email = orNull(p.workEmail.trim())
  if (p.personalEmail !== undefined) r.personal_email = orNull(p.personalEmail.trim())
  if (p.phone !== undefined) r.phone = p.phone.trim()
  if (p.dateOfBirth !== undefined) r.date_of_birth = orNull(p.dateOfBirth)
  if (p.address !== undefined) r.address = orNull(p.address.trim())
  if (p.emergencyName !== undefined) r.emergency_name = p.emergencyName.trim()
  if (p.emergencyRelation !== undefined) r.emergency_relation = orNull(p.emergencyRelation.trim())
  if (p.emergencyPhone !== undefined) r.emergency_phone = p.emergencyPhone.trim()
  if (p.status !== undefined) r.status = p.status
  if (p.lastWorkingDay !== undefined) r.last_working_day = orNull(p.lastWorkingDay)
  if (p.notes !== undefined) r.notes = orNull(p.notes.trim())
  return r
}

/**
 * The employee records, kept apart from useWorkspace on purpose. A salesperson
 * never loads this: their app has no reason to ask the question, and the
 * policies in 0006 would hand back one row if it did.
 *
 * Nothing here deletes. The table has no delete policy and DELETE is revoked,
 * so a "remove" button could not work even if somebody added one — leaving is
 * a status change, and the record stays.
 */
export function useEmployees() {
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (isDemo()) {
      setRows(demoEmployees)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('employees')
      .select('*')
      .order('date_of_joining', { ascending: true })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toEmployee(r as Row)))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const create = useCallback(async (draft: EmployeeDraft): Promise<string | null> => {
    if (isDemo()) {
      const n = rows.length + 1
      setRows((p) => [...p, {
        ...draft,
        id: 'demo-' + n,
        employeeCode: 'MM-' + String(n).padStart(3, '0'),
        createdAt: new Date().toISOString(),
      }])
      return null
    }
    const { data, error: err } = await supabase
      .from('employees').insert(toRow(draft)).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toEmployee(data as Row)])
    return null
  }, [rows.length])

  const update = useCallback(async (id: string, patch: Partial<EmployeeDraft>): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)))
      return null
    }
    const { data, error: err } = await supabase
      .from('employees').update(toRow(patch)).eq('id', id).select('*').single()
    if (err) return err.message
    // Read back rather than trusting the patch: a policy that silently matched
    // no row would otherwise leave the screen showing an edit that never
    // reached the database. This app has had that bug once already.
    if (data) setRows((p) => p.map((e) => (e.id === id ? toEmployee(data as Row) : e)))
    return null
  }, [])

  return { rows, loading, error, reload: load, create, update, clearError: () => setError(null) }
}

export type Employees = ReturnType<typeof useEmployees>
