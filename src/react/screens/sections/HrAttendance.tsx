import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Chip, Kpi } from '@/components/bits'
import { AttendanceSettingsModal } from '@/modals/AttendanceSettingsModal'
import { AttendanceEditModal } from '@/modals/AttendanceEditModal'
import { OfficeModal } from '@/modals/OfficeModal'
import { count } from '@/lib/format'
import { downloadPoster } from '@/lib/qrPoster'
import { PUNCH_METHOD, statusChip, fmtDuration, fmtShift, fmtTime, officeToday, type AttendanceRow, type OfficeLocation } from '@/lib/attendance'
import type { Attendance } from '@/data/useAttendance'
import { LEAVE_TYPE, fmtDate as fmtLeaveDate, type Employee, type LeaveRequest } from '@/lib/hr'

/** One line of the day's table: an attendance row joined to the person it
 *  belongs to, plus the people with no row at all — who are the whole point of
 *  looking at this screen in the morning. */
interface DayRow {
  id: string
  employeeId: string
  name: string
  code: string
  officeId: string | null
  row: AttendanceRow | null
}

/**
 * HR's side of attendance. Deliberately one day at a time rather than a month
 * grid: the question this screen answers is "who is in today, and who is not",
 * and a month of everybody at once answers it worse. A single person's month
 * is on their own record page, where the rest of their history already lives.
 */
export function HrAttendance({
  att, employees, toast, leave = [], onOpenLeave, viewToggle,
}: {
  att: Attendance
  employees: Employee[]
  toast: (m: string) => void
  /** The Day/Leave switch, handed in so it can sit in THIS screen's own
   *  .section-tools rather than in a band above the heading. Every page-level
   *  control in this app belongs on the heading line, top right — the rule
   *  Adarsh named after seeing this one break it. */
  viewToggle?: ReactNode
  /* Every leave request in the company. Attendance without it lists somebody
     on approved leave as "not in", which is the one absence nobody needs to
     chase — Adarsh asked for who is in AND who is on leave on this screen. */
  leave?: LeaveRequest[]
  /** A way through to the Leave page, from the screen that raises the question. */
  onOpenLeave?: () => void
}) {
  const tz = att.settings?.timezone ?? 'Asia/Kolkata'
  const [date, setDate] = useState(() => officeToday(tz))
  const [q, setQ] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceRow | null>(null)
  const [branch, setBranch] = useState('')            // '' = every branch
  const [editingOffice, setEditingOffice] = useState<OfficeLocation | null>(null)
  const [addingOffice, setAddingOffice] = useState(false)
  const [showBranches, setShowBranches] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)   // branch id whose poster is being written
  const officeName = (id: string | null) => att.offices.find((o) => o.id === id)?.name ?? '—'

  // Days somebody walked out of without punching out would otherwise sit at
  // "in office" for ever. Free plans have no scheduler, so the screen that
  // cares is the one that settles them.
  //
  // DEPEND ON THE FUNCTION, NOT ON `att`. This read `[att]`, and `att` is a
  // fresh object literal from every render of useAttendance — so this effect
  // re-ran on EVERY RENDER of this screen, firing `finalize_open_attendance()`
  // (an RPC that WRITES) again and again: on every keystroke in the search
  // box, every toast, every tab click. That is a write endpoint being hammered
  // for the life of the page, and it is the single biggest reason this screen
  // felt like it was wading through treacle. `finalizeOpen` is a useCallback
  // with an empty dependency list, so keying on it runs this exactly once.
  useEffect(() => { void att.finalizeOpen() }, [att.finalizeOpen])

  const staff = useMemo(
    () => employees.filter((e) => e.status !== 'resigned'),
    [employees],
  )

  const onLeave = useMemo(
    () => leave.filter((r) => r.status === 'approved' && r.startDate <= date && r.endDate >= date),
    [leave, date],
  )
  const onLeaveIds = useMemo(() => new Set(onLeave.map((r) => r.employeeId)), [onLeave])
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.fullName ?? 'Unknown'

  const dayRows: DayRow[] = useMemo(() => {
    const byEmp = new Map(att.rows.filter((r) => r.workDate === date).map((r) => [r.employeeId, r]))
    return staff
      .map((e) => ({ id: e.id, employeeId: e.id, name: e.fullName, code: e.employeeCode, officeId: e.officeId, row: byEmp.get(e.id) ?? null }))
      // Filtering by branch asks about the PERSON's branch, not the day's: the
      // question is "how is Sector 6 doing today", and somebody from Sector 6
      // who happens to be at the other office is still Sector 6's person.
      .filter((r) => !branch || r.officeId === branch)
      .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.code ?? '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        // In the office first, then late, then everybody who has not arrived —
        // the order somebody scanning this at 10am actually reads it in.
        const rank = (x: DayRow) => (x.row?.status === 'in_progress' ? 0 : x.row ? 1 : 2)
        return rank(a) - rank(b) || a.name.localeCompare(b.name)
      })
  }, [att.rows, staff, date, q, branch])

  const inOffice = dayRows.filter((r) => r.row?.status === 'in_progress').length
  const lateToday = dayRows.filter((r) => (r.row?.lateMinutes ?? 0) > 0).length
  const noShow = dayRows.filter((r) => !r.row && !onLeaveIds.has(r.employeeId)).length
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
      key: 'branch', label: 'Branch', width: 132,
      render: (r) => {
        const at = r.row?.officeId
        const away = at && r.officeId && at !== r.officeId
        // Somebody punching at the other office is the case the client asked to
        // keep flexible, so it is shown rather than hidden — as a fact, not a
        // warning.
        return away
          ? <span className="att-src">{officeName(at)} (visiting)</span>
          : <span className="cell-mute">{officeName(at ?? r.officeId)}</span>
      },
    },
    {
      key: 'status', label: 'Status', width: 130,
      render: (r) => (r.row
        ? <Chip cls={statusChip(r.row.status).cls}>{statusChip(r.row.status).label}</Chip>
        : onLeaveIds.has(r.employeeId)
          ? <Chip cls="chip--warn">On leave</Chip>
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
      key: 'src', label: 'How', width: 100,
      render: (r) => (r.row
        ? <span className="att-src">{r.row.source === 'hr' ? 'HR entry' : PUNCH_METHOD[r.row.punchInMethod]}</span>
        : <span className="cell-dash">—</span>),
    },
    {
      key: 'act', label: '', width: 96,
      render: (r) => (r.row
        ? <button className="btn btn--sm" onClick={() => setEditing(r.row!)}>Correct</button>
        : <button className="btn btn--sm" onClick={() => void addBlank(r)}>Add day</button>),
    },
  ]

  /** The printed poster for one branch, saved straight from the list. The same
   *  drawing function the Edit screen previews and prints, so the file HR mails
   *  to the other office is the sheet on this office's wall. */
  async function saveCode(o: OfficeLocation) {
    setSaving(o.id)
    try {
      await downloadPoster({
        token: o.qrToken, officeName: o.name, address: o.address,
        radiusMeters: o.radiusMeters, issuedAt: o.qrRotatedAt ?? undefined,
      })
      toast(`Poster for ${o.name} saved. Print it and tape it up at that branch.`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not make the poster.')
    } finally {
      setSaving(null)
    }
  }

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
  const noOffice = att.offices.filter((o) => o.isActive).length === 0

  return (
    <>
      <div className="page-head">
        <h1>Attendance</h1>
        <div className="sub">Who is in, who is late, and who has not arrived. One day at a time.</div>
        <div className="section-tools">
          <input className="input" type="date" value={date} max={officeToday(tz)} onChange={(e) => setDate(e.target.value)} />
          <input className="input search" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          {att.offices.length > 1 && (
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches</option>
              {att.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button className="btn btn--sm" onClick={() => setShowBranches((v) => !v)}>
            {showBranches ? 'Hide branches' : 'Branches'}
          </button>
          <button className="btn btn--sm" onClick={() => setSettingsOpen(true)}>Settings</button>
          {viewToggle}
        </div>
      </div>

      {noOffice && (
        <div className="banner">
          <div>
            <strong>No branch has been added yet.</strong> Nobody can punch in until one is.
            Stand inside the office, press Add branch, and use "Use my current location".
          </div>
          <button className="btn btn--sm btn--primary" onClick={() => setAddingOffice(true)}>Add branch</button>
        </div>
      )}

      {showBranches && (
        <div className="section">
          <div className="section-head">
            <h3>Branches</h3>
            <div className="section-tools">
              <button className="btn btn--sm btn--primary" onClick={() => setAddingOffice(true)}>Add branch</button>
            </div>
          </div>
          <div className="ov-actions">
            {att.offices.length === 0 && <p style={{ color: 'var(--ink-3)' }}>No branches yet.</p>}
            {att.offices.map((o) => (
              <div className="ov-row" key={o.id} style={{ cursor: 'default' }}>
                <span className="ov-n">{staff.filter((e) => e.officeId === o.id).length}</span>
                <span className="ov-l">
                  <strong>{o.name}</strong>
                  <span style={{ color: 'var(--ink-3)' }}>
                    {o.address ? '  ·  ' + o.address : ''}{'  ·  '}within {o.radiusMeters} m
                    {!o.isActive ? '  ·  closed' : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Downloading the code is the thing HR does most often and it
                      was two clicks deep inside the edit modal. It is a button on
                      the branch itself now: the sheet that comes out names this
                      branch, its address and its allowed distance. */}
                  <button className="btn btn--sm" disabled={saving === o.id} onClick={() => void saveCode(o)}>
                    {saving === o.id ? 'Saving…' : 'Download QR'}
                  </button>
                  <button className="btn btn--sm" onClick={() => setEditingOffice(o)}>Edit branch</button>
                </span>
              </div>
            ))}
          </div>
          <p className="punch-note">
            Each branch has its own location, its own allowed distance and its own printed QR code.
            Adding a third one later changes nothing else.
          </p>
        </div>
      )}

      <div className="kpis">
        <Kpi accent label="In the office" value={inOffice} sub={date === officeToday(tz) ? 'punched in, not out yet' : 'still open on this day'} />
        <Kpi label="Day closed" value={closed} sub="punched out" />
        <Kpi label="Late" value={lateToday} sub={`past the ${settings?.graceMinutes ?? 7} minute relaxation`} />
        <Kpi label="On leave" value={onLeave.length} sub="approved for this day" />
        <Kpi label="No punch" value={noShow} sub="nothing recorded, not on leave" />
      </div>

      {onLeave.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h3>On leave {date === officeToday(tz) ? 'today' : 'this day'}</h3>
            {onOpenLeave && (
              <div className="section-tools">
                <button className="btn btn--sm" onClick={onOpenLeave}>Open Leave →</button>
              </div>
            )}
          </div>
          <div className="ov-actions">
            {onLeave.map((r) => (
              <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                <span className="ov-l">
                  <strong>{nameOf(r.employeeId)}</strong>
                  <span style={{ color: 'var(--ink-3)' }}>
                    {'  ·  '}{LEAVE_TYPE[r.leaveType].label}{'  ·  '}back {fmtLeaveDate(r.endDate)}
                  </span>
                </span>
                <Chip cls={LEAVE_TYPE[r.leaveType].cls}>{r.daysCount === 1 ? '1 day' : r.daysCount + ' days'}</Chip>
              </div>
            ))}
          </div>
        </div>
      )}

      {att.error && <div className="auth-err" style={{ marginBottom: 14 }}>{att.error}</div>}

      <div className="section">
        <div className="section-head">
          <h3>{date === officeToday(tz) ? 'Today' : date}</h3>
          <div className="section-tools" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {count(att.offices.filter((o) => o.isActive).length, 'branch')} · full day {fmtDuration(settings?.requiredMinutes ?? 540)} · {settings?.graceMinutes ?? 7} min relaxation
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

      {(addingOffice || editingOffice) && (
        <OfficeModal
          office={editingOffice}
          onClose={() => { setAddingOffice(false); setEditingOffice(null) }}
          onRotate={editingOffice ? (id) => att.rotateQr(id) : undefined}
          onSave={async (d) => {
            const message = editingOffice ? await att.updateOffice(editingOffice.id, d) : await att.createOffice(d)
            if (!message) toast(editingOffice ? 'Branch saved.' : 'Branch added.')
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
