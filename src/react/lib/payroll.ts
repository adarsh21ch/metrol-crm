/* Payroll phase 2 (2026-09-21) — replaces Round 4's computePayslip() with the
   formula from Adarsh's own working sheet, reverse-engineered from his row
   and confirmed back to him before any of this was written:

     perDay          = CTC monthly ÷ days in the calendar month
     paidDays        = days in month − days outside employment − unpaid days
     grossSalary     = perDay × (paidDays + leaveEncashmentDays)
     grossPayable    = grossSalary + incentive
     netGrossPayable = grossPayable − otherDeduction
     tdsAmount       = netGrossPayable × (tdsRatePercent ÷ 100), or 0 if none
     netPayable      = netGrossPayable − tdsAmount

   THE DATABASE IS STILL THE AUTHORITY for unpaidDays and leave-encashment
   days (leave_month_summary, 0022, and the leave_months close-the-month
   choice) — this file only turns those numbers into money. Incentive, other
   deduction and which TDS category applies are HR's own numbers for that
   month, typed in, not derived from anything.

   "One payslip, shown as two halves" (Adarsh, 2026-09-17) is unchanged: the
   halves below are a READING of the final net amount, not a second
   calculation — half1 + half2 must always equal netAmount exactly. */

import { fmtDays, firstOfMonth, type LeaveMonth } from './leaveRules'

export interface PayslipCalc {
  daysInMonth: number
  perDay: number
  /** Days outside this employment altogether this month — before joining or
   *  after the last working day. Kept apart from unpaidDays: one is "not
   *  employed yet", the other is "employed and did not earn the day". */
  daysOutsideEmployment: number
  unpaidDays: number
  paidDays: number
  leaveEncashmentDays: number
  leaveEncashmentAmount: number
  grossSalary: number
  incentive: number
  grossPayable: number
  otherDeduction: number
  netGrossPayable: number
  tdsRatePercent: number | null
  tdsAmount: number
  netAmount: number
  /** 1st–15th's share of netAmount. */
  half1: number
  /** 16th–end's share — always netAmount - half1, so the two always add up. */
  half2: number
  /** One line for the payslip's notes field: the whole computation, readable. */
  notes: string
}

const rupee = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const round2 = (n: number) => Math.round(n * 100) / 100

/** How many days this calendar month has. */
export function daysInCalendarMonth(monthISO: string): number {
  const mStart = firstOfMonth(monthISO)
  const y = Number(mStart.slice(0, 4))
  const mo = Number(mStart.slice(5, 7))
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

const daysBetweenInclusive = (a: string, b: string): number => {
  const d1 = new Date(a + 'T00:00:00Z')
  const d2 = new Date(b + 'T00:00:00Z')
  return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
}

/** Days this calendar month that fall before `joinedOn` or after `lastDay` —
 *  a person who joined mid-month must not be paid a full month's per-day
 *  rate for days nobody was expecting them. leave_month_summary already
 *  never WALKS these days (so unpaidDays never double-counts them); this is
 *  what makes the 31 in "27 of 31" honest for somebody who joined the 10th. */
export function daysOutsideEmployment(monthISO: string, joinedOn: string | null, lastDay: string | null): number {
  const mStart = firstOfMonth(monthISO)
  const mEnd = new Date(Date.UTC(Number(mStart.slice(0, 4)), Number(mStart.slice(5, 7)), 0)).toISOString().slice(0, 10)
  let before = 0
  let after = 0
  if (joinedOn && joinedOn > mStart) {
    const cappedJoin = joinedOn > mEnd ? mEnd : joinedOn
    before = daysBetweenInclusive(mStart, cappedJoin) - 1
  }
  if (lastDay && lastDay < mEnd) {
    const cappedLast = lastDay < mStart ? mStart : lastDay
    after = daysBetweenInclusive(cappedLast, mEnd) - 1
  }
  return Math.max(0, before) + Math.max(0, after)
}

/** One person's payslip for one month.
 *
 *  `lm` is exactly what leave_month_summary returned for that employee and
 *  month. `ctcMonthly` is employees.monthly_salary (0024) — the caller must
 *  already have refused to call this when it is null. `incentive` and
 *  `otherDeduction` are HR's own figures for this month, default 0.
 *  `tdsRatePercent` is the employee's assigned TDS category's rate, or null
 *  when none is assigned — which is how "no TDS for this person" reads. */
export function computePayslip(
  ctcMonthly: number, monthISO: string, lm: LeaveMonth,
  opts: {
    joinedOn?: string | null
    lastDay?: string | null
    incentive?: number
    otherDeduction?: number
    tdsRatePercent?: number | null
  } = {},
): PayslipCalc {
  const daysInMonth = daysInCalendarMonth(monthISO)
  const perDay = ctcMonthly / daysInMonth
  const outside = daysOutsideEmployment(monthISO, opts.joinedOn ?? null, opts.lastDay ?? null)

  const unpaidDays = lm.unpaidDays
  const paidDays = Math.max(0, daysInMonth - outside - unpaidDays)

  // Leave encashment: only once the month is CLOSED and HR (or the employee,
  // via the choice HR records) picked pay-out over carry-forward — a running
  // month has decided nothing yet, so this is 0 until then, same rule the
  // old payoutAmount used.
  const leaveEncashmentDays = lm.closed && lm.choice === 'payout' ? (lm.payoutDays ?? 0) : 0
  const leaveEncashmentAmount = round2(leaveEncashmentDays * perDay)

  const grossSalary = round2(perDay * (paidDays + leaveEncashmentDays))
  const incentive = round2(opts.incentive ?? 0)
  const grossPayable = round2(grossSalary + incentive)
  const otherDeduction = round2(opts.otherDeduction ?? 0)
  const netGrossPayable = round2(grossPayable - otherDeduction)
  const tdsRatePercent = opts.tdsRatePercent ?? null
  const tdsAmount = tdsRatePercent ? round2(netGrossPayable * (tdsRatePercent / 100)) : 0
  const netAmount = round2(netGrossPayable - tdsAmount)

  const half1Days = Math.min(15, daysInMonth)
  const half1 = round2(netAmount * (half1Days / daysInMonth))
  const half2 = round2(netAmount - half1)

  const bits = [
    `${fmtDays(paidDays)} paid day(s) of ${daysInMonth} @ ${rupee(perDay)}/day = ${rupee(grossSalary)}`,
  ]
  if (leaveEncashmentDays > 0) bits.push(`+ leave encashment ${fmtDays(leaveEncashmentDays)} day(s) ${rupee(leaveEncashmentAmount)}`)
  if (incentive > 0) bits.push(`+ incentive ${rupee(incentive)}`)
  if (otherDeduction > 0) bits.push(`− other deduction ${rupee(otherDeduction)}`)
  if (tdsAmount > 0) bits.push(`− TDS ${rupee(tdsAmount)}`)
  bits.push(`1st–15th ${rupee(half1)} · 16th–${daysInMonth}th ${rupee(half2)}`)
  const notes = bits.join(' · ')

  return {
    daysInMonth, perDay, daysOutsideEmployment: outside, unpaidDays, paidDays,
    leaveEncashmentDays, leaveEncashmentAmount, grossSalary, incentive, grossPayable,
    otherDeduction, netGrossPayable, tdsRatePercent, tdsAmount, netAmount, half1, half2, notes,
  }
}
