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

## Round 1 — the employee's own dashboard  ← THIS ROUND

What an employee sees about themselves, on a phone, in one screen.

- [ ] Profile header: **passport photo** (from `employee-documents`), full name,
      employee ID, department, designation
- [ ] **Attendance table**, Excel-shaped: Date · Punch in · Punch out · Work
      duration · Remark
- [ ] **Date-range filter** — "from where to where", his words. Default this
      month, quick ranges beside it
- [ ] **Calendar grid of coloured squares** — the month at a glance:
      green = present · amber = late · red = absent · blue = leave ·
      grey `H` = holiday or week-off
- [ ] Month summary stats including **late count** (L1…Ln), present days,
      leave taken
- [ ] Holidays and Sundays render as H automatically — they already exist in
      the DB, they just have to be joined into the row list

## Round 2 — the rules engine (migration)

Nothing visible; everything after this depends on it.

- [ ] **Late-coming ladder**: L1–L4 tolerated, the **5th late in a month
      becomes a half day** automatically
- [ ] A half day **costs 0.5 paid leave** (2.0 → 1.5)
- [ ] **Paid leave accrual: 2 per month**, per employee
- [ ] **Carry-forward vs encashment** — the employee's choice:
      - take the money → 2 unused days are **added to salary**, balance resets
      - carry forward → next month starts at **4**
      - HR records which one the employee chose
- [ ] Leave applied but **not approved is not leave** — it must not deduct
- [ ] Owner/HR screen to **see and change** every number above (grace minutes,
      full-day hours, lates-before-half-day, monthly paid leave). Adarsh was
      explicit: the owner must be able to change the criteria, not just read it.

## Round 3 — QR-only mode

- [ ] Attendance settings gets **"QR only"**. When on, the punch-in/punch-out
      buttons disappear **everywhere in the app**, not just on one screen
- [ ] The member's punch card becomes **one big camera button** —
      "Scan to check in" / "Scan to check out"
- [ ] **Check-out confirmation**: after 9 hours, accept silently. Before 9
      hours, ask — "You have only worked N hours. Check out anyway?"
- [ ] Manual timing correction stays, but moves to the **owner** rather than HR

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
