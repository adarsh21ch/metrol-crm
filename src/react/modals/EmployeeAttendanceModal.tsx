import { useMemo } from 'react'
import { Modal } from '@/components/Modal'
import { Chip, Kpi } from '@/components/bits'
import { EmployeeAttendanceBoard } from '@/components/EmployeeAttendanceBoard'
import type { Attendance } from '@/data/useAttendance'
import { useLeaveMonth, type LeaveSources } from '@/data/useLeaveMonths'
import { officeToday } from '@/lib/attendance'
import { LEAVE_STATUS, LEAVE_TYPE, fmtDate, type Employee, type LeaveRequest } from '@/lib/hr'
import { firstOfMonth, fmtDays } from '@/lib/leaveRules'

/**
 * Round 6 (0026) — "give HR the same dashboard view of every employee's
 * attendance... exactly same [as] the employee see in his dashboard." Wraps
 * `EmployeeAttendanceBoard` — the exact component Member.tsx's own
 * Attendance tab renders — in a modal, with this month's leave balance and
 * the person's leave history underneath. Reached by clicking a name on the
 * Attendance day table (HrAttendance.tsx); the same board also sits directly
 * on an employee's own record page (HrPage.tsx, Attendance tab).
 */
export function EmployeeAttendanceModal({
  employee, att, leave, allEmployees, onClose,
}: {
  employee: Employee
  att: Attendance
  /** Every leave request in the company — filtered to this employee below. */
  leave: LeaveRequest[]
  allEmployees: Employee[]
  onClose: () => void
}) {
  const tz = att.settings?.timezone ?? 'Asia/Kolkata'
  const today = officeToday(tz)
  const thisMonth = firstOfMonth(today)

  const myLeave = useMemo(() => leave.filter((r) => r.employeeId === employee.id), [leave, employee.id])

  const leaveSrc: LeaveSources = useMemo(() => ({
    employees: allEmployees, rows: att.rows, leaves: leave, holidays: att.holidays, settings: att.settings, today,
  }), [allEmployees, att.rows, leave, att.holidays, att.settings, today])
  const lm = useLeaveMonth(employee.id, thisMonth, leaveSrc)

  return (
    <Modal wide title={employee.fullName} sub={`${employee.employeeCode} · ${employee.designation || 'No designation'}`} onClose={onClose}
           foot={<button className="btn btn--sm btn--primary" onClick={onClose}>Close</button>}>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi accent label="Available" value={fmtDays(lm.data?.available)}
             sub={`${fmtDays(lm.data?.opening)} brought forward + ${fmtDays(lm.data?.accrued)} earned`} />
        <Kpi label="Used" value={fmtDays(lm.data?.used)} sub="approved leave and half days" />
        <Kpi label="Left" value={fmtDays(lm.data?.closing)}
             sub={lm.data?.closed
               ? (lm.data.choice === 'payout' ? `paid out ${fmtDays(lm.data.payoutDays)}` : `carried ${fmtDays(lm.data.carried)}`)
               : 'before HR closes the month'} />
        <Kpi label="Unpaid" value={fmtDays(lm.data?.unpaidDays)} sub="absences and leave without pay" />
      </div>
      {lm.error && <div className="auth-err" style={{ marginBottom: 14 }}>{lm.error}</div>}

      <EmployeeAttendanceBoard
        employeeId={employee.id}
        rows={att.rows}
        leaves={leave}
        holidays={att.holidays}
        weekOffs={att.settings?.weekOffs ?? [0]}
        timezone={att.settings?.timezone}
      />

      <div className="section">
        <div className="section-head"><h3>Leave requests</h3></div>
        {myLeave.length === 0 ? (
          <p style={{ color: 'var(--ink-3)' }}>No requests yet.</p>
        ) : (
          <div className="ov-actions">
            {[...myLeave].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((r) => (
              <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                <span className="ov-n">{r.daysCount}d</span>
                <span className="ov-l">
                  <strong>{LEAVE_TYPE[r.leaveType].label}</strong> · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                  {r.reason ? ' · ' + r.reason : ''}
                </span>
                <Chip cls={LEAVE_STATUS[r.status].cls}>{LEAVE_STATUS[r.status].label}</Chip>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
