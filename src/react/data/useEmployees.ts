import { useCallback, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
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
  annualLeaveDays: Number(r.annual_leave_days) || 0,
  shiftId: (r.shift_id as string | null) ?? null,
  officeId: (r.office_id as string | null) ?? null,
  offerExtendedOn: (r.offer_extended_on as string | null) || null,
  offerAcceptedOn: (r.offer_accepted_on as string | null) || null,
  resignationDate: (r.resignation_date as string | null) || null,
  noticePeriodDays: r.notice_period_days == null ? null : Number(r.notice_period_days),
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
  if (p.annualLeaveDays !== undefined) r.annual_leave_days = p.annualLeaveDays
  if (p.offerExtendedOn !== undefined) r.offer_extended_on = orNull(p.offerExtendedOn)
  if (p.offerAcceptedOn !== undefined) r.offer_accepted_on = orNull(p.offerAcceptedOn)
  if (p.resignationDate !== undefined) r.resignation_date = orNull(p.resignationDate)
  if (p.noticePeriodDays !== undefined) r.notice_period_days = p.noticePeriodDays
  if (p.shiftId !== undefined) r.shift_id = orNull(p.shiftId)
  if (p.officeId !== undefined) r.office_id = orNull(p.officeId)
  return r
}

/**
 * The employee records, kept apart from useWorkspace on purpose. A salesperson
 * never loads this: their app has no reason to ask the question, and the
 * policies in 0006 would hand back one row if it did.
 *
 * The table itself still has no delete policy and DELETE is still revoked at
 * Postgres for the client — that has not changed, and `update` above is still
 * how a REAL employee leaves (a status change, record stays). `remove` below
 * is a second, deliberately harder door: it goes through the owner-only
 * `delete-employee` Edge Function (service role, bypasses the table grant
 * entirely) rather than asking for one on this table, which is what let a
 * genuine mistake — Adarsh's own test applications approving into real
 * employee rows — get cleaned up without reopening delete to anyone who
 * merely has HR access.
 */
export function useEmployees(enabled = true) {
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    // A salesperson who does not lead a team never asks this question, so their
    // app never makes the request.
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
  }, [enabled])

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

  /** Owner or HR, and irreversible — see the Edge Function's own header for
   *  exactly what it deletes and why each piece is safe to cascade. The
   *  permission is decided THERE, not here: hiding the button in HrPage is a
   *  courtesy, and the function refuses anybody else whatever the client does.
   *
   *  Kept to the same `string | null` shape as every other mutation here —
   *  null means it worked, a string is something to show — rather than a
   *  richer result the caller would have to branch on. The one wrinkle is
   *  the Edge Function's own `warning`: the row and the login are two
   *  different systems, and the row can be gone while the login clean-up
   *  failed. That is logged, not returned, so it can never be mistaken for
   *  "the delete failed" by a caller that only checks truthiness — which is
   *  exactly how every existing call site here already reads this return. */
  const remove = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) { setRows((p) => p.filter((e) => e.id !== id)); return null }

    // Optimistic: the row goes NOW. delete-employee is the slowest call in
    // this app — a cold Deno isolate, then seven round trips of its own — and
    // making somebody watch a directory that still lists the person they just
    // deleted is what made this feel broken. `before` is the exact list we
    // replaced, so a refusal puts back what was there rather than a guess.
    let before: Employee[] = []
    setRows((p) => { before = p; return p.filter((e) => e.id !== id) })

    const { data, error: err } = await supabase.functions.invoke('delete-employee', { body: { employeeId: id } })
    // err.message here is the SDK's own generic "non-2xx status code" text,
    // not what the function said — see functionErrorMessage's own comment.
    const message = err ? await functionErrorMessage(err) : data?.error ? String(data.error) : null
    if (message) { setRows(before); return message }

    if (data?.warning) console.warn('[delete-employee]', data.warning)
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), create, update, remove, clearError: () => setError(null) }
}

export type Employees = ReturnType<typeof useEmployees>
