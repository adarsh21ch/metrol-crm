import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoClientAssignments, demoEmployees, isDemo } from '@/data/demo'
import { loadTable, newId, str, type Row } from '@/data/agencySchema'
import type { ClientAssignment } from '@/lib/agency'

/** A team row with the person's name on it — read through v_client_team
 *  (0036), because employees' own RLS would not hand an SMM a colleague's
 *  name. */
export interface TeamRow extends ClientAssignment {
  fullName: string
  designation: string
  /** the person's own department, not the client's */
  employeeDepartmentId: string | null
  profileId: string | null
}

export interface StaffPick { id: string; fullName: string; designation: string; departmentId: string | null }

const toRow = (r: Row): TeamRow => ({
  id: str(r.id),
  clientId: str(r.client_id),
  employeeId: str(r.employee_id),
  roleId: str(r.role_id),
  assignedAt: str(r.assigned_at),
  endedAt: (r.ended_at as string | null) ?? null,
  fullName: str(r.full_name) || 'Former employee',
  designation: str(r.designation),
  employeeDepartmentId: (r.department_id as string | null) ?? null,
  profileId: (r.profile_id as string | null) ?? null,
})

const demoRow = (a: ClientAssignment): TeamRow => {
  const e = demoEmployees.find((x) => x.id === a.employeeId)
  return {
    ...a, fullName: e?.fullName ?? 'Former employee', designation: e?.designation ?? '',
    employeeDepartmentId: e?.departmentId ?? null, profileId: e?.profileId ?? null,
  }
}

/**
 * Who is on which client, in which role — and who WAS (0036). Nothing is
 * deleted: ending an assignment stamps ended_at, so "who was on this client
 * in May" keeps an answer. Loaded once for every client the person can see.
 */
export function useClientTeam(enabled = true) {
  const [rows, setRows] = useState<TeamRow[]>([])
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoClientAssignments.map(demoRow))
      setLoading(false)
      return
    }
    const r = await loadTable('v_client_team', toRow, (q) => q.order('assigned_at', { ascending: true }))
    setInstalled(!r.missing)
    setError(r.error)
    setRows(r.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** The chain decides who may call this (§3.3) — the database checks it. */
  const add = useCallback(async (clientId: string, person: StaffPick, roleId: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [...p, {
        id: newId('ca'), clientId, employeeId: person.id, roleId, assignedAt: new Date().toISOString(), endedAt: null,
        fullName: person.fullName, designation: person.designation, employeeDepartmentId: person.departmentId, profileId: null,
      }])
      return null
    }
    const { data, error: err } = await supabase.from('client_assignments')
      .insert({ client_id: clientId, employee_id: person.id, role_id: roleId }).select('id').single()
    if (err) return err.code === '23505' ? `${person.fullName} is already on this client in that role.` : err.message
    const { data: full } = await supabase.from('v_client_team').select('*').eq('id', (data as Row).id).single()
    setRows((p) => [...p, full ? toRow(full as Row) : {
      id: str((data as Row).id), clientId, employeeId: person.id, roleId, assignedAt: new Date().toISOString(), endedAt: null,
      fullName: person.fullName, designation: person.designation, employeeDepartmentId: person.departmentId, profileId: null,
    }])
    return null
  }, [])

  /** Ends, never deletes. When it was their last role on the client, the
   *  database also hands back that client's pages (0036). */
  const end = useCallback(async (id: string): Promise<string | null> => {
    const at = new Date().toISOString()
    setRows((p) => p.map((r) => (r.id === id ? { ...r, endedAt: at } : r)))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('client_assignments').update({ ended_at: at }).eq('id', id).select('id')
    if (err || !data?.length) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, endedAt: null } : r)))
      return err?.message ?? 'You do not have permission to change this team.'
    }
    return null
  }, [])

  /** Everybody this person may put on this client — names only (0036). */
  const assignableStaff = useCallback(async (clientId: string): Promise<StaffPick[]> => {
    if (isDemo()) {
      return demoEmployees.filter((e) => e.status !== 'resigned')
        .map((e) => ({ id: e.id, fullName: e.fullName, designation: e.designation, departmentId: e.departmentId }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
    }
    const { data, error: err } = await supabase.rpc('assignable_staff', { p_client: clientId })
    if (err) return []
    return ((data ?? []) as Row[]).map((r) => ({
      id: str(r.id), fullName: str(r.full_name), designation: str(r.designation), departmentId: (r.department_id as string | null) ?? null,
    }))
  }, [])

  return { rows, installed, loading, error, reload: () => load(true), add, end, assignableStaff }
}

export type ClientTeam = ReturnType<typeof useClientTeam>
