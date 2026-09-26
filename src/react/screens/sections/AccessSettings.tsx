import { useState } from 'react'
import { Chip } from '@/components/bits'
import { Tip } from '@/components/Tip'
import { RoleModal } from '@/modals/RoleModal'
import { GrantRoleModal } from '@/modals/GrantRoleModal'
import { CAPABILITIES, type Capability, type Role } from '@/lib/agency'
import type { Agency } from '@/data/useAgency'
import type { Employee } from '@/lib/hr'
import type { Workspace } from '@/data/useWorkspace'

/**
 * Roles & access (AGENCY-OS-PLAN.md §4) — who may do what, as rows the owner
 * edits instead of code: the roles, what each may do, and who holds one by
 * hand. Needs manage_settings; the owner always has it and nothing here can
 * take that away. The small lists (client statuses, page colours, adjustment
 * types) moved to Settings → Workflows & lists in Phase 2, Round 1.
 */
export function AccessSettings({
  ws, agency, staff, toast, lead,
}: {
  ws: Workspace
  agency: Agency
  staff: Employee[]
  toast: (m: string) => void
  lead?: React.ReactNode
}) {
  const { accessData, installed, team } = agency
  const [editing, setEditing] = useState<Role | 'new' | null>(null)
  const [granting, setGranting] = useState(false)
  const live = CAPABILITIES.filter((c) => c.live)
  const roles = [...accessData.roles].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder)
  const capsOf = (roleId: string) => accessData.caps.filter((c) => c.roleId === roleId).map((c) => c.capability)
  const dept = (id: string | null) => (id ? ws.departmentName(id) : null)
  const roleName = (id: string | null) => accessData.roles.find((r) => r.id === id)?.name ?? null
  const personName = (employeeId: string) => staff.find((e) => e.id === employeeId)?.fullName ?? 'Former employee'

  const holders = (r: Role) => {
    if (r.clientScoped) {
      const n = new Set(team.rows.filter((t) => t.roleId === r.id && !t.endedAt).map((t) => t.employeeId)).size
      return `Per client · ${n} on clients now` + (r.assignedByRoleId ? ` · added by ${roleName(r.assignedByRoleId)}` : '')
    }
    if (r.heldBy === 'department') return `Everyone in ${dept(r.departmentId) ?? 'a department'}`
    if (r.heldBy === 'team_leads') return `Team leads of ${dept(r.departmentId) ?? 'any department'}`
    const n = accessData.employeeRoles.filter((e) => e.roleId === r.id).length
    return n ? `Given by hand · ${n}` : 'Given by hand · nobody yet'
  }

  const saveRole = async (role: Role | null, draft: Parameters<typeof accessData.saveRole>[1], picked: Capability[]) => {
    const r = await accessData.saveRole(role?.id ?? null, draft)
    if (r.error || !r.id) return r.error ?? 'Could not save the role.'
    const had = role ? capsOf(role.id) : []
    for (const c of live.map((x) => x.key)) {
      const want = picked.includes(c)
      if (want !== had.includes(c)) {
        const m = await accessData.setCapability(r.id, c, want)
        if (m) return m
      }
    }
    toast(role ? 'Role saved.' : 'Role added.')
    return null
  }

  return (
    <>
      <div className="page-head">
        {lead}
        <h1>Roles & access</h1>
        {installed.access && (
          <div className="section-tools">
            <button className="btn btn--sm" onClick={() => setGranting(true)}>Give a role</button>
            <button className="btn btn--sm btn--primary" onClick={() => setEditing('new')}>+ Role</button>
          </div>
        )}
      </div>

      {!installed.access && (
        <div className="banner">
          <div>
            <div className="t">Showing today's rules</div>
            <div className="d">The roles tables are not on the database yet (migration 0035). Until they are, this is what the app already does — read-only.</div>
          </div>
        </div>
      )}
      <Tip tipKey="agency-roles">
        A role is what someone is on a client or in the company; ticking what a role may do changes it for everyone who
        holds it, at once. The owner can always do everything.
      </Tip>

      <div className="section">
        <div className="ov-actions">
          {roles.map((r) => {
            const caps = capsOf(r.id)
            return (
              <button className={'ov-row rl-row' + (r.isActive ? '' : ' is-retired')} key={r.id}
                      onClick={() => installed.access && setEditing(r)} disabled={!installed.access}>
                <span className="rl-name">
                  <strong>{r.name}</strong>
                  <span className="cell-mute">{holders(r)}</span>
                </span>
                <span className="rl-caps-line">
                  {!r.isActive && <Chip cls="chip--mute">Retired</Chip>}
                  {live.filter((c) => caps.includes(c.key)).map((c) => <Chip key={c.key} cls="chip--accent">{c.label}</Chip>)}
                  {r.pageHolder && <Chip cls="chip--good">Gets the pages</Chip>}
                  {live.every((c) => !caps.includes(c.key)) && !r.pageHolder && <span className="cell-dash">Nothing extra</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h3>Given by hand</h3></div>
        {accessData.employeeRoles.length === 0 ? (
          <p className="cell-mute" style={{ margin: 0 }}>Nobody yet — HR and the Content & Marketing head hold theirs through their department and the team-lead switch.</p>
        ) : (
          <div className="ov-actions">
            {accessData.employeeRoles.map((er) => (
              <div className="ov-row" key={er.id} style={{ cursor: 'default' }}>
                <span className="ov-l"><strong>{personName(er.employeeId)}</strong> — {roleName(er.roleId)}{er.departmentId ? `, inside ${dept(er.departmentId)}` : ''}</span>
                <button className="link-btn" style={{ marginLeft: 'auto' }}
                        onClick={() => { if (window.confirm(`Take ${roleName(er.roleId)} away from ${personName(er.employeeId)}?`)) void accessData.revoke(er.id).then((m) => toast(m ?? 'Role taken away.')) }}>
                  Take away
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <RoleModal role={editing === 'new' ? null : editing} roles={accessData.roles}
                   caps={editing === 'new' ? [] : capsOf(editing.id)} departments={ws.departments}
                   onClose={() => setEditing(null)}
                   onSave={(draft, picked) => saveRole(editing === 'new' ? null : editing, draft, picked)} />
      )}
      {granting && (
        <GrantRoleModal roles={accessData.roles} people={staff} departments={ws.departments}
                        onClose={() => setGranting(false)}
                        onSave={async (employeeId, roleId, departmentId) => {
                          const m = await accessData.grant(employeeId, roleId, departmentId)
                          if (!m) toast('Role given.')
                          return m
                        }} />
      )}
    </>
  )
}
