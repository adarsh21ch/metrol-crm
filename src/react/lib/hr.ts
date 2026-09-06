/* The HR module's own vocabulary. types.ts says a later module should add a
   file beside it rather than widen the CRM's types — this is that file. */

export type EmploymentType = 'full_time' | 'part_time' | 'intern' | 'contract'
export type EmployeeStatus = 'active' | 'notice' | 'resigned'

/** One row per person in the company. Somebody who never signs in still has
 *  one, which is why profileId is nullable. */
export interface Employee {
  id: string
  employeeCode: string
  profileId: string | null
  fullName: string
  designation: string
  departmentId: string | null
  employmentType: EmploymentType
  dateOfJoining: string
  reportingTo: string | null
  workEmail: string
  personalEmail: string
  phone: string
  dateOfBirth: string | null
  address: string
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  status: EmployeeStatus
  lastWorkingDay: string | null
  notes: string
  createdAt: string
  /** How many days this person is entitled to this year. Remaining balance is
   *  this minus their own approved days in the current year — computed, never
   *  stored, so nothing needs reconciling when a request changes. */
  annualLeaveDays: number
  /** Phase 4: was an offer made, and did they accept it. Both optional — a
   *  record for somebody who never signs in may never have either. */
  offerExtendedOn: string | null
  offerAcceptedOn: string | null
  /** Phase 5: procedural facts about leaving. Visible to the employee
   *  themselves — the REASON they left lives separately in ExitRecord, which
   *  is HR/owner-only (see 0012). */
  resignationDate: string | null
  noticePeriodDays: number | null
}

export const EMPLOYMENT: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  intern: 'Intern',
  contract: 'Contract',
}

export const EMP_STATUS: Record<EmployeeStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'chip--good' },
  notice: { label: 'On notice', cls: 'chip--warn' },
  // Grey, not red: leaving is not a failure, and red already means bad quality
  // everywhere else in this app.
  resigned: { label: 'Resigned', cls: 'chip--mute' },
}

/** The departments row the HR dashboard keys on. The label on screen may be
 *  shortened to "HR"; this value is the data and must not be. */
export const HR_DEPARTMENT = 'Human Resources'

/* ------------------------------------------------------------- Phase 2: leave */

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** One request. `daysCount` is set by a database trigger (0009) from the two
 *  dates, never trusted from the client — a mismatched request must not be
 *  able to inflate or shrink anybody's balance. */
export interface LeaveRequest {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  daysCount: number
  reason: string
  status: LeaveStatus
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'chip--warn' },
  approved: { label: 'Approved', cls: 'chip--good' },
  rejected: { label: 'Rejected', cls: 'chip--bad' },
  // Grey like a resignation: cancelling your own request is not a failure.
  cancelled: { label: 'Cancelled', cls: 'chip--mute' },
}

/** The calendar year a request's balance counts against — the year it starts
 *  in, so a request spanning New Year's Eve does not straddle two balances. */
export const leaveYear = (r: Pick<LeaveRequest, 'startDate'>) => Number((r.startDate || '').slice(0, 4))

/** Approved days this person has already used in `year` (default: this year). */
export function usedLeaveDays(requests: LeaveRequest[], employeeId: string, year = new Date().getFullYear()): number {
  return requests
    .filter((r) => r.employeeId === employeeId && r.status === 'approved' && leaveYear(r) === year)
    .reduce((t, r) => t + r.daysCount, 0)
}

/* ------------------------------------------------------------ Phase 3: salary */

export type SalaryStatus = 'pending' | 'paid'

/** One month's payslip. Adarsh decided HR sees the amounts (finance sits under
 *  HR) — the owner and HR have full reach here; an employee reads only their
 *  own, and cannot write to this table at all, not even to fix a typo. */
export interface SalaryRecord {
  id: string
  employeeId: string
  /** The first of the month this payslip is for, e.g. "2026-09-01". */
  period: string
  grossAmount: number
  netAmount: number
  status: SalaryStatus
  paidAt: string | null
  paidBy: string | null
  notes: string
  createdAt: string
}

export const SALARY_STATUS: Record<SalaryStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'chip--warn' },
  paid: { label: 'Paid', cls: 'chip--good' },
}

/** "Sep 2026" — how a payslip's month reads. */
export function fmtPeriod(period: string): string {
  if (!period) return '—'
  const d = new Date(period.length === 10 ? period + 'T00:00:00' : period)
  if (Number.isNaN(d.getTime())) return '—'
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** The current month as a period value — always the 1st. */
export const currentPeriod = () => todayISO().slice(0, 7) + '-01'

/* --------------------------------------------------------- Phase 4: onboarding */

/** One item on a new hire's checklist. HR ticks these, not the employee — see
 *  0011: confirming a document was collected is HR verifying a fact. */
export interface OnboardingTask {
  id: string
  employeeId: string
  label: string
  done: boolean
  doneAt: string | null
  doneBy: string | null
  sortOrder: number
}

export type DocType = 'pan' | 'aadhaar' | 'bank_proof' | 'photo' | 'resume' | 'other'

export const DOC_TYPE: Record<DocType, string> = {
  pan: 'PAN card',
  aadhaar: 'Aadhaar card',
  bank_proof: 'Bank proof',
  photo: 'Photo',
  resume: 'Resume',
  other: 'Other',
}

/** Metadata only — the actual bytes live in the private 'employee-documents'
 *  storage bucket at `filePath`. Reading the file needs a signed URL, never a
 *  permanent public link (0011). */
export interface EmployeeDocument {
  id: string
  employeeId: string
  docType: DocType
  fileName: string
  filePath: string
  uploadedBy: string | null
  uploadedAt: string
  notes: string
}

/* -------------------------------------------------------------- Phase 5: exit */

/** One row per checklist item on the way out — same shape as
 *  OnboardingTask, kept as its own type because it comes from its own table
 *  (exit_tasks), not a status filter on onboarding_tasks. */
export interface ExitTask {
  id: string
  employeeId: string
  label: string
  done: boolean
  doneAt: string | null
  doneBy: string | null
  sortOrder: number
}

/** HR/owner-only. Deliberately never fetched by an employee's own screen —
 *  0012 gives it no self-select policy at all, so a request for this table
 *  from an ordinary employee returns nothing, not a filtered version of it. */
export interface ExitRecord {
  id: string
  employeeId: string
  reason: string
  exitInterviewNotes: string
  rehireEligible: boolean
  createdAt: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "02 May 2025". Dates come back from Postgres as YYYY-MM-DD, with no time —
 *  parsing that as UTC and rendering it locally can move it a day, so it is
 *  pinned to midnight local instead. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "1 year 4 months" — the way a person says it out loud. */
export function tenure(from: string | null | undefined): string {
  if (!from) return '—'
  const start = new Date(from.length === 10 ? from + 'T00:00:00' : from)
  if (Number.isNaN(start.getTime())) return '—'
  const now = new Date()
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (now.getDate() < start.getDate()) months -= 1
  if (months < 0) return 'not started yet'
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y) parts.push(y + (y === 1 ? ' year' : ' years'))
  if (m) parts.push(m + (m === 1 ? ' month' : ' months'))
  return parts.length ? parts.join(' ') : 'less than a month'
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

/** Joined in the current calendar month — the directory's "new this month". */
export const joinedThisMonth = (e: Employee) => (e.dateOfJoining ?? '').slice(0, 7) === todayISO().slice(0, 7)
