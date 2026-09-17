import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'
import { currentPeriod, fmtPeriod, type Employee, type SalaryRecord } from '@/lib/hr'
import { toLeaveMonth } from '@/lib/leaveRules'
import { computePayslip } from '@/lib/payroll'
import type { SalaryDraft } from '@/data/useSalaryRecords'

/** Add or correct one payslip. There is no status control here — a new one
 *  always starts pending, and "paid" is a separate one-click action on the
 *  list (see HrPage) rather than a field in this form.
 *
 *  Round 4 adds one thing: "Compute from attendance" asks the database's own
 *  leave_month_summary() (0022) for this person's month, turns it into money
 *  with lib/payroll.ts, and fills the three fields below — it does not save
 *  anything by itself. HR still reviews the numbers and presses Save, same as
 *  typing them by hand. Nothing pays itself. */
export function SalaryRecordModal({
  employeeId, employee, record, onClose, onSave,
}: {
  employeeId: string
  /** For "Compute from attendance" — needs the monthly salary (0024) and a
   *  name for the error if it is not set yet. Omit where the caller does not
   *  have it handy; the button just does not appear. */
  employee?: Employee | null
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
  const [computing, setComputing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const grossN = Number(gross)
  const netN = Number(net)
  const valid = gross !== '' && net !== '' && !Number.isNaN(grossN) && !Number.isNaN(netN) && grossN >= 0 && netN >= 0

  const compute = async () => {
    if (!employee) return
    if (employee.monthlySalary == null) {
      setErr(`Set ${employee.fullName}'s monthly salary on their employee record first — there is nothing to compute from yet.`)
      return
    }
    setComputing(true)
    setErr(null)
    const { data, error: rpcErr } = await supabase.rpc('leave_month_summary', { p_employee: employeeId, p_month: period })
    setComputing(false)
    if (rpcErr) {
      setErr(/could not find the function/i.test(rpcErr.message)
        ? 'The leave rules are not installed on the database yet — migration 0022 has to be run first.'
        : rpcErr.message)
      return
    }
    const lm = toLeaveMonth((data ?? {}) as Record<string, unknown>)
    if (!lm.ok) { setErr(lm.message ?? 'Could not work out this month.'); return }
    if (!lm.counted) { setErr(`${fmtPeriod(period)} is before leave was counted for ${employee.fullName}.`); return }
    const calc = computePayslip(employee.monthlySalary, period, lm)
    setGross(String(calc.grossAmount))
    setNet(String(calc.netAmount))
    setNotes(calc.notes)
  }

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
        {employee && (
          <div className="field">
            <button className="btn btn--sm" type="button" disabled={computing || isDemo()}
                    title={isDemo() ? 'Not available in demo mode' : undefined}
                    onClick={() => void compute()}>
              {computing ? 'Computing…' : 'Compute from attendance'}
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              Fills gross, net and notes from {fmtPeriod(period)}'s attendance and leave — review before saving.
            </p>
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
