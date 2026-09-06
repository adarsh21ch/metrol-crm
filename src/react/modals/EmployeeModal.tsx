import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { EMPLOYMENT, EMP_STATUS, todayISO, type Employee, type EmployeeStatus, type EmploymentType } from '@/lib/hr'
import type { EmployeeDraft } from '@/data/useEmployees'
import type { Workspace } from '@/data/useWorkspace'

const blank = (prefill?: Partial<EmployeeDraft>): EmployeeDraft => ({
  profileId: null,
  fullName: '',
  designation: '',
  departmentId: null,
  employmentType: 'full_time',
  dateOfJoining: todayISO(),
  reportingTo: null,
  workEmail: '',
  personalEmail: '',
  phone: '',
  dateOfBirth: null,
  address: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyPhone: '',
  status: 'active',
  lastWorkingDay: null,
  notes: '',
  annualLeaveDays: 18,
  ...prefill,
})

/**
 * Add or edit one employee. There is no delete: the table has no delete policy
 * and DELETE is revoked from the client, so somebody who leaves is marked
 * resigned and the record stays.
 */
export function EmployeeModal({
  ws, employee, employees, prefill, onClose, onSave,
}: {
  ws: Workspace
  /** null adds a new record. */
  employee: Employee | null
  employees: Employee[]
  prefill?: Partial<EmployeeDraft>
  onClose: () => void
  onSave: (draft: EmployeeDraft) => Promise<string | null>
}) {
  const [f, setF] = useState<EmployeeDraft>(() => (employee ? { ...employee } : blank(prefill)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) => setF((p) => ({ ...p, [k]: v }))

  // Somebody already on a record should not be offered again, or two records
  // would claim the same person — the database rejects that anyway.
  const taken = new Set(employees.filter((e) => e.id !== employee?.id).map((e) => e.profileId).filter(Boolean))
  const linkable = ws.members.filter((m) => !taken.has(m.id))

  // full_name is the only column the database itself will not accept empty
  // (see 0006: `full_name text not null`, no default). Everything else on
  // this form has a default of '' at the database — designation, department,
  // phone, emergency contact — so none of it should block Save. Encouraged,
  // not required: this screen is where HR fills the gaps in over time, not a
  // form that must be completed in one sitting before a record can exist.

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave(f)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      wide
      title={employee ? 'Edit employee' : 'Add employee'}
      sub={employee ? employee.employeeCode : 'The code is generated when you save.'}
      onClose={onClose}
      foot={
        <>
          {!f.fullName.trim() && (
            <span style={{ marginRight: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>
              Needs a name
            </span>
          )}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!f.fullName.trim() || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="auth-form">
        <div className="field">
          <label htmlFor="emName">Full name</label>
          <input className="input" id="emName" autoFocus value={f.fullName}
                 onChange={(e) => set('fullName', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emLink">Their login</label>
          <select className="input" id="emLink" value={f.profileId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null
                    const m = ws.members.find((x) => x.id === id)
                    setF((p) => ({
                      ...p,
                      profileId: id,
                      // Filling an empty field from the account is a help; typing
                      // over it afterwards must not be undone, so anything the
                      // user has already written is left alone.
                      fullName: p.fullName || (m?.name ?? ''),
                      workEmail: p.workEmail || (m?.email ?? ''),
                      phone: p.phone || (m?.phone ?? ''),
                      departmentId: p.departmentId ?? (m?.departmentId ?? null),
                    }))
                  }}>
            <option value="">No login — they do not use the CRM</option>
            {linkable.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.email}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="emDesig">Designation</label>
          <input className="input" id="emDesig" placeholder="Sales Executive, HR Manager…"
                 value={f.designation} onChange={(e) => set('designation', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emDept">Department</label>
          <select className="input" id="emDept" value={f.departmentId ?? ''}
                  onChange={(e) => set('departmentId', e.target.value || null)}>
            <option value="">Choose one</option>
            {ws.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="emType">Employment type</label>
          <select className="input" id="emType" value={f.employmentType}
                  onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
            {Object.entries(EMPLOYMENT).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="emJoin">Date of joining</label>
          <input className="input" id="emJoin" type="date" value={f.dateOfJoining}
                 onChange={(e) => set('dateOfJoining', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emBoss">Reports to</label>
          <select className="input" id="emBoss" value={f.reportingTo ?? ''}
                  onChange={(e) => set('reportingTo', e.target.value || null)}>
            <option value="">Nobody</option>
            {employees.filter((e) => e.id !== employee?.id)
              .map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.designation}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="emPhone">Phone</label>
          <input className="input" id="emPhone" inputMode="tel" placeholder="+91 …"
                 value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emWork">Work email</label>
          <input className="input" id="emWork" type="email" value={f.workEmail}
                 onChange={(e) => set('workEmail', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emPersonal">Personal email</label>
          <input className="input" id="emPersonal" type="email" value={f.personalEmail}
                 onChange={(e) => set('personalEmail', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emDob">Date of birth</label>
          <input className="input" id="emDob" type="date" value={f.dateOfBirth ?? ''}
                 onChange={(e) => set('dateOfBirth', e.target.value || null)} />
        </div>

        <div className="field">
          <label htmlFor="emAddr">Address</label>
          <input className="input" id="emAddr" value={f.address}
                 onChange={(e) => set('address', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emEmName">Emergency contact</label>
          <input className="input" id="emEmName" placeholder="Their name"
                 value={f.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emEmRel">Relation</label>
          <input className="input" id="emEmRel" placeholder="Father, spouse…"
                 value={f.emergencyRelation} onChange={(e) => set('emergencyRelation', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="emEmPhone">Emergency phone</label>
          <input className="input" id="emEmPhone" inputMode="tel" placeholder="+91 …"
                 value={f.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </div>

        {employee && (
          <div className="field">
            <label htmlFor="emStatus">Status</label>
            <select className="input" id="emStatus" value={f.status}
                    onChange={(e) => {
                      const status = e.target.value as EmployeeStatus
                      setF((p) => ({
                        ...p,
                        status,
                        lastWorkingDay: status === 'active' ? null : (p.lastWorkingDay ?? todayISO()),
                      }))
                    }}>
              {Object.entries(EMP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}

        {employee && f.status !== 'active' && (
          <div className="field">
            <label htmlFor="emLast">Last working day</label>
            <input className="input" id="emLast" type="date" value={f.lastWorkingDay ?? ''}
                   onChange={(e) => set('lastWorkingDay', e.target.value || null)} />
          </div>
        )}

        <div className="field">
          <label htmlFor="emLeave">Annual leave days</label>
          <input className="input" id="emLeave" type="number" min={0} step={0.5} value={f.annualLeaveDays}
                 onChange={(e) => set('annualLeaveDays', Number(e.target.value) || 0)} />
        </div>

        <div className="field">
          <label htmlFor="emNotes">Notes</label>
          <textarea className="input" id="emNotes" rows={3} value={f.notes}
                    onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
