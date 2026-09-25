import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Role } from '@/lib/agency'
import type { StaffPick, TeamRow } from '@/data/useClientTeam'

/** Put somebody on a client in a role. Only the roles this person may give
 *  are offered (the §3.3 chain) — the database refuses the rest anyway. */
export function AssignModal({
  clientName, roles, initialRoleId, team, departmentName, loadPeople, onClose, onSave,
}: {
  clientName: string
  roles: Role[]
  initialRoleId: string | null
  team: TeamRow[]
  departmentName: (id: string | null) => string | null
  loadPeople: () => Promise<StaffPick[]>
  onClose: () => void
  onSave: (person: StaffPick, roleId: string) => Promise<string | null>
}) {
  const [roleId, setRoleId] = useState(initialRoleId ?? roles[0]?.id ?? '')
  const [people, setPeople] = useState<StaffPick[] | null>(null)
  const [personId, setPersonId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Asked once, when the form opens — the caller's loader is a fresh function
  // every render, so it is read through a ref rather than depended on.
  const loader = useRef(loadPeople)
  useEffect(() => {
    let alive = true
    void loader.current().then((p) => { if (alive) setPeople(p) })
    return () => { alive = false }
  }, [])

  // Somebody already in this role on this client is not offered it twice.
  const offered = useMemo(
    () => (people ?? []).filter((p) => !team.some((t) => t.employeeId === p.id && t.roleId === roleId && !t.endedAt)),
    [people, team, roleId],
  )
  // The role's own department first — editors for Editor — then everybody.
  const role = roles.find((r) => r.id === roleId) ?? null
  const sorted = useMemo(() => {
    const first = offered.filter((p) => role?.departmentId && p.departmentId === role.departmentId)
    return { first, rest: offered.filter((p) => !first.includes(p)) }
  }, [offered, role])

  const save = async () => {
    const person = offered.find((p) => p.id === personId)
    if (!person || !roleId) return
    setBusy(true); setErr(null)
    const message = await onSave(person, roleId)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  const option = (p: StaffPick) => (
    <option key={p.id} value={p.id}>{p.fullName}{p.designation ? ` — ${p.designation}` : ''}</option>
  )

  return (
    <Modal
      title="Add to the team"
      sub={clientName}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!personId || !roleId || busy} onClick={() => void save()}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="asRole">Role on this client</label>
          <select className="input" id="asRole" value={roleId} onChange={(e) => { setRoleId(e.target.value); setPersonId('') }}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="asPerson">Who</label>
          <select className="input" id="asPerson" value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={people === null}>
            <option value="">{people === null ? 'Loading…' : offered.length ? 'Pick someone…' : 'Nobody left to add'}</option>
            {sorted.first.length > 0 && (
              <optgroup label={departmentName(role?.departmentId ?? null) ?? 'Their department'}>{sorted.first.map(option)}</optgroup>
            )}
            {sorted.rest.length > 0 && (
              sorted.first.length > 0 ? <optgroup label="Everyone else">{sorted.rest.map(option)}</optgroup> : sorted.rest.map(option)
            )}
          </select>
        </div>
      </div>
    </Modal>
  )
}
