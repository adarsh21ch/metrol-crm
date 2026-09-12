import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoAttendance, demoAttendanceSettings, demoEmployees, demoOffices, demoShifts, isDemo } from '@/data/demo'
import { officeToday, type AttendanceRow, type AttendanceSettings, type AttendanceStatus, type OfficeLocation, type PunchMethod, type Shift } from '@/lib/attendance'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))

const toRow = (r: Row): AttendanceRow => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  workDate: str(r.work_date),
  shiftId: (r.shift_id as string | null) ?? null,
  shiftStart: (r.shift_start as string | null) ?? null,
  punchInAt: (r.punch_in_at as string | null) ?? null,
  punchInLat: num(r.punch_in_lat),
  punchInLng: num(r.punch_in_lng),
  punchInAccuracy: num(r.punch_in_accuracy),
  punchInDistance: num(r.punch_in_distance_m),
  punchOutAt: (r.punch_out_at as string | null) ?? null,
  punchOutLat: num(r.punch_out_lat),
  punchOutLng: num(r.punch_out_lng),
  punchOutAccuracy: num(r.punch_out_accuracy),
  punchOutDistance: num(r.punch_out_distance_m),
  officeId: (r.office_id as string | null) ?? null,
  punchInMethod: (r.punch_in_method as PunchMethod) ?? 'button',
  punchOutMethod: (r.punch_out_method as PunchMethod) ?? 'button',
  workedMinutes: Number(r.worked_minutes) || 0,
  lateMinutes: Number(r.late_minutes) || 0,
  status: (r.status as AttendanceStatus) ?? 'in_progress',
  source: (r.source as 'self' | 'hr') ?? 'self',
  editedBy: (r.edited_by as string | null) ?? null,
  editReason: (r.edit_reason as string | null) ?? null,
})

const toSettings = (r: Row): AttendanceSettings => ({
  graceMinutes: Number(r.grace_minutes) || 0,
  requiredMinutes: Number(r.required_minutes) || 540,
  halfDayMinutes: Number(r.half_day_minutes) || 270,
  maxAccuracyMeters: Number(r.max_accuracy_meters) || 100,
  weekOffs: Array.isArray(r.week_offs) ? (r.week_offs as number[]).map(Number) : [0],
  timezone: str(r.timezone) || 'Asia/Kolkata',
  allowAnyBranch: r.allow_any_branch !== false,
  updatedAt: (r.updated_at as string | null) ?? null,
})

const toOffice = (r: Row): OfficeLocation => ({
  id: str(r.id),
  name: str(r.name),
  address: str(r.address),
  lat: Number(r.lat),
  lng: Number(r.lng),
  radiusMeters: Number(r.radius_meters) || 50,
  isActive: r.is_active !== false,
  sortOrder: Number(r.sort_order) || 0,
  qrToken: str(r.qr_token),
  qrRotatedAt: (r.qr_rotated_at as string | null) ?? null,
})

const toShift = (r: Row): Shift => ({
  id: str(r.id),
  name: str(r.name),
  startsAt: str(r.starts_at),
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

/** What punch_in / punch_out answer with. Never an exception: being too far
 *  from the office is an ordinary thing to tell somebody, not a server error. */
export interface PunchResult {
  ok: boolean
  reason?: string
  message: string
  /** Which branch the punch landed at — named in the message too, because
   *  somebody punching at the other office should be told, not just logged. */
  office?: string
  action?: string
  distance?: number
  status?: string
  lateMinutes?: number
  workedMinutes?: number
}

export interface SettingsDraft {
  graceMinutes: number
  requiredMinutes: number
  halfDayMinutes: number
  maxAccuracyMeters: number
  allowAnyBranch: boolean
}

export interface OfficeDraft {
  name: string
  address: string
  lat: number
  lng: number
  radiusMeters: number
  isActive: boolean
}

/** A manual correction, or a day HR is filling in from the paper register.
 *  Times are full ISO instants, because a punch is a moment, not a clock face. */
export interface AttendanceDraft {
  punchInAt: string | null
  punchOutAt: string | null
  shiftStart: string | null
  status?: AttendanceStatus
  editReason: string
}

/**
 * Attendance, its settings and the shift list in one hook, because no screen
 * needs one without the others — the punch card needs the radius to explain
 * itself, and the HR page needs shifts to name what somebody was late for.
 *
 * Nothing here inserts or updates public.attendance for an ordinary employee.
 * It cannot: 0013 gives them no write policy at all. punchIn/punchOut call the
 * two security-definer functions, which check where the phone is and stamp the
 * time from the database. That is the whole point of the module — the UI is
 * not what stops somebody punching in from home.
 */
export function useAttendance(enabled = true) {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [settings, setSettings] = useState<AttendanceSettings | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [offices, setOffices] = useState<OfficeLocation[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    if (isDemo()) {
      setRows(demoAttendance)
      setSettings(demoAttendanceSettings)
      setShifts(demoShifts)
      setOffices(demoOffices)
      setLoading(false)
      return
    }
    const [att, set, sh, off] = await Promise.all([
      supabase.from('attendance').select('*').order('work_date', { ascending: false }).limit(2000),
      supabase.from('attendance_settings').select('*').limit(1).maybeSingle(),
      supabase.from('shifts').select('*').order('sort_order'),
      supabase.from('office_locations').select('*').order('sort_order'),
    ])
    if (att.error) { setError(att.error.message); setLoading(false); return }
    setRows((att.data ?? []).map((r) => toRow(r as Row)))
    if (set.data) setSettings(toSettings(set.data as Row))
    setShifts((sh.data ?? []).map((r) => toShift(r as Row)))
    setOffices((off.data ?? []).map((r) => toOffice(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /* ------------------------------------------------------------ the punches */

  const punch = useCallback(async (
    kind: 'in' | 'out',
    fix: { lat: number; lng: number; accuracy: number },
    myEmployeeId?: string,
  ): Promise<PunchResult> => {
    if (isDemo()) {
      const today = officeToday()
      const id = myEmployeeId ?? 'e1'
      const existing = rows.find((r) => r.employeeId === id && r.workDate === today)
      const me = demoEmployees.find((e) => e.id === id)
      const branch = offices.find((o) => o.id === me?.officeId) ?? offices[0]
      if (kind === 'in') {
        if (existing?.punchInAt) return { ok: false, reason: 'already_in', message: 'You are already punched in for today.' }
        const now = new Date().toISOString()
        const myShift = shifts.find((s) => s.id === (me?.shiftId ?? '')) ?? shifts[0]
        setRows((p) => [{
          id: 'att-demo-' + today, employeeId: id, workDate: today,
          officeId: branch?.id ?? null, punchInMethod: 'button', punchOutMethod: 'button',
          shiftId: myShift?.id ?? null, shiftStart: myShift?.startsAt ?? null,
          punchInAt: now, punchInLat: fix.lat, punchInLng: fix.lng, punchInAccuracy: fix.accuracy, punchInDistance: 18,
          punchOutAt: null, punchOutLat: null, punchOutLng: null, punchOutAccuracy: null, punchOutDistance: null,
          workedMinutes: 0, lateMinutes: 0, status: 'in_progress', source: 'self', editedBy: null, editReason: null,
        }, ...p])
        return { ok: true, message: `Punched in at ${branch?.name ?? 'the office'}. Have a good day.`, distance: 18, office: branch?.name }
      }
      if (!existing?.punchInAt) return { ok: false, reason: 'not_in', message: 'You have not punched in today.' }
      if (existing.punchOutAt) return { ok: false, reason: 'already_out', message: 'You already punched out today.' }
      const worked = Math.max(0, Math.round((Date.now() - new Date(existing.punchInAt).getTime()) / 60000))
      const status: AttendanceStatus = worked >= 540 ? 'present' : worked >= 270 ? 'half_day' : 'absent'
      setRows((p) => p.map((r) => (r.id === existing.id
        ? { ...r, punchOutAt: new Date().toISOString(), punchOutDistance: 18, workedMinutes: worked, status }
        : r)))
      return { ok: true, message: 'Punched out.', workedMinutes: worked, status }
    }

    const { data, error: err } = await supabase.rpc(kind === 'in' ? 'punch_in' : 'punch_out', {
      p_lat: fix.lat, p_lng: fix.lng, p_accuracy: Math.round(fix.accuracy),
    })
    if (err) return { ok: false, reason: 'error', message: err.message }
    const d = (data ?? {}) as Record<string, unknown>
    // The row that just changed is fetched back rather than patched in from
    // the response: the database decided the status, and guessing it here is
    // how two truths start to exist.
    await load()
    return {
      ok: d.ok === true,
      reason: d.reason as string | undefined,
      message: str(d.message) || (d.ok === true ? 'Done.' : 'Could not record that.'),
      distance: d.distance == null ? undefined : Number(d.distance),
      status: d.status as string | undefined,
      lateMinutes: d.late_minutes == null ? undefined : Number(d.late_minutes),
      workedMinutes: d.worked_minutes == null ? undefined : Number(d.worked_minutes),
    }
  }, [rows, load])

  const punchIn = useCallback((fix: { lat: number; lng: number; accuracy: number }, empId?: string) => punch('in', fix, empId), [punch])
  const punchOut = useCallback((fix: { lat: number; lng: number; accuracy: number }, empId?: string) => punch('out', fix, empId), [punch])

  /** The printed poster. One call for both directions, because that is how it
   *  is used: the same code, scanned on the way in and on the way out. The
   *  token only names the branch — the database still checks that this phone is
   *  standing at it, so a photographed code is worth nothing off-site. */
  const punchByQr = useCallback(async (
    token: string,
    fix: { lat: number; lng: number; accuracy: number },
    myEmployeeId?: string,
  ): Promise<PunchResult> => {
    if (isDemo()) {
      const branch = offices.find((o) => o.qrToken === token)
      if (!branch) return { ok: false, reason: 'bad_code', message: 'This QR code is not in use any more. Ask HR for the current one.' }
      const today = officeToday()
      const id = myEmployeeId ?? 'e1'
      const existing = rows.find((r) => r.employeeId === id && r.workDate === today)
      const res = await punch(existing?.punchInAt && !existing.punchOutAt ? 'out' : 'in', fix, id)
      if (res.ok) return { ...res, office: branch.name, message: res.message.replace('the office', branch.name) }
      return res
    }
    const { data, error: err } = await supabase.rpc('punch_by_qr', {
      p_token: token, p_lat: fix.lat, p_lng: fix.lng, p_accuracy: Math.round(fix.accuracy),
    })
    if (err) return { ok: false, reason: 'error', message: err.message }
    const d = (data ?? {}) as Record<string, unknown>
    await load()
    return {
      ok: d.ok === true,
      reason: d.reason as string | undefined,
      message: str(d.message) || (d.ok === true ? 'Done.' : 'Could not record that.'),
      distance: d.distance == null ? undefined : Number(d.distance),
      office: d.office as string | undefined,
      status: d.status as string | undefined,
      action: d.action as string | undefined,
    }
  }, [offices, rows, punch, load])

  /* ------------------------------------------------------------- branches */

  const createOffice = useCallback(async (draft: OfficeDraft): Promise<string | null> => {
    if (isDemo()) {
      setOffices((p) => [...p, {
        ...draft, id: 'off-' + (p.length + 1), sortOrder: p.length + 1,
        qrToken: 'demo-token-' + (p.length + 1), qrRotatedAt: new Date().toISOString(),
      }])
      return null
    }
    const { data, error: err } = await supabase.from('office_locations').insert({
      name: draft.name.trim(), address: draft.address.trim(),
      lat: draft.lat, lng: draft.lng, radius_meters: draft.radiusMeters, is_active: draft.isActive,
    }).select('*').single()
    if (err) return err.message
    if (data) setOffices((p) => [...p, toOffice(data as Row)])
    return null
  }, [])

  const updateOffice = useCallback(async (id: string, draft: OfficeDraft): Promise<string | null> => {
    if (isDemo()) {
      setOffices((p) => p.map((o) => (o.id === id ? { ...o, ...draft } : o)))
      return null
    }
    const { data, error: err } = await supabase.from('office_locations').update({
      name: draft.name.trim(), address: draft.address.trim(),
      lat: draft.lat, lng: draft.lng, radius_meters: draft.radiusMeters, is_active: draft.isActive,
    }).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setOffices((p) => p.map((o) => (o.id === id ? toOffice(data as Row) : o)))
    return null
  }, [])

  /** A printout walked. Every photocopy of the old code stops working. */
  const rotateQr = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) {
      setOffices((p) => p.map((o) => (o.id === id
        ? { ...o, qrToken: 'demo-token-' + Math.random().toString(36).slice(2, 10), qrRotatedAt: new Date().toISOString() }
        : o)))
      return null
    }
    const { data, error: err } = await supabase.rpc('rotate_office_qr', { p_office: id })
    if (err) return err.message
    const d = (data ?? {}) as Record<string, unknown>
    if (d.ok !== true) return str(d.message) || 'Could not make a new code.'
    await load()
    return null
  }, [load])

  /* ------------------------------------------------------- HR's own writing */

  const saveSettings = useCallback(async (draft: SettingsDraft): Promise<string | null> => {
    if (isDemo()) {
      setSettings((s) => (s ? { ...s, ...draft } : s))
      return null
    }
    const { data, error: err } = await supabase
      .from('attendance_settings')
      .update({
        grace_minutes: draft.graceMinutes,
        required_minutes: draft.requiredMinutes,
        half_day_minutes: draft.halfDayMinutes,
        max_accuracy_meters: draft.maxAccuracyMeters,
        allow_any_branch: draft.allowAnyBranch,
      })
      .eq('id', true).select('*').single()
    if (err) return err.message
    if (data) setSettings(toSettings(data as Row))
    return null
  }, [])

  /** HR fixing a day. The database re-grades it from the new times (0013), so
   *  a corrected day is judged by the same rule as one nobody touched. */
  const correct = useCallback(async (id: string, draft: AttendanceDraft): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => {
        if (r.id !== id) return r
        const worked = draft.punchInAt && draft.punchOutAt
          ? Math.max(0, Math.round((new Date(draft.punchOutAt).getTime() - new Date(draft.punchInAt).getTime()) / 60000))
          : 0
        return {
          ...r,
          punchInAt: draft.punchInAt,
          punchOutAt: draft.punchOutAt,
          shiftStart: draft.shiftStart,
          workedMinutes: worked,
          // An omitted status means "grade it from the times", which is what
          // the database trigger does. Spreading the draft instead used to
          // write undefined over the status and take the screen down with it.
          status: draft.status ?? (worked >= 540 ? 'present' : worked >= 270 ? 'half_day' : worked > 0 ? 'absent' : r.status),
          editReason: draft.editReason,
          source: 'hr' as const,
        }
      }))
      return null
    }
    const patch: Record<string, unknown> = {
      punch_in_at: draft.punchInAt,
      punch_out_at: draft.punchOutAt,
      shift_start: draft.shiftStart,
      edit_reason: draft.editReason.trim(),
    }
    if (draft.status) patch.status = draft.status
    const { data, error: err } = await supabase.from('attendance').update(patch).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toRow(data as Row) : r)))
    return null
  }, [])

  /** A day with no row at all — somebody who never punched, being written in
   *  from the paper register. Marked source 'hr', and it shows on screen. */
  const addDay = useCallback(async (employeeId: string, workDate: string, draft: AttendanceDraft): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [{
        id: 'att-hr-' + employeeId + '-' + workDate, employeeId, workDate,
        shiftId: null, shiftStart: draft.shiftStart, officeId: null,
        punchInMethod: 'hr', punchOutMethod: 'hr',
        punchInAt: draft.punchInAt, punchInLat: null, punchInLng: null, punchInAccuracy: null, punchInDistance: null,
        punchOutAt: draft.punchOutAt, punchOutLat: null, punchOutLng: null, punchOutAccuracy: null, punchOutDistance: null,
        workedMinutes: 0, lateMinutes: 0, status: draft.status ?? 'present', source: 'hr', editedBy: null, editReason: draft.editReason,
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase.from('attendance').insert({
      employee_id: employeeId,
      work_date: workDate,
      punch_in_at: draft.punchInAt,
      punch_out_at: draft.punchOutAt,
      shift_start: draft.shiftStart,
      status: draft.status ?? 'present',
      source: 'hr',
      edit_reason: draft.editReason.trim(),
    }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toRow(data as Row), ...p])
    return null
  }, [])

  /** Past days still sitting at 'in_progress' become 'missing_punch_out' so HR
   *  can see them. Free plans have no cron, so the HR screen calls this. */
  const finalizeOpen = useCallback(async () => {
    if (isDemo()) return
    await supabase.rpc('finalize_open_attendance')
  }, [])

  return {
    rows, settings, shifts, offices, loading, error,
    reload: load, punchIn, punchOut, punchByQr, saveSettings, correct, addDay, finalizeOpen,
    createOffice, updateOffice, rotateQr,
    clearError: () => setError(null),
  }
}

export type Attendance = ReturnType<typeof useAttendance>
