import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'
import { currentPeriod, fmtPeriod, type Employee, type SalaryRecord, type TdsCategory } from '@/lib/hr'
import { toLeaveMonth } from '@/lib/leaveRules'
import { computePayslip } from '@/lib/payroll'
import type { SalaryDraft } from '@/data/useSalaryRecords'

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

/** Add or correct one payslip — payroll phase 2's itemized version of Round
 *  4's original. "Compute from attendance" is still the one button that does
 *  real work: it asks leave_month_summary() (0022) for this person's month,
 *  works out paid days (allowing for a mid-month joining), pulls the leave-
 *  encashment days off the closed month's payout choice, and pre-fills the
 *  TDS rate from whichever category the employee is assigned — HR still
 *  reviews every number and can edit any of them before Save, same as
 *  before. Nothing pays itself. */
export function SalaryRecordModal({
  employeeId, employee, tdsCategories, record, onClose, onSave,
}: {
  employeeId: string
  /** For "Compute from attendance" — needs the CTC (0024), joining/last day
   *  for the mid-month proration, and the assigned TDS category. Omit where
   *  the caller does not have it handy; the button just does not appear. */
  employee?: Employee | null
  tdsCategories?: TdsCategory[]
  /** null adds a new payslip for this employee's month. */
  record: SalaryRecord | null
  onClose: () => void
  onSave: (draft: SalaryDraft) => Promise<string | null>
}) {
  const [period, setPeriod] = useState(record?.period ?? currentPeriod())
  const [gross, setGross] = useState(String(record?.grossAmount ?? ''))
  const [net, setNet] = useState(String(record?.netAmount ?? ''))
  const [notes, setNotes] = useState(record?.notes ?? '')
  const [paidDays, setPaidDays] = useState(record?.paidDays == null ? '' : String(record.paidDays))
  const [encashDays, setEncashDays] = useState(String(record?.leaveEncashmentDays ?? 0))
  const [encashAmount, setEncashAmount] = useState(String(record?.leaveEncashmentAmount ?? 0))
  const [incentive, setIncentive] = useState(String(record?.incentive ?? 0))
  const [otherDeduction, setOtherDeduction] = useState(String(record?.otherDeduction ?? 0))
  const [tdsRate, setTdsRate] = useState(record?.tdsRatePercent == null ? '' : String(record.tdsRatePercent))
  const [tdsAmount, setTdsAmount] = useState(String(record?.tdsAmount ?? 0))
  const [busy, setBusy] = useState(false)
  const [computing, setComputing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const grossN = Number(gross)
  const netN = Number(net)
  const valid = gross !== '' && net !== '' && !Number.isNaN(grossN) && !Number.isNaN(netN) && grossN >= 0 && netN >= 0

  const compute = async () => {
    if (!employee) return
    if (employee.monthlySalary == null) {
      setErr(`Set ${employee.fullName}'s CTC on their employee record first — there is nothing to compute from yet.`)
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
    const category = (tdsCategories ?? []).find((c) => c.id === employee.tdsCategoryId)
    const calc = computePayslip(employee.monthlySalary, period, lm, {
      joinedOn: employee.dateOfJoining, lastDay: employee.lastWorkingDay,
      incentive: Number(incentive) || 0, otherDeduction: Number(otherDeduction) || 0,
      tdsRatePercent: category?.ratePercent ?? null,
    })
    setGross(String(calc.grossPayable))
    setNet(String(calc.netAmount))
    setNotes(calc.notes)
    setPaidDays(String(calc.paidDays))
    setEncashDays(String(calc.leaveEncashmentDays))
    setEncashAmount(String(calc.leaveEncashmentAmount))
    setTdsRate(calc.tdsRatePercent == null ? '' : String(calc.tdsRatePercent))
    setTdsAmount(String(calc.tdsAmount))
  }

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({
      employeeId, period, grossAmount: grossN, netAmount: netN, notes,
      paidDays: paidDays === '' ? null : Number(paidDays),
      leaveEncashmentDays: Number(encashDays) || 0,
      leaveEncashmentAmount: Number(encashAmount) || 0,
      incentive: Number(incentive) || 0,
      otherDeduction: Number(otherDeduction) || 0,
      tdsRatePercent: tdsRate === '' ? null : Number(tdsRate),
      tdsAmount: Number(tdsAmount) || 0,
    })
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
              Fills paid days, leave encashment, TDS rate and the totals below from {fmtPeriod(period)}'s attendance and
              leave — review before saving. Set incentive and other deduction first if this month has either.
            </p>
          </div>
        )}

        <div className="hr-fields" style={{ marginBottom: 4 }}>
          <div className="field">
            <label htmlFor="slPaidDays">Paid days</label>
            <input className="input" id="slPaidDays" type="number" min={0} value={paidDays}
                   onChange={(e) => setPaidDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slEncashDays">Leave encashment (days)</label>
            <input className="input" id="slEncashDays" type="number" min={0} value={encashDays}
                   onChange={(e) => setEncashDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slEncashAmt">Leave encashment (₹)</label>
            <input className="input" id="slEncashAmt" type="number" min={0} value={encashAmount}
                   onChange={(e) => setEncashAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slIncentive">Incentive (₹)</label>
            <input className="input" id="slIncentive" type="number" min={0} value={incentive}
                   onChange={(e) => setIncentive(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slOtherDed">Other deduction (₹)</label>
            <input className="input" id="slOtherDed" type="number" min={0} value={otherDeduction}
                   onChange={(e) => setOtherDeduction(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slTdsRate">TDS rate (%)</label>
            <input className="input" id="slTdsRate" type="number" min={0} max={100} step={0.01} placeholder="No TDS"
                   value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slTdsAmt">TDS amount (₹)</label>
            <input className="input" id="slTdsAmt" type="number" min={0} value={tdsAmount}
                   onChange={(e) => setTdsAmount(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="slGross">Gross payable (₹)</label>
          <input className="input" id="slGross" type="number" min={0} value={gross}
                 onChange={(e) => setGross(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="slNet">Net payable (₹)</label>
          <input className="input" id="slNet" type="number" min={0} value={net}
                 onChange={(e) => setNet(e.target.value)} />
        </div>
        {valid && (
          <p className="field-hint">
            {money(grossN)} gross − {money(Number(otherDeduction) || 0)} other deduction − {money(Number(tdsAmount) || 0)} TDS = {money(netN)} net
          </p>
        )}
        <div className="field">
          <label htmlFor="slNotes">Notes</label>
          <textarea className="input" id="slNotes" rows={3} value={notes}
                    onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  )
}
