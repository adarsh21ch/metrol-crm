import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import {
  buildCalendar, calendarTotals, statusChip, fmtDuration, fmtTime, officeToday,
  monthStart, monthEnd, addDays, DAY_KIND,
  type AttendanceRow, type Holiday,
} from '@/lib/attendance'
import { fmtDate, type LeaveRequest } from '@/lib/hr'

type AttRange = 'this' | 'last' | 'custom'

const DateCell = ({ iso }: { iso: string }) => {
  const full = fmtDate(iso)
  const cut = full.lastIndexOf(' ')
  return <td className="num">{full.slice(0, cut)}<span className="yr">{full.slice(cut)}</span></td>
}
const TimeCell = ({ iso, tz }: { iso: string | null; tz: string }) => {
  if (!iso) return <td className="num"><span className="muted">—</span></td>
  const t = fmtTime(iso, tz)
  const m = /^(\d{1,2}:\d{2})\s*(.+)$/.exec(t)
  return <td className="num">{m ? <>{m[1]}<span className="ampm"> {m[2]}</span></> : t}</td>
}

/**
 * Round 6 follow-up (2026-09-19): Adarsh's exact words were that HR's view of
 * one employee's attendance has to be "exactly same" as the employee's own —
 * "the date strip... the bottom sheet and excel exactly same" — not a
 * shorter summary. This is that dashboard, pulled out of Member.tsx so both
 * screens render from one component: the range picker (This month / Last
 * month / Custom), the coloured day strip, the summary tiles, and the
 * Excel-shaped table. Punching in/out stays employee-only (PunchCard is
 * deliberately not part of this) — Adarsh's own words: "check in check out
 * kind of thing... is not for HR."
 */
export function EmployeeAttendanceBoard({
  employeeId, rows, leaves, holidays, weekOffs, timezone,
}: {
  employeeId: string
  /** Every attendance row this person has — not pre-filtered to a range; the
   *  range picker below decides that. */
  rows: AttendanceRow[]
  leaves: LeaveRequest[]
  holidays: Holiday[]
  weekOffs: number[]
  timezone?: string
}) {
  const tz = timezone ?? 'Asia/Kolkata'
  const today = officeToday(tz)
  const myAtt = useMemo(
    () => rows.filter((r) => r.employeeId === employeeId).sort((a, b) => b.workDate.localeCompare(a.workDate)),
    [rows, employeeId],
  )
  const myLeave = useMemo(() => leaves.filter((r) => r.employeeId === employeeId), [leaves, employeeId])

  const [attFrom, setAttFrom] = useState(() => monthStart(today))
  const [attTo, setAttTo] = useState(() => monthEnd(today))
  const [attRange, setAttRange] = useState<AttRange>('this')
  const [keyOpen, setKeyOpen] = useState(false)
  const pickRange = (r: AttRange) => {
    setAttRange(r)
    if (r === 'this') { setAttFrom(monthStart(today)); setAttTo(monthEnd(today)) }
    else if (r === 'last') {
      const prev = addDays(monthStart(today), -1)
      setAttFrom(monthStart(prev)); setAttTo(monthEnd(prev))
    }
  }

  const calendar = useMemo(() => buildCalendar({
    from: attFrom, to: attTo, rows: myAtt, holidays, weekOffs, leaves: myLeave, today,
  }), [attFrom, attTo, myAtt, holidays, weekOffs, myLeave, today])
  const totals = useMemo(() => calendarTotals(calendar), [calendar])

  return (
    <div className="section">
      <div className="section-head section-head--wrap">
        <div className="sh-title">
          <h3>Attendance</h3>
          <button className="pb-info" onClick={() => setKeyOpen(true)} aria-label="What the colours mean">i</button>
        </div>
        <div className="range-bar">
          <select className="input range-pick" aria-label="Date range"
                  value={attRange} onChange={(e) => pickRange(e.target.value as AttRange)}>
            <option value="this">This month</option>
            <option value="last">Last month</option>
            <option value="custom">Custom</option>
          </select>
          {attRange === 'custom' && (
            <>
              <div className="field">
                <label htmlFor="hrAttFrom">From</label>
                <input className="input" id="hrAttFrom" type="date" value={attFrom}
                       max={attTo} onChange={(e) => setAttFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="hrAttTo">To</label>
                <input className="input" id="hrAttTo" type="date" value={attTo}
                       min={attFrom} onChange={(e) => setAttTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      {calendar.length > 0 && (
        <div className="cal-wrap">
          <div className="cal-strip" style={{ ['--cal-third' as string]: Math.ceil(calendar.length / 3) }}>
            {calendar.map((d) => (
              <div className={'cal-cell ' + DAY_KIND[d.kind].cls + (d.date === today ? ' cal-cell--today' : '')}
                   key={d.date}
                   title={`${fmtDate(d.date)} — ${[DAY_KIND[d.kind].label || 'Nothing recorded', d.remark].filter(Boolean).join(' · ')}`}>
                <span className="dw">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d.date + 'T00:00:00Z').getUTCDay()]}</span>
                <span className="d">{Number(d.date.slice(8, 10))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="att-sum">
        <div className="att-sum-tile"><div className="n">{totals.present}</div><div className="l">Present</div></div>
        <div className="att-sum-tile"><div className="n">{totals.late}</div><div className="l">Late coming</div></div>
        <div className="att-sum-tile"><div className="n">{totals.halfDay}</div><div className="l">Half days</div></div>
        <div className="att-sum-tile"><div className="n">{totals.leave}</div><div className="l">Leave</div></div>
        <div className="att-sum-tile"><div className="n">{totals.absent}</div><div className="l">Absent</div></div>
        <div className="att-sum-tile"><div className="n">{fmtDuration(totals.workedMinutes)}</div><div className="l">Worked</div></div>
      </div>

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
                  <DateCell iso={d.date} />
                  <TimeCell iso={d.row?.punchInAt ?? null} tz={tz} />
                  <TimeCell iso={d.row?.punchOutAt ?? null} tz={tz} />
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
              <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>Nothing in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {keyOpen && (
        <Modal title="What the colours mean" sub="The month strip above, explained"
               onClose={() => setKeyOpen(false)}
               foot={<button className="btn btn--primary" onClick={() => setKeyOpen(false)}>Got it</button>}>
          <div className="cal-key cal-key--modal">
            <span><i style={{ background: 'var(--cal-present)' }} />Present</span>
            <span><i style={{ background: 'var(--cal-late)' }} />Late / half day</span>
            <span><i style={{ background: 'var(--cal-leave)' }} />Leave</span>
            <span><i style={{ background: 'var(--cal-absent)' }} />Absent</span>
            <span><i className="cal-key-holiday" />Holiday or weekly off</span>
          </div>
        </Modal>
      )}
    </div>
  )
}
