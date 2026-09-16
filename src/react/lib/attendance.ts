/* Phase 6: attendance. The vocabulary the punch screen and the HR attendance
   page share — kept beside hr.ts rather than inside it, because this module
   has its own rules (a geofence, a grace period, a shift) that nothing else in
   HR cares about. */

export type AttendanceStatus =
  | 'in_progress'
  | 'present'
  | 'late'
  | 'half_day'
  | 'absent'
  | 'missing_punch_out'
  | 'on_leave'
  | 'holiday'
  | 'week_off'

/** One person, one day. Every field after the times is evidence: where the
 *  phone said it was, how sure it was, and how far that is from the office —
 *  all computed by the database (0013), never sent by the browser. */
export interface AttendanceRow {
  id: string
  employeeId: string
  workDate: string
  shiftId: string | null
  shiftStart: string | null
  punchInAt: string | null
  punchInLat: number | null
  punchInLng: number | null
  punchInAccuracy: number | null
  punchInDistance: number | null
  punchOutAt: string | null
  punchOutLat: number | null
  punchOutLng: number | null
  punchOutAccuracy: number | null
  punchOutDistance: number | null
  /** Which branch this day was measured against, snapshotted at punch-in — a
   *  transfer next month must not rewrite where somebody stood today, and a
   *  Sector 6 person spending a day at Sector 10 shows as exactly that. */
  officeId: string | null
  /** How the day was opened and closed: the button, a scanned poster, or HR. */
  punchInMethod: PunchMethod
  punchOutMethod: PunchMethod
  workedMinutes: number
  lateMinutes: number
  status: AttendanceStatus
  /** 'self' came through the geofence. 'hr' was typed by a person. Shown on
   *  screen, because a day HR filled in is a different kind of fact. */
  source: 'self' | 'hr'
  editedBy: string | null
  editReason: string | null
}

export type PunchMethod = 'button' | 'qr' | 'hr'

/** One office. Metrol has two and will have three; adding the third is a row,
 *  not a migration. Coordinates are required — a branch nobody can punch at is
 *  not a branch — so HR captures the location in the step that creates it. */
export interface OfficeLocation {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  /** Per branch: a small office off a main road and a floor in a tower do not
   *  deserve the same fence. */
  radiusMeters: number
  isActive: boolean
  sortOrder: number
  /** What the printed poster encodes. Rotating it kills every photocopy of the
   *  old one, which is the answer when a printout walks. */
  qrToken: string
  qrRotatedAt: string | null
}

/** What is true company-wide. The office used to live here and does not any
 *  more (0014): two branches cannot share one set of coordinates. */
export interface AttendanceSettings {
  graceMinutes: number
  requiredMinutes: number
  halfDayMinutes: number
  maxAccuracyMeters: number
  weekOffs: number[]
  timezone: string
  /** Off means a punch is only ever accepted at the branch that person is
   *  assigned to. On (the default) lets somebody working out of the other
   *  office that day punch there, and the row records which one it was. */
  allowAnyBranch: boolean
  /** Round 2 (0022) — the leave rules. Lates 1..N in a month are free; every
   *  late after the Nth is a half day. */
  freeLatesPerMonth: number
  paidLeavePerMonth: number
  /** T&C 3.9, HR's switch. 0 = off; N = no paid leave for the joining month
   *  and the N-1 after it. */
  probationMonths: number
  /** T&C 3.10, HR's switch. Approving leave filed on the day itself defaults
   *  to unpaid; HR can keep it paid for an emergency. */
  sameDayLeaveUnpaid: boolean
  /** T&C 3.7, HR's number. 0 = off. Paid without touching the balance. */
  periodLeavePerMonth: number
  /** YYYY-MM-01 — the first month leave is counted by these rules. */
  leaveRulesStart: string
  /** Whether 0022 has run on this database. Until it has, the rules above are
   *  0022's defaults read from nowhere, and nothing may try to save them. */
  leaveRulesInstalled: boolean
  updatedAt: string | null
}

/** A day the office is shut. The date is the primary key (0013), so a company
 *  cannot accidentally hold two names for one day. Phase 7 gave this table its
 *  first UI — until then it existed and was always empty, which made "leave
 *  excludes holidays" a promise nothing could keep. */
export interface Holiday {
  /** YYYY-MM-DD. */
  date: string
  name: string
}

export const PUNCH_METHOD: Record<PunchMethod, string> = {
  button: 'Button',
  qr: 'QR scan',
  hr: 'HR entry',
}

export interface Shift {
  id: string
  name: string
  startsAt: string
  sortOrder: number
  isActive: boolean
}

/** Every status this build knows. Read it through statusChip(), never
 *  directly: a row written by a newer migration than this bundle would
 *  otherwise take the whole screen down on an undefined lookup. */
export const ATT_STATUS: Record<AttendanceStatus, { label: string; cls: string }> = {
  in_progress: { label: 'In office', cls: 'chip--accent' },
  present: { label: 'Present', cls: 'chip--good' },
  // Amber, not red. Late is a fact to count, not a failure to punish on sight.
  late: { label: 'Late', cls: 'chip--warn' },
  half_day: { label: 'Half day', cls: 'chip--warn' },
  absent: { label: 'Absent', cls: 'chip--bad' },
  missing_punch_out: { label: 'No punch out', cls: 'chip--bad' },
  on_leave: { label: 'On leave', cls: 'chip--mute' },
  holiday: { label: 'Holiday', cls: 'chip--mute' },
  week_off: { label: 'Week off', cls: 'chip--mute' },
}

export const statusChip = (s: AttendanceStatus | string | null | undefined) =>
  ATT_STATUS[(s ?? '') as AttendanceStatus] ?? { label: s ? String(s).replace(/_/g, ' ') : 'Unknown', cls: 'chip--mute' }

/** "09:34 AM" — a punch time, in the office's timezone rather than the
 *  viewer's, so a person travelling does not see their own day shift. */
export function fmtTime(iso: string | null | undefined, tz = 'Asia/Kolkata'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz })
  } catch {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
}

/** 545 → "9h 05m". Minutes are what the database stores; nobody reads them.
 *  `zero` is what nothing reads as: a dash on a day with no hours on it, but
 *  "0h 00m" on a day that started a minute ago — those are different facts. */
export function fmtDuration(minutes: number | null | undefined, zero = '—'): string {
  const m = Math.max(0, Math.round(minutes ?? 0))
  if (!m) return zero
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** "09:30" from a Postgres time value, which may arrive as "09:30:00". */
export const fmtShift = (t: string | null | undefined) => (t ? t.slice(0, 5) : '—')

/** Today in the office's timezone — NOT the device's. A phone set to a
 *  different zone must still agree with the server about which day it is. */
export function officeToday(tz = 'Asia/Kolkata'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Which working DAY an instant belongs to, in the office's timezone. Used to
 *  aim the re-read after a punch at exactly the row the punch changed. */
export function officeDate(when: Date | string, tz = 'Asia/Kolkata'): string {
  const d = typeof when === 'string' ? new Date(when) : when
  if (Number.isNaN(d.getTime())) return officeToday(tz)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

export const monthOf = (isoDate: string) => (isoDate || '').slice(0, 7)

/** What a month of somebody's attendance adds up to. "Late 3" on screen is
 *  this count — the client asked for the running number, not just a flag. */
export interface AttendanceSummary {
  present: number
  late: number
  halfDay: number
  absent: number
  missing: number
  onLeave: number
  workedMinutes: number
  days: number
}

export function summarise(rows: AttendanceRow[]): AttendanceSummary {
  const s: AttendanceSummary = { present: 0, late: 0, halfDay: 0, absent: 0, missing: 0, onLeave: 0, workedMinutes: 0, days: 0 }
  for (const r of rows) {
    s.days += 1
    s.workedMinutes += r.workedMinutes
    // "Late coming 3" is a count of ARRIVALS, not of days graded 'late'. A day
    // somebody came in at 11 and left at 4 is a half day AND a late arrival —
    // counting it only as the former hides exactly what HR is looking for.
    if (r.lateMinutes > 0) s.late += 1
    // A late day is still a full day worked, so it counts here too. The two
    // tiles answer different questions: "how many full days" and "how many
    // times did they come in late".
    if (r.status === 'present' || r.status === 'late') s.present += 1
    else if (r.status === 'half_day') s.halfDay += 1
    else if (r.status === 'absent') s.absent += 1
    else if (r.status === 'missing_punch_out') s.missing += 1
    else if (r.status === 'on_leave') s.onLeave += 1
  }
  return s
}

/** What the browser can tell us about where it is.
 *
 *  enableHighAccuracy asks for the GPS radio rather than the wifi/IP estimate.
 *  It is the difference between "within 30 m" and "within 2 km", and 0013
 *  rejects the second — so this is not a nicety, it is the check working.
 *  maximumAge: 0 refuses a cached fix: a position from an hour ago is not
 *  evidence that somebody is standing in the office now. */
export interface Fix { lat: number; lng: number; accuracy: number }

export function getFix(timeoutMs = 15000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser cannot share a location. Try Chrome or Safari on your phone.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => {
        // The three failures worth telling apart, because the fix for each is
        // different and "location error" helps nobody standing at the door.
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission is blocked. Allow location for this site in your browser settings, then try again.'))
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Could not get a location fix. Step near a window or outside and try again.'))
        } else {
          reject(new Error('Getting your location took too long. Try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

/** The same haversine the database uses, for the "you are ~18 m away" line the
 *  punch screen shows BEFORE anybody presses anything. The database's answer
 *  is the one that decides; this one only sets expectations. */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)) * 10) / 10
}

/* ------------------------------------------------------- the day calendar */

/**
 * What a single date MEANS for one employee — which is not the same question
 * as "is there an attendance row". Most days that matter have no row at all:
 * a Sunday, Republic Day, an approved leave, and a plain absence are all
 * "nothing in the attendance table", and until now all four were invisible on
 * the employee's own screen. Adarsh asked for them by name: holidays and
 * Sundays marked H, automatically.
 */
export type DayKind =
  | 'present' | 'late' | 'half_day' | 'in_progress' | 'no_punch_out'
  | 'leave' | 'holiday' | 'week_off' | 'absent' | 'future'
  /** Before they joined or after their last day. Not an absence — nobody was
   *  expecting them. Rendered blank, like a day that has not happened yet. */
  | 'outside'

export interface CalendarDay {
  date: string
  kind: DayKind
  /** Only what the day's LABEL does not already say — "L5 → half day · 6 min
   *  late", a holiday's name, a leave type — or empty. It used to repeat the
   *  label ("Late · 6 min late" beside a chip reading Late), which on a phone
   *  cost the table the width it needed to fit without scrolling sideways. */
  remark: string
  /** The real row, when one exists — the table still shows real punch times. */
  row: AttendanceRow | null
  /** This day's number among the month's late arrivals — L1, L2… — or null.
   *  Counted across the whole calendar month from every row, not just the
   *  range on screen, so a view starting on the 15th still says L5. */
  lateNo: number | null
  /** A late past the free ones, on a day that was otherwise a full (or still
   *  running) day. It costs half a day; a day that was already a half day or
   *  an absence costs nothing extra. Mirrors 0022's leave_month_summary. */
  lateHalf: boolean
  /** For a leave day: the approved request's type. Null when HR marked the
   *  register "on leave" with no request behind it — ordinary paid leave. */
  leaveType: string | null
}

/** Which rows are a late ARRIVAL. A status HR set by hand (on leave, holiday,
 *  week off) is not, whatever minutes happen to be left on it. 0022 uses the
 *  same list. */
const LATE_STATUSES = new Set(['present', 'late', 'half_day', 'absent', 'in_progress', 'missing_punch_out'])
/** Which days a late past the free ones can turn into a half day. */
const LADDER_STATUSES = new Set(['present', 'late', 'in_progress', 'missing_punch_out'])
export const isLateArrival = (r: AttendanceRow) => !!r.punchInAt && r.lateMinutes > 0 && LATE_STATUSES.has(r.status)

export const DAY_KIND: Record<DayKind, { label: string; cls: string }> = {
  present:     { label: 'Present',      cls: 'cal--present' },
  late:        { label: 'Late',         cls: 'cal--late' },
  half_day:    { label: 'Half day',     cls: 'cal--half' },
  in_progress: { label: 'In office',    cls: 'cal--open' },
  // Came in, never closed the day. Not absent — they were here — but not a
  // graded day either, so it stays the neutral open-day square until HR
  // settles it. The table's chip carries the red that asks for that.
  no_punch_out: { label: 'No punch out', cls: 'cal--open' },
  leave:       { label: 'Leave',        cls: 'cal--leave' },
  holiday:     { label: 'Holiday',      cls: 'cal--holiday' },
  week_off:    { label: 'Weekly off',   cls: 'cal--holiday' },
  absent:      { label: 'Absent',       cls: 'cal--absent' },
  future:      { label: '',             cls: 'cal--future' },
  outside:     { label: '',             cls: 'cal--future' },
}

/** Date-only maths done in UTC on purpose. These are calendar dates, not
 *  moments — running them through the device's local timezone is how a date
 *  silently becomes the day before in the wrong hemisphere. */
export const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekdayOf = (iso: string): number => new Date(iso + 'T00:00:00Z').getUTCDay()

/** First and last date of the month an ISO date falls in. */
export const monthStart = (iso: string) => iso.slice(0, 8) + '01'
export const monthEnd = (iso: string) => {
  const d = new Date(iso.slice(0, 8) + '01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

/** Leave type labels, kept here rather than imported from hr.ts so this file
 *  stays free of imports — 'casual' is the plain case and says nothing. */
const LEAVE_REMARK: Record<string, string> = { sick: 'Sick', unpaid: 'Unpaid', period: 'Period' }

/**
 * Every date from `from` to `to`, told what it is.
 *
 * **Precedence — and it is 0022's `leave_month_summary` precedence exactly, so
 * the grid somebody looks at and the number they are paid on cannot
 * disagree:** a real attendance row ALWAYS wins (somebody who punched on a
 * Sunday worked that day; the row is evidence, the calendar only a default) →
 * a holiday → a week off → approved leave → a day not over yet (blank) →
 * absent. Holiday and week off come BEFORE leave on purpose: a Sunday inside a
 * week of approved leave is a Sunday, and 0016 never charged leave for it.
 *
 * **Only APPROVED leave counts.** Adarsh was explicit: a request HR has not
 * approved is not leave, and it must not colour the day or spend a balance.
 *
 * **Today, without a punch, is blank — not absent.** The day is not over; an
 * absence at 9 in the morning is an accusation, not a fact.
 */
export function buildCalendar(opts: {
  from: string
  to: string
  /** This ONE employee's rows — all of them loaded, not only the range: the
   *  late numbering counts from the 1st of each month. */
  rows: AttendanceRow[]
  holidays: Holiday[]
  weekOffs: number[]
  /** Leave requests for this ONE employee. Status is filtered here, not by
   *  the caller, so nobody can pass pending leave in by accident. */
  leaves: { startDate: string; endDate: string; status: string; leaveType?: string; createdAt?: string }[]
  today: string
  /** Lates 1..N in a month are free (attendance_settings.free_lates_per_month).
   *  Unknown → no late is ever turned into a half day on screen. */
  freeLates?: number
  joinedOn?: string | null
  lastDay?: string | null
}): CalendarDay[] {
  const { from, to, rows, holidays, weekOffs, leaves, today } = opts
  const freeLates = opts.freeLates ?? Infinity
  if (!from || !to || from > to) return []

  const rowByDate = new Map(rows.map((r) => [r.workDate, r]))
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]))
  // Newest request first — when two approved requests overlap a day, the
  // later one is what HR last decided. 0022 orders by created_at the same way.
  const approved = leaves
    .filter((l) => l.status === 'approved')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const leaveOn = (d: string) => approved.find((l) => d >= l.startDate && d <= l.endDate)

  // L1, L2… per calendar month, over every row rather than the visible range.
  const lateNo = new Map<string, number>()
  const perMonth = new Map<string, number>()
  for (const r of [...rows].sort((a, b) => a.workDate.localeCompare(b.workDate))) {
    if (!isLateArrival(r)) continue
    const m = r.workDate.slice(0, 7)
    const n = (perMonth.get(m) ?? 0) + 1
    perMonth.set(m, n)
    lateNo.set(r.workDate, n)
  }

  const blank = { row: null, lateNo: null, lateHalf: false, leaveType: null }
  const out: CalendarDay[] = []
  // A guard, not a limit anybody should hit: two years of days. A typo in a
  // date field must not spin here forever.
  for (let d = from, guard = 0; d <= to && guard < 800; d = addDays(d, 1), guard++) {
    if ((opts.joinedOn && d < opts.joinedOn) || (opts.lastDay && d > opts.lastDay)) {
      out.push({ date: d, kind: 'outside', remark: '', ...blank })
      continue
    }
    const row = rowByDate.get(d) ?? null

    if (row) {
      const n = lateNo.get(d) ?? null
      const lateHalf = n !== null && n > freeLates && LADDER_STATUSES.has(row.status)
      // Every status 0013 allows, named. The old fall-through sent HR's own
      // "On leave", "Holiday" and "Week off" corrections — and a day somebody
      // punched in and never closed — to a red Absent square, telling the
      // employee the opposite of what HR had recorded.
      const kind: DayKind =
        (row.status === 'present' || row.status === 'late') && lateHalf ? 'half_day'
        : row.status === 'present' ? (row.lateMinutes > 0 ? 'late' : 'present')
        : row.status === 'late' ? 'late'
        : row.status === 'half_day' ? 'half_day'
        : row.status === 'in_progress' ? 'in_progress'
        : row.status === 'missing_punch_out' ? 'no_punch_out'
        : row.status === 'on_leave' ? 'leave'
        : row.status === 'holiday' ? 'holiday'
        : row.status === 'week_off' ? 'week_off'
        : 'absent'
      const leaveType = kind === 'leave' ? (leaveOn(d)?.leaveType ?? null) : null
      const remark = n !== null
        ? `L${n}${lateHalf ? ' → half day' : ''} · ${row.lateMinutes} min late`
        : leaveType ? (LEAVE_REMARK[leaveType] ?? '') : ''
      out.push({ date: d, kind, row, remark, lateNo: n, lateHalf, leaveType })
      continue
    }

    const holiday = holidayByDate.get(d)
    if (holiday) { out.push({ date: d, kind: 'holiday', remark: holiday, ...blank }); continue }

    if (weekOffs.includes(weekdayOf(d))) {
      out.push({ date: d, kind: 'week_off', remark: '', ...blank })
      continue
    }

    const onLeave = leaveOn(d)
    if (onLeave) {
      const leaveType = onLeave.leaveType ?? null
      out.push({ date: d, kind: 'leave', remark: leaveType ? (LEAVE_REMARK[leaveType] ?? '') : '', ...blank, leaveType })
      continue
    }

    if (d >= today) { out.push({ date: d, kind: 'future', remark: '', ...blank }); continue }
    out.push({ date: d, kind: 'absent', remark: '', ...blank })
  }
  return out
}

export interface CalendarTotals {
  present: number; late: number; halfDay: number; leave: number
  holiday: number; absent: number; workedMinutes: number
}

/** Counted off the SAME list the table and the grid render, so the tiles can
 *  never disagree with the days underneath them. */
export function calendarTotals(days: CalendarDay[]): CalendarTotals {
  const t: CalendarTotals = { present: 0, late: 0, halfDay: 0, leave: 0, holiday: 0, absent: 0, workedMinutes: 0 }
  for (const d of days) {
    if (d.row) t.workedMinutes += d.row.workedMinutes || 0
    // Late counts ARRIVALS, whatever the day became — "how many times was I
    // late" and "how many days was I here" are different questions.
    if (d.lateNo !== null) t.late++
    if (d.kind === 'half_day' || d.lateHalf) { t.halfDay++; continue }
    switch (d.kind) {
      case 'present': case 'late': case 'in_progress': case 'no_punch_out': t.present++; break
      case 'leave': t.leave++; break
      case 'holiday': case 'week_off': t.holiday++; break
      case 'absent': t.absent++; break
    }
  }
  return t
}
