import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { EMPLOYMENT, todayISO, type EmploymentType, type JobApplication } from '@/lib/hr'
import { fmtShift, type OfficeLocation, type Shift } from '@/lib/attendance'
import type { ApprovalDetails } from '@/data/useJobApplications'
import type { Department } from '@/lib/types'

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
  app, departments, shifts, offices, documentUrl, onClose, onApprove, onReject, onResend,
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
}) {
  const [mode, setMode] = useState<'view' | 'approve' | 'reject'>('view')
  const [busy, setBusy] = useState(false)
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
  const [annualLeaveDays, setAnnualLeaveDays] = useState(18)

  const view = async (path: string | null) => {
    if (!path) return
    const url = await documentUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else setErr('Could not open that file.')
  }

  const submitApprove = async () => {
    if (!designation.trim() || !dateOfJoining) { setErr('Designation and date of joining are required.'); return }
    setBusy(true); setErr(null)
    const message = await onApprove({
      departmentId, designation: designation.trim(), employmentType, officeId, shiftId, dateOfJoining,
      grossAmount: Number(gross) || 0, netAmount: Number(net) || 0, annualLeaveDays,
    })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  const submitReject = async () => {
    setBusy(true); setErr(null)
    const message = await onReject(note.trim())
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  const submitResend = async () => {
    setBusy(true); setErr(null)
    const message = await onResend()
    setBusy(false)
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
          <button className="btn btn--sm" onClick={onClose}>Close</button>
          {mode === 'view' && app.status === 'pending' && (
            <>
              <button className="btn btn--sm" onClick={() => setMode('reject')}>Reject</button>
              <button className="btn btn--sm btn--primary" onClick={() => setMode('approve')}>Approve…</button>
            </>
          )}
          {mode === 'view' && app.status === 'approved' && (
            <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void submitResend()}>
              {busy ? 'Sending…' : app.inviteSentCount > 0 ? 'Resend invite email' : 'Send invite email'}
            </button>
          )}
          {mode === 'reject' && (
            <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void submitReject()}>
              {busy ? 'Rejecting…' : 'Confirm reject'}
            </button>
          )}
          {mode === 'approve' && (
            <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void submitApprove()}>
              {busy ? 'Approving…' : 'Approve and create login'}
            </button>
          )}
        </>
      }
    >
      <div className="auth-form">
        <div className="field"><label>Phone</label><div className="v">{app.phone || '—'}</div></div>
        <div className="field"><label>Email</label><div className="v">{app.email}</div></div>
        {app.noPreviousEmployment && (
          <div className="field"><label>Note</label><div className="v">No previous employer — fresher.</div></div>
        )}
        <div className="field">
          <label>Documents</label>
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

        {mode === 'reject' && (
          <div className="field">
            <label htmlFor="arNote">Reason (kept for HR's records only)</label>
            <textarea className="input" id="arNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        {mode === 'approve' && (
          <>
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
            <div className="field">
              <label htmlFor="arLeave">Annual leave days</label>
              <input className="input" id="arLeave" type="number" min={0} step={0.5} value={annualLeaveDays}
                     onChange={(e) => setAnnualLeaveDays(Number(e.target.value) || 0)} />
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
