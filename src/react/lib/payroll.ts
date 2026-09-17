/* Round 4 of the attendance brief: a payslip's numbers, computed FROM the
   employee's monthly salary (0024) and the leave rules engine's own month
   (leave_month_summary, 0022) — never re-derived from attendance directly.
   THE DATABASE IS STILL THE AUTHORITY for unpaidDays and payoutDays; this
   file only turns those two numbers into money, and money into a payslip's
   shape: one gross/net pair, plus a two-half breakdown for display.

   Adarsh's answer, 2026-09-17: "one payslip, shown as two halves — not two
   separate payments." So the halves below are a READING of one net amount,
   proportioned by calendar days (15 vs the rest of the month) — not a second
   independent calculation. If the two ever looked unrelated, that would be
   the bug: half1 + half2 must always equal netAmount exactly. */

import { fmtDays, firstOfMonth, type LeaveMonth } from './leaveRules'

export interface PayslipCalc {
  daysInMonth: number
  perDay: number
  unpaidDays: number
  deduction: number
  payoutDays: number
  payoutAmount: number
  grossAmount: number
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

/** How many days this calendar month has — the same "per day" every payslip
 *  in that month is measured against, so a half's share of a 30-day month and
 *  a 31-day month are not silently treated as the same fraction. */
export function daysInCalendarMonth(monthISO: string): number {
  const mStart = firstOfMonth(monthISO)
  const y = Number(mStart.slice(0, 4))
  const mo = Number(mStart.slice(5, 7))
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** One person's payslip for one month. `lm` is exactly what leave_month_summary
 *  returned for that employee and month — closed (choice/payoutDays decided)
 *  or still running (payoutDays not decided yet, so nothing is paid out until
 *  HR closes the month). `monthlySalary` is 0024's number; the caller must
 *  already have refused to call this when it is null. */
export function computePayslip(monthlySalary: number, monthISO: string, lm: LeaveMonth): PayslipCalc {
  const daysInMonth = daysInCalendarMonth(monthISO)
  const perDay = monthlySalary / daysInMonth

  const unpaidDays = lm.unpaidDays
  const deduction = round2(unpaidDays * perDay)

  // Payout is only ever a real number once the month is CLOSED and HR chose
  // pay-out — a running month's payoutDays is null (nobody has decided yet),
  // and carry-forward pays nothing this month by design (0022).
  const payoutDays = lm.closed && lm.choice === 'payout' ? (lm.payoutDays ?? 0) : 0
  const payoutAmount = round2(payoutDays * perDay)

  const grossAmount = round2(monthlySalary)
  const netAmount = round2(monthlySalary - deduction + payoutAmount)

  const half1Days = Math.min(15, daysInMonth)
  const half1 = round2(netAmount * (half1Days / daysInMonth))
  const half2 = round2(netAmount - half1)

  const bits = [
    `1st–15th ${rupee(half1)}`,
    `16th–${daysInMonth}th ${rupee(half2)}`,
    `Base ${rupee(monthlySalary)}`,
  ]
  if (unpaidDays > 0) bits.push(`− ${fmtDays(unpaidDays)} unpaid day(s) ${rupee(deduction)}`)
  if (payoutAmount > 0) bits.push(`+ leave payout ${fmtDays(payoutDays)} day(s) ${rupee(payoutAmount)}`)
  const notes = bits.join(' · ')

  return { daysInMonth, perDay, unpaidDays, deduction, payoutDays, payoutAmount, grossAmount, netAmount, half1, half2, notes }
}
