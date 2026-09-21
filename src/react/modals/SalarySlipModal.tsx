import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { SALARY_STATUS, fmtDate, fmtPeriod, type Employee, type SalaryRecord } from '@/lib/hr'

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

const Row = ({ l, v, strong, muted }: { l: string; v: string; strong?: boolean; muted?: boolean }) => (
  <div className="slip-row">
    <span className={muted ? 'slip-l muted' : 'slip-l'}>{l}</span>
    <span className={strong ? 'slip-v strong' : 'slip-v'}>{v}</span>
  </div>
)

/**
 * The formatted salary slip — payroll phase 2's actual "document", not the
 * flat gross/net row Round 4 shipped with. One component, two audiences:
 * HR opens it from any payslip in the Salary section and sees everything,
 * including which TDS category and rate produced the deduction; an employee
 * opens their own from Profile → Salary and sees the same shape with that
 * one thing missing — Adarsh's own words, 2026-09-21: the category and rate
 * stay internal, what is theirs to see is the amount that came out.
 */
export function SalarySlipModal({
  record, employee, employeeName, internal, onClose,
}: {
  record: SalaryRecord
  /** Full detail (designation, department, work location, PAN) when HR has
   *  the employee record loaded. An employee viewing their own always does. */
  employee?: Employee | null
  employeeName: string
  /** True for HR's own view — shows the TDS rate/category. False (or
   *  omitted) is the employee-safe view: the amount only. */
  internal?: boolean
  onClose: () => void
}) {
  const hasEncashment = record.leaveEncashmentDays > 0
  const hasIncentive = record.incentive > 0
  const hasOtherDeduction = record.otherDeduction > 0
  const hasTds = record.tdsAmount > 0

  return (
    <Modal
      wide
      title="Salary slip"
      sub={`${employeeName} · ${fmtPeriod(record.period)}`}
      onClose={onClose}
      foot={<button className="btn btn--primary" onClick={onClose}>Close</button>}
    >
      <div className="slip">
        <div className="slip-head">
          <div>
            <div className="slip-brand">Metrol Media</div>
            <div className="slip-period">Salary slip — {fmtPeriod(record.period)}</div>
          </div>
          <Chip cls={SALARY_STATUS[record.status].cls}>{SALARY_STATUS[record.status].label}</Chip>
        </div>

        <div className="slip-sec">
          <div className="slip-sec-title">Employee</div>
          <div className="slip-grid">
            <Row l="Name" v={employeeName} />
            {employee && <Row l="Employee code" v={employee.employeeCode || '—'} />}
            {employee && <Row l="Designation" v={employee.designation || '—'} />}
            {employee && <Row l="Work location" v={employee.workLocation || '—'} />}
            {employee && <Row l="PAN" v={employee.panNumber || '—'} />}
          </div>
        </div>

        <div className="slip-sec">
          <div className="slip-sec-title">Earnings</div>
          <div className="slip-grid">
            <Row l="Paid days" v={record.paidDays != null ? String(record.paidDays) : '—'} />
            {hasEncashment && <Row l={`Leave encashment (${record.leaveEncashmentDays} day(s))`} v={money(record.leaveEncashmentAmount)} />}
            {hasIncentive && <Row l="Incentive" v={money(record.incentive)} />}
            <Row l="Gross payable" v={money(record.grossAmount)} strong />
          </div>
        </div>

        {(hasOtherDeduction || hasTds) && (
          <div className="slip-sec">
            <div className="slip-sec-title">Deductions</div>
            <div className="slip-grid">
              {hasOtherDeduction && <Row l="Other deduction" v={'− ' + money(record.otherDeduction)} />}
              {hasTds && (
                <Row l={internal && record.tdsRatePercent != null ? `TDS (${record.tdsRatePercent}%)` : 'TDS'}
                     v={'− ' + money(record.tdsAmount)} />
              )}
            </div>
          </div>
        )}

        <div className="slip-net">
          <span>Net payable</span>
          <span>{money(record.netAmount)}</span>
        </div>

        {record.status === 'paid' && record.paidAt && (
          <p className="slip-foot">Paid on {fmtDate(record.paidAt.slice(0, 10))}.</p>
        )}
        {record.notes && <p className="slip-foot">{record.notes}</p>}
        <p className="slip-foot muted">Questions about this payslip go to HR.</p>
      </div>
    </Modal>
  )
}
