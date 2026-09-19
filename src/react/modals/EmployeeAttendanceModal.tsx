import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip, Kpi } from '@/components/bits'
import type { Attendance } from '@/data/useAttendance'
import { useLeaveMonth, type LeaveSources } from '@/data/useLeaveMonths'
import {
  buildCalendar, calendarTotals, statusChip, fmtDuration, fmtTime, officeToday,
  monthStart, monthEnd, DAY_KIND,
} from '@/lib/attendance'
import { LEAVE_STATUS, LEAVE_TYPE, fmtDate, type Employee, type LeaveRequest } from '@/lib/hr'
import { addMonths, firstOfMonth, fmtDays } from '@/lib/leaveRules'

/**
 * Round 6 (0026) — "give HR the same dashboard view of every employee's
 * attendance, so clicking a name shows coming-late, leaves, everything."
 * This is Member.tsx's own Attendance + Leave tabs, rebuilt to take an
 * arbitrary employee instead of "me" — same building blocks
 * (buildCalendar/calendarTotals/useLeaveMonth), so the number HR reads here
 * and the number the employee reads on their own screen cannot disagree.
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
  const [month, setMonth] = useState(() => firstOfMonth(today))
  const thisMonth = firstOfMonth(today)
  const monthName = (m: string) => new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const myAtt = useMemo(
    () => att.rows.filter((r) => r.employeeId === employee.id).sort((a, b) => b.workDate.localeCompare(a.workDate)),
    [att.rows, employee.id],
  )
  const myLeave = useMemo(() => leave.filter((r) => r.employeeId === employee.id), [leave, employee.id])

  const from = monthStart(month)
  const to = monthEnd(month)
  const calendar = useMemo(() => buildCalendar({
    from, to, rows: myAtt, holidays: att.holidays, weekOffs: att.settings?.weekOffs ?? [0], leaves: myLeave, today,
  }), [from, to, myAtt, att.holidays, att.settings, myLeave, today])
  const totals = useMemo(() => calendarTotals(calendar), [calendar])

  const leaveSrc: LeaveSources = useMemo(() => ({
    employees: allEmployees, rows: att.rows, leaves: leave, holidays: att.holidays, settings: att.settings, today,
  }), [allEmployees, att.rows, leave, att.holidays, att.settings, today])
  const lm = useLeaveMonth(employee.id, month, leaveSrc)

  return (
    <Modal wide title={employee.fullName} sub={`${employee.employeeCode} · ${employee.designation || 'No designation'}`} onClose={onClose}
           foot={<button className="btn btn--sm btn--primary" onClick={onClose}>Close</button>}>
      <div className="month-step" style={{ marginBottom: 14 }}>
        <button className="btn btn--sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>←</button>
        <strong>{monthName(month)}</strong>
        <button className="btn btn--sm" aria-label="Next month" disabled={month >= thisMonth}
                onClick={() => setMonth((m) => addMonths(m, 1))}>→</button>
      </div>

      <div className="att-sum" style={{ marginBottom: 16 }}>
        <div className="att-sum-tile"><div className="n">{totals.present}</div><div className="l">Present</div></div>
        <div className="att-sum-tile"><div className="n">{totals.late}</div><div className="l">Late coming</div></div>
        <div className="att-sum-tile"><div className="n">{totals.halfDay}</div><div className="l">Half days</div></div>
        <div className="att-sum-tile"><div className="n">{totals.leave}</div><div className="l">Leave</div></div>
        <div className="att-sum-tile"><div className="n">{totals.absent}</div><div className="l">Absent</div></div>
        <div className="att-sum-tile"><div className="n">{fmtDuration(totals.workedMinutes)}</div><div className="l">Worked</div></div>
      </div>

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

      <div className="section">
        <div className="section-head"><h3>Attendance this month</h3></div>
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Date</th>
                <th><span className="lbl-long">Punch in</span><span className="lbl-short">In</span></th>
                <th><span className="lbl-long">Punch out</span><span className="lbl-short">Out</span></th>
                <th>Remark</th>
                <th><span className="lbl-long">Work duration</span><span className="lbl-short">Hours</span></th>
              </tr>
            </thead>
            <tbody>
              {calendar.filter((d) => d.kind !== 'future').slice().reverse().map((d) => {
                const note = [d.remark, d.row?.source === 'hr' ? 'corrected by HR' : ''].filter(Boolean).join(' · ')
                return (
                  <tr key={d.date}>
                    <td className="num">{fmtDate(d.date)}</td>
                    <td className="num">{fmtTime(d.row?.punchInAt ?? null, tz)}</td>
                    <td className="num">{fmtTime(d.row?.punchOutAt ?? null, tz)}</td>
                    <td className="rmk">
                      <Chip cls={d.row ? statusChip(d.row.status).cls : d.kind === 'absent' ? 'chip--bad' : 'chip--mute'}>
                        {DAY_KIND[d.kind].label}
                      </Chip>
                      {note && <span className="att-note">{note}</span>}
                    </td>
                    <td className="num">{d.row?.workedMinutes ? fmtDuration(d.row.workedMinutes) : <span className="muted">—</span>}</td>
                  </tr>
                )
              })}
              {calendar.filter((d) => d.kind !== 'future').length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>Nothing in this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
