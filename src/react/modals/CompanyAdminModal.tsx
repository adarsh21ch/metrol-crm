import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Avatar } from '@/components/bits'
import type { Workspace } from '@/data/useWorkspace'

/**
 * Everything only the owner may touch, in one place: who is allowed to create
 * an account, what departments exist, and which one each person is in.
 *
 * None of it is protected by being hidden here — every write below is refused
 * by row level security for anyone who is not the owner. Hiding the panel is
 * for tidiness; the database is what says no.
 */
export function CompanyAdminModal({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [codeLoaded, setCodeLoaded] = useState(false)
  const [codeMsg, setCodeMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [savingCode, setSavingCode] = useState(false)

  const [newDept, setNewDept] = useState('')
  const [deptMsg, setDeptMsg] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    void ws.getInviteCode().then(({ code, error }) => {
      if (dead) return
      if (code) setCode(code)
      if (error) setCodeMsg({ text: error, bad: true })
      setCodeLoaded(true)
    })
    return () => { dead = true }
  }, [ws])

  async function saveCode(e: React.FormEvent) {
    e.preventDefault()
    setSavingCode(true); setCodeMsg(null)
    const err = await ws.setInviteCode(code)
    setSavingCode(false)
    setCodeMsg(err ? { text: err, bad: true } : { text: 'Saved. New signups need this code from now on.' })
  }

  const active = ws.departments.filter((d) => d.isActive)

  return (
    <Modal
      title="Company settings" sub="Owner only" wide onClose={onClose}
      foot={<button className="btn btn--sm" onClick={onClose}>Close</button>}
    >
      <div className="auth-form">
        {/* ------------------------------------------------ the company code */}
        <form onSubmit={saveCode} className="auth-form">
          <div className="auth-alt-label">Company code</div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 }}>
            Anyone creating an account has to type this. Change it when somebody
            leaves, and tell the team the new one.
          </p>
          <div className="field">
            <label htmlFor="caCode">Current code</label>
            <input className="input" id="caCode" value={codeLoaded ? code : 'Loading…'}
                   disabled={!codeLoaded} onChange={(e) => setCode(e.target.value)} />
          </div>
          {codeMsg && <p className={codeMsg.bad ? 'auth-err' : 'imp-result is-ok'}>{codeMsg.text}</p>}
          <button className="btn btn--sm btn--primary" type="submit" disabled={savingCode || !codeLoaded}>
            {savingCode ? 'Saving…' : 'Save code'}
          </button>
        </form>

        {/* -------------------------------------------------- departments */}
        <div className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="auth-alt-label">Departments</div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 }}>
            Everyone is in Sales today. Retiring a department keeps the people
            already recorded against it — it just stops being offered for new
            assignments.
          </p>
          <div className="hist-wrap">
            <table className="hist">
              <thead><tr><th>Name</th><th style={{ width: 110 }}>Active</th></tr></thead>
              <tbody>
                {ws.departments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input className="input" defaultValue={d.name} style={{ height: 30 }}
                             onBlur={(e) => {
                               if (e.target.value.trim() && e.target.value !== d.name) {
                                 void ws.renameDepartment(d.id, e.target.value)
                               }
                             }} />
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                        <input type="checkbox" checked={d.isActive}
                               onChange={(e) => void ws.setDepartmentActive(d.id, e.target.checked)} />
                        {d.isActive ? 'Active' : 'Retired'}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="caNewDept">Add a department</label>
              <input className="input" id="caNewDept" placeholder="e.g. Photography"
                     value={newDept} onChange={(e) => setNewDept(e.target.value)} />
            </div>
            <button className="btn btn--sm" type="button" disabled={!newDept.trim()}
                    onClick={async () => {
                      const err = await ws.addDepartment(newDept)
                      setDeptMsg(err)
                      if (!err) setNewDept('')
                    }}>
              Add
            </button>
          </div>
          {deptMsg && <p className="auth-err">{deptMsg}</p>}
        </div>

        {/* --------------------------------------------------- the roster */}
        <div className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="auth-alt-label">Team — {ws.members.length} {ws.members.length === 1 ? 'person' : 'people'}</div>
          <div className="hist-wrap">
            <table className="hist">
              <thead><tr><th>Name</th><th>Email</th><th style={{ width: 190 }}>Department</th></tr></thead>
              <tbody>
                {ws.members.length === 0 && (
                  <tr><td colSpan={3} className="cell-dash">Nobody has created an account yet.</td></tr>
                )}
                {ws.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="td-flex">
                        <Avatar src={m.avatarUrl}>{m.initials}</Avatar>
                        <span className="cell-strong">{m.name}</span>
                      </span>
                    </td>
                    <td><span className="cell-mute">{m.email}</span></td>
                    <td>
                      <select className="input" style={{ height: 30 }} value={m.departmentId ?? ''}
                              onChange={(e) => void ws.setMemberDepartment(m.id, e.target.value || null)}>
                        <option value="">Not set</option>
                        {active.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        {/* A retired department the person is still in stays
                            selectable so their record reads truthfully. */}
                        {ws.departments
                          .filter((d) => !d.isActive && d.id === m.departmentId)
                          .map((d) => <option key={d.id} value={d.id}>{d.name} (retired)</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
