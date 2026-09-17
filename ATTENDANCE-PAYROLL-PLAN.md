# Attendance → Leave → Payroll — the whole brief, written down

Adarsh dictated this on 2026-09-16 before sleeping. It is a **multi-round
build**, not one session. This file is the spec so nothing is lost; each round
ticks items off and CLAUDE.md records how.

**Ordering principle:** nothing here can be built on guesses about the rules.
The late-coming rule feeds the half-day rule, which feeds the paid-leave
balance, which feeds salary. So the rules engine comes before the salary
screen, and both come before the payslip email.

---

## What ALREADY exists (do not rebuild)

Checked against the live schema, not assumed:

| Asked for | Already there |
|---|---|
| 7-minute relaxation before "late" | `attendance_settings.grace_minutes`, default **7** |
| 9-hour full day | `attendance_settings.required_minutes`, default **540** |
| Half-day threshold | `attendance_settings.half_day_minutes`, default **270** |
| Sunday automatically off | `attendance_settings.week_offs`, default `{0}` |
| Holidays table + HR screen | Phase 7 — `holidays`, Leave → Holidays |
| Flexible shifts HR can create | `shifts` table, per-employee `shift_id` |
| Employee applies for leave | `LeaveRequestModal`, Member → Profile → Leave |
| HR approves/rejects leave | `LeaveDecisionModal`, leave approval flow |
| Passport photo | **The joining form already collects it** and approval copies it into `employee-documents` as `doc_type='photo'`. It exists — it is simply never displayed. |
| QR punch + button punch | `punch_by_qr()`, `punch_in()`, `punch_out()` — both proven live 31/31 |

**The gap is not data collection. It is display, the rules on top, and payroll.**

---

## Round 1 — the employee's own dashboard  ✓ DONE (05b2830, 21d8f7d, and the phone-table finish)

What an employee sees about themselves, on a phone, in one screen.

- [x] Profile header: **passport photo** (from `employee-documents`), full name,
      employee ID, department, designation
- [x] **Attendance table**, Excel-shaped: Date · Punch in · Punch out · Work
      duration · Remark
- [x] **Date-range filter** — "from where to where", his words. Default this
      month, quick ranges beside it
- [x] **Calendar grid of coloured squares** — the month at a glance:
      green = present · amber = late · red = absent · blue = leave ·
      grey `H` = holiday or week-off
- [x] Month summary stats including **late count**, present days, leave
      taken. *The per-day L1…Ln numbering is NOT shown yet — it only means
      something once Round 2's ladder exists (L5 → half day), so it lands
      with Round 2.*
- [x] Holidays and Sundays render as H automatically — they already exist in
      the DB, they just have to be joined into the row list

## Round 2 — the rules engine (migration)  ✓ DONE AND LIVE (410503f, confirmed on the real database 2026-09-17)

Nothing visible; everything after this depends on it.

- [x] **Late-coming ladder**: L1–L4 tolerated, the **5th late in a month
      becomes a half day** automatically. Each late day shows its number
      (L1, L2…) on the employee's own table and grid
- [x] A half day **costs 0.5 paid leave** (2.0 → 1.5)
- [x] **Paid leave accrual: 2 per month**, per employee
- [x] **Carry-forward vs encashment** — the employee's choice:
      - take the money → 2 unused days are **added to salary**, balance resets
      - carry forward → next month starts at **4**
      - HR records which one the employee chose
- [x] Leave applied but **not approved is not leave** — it must not deduct
- [x] Owner/HR screen to **see and change** every number above (grace minutes,
      full-day hours, lates-before-half-day, monthly paid leave). Adarsh was
      explicit: the owner must be able to change the criteria, not just read it.

**Migration `0022_leave_rules_engine.sql` — CONFIRMED live on the real
database, 2026-09-17.** Adarsh ran the extended `WHATS-INSTALLED.sql` and
pasted back all 29 rows: `leave_months`, `leave_month_summary()`,
`leave_month_board()` and `close_leave_month()` all read 1, both guard rows
(`employees DELETE policy`, `old office columns GONE`) correctly read 0.
Real leave numbers, not demo ones, are live on company.metrol.in now.

### Round 2 — ANSWERS, settled by Adarsh on 2026-09-16. Do NOT re-ask.

Asked after reading `public/metrol-media-terms-and-conditions.pdf`, which
agrees with the brief on 2 paid leaves/month, the 5th late = half day, and
pay-out vs carry-forward — and adds rules the brief never mentioned.

1. **6th, 7th… late in a month: EACH one is a half day.** Lates 1–4 free,
   every late after the 4th costs half a day.
2. **Absent with no approved leave = 1 day's salary.** Paid leave is NOT
   touched. Only leave HR approved spends paid leave. (T&C 3.3's "double-day
   deduction" is not automatic.)
3. **The T&C's extra rules — probation (3.9: no paid leave in the first 3
   months), same-day leave is unpaid (3.10), period leave (3.7: 1 paid day a
   month for women) — are HR's to manage, not automatic.** His words: "leave
   this on HR, HR can update and manage this in his leave rules or setting."
   So each is a switch/number in the rules screen, **off by default**.
4. **Pay-out pays EVERY unused day, and the balance goes back to 0.** Carried
   days are cashable later. (Carry Jan's 2 → Feb starts at 4 → pay-out in Feb
   pays 4 → March starts at 2.)

### The T&C disagrees with today's settings — HR's call, not code

- **What counts as late.** T&C 2.1/2.3: flexible 10:00–10:30, "late" after
  10:30 for everyone. The app: three shifts (09:30/10:00/10:30) + a 7-minute
  relaxation — Adarsh's own Phase 6 words. Both are expressible in settings
  already (one 10:30 shift, relaxation 0). Flag to HR; do not change it.

## Round 3 — QR-only mode  ✓ ALL FOUR SETTLED (36a2bce, 5999db9, and Adarsh's answer 2026-09-17)

- [x] Attendance settings gets **"QR only"** (`punch_methods`: both/button/qr,
      migration `0023`). Enforced **in the database** with a trigger, not just
      hidden in the UI — a hand-made call to `punch_in()` is refused the same
      as a click. Verified by Adarsh directly against the live database
      2026-09-17 (`WHATS-INSTALLED.sql`'s 0023 rows all came back present).
      The buttons disappear on the one screen that has them (`PunchCard.tsx`
      is the only punch surface in the app, so "everywhere" is satisfied by
      there being nowhere else to hide).
- [x] The member's punch card becomes **one big camera button** in QR-only
      mode — labelled "Scan to punch in" / "Scan to punch out" (brief said
      "check in/out"; same idea, not worth a re-ask).
- [x] **Check-out confirmation is now conditional on 9 hours** (2026-09-17,
      button path): short of the required minutes, the modal still asks
      exactly as before; a full day or longer punches out directly — no
      modal, the green confirmation line is the only feedback, same as every
      other punch. The QR path was already silent either way, by Phase 6b's
      own design (a poster scan is one tap, not a form), so it was left
      alone rather than adding a modal nobody asked for there.
- [x] **Manual timing correction STAYS with HR — Adarsh's answer, 2026-09-17,
      do NOT re-ask.** "Keep this for HR also. If I want to restrict
      anything, we restrict it from HR, right? Later, no issue." No code
      change: HR already has this, same as today. If he ever wants it
      narrowed, that is a later, separate ask — not assumed now.

## Round 4 — payroll from attendance  ✓ DONE (95c34e1, 2026-09-17)

- [x] Salary computed from the attendance month — `lib/payroll.ts`,
      "Compute from attendance" on the payslip form
- [x] **Two pay periods per month** (his "2 histograms") — one net amount,
      shown as a 1st–15th / 16th–end breakdown in the payslip's notes
- [x] Unused paid leave → money, per the choice recorded in Round 2 — reads
      `leave_month_summary()`'s `payout_days` directly, only once a month is
      closed and pay-out was chosen
- [x] Half days and absences deducted correctly — reads `unpaid_days`
      directly, same function
- [x] **Payslip emailed** by HR — `send-payslip-email` Edge Function, same
      Resend pattern as `approve-job-application`'s invite email; sent/resend
      tracked on `salary_records` (`payslip_sent_count`, `payslip_sent_at`)

Migration `0024_monthly_salary.sql` — two ALTER TABLE statements
(`employees.monthly_salary`, `salary_records.payslip_sent_count` /
`payslip_sent_at`), proven against a throwaway local Postgres cluster before
being handed to Adarsh: idempotent, rejects a negative salary, null and a
real value both accepted, new columns default correctly. **CONFIRMED live on
the real database, 2026-09-17** — Adarsh ran it directly in the Supabase SQL
editor and all three proof rows read back correct: `monthly_salary` column
present, both `salary_records` email-tracking columns present.

**Nobody has a monthly salary set yet.** The field exists and HR can fill it
in on the Edit employee form, but every current employee reads
`monthly_salary: null` until someone does — the payslip generator refuses to
compute from a number nobody entered, on purpose, rather than guessing from
0. The first real payslip needs this filled in first, same shape as "office
branches: 0" was after an earlier round.

### Round 4 — ANSWERS, settled by Adarsh on 2026-09-17. Do NOT re-ask.

1. **"Two pay periods" = ONE payslip, shown as two halves (1st–15th,
   16th–end) — not two separate payments.** His words: "anything we can
   upgrade later, so go with one payslip, simple as that." A real mid-month
   advance + month-end balance is a bigger, different build — explicitly
   deferred, not chosen.
2. **`employees` needs a persisted monthly salary — nothing stores this
   today.** HR currently retypes a fresh gross/net by hand every month
   (`salary_records`); Round 4 needs one base number to compute FROM. Add
   it, HR sets it once per employee, editable on a raise.
3. **HR still reviews and can adjust every computed figure before marking a
   payslip paid.** Nothing pays itself — this only removes the retyping, not
   the human check.
4. **Reuse `leave_month_summary()` (0022) for every deduction number —
   do not reinvent absence/half-day/leave-payout math.** Its `unpaid_days`
   field is already exactly "how many days' salary this person loses" and
   its `payout_days` (once a month is closed) is already exactly "how much
   unused leave becomes money." Round 4 is a thin layer on top of Round 2,
   not a new rules engine.
5. **Reuse `salary_records` (0010) as the payslip table — no new table.**
   Round 4 pre-fills its gross/net from the computation above; the existing
   Salary rail page, the employee's own read-only Salary tab, and Mark
   paid/Edit all keep working unchanged.

## Round 5 — Terms & Conditions in-app  ✓ DONE (04dfd61, 2026-09-17)

- [x] The T&C already exists as a generated PDF in `public/` (built from the
      printed document during the joining-form round). It needs to be a
      **readable page in the app**, not only a download on the apply form —
      `screens/sections/TermsAndConditions.tsx`, on HR's sidebar and every
      employee's own Profile → Terms tab. The text is transcribed by hand
      (`pdftotext -layout`, checked by eye), not parsed from the PDF at
      runtime, so a reprint of the PDF cannot silently change what this page
      says without someone noticing this file needs the same edit.
- [x] The leave/late rules it defines must agree with Round 2's numbers —
      **if the PDF and the settings disagree, that is a bug in one of them.**
      A live comparison table checks every number the T&C states against
      today's `attendance_settings` and says plainly which clauses match and
      which don't, as of 2026-09-17:
      - **Matches:** 4 free lates before a half day (2.3), 2 paid leaves a
        month (3.1), pay-out/carry-forward behaviour (3.4/3.5), the 6-day
        week (2.1), the 9-hour shift including lunch (2.1).
      - **Switched off, not a bug:** period leave (3.7, `period_leave_per_month`
        is 0), probation (3.9, `probation_months` is 0), same-day leave unpaid
        (3.10, `same_day_leave_unpaid` is false) — all three are HR's
        switches, deliberately off by default per Adarsh's 2026-09-16 answer.
      - **Deliberately different, not a bug:** the late-arrival window (2.3 —
        flagged since Round 2, HR's call) and 3.3's "double-day deduction"
        (settled 2026-09-16: an unapproved absence costs exactly 1 day's
        salary, not automatically two).

---

## Open question — asked, not assumed

**The punch-out QR bug.** Adarsh: "I scanned the QR code for punch-out and it
is not updated in the software." The RPC itself is correct — `punch_by_qr`'s
punch-out branch is proven live (31/31 geofence run) and the client refreshes
that day on `ok`. Two candidates, and they need his answer to tell apart:

1. **The 2-minute guard.** Scanning again within 2 minutes of punching in
   returns `too_soon` by design — "You just punched in. Scan again when you
   are leaving." If he was testing both scans back to back, this is it, and
   it is working as intended.
2. **The scan genuinely never decoded** — his words "not scanned completely"
   point this way. The camera bug fixed in `537e4bf` (the preview restarting
   every 30 seconds) would do exactly this.

**Do not "fix" this blind.** Ask which message he saw, if any.
