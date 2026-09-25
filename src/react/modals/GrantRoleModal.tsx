import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Role } from '@/lib/agency'
import type { Employee } from '@/lib/hr'
import type { Department } from '@/lib/types'

/** A company-wide role, given to one named person — "Management", or
 *  "Department Head" of a department whose head is not flagged team lead. */
export function GrantRoleModal({
  roles, people, departments, onClose, onSave,
}: {
  roles: Role[]
  people: Employee[]
  departments: Department[]
  onClose: () => void
  onSave: (employeeId: string, roleId: string, departmentId: string | null) => Promise<string | null>
}) {
  const offered = roles.filter((r) => r.isActive && !r.clientScoped)
  const [employeeId, setEmployeeId] = useState('')
  const [roleId, setRoleId] = useState(offered.find((r) => r.name === 'Management')?.id ?? offered[0]?.id ?? '')
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!employeeId || !roleId) return
    setBusy(true); setErr(null)
    const message = await onSave(employeeId, roleId, departmentId)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Give a role"
      sub="Company-wide, to one person"
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!employeeId || !roleId || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Give role'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="grWho">Who</label>
          <select className="input" id="grWho" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Pick someone…</option>
            {people.filter((e) => e.status !== 'resigned').sort((a, b) => a.fullName.localeCompare(b.fullName)).map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` — ${e.designation}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="grRole">Role</label>
          <select className="input" id="grRole" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {offered.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="grDept">Only inside</label>
          <select className="input" id="grDept" value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value || null)}>
            <option value="">The whole company</option>
            {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <p className="field-hint">"Head of Video Editors" is Department Head, inside Video Editors: it reaches that department's clients only.</p>
        </div>
      </div>
    </Modal>
  )
}
