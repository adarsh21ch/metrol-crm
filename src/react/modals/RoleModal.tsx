import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { CAPABILITIES, type Capability, type HeldBy, type Role } from '@/lib/agency'
import type { Department } from '@/lib/types'
import type { RoleDraft } from '@/data/useAccessData'

/** How somebody comes to hold a role — one question with four answers,
 *  rather than two switches and a dropdown that can disagree. */
type Holding = 'client' | 'hand' | 'department' | 'team_leads'

const HOLDING: { key: Holding; label: string; hint: string }[] = [
  { key: 'client', label: 'Per client', hint: 'Given on a client\'s Team — SMM, Editor' },
  { key: 'hand', label: 'Given by hand', hint: 'Company-wide, to named people — Management' },
  { key: 'department', label: 'Everyone in a department', hint: 'Joining the department is enough — HR' },
  { key: 'team_leads', label: 'Team leads of a department', hint: 'The "team lead" switch on HR\'s employee form' },
]

const holdingOf = (r: Role | null): Holding =>
  !r ? 'client' : r.clientScoped ? 'client' : r.heldBy === 'department' ? 'department' : r.heldBy === 'team_leads' ? 'team_leads' : 'hand'

/**
 * One role: who holds it, who may hand it out on a client (the §3.3 chain),
 * and what it lets them do. Only the capabilities something in the app reads
 * today are offered — a tick that changes nothing would be a control that lies.
 */
export function RoleModal({
  role, roles, caps, departments, onClose, onSave,
}: {
  role: Role | null
  roles: Role[]
  caps: Capability[]
  departments: Department[]
  onClose: () => void
  onSave: (draft: RoleDraft, caps: Capability[]) => Promise<string | null>
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [holding, setHolding] = useState<Holding>(holdingOf(role))
  const [departmentId, setDepartmentId] = useState<string | null>(role?.departmentId ?? null)
  const [assignedBy, setAssignedBy] = useState<string | null>(role?.assignedByRoleId ?? null)
  const [pageHolder, setPageHolder] = useState(role?.pageHolder ?? false)
  const [isActive, setIsActive] = useState(role?.isActive ?? true)
  const [picked, setPicked] = useState<Capability[]>(caps)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const perClient = holding === 'client'
  const needsDept = holding === 'department'
  const invalid = !name.trim() ? 'Give the role a name.' : needsDept && !departmentId ? 'Pick the department.' : null

  const save = async () => {
    if (invalid) return
    setBusy(true); setErr(null)
    const message = await onSave({
      name,
      departmentId,
      clientScoped: perClient,
      heldBy: holding === 'department' ? 'department' : holding === 'team_leads' ? 'team_leads' : 'assigned' as HeldBy,
      assignedByRoleId: perClient ? assignedBy : null,
      pageHolder: perClient && pageHolder,
      sortOrder: role?.sortOrder ?? roles.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1,
      isActive,
    }, picked)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      wide
      title={role ? role.name : 'New role'}
      sub={role ? 'What this role is, and what it may do' : 'Add a role — SMM, Scriptwriter, Graphic designer…'}
      onClose={onClose}
      foot={
        <>
          {invalid && <span style={{ marginRight: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>{invalid}</span>}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!!invalid || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : role ? 'Save role' : 'Add role'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="rlName">Name</label>
          <input className="input" id="rlName" autoFocus={!role} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rlDept">{needsDept ? 'Department' : holding === 'team_leads' ? 'Team leads of' : 'Belongs to'}</label>
          <select className="input" id="rlDept" value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value || null)}>
            <option value="">{holding === 'team_leads' ? 'Any department' : '—'}</option>
            {departments.filter((d) => d.isActive || d.id === departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Who holds it</label>
        <div className="rl-holding">
          {HOLDING.map((h) => (
            <label key={h.key} className={'rl-hold' + (holding === h.key ? ' is-on' : '')}>
              <input type="radio" name="rlHolding" checked={holding === h.key} onChange={() => setHolding(h.key)} />
              <span><strong>{h.label}</strong><span className="cell-mute">{h.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      {perClient && (
        <div className="field-grid">
          <div className="field">
            <label htmlFor="rlBy">Who may add people in this role</label>
            <select className="input" id="rlBy" value={assignedBy ?? ''} onChange={(e) => setAssignedBy(e.target.value || null)}>
              <option value="">Only people who can assign anyone</option>
              {roles.filter((r) => r.id !== role?.id && r.isActive).map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.clientScoped ? ' on that client' : ''}</option>
              ))}
            </select>
          </div>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={pageHolder} onChange={(e) => setPageHolder(e.target.checked)} />
            Given a client's page → joins the client's team in this role
          </label>
        </div>
      )}

      <div className="field">
        <label>What it may do</label>
        <div className="rl-caps">
          {/* On a per-client role, "see every client" and this screen mean
              nothing — the role only ever reaches the clients it is held on. */}
          {CAPABILITIES.filter((c) => c.live && !(perClient && (c.key === 'manage_settings' || c.key === 'view_all_clients'))).map((c) => (
            <label key={c.key} className="check">
              <input type="checkbox" checked={picked.includes(c.key)}
                     onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.key] : p.filter((x) => x !== c.key)))} />
              <span>{c.label}<span className="cell-mute"> — {perClient ? 'on the clients they are on' : c.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      {role && (
        <label className="check">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          In use — a retired role cannot be given; people who held it keep their history
        </label>
      )}
    </Modal>
  )
}
