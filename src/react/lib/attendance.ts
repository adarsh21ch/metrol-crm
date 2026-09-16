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
