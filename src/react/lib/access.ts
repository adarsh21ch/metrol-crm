import type { Capability, ClientAssignment, EmployeeRole, Role, RoleCapability } from './agency'

/**
 * Who may do what — the SAME rules 0035/0036/0037 enforce in the database,
 * restated here so a screen can hide a button nobody would be allowed to
 * press. The database is the security; this is courtesy. Keep the two in step:
 *
 *   holdings()        ↔ role_holdings_for()
 *   can()             ↔ has_capability()
 *   canInDepartment() ↔ has_capability_in_department()
 *   canForClient()    ↔ has_capability_for_client()
 *   canAssign()       ↔ can_assign_on_client()
 *   canEnterViews()   ↔ can_enter_views()
 *   canReadViews()    ↔ can_read_views()
 */

export interface AccessData {
  roles: Role[]
  caps: RoleCapability[]
  employeeRoles: EmployeeRole[]
  assignments: ClientAssignment[]
}

/** The asker, as the SQL reads them off profiles and employees. */
export interface Viewer {
  isOwner: boolean
  departmentId: string | null
  isTeamLead: boolean
  employeeId: string | null
  /** employees.status is not 'resigned' */
  employeeActive: boolean
}

/** A role held, and where: null = company-wide, else inside that department. */
export interface Holding { roleId: string; scopeDepartment: string | null }

/** The client fields a capability check needs. */
export interface ClientRef { id: string; departmentId: string | null }

export function holdings(v: Viewer, d: AccessData): Holding[] {
  const out: Holding[] = []
  const live = d.roles.filter((r) => r.isActive)
  // 1. given by hand, to somebody still on the books
  if (v.employeeId && v.employeeActive) {
    for (const er of d.employeeRoles) {
      const r = live.find((x) => x.id === er.roleId)
      if (er.employeeId === v.employeeId && r && !r.clientScoped) out.push({ roleId: r.id, scopeDepartment: er.departmentId })
    }
  }
  for (const r of live) {
    // 2. everybody in a department, company-wide
    if (r.heldBy === 'department' && r.departmentId && r.departmentId === v.departmentId) {
      out.push({ roleId: r.id, scopeDepartment: null })
    }
    // 3. a department's team leads, inside their own department
    if (r.heldBy === 'team_leads' && v.isTeamLead && v.departmentId
        && (!r.departmentId || r.departmentId === v.departmentId)) {
      out.push({ roleId: r.id, scopeDepartment: v.departmentId })
    }
  }
  return out
}

export function makeAccess(v: Viewer, d: AccessData) {
  const capsByRole = new Map<string, Set<Capability>>()
  for (const c of d.caps) {
    const s = capsByRole.get(c.roleId) ?? new Set<Capability>()
    s.add(c.capability)
    capsByRole.set(c.roleId, s)
  }
  const roleById = new Map(d.roles.map((r) => [r.id, r]))
  const hs = holdings(v, d)
  const roleHas = (roleId: string, cap: Capability) => capsByRole.get(roleId)?.has(cap) ?? false

  /** Company-wide. The owner holds everything — nothing on the Roles & access
   *  screen can take that away, so nobody locks the company out. */
  const can = (cap: Capability) =>
    v.isOwner || hs.some((h) => h.scopeDepartment === null && roleHas(h.roleId, cap))

  const canInDepartment = (dept: string | null, cap: Capability) =>
    can(cap) || (!!dept && hs.some((h) => h.scopeDepartment === dept && roleHas(h.roleId, cap)))

  const myLive = (clientId: string) =>
    v.employeeId && v.employeeActive
      ? d.assignments.filter((a) => a.clientId === clientId && a.employeeId === v.employeeId && !a.endedAt)
      : []

  const isOnClient = (clientId: string) => myLive(clientId).length > 0

  /** Company-wide, for the client's department, or through a per-client role
   *  on THIS client. */
  const canForClient = (client: ClientRef, cap: Capability) =>
    canInDepartment(client.departmentId, cap)
    || myLive(client.id).some((a) => roleById.get(a.roleId)?.isActive && roleHas(a.roleId, cap))

  const holdsRoleForClient = (client: ClientRef, roleId: string) =>
    myLive(client.id).some((a) => a.roleId === roleId)
    || hs.some((h) => h.roleId === roleId && (h.scopeDepartment === null || h.scopeDepartment === client.departmentId))

  /** §3.3: assign_team for the client, or holding — on this client — the role
   *  that assigns this one (an SMM adding editors to their own clients). */
  const canAssign = (client: ClientRef, roleId: string) => {
    if (canForClient(client, 'assign_team')) return true
    const r = roleById.get(roleId)
    return !!r && r.clientScoped && r.isActive && !!r.assignedByRoleId && holdsRoleForClient(client, r.assignedByRoleId)
  }

  return {
    holdings: hs,
    can,
    canInDepartment,
    canForClient,
    isOnClient,
    canAssign,
    /** The per-client roles this person may give on this client. */
    assignableRoles: (client: ClientRef) =>
      d.roles.filter((r) => r.clientScoped && r.isActive && canAssign(client, r.id)).sort((a, b) => a.sortOrder - b.sortOrder),
    /** "Enter for their own pages": the head and management anywhere; a
     *  per-client role only on a page they hold. */
    canEnterViews: (client: ClientRef, holdsThePage: boolean) =>
      canForClient(client, 'manage_targets')
      || canInDepartment(client.departmentId, 'enter_views')
      || (canForClient(client, 'enter_views') && holdsThePage),
    canReadViews: (client: ClientRef) =>
      canForClient(client, 'view_targets') || canForClient(client, 'enter_views') || isOnClient(client.id),
    canSeeClient: (client: ClientRef, holdsAPage: boolean) =>
      canForClient(client, 'view_all_clients') || isOnClient(client.id) || holdsAPage,
  }
}

export type Access = ReturnType<typeof makeAccess>

/* ----------------------------------------------------------------- the seed */

const ALL_CAPS: Capability[] = [
  'view_all_clients', 'manage_clients', 'see_client_money', 'view_targets', 'manage_targets', 'enter_views',
  'assign_team', 'manage_workflows', 'view_all_work', 'approve_incentives', 'manage_hr', 'manage_payroll',
  'manage_assets', 'manage_settings',
]

/**
 * 0035's seed, restated — what demo mode runs on, and what a live database
 * without 0035 yet behaves as (today's rules, exactly: HR by department, the
 * Content and Marketing lead by the team-lead switch, the owner holding all).
 */
export function seedAccess(departments: { id: string; name: string }[]): { roles: Role[]; caps: RoleCapability[] } {
  const dept = (name: string) => departments.find((x) => x.name === name)?.id ?? null
  const cm = dept('Content and Marketing')
  const role = (id: string, name: string, sortOrder: number, extra: Partial<Role> = {}): Role => ({
    id, name, sortOrder, departmentId: null, clientScoped: false, heldBy: 'assigned',
    assignedByRoleId: null, pageHolder: false, isActive: true, ...extra,
  })
  const byDept = (name: string) => (dept(name) ? 'department' as const : 'assigned' as const)
  const roles: Role[] = [
    role('role-super', 'Super Admin', 1),
    role('role-mgmt', 'Management', 2),
    role('role-head', 'Department Head', 3, { departmentId: cm, heldBy: cm ? 'team_leads' : 'assigned' }),
    role('role-sales', 'Sales', 4, { departmentId: dept('Sales'), heldBy: byDept('Sales') }),
    role('role-smm', 'SMM', 5, { departmentId: cm, clientScoped: true, pageHolder: true, assignedByRoleId: 'role-head' }),
    role('role-editor', 'Editor', 6, { departmentId: dept('Video Editors'), clientScoped: true, assignedByRoleId: 'role-smm' }),
    role('role-dop', 'DOP / Production', 7, { departmentId: dept('Production'), clientScoped: true }),
    role('role-pm', 'Performance Marketing', 8, { departmentId: dept('Performance Marketing'), heldBy: byDept('Performance Marketing') }),
    role('role-hr', 'HR', 9, { departmentId: dept('Human Resources'), heldBy: byDept('Human Resources') }),
    role('role-admin', 'Admin', 10),
    role('role-client', 'Client', 11),
  ]
  const give = (roleId: string, caps: Capability[]) => caps.map((capability) => ({ roleId, capability }))
  const caps: RoleCapability[] = [
    ...give('role-super', ALL_CAPS),
    ...give('role-mgmt', ALL_CAPS),
    ...give('role-head', ['view_all_clients', 'manage_clients', 'assign_team', 'view_targets', 'manage_targets', 'enter_views', 'view_all_work']),
    ...give('role-smm', ['view_targets', 'enter_views']),
    // view_targets + manage_targets: 0038 — HR runs Clients, so HR sees the client's dashboard.
    ...give('role-hr', ['view_all_clients', 'manage_clients', 'assign_team', 'view_targets', 'manage_targets', 'manage_hr', 'manage_payroll', 'approve_incentives']),
    ...give('role-admin', ['manage_assets']),
  ]
  return { roles, caps }
}
