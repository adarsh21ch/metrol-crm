import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoAccess, demoEmployeeRoles, isDemo } from '@/data/demo'
import { seedAccess } from '@/lib/access'
import { loadTable, newId, str, type Row } from '@/data/agencySchema'
import type { Capability, EmployeeRole, HeldBy, Role, RoleCapability } from '@/lib/agency'
import type { Department } from '@/lib/types'

const toRole = (r: Row): Role => ({
  id: str(r.id),
  name: str(r.name),
  departmentId: (r.department_id as string | null) ?? null,
  clientScoped: r.client_scoped === true,
  heldBy: (r.held_by as HeldBy) ?? 'assigned',
  assignedByRoleId: (r.assigned_by_role_id as string | null) ?? null,
  pageHolder: r.page_holder === true,
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

const toCap = (r: Row): RoleCapability => ({ roleId: str(r.role_id), capability: r.capability as Capability })

const toEmployeeRole = (r: Row): EmployeeRole => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  roleId: str(r.role_id),
  departmentId: (r.department_id as string | null) ?? null,
  grantedAt: str(r.granted_at),
})

export type RoleDraft = Omit<Role, 'id'>

/**
 * Roles, which capabilities each holds, and who was given one by hand (0035).
 * Small and rarely changed — loaded once, no realtime, same as
 * useIncentiveRules.
 *
 * Before 0035 is on the database this answers with 0035's own seed, which is
 * today's rules exactly (HR by department, the Content and Marketing lead,
 * the owner) — so nothing that asks "may this person…" changes on the day
 * the app ships ahead of the SQL. `installed` says which of the two it is.
 */
export function useAccessData(departments: Department[], enabled = true) {
  const [roles, setRoles] = useState<Role[]>([])
  const [caps, setCaps] = useState<RoleCapability[]>([])
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([])
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  // The fallback seed is keyed on department ids, which arrive with the
  // workspace — read through a ref so a department list re-render does not
  // reload three tables.
  const deptRef = useRef(departments)
  useEffect(() => { deptRef.current = departments }, [departments])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRoles(demoAccess.roles); setCaps(demoAccess.caps); setEmployeeRoles(demoEmployeeRoles)
      setLoading(false)
      return
    }
    const [r, c, e] = await Promise.all([
      loadTable('roles', toRole, (q) => q.order('sort_order', { ascending: true })),
      loadTable('role_capabilities', toCap),
      loadTable('employee_roles', toEmployeeRole),
    ])
    if (r.missing) {
      const seed = seedAccess(deptRef.current)
      setRoles(seed.roles); setCaps(seed.caps); setEmployeeRoles([]); setInstalled(false)
      setLoading(false)
      return
    }
    setError(r.error ?? c.error ?? e.error)
    setRoles(r.rows); setCaps(c.rows); setEmployeeRoles(e.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const saveRole = useCallback(async (id: string | null, d: RoleDraft): Promise<{ error: string | null; id: string | null }> => {
    if (!d.name.trim()) return { error: 'Give the role a name.', id: null }
    const row: Row = {
      name: d.name.trim(), department_id: d.departmentId, client_scoped: d.clientScoped, held_by: d.heldBy,
      assigned_by_role_id: d.assignedByRoleId, page_holder: d.pageHolder, sort_order: d.sortOrder, is_active: d.isActive,
    }
    if (isDemo()) {
      const role: Role = { ...d, id: id ?? newId('role'), name: d.name.trim() }
      setRoles((p) => (id ? p.map((x) => (x.id === id ? role : x)) : [...p, role]))
      return { error: null, id: role.id }
    }
    const q = id ? supabase.from('roles').update(row).eq('id', id) : supabase.from('roles').insert(row)
    const { data, error: err } = await q.select('*').single()
    if (err) {
      if (err.code === '23505') return { error: err.message.includes('page_holder') ? 'Only one role can be the page holder.' : 'A role with that name already exists.', id: null }
      if (err.code === '23514') return { error: 'That combination does not work — a per-client role is given on a client\'s Team, and "everyone in a department" needs the department.', id: null }
      return { error: err.message, id: null }
    }
    if (!data) return { error: 'You do not have permission to change roles.', id: null }
    const saved = toRole(data as Row)
    setRoles((p) => (id ? p.map((x) => (x.id === id ? saved : x)) : [...p, saved]))
    return { error: null, id: saved.id }
  }, [])

  /** One tick on the capability list. Optimistic — the box moves at once
   *  and moves back, loudly, if the database refuses. */
  const setCapability = useCallback(async (roleId: string, capability: Capability, on: boolean): Promise<string | null> => {
    const apply = (want: boolean) => setCaps((p) => (want
      ? (p.some((c) => c.roleId === roleId && c.capability === capability) ? p : [...p, { roleId, capability }])
      : p.filter((c) => !(c.roleId === roleId && c.capability === capability))))
    apply(on)
    if (isDemo()) return null
    const { error: err } = on
      ? await supabase.from('role_capabilities').insert({ role_id: roleId, capability })
      : await supabase.from('role_capabilities').delete().eq('role_id', roleId).eq('capability', capability)
    if (err) { apply(!on); return err.message }
    return null
  }, [])

  const grant = useCallback(async (employeeId: string, roleId: string, departmentId: string | null): Promise<string | null> => {
    if (isDemo()) {
      setEmployeeRoles((p) => [...p, { id: newId('er'), employeeId, roleId, departmentId, grantedAt: new Date().toISOString() }])
      return null
    }
    const { data, error: err } = await supabase.from('employee_roles')
      .insert({ employee_id: employeeId, role_id: roleId, department_id: departmentId }).select('*').single()
    if (err) return err.code === '23505' ? 'They already hold that role.' : err.message
    setEmployeeRoles((p) => [...p, toEmployeeRole(data as Row)])
    return null
  }, [])

  const revoke = useCallback(async (id: string): Promise<string | null> => {
    const before = employeeRoles
    setEmployeeRoles((p) => p.filter((x) => x.id !== id))
    if (isDemo()) return null
    const { error: err } = await supabase.from('employee_roles').delete().eq('id', id)
    if (err) { setEmployeeRoles(before); return err.message }
    return null
  }, [employeeRoles])

  return { roles, caps, employeeRoles, installed, loading, error, reload: () => load(true), saveRole, setCapability, grant, revoke }
}

export type AccessDataHook = ReturnType<typeof useAccessData>
