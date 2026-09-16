import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { money } from '@/lib/format'
import { EMPLOYMENT, fmtDate, todayISO, type EmploymentType, type JobApplication } from '@/lib/hr'
import { fmtShift, type OfficeLocation, type Shift } from '@/lib/attendance'
import type { ApprovalDetails } from '@/data/useJobApplications'
import type { Department } from '@/lib/types'

/** One label / value pair, the same shape HrPage uses on an employee's own
 *  record — an application is read the same way, so it looks the same. */
const Fld = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="hr-fld"><div className="l">{l}</div><div className="v">{v || '—'}</div></div>
)

const DOCS: { key: keyof Pick<JobApplication, 'photoPath' | 'panPath' | 'aadhaarPath' | 'bankProofPath' | 'relievingLetterPath'>; label: string }[] = [
  { key: 'photoPath', label: 'Photo' },
  { key: 'panPath', label: 'PAN card' },
  { key: 'aadhaarPath', label: 'Aadhaar card' },
  { key: 'bankProofPath', label: 'Bank proof' },
  { key: 'relievingLetterPath', label: 'Relieving letter' },
]

/**
 * Review one application. Approve calls the Edge Function (creates the login
 * — cannot be done from here directly, see 0017 / approve-job-application);
 * reject is a plain status update HR is allowed to make on their own.
 *
 * The fields collected here are exactly what Adarsh said HR fills at
 * approval, not the candidate: department, designation, employment type,
 * branch, shift, joining date, salary, leave entitlement.
 */
export function ApplicationReviewModal({
  app, departments, shifts, offices, documentUrl, onClose, onApprove, onReject, onResend, onDelete,
}: {
  app: JobApplication
  departments: Department[]
  shifts: Shift[]
  offices: OfficeLocation[]
  documentUrl: (path: string | null) => Promise<string | null>
  onClose: () => void
  onApprove: (details: ApprovalDetails) => Promise<string | null>
  onReject: (note: string) => Promise<string | null>
  onResend: () => Promise<string | null>
  onDelete: () => Promise<string | null>
}) {
  // 'approve-details' then 'approve-confirm' were one screen until Adarsh
  // pointed out why that read as broken: clicking "Approve…" dropped a form
  // in BELOW everything already on screen, so confirming it meant scrolling
  // down to find a second, differently-worded button — which looked like the
  // click hadn't registered the first time. Two named steps with their own
  // Continue / Back fixes that: you always know which of the two things you
  // are doing, and the footer's one button always matches it.
  const [mode, setMode] = useState<'view' | 'approve-details' | 'approve-confirm' | 'reject'>('view')
  // ONE shared `busy` boolean used to drive FOUR unrelated buttons' labels —
  // Delete, Reject, Resend and Approve all read the same flag, so pressing
  // any one of them flipped every OTHER button's text too: click "Send
  // invite email" and "Delete application" changed to "Deleting…" right next
  // to it, with nothing actually being deleted. Adarsh saw exactly that and
  // described it as both buttons "pressing continuously" — which one action
  // is running is now its own piece of state, not a boolean every button
  // reinterprets as being about itself. `action !== null` still disables
  // every button (two of these should never overlap — approving and
  // deleting the same application at once is not a state worth allowing),
  // but only the button whose OWN action matches shows a busy label.
  const [action, setAction] = useState<'approve' | 'delete' | 'reject' | 'resend' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [designation, setDesignation] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time')
  const [officeId, setOfficeId] = useState<string | null>(null)
  const [shiftId, setShiftId] = useState<string | null>(null)
  const [dateOfJoining, setDateOfJoining] = useState(todayISO())
  const [gross, setGross] = useState('')
  const [net, setNet] = useState('')

  const view = async (path: string | null) => {
    if (!path) return
    const url = await documentUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else setErr('Could not open that file.')
  }

  const continueApprove = () => {
    if (!designation.trim() || !dateOfJoining) { setErr('Designation and date of joining are required.'); return }
    setErr(null)
    setMode('approve-confirm')
  }

  const submitApprove = async () => {
    setAction('approve'); setErr(null)
    const message = await onApprove({
      departmentId, designation: designation.trim(), employmentType, officeId, shiftId, dateOfJoining,
      grossAmount: Number(gross) || 0, netAmount: Number(net) || 0,
    })
    setAction(null)
    if (message) { setErr(message); return }
    onClose()
  }

  const submitDelete = async () => {
    if (!window.confirm(`Delete ${app.fullName}'s application? This removes it and its documents for good.`)) return
    setAction('delete'); setErr(null)
    const message = await onDelete()
    setAction(null)
    if (message) { setErr(message); return }
    onClose()
  }

  const submitReject = async () => {
    setAction('reject'); setErr(null)
    const message = await onReject(note.trim())
    setAction(null)
    if (message) { setErr(message); return }
    onClose()
  }

  const submitResend = async () => {
    setAction('resend'); setErr(null)
    const message = await onResend()
    setAction(null)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      wide
      title={app.fullName}
      sub={app.positionInterest || 'No position specified'}
      onClose={onClose}
      foot={
        <>
          {err && <span className="auth-err" style={{ marginRight: 'auto' }}>{err}</span>}
          {/* Delete lives here, not beside Reject — it is a different KIND of
              action (remove the record, not decide on it) and stays available
              at any status, which is exactly what cleaning up a test entry
              needs regardless of whether it was ever actioned. Kept out of
              the way on the far left, .btn--danger's red the only thing that
              marks it as different from Close next to it. */}
          {mode === 'view' && (
            <>
              <button className="btn btn--sm btn--danger" disabled={action !== null} onClick={() => void submitDelete()}>
                {action === 'delete' ? 'Deleting…' : 'Delete application'}
              </button>
              {/* .modal-foot is justify-content:flex-end — every button is
                  already hard right, so it takes an auto margin HERE to push
                  Delete away from the others. Without it the destructive
                  button sits touching Close, which is the one neighbour it
                  must never have. The spacer renders only in this mode: an
                  empty span still earns the foot's 8px gap, and a stray 8px
                  before Close on the approve screens is a change nobody
                  asked for. */}
              <span style={{ marginLeft: 'auto' }} />
            </>
          )}
          <button className="btn btn--sm" onClick={mode === 'approve-confirm' ? () => setMode('approve-details') : onClose} disabled={action !== null}>
            {mode === 'approve-confirm' ? 'Back' : 'Close'}
          </button>
          {mode === 'view' && app.status === 'pending' && (
            <>
              <button className="btn btn--sm" onClick={() => setMode('reject')}>Reject</button>
              <button className="btn btn--sm btn--primary" onClick={() => setMode('approve-details')}>Approve…</button>
            </>
          )}
          {mode === 'view' && app.status === 'approved' && (
            <button className="btn btn--sm btn--primary" disabled={action !== null} onClick={() => void submitResend()}>
              {action === 'resend' ? 'Sending…' : app.inviteSentCount > 0 ? 'Resend invite email' : 'Send invite email'}
            </button>
          )}
          {mode === 'reject' && (
            <button className="btn btn--sm btn--primary" disabled={action !== null} onClick={() => void submitReject()}>
              {action === 'reject' ? 'Rejecting…' : 'Confirm reject'}
            </button>
          )}
          {mode === 'approve-details' && (
            <button className="btn btn--sm btn--primary" onClick={continueApprove}>Continue →</button>
          )}
          {mode === 'approve-confirm' && (
            <button className="btn btn--sm btn--primary" disabled={action !== null} onClick={() => void submitApprove()}>
              {action === 'approve' ? 'Approving…' : 'Approve and create login'}
            </button>
          )}
        </>
      }
    >
      <div className="auth-form">
        {/* The whole candidate dump steps ASIDE during both approve steps —
            it is what buried the form below a page of scrolling before.
            Nothing here disappears: Back returns to it exactly as it was. */}
        {mode !== 'approve-details' && mode !== 'approve-confirm' && (<>
        {/* Everything the applicant filled in, in the order the paper form
            asks for it — HR is usually reading this next to the physical
            file, so matching that order is what makes it checkable. Empty
            fields render an em dash rather than vanishing, because "they
            left it blank" is itself something HR needs to see. */}
        <div className="rev-sec">Personal</div>
        <div className="hr-fields">
          <Fld l="Father's / husband's name" v={app.fatherOrHusband} />
          <Fld l="Gender" v={app.gender} />
          <Fld l="Date of birth" v={app.dateOfBirth ? fmtDate(app.dateOfBirth) : ''} />
          <Fld l="Place of birth" v={app.placeOfBirth} />
          <Fld l="Nationality" v={app.nationality} />
          <Fld l="Religion" v={app.religion} />
          <Fld l="Marital status" v={app.maritalStatus} />
          <Fld l="Dependents" v={app.dependents} />
          <Fld l="Aadhaar number" v={app.aadhaarNumber} />
        </div>

        <div className="rev-sec">Contact &amp; address</div>
        <div className="hr-fields">
          <Fld l="Phone" v={app.phone} />
          <Fld l="Email" v={app.email} />
          <Fld l="Pincode" v={app.pincode} />
          <Fld l="Present address" v={app.presentAddress} />
          <Fld l="Permanent address" v={app.permanentAddress} />
        </div>

        {app.education.length > 0 && (
          <>
            <div className="rev-sec">Education</div>
            <div className="ov-actions">
              {app.education.map((e, i) => (
                <div className="ov-row" key={i} style={{ cursor: 'default' }}>
                  <span className="ov-l">
                    <strong>{e.examination || '—'}</strong>
                    <span style={{ color: 'var(--ink-3)' }}>
                      {e.institution ? '  ·  ' + e.institution : ''}
                      {e.year ? '  ·  ' + e.year : ''}
                      {e.marks ? '  ·  ' + e.marks : ''}
                      {e.subjects ? '  ·  ' + e.subjects : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {app.technicalQualification && (
          <div className="field"><label>Technical qualification</label><div className="v">{app.technicalQualification}</div></div>
        )}

        <div className="rev-sec">Work history</div>
        {app.noPreviousEmployment ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>No previous employer — fresher.</p>
        ) : app.employmentHistory.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Nothing entered.</p>
        ) : (
          <div className="ov-actions">
            {app.employmentHistory.map((e, i) => (
              <div className="ov-row" key={i} style={{ cursor: 'default' }}>
                <span className="ov-l">
                  <strong>{e.company || '—'}</strong>
                  <span style={{ color: 'var(--ink-3)' }}>
                    {e.designation ? '  ·  ' + e.designation : ''}
                    {e.from || e.to ? '  ·  ' + e.from + ' – ' + e.to : ''}
                    {e.grossSalary ? '  ·  ' + e.grossSalary : ''}
                    {e.reason ? '  ·  left: ' + e.reason : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="rev-sec">Bank</div>
        <div className="hr-fields">
          <Fld l="Bank name" v={app.bankName} />
          <Fld l="Name as on document" v={app.bankAccountName} />
          <Fld l="Account number" v={app.bankAccountNo} />
          <Fld l="IFSC" v={app.bankIfsc} />
        </div>

        {app.languages.length > 0 && (
          <>
            <div className="rev-sec">Languages</div>
            <div className="hr-soon">
              {app.languages.map((l, i) => {
                const can = [l.understand && 'understands', l.speak && 'speaks', l.read && 'reads', l.write && 'writes']
                  .filter(Boolean).join(', ')
                return <Chip key={i} cls="chip--mute">{l.language}{can ? ' — ' + can : ''}</Chip>
              })}
            </div>
          </>
        )}

        {(app.referenceName || app.referenceDepartment) && (
          <>
            <div className="rev-sec">Reference</div>
            <div className="hr-fields">
              <Fld l="Name" v={app.referenceName} />
              <Fld l="Department" v={app.referenceDepartment} />
            </div>
          </>
        )}

        <div className="rev-sec">Declaration &amp; terms</div>
        <div className="hr-fields">
          <Fld l="Declaration accepted" v={app.declarationAcceptedAt ? fmtDate(app.declarationAcceptedAt.slice(0, 10)) : 'Not accepted'} />
          <Fld l="Terms accepted" v={app.termsAcceptedAt ? fmtDate(app.termsAcceptedAt.slice(0, 10)) : 'Not accepted'} />
        </div>

        <div className="rev-sec">Documents</div>
        <div className="field">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DOCS.map((d) => (
              <button key={d.key} type="button" className="btn btn--sm" disabled={!app[d.key]}
                      onClick={() => void view(app[d.key])}>
                {d.label}{!app[d.key] ? ' (not required)' : ''}
              </button>
            ))}
          </div>
        </div>

        {app.status !== 'pending' && (
          <div className="field">
            <label>Decision</label>
            <div className="v">
              {app.status === 'approved' ? 'Approved' : 'Rejected'}
              {app.decisionNote ? ` — ${app.decisionNote}` : ''}
              {app.inviteSentCount > 0 ? ` · invite emailed ${app.inviteSentCount > 1 ? app.inviteSentCount + ' times' : 'once'}` : ''}
            </div>
          </div>
        )}
        </>)}

        {mode === 'reject' && (
          <div className="field">
            <label htmlFor="arNote">Reason (kept for HR's records only)</label>
            <textarea className="input" id="arNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        {mode === 'approve-details' && (
          <>
            <div className="rev-sec">Step 1 of 2 — Role details</div>
            <div className="field">
              <label htmlFor="arDept">Department</label>
              <select className="input" id="arDept" value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value || null)}>
                <option value="">Choose one</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="arDesig">Designation</label>
              <input className="input" id="arDesig" value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="arType">Employment type</label>
              <select className="input" id="arType" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
                {Object.entries(EMPLOYMENT).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="arJoin">Date of joining</label>
              <input className="input" id="arJoin" type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="arOffice">Branch</label>
              <select className="input" id="arOffice" value={officeId ?? ''} onChange={(e) => setOfficeId(e.target.value || null)}>
                <option value="">Not assigned</option>
                {offices.filter((o) => o.isActive).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="arShift">Shift</label>
              <select className="input" id="arShift" value={shiftId ?? ''} onChange={(e) => setShiftId(e.target.value || null)}>
                <option value="">Not scheduled</option>
                {shifts.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name} — {fmtShift(s.startsAt)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="arGross">Gross salary (₹/month)</label>
              <input className="input" id="arGross" type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="arNet">Net salary (₹/month)</label>
              <input className="input" id="arNet" type="number" min={0} value={net} onChange={(e) => setNet(e.target.value)} placeholder="Optional" />
            </div>
          </>
        )}

        {mode === 'approve-confirm' && (
          <>
            <div className="rev-sec">Step 2 of 2 — Confirm &amp; approve</div>
            {/* A recap, not the form again — the point of a second step is
                that it asks something DIFFERENT ("is this right?"), not the
                same question with the same fields still sitting there. */}
            <div className="hr-fields">
              <Fld l="Name" v={app.fullName} />
              <Fld l="Department" v={departments.find((d) => d.id === departmentId)?.name} />
              <Fld l="Designation" v={designation} />
              <Fld l="Employment type" v={EMPLOYMENT[employmentType]} />
              <Fld l="Date of joining" v={fmtDate(dateOfJoining)} />
              <Fld l="Branch" v={offices.find((o) => o.id === officeId)?.name} />
              <Fld l="Shift" v={shifts.find((s) => s.id === shiftId) ? `${shifts.find((s) => s.id === shiftId)!.name} — ${fmtShift(shifts.find((s) => s.id === shiftId)!.startsAt)}` : undefined} />
              {/* money(), not the raw input string — this line is the last
                  look anybody gets at a salary before it becomes a real
                  payroll figure, and ₹32000 is measurably harder to check at
                  a glance than ₹32,000. The same formatter the payslip grid
                  and every KPI already use, so the number reads identically
                  here and on the record it creates. */}
              <Fld l="Gross salary" v={gross ? `${money(Number(gross))}/month` : undefined} />
              <Fld l="Net salary" v={net ? `${money(Number(net))}/month` : undefined} />
            </div>
            <p style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              This creates their login and sends them an email to set a password, using the address they applied with.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
