/* Round 2 of the attendance brief: how a month of attendance and leave adds up
   to paid leave spent, salary lost, and what is left to pay out or carry.

   THE DATABASE IS THE AUTHORITY. 0022's leave_month_summary() decides every
   number a person is paid on; the live app asks it. What is here is the same
   rule written a second time, for demo mode (which never touches the network)
   and nothing else — and the two were run against one scenario, June to
   September, and agree to the half day. If they ever disagree, the database is
   right and this file has a bug.

   The rules, as Adarsh settled them on 2026-09-16:
     • lates 1..N in a month are free; EVERY late after the Nth is a half day
     • a half day costs 0.5 paid leave; with no balance left it is unpaid
     • approved sick/casual leave spends the balance; pending spends nothing
     • absent with no approved leave = a day's salary, the balance untouched
     • at month end HR records pay-out (every unused day paid, back to 0) or
       carry-forward (next month starts at what is left + the new allowance)
     • probation, same-day leave and period leave are HR's switches, off by
       default */

import type { AttendanceRow, AttendanceSettings, Holiday } from './attendance'
import { buildCalendar, monthEnd } from './attendance'
import type { LeaveRequest } from './hr'

export type LeaveChoice = 'payout' | 'carry'

/** One person's month — the shape leave_month_summary() returns, camelCased. */
export interface LeaveMonth {
  ok: boolean
  /** A refusal's code and sentence (forbidden, not_ended, previous_open…). */
  reason: string | null
  message: string | null
  /** False before leave was counted for this person (the rules' start month,
   *  or the month they joined) — every number is then zero and means nothing. */
  counted: boolean
  closed: boolean
  /** The opening balance is last month's closing as if CARRIED, because last
   *  month is not closed yet and HR may still pay it out. */
  provisional: boolean
  /** The month is over (and so can be closed). */
  ended: boolean
  employeeId: string
  /** YYYY-MM-01 */
  month: string
  opening: number
  accrued: number
  available: number
  leaveDays: number
  halfDays: number
  lateCount: number
  lateHalfDays: number
  periodDays: number
  periodPaid: number
  /** Taken out of the balance: leave days + half a day per half day + period
   *  leave beyond its allowance, capped at what was available. */
  used: number
  /** What wanted to be paid but found the balance empty. */
  unpaidOverflow: number
  unpaidLeaveDays: number
  absentDays: number
  /** Days never punched out of — the month cannot close until HR settles them. */
  unsettledDays: number
  /** Left over, before HR's choice. */
  closing: number
  /** Everything that comes off salary: absences + unpaid leave + overflow. */
  unpaidDays: number
  choice: LeaveChoice | null
  payoutDays: number | null
  carried: number | null
  /** Last closed month's choice for this person, else pay-out (T&C 3.4 is the
   *  default; carrying forward is the option somebody opts into, 3.5). */
  suggestedChoice: LeaveChoice
  closedAt: string | null
  /** Present on HR's board rows only. */
  fullName?: string
  employeeCode?: string
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v))
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null)

/** The RPC's jsonb, as this app's type. Postgres numerics arrive as strings. */
export function toLeaveMonth(j: Record<string, unknown>): LeaveMonth {
  return {
    ok: j.ok === true,
    reason: strOrNull(j.reason),
    message: strOrNull(j.message),
    counted: j.counted === true,
    closed: j.closed === true,
    provisional: j.provisional === true,
    ended: j.ended === true,
    employeeId: String(j.employee_id ?? ''),
    month: String(j.month ?? ''),
    opening: num(j.opening),
    accrued: num(j.accrued),
    available: num(j.available),
    leaveDays: num(j.leave_days),
    halfDays: num(j.half_days),
    lateCount: num(j.late_count),
    lateHalfDays: num(j.late_half_days),
    periodDays: num(j.period_days),
    periodPaid: num(j.period_paid),
    used: num(j.used),
    unpaidOverflow: num(j.unpaid_overflow),
    unpaidLeaveDays: num(j.unpaid_leave_days),
    absentDays: num(j.absent_days),
    unsettledDays: num(j.unsettled_days),
    closing: num(j.closing),
    unpaidDays: num(j.unpaid_days),
    choice: (strOrNull(j.choice) as LeaveChoice | null),
    payoutDays: numOrNull(j.payout_days),
    carried: numOrNull(j.carried),
    suggestedChoice: j.suggested_choice === 'carry' ? 'carry' : 'payout',
    closedAt: strOrNull(j.closed_at),
    fullName: strOrNull(j.full_name) ?? undefined,
    employeeCode: strOrNull(j.employee_code) ?? undefined,
  }
}

/** "2026-09-01" + 2 → "2026-11-01". Months, in UTC, from the 1st. */
export const addMonths = (monthIso: string, n: number): string => {
  const d = new Date(monthIso.slice(0, 7) + '-01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
export const firstOfMonth = (iso: string) => iso.slice(0, 7) + '-01'

/** 1.5 → "1.5", 2 → "2". A balance is days, and "2.0 days" reads like a meter. */
export const fmtDays = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toString()

export function emptyMonth(employeeId: string, month: string): LeaveMonth {
  return {
    ok: true, reason: null, message: null, counted: false, closed: false, provisional: false, ended: false,
    employeeId, month, opening: 0, accrued: 0, available: 0, leaveDays: 0, halfDays: 0, lateCount: 0,
    lateHalfDays: 0, periodDays: 0, periodPaid: 0, used: 0, unpaidOverflow: 0, unpaidLeaveDays: 0,
    absentDays: 0, unsettledDays: 0, closing: 0, unpaidDays: 0, choice: null, payoutDays: null,
    carried: null, suggestedChoice: 'payout', closedAt: null,
  }
}

/** Everything the demo mirror needs about ONE person. */
export interface LeaveCtx {
  employee: { id: string; dateOfJoining: string; lastWorkingDay: string | null }
  rows: AttendanceRow[]
  leaves: LeaveRequest[]
  holidays: Holiday[]
  settings: AttendanceSettings
  closed: LeaveMonth[]
  today: string
}

/** leave_month_summary(), in TypeScript. Demo mode only — see the top of the file. */
export function computeLeaveMonth(ctx: LeaveCtx, month: string, live = false): LeaveMonth {
  const { employee: e, settings: s, today } = ctx
  const mStart = firstOfMonth(month)
  const mEnd = monthEnd(mStart)
  const base = emptyMonth(e.id, mStart)
  const origin = s.leaveRulesStart > firstOfMonth(e.dateOfJoining) ? s.leaveRulesStart : firstOfMonth(e.dateOfJoining)

  if (mStart < origin || (e.lastWorkingDay && mStart > firstOfMonth(e.lastWorkingDay))) return base

  if (!live) {
    const c = ctx.closed.find((x) => x.month === mStart)
    if (c) return { ...c, closed: true, provisional: false, ended: mEnd < today, suggestedChoice: c.choice ?? 'payout' }
  }

  let opening = 0
  let provisional = false
  if (mStart > origin) {
    const prev = computeLeaveMonth(ctx, addMonths(mStart, -1))
    if (prev.closed) opening = prev.carried ?? 0
    else { opening = prev.closing; provisional = true }
  }

  const accrued = mStart >= addMonths(firstOfMonth(e.dateOfJoining), s.probationMonths) ? s.paidLeavePerMonth : 0

  const days = buildCalendar({
    from: mStart, to: mEnd, rows: ctx.rows, holidays: ctx.holidays, weekOffs: s.weekOffs,
    leaves: ctx.leaves, today, freeLates: s.freeLatesPerMonth,
    joinedOn: e.dateOfJoining, lastDay: e.lastWorkingDay,
  })

  let leaveDays = 0, halfDays = 0, lateCount = 0, lateHalfDays = 0
  let periodDays = 0, unpaidLeaveDays = 0, absentDays = 0, unsettledDays = 0
  const spend = (t: string | null) => {
    if (t === 'unpaid') unpaidLeaveDays++
    else if (t === 'period') periodDays++
    else leaveDays++
  }
  for (const d of days) {
    if (d.kind === 'outside') continue
    if (d.row) {
      const st = d.row.status
      if (d.lateNo !== null) lateCount++
      if (st === 'half_day') halfDays++
      else if (st === 'absent') absentDays++
      else if (st === 'missing_punch_out' || (st === 'in_progress' && d.date < today)) unsettledDays++
      else if (st === 'on_leave') spend(d.leaveType)
      if (d.lateHalf) { lateHalfDays++; halfDays++ }
      continue
    }
    if (d.kind === 'leave') spend(d.leaveType)
    else if (d.kind === 'absent') absentDays++
  }

  const periodPaid = Math.min(periodDays, s.periodLeavePerMonth)
  const demand = leaveDays + halfDays * 0.5 + (periodDays - periodPaid)
  const available = opening + accrued
  const used = Math.min(demand, available)
  const unpaidOverflow = demand - used
  const closing = available - used
  const last = ctx.closed.filter((c) => c.month < mStart).sort((a, b) => b.month.localeCompare(a.month))[0]

  return {
    ...base, counted: true, provisional, ended: mEnd < today,
    opening, accrued, available, leaveDays, halfDays, lateCount, lateHalfDays, periodDays, periodPaid,
    used, unpaidOverflow, unpaidLeaveDays, absentDays, unsettledDays, closing,
    unpaidDays: absentDays + unpaidLeaveDays + unpaidOverflow,
    suggestedChoice: last?.choice ?? 'payout',
  }
}

/** close_leave_month(), in TypeScript — the same refusals in the same order,
 *  so demo mode cannot show HR a close the real database would refuse. */
export function closeLeaveMonthDemo(ctx: LeaveCtx, month: string, choice: LeaveChoice, fullName: string): LeaveMonth {
  const mStart = firstOfMonth(month)
  const refuse = (reason: string, message: string): LeaveMonth => ({ ...emptyMonth(ctx.employee.id, mStart), ok: false, reason, message })
  const origin = ctx.settings.leaveRulesStart > firstOfMonth(ctx.employee.dateOfJoining)
    ? ctx.settings.leaveRulesStart : firstOfMonth(ctx.employee.dateOfJoining)
  const label = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })

  if (addMonths(mStart, 1) > ctx.today) return refuse('not_ended', 'A month can only be closed once it is over.')
  if (mStart < origin) return refuse('not_counted', `${label(mStart)} is before leave was counted for ${fullName}.`)
  const prevMonth = addMonths(mStart, -1)
  if (mStart > origin && !ctx.closed.some((c) => c.month === prevMonth)) {
    return refuse('previous_open', `Close ${label(prevMonth)} first — this month starts from what that one carried.`)
  }
  if (ctx.closed.some((c) => c.month === addMonths(mStart, 1))) {
    return refuse('next_closed', `${label(addMonths(mStart, 1))} is already closed, and it started from this month. It cannot change underneath it.`)
  }
  const sm = computeLeaveMonth(ctx, mStart, true)
  if (sm.unsettledDays > 0) {
    return refuse('unsettled', `${fullName} has ${sm.unsettledDays} day(s) with no punch-out in ${label(mStart)}. Settle them on the attendance screen first.`)
  }
  return {
    ...sm, closed: true, choice, unsettledDays: 0,
    payoutDays: choice === 'payout' ? sm.closing : 0,
    carried: choice === 'carry' ? sm.closing : 0,
    suggestedChoice: choice, closedAt: new Date().toISOString(),
  }
}
