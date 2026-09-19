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
  /** Phase 4: was an offer made, and did they accept it. Both optional — a
   *  record for somebody who never signs in may never have either. */
  offerExtendedOn: string | null
  offerAcceptedOn: string | null
  /** Phase 5: procedural facts about leaving. Visible to the employee
   *  themselves — the REASON they left lives separately in ExitRecord, which
   *  is HR/owner-only (see 0012). */
  resignationDate: string | null
  noticePeriodDays: number | null
  /** Phase 6b: which branch this person works at. Their punches are measured
   *  against it, and whether they may punch at another one is a company
   *  setting, not a per-person permission. */
  officeId: string | null
  /** Phase 6: which of the three shifts this person works. Null means nobody
   *  has scheduled them yet — they can still punch, and the day is recorded,
   *  but nothing is judged late against a start time that does not exist. */
  shiftId: string | null
  /** Round 4 (0024). Gross monthly salary, HR's number, set once and edited
   *  on a raise. Null means nobody has priced this person yet — the payslip
   *  generator refuses to compute from a number nobody entered. */
  monthlySalary: number | null
  /** Round 6 (0026). Free text ('Male' | 'Female' | 'Other' | ''), copied
   *  from the application on approval. The one thing that makes Period leave
   *  (T&C 3.7) offerable to the people it is actually for, automatically,
   *  instead of a company-wide switch. Null for anyone added before this. */
  gender: string | null
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

/** Sick and casual spend the monthly paid balance; unpaid spends nothing and
 *  comes off salary. Period (0022, T&C 3.7) is paid WITHOUT touching the
 *  balance, up to the monthly allowance HR sets — and only HR logs it. How a
 *  month adds up lives in lib/leaveRules.ts, not here.
 *
 *  Round 6 (0026, Adarsh's 2026-09-19 brief): the request form now offers
 *  only three types — casual (the default), compulsory (a week-off day
 *  actually worked, spent 1:1 out of comp_off_credits, never touches the
 *  paid balance), and period (female employees only, one a month, enforced
 *  in the database). 'sick' and 'unpaid' stay valid values — old rows and an
 *  HR override still read correctly — they are just no longer offered. */
export type LeaveType = 'sick' | 'casual' | 'unpaid' | 'period' | 'compulsory'

/** One request. `daysCount` is set by a database trigger (0009) from the two
 *  dates, never trusted from the client — a mismatched request must not be
 *  able to inflate or shrink anybody's balance. */
export interface LeaveRequest {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  /** WORKING days between the two dates — Sundays and holidays already taken
   *  out. Set by the 0016 trigger, so it is the database's number, not one the
   *  browser worked out and sent. */
  daysCount: number
  leaveType: LeaveType
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

/** Deliberately NOT the green/amber/red family: a leave type is a category,
 *  not a verdict, and Pending-amber / Approved-green already own that meaning
 *  two columns away. Unpaid is the one that gets a stronger edge, because it is
 *  the one somebody scanning the table needs to notice. */
export const LEAVE_TYPE: Record<LeaveType, { label: string; cls: string; short: string }> = {
  casual: { label: 'Casual', cls: 'chip--mute', short: 'CL' },
  sick: { label: 'Sick', cls: 'chip--mute', short: 'SL' },
  unpaid: { label: 'Unpaid', cls: 'chip--accent', short: 'LWP' },
  period: { label: 'Period', cls: 'chip--mute', short: 'PER' },
  compulsory: { label: 'Compulsory / Week-off', cls: 'chip--mute', short: 'C/O' },
}

/** The three types the request form actually offers — Round 6. Casual is
 *  always first, so it stays the default the form opens on. */
export const REQUESTABLE_LEAVE_TYPES: LeaveType[] = ['casual', 'compulsory', 'period']

/** Is this type paid at all? Period is — it just does not spend the balance. */
export const isPaidLeave = (t: LeaveType) => t !== 'unpaid'

/** The working days in an inclusive date range, for the REQUEST FORM'S PREVIEW
 *  and for demo mode only. The number that gets stored is always the
 *  database's (0016's `working_days_between` inside the insert trigger), and
 *  useLeaveRequests re-reads the saved row rather than trusting this — so if
 *  the two ever disagree, the record is still right and only a preview was
 *  wrong. It exists because asking the server on every keystroke to render one
 *  sentence is not worth a round trip.
 *
 *  `weekOffs` is 0 = Sunday, matching Postgres's `extract(dow)` and
 *  `attendance_settings.week_offs`. `holidays` is a list of YYYY-MM-DD. */
export function workingDaysBetween(
  startISO: string, endISO: string, weekOffs: number[] = [0], holidays: string[] = [],
): { total: number; weekOffDays: number; holidayDays: number; holidayHits: string[] } {
  const out = { total: 0, weekOffDays: 0, holidayDays: 0, holidayHits: [] as string[] }
  if (!startISO || !endISO || endISO < startISO) return out
  const off = new Set(weekOffs)
  const hol = new Set(holidays)
  // Midnight local, stepped by calendar date rather than by adding 86400000 —
  // a DST jump would otherwise skip or repeat a day. India has none, but this
  // is two lines either way.
  const d = new Date(startISO + 'T00:00:00')
  const end = new Date(endISO + 'T00:00:00')
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out
  let guard = 0
  while (d <= end && guard++ < 1000) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (off.has(d.getDay())) out.weekOffDays += 1
    else if (hol.has(iso)) { out.holidayDays += 1; out.holidayHits.push(iso) }
    else out.total += 1
    d.setDate(d.getDate() + 1)
  }
  return out
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
  /** Round 4 (0024) — same shape as JobApplication's invite tracking. 0/null
   *  means never emailed; a resend just increments the count again. */
  payslipSentCount: number
  payslipSentAt: string | null
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

export type DocType = 'pan' | 'aadhaar' | 'bank_proof' | 'photo' | 'resume'
  | 'signature' | 'experience_letter' | 'salary_slip' | 'other'

export const DOC_TYPE: Record<DocType, string> = {
  pan: 'PAN card',
  aadhaar: 'Aadhaar card',
  bank_proof: 'Bank proof',
  photo: 'Photo',
  resume: 'Resume',
  signature: 'Signature',
  experience_letter: 'Experience letter',
  salary_slip: 'Salary slip',
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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

/* -------------------------------------------------------- Phase 8: joining */

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

/** One candidate's submission. Nothing about this person exists anywhere
 *  else in the database until HR approves — see 0017. The five paths point
 *  into the QUARANTINED 'job-applications' bucket, never 'employee-documents'
 *  — moving them across is the Edge Function's job, on approval. */
/** One row of each repeatable table on the paper application form. Kept
 *  loose (all strings) because they are transcribed answers, not values this
 *  app computes with — HR reads them, nothing sums them. */
export interface AppEducation { examination: string; year: string; institution: string; marks: string; subjects: string }
export interface AppEmployment { from: string; to: string; totalYears: string; company: string; designation: string; grossSalary: string; reason: string }
export interface AppLanguage { language: string; understand: boolean; speak: boolean; read: boolean; write: boolean; remarks: string }

export interface JobApplication {
  id: string
  fullName: string
  phone: string
  email: string
  positionInterest: string
  noPreviousEmployment: boolean
  // ---- everything the printed form asks for (migration 0020)
  firstName: string
  lastName: string
  fatherOrHusband: string
  gender: string
  dateOfBirth: string | null
  placeOfBirth: string
  nationality: string
  religion: string
  maritalStatus: string
  dependents: string
  aadhaarNumber: string
  presentAddress: string
  permanentAddress: string
  pincode: string
  education: AppEducation[]
  technicalQualification: string
  employmentHistory: AppEmployment[]
  bankName: string
  bankAccountName: string
  bankAccountNo: string
  bankIfsc: string
  languages: AppLanguage[]
  referenceName: string
  referenceDepartment: string
  declarationAcceptedAt: string | null
  termsAcceptedAt: string | null
  photoPath: string
  panPath: string
  aadhaarPath: string
  bankProofPath: string
  /** Null only when noPreviousEmployment is true — the database enforces
   *  that pairing, not this type. */
  relievingLetterPath: string | null
  /** Round 6 (0026). Required of every applicant. */
  signaturePath: string
  /** Round 6 (0026). Optional even with previous employment — "keep the
   *  field there... not compulsory", Adarsh's words. Null when not attached
   *  or when noPreviousEmployment is true. */
  experienceLetterPath: string | null
  salarySlipPath: string | null
  status: ApplicationStatus
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  employeeId: string | null
  inviteSentCount: number
  inviteSentAt: string | null
  createdAt: string
}

export const APP_STATUS: Record<ApplicationStatus, { label: string; cls: string }> = {
  pending: { label: 'New', cls: 'chip--warn' },
  approved: { label: 'Approved', cls: 'chip--good' },
  rejected: { label: 'Rejected', cls: 'chip--bad' },
}

/** The five uploads the form collects, in the order they are asked for. Kept
 *  as one list so the form and the submit function read the same shape
 *  rather than five separate hand-written blocks. */
export const APPLICATION_DOCS = [
  { key: 'photo', label: 'Photo' },
  { key: 'pan', label: 'PAN card' },
  { key: 'aadhaar', label: 'Aadhaar card' },
  { key: 'bank_proof', label: 'Bank proof (cancelled cheque or passbook)' },
  { key: 'relieving_letter', label: 'Previous employer relieving letter', waivable: true },
  { key: 'signature', label: 'Your signature (photo or scan)' },
  // Round 6 (0026): optional even for somebody with previous employment —
  // "if it is not compulsory to do it but we keep the field there." Hidden
  // entirely when noPreviousEmployment is ticked, same as the relieving
  // letter, but never blocks Next/Submit either way.
  { key: 'experience_letter', label: 'Experience letter (optional)', optional: true, waivable: true },
  { key: 'salary_slip', label: 'Salary slip (optional)', optional: true, waivable: true },
] as const
