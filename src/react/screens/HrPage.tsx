import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Rail, type RailItem } from '@/components/Rail'
import { Modal } from '@/components/Modal'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useHoverTip } from '@/components/HoverTip'
import { usePanes } from '@/lib/usePanes'
import { Avatar, Chip, IconBtn, Kpi } from '@/components/bits'
import { count, initials, money } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ProfileModal } from '@/modals/ProfileModal'
import { EmployeeModal } from '@/modals/EmployeeModal'
import { LeaveRequestModal } from '@/modals/LeaveRequestModal'
import { LeaveDecisionModal } from '@/modals/LeaveDecisionModal'
import { SalaryRecordModal } from '@/modals/SalaryRecordModal'
import { useEmployees, type EmployeeDraft } from '@/data/useEmployees'
import { useLeaveRequests } from '@/data/useLeaveRequests'
import { useSalaryRecords } from '@/data/useSalaryRecords'
import {
  EMPLOYMENT, EMP_STATUS, LEAVE_STATUS, SALARY_STATUS, currentPeriod, fmtDate, fmtPeriod, joinedThisMonth, tenure, todayISO, usedLeaveDays,
  type Employee, type LeaveRequest, type SalaryRecord,
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
const GEAR_BACK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)
const LEAVE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
  </svg>
)
const SALARY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" />
  </svg>
)

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
  const hr = useEmployees()
  const leave = useLeaveRequests()
  const salary = useSalaryRecords()

  const [section, setSection] = useState<'directory' | 'departments' | 'leave' | 'salary'>('directory')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState<Partial<EmployeeDraft> | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [resigning, setResigning] = useState<Employee | null>(null)
  const [lastDay, setLastDay] = useState(todayISO())
  const [profileOpen, setProfileOpen] = useState(false)
  const [loggingFor, setLoggingFor] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; action: 'approved' | 'rejected' } | null>(null)
  const [logEmpId, setLogEmpId] = useState('')
  const [addingSalaryFor, setAddingSalaryFor] = useState<string | null>(null)
  const [editingSalary, setEditingSalary] = useState<SalaryRecord | null>(null)
  const [salaryEmpId, setSalaryEmpId] = useState('')

  const [q, setQ] = useState('')
  const [deptId, setDeptId] = useState('')
  const [showLeavers, setShowLeavers] = useState(false)

  const open = openId ? hr.rows.find((e) => e.id === openId) ?? null : null
  const employeeName = (id: string) => hr.rows.find((e) => e.id === id)?.fullName ?? 'Unknown'

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

  const railItems: RailItem[] = [
    { key: 'directory', label: 'Directory', icon: PEOPLE_ICON, onClick: () => { setSection('directory'); setOpenId(null) } },
    { key: 'departments', label: 'Departments', icon: DEPT_ICON, onClick: () => { setSection('departments'); setOpenId(null) } },
    { key: 'leave', label: 'Leave', icon: LEAVE_ICON, onClick: () => { setSection('leave'); setOpenId(null) } },
    { key: 'salary', label: 'Salary', icon: SALARY_ICON, onClick: () => { setSection('salary'); setOpenId(null) } },
  ]

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
      key: 'act', label: '', width: 190,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {r.status === 'pending' && (
            <button className="btn btn--sm btn--primary" onClick={() => void salary.markPaid(r.id, ws.me?.id ?? '').then((m) => toast(m ?? 'Marked paid.'))}>
              Mark paid
            </button>
          )}
          <button className="btn btn--sm" onClick={() => setEditingSalary(r)}>Edit</button>
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

  const leaveCols: GridCol<LeaveRequest>[] = [
    { key: 'who', label: 'Employee', width: 190, render: (r) => employeeName(r.employeeId) },
    { key: 'when', label: 'Dates', width: 190, render: (r) => `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` },
    { key: 'days', label: 'Days', width: 72, render: (r) => r.daysCount },
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
          <button className="name-btn" onClick={() => setOpenId(e.id)}>{e.fullName}</button>
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

  const saveNew = async (draft: EmployeeDraft) => {
    const message = await hr.create(draft)
    if (!message) toast(draft.fullName + ' added to the directory.')
    return message
  }

  const saveEdit = async (draft: EmployeeDraft) => {
    if (!editing) return 'Nothing is open for editing.'
    const message = await hr.update(editing.id, draft)
    if (!message) toast('Saved.')
    return message
  }

  const confirmResign = async () => {
    if (!resigning) return
    const message = await hr.update(resigning.id, { status: 'resigned', lastWorkingDay: lastDay })
    setResigning(null)
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
          <ThemeToggle />
          <button className="user-chip" title="My profile" onClick={() => setProfileOpen(true)}>
            <Avatar lg src={ws.me?.avatarUrl}>{initials(ws.me?.name ?? '?')}</Avatar>
            <div>
              <div className="name">{ws.me?.name ?? 'HR'}</div>
              <div className="role">{ws.me?.role === 'owner' ? 'Owner' : 'HR'}</div>
            </div>
          </button>
          <IconBtn title="Sign out" onClick={() => void supabase.auth.signOut()}>{GEAR_BACK}</IconBtn>
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} active={open ? 'directory' : section} panes={panes} tip={tip} items={railItems} />

        <div className="workspace">
          <div className="mobile-nav">
            <button className={section === 'directory' ? 'is-on' : ''}
                    onClick={() => { setSection('directory'); setOpenId(null) }}>Directory</button>
            <button className={section === 'departments' ? 'is-on' : ''}
                    onClick={() => { setSection('departments'); setOpenId(null) }}>Departments</button>
            <button className={section === 'leave' ? 'is-on' : ''}
                    onClick={() => { setSection('leave'); setOpenId(null) }}>Leave</button>
            <button className={section === 'salary' ? 'is-on' : ''}
                    onClick={() => { setSection('salary'); setOpenId(null) }}>Salary</button>
          </div>

          <div className="wrap">
            {hr.error && <div className="auth-err" style={{ marginBottom: 14 }}>{hr.error}</div>}

            {/* ------------------------------------------------ one person */}
            {open && (
              <>
                <div className="page-head">
                  <button className="btn btn--sm" onClick={() => setOpenId(null)}>← Directory</button>
                  <h1 style={{ marginTop: 10 }}>{open.fullName}</h1>
                  <div className="sub">
                    {open.designation || 'No designation'} · {ws.departmentName(open.departmentId) ?? 'No department'}
                    {' · '}{open.employeeCode} · {tenure(open.dateOfJoining)} with Metrol
                  </div>
                </div>

                <div className="hr-head">
                  <Chip cls={EMP_STATUS[open.status].cls}>{EMP_STATUS[open.status].label}</Chip>
                  <div className="hr-head-btns">
                    <button className="btn btn--sm" onClick={() => setEditing(open)}>Edit</button>
                    {open.status !== 'resigned' && (
                      <button className="btn btn--sm" onClick={() => { setLastDay(todayISO()); setResigning(open) }}>
                        Mark as resigned
                      </button>
                    )}
                  </div>
                </div>

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

                <div className="section">
                  <div className="section-head">
                    <h3>Leave</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm" onClick={() => { setLogEmpId(open.id); setLoggingFor(open.id) }}>Log leave</button>
                    </div>
                  </div>
                  <div className="hr-fields" style={{ marginBottom: 12 }}>
                    <Fld l="Annual entitlement" v={`${open.annualLeaveDays} days`} />
                    <Fld l="Used this year" v={`${usedLeaveDays(leave.rows, open.id)} days`} />
                    <Fld l="Remaining" v={`${Math.max(0, open.annualLeaveDays - usedLeaveDays(leave.rows, open.id))} days`} />
                  </div>
                  {leave.rows.filter((r) => r.employeeId === open.id).length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No leave requests on record.</p>
                  ) : (
                    <DataGrid cols={leaveCols} rows={leave.rows.filter((r) => r.employeeId === open.id)} storageKey="hr-employee-leave"
                              foot={<div className="grid-foot"><span>{count(leave.rows.filter((r) => r.employeeId === open.id).length, 'request')}</span></div>} />
                  )}
                </div>

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

                <div className="section">
                  <div className="section-head">
                    <h3>Later phases</h3>
                    <div className="sub">These arrive on this same page rather than as new screens.</div>
                  </div>
                  <div className="hr-soon">
                    <Chip cls="chip--mute">Onboarding · phase 4</Chip>
                    <Chip cls="chip--mute">Exit · phase 5</Chip>
                  </div>
                </div>
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

                <div className="section">
                  <div className="section-head">
                    <h3>Directory</h3>
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
                      <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                        Add the first employee, or start from someone who already has a login above.
                      </p>
                    </div>
                  ) : (
                    <DataGrid cols={cols} rows={shown} storageKey="hr-directory"
                              foot={<div className="grid-foot"><span>{count(shown.length, 'employee')}</span></div>} />
                  )}
                </div>
              </>
            )}

            {/* ---------------------------------------------- departments */}
            {!open && section === 'departments' && (
              <>
                <div className="page-head">
                  <h1>Departments</h1>
                  <div className="sub">Where everybody sits. Moving somebody here is done on their record.</div>
                </div>

                {[...ws.departments].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => {
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
                              <button className="ov-row" key={e.id} onClick={() => { setOpenId(e.id); setSection('directory') }}>
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

            {/* --------------------------------------------------- leave */}
            {!open && section === 'leave' && (
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
          </div>
        </div>
      </div>

      {tip.node}
      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}

      {loggingFor && (
        <LeaveRequestModal employeeId={loggingFor} onClose={() => setLoggingFor(null)} onSave={logLeave} />
      )}
      {deciding && (
        <LeaveDecisionModal request={deciding.request} action={deciding.action} employeeName={employeeName(deciding.request.employeeId)}
                             onClose={() => setDeciding(null)} onDecide={decideLeave} />
      )}

      {addingSalaryFor && (
        <SalaryRecordModal employeeId={addingSalaryFor} record={null} onClose={() => setAddingSalaryFor(null)} onSave={saveSalaryNew} />
      )}
      {editingSalary && (
        <SalaryRecordModal employeeId={editingSalary.employeeId} record={editingSalary} onClose={() => setEditingSalary(null)} onSave={saveSalaryEdit} />
      )}

      {adding && (
        <EmployeeModal ws={ws} employee={null} employees={hr.rows} prefill={adding}
                       onClose={() => setAdding(null)} onSave={saveNew} />
      )}
      {editing && (
        <EmployeeModal ws={ws} employee={editing} employees={hr.rows}
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
            everything on it. Only their status changes.
          </p>
          <div className="field">
            <label htmlFor="hrLast">Last working day</label>
            <input className="input" id="hrLast" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  )
}
