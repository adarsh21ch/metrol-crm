import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { currentPeriod, fmtPeriod, type SalaryRecord } from '@/lib/hr'
import type { SalaryDraft } from '@/data/useSalaryRecords'

/** Add or correct one payslip. There is no status control here — a new one
 *  always starts pending, and "paid" is a separate one-click action on the
 *  list (see HrPage) rather than a field in this form. */
export function SalaryRecordModal({
  employeeId, record, onClose, onSave,
}: {
  employeeId: string
  /** null adds a new payslip for this employee's month. */
  record: SalaryRecord | null
  onClose: () => void
  onSave: (draft: SalaryDraft) => Promise<string | null>
}) {
  const [period, setPeriod] = useState(record?.period ?? currentPeriod())
  const [gross, setGross] = useState(String(record?.grossAmount ?? ''))
  const [net, setNet] = useState(String(record?.netAmount ?? ''))
  const [notes, setNotes] = useState(record?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const grossN = Number(gross)
  const netN = Number(net)
  const valid = gross !== '' && net !== '' && !Number.isNaN(grossN) && !Number.isNaN(netN) && grossN >= 0 && netN >= 0

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, period, grossAmount: grossN, netAmount: netN, notes })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={record ? 'Edit payslip' : 'Add payslip'}
      sub={record ? fmtPeriod(record.period) : undefined}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!valid || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : record ? 'Save changes' : 'Add payslip'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="auth-form">
        {!record && (
          <div className="field">
            <label htmlFor="slPeriod">Month</label>
            <input className="input" id="slPeriod" type="month" value={period.slice(0, 7)}
                   onChange={(e) => setPeriod(e.target.value + '-01')} />
          </div>
        )}
        <div className="field">
          <label htmlFor="slGross">Gross amount (₹)</label>
          <input className="input" id="slGross" type="number" min={0} value={gross}
                 onChange={(e) => setGross(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="slNet">Net amount (₹)</label>
          <input className="input" id="slNet" type="number" min={0} value={net}
                 onChange={(e) => setNet(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="slNotes">Notes</label>
          <textarea className="input" id="slNotes" rows={3} value={notes}
                    onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  )
}
