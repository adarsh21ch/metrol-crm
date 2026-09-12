import { useEffect, useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Chip, Kpi } from '@/components/bits'
import { AttendanceSettingsModal } from '@/modals/AttendanceSettingsModal'
import { AttendanceEditModal } from '@/modals/AttendanceEditModal'
import { count } from '@/lib/format'
import { statusChip, fmtDuration, fmtShift, fmtTime, officeToday, type AttendanceRow } from '@/lib/attendance'
import type { Attendance } from '@/data/useAttendance'
import type { Employee } from '@/lib/hr'

/** One line of the day's table: an attendance row joined to the person it
 *  belongs to, plus the people with no row at all — who are the whole point of
 *  looking at this screen in the morning. */
interface DayRow {
  id: string
  employeeId: string
  name: string
  code: string
  row: AttendanceRow | null
}

/**
 * HR's side of attendance. Deliberately one day at a time rather than a month
 * grid: the question this screen answers is "who is in today, and who is not",
 * and a month of everybody at once answers it worse. A single person's month
 * is on their own record page, where the rest of their history already lives.
 */
export function HrAttendance({
  att, employees, toast,
}: {
  att: Attendance
  employees: Employee[]
  toast: (m: string) => void
}) {
  const tz = att.settings?.timezone ?? 'Asia/Kolkata'
  const [date, setDate] = useState(() => officeToday(tz))
  const [q, setQ] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceRow | null>(null)

  // Days somebody walked out of without punching out would otherwise sit at
  // "in office" for ever. Free plans have no scheduler, so the screen that
  // cares is the one that settles them.
  useEffect(() => { void att.finalizeOpen() }, [att])

  const staff = useMemo(
    () => employees.filter((e) => e.status !== 'resigned'),
    [employees],
  )

  const dayRows: DayRow[] = useMemo(() => {
    const byEmp = new Map(att.rows.filter((r) => r.workDate === date).map((r) => [r.employeeId, r]))
    return staff
      .map((e) => ({ id: e.id, employeeId: e.id, name: e.fullName, code: e.employeeCode, row: byEmp.get(e.id) ?? null }))
      .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.code ?? '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        // In the office first, then late, then everybody who has not arrived —
        // the order somebody scanning this at 10am actually reads it in.
        const rank = (x: DayRow) => (x.row?.status === 'in_progress' ? 0 : x.row ? 1 : 2)
        return rank(a) - rank(b) || a.name.localeCompare(b.name)
      })
  }, [att.rows, staff, date, q])

  const inOffice = dayRows.filter((r) => r.row?.status === 'in_progress').length
  const lateToday = dayRows.filter((r) => (r.row?.lateMinutes ?? 0) > 0).length
  const noShow = dayRows.filter((r) => !r.row).length
  const closed = dayRows.filter((r) => r.row?.punchOutAt).length

  const cols: GridCol<DayRow>[] = [
    { key: 'name', label: 'Employee', width: 190, render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'code', label: 'ID', width: 88, render: (r) => <span className="cell-mono">{r.code || '—'}</span> },
    { key: 'shift', label: 'Shift', width: 76, render: (r) => <span className="cell-mono">{fmtShift(r.row?.shiftStart)}</span> },
    { key: 'in', label: 'Punch in', width: 104, render: (r) => <span className="cell-mono">{fmtTime(r.row?.punchInAt, tz)}</span> },
    { key: 'out', label: 'Punch out', width: 104, render: (r) => <span className="cell-mono">{fmtTime(r.row?.punchOutAt, tz)}</span> },
    { key: 'worked', label: 'Worked', width: 92, render: (r) => <span className="cell-mono">{r.row ? fmtDuration(r.row.workedMinutes) : '—'}</span> },
    {
      key: 'late', label: 'Late by', width: 84,
      render: (r) => (r.row?.lateMinutes ? <span className="cell-mono">{r.row.lateMinutes}m</span> : <span className="cell-dash">—</span>),
    },
    {
      key: 'status', label: 'Status', width: 130,
      render: (r) => (r.row
        ? <Chip cls={statusChip(r.row.status).cls}>{statusChip(r.row.status).label}</Chip>
        : <Chip cls="chip--none">Not in</Chip>),
    },
    {
      // The evidence column. It is the answer to "he says he was here" — and
      // it is also how you spot a punch that came from 49 m away every single
      // day, which is a conversation worth having.
      key: 'where', label: 'Distance', width: 120,
      render: (r) => (r.row?.punchInDistance != null
        ? <span className="att-evid">{Math.round(r.row.punchInDistance)} m{r.row.punchInAccuracy ? ` ±${Math.round(r.row.punchInAccuracy)}` : ''}</span>
        : <span className="cell-dash">—</span>),
    },
    {
      key: 'src', label: 'Source', width: 96,
      render: (r) => (r.row ? <span className="att-src">{r.row.source === 'hr' ? 'HR entry' : 'Punched'}</span> : <span className="cell-dash">—</span>),
    },
    {
      key: 'act', label: '', width: 96,
      render: (r) => (r.row
        ? <button className="btn btn--sm" onClick={() => setEditing(r.row!)}>Correct</button>
        : <button className="btn btn--sm" onClick={() => void addBlank(r)}>Add day</button>),
    },
  ]

  /** A person who never punched at all, being written in from the register.
   *  It opens as an empty day rather than guessing times — HR fills them in
   *  next, and the row says 'HR entry' for ever after. */
  async function addBlank(r: DayRow) {
    const message = await att.addDay(r.employeeId, date, {
      punchInAt: null, punchOutAt: null, shiftStart: null, status: 'absent', editReason: 'Added by HR',
    })
    toast(message ?? `Day added for ${r.name}. Correct the times next.`)
  }

  const settings = att.settings
  const noOffice = !settings?.officeLat || !settings?.officeLng

  return (
    <>
      <div className="page-head">
        <h1>Attendance</h1>
        <div className="sub">Who is in, who is late, and who has not arrived. One day at a time.</div>
        <div className="section-tools">
          <input className="input" type="date" value={date} max={officeToday(tz)} onChange={(e) => setDate(e.target.value)} />
          <input className="input search" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn--sm" onClick={() => setSettingsOpen(true)}>Settings</button>
        </div>
      </div>

      {noOffice && (
        <div className="banner">
          <div>
            <strong>The office location is not set yet.</strong> Nobody can punch in until it is.
            Stand inside the office, open Settings, and press "Use my current location".
          </div>
          <button className="btn btn--sm btn--primary" onClick={() => setSettingsOpen(true)}>Set it now</button>
        </div>
      )}

      <div className="kpis">
        <Kpi accent label="In the office" value={inOffice} sub={date === officeToday(tz) ? 'punched in, not out yet' : 'still open on this day'} />
        <Kpi label="Day closed" value={closed} sub="punched out" />
        <Kpi label="Late" value={lateToday} sub={`past the ${settings?.graceMinutes ?? 7} minute relaxation`} />
        <Kpi label="No punch" value={noShow} sub="nothing recorded for this day" />
      </div>

      {att.error && <div className="auth-err" style={{ marginBottom: 14 }}>{att.error}</div>}

      <div className="section">
        <div className="section-head">
          <h3>{date === officeToday(tz) ? 'Today' : date}</h3>
          <div className="section-tools" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {settings?.officeLabel} · within {settings?.radiusMeters} m · full day {fmtDuration(settings?.requiredMinutes ?? 540)}
          </div>
        </div>
        <DataGrid
          cols={cols}
          rows={dayRows}
          storageKey="hr-attendance"
          empty="Nobody in the directory yet."
          foot={<div className="grid-foot"><span>{count(dayRows.length, 'employee')}</span></div>}
        />
      </div>

      {settingsOpen && settings && (
        <AttendanceSettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (d) => {
            const message = await att.saveSettings(d)
            if (!message) toast('Attendance settings saved.')
            return message
          }}
        />
      )}

      {editing && (
        <AttendanceEditModal
          row={editing}
          employeeName={staff.find((e) => e.id === editing.employeeId)?.fullName ?? 'This employee'}
          tz={tz}
          onClose={() => setEditing(null)}
          onSave={async (d) => {
            const message = await att.correct(editing.id, d)
            if (!message) toast('Day corrected. The change is on the record.')
            return message
          }}
        />
      )}
    </>
  )
}
