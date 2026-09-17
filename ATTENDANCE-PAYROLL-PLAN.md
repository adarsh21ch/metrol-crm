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

## Round 2 — the rules engine (migration)  ✓ DONE (410503f). NOT yet live — see below.

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

**Migration `0022_leave_rules_engine.sql`. As of 2026-09-17, install state on
the LIVE database is unconfirmed** — CLAUDE.md's own Round 2 entry said it was
not installed as of 2026-09-16, and nothing since has proven otherwise. Run
`WHATS-INSTALLED.sql` (updated this round to check it) to get a real answer.

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

## Round 3 — QR-only mode  ← HALF DONE (36a2bce). Two of four items open.

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
- [ ] **Check-out confirmation is NOT conditional on 9 hours.** Read the code
      2026-09-17: `onClick={() => setConfirming(true)}` opens the modal on
      EVERY punch-out — it changes its sentence once inside
      (`shortBy > 0` vs "Your full day is done"), but the brief asked for it
      to skip the modal entirely past 9 hours. Small, not built yet.
- [ ] Manual timing correction has **not** moved to owner-only. `HrAttendance`
      still opens `AttendanceEditModal` for HR the same as before this round —
      no gate checked, confirmed by reading the file 2026-09-17.

## Round 4 — payroll from attendance

- [ ] Salary computed from the attendance month
- [ ] **Two pay periods per month** (his "2 histograms")
- [ ] Unused paid leave → money, per the choice recorded in Round 2
- [ ] Half days and absences deducted correctly
- [ ] **Payslip emailed** by HR — Resend is already wired for invites, so the
      sending path exists

## Round 5 — Terms & Conditions in-app

- [ ] The T&C already exists as a generated PDF in `public/` (built from the
      printed document during the joining-form round). It needs to be a
      **readable page in the app**, not only a download on the apply form
- [ ] The leave/late rules it defines must agree with Round 2's numbers —
      **if the PDF and the settings disagree, that is a bug in one of them**

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
