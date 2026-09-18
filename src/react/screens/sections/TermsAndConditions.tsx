import { Chip } from '@/components/bits'
import type { AttendanceSettings } from '@/lib/attendance'

/** Round 5 of the attendance brief: the printed T&C
 *  (public/metrol-media-terms-and-conditions.pdf) as a readable page, not
 *  only a download on the apply form. The text below is transcribed from
 *  that PDF verbatim (pdftotext -layout, checked by eye) — it is not fetched
 *  at runtime, so a reprint of the PDF does not silently change what this
 *  page says; whoever edits the PDF edits this file to match.
 *
 *  "If the PDF and the settings disagree, that is a bug in one of them" —
 *  ATTENDANCE-PAYROLL-PLAN.md, Round 5. Below the text, `compareToSettings`
 *  checks the live `attendance_settings` row against every NUMBER the T&C
 *  states and says, plainly, whether today's database agrees. It does not
 *  decide which one is right — Adarsh's own answer on 2026-09-16 was that
 *  several of these are HR's to manage, not code's: this page's job is only
 *  to stop a disagreement from being invisible. */

type Verdict = 'match' | 'off' | 'mismatch' | 'policy'

interface Check {
  clause: string
  says: string
  settingLabel: string
  settingValue: string
  verdict: Verdict
  note?: string
}

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  match: { label: 'Matches', cls: 'chip--good' },
  off: { label: 'Switched off', cls: 'chip--warn' },
  mismatch: { label: 'Disagrees', cls: 'chip--bad' },
  // Not a bug — Adarsh's own decision that this clause is deliberately not
  // automatic. Grey like every other "this is a choice, not a failure" chip
  // in the app (EMP_STATUS.resigned, LEAVE_STATUS.cancelled).
  policy: { label: 'Deliberate — see note', cls: 'chip--mute' },
}

export function compareToSettings(s: AttendanceSettings | null): Check[] {
  if (!s) return []
  const weekOffsSunOnly = s.weekOffs.length === 1 && s.weekOffs[0] === 0
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return [
    {
      clause: '2.3 — Late arrival window',
      says: 'Flexible 10:00–10:30 AM; "Late" after 10:30 AM for everyone.',
      settingLabel: 'Shifts + grace period',
      settingValue: `${s.graceMinutes}-minute relaxation on each person's own shift start time`,
      verdict: 'policy',
      note: 'The app measures lateness against each person\'s assigned SHIFT (09:30 / 10:00 / 10:30) plus a grace period, not one flexible window for everyone. Both are expressible with a single 10:30 shift and 0 grace — this is HR\'s call, flagged since Round 2, not changed here.',
    },
    {
      clause: '2.3 — Free lates before a half day',
      says: '4 late arrivals free per month; the 5th is a half day.',
      settingLabel: 'Free lates per month',
      settingValue: String(s.freeLatesPerMonth),
      verdict: s.freeLatesPerMonth === 4 ? 'match' : 'mismatch',
    },
    {
      clause: '3.1 — Paid leave entitlement',
      says: '2 paid leaves per month.',
      settingLabel: 'Paid leave per month',
      settingValue: String(s.paidLeavePerMonth),
      verdict: s.paidLeavePerMonth === 2 ? 'match' : 'mismatch',
    },
    {
      clause: '3.3 — Leave without prior approval',
      says: 'May lead to double-day salary deduction and disciplinary review.',
      settingLabel: 'Absence deduction',
      settingValue: '1 day\'s salary per unapproved absence',
      verdict: 'policy',
      note: 'Settled on 2026-09-16: Adarsh\'s words were "leave this on HR" — the double-day figure is not automatic. An unapproved absence costs exactly 1 day\'s salary; a stronger deduction is a manual HR decision, not something this app enforces.',
    },
    {
      clause: '3.4 / 3.5 — Payout and carry-forward',
      says: 'Unused paid leave either pays out in full, or carries forward and stacks (Jan\'s 2 unused → Feb starts at 4).',
      settingLabel: 'Round 2 rules engine',
      settingValue: 'Pay-out pays every unused day and resets to 0; carry-forward adds the new accrual on top',
      verdict: 'match',
      note: 'Not a setting — this is how close_leave_month() (0022) always behaves, confirmed live 2026-09-17.',
    },
    {
      clause: '3.7 — Period leave',
      says: '1 fully paid period leave per month for female employees, not adjusted against the monthly leave balance.',
      settingLabel: 'Period leave per month',
      settingValue: s.periodLeavePerMonth > 0 ? `${s.periodLeavePerMonth} day(s), paid without touching the balance` : 'Off (0)',
      verdict: s.periodLeavePerMonth >= 1 ? 'match' : 'off',
      note: s.periodLeavePerMonth < 1 ? 'The T&C promises this leave; the switch in Attendance Settings is currently off, so nobody is receiving it automatically yet.' : undefined,
    },
    {
      clause: '3.9 — Leave during probation',
      says: 'No paid leave during the probation period (3 months, per §7).',
      settingLabel: 'Probation months',
      settingValue: s.probationMonths > 0 ? `${s.probationMonths} month(s) — no paid leave accrues` : 'Off (0)',
      verdict: s.probationMonths === 3 ? 'match' : s.probationMonths === 0 ? 'off' : 'mismatch',
      note: s.probationMonths === 0 ? 'The T&C says probation staff earn no paid leave; the switch is off, so new joiners are currently accruing leave from day one.' : undefined,
    },
    {
      clause: '2.4 / 3.10 — Same-day leave',
      says: 'A leave filed the same day is unpaid, even with balance available, unless HR approves a genuine emergency (or, per 3.7, a period leave).',
      settingLabel: 'Same-day leave unpaid',
      settingValue: s.sameDayLeaveUnpaid ? 'On' : 'Off',
      verdict: s.sameDayLeaveUnpaid ? 'match' : 'off',
      note: !s.sameDayLeaveUnpaid ? 'The switch is off, so HR\'s approval screen is not yet defaulting same-day requests to unpaid.' : undefined,
    },
    {
      clause: '2.1 — 6-day week',
      says: 'Standard working schedule is 6 days a week.',
      settingLabel: 'Week offs',
      settingValue: weekOffsSunOnly ? 'Sunday only' : s.weekOffs.map((d) => DOW[d] ?? d).join(', ') || 'None set',
      verdict: weekOffsSunOnly ? 'match' : 'mismatch',
    },
    {
      clause: '2.1 — 9-hour shift (incl. 1-hour lunch)',
      says: 'A full working shift is 9 hours, including a 1-hour lunch break.',
      settingLabel: 'Required minutes for a full day',
      settingValue: `${Math.round(s.requiredMinutes / 60 * 10) / 10} hours`,
      verdict: s.requiredMinutes === 540 ? 'match' : 'mismatch',
    },
  ]
}

export function TermsAndConditions({ settings }: { settings: AttendanceSettings | null }) {
  const checks = compareToSettings(settings)
  const disagreements = checks.filter((c) => c.verdict === 'mismatch' || c.verdict === 'off')

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      {/* THE LAYOUT LAW normally puts a page's one control on the title's own
          line — this title is the one place that doesn't fit: "Terms &
          Conditions of Employment" wraps to two lines well before 375px, so
          there is no single line left for the button to share. tc-head lets
          it wrap onto its own line below instead of fighting the title for
          the same row. */}
      <div className="section-head tc-head">
        <h1>Terms & Conditions of Employment</h1>
        <a className="btn btn--sm" href="/metrol-media-terms-and-conditions.pdf" target="_blank" rel="noreferrer">
          Download the PDF
        </a>
      </div>

      {settings ? (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Compared to today's live settings</h3>
          <p style={{ color: 'var(--ink-3)', marginTop: 0 }}>
            {disagreements.length === 0
              ? 'Every number below agrees with what the database is set to right now.'
              : `${disagreements.length} of ${checks.length} clauses below do not match what the database is set to right now — read each note before assuming either one is wrong.`}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {checks.map((c) => (
              <div key={c.clause} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{c.clause}</strong>
                  <Chip cls={VERDICT[c.verdict].cls}>{VERDICT[c.verdict].label}</Chip>
                </div>
                <p style={{ margin: '4px 0', color: 'var(--ink-2)' }}>T&C: {c.says}</p>
                <p style={{ margin: '4px 0', color: 'var(--ink-2)' }}>{c.settingLabel}: <strong>{c.settingValue}</strong></p>
                {c.note && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{c.note}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--ink-3)' }}>Live settings could not be loaded, so no comparison is shown below — the text of the T&C itself still is.</p>
      )}

      <TermsText />
    </div>
  )
}

/** The transcript. Headings match the printed document's own numbering so a
 *  clause referenced elsewhere in this app (T&C 3.7, 3.9, 3.10…) can be found
 *  here by that number. */
function TermsText() {
  return (
    <div className="prose" style={{ lineHeight: 1.6 }}>
      <h2>1. Employment Overview</h2>
      <p>Role, department, start date, location and employment type are as recorded on the employee's application form and appointment record.</p>

      <h2>2. Work Hours &amp; Attendance Policy</h2>
      <h3>2.1 Regular Working Hours (Flexible Timing)</h3>
      <p>The company follows a flexible timing policy between 10:00 AM to 10:30 AM. Employees may report to work anytime within this window; however, they must complete their 9-hour working shift, which includes a 1-hour lunch break. The standard working schedule remains 6 days a week.</p>
      <h3>2.2 Attendance Expectations</h3>
      <p>Employees are expected to report to work on time and maintain consistent attendance. Repeated tardiness or absenteeism without valid reasons may lead to disciplinary action.</p>
      <h3>2.3 Late Arrival</h3>
      <ul>
        <li>Arrival after 10:30 AM will be considered as "Late."</li>
        <li>Employees are allowed 4 late arrivals per month (with prior intimation).</li>
        <li>The 5th instance of being late will be considered a Half Day.</li>
        <li>Chronic tardiness may result in disciplinary or corrective action.</li>
      </ul>
      <h3>2.4 Absenteeism</h3>
      <ul>
        <li>All absences must be communicated in advance unless it is an emergency.</li>
        <li>If you miss work without prior notice, a written explanation is required upon return.</li>
        <li>Same-Day Leave Rule: If you inform about your leave on the same day, it will not be treated as a paid leave, even if you have leave balance available.</li>
        <li>Same-day leaves will be considered unpaid, unless there is a genuine emergency approved by HR.</li>
      </ul>

      <h2>3. Paid Leave &amp; Salary Adjustment Policy</h2>
      <h3>3.1 Paid Leave Entitlement</h3>
      <p>The company provides 2 paid leaves per month to every employee.</p>
      <h3>3.2 Leave Beyond Entitlement</h3>
      <p>If an employee takes more than 2 leaves in a month, the additional leaves will be considered unpaid, and salary deduction will be applied for each extra leave day.</p>
      <h3>3.3 Leave Without Prior Approval</h3>
      <p>Any leave taken without prior approval or without valid emergency communication may lead to double-day salary deduction and disciplinary review.</p>
      <h3>3.4 Unused Paid Leave Payout</h3>
      <p>If an employee does not utilize their 2 paid leaves in a month, the company will provide a paid leave payout, meaning the employee will receive the equivalent salary for the unused paid leave days in that month.</p>
      <h3>3.5 Carry Forward Clause</h3>
      <p>If you do not utilize your paid leaves, they will be carried forward and can be used later. Employees who opt for the Leave Carry Forward option may utilize only the leaves actually available in their leave balance at the time of application. For example, if an employee does not utilize the 2 paid leaves of January and they are carried forward, then by February the employee will have a total balance of 4 paid leaves, and can avail a maximum of 4 consecutive (wholesome) leave days only. Leave beyond the available balance will not be permitted.</p>
      <h3>3.6 Management Discretion</h3>
      <p>All leave approvals are subject to production schedules, team requirements, and management discretion.</p>
      <h3>3.7 Period Leave (For Female Employees)</h3>
      <ul>
        <li>Female employees are entitled to 1 Period Leave per month.</li>
        <li>This leave can be availed on any one day during the menstrual cycle, based on the employee's requirement.</li>
        <li>The Period Leave will be fully paid and will not be adjusted against the monthly leave balance.</li>
        <li>Prior intimation to HR or reporting manager is expected, but same-day information will be acceptable in such cases.</li>
      </ul>
      <h3>3.8 Public Holidays</h3>
      <p>Employees are entitled to all public holidays recognized by the company.</p>
      <h3>3.9 Leave During Probation</h3>
      <p>Employees are not entitled to any paid leaves during the probation period.</p>
      <h3>3.10 Same-Day Leave Rule</h3>
      <p>If an employee informs about their leave on the same day, it will not be considered as paid leave, even if they have leave balance available — except in genuine emergencies or period leave cases (for female employees) approved by HR.</p>

      <h2>4. Annual Performance Review</h2>
      <h3>4.1 Review Period</h3>
      <p>Salary increments are considered during the annual performance review cycle, which occurs yearly from the employee's joining date.</p>
      <h3>4.2 Performance Evaluation</h3>
      <p>Increment is based on performance, achievements, teamwork, and feedback from supervisors.</p>
      <h3>4.3 Increment Criteria</h3>
      <ul>
        <li>Meeting/exceeding job responsibilities.</li>
        <li>Positive feedback from management.</li>
        <li>Growth in skills and contribution to company goals.</li>
      </ul>
      <h3>4.4 No Automatic Increments</h3>
      <p>Increments are not automatic; they depend entirely on performance evaluation.</p>
      <h3>4.5 Impact of Leave &amp; Absence</h3>
      <p>Excessive unapproved leaves or absenteeism may impact increment eligibility.</p>

      <h2>5. Amendment of Policy</h2>
      <p>The company reserves the right to amend, modify, or update these policies at any time. Employees will be notified of such changes formally.</p>

      <h2>6. Workplace Conduct &amp; Code of Ethics</h2>
      <ul>
        <li>Employees must maintain professionalism, respect, and ethical behaviour.</li>
        <li>The company maintains a zero-tolerance policy for discrimination or harassment of any kind.</li>
      </ul>

      <h2>7. Termination &amp; Notice Period</h2>
      <ul>
        <li>Probation Period: First 3 months are probationary. During this period, either party may terminate employment with 15 days' notice.</li>
        <li>Post-Probation: Employees must provide 45 days' written notice before resignation.</li>
        <li>Full &amp; Final Settlement: Will be processed within 30–60 days after relieving. No benefits will be applicable during the notice period.</li>
        <li>Termination by Employer: The company may terminate employment for misconduct, underperformance, or violation of company policies.</li>
        <li>Exit Procedure: Employees must return all company property and complete the handover process.</li>
      </ul>

      <h2>8. Dispute Resolution</h2>
      <p>Employees should first try to resolve concerns with their supervisor. If unresolved, the matter may be escalated to HR.</p>

      <h2>9. Miscellaneous Provisions</h2>
      <ul>
        <li>Employees must take care of company property (laptop, camera, phone, etc.) and return all items during exit.</li>
        <li>The company reserves the right to amend terms and conditions with prior notice.</li>
      </ul>

      <h2>10. Employee Resignation</h2>
      <ul>
        <li>If any employee resigns and does not serve the required notice period, they will be considered as early exit.</li>
        <li>In case of early exit, the employee will not be eligible for payout of the last 45 days, regardless of salary or incentive accumulation.</li>
        <li>Employees exiting without completing the notice period will not receive Exit Clearance Documents, which includes: Experience Letter, Relieving Letter, Full &amp; Final Settlement, and any Pending Dues (including salary/incentive of last 45 days). Only after completion of the notice period and successful handover, exit documents will be released.</li>
      </ul>

      <h2>11. Confidentiality &amp; Non-Disclosure</h2>
      <p>Employees must protect confidential company information and may not share, disclose, or misuse it during or after employment.</p>

      <h2>12. Non-Compete &amp; Non-Solicitation</h2>
      <ul>
        <li>Employees shall not engage in or support any competing business during or after employment for the defined period.</li>
        <li>Employees must not solicit company employees, clients, or vendors for personal or competing purposes.</li>
      </ul>

      <p style={{ marginTop: 24, color: 'var(--ink-3)', fontSize: 13 }}>
        By submitting the joining application on company.metrol.in, the applicant confirms that they have read, understood and accepted these Terms &amp; Conditions of Employment.
      </p>
    </div>
  )
}
