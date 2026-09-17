import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Rail, type RailItem } from '@/components/Rail'
import { BottomNav, type BottomNavItem } from '@/components/BottomNav'
import { Modal } from '@/components/Modal'
import { AccountControls } from '@/components/AccountControls'
import { useHoverTip } from '@/components/HoverTip'
import { usePanes } from '@/lib/usePanes'
import { Avatar, Chip, Kpi } from '@/components/bits'
import { count, initials, money } from '@/lib/format'
import { ProfileModal } from '@/modals/ProfileModal'
import { EmployeeModal } from '@/modals/EmployeeModal'
import { HrAttendance } from '@/screens/sections/HrAttendance'
import { TermsAndConditions } from '@/screens/sections/TermsAndConditions'
import { usePersistedState } from '@/lib/usePersistedState'
import { LeaveRequestModal } from '@/modals/LeaveRequestModal'
import { LeaveDecisionModal } from '@/modals/LeaveDecisionModal'
import { SalaryRecordModal } from '@/modals/SalaryRecordModal'
import { DocumentUploadModal } from '@/modals/DocumentUploadModal'
import { ApplicationReviewModal } from '@/modals/ApplicationReviewModal'
import { useLeaveBoard, useLeaveMonth } from '@/data/useLeaveMonths'
import { addMonths, firstOfMonth, fmtDays, type LeaveChoice } from '@/lib/leaveRules'
import { useEmployees, type EmployeeDraft } from '@/data/useEmployees'
import { useJobApplications } from '@/data/useJobApplications'
import { useLeaveRequests } from '@/data/useLeaveRequests'
import { LeaveAlertStack, type LeaveAlert } from '@/components/LeaveAlertStack'
import { useSalaryRecords } from '@/data/useSalaryRecords'
import { useOnboardingTasks } from '@/data/useOnboardingTasks'
import { useEmployeeDocuments } from '@/data/useEmployeeDocuments'
import { useExitTasks } from '@/data/useExitTasks'
import { useExitRecords } from '@/data/useExitRecords'
import { useAttendance } from '@/data/useAttendance'
import { statusChip, fmtDuration, fmtShift, fmtTime, monthOf, officeToday, summarise } from '@/lib/attendance'
import {
  APP_STATUS, DOC_TYPE, EMPLOYMENT, EMP_STATUS, LEAVE_STATUS, LEAVE_TYPE, SALARY_STATUS, currentPeriod, fmtDate, fmtPeriod, joinedThisMonth, tenure, todayISO,
  type DocType, type Employee, type JobApplication, type LeaveRequest, type SalaryRecord,
  HR_DEPARTMENT,
} from '@/lib/hr'
import type { Workspace } from '@/data/useWorkspace'

const PEOPLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
)
const DEPT_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
  </svg>
)
const SALARY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" />
  </svg>
)
const DASH_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
)
const ATT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
)

const EXIT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)

const APPLY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    <path d="M9 15l2 2 4-4" />
  </svg>
)

const TERMS_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h5" />
  </svg>
)

/** The tabs inside one person's profile. Everything here already existed as a
 *  section stacked on one very long page; this is the container, not new
 *  content. Exit only appears once somebody is actually leaving. */
type ProfileTab = 'overview' | 'attendance' | 'leave' | 'salary' | 'onboarding' | 'exit'
const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'salary', label: 'Salary' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'exit', label: 'Exit' },
]

/** One label / value pair on the employee page. */
const Fld = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="hr-fld"><div className="l">{l}</div><div className="v">{v || '—'}</div></div>
)

/**
 * The HR dashboard. It gets the owner's rail rather than the salesperson's tab
 * strip, because HR grows: leave, salary, onboarding and exits are four more
 * sections arriving in phases 2 to 5, and a row of tabs runs out of room where
 * a sidebar does not.
 *
 * Who reaches this screen is decided by department, not by a role — see
 * migration 0006. Everything it can read or write is enforced there too, so
 * nothing on this page is load-bearing for security. The owner reaches it too
 * (App.tsx wires a route to it) since decision #2 in Phase 1 was that HR and
 * the owner both work the directory — `onBackToProjects` is only given then.
 */
export function HrPage({
  ws, toast, onBackToProjects,
}: { ws: Workspace; toast: (m: string) => void; onBackToProjects?: () => void }) {
  const panes = usePanes()
  const tip = useHoverTip()
  /* Four hooks here, five further down. These four are what the page needs
     before it can draw anything at all: the directory, the dashboard's
     "waiting on you" list and its attendance strip all read them on the very
     first screen, so there is nothing to gain by deferring them. */
  const hr = useEmployees()
  // A request landing from another browser while this one is open, anywhere
  // in the HR module — see LeaveAlertStack.tsx. Kept as its own small queue
  // rather than reusing `toast`: toast is one slot, three seconds, and
  // already busy with routine "Saved." confirmations that would otherwise
  // silently erase a request nobody has seen yet.
  const [leaveAlerts, setLeaveAlerts] = useState<LeaveAlert[]>([])
  const leave = useLeaveRequests(true, (row) => {
    setLeaveAlerts((p) => [{ id: row.id, request: row }, ...p])
  })
  const att = useAttendance()
  const applications = useJobApplications()

  const [section, setSection] = usePersistedState<'dashboard' | 'directory' | 'attendance' | 'departments' | 'salary' | 'joining' | 'exit' | 'terms'>('hr-section', 'dashboard')
  /* Applications (the public joining form's inbox) and Onboarding (the
     checklist for somebody an application just turned into) used to be two
     separate sidebar tabs, even though the moment one is approved the SAME
     person shows up as a second row on the second screen — one pipeline
     reading as two unrelated ones. One tab, two views. */
  const [joiningView, setJoiningView] = usePersistedState<'applications' | 'onboarding'>('hr-joiningView', 'applications')
  /* Same idea, for Attendance and Leave: two screens that both answer "how is
     the team doing right now", split only because one grew as a day table and
     the other as an approval workflow. One tab, two views — Day keeps the QR
     poster/branch machinery, Leave keeps the approve/reject/close-the-month
     workflow, neither is simplified to fit inside the other. */
  const [attView, setAttView] = usePersistedState<'day' | 'leave'>('hr-attView', 'day')
  /* Which tab of somebody's profile is open. Reset by openEmployee below, so
     opening a second person never lands you on the first one's Salary tab. */
  const [profTab, setProfTab] = usePersistedState<ProfileTab>('hr-profTab', 'overview')
  const [reviewingApp, setReviewingApp] = useState<JobApplication | null>(null)
  // Persisted so a refresh reopens the same employee's profile, same as every
  // other tab on this screen — not just the section list behind it.
  const [openId, setOpenId] = usePersistedState<string | null>('hr-openId', null)
  const [adding, setAdding] = useState<Partial<EmployeeDraft> | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [resigning, setResigning] = useState<Employee | null>(null)
  const [deletingEmp, setDeletingEmp] = useState(false)
  const [lastDay, setLastDay] = useState(todayISO())
  const [resignDate, setResignDate] = useState(todayISO())
  const [noticeDays, setNoticeDays] = useState('')
  const [exitReason, setExitReason] = useState('')
  const [rehireEligible, setRehireEligible] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [loggingFor, setLoggingFor] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; action: 'approved' | 'rejected' } | null>(null)
  const [holDate, setHolDate] = useState('')
  const [holName, setHolName] = useState('')
  const [logEmpId, setLogEmpId] = useState('')
  const [addingSalaryFor, setAddingSalaryFor] = useState<string | null>(null)
  const [editingSalary, setEditingSalary] = useState<SalaryRecord | null>(null)
  const [salaryEmpId, setSalaryEmpId] = useState('')
  const [emailingSalary, setEmailingSalary] = useState<string | null>(null)
  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [deptId, setDeptId] = useState('')
  /* Cards or List, the same choice Projects already gives the owner — a
     department with nobody in it is a single fact, and a wall of stacked
     "Nobody yet" cards buries the ones that matter. Cards read as a grid to
     scan; List is today's stacked view, unchanged, for whoever would rather
     read down a page. Default Cards, remembered per browser. */
  const DEPT_VIEW_KEY = 'metrol-crm-deptview'
  const [deptView, setDeptView] = useState<'cards' | 'list'>(() => {
    try { return localStorage.getItem(DEPT_VIEW_KEY) === 'list' ? 'list' : 'cards' } catch { return 'cards' }
  })
  const pickDeptView = (v: 'cards' | 'list') => {
    setDeptView(v)
    try { localStorage.setItem(DEPT_VIEW_KEY, v) } catch { /* a remembered view is a convenience */ }
  }
  /* A card opens the same roster the list already shows inline — filtered to
     this department on the Employees page, which already has exactly this
     filter built for its search bar. Not a new per-department dashboard:
     nobody has said what one should contain yet, and this reuses what HR
     already has rather than inventing a second way to see the same people. */
  const openDept = (id: string) => { setDeptId(id); setSection('directory') }
  const [showLeavers, setShowLeavers] = useState(false)

  /* Owner or HR — the same pair the delete-employee Edge Function enforces
     server-side. This is a convenience for the UI only: hiding the button
     stops nobody, and the function refuses anyone else regardless. */
  const canDelete = ws.me?.role === 'owner' || ws.departmentName(ws.me?.departmentId ?? null) === HR_DEPARTMENT
  const open = openId ? hr.rows.find((e) => e.id === openId) ?? null : null
  const openEmployee = (id: string) => { setOpenId(id); setProfTab('overview') }
  const employeeName = (id: string) => hr.rows.find((e) => e.id === id)?.fullName ?? 'Unknown'

  /* The other five, gated — and declared down here rather than with the rest
     because the gate is `section` and `profTab`, which are state declared
     above this line.

     Opening HR fired nine `select *` queries at once, five of them for
     sections most visits never open: payroll, onboarding, documents, exit
     checklists and exit records. They now load when somebody goes to the part
     of the page that reads them, which leaves four queries between signing in
     and seeing the directory.

     Each condition names TWO places, not one, because each of these tables is
     read in two: its own top-level section AND the matching tab of an
     employee's profile. Gate on only the profile and Payroll draws an empty
     table; gate on only the section and a payslip tab does. `docs` pairs with
     `onboarding` rather than having a page of its own — Onboarding is where
     documents are counted and listed.

     Switching away and back re-runs the query. That is the existing `enabled`
     contract in this folder (Member.tsx has used it for exit tasks all
     along), it is one small select, and coming back to a section showing
     current rows is the behaviour you want anyway. */
  const inProfile = (tab: ProfileTab) => !!open && profTab === tab
  const salary = useSalaryRecords(section === 'salary' || inProfile('salary'))

  /* Round 2's engine, read two ways from one place: `lm` asks about the person
     whose profile is open, `board` asks about everybody in a month. Both are
     gated the same way every other hook on this screen is. */
  const [leaveMonth, setLeaveMonth] = useState(() => firstOfMonth(todayISO()))
  const [closingFor, setClosingFor] = useState<string | null>(null)
  const leaveSrc = useMemo(() => ({
    employees: hr.rows, rows: att.rows, leaves: leave.rows,
    holidays: att.holidays, settings: att.settings, today: todayISO(),
  }), [hr.rows, att.rows, leave.rows, att.holidays, att.settings])
  const lm = useLeaveMonth(inProfile('leave') ? openId : null, leaveMonth, leaveSrc)
  const board = useLeaveBoard(leaveMonth, leaveSrc, section === 'attendance' && attView === 'leave')
  const thisMonth = firstOfMonth(todayISO())
  const monthName = (m: string) => new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  /** Recording the employee's choice for the month. The refusal that matters —
   *  "close August first", "this month has not ended" — comes back as the
   *  database's own sentence, not a generic failure. */
  async function closeMonth(employeeId: string, choice: LeaveChoice) {
    setClosingFor(employeeId)
    const message = await board.close(employeeId, choice)
    setClosingFor(null)
    toast(message ?? (choice === 'payout'
      ? 'Month closed — the unused days go on their salary.'
      : 'Month closed — the unused days carry into next month.'))
  }
  const onboarding = useOnboardingTasks((section === 'joining' && joiningView === 'onboarding') || inProfile('onboarding'))
  const docs = useEmployeeDocuments((section === 'joining' && joiningView === 'onboarding') || inProfile('onboarding'))
  const exitTasks = useExitTasks(section === 'exit' || inProfile('exit'))
  const exitRecords = useExitRecords(inProfile('exit'))

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return hr.rows.filter((e) => {
      if (!showLeavers && e.status === 'resigned') return false
      if (deptId && e.departmentId !== deptId) return false
      if (!needle) return true
      return [e.fullName, e.employeeCode, e.designation, e.phone, e.workEmail]
        .some((v) => v.toLowerCase().includes(needle))
    })
  }, [hr.rows, q, deptId, showLeavers])

  // Somebody with a login and no employee record is the most common gap in a
  // fresh HR module — worth saying out loud rather than leaving HR to notice.
  const recorded = new Set(hr.rows.map((e) => e.profileId).filter(Boolean))
  const unrecorded = ws.members.filter((m) => !recorded.has(m.id))

  const pendingApps = applications.rows.filter((a) => a.status === 'pending')

  /* The order is Adarsh's, and it is the order of the working day rather than
     the order the module grew in: what is happening today (Dashboard), then
     who is in (Attendance), then Departments — the one he intends to grow, so
     it gets the middle slot — then the people themselves. Everything that is
     a monthly or occasional job (Leave, Salary, Onboarding, Exit, and the
     applications inbox) sits after them, which on a phone is behind More.
     Salary is deliberately NOT a tab: he swapped it out for Employees. */
  /* Attendance (the day table) and Leave (the approval workflow) used to be
     two sidebar entries; a pending leave request now shows as a count on the
     one Attendance tab, same as Joining does for pending applications, and
     the Day/Leave toggle inside the tab decides which of the two you see. */
  const pendingLeave = leave.rows.filter((r) => r.status === 'pending')
  const railItems: RailItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: DASH_ICON, onClick: () => { setSection('dashboard'); setOpenId(null) } },
    {
      key: 'attendance', label: pendingLeave.length ? `Attendance (${pendingLeave.length})` : 'Attendance',
      icon: ATT_ICON, onClick: () => { setSection('attendance'); setOpenId(null) },
    },
    { key: 'departments', label: 'Departments', icon: DEPT_ICON, onClick: () => { setSection('departments'); setOpenId(null) } },
    { key: 'directory', label: 'Employees', icon: PEOPLE_ICON, onClick: () => { setSection('directory'); setOpenId(null) } },
    { key: 'salary', label: 'Salary', icon: SALARY_ICON, onClick: () => { setSection('salary'); setOpenId(null) } },
    { key: 'exit', label: 'Exit', icon: EXIT_ICON, onClick: () => { setSection('exit'); setOpenId(null) } },
    {
      key: 'joining', label: pendingApps.length ? `Joining (${pendingApps.length})` : 'Joining',
      icon: APPLY_ICON, onClick: () => { setSection('joining'); setOpenId(null) },
    },
    { key: 'terms', label: 'Terms & Conditions', icon: TERMS_ICON, onClick: () => { setSection('terms'); setOpenId(null) } },
  ]

  /* The phone's tab bar carries the same seven sections in the same order —
     a sidebar can list them all, five tabs cannot, so the first four become
     tabs and the rest live behind More. Labels are shortened for a 75px tab,
     and both counted tabs' numbers move out of the words and onto the icon
     where a tab bar puts them. */
  const NAV_SHORT: Record<string, string> = {
    dashboard: 'Dashboard', attendance: 'Attendance', departments: 'Departments', directory: 'Employees',
    salary: 'Salary', exit: 'Exit', joining: 'Joining', terms: 'Terms',
  }
  const navItems: BottomNavItem[] = railItems.map((it) => ({
    ...it,
    label: it.key === 'joining' ? 'Joining' : it.key === 'attendance' ? 'Attendance' : it.label,
    short: NAV_SHORT[it.key],
    badge: it.key === 'joining' ? pendingApps.length : it.key === 'attendance' ? pendingLeave.length : undefined,
  }))

  const exitTasksFor = (employeeId: string) => exitTasks.rows.filter((t) => t.employeeId === employeeId).sort((a, b) => a.sortOrder - b.sortOrder)
  const exitRecordFor = (employeeId: string) => exitRecords.rows.find((r) => r.employeeId === employeeId) ?? null
  const leaving = hr.rows.filter((e) => e.status !== 'active')

  const tasksFor = (employeeId: string) => onboarding.rows.filter((t) => t.employeeId === employeeId).sort((a, b) => a.sortOrder - b.sortOrder)
  const docsFor = (employeeId: string) => docs.rows.filter((d) => d.employeeId === employeeId)
  const inProgress = hr.rows.filter((e) => e.status !== 'resigned' && tasksFor(e.id).some((t) => !t.done))

  const addTask = async (employeeId: string) => {
    const message = await onboarding.add(employeeId, newTaskLabel)
    if (!message) { toast('Task added.'); setNewTaskLabel('') }
    return message
  }

  const uploadDoc = async (employeeId: string, file: File, docType: DocType) => {
    const message = await docs.upload(employeeId, file, docType, ws.me?.id ?? '')
    if (!message) toast('Document uploaded.')
    return message
  }

  /* Everything the dashboard says about today. Nothing here is a new metric:
     it is the attendance day HrAttendance already builds, the leave and
     application queues that already exist, and headcount. If it cannot be
     answered from this database it is not on this page. */
  const tzToday = att.settings?.timezone ?? 'Asia/Kolkata'
  const dashToday = officeToday(tzToday)
  const activeStaff = hr.rows.filter((e) => e.status !== 'resigned')
  const todayRows = att.rows.filter((r) => r.workDate === dashToday)
  const punchedIds = new Set(todayRows.map((r) => r.employeeId))
  const inOfficeNow = todayRows.filter((r) => r.status === 'in_progress').length
  const lateToday = todayRows.filter((r) => (r.lateMinutes ?? 0) > 0).length

  const currentPeriodStr = currentPeriod()
  const pendingSalary = salary.rows.filter((r) => r.status === 'pending')
  const paidThisMonth = salary.rows.filter((r) => r.status === 'paid' && r.period === currentPeriodStr)
  const payrollThisMonth = salary.rows.filter((r) => r.period === currentPeriodStr).reduce((t, r) => t + r.netAmount, 0)

  const salaryCols: GridCol<SalaryRecord>[] = [
    { key: 'who', label: 'Employee', width: 190, render: (r) => employeeName(r.employeeId) },
    { key: 'period', label: 'Month', width: 110, render: (r) => fmtPeriod(r.period) },
    { key: 'gross', label: 'Gross', width: 120, render: (r) => <span className="cell-money">{money(r.grossAmount)}</span> },
    { key: 'net', label: 'Net', width: 120, render: (r) => <span className="cell-money">{money(r.netAmount)}</span> },
    { key: 'status', label: 'Status', width: 110, render: (r) => <Chip cls={SALARY_STATUS[r.status].cls}>{SALARY_STATUS[r.status].label}</Chip> },
    {
      key: 'sent', label: 'Emailed', width: 100,
      render: (r) => (r.payslipSentCount > 0 ? <Chip cls="chip--good">Sent</Chip> : <Chip cls="chip--mute">Not sent</Chip>),
    },
    {
      key: 'act', label: '', width: 260,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {r.status === 'pending' && (
            <button className="btn btn--sm btn--primary" onClick={() => void salary.markPaid(r.id, ws.me?.id ?? '').then((m) => toast(m ?? 'Marked paid.'))}>
              Mark paid
            </button>
          )}
          <button className="btn btn--sm" onClick={() => setEditingSalary(r)}>Edit</button>
          <button className="btn btn--sm" disabled={emailingSalary === r.id}
                  onClick={() => {
                    setEmailingSalary(r.id)
                    void salary.emailPayslip(r.id)
                      .then((m) => toast(m ?? (r.payslipSentCount > 0 ? 'Payslip re-sent.' : 'Payslip emailed.')))
                      .finally(() => setEmailingSalary(null))
                  }}>
            {emailingSalary === r.id ? 'Sending…' : r.payslipSentCount > 0 ? 'Resend' : 'Email payslip'}
          </button>
        </div>
      ),
    },
  ]

  const saveSalaryNew = async (draft: Parameters<typeof salary.create>[0]) => {
    const message = await salary.create(draft)
    if (!message) toast('Payslip added.')
    return message
  }

  const saveSalaryEdit = async (draft: Parameters<typeof salary.update>[1]) => {
    if (!editingSalary) return 'Nothing is open for editing.'
    const message = await salary.update(editingSalary.id, draft)
    if (!message) toast('Saved.')
    return message
  }

  const pending = leave.rows.filter((r) => r.status === 'pending')
  const decidedThisMonth = leave.rows.filter((r) => {
    if (!r.decidedAt) return false
    const d = new Date(r.decidedAt)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const onLeaveToday = leave.rows.filter((r) => r.status === 'approved' && r.startDate <= todayISO() && r.endDate >= todayISO())
  const onLeaveTodayIds = new Set(onLeaveToday.map((r) => r.employeeId))
  /* Not "absent" — absent is a judgement, and at 9:40am most of this list is
     simply people who have not arrived yet. It is the list HR scans in the
     morning, so approved leave is taken out of it: somebody on leave is not
     missing. */
  const notInYet = activeStaff.filter((e) => !punchedIds.has(e.id) && !onLeaveTodayIds.has(e.id))

  const leaveCols: GridCol<LeaveRequest>[] = [
    { key: 'who', label: 'Employee', width: 190, render: (r) => employeeName(r.employeeId) },
    { key: 'when', label: 'Dates', width: 190, render: (r) => `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` },
    { key: 'days', label: 'Days', width: 72, render: (r) => r.daysCount },
    { key: 'type', label: 'Type', width: 100, render: (r) => <Chip cls={LEAVE_TYPE[r.leaveType].cls}>{LEAVE_TYPE[r.leaveType].label}</Chip> },
    { key: 'reason', label: 'Reason', width: 220, render: (r) => r.reason || <span className="cell-dash">—</span> },
    { key: 'status', label: 'Status', width: 120, render: (r) => <Chip cls={LEAVE_STATUS[r.status].cls}>{LEAVE_STATUS[r.status].label}</Chip> },
    {
      key: 'act', label: '', width: 180,
      render: (r) => r.status === 'pending' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn--sm btn--primary" onClick={() => setDeciding({ request: r, action: 'approved' })}>Approve</button>
          <button className="btn btn--sm" onClick={() => setDeciding({ request: r, action: 'rejected' })}>Reject</button>
        </div>
      ) : r.decisionNote ? <span className="cell-mute">{r.decisionNote}</span> : null,
    },
  ]

  const logLeave = async (draft: Parameters<typeof leave.create>[0]) => {
    const message = await leave.create(draft)
    if (!message) toast('Leave request logged.')
    return message
  }

  const decideLeave = async (id: string, status: 'approved' | 'rejected', note?: string) => {
    const message = await leave.decide(id, status, ws.me?.id ?? '', note)
    if (!message) toast(status === 'approved' ? 'Leave approved.' : 'Leave rejected.')
    return message
  }

  const cols: GridCol<Employee>[] = [
    {
      key: 'name', label: 'Name', width: 210,
      render: (e) => (
        <div className="td-flex">
          <Avatar>{initials(e.fullName)}</Avatar>
          <button className="name-btn" onClick={() => openEmployee(e.id)}>{e.fullName}</button>
        </div>
      ),
    },
    { key: 'code', label: 'Code', width: 92, render: (e) => <span className="cell-mono">{e.employeeCode || '—'}</span> },
    { key: 'desig', label: 'Designation', width: 168, render: (e) => e.designation || <span className="cell-dash">—</span> },
    { key: 'dept', label: 'Department', width: 158, render: (e) => ws.departmentName(e.departmentId) ?? <span className="cell-dash">—</span> },
    { key: 'type', label: 'Type', width: 104, render: (e) => <span className="cell-mute">{EMPLOYMENT[e.employmentType]}</span> },
    { key: 'joined', label: 'Joined', width: 124, render: (e) => fmtDate(e.dateOfJoining) },
    { key: 'status', label: 'Status', width: 116, render: (e) => <Chip cls={EMP_STATUS[e.status].cls}>{EMP_STATUS[e.status].label}</Chip> },
  ]

  const deptCols: GridCol<Employee>[] = cols.filter((c) => c.key !== 'dept')

  /* Adarsh asked for "the employees list data department wise", so department
     is the arrangement rather than a column. Searching or filtering to one
     department drops back to a single flat table — at that point the grouping
     is answering a question nobody asked. */
  const grouped = !q.trim() && !deptId
  const deptGroups = [...ws.departments]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => ({ id: d.id, name: d.name, rows: shown.filter((e) => e.departmentId === d.id) }))
    .concat([{ id: '', name: 'No department', rows: shown.filter((e) => !e.departmentId) }])
    .filter((g) => g.rows.length > 0)

  const saveNew = async (draft: EmployeeDraft) => {
    const message = await hr.create(draft)
    if (!message) toast(draft.fullName + ' added to the directory.')
    return message
  }

  const deleteEmployee = async (emp: Employee) => {
    if (!window.confirm(`Permanently delete ${emp.fullName}? This removes their login, their documents, and every leave, salary, attendance and onboarding record. This cannot be undone.`)) return
    setDeletingEmp(true)
    const message = await hr.remove(emp.id)
    setDeletingEmp(false)
    if (message) { toast(message); return }  // failed — stay on the profile, error is on screen
    toast(emp.fullName + ' deleted.')
    setOpenId(null)
  }

  const saveEdit = async (draft: EmployeeDraft) => {
    if (!editing) return 'Nothing is open for editing.'
    const message = await hr.update(editing.id, draft)
    if (!message) toast('Saved.')
    return message
  }

  const confirmResign = async () => {
    if (!resigning) return
    const message = await hr.update(resigning.id, {
      status: 'resigned',
      lastWorkingDay: lastDay,
      resignationDate: resignDate,
      noticePeriodDays: noticeDays === '' ? null : Number(noticeDays),
    })
    if (!message && (exitReason.trim() || !rehireEligible)) {
      await exitRecords.create({ employeeId: resigning.id, reason: exitReason, exitInterviewNotes: '', rehireEligible })
    }
    setResigning(null)
    setNoticeDays('')
    setExitReason('')
    setRehireEligible(true)
    toast(message ?? (resigning.fullName + ' marked as resigned. The record stays.'))
  }

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          {onBackToProjects && <button className="btn btn--sm" onClick={onBackToProjects}>← Projects</button>}
          <AccountControls ws={ws} variant="topbar" roleLabel={ws.me?.role === 'owner' ? 'Owner' : 'HR'}
                           onOpenProfile={() => setProfileOpen(true)} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.role === 'owner' ? 'Owner' : 'HR'} onOpenProfile={() => setProfileOpen(true)} active={open ? 'directory' : section} panes={panes} tip={tip} items={railItems} />

        <div className="workspace">

          <div className="wrap">
            {hr.error && <div className="auth-err" style={{ marginBottom: 14 }}>{hr.error}</div>}

            {/* ------------------------------------------------ one person */}
            {open && (
              <>
                {/* The profile. It used to be every section stacked into one
                    scroll, which on a phone was about nine screens long. The
                    identity — face, name, employee ID, where they sit — is the
                    header and never scrolls away from under you; everything
                    else is a tab. No section changed, only where it lives. */}
                <div className="page-head">
                  <button className="btn btn--sm" onClick={() => setOpenId(null)}>← Employees</button>
                </div>

                <div className="prof-head">
                  <Avatar lg>{initials(open.fullName)}</Avatar>
                  <div className="prof-id">
                    <h1>{open.fullName}</h1>
                    <div className="prof-meta">
                      {/* The employee ID is the thing he asked for by name, and
                          it is what somebody reads out on a call — mono, first,
                          not buried in a run of dot-separated text. */}
                      <span className="prof-code">{open.employeeCode || 'No ID'}</span>
                      <span>
                        {open.designation || 'No designation'} · {ws.departmentName(open.departmentId) ?? 'No department'}
                      </span>
                      <Chip cls={EMP_STATUS[open.status].cls}>{EMP_STATUS[open.status].label}</Chip>
                    </div>
                    <div className="sub">
                      Joined {fmtDate(open.dateOfJoining)} · {tenure(open.dateOfJoining)} with Metrol
                    </div>
                  </div>
                  <div className="prof-actions">
                    <button className="btn btn--sm" onClick={() => setEditing(open)}>Edit</button>
                    {open.status !== 'resigned' && (
                      <button className="btn btn--sm" onClick={() => {
                        setLastDay(todayISO()); setResignDate(todayISO()); setNoticeDays(''); setExitReason(''); setRehireEligible(true)
                        setResigning(open)
                      }}>
                        Mark as resigned
                      </button>
                    )}
                    {/* Deliberately apart from "Mark as resigned" — that is
                        how a REAL employee leaves and keeps their history;
                        this is for a record that should never have existed (a
                        test application approved while proving the joining
                        form worked). Two clicks, the second one naming who is
                        about to be erased, because there is no undo past it.

                        Owner OR HR. It shipped owner-only on the reasoning
                        that erasing somebody is not a daily HR action —
                        Adarsh's answer was that HR is the one MAINTAINING
                        this directory, and he is right: the person who enters
                        every record is the person who has to fix a wrong one,
                        and sending them to the owner for it makes the owner a
                        bottleneck on HR's own data. The same pair is what
                        migration 0021 already grants on applications, so the
                        two deletes now answer to the same two people.
                        `canDelete` matches the Edge Function's own check
                        exactly — see its header. */}
                    {canDelete && (
                      <button className="btn btn--sm btn--danger" disabled={deletingEmp} onClick={() => void deleteEmployee(open)}>
                        {deletingEmp ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="tabs prof-tabs">
                  {PROFILE_TABS.filter((t) => t.key !== 'exit' || open.status !== 'active').map((t) => (
                    <button key={t.key} className={profTab === t.key ? 'is-on' : ''} onClick={() => setProfTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {profTab === 'overview' && (<>
                <div className="section">
                  <div className="section-head"><h3>Employment</h3></div>
                  <div className="hr-fields">
                    <Fld l="Joined" v={fmtDate(open.dateOfJoining)} />
                    <Fld l="Type" v={EMPLOYMENT[open.employmentType]} />
                    <Fld l="Department" v={ws.departmentName(open.departmentId)} />
                    <Fld l="Reports to" v={hr.rows.find((e) => e.id === open.reportingTo)?.fullName} />
                    <Fld l="Employee code" v={open.employeeCode} />
                    <Fld l="CRM login" v={open.profileId ? (ws.members.find((m) => m.id === open.profileId)?.email ?? 'Linked') : 'No login'} />
                    {open.status !== 'active' && <Fld l="Last working day" v={fmtDate(open.lastWorkingDay)} />}
                  </div>
                </div>

                <div className="section">
                  <div className="section-head"><h3>Contact</h3></div>
                  <div className="hr-fields">
                    <Fld l="Phone" v={open.phone} />
                    <Fld l="Work email" v={open.workEmail} />
                    <Fld l="Personal email" v={open.personalEmail} />
                    <Fld l="Date of birth" v={fmtDate(open.dateOfBirth)} />
                    <Fld l="Address" v={open.address} />
                  </div>
                </div>

                <div className="section">
                  <div className="section-head"><h3>Emergency contact</h3></div>
                  <div className="hr-fields">
                    <Fld l="Name" v={open.emergencyName} />
                    <Fld l="Relation" v={open.emergencyRelation} />
                    <Fld l="Phone" v={open.emergencyPhone} />
                  </div>
                </div>

                {open.notes && (
                  <div className="section">
                    <div className="section-head"><h3>Notes</h3></div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{open.notes}</p>
                  </div>
                )}
                </>)}

                {/* This person's attendance, on their own record — the month
                    they are having, then the days themselves. The company-wide
                    view is one day across everybody; this is one person across
                    days, which is the question you ask when you are standing on
                    somebody's record page. */}
                {profTab === 'attendance' && (
                <div className="section">
                  <div className="section-head">
                    <h3>Attendance</h3>
                    <div className="section-tools" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                      Shift {fmtShift(att.shifts.find((sh) => sh.id === open.shiftId)?.startsAt ?? null)}
                    </div>
                  </div>
                  {(() => {
                    const mine = att.rows
                      .filter((r) => r.employeeId === open.id)
                      .sort((a, b) => b.workDate.localeCompare(a.workDate))
                    const tz = att.settings?.timezone ?? 'Asia/Kolkata'
                    const month = summarise(mine.filter((r) => monthOf(r.workDate) === monthOf(officeToday(tz))))
                    if (mine.length === 0) {
                      return <p style={{ color: 'var(--ink-3)' }}>Nothing recorded yet.</p>
                    }
                    return (
                      <>
                        <div className="att-sum" style={{ marginBottom: 12 }}>
                          <div className="att-sum-tile"><div className="n">{month.present}</div><div className="l">Present</div></div>
                          <div className="att-sum-tile"><div className="n">{month.late}</div><div className="l">Late coming</div></div>
                          <div className="att-sum-tile"><div className="n">{month.halfDay}</div><div className="l">Half days</div></div>
                          <div className="att-sum-tile"><div className="n">{month.missing}</div><div className="l">No punch out</div></div>
                          <div className="att-sum-tile"><div className="n">{fmtDuration(month.workedMinutes)}</div><div className="l">This month</div></div>
                        </div>
                        <div className="ov-actions">
                          {mine.slice(0, 15).map((r) => (
                            <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                              <span className="ov-n">{fmtDate(r.workDate).slice(0, 6)}</span>
                              <span className="ov-l">
                                {fmtTime(r.punchInAt, tz)} – {fmtTime(r.punchOutAt, tz)}
                                <span style={{ color: 'var(--ink-3)' }}>
                                  {'  ·  '}{fmtDuration(r.workedMinutes)}
                                  {r.lateMinutes ? ' · ' + r.lateMinutes + ' min late' : ''}
                                  {r.punchInDistance != null ? ' · ' + Math.round(r.punchInDistance) + ' m away' : ''}
                                  {r.source === 'hr' ? ' · HR entry' : ''}
                                </span>
                              </span>
                              <Chip cls={statusChip(r.status).cls}>{statusChip(r.status).label}</Chip>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>

                )}

                {profTab === 'leave' && (
                <div className="section">
                  <div className="section-head">
                    <h3>Leave</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm" onClick={() => { setLogEmpId(open.id); setLoggingFor(open.id) }}>Log leave</button>
                    </div>
                  </div>
                  <div className="section-tools" style={{ marginBottom: 10, justifyContent: 'flex-start' }}>
                    <button className="btn btn--sm" onClick={() => setLeaveMonth((m) => addMonths(m, -1))}>←</button>
                    <strong style={{ alignSelf: 'center' }}>{monthName(leaveMonth)}</strong>
                    <button className="btn btn--sm" disabled={leaveMonth >= thisMonth}
                            onClick={() => setLeaveMonth((m) => addMonths(m, 1))}>→</button>
                  </div>
                  {/* A month's balance, not a year's — 2 days accrue each month
                      and what is left is paid out or carried. */}
                  <div className="hr-fields" style={{ marginBottom: 12 }}>
                    <Fld l="Available" v={fmtDays(lm.data?.available)} />
                    <Fld l="Used" v={fmtDays(lm.data?.used)} />
                    <Fld l="Left" v={fmtDays(lm.data?.closing)} />
                    {/* Not a withdrawal from the balance — this is what comes
                        off the salary, which is a different fact. */}
                    <Fld l="Unpaid days" v={fmtDays(lm.data?.unpaidDays)} />
                  </div>
                  {lm.error && <div className="auth-err" style={{ marginBottom: 12 }}>{lm.error}</div>}
                  {lm.data?.provisional && (
                    <p className="punch-note" style={{ marginTop: -4 }}>
                      {monthName(addMonths(leaveMonth, -1))} is not closed yet, so the brought-forward figure assumes it was carried.
                    </p>
                  )}
                  {leave.rows.filter((r) => r.employeeId === open.id).length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No leave requests on record.</p>
                  ) : (
                    <DataGrid cols={leaveCols} rows={leave.rows.filter((r) => r.employeeId === open.id)} storageKey="hr-employee-leave"
                              foot={<div className="grid-foot"><span>{count(leave.rows.filter((r) => r.employeeId === open.id).length, 'request')}</span></div>} />
                  )}
                </div>

                )}

                {profTab === 'salary' && (
                <div className="section">
                  <div className="section-head">
                    <h3>Salary</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm" onClick={() => setAddingSalaryFor(open.id)}>Add payslip</button>
                    </div>
                  </div>
                  {salary.rows.filter((r) => r.employeeId === open.id).length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No payslips on record.</p>
                  ) : (
                    <DataGrid cols={salaryCols} rows={[...salary.rows.filter((r) => r.employeeId === open.id)].sort((a, b) => b.period.localeCompare(a.period))}
                              storageKey="hr-employee-salary"
                              foot={<div className="grid-foot"><span>{count(salary.rows.filter((r) => r.employeeId === open.id).length, 'payslip')}</span></div>} />
                  )}
                </div>

                )}

                {profTab === 'onboarding' && (
                <div className="section">
                  <div className="section-head"><h3>Offer &amp; onboarding</h3></div>
                  <div className="hr-fields" style={{ marginBottom: 12 }}>
                    <Fld l="Offer extended" v={fmtDate(open.offerExtendedOn)} />
                    <Fld l="Offer accepted" v={fmtDate(open.offerAcceptedOn)} />
                  </div>

                  <div className="hr-soon" style={{ marginBottom: 14 }}>
                    {tasksFor(open.id).map((t) => (
                      <label key={t.id} className="chip chip--mute" style={{ cursor: 'pointer', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
                        <input type="checkbox" checked={t.done}
                               onChange={(e) => void onboarding.toggle(t.id, e.target.checked, ws.me?.id ?? '')} />
                        {t.label}
                        <button type="button" className="icon-btn" title="Remove task"
                                onClick={() => void onboarding.remove(t.id)} style={{ marginLeft: 2 }}>×</button>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                    <input className="input" placeholder="Add a checklist item…" value={newTaskLabel}
                           onChange={(e) => setNewTaskLabel(e.target.value)} style={{ maxWidth: 260 }} />
                    <button className="btn btn--sm" disabled={!newTaskLabel.trim()} onClick={() => void addTask(open.id)}>Add task</button>
                  </div>

                  <div className="section-head">
                    <h3 style={{ fontSize: 14 }}>Documents</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm" onClick={() => setUploadingFor(open.id)}>Upload document</button>
                    </div>
                  </div>
                  {docsFor(open.id).length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No documents on file.</p>
                  ) : (
                    <div className="ov-actions">
                      {docsFor(open.id).map((d) => (
                        <div className="ov-row" key={d.id} style={{ cursor: 'default' }}>
                          <span className="ov-n">{DOC_TYPE[d.docType].slice(0, 2).toUpperCase()}</span>
                          <span className="ov-l">{d.fileName} · {DOC_TYPE[d.docType]} · {fmtDate(d.uploadedAt.slice(0, 10))}</span>
                          <button className="btn btn--sm" onClick={() => void docs.remove(d).then((m) => m && toast(m))}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                )}

                {profTab === 'exit' && open.status !== 'active' && (
                  <div className="section">
                    <div className="section-head"><h3>Exit</h3></div>
                    <div className="hr-fields" style={{ marginBottom: 12 }}>
                      <Fld l="Resignation date" v={fmtDate(open.resignationDate)} />
                      <Fld l="Notice period" v={open.noticePeriodDays != null ? `${open.noticePeriodDays} days` : null} />
                      <Fld l="Last working day" v={fmtDate(open.lastWorkingDay)} />
                      <Fld l="Rehire eligible" v={exitRecordFor(open.id) ? (exitRecordFor(open.id)!.rehireEligible ? 'Yes' : 'No') : 'Yes'} />
                    </div>
                    {exitRecordFor(open.id)?.reason && (
                      <p style={{ marginBottom: 12, color: 'var(--ink-3)' }}>Reason: {exitRecordFor(open.id)!.reason}</p>
                    )}
                    <div className="hr-soon">
                      {exitTasksFor(open.id).map((t) => (
                        <label key={t.id} className="chip chip--mute" style={{ cursor: 'pointer', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
                          <input type="checkbox" checked={t.done}
                                 onChange={(e) => void exitTasks.toggle(t.id, e.target.checked, ws.me?.id ?? '')} />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ------------------------------------------------ dashboard */}
            {/* The first thing HR sees. Adarsh asked for "what they want to
                see on a daily basis", so it is the day: who is in, what is
                waiting on a decision, and who is on the way out. Every number
                here is one this database can already answer — nothing on this
                page is invented, and nothing needs a new table. */}
            {!open && section === 'dashboard' && (
              <>
                <div className="page-head">
                  <h1>Dashboard</h1>
                  <div className="sub">{fmtDate(dashToday)} · {count(activeStaff.length, 'person', 'people')} on the books</div>
                </div>

                <div className="kpis">
                  <Kpi accent label="In office now" value={inOfficeNow} sub={`punched in, of ${activeStaff.length}`} />
                  <Kpi label="Late today" value={lateToday} sub="in after their shift start" />
                  <Kpi label="Not in yet" value={notInYet.length} sub="no punch, not on leave" />
                  <Kpi label="On leave today" value={onLeaveToday.length} sub="approved" />
                </div>

                {/* Everything that is stuck until somebody decides it. One
                    card, because "what needs me" is one question even though
                    the two queues live on different pages. */}
                <div className="ov-card">
                  <div className="ov-head">
                    <h4>Waiting on a decision</h4>
                    <span className="ov-cta">{pending.length + pendingApps.length}</span>
                  </div>
                  {pending.length + pendingApps.length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>
                      Nothing is waiting on you. No leave requests and no applications are pending.
                    </p>
                  ) : (
                    <div className="ov-actions">
                      {pending.slice(0, 5).map((r) => (
                        <button className="ov-row" key={r.id} onClick={() => { setSection('attendance'); setAttView('leave'); setOpenId(null) }}>
                          <span className="ov-n">{initials(employeeName(r.employeeId))}</span>
                          <span className="ov-l">
                            {employeeName(r.employeeId)} — {LEAVE_TYPE[r.leaveType].label.toLowerCase()},
                            {' '}{count(r.daysCount, 'day')} from {fmtDate(r.startDate)}
                          </span>
                          <span className="ov-cta"><Chip cls={LEAVE_STATUS[r.status].cls}>Leave</Chip> decide →</span>
                        </button>
                      ))}
                      {pendingApps.slice(0, 5).map((a) => (
                        <button className="ov-row" key={a.id} onClick={() => setReviewingApp(a)}>
                          <span className="ov-n">{initials(a.fullName)}</span>
                          <span className="ov-l">{a.fullName} — {a.positionInterest || 'no position given'}</span>
                          <span className="ov-cta"><Chip cls={APP_STATUS.pending.cls}>Applied</Chip> review →</span>
                        </button>
                      ))}
                      {pending.length > 5 && (
                        <button className="ov-row" onClick={() => { setSection('attendance'); setAttView('leave'); setOpenId(null) }}>
                          <span className="ov-l">{pending.length - 5} more leave request(s)</span>
                          <span className="ov-cta">Open Leave →</span>
                        </button>
                      )}
                      {pendingApps.length > 5 && (
                        <button className="ov-row" onClick={() => { setSection('joining'); setJoiningView('applications'); setOpenId(null) }}>
                          <span className="ov-l">{pendingApps.length - 5} more application(s)</span>
                          <span className="ov-cta">Open Joining →</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <h4>Today</h4>
                    <button className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={() => { setSection('attendance'); setAttView('day'); setOpenId(null) }}>Open attendance →</button>
                  </div>
                  {activeStaff.length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>Nobody is on the directory yet.</p>
                  ) : (
                    <div className="ov-actions">
                      {onLeaveToday.map((r) => (
                        <button className="ov-row" key={'l' + r.id} onClick={() => openEmployee(r.employeeId)}>
                          <span className="ov-n">{initials(employeeName(r.employeeId))}</span>
                          <span className="ov-l">{employeeName(r.employeeId)} — back {fmtDate(r.endDate)}</span>
                          <span className="ov-cta"><Chip cls={LEAVE_TYPE[r.leaveType].cls}>On leave</Chip> →</span>
                        </button>
                      ))}
                      {notInYet.slice(0, 8).map((e) => (
                        <button className="ov-row" key={e.id} onClick={() => openEmployee(e.id)}>
                          <span className="ov-n">{initials(e.fullName)}</span>
                          <span className="ov-l">{e.fullName} — {e.designation || 'no designation'}</span>
                          <span className="ov-cta"><Chip cls="chip--none">Not in</Chip> →</span>
                        </button>
                      ))}
                      {notInYet.length > 8 && (
                        <button className="ov-row" onClick={() => { setSection('attendance'); setAttView('day'); setOpenId(null) }}>
                          <span className="ov-l">{notInYet.length - 8} more not in yet</span>
                          <span className="ov-cta">Open attendance →</span>
                        </button>
                      )}
                      {onLeaveToday.length === 0 && notInYet.length === 0 && (
                        <div className="ov-row" style={{ cursor: 'default' }}>
                          <span className="ov-l">Everybody is in and nobody is on leave.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {leaving.length > 0 && (
                  <div className="ov-card">
                    <div className="ov-head">
                      <h4>On the way out</h4>
                      <button className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={() => { setSection('exit'); setOpenId(null) }}>Open Exit →</button>
                    </div>
                    <div className="ov-actions">
                      {leaving.slice(0, 5).map((e) => (
                        <button className="ov-row" key={e.id} onClick={() => openEmployee(e.id)}>
                          <span className="ov-n">{initials(e.fullName)}</span>
                          <span className="ov-l">
                            {e.fullName} — {e.lastWorkingDay ? 'last day ' + fmtDate(e.lastWorkingDay) : 'no last day set'}
                          </span>
                          <span className="ov-cta"><Chip cls={EMP_STATUS[e.status].cls}>{EMP_STATUS[e.status].label}</Chip> →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {unrecorded.length > 0 && (
                  <div className="banner">
                    <div>
                      <div className="t">{count(unrecorded.length, 'person', 'people')} with a login and no employee record</div>
                      <div className="d">{unrecorded.map((m) => m.name).join(', ')}</div>
                    </div>
                    <button className="btn btn--sm" onClick={() => {
                      const m = unrecorded[0]!
                      setAdding({ profileId: m.id, fullName: m.name, workEmail: m.email ?? '', phone: m.phone ?? '', departmentId: m.departmentId })
                    }}>
                      Add {unrecorded[0]!.name.split(' ')[0]}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ------------------------------------------------ directory */}
            {!open && section === 'directory' && (
              <>
                <div className="page-head">
                  <h1>Employees</h1>
                  <div className="sub">
                    {hr.loading ? 'Loading…' : `${count(hr.rows.length, 'record')} · ${count(shown.length, 'shown', 'shown')}`}
                  </div>
                </div>

                <div className="kpis">
                  <Kpi accent label="Employees" value={hr.rows.length} sub={count(hr.rows.filter((e) => e.status === 'active').length, 'active', 'active')} />
                  <Kpi label="On notice" value={hr.rows.filter((e) => e.status === 'notice').length} sub="working their notice" />
                  <Kpi label="Resigned" value={hr.rows.filter((e) => e.status === 'resigned').length} sub="kept, never deleted" />
                  <Kpi label="Joined this month" value={hr.rows.filter(joinedThisMonth).length} sub="new starters" />
                </div>

                <div className="section">
                  <div className="section-head">
                    <h3>{grouped ? 'By department' : 'Directory'}</h3>
                    <div className="section-tools">
                      <input className="input search" placeholder="Search name, code, phone…"
                             value={q} onChange={(e) => setQ(e.target.value)} />
                      <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                        <option value="">Every department</option>
                        {ws.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button className={'btn btn--sm' + (showLeavers ? ' btn--primary' : '')}
                              onClick={() => setShowLeavers((v) => !v)}>
                        {showLeavers ? 'Hiding nobody' : 'Show resigned'}
                      </button>
                      <button className="btn btn--sm btn--primary" onClick={() => setAdding({})}>Add employee</button>
                    </div>
                  </div>

                  {!hr.loading && hr.rows.length === 0 ? (
                    <div className="ov-card">
                      <div className="ov-head"><h4>Nobody is on the directory yet</h4></div>
                      <p style={{ color: 'var(--ink-3)' }}>
                        Add the first employee, or start from someone who already has a login on the Dashboard.
                      </p>
                    </div>
                  ) : grouped ? (
                    deptGroups.map((g) => (
                      <div key={g.id || 'none'} style={{ marginBottom: 18 }}>
                        <div className="section-head">
                          <h3 style={{ fontSize: 14 }}>{g.name}</h3>
                          <div className="section-tools" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                            {count(g.rows.length, 'person', 'people')}
                          </div>
                        </div>
                        <DataGrid cols={deptCols} rows={g.rows} storageKey="hr-directory-dept" />
                      </div>
                    ))
                  ) : (
                    <DataGrid cols={cols} rows={shown} storageKey="hr-directory"
                              foot={<div className="grid-foot"><span>{count(shown.length, 'employee')}</span></div>} />
                  )}
                </div>
              </>
            )}

            {/* --------------------------------------------- applications */}
            {/* ------------------------------------------------- joining */}
            {/* Applications (the public joining form) and Onboarding (the
                checklist for somebody an application just turned into) are
                one pipeline, not two — this is the tab that used to be split
                across "Applications" and "Onboarding" in the sidebar. */}
            {!open && section === 'joining' && (
              <>
                <div className="page-head">
                  <h1>Joining</h1>
                  <div className="sub">
                    {joiningView === 'applications'
                      ? 'Submitted from the public joining form. Approving one creates their login and emails a link to set a password — nothing exists on their record until then.'
                      : 'Offer, checklist and documents — open a person\'s own record to manage theirs.'}
                  </div>
                  <div className="section-tools">
                    <div className="seg">
                      <button className={joiningView === 'applications' ? 'is-on' : ''} onClick={() => setJoiningView('applications')}>
                        Applications{pendingApps.length > 0 ? ` (${pendingApps.length})` : ''}
                      </button>
                      <button className={joiningView === 'onboarding' ? 'is-on' : ''} onClick={() => setJoiningView('onboarding')}>
                        Onboarding
                      </button>
                    </div>
                  </div>
                </div>

                {joiningView === 'applications' ? (
                  <>
                    <div className="kpis">
                      <Kpi accent label="New" value={pendingApps.length} sub="waiting on a decision" />
                      <Kpi label="Approved" value={applications.rows.filter((a) => a.status === 'approved').length} sub="became employees" />
                      <Kpi label="Rejected" value={applications.rows.filter((a) => a.status === 'rejected').length} sub="not taken forward" />
                    </div>

                    <div className="section">
                      <div className="section-head"><h3>Every application</h3></div>
                      {applications.rows.length === 0 ? (
                        <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                          Nobody has applied yet. Share the joining form's link when you have a role open.
                        </p>
                      ) : (
                        <div className="ov-actions">
                          {applications.rows.map((a) => (
                            <button className="ov-row" key={a.id} onClick={() => setReviewingApp(a)}>
                              <span className="ov-n">{initials(a.fullName)}</span>
                              <span className="ov-l">{a.fullName} — {a.positionInterest || 'no position given'}</span>
                              <span className="ov-cta">
                                <Chip cls={APP_STATUS[a.status].cls}>{APP_STATUS[a.status].label}</Chip> {fmtDate(a.createdAt)} →
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="kpis">
                      <Kpi accent label="Still in progress" value={inProgress.length} sub="at least one task left" />
                      <Kpi label="Documents on file" value={docs.rows.length} sub="across the company" />
                      <Kpi label="Checklist items" value={onboarding.rows.length} sub={count(onboarding.rows.filter((t) => t.done).length, 'done', 'done')} />
                    </div>

                    <div className="section">
                      <div className="section-head"><h3>Everybody</h3></div>
                      <div className="ov-actions">
                        {hr.rows.filter((e) => e.status !== 'resigned').map((e) => {
                          const tasks = tasksFor(e.id)
                          const done = tasks.filter((t) => t.done).length
                          return (
                            <button className="ov-row" key={e.id} onClick={() => { openEmployee(e.id); setSection('directory') }}>
                              <span className="ov-n">{initials(e.fullName)}</span>
                              <span className="ov-l">{e.fullName} — {e.designation || 'no designation'}</span>
                              <span className="ov-cta">{done}/{tasks.length} tasks · {count(docsFor(e.id).length, 'document')} →</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ---------------------------------------------- departments */}
            {!open && section === 'departments' && (
              <>
                <div className="page-head">
                  <h1>Departments</h1>
                  <div className="sub">Where everybody sits. Moving somebody here is done on their record.</div>
                  <div className="section-tools">
                    <div className="seg">
                      <button className={deptView === 'cards' ? 'is-on' : ''} onClick={() => pickDeptView('cards')}>Cards</button>
                      <button className={deptView === 'list' ? 'is-on' : ''} onClick={() => pickDeptView('list')}>List</button>
                    </div>
                  </div>
                </div>

                {deptView === 'cards' && (
                  <div className="proj-grid">
                    {[...ws.departments].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => {
                      const mine = hr.rows.filter((e) => e.departmentId === d.id && e.status !== 'resigned')
                      return (
                        <button className="dept-card" key={d.id} onClick={() => openDept(d.id)}>
                          <div className="dept-card-head">
                            <div className="dept-mono">{initials(d.name)}</div>
                            <h3>{d.name}</h3>
                            {!d.isActive && <Chip cls="chip--mute">Retired</Chip>}
                          </div>
                          <div className="dept-stat">
                            <span className="v">{mine.length}</span>
                            <span className="k">{mine.length === 1 ? 'Person' : 'People'}</span>
                          </div>
                          <div className="proj-foot">
                            {mine.length === 0 ? (
                              <span className="cell-dash">Nobody yet</span>
                            ) : (
                              <>
                                <span className="stack">
                                  {mine.slice(0, 4).map((e) => <Avatar key={e.id}>{initials(e.fullName)}</Avatar>)}
                                  {mine.length > 4 && <span className="stack-more">+{mine.length - 4}</span>}
                                </span>
                                <span>{count(mine.length, 'person', 'people')}</span>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {deptView === 'list' && [...ws.departments].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => {
                  const mine = hr.rows.filter((e) => e.departmentId === d.id && e.status !== 'resigned')
                  return (
                    <div className="ov-card" key={d.id}>
                      <div className="ov-head">
                        <h4>{d.name}</h4>
                        <span className="ov-cta">{count(mine.length, 'person', 'people')}</span>
                      </div>
                      {mine.length === 0
                        ? <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>Nobody yet.</p>
                        : (
                          <div className="ov-actions">
                            {mine.map((e) => (
                              <button className="ov-row" key={e.id} onClick={() => { openEmployee(e.id); setSection('directory') }}>
                                <span className="ov-n">{initials(e.fullName)}</span>
                                <span className="ov-l">{e.fullName} — {e.designation || 'no designation'}</span>
                                <span className="ov-cta">{EMP_STATUS[e.status].label} →</span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  )
                })}
              </>
            )}

            {/* ------------------------------------------ attendance + leave */}
            {/* One sidebar tab, two views — same idea as the Joining merge,
                but the two halves stay structurally separate rather than
                sharing one page-head: Attendance is a day table with branch
                and QR-poster machinery, Leave is an approve/reject workflow
                with its own month-close and holidays sections, and forcing
                both under one <h1> made neither read well. The toggle sits
                above both and remembers the last view per browser, same as
                Joining's Applications/Onboarding switch. */}
            {!open && section === 'attendance' && (
              <>
                <div className="seg" style={{ marginBottom: 14 }}>
                  <button className={attView === 'day' ? 'is-on' : ''} onClick={() => setAttView('day')}>Day</button>
                  <button className={attView === 'leave' ? 'is-on' : ''} onClick={() => setAttView('leave')}>
                    Leave{pendingLeave.length > 0 ? ` (${pendingLeave.length})` : ''}
                  </button>
                </div>

                {attView === 'day' ? (
                  <HrAttendance att={att} employees={hr.rows} toast={toast} leave={leave.rows}
                                onOpenLeave={() => setAttView('leave')} />
                ) : (
              <>
                <div className="page-head">
                  <h1>Leave</h1>
                  <div className="sub">Every request across the company. Approve or reject from here.</div>
                  <div className="section-tools">
                    <select className="input" value={logEmpId} onChange={(e) => setLogEmpId(e.target.value)}>
                      <option value="">Log leave for…</option>
                      {hr.rows.filter((e) => e.status !== 'resigned').map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                    <button className="btn btn--sm btn--primary" disabled={!logEmpId} onClick={() => setLoggingFor(logEmpId)}>Log leave</button>
                  </div>
                </div>

                <div className="kpis">
                  <Kpi accent label="Pending" value={pending.length} sub="waiting on a decision" />
                  <Kpi label="On leave today" value={onLeaveToday.length} sub="approved, dates include today" />
                  <Kpi label="Decided this month" value={decidedThisMonth.length} sub="approved or rejected" />
                  <Kpi label="Total requests" value={leave.rows.length} sub="all time, all statuses" />
                </div>

                {leave.error && <div className="auth-err" style={{ marginBottom: 14 }}>{leave.error}</div>}

                <div className="section">
                  <div className="section-head"><h3>All requests</h3></div>
                  <DataGrid cols={leaveCols} rows={[...leave.rows].sort((a, b) => b.startDate.localeCompare(a.startDate))}
                            storageKey="hr-leave"
                            empty="No leave requests yet."
                            foot={<div className="grid-foot"><span>{count(leave.rows.length, 'request')}</span></div>} />
                </div>

                {/* The month close. This is where the employee's own choice —
                    take the money or carry the days — is recorded, and it is
                    what payroll reads later. One row per person, because the
                    choice is per person and not a company-wide switch. */}
                <div className="section">
                  <div className="section-head">
                    <h3>Close the month</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm" onClick={() => setLeaveMonth((m) => addMonths(m, -1))}>←</button>
                      <strong style={{ alignSelf: 'center' }}>{monthName(leaveMonth)}</strong>
                      <button className="btn btn--sm" disabled={leaveMonth >= thisMonth}
                              onClick={() => setLeaveMonth((m) => addMonths(m, 1))}>→</button>
                    </div>
                  </div>
                  {board.error && <div className="auth-err" style={{ marginBottom: 10 }}>{board.error}</div>}
                  <div className="ov-actions">
                    {board.rows.length === 0 && !board.loading && (
                      <p style={{ color: 'var(--ink-3)' }}>Nobody to close this month for yet.</p>
                    )}
                    {board.rows.map((r) => (
                      <div className="ov-row" key={r.employeeId} style={{ cursor: 'default' }}>
                        <span className="ov-n">{fmtDays(r.closing)}</span>
                        <span className="ov-l">
                          <strong>{r.fullName}</strong>
                          <span style={{ color: 'var(--ink-3)' }}>
                            {'  ·  '}used {fmtDays(r.used)}
                            {'  ·  '}unpaid {fmtDays(r.unpaidDays)}
                            {r.lateCount ? `  ·  ${r.lateCount} late` : ''}
                            {r.unsettledDays ? `  ·  ${r.unsettledDays} not punched out` : ''}
                          </span>
                        </span>
                        {r.closed ? (
                          <Chip cls="chip--good">
                            {r.choice === 'payout' ? `Paid out ${fmtDays(r.payoutDays)}` : `Carried ${fmtDays(r.carried)}`}
                          </Chip>
                        ) : (
                          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn--sm" disabled={closingFor !== null}
                                    onClick={() => void closeMonth(r.employeeId, 'carry')}>
                              {closingFor === r.employeeId ? 'Closing…' : 'Carry forward'}
                            </button>
                            <button className="btn btn--sm btn--primary" disabled={closingFor !== null}
                                    onClick={() => void closeMonth(r.employeeId, 'payout')}>
                              Pay out
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="punch-note">
                    Pay out puts every unused day on their salary and the balance restarts at zero. Carry forward adds them to next
                    month instead. A month cannot be closed until it has ended, the month before it is closed, and every day somebody
                    never punched out of has been settled.
                  </p>
                </div>

                {/* The holidays list. It lives here rather than on a rail item
                    of its own because the only thing it changes is how leave
                    is counted, and this is the page somebody is already on
                    when they think about that. */}
                <div className="section">
                  <div className="section-head"><h3>Holidays</h3></div>
                  <p className="punch-note" style={{ margin: '0 0 12px' }}>
                    A leave day count skips Sundays and every day on this list, so nobody spends leave on a day
                    the office was shut. Adding or removing one changes how <em>new</em> requests are counted —
                    requests already decided keep the number they were approved with.
                  </p>
                  <div className="hol-add">
                    <input className="input" type="date" aria-label="Holiday date"
                           value={holDate} onChange={(e) => setHolDate(e.target.value)} />
                    <input className="input" type="text" aria-label="Holiday name" placeholder="What it is, e.g. Diwali"
                           value={holName} onChange={(e) => setHolName(e.target.value)} />
                    <button className="btn btn--sm btn--primary" disabled={!holDate}
                            onClick={() => void att.addHoliday(holDate, holName).then((m) => {
                              toast(m ?? 'Holiday added.')
                              if (!m) { setHolDate(''); setHolName('') }
                            })}>
                      Add holiday
                    </button>
                  </div>
                  {att.holidays.length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>
                      No holidays entered yet, so leave counts currently skip Sundays only.
                    </p>
                  ) : (
                    <div className="ov-actions">
                      {att.holidays.map((h) => (
                        <div className="ov-row" key={h.date} style={{ cursor: 'default' }}>
                          {/* Name first, date after — .ov-n is sized for a
                              number, and a full date in it dominated the one
                              thing somebody actually reads. Same shape as a
                              leave row on the employee's own screen. */}
                          <span className="ov-l"><strong>{h.name}</strong> · {fmtDate(h.date)}</span>
                          <button className="btn btn--sm" style={{ marginLeft: 10 }}
                                  onClick={() => void att.removeHoliday(h.date).then((m) => toast(m ?? 'Holiday removed.'))}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
                )}
              </>
            )}

            {/* -------------------------------------------------- salary */}
            {!open && section === 'salary' && (
              <>
                <div className="page-head">
                  <h1>Salary</h1>
                  <div className="sub">Every payslip across the company. HR sees the amounts.</div>
                  <div className="section-tools">
                    <select className="input" value={salaryEmpId} onChange={(e) => setSalaryEmpId(e.target.value)}>
                      <option value="">Add payslip for…</option>
                      {hr.rows.filter((e) => e.status !== 'resigned').map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                    <button className="btn btn--sm btn--primary" disabled={!salaryEmpId} onClick={() => setAddingSalaryFor(salaryEmpId)}>Add payslip</button>
                  </div>
                </div>

                <div className="kpis">
                  <Kpi accent label="Pending" value={pendingSalary.length} sub="not yet marked paid" />
                  <Kpi label="Paid this month" value={paidThisMonth.length} sub={fmtPeriod(currentPeriodStr)} />
                  <Kpi label="Payroll this month" value={money(payrollThisMonth)} sub="net, all statuses" />
                  <Kpi label="Total payslips" value={salary.rows.length} sub="all time" />
                </div>

                {salary.error && <div className="auth-err" style={{ marginBottom: 14 }}>{salary.error}</div>}

                <div className="section">
                  <div className="section-head"><h3>All payslips</h3></div>
                  <DataGrid cols={salaryCols} rows={[...salary.rows].sort((a, b) => b.period.localeCompare(a.period))}
                            storageKey="hr-salary"
                            empty="No payslips yet."
                            foot={<div className="grid-foot"><span>{count(salary.rows.length, 'payslip')}</span></div>} />
                </div>
              </>
            )}

            {/* --------------------------------------------------- exit */}
            {!open && section === 'exit' && (
              <>
                <div className="page-head">
                  <h1>Exit</h1>
                  <div className="sub">Everybody on notice or already gone. Open their record to manage the checklist.</div>
                </div>

                <div className="kpis">
                  <Kpi accent label="On notice" value={hr.rows.filter((e) => e.status === 'notice').length} sub="still working" />
                  <Kpi label="Resigned" value={hr.rows.filter((e) => e.status === 'resigned').length} sub="kept, never deleted" />
                  <Kpi label="Checklist items done" value={count(exitTasks.rows.filter((t) => t.done).length, 'done', 'done')} sub={`of ${exitTasks.rows.length}`} />
                </div>

                {leaving.length === 0 ? (
                  <div className="ov-card">
                    <div className="ov-head"><h4>Nobody is leaving</h4></div>
                    <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>Everybody in the directory is active.</p>
                  </div>
                ) : (
                  <div className="section">
                    <div className="section-head"><h3>People</h3></div>
                    <div className="ov-actions">
                      {leaving.map((e) => {
                        const tasks = exitTasksFor(e.id)
                        const done = tasks.filter((t) => t.done).length
                        return (
                          <button className="ov-row" key={e.id} onClick={() => { openEmployee(e.id); setSection('directory') }}>
                            <span className="ov-n">{initials(e.fullName)}</span>
                            <span className="ov-l">{e.fullName} — {e.designation || 'no designation'}</span>
                            <span className="ov-cta">
                              <Chip cls={EMP_STATUS[e.status].cls}>{EMP_STATUS[e.status].label}</Chip> {done}/{tasks.length} tasks →
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* -------------------------------------------------- terms */}
            {!open && section === 'terms' && <TermsAndConditions settings={att.settings} />}
          </div>
        </div>
      </div>

      <BottomNav items={navItems} active={open ? 'directory' : section} />

      <LeaveAlertStack
        alerts={leaveAlerts}
        employeeName={employeeName}
        onOpen={(a) => {
          setSection('attendance'); setAttView('leave'); setOpenId(null)
          setLeaveAlerts((p) => p.filter((x) => x.id !== a.id))
        }}
        onDismiss={(id) => setLeaveAlerts((p) => p.filter((x) => x.id !== id))}
      />

      {tip.node}
      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}

      {loggingFor && (
        <LeaveRequestModal employeeId={loggingFor} weekOffs={att.settings?.weekOffs ?? [0]} holidays={att.holidays}
                           allowPeriod={(att.settings?.periodLeavePerMonth ?? 0) > 0}
                           onClose={() => setLoggingFor(null)} onSave={logLeave} />
      )}
      {deciding && (
        <LeaveDecisionModal request={deciding.request} action={deciding.action} employeeName={employeeName(deciding.request.employeeId)}
                             onClose={() => setDeciding(null)} onDecide={decideLeave} />
      )}

      {addingSalaryFor && (
        <SalaryRecordModal employeeId={addingSalaryFor} employee={hr.rows.find((e) => e.id === addingSalaryFor) ?? null}
                            record={null} onClose={() => setAddingSalaryFor(null)} onSave={saveSalaryNew} />
      )}
      {editingSalary && (
        <SalaryRecordModal employeeId={editingSalary.employeeId} employee={hr.rows.find((e) => e.id === editingSalary.employeeId) ?? null}
                            record={editingSalary} onClose={() => setEditingSalary(null)} onSave={saveSalaryEdit} />
      )}

      {uploadingFor && (
        <DocumentUploadModal onClose={() => setUploadingFor(null)} onUpload={(file, docType) => uploadDoc(uploadingFor, file, docType)} />
      )}

      {reviewingApp && (
        <ApplicationReviewModal
          app={reviewingApp}
          departments={ws.departments}
          shifts={att.shifts}
          offices={att.offices}
          documentUrl={applications.documentUrl}
          onClose={() => setReviewingApp(null)}
          onApprove={async (details) => {
            const message = await applications.approve(reviewingApp.id, details)
            // Worded for what we actually know now: the Edge Function sends
            // the invite email AFTER it responds (see its own comments), so
            // "was sent" would be a claim this call cannot back up. The
            // employee row is real by the time this resolves either way.
            if (!message) toast(reviewingApp.fullName + ' approved — creating their login.')
            // Not awaited: the Employees list should pick up the new hire,
            // but nobody clicking Approve should wait on the directory's own
            // reload to see the button stop saying "Approving…".
            if (!message) void hr.reload()
            return message
          }}
          onReject={async (note) => {
            const message = await applications.reject(reviewingApp.id, note, ws.me?.id ?? '')
            if (!message) toast('Application rejected.')
            return message
          }}
          onResend={async () => {
            const message = await applications.resend(reviewingApp.id)
            if (!message) toast('Invite email resent.')
            return message
          }}
          onDelete={async () => {
            const message = await applications.remove(reviewingApp)
            if (!message) toast(reviewingApp.fullName + '’s application deleted.')
            return message
          }}
        />
      )}

      {adding && (
        <EmployeeModal ws={ws} employee={null} employees={hr.rows} shifts={att.shifts} offices={att.offices} prefill={adding}
                       onClose={() => setAdding(null)} onSave={saveNew} />
      )}
      {editing && (
        <EmployeeModal ws={ws} employee={editing} employees={hr.rows} shifts={att.shifts} offices={att.offices}
                       onClose={() => setEditing(null)} onSave={saveEdit} />
      )}

      {resigning && (
        <Modal
          title="Mark as resigned"
          sub={resigning.fullName + ' · ' + resigning.employeeCode}
          onClose={() => setResigning(null)}
          foot={
            <>
              <button className="btn btn--sm" onClick={() => setResigning(null)}>Cancel</button>
              <button className="btn btn--sm btn--primary" onClick={() => void confirmResign()}>Mark as resigned</button>
            </>
          }
        >
          <p style={{ marginBottom: 14 }}>
            The record is kept, not deleted — it stays in the directory under “Show resigned”, with
            everything on it. Only their status changes. The reason below is HR/owner-only —
            {resigning?.fullName ?? 'they'} will never see it, even on their own record.
          </p>
          <div className="auth-form">
            <div className="field">
              <label htmlFor="hrResignDate">Resignation date</label>
              <input className="input" id="hrResignDate" type="date" value={resignDate} onChange={(e) => setResignDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hrNotice">Notice period (days)</label>
              <input className="input" id="hrNotice" type="number" min={0} value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="hrLast">Last working day</label>
              <input className="input" id="hrLast" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hrReason">Reason (HR/owner only)</label>
              <textarea className="input" id="hrReason" rows={2} value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="Optional" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={rehireEligible} onChange={(e) => setRehireEligible(e.target.checked)} />
              Eligible for rehire
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
