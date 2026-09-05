import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { initials } from '@/lib/format'
import type { Department, Lead, LeadEvent, LeadStatus, Member, Project, Quality } from '@/lib/types'
import { QUALITY, STATUS } from '@/lib/types'
import { demoAllMembers, demoDepartments, demoEvents, demoLeads, demoMe, demoProjects, isDemo } from './demo'

interface State {
  me: Member | null
  members: Member[]
  departments: Department[]
  projects: Project[]
  leads: Lead[]
  events: LeadEvent[]
  loading: boolean
  refreshing: boolean
  error: string | null
}

/* One place that turns a Postgres row into the shape the screens use. The
   realtime handler and the initial load must agree exactly, or a row would
   change shape depending on how it arrived. */
const toLead = (l: any): Lead => ({
  id: l.id,
  projectId: l.project_id,
  name: l.name,
  email: l.email ?? '',
  phone: l.phone ?? '',
  status: l.status,
  quality: l.quality,
  ownerId: l.owner_id,
  amount: Number(l.amount) || 0,
  verified: !!l.verified,
  convertedAt: l.converted_at,
  createdAt: l.created_at,
  assignedAt: l.assigned_at ?? null,
})

const toEvent = (e: any): LeadEvent => ({
  id: e.id,
  leadId: e.lead_id,
  what: e.what,
  from: e.from_val ?? '',
  to: e.to_val ?? '',
  by: e.by_name ?? '—',
  at: new Date(e.at).getTime(),
})

const toMember = (p: any): Member => ({
  id: p.id,
  name: p.name || String(p.email ?? '').split('@')[0] || 'Unknown',
  initials: initials(p.name || p.email || '?'),
  email: p.email ?? null,
  phone: p.phone ?? null,
  avatarUrl: p.avatar_url ?? null,
  departmentId: p.department_id ?? null,
  role: p.role,
  isTeamLead: !!p.is_team_lead,
})

const toDepartment = (d: any): Department => ({
  id: d.id,
  name: d.name,
  sortOrder: d.sort_order ?? 0,
  isActive: d.is_active !== false,
})

/** A member becomes visible on the assign dropdown the moment their profile
 *  exists (see the query below); this only lets them read the project ROW
 *  itself once they actually hold a lead in it. Failures are swallowed on
 *  purpose — this is a courtesy upsert, not the write the caller is waiting
 *  on, and the same primary key means a repeat call is always a no-op. */
async function ensureProjectMember(projectId: string, profileId: string) {
  await supabase.from('project_members').upsert(
    { project_id: projectId, profile_id: profileId },
    { onConflict: 'project_id,profile_id', ignoreDuplicates: true },
  )
}

const EMPTY: State = {
  me: null, members: [], departments: [], projects: [], leads: [], events: [],
  loading: true, refreshing: false, error: null,
}

/**
 * The single place that knows about the database. Screens read arrays and call
 * intent-shaped functions (assign, setStatus); they never build a query. When a
 * finance module arrives it gets its own hook beside this one, and the screens
 * stay just as ignorant of Postgres as they are now.
 *
 * Writes are optimistic and then reconciled: the UI has already moved, so a
 * failure rolls the row back and surfaces rather than leaving a lie on screen.
 */
export function useWorkspace() {
  const [s, setS] = useState<State>(EMPTY)

  const load = useCallback(async () => {
    // Demo mode never touches the network; it exists so the interface can be
    // checked where Supabase is unreachable, and shown before data exists.
    if (isDemo()) {
      setS({
        me: demoMe, members: demoAllMembers, departments: demoDepartments, projects: demoProjects,
        leads: demoLeads, events: demoEvents, loading: false, refreshing: false, error: null,
      })
      return
    }
    // getSession reads the JWT out of localStorage; getUser posts it to the
    // server to be revalidated. That was a whole network round trip in front of
    // every other query, on every load, for an id we already had.
    const { data: sessionRes } = await supabase.auth.getSession()
    const uid = sessionRes?.session?.user?.id ?? null

    const [profRes, projRes, leadRes, memRes, evRes, deptRes] = await Promise.all([
      uid ? supabase.from('profiles').select('*').eq('id', uid).single() : Promise.resolve({ data: null, error: null }),
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      // Every salesperson, system-wide — not scoped through project_members.
      // That join used to be the only route to this list, so a brand-new
      // account was invisible to the assign dropdown until someone hand-wrote
      // a project_members row for them. The owner's RLS already permits
      // reading every profile (is_owner() in profiles_select), so this is not
      // a widening — it is reading what was already allowed.
      supabase.from('profiles').select('*').eq('role', 'member').order('created_at', { ascending: true }),
      // Bounded: the feed shows eight. A lead's full trail is fetched by the
      // history drawer when it opens, so this never has to grow without limit.
      supabase.from('events').select('*').order('at', { ascending: false }).limit(200),
      supabase.from('departments').select('*').order('sort_order', { ascending: true }),
    ])

    const err = projRes.error || leadRes.error || memRes.error
    if (err) {
      setS({ ...EMPTY, loading: false, error: err.message })
      return
    }

    const byId = new Map<string, Member>()
    for (const p of memRes.data ?? []) byId.set(p.id, toMember(p))
    const meRow = (profRes as any).data
    const me = meRow ? toMember(meRow) : null
    // A signed-in member belongs in the list even before anyone assigns them
    // to a project, otherwise their own name renders as "Unknown" — but the
    // owner is never a salesperson, so they never belong in the assign menu.
    if (me && me.role === 'member' && !byId.has(me.id)) byId.set(me.id, me)

    setS({
      me,
      members: [...byId.values()],
      projects: (projRes.data ?? []).map((p: any): Project => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        status: p.status,
        imageUrl: p.image_url ?? null,
        updatedAt: p.updated_at ?? p.created_at,
        createdAt: p.created_at,
      })),
      departments: (deptRes.data ?? []).map(toDepartment),
      leads: (leadRes.data ?? []).map(toLead),
      events: [...(evRes.data ?? [])].reverse().map(toEvent),
      loading: false,
      refreshing: false,
      error: null,
    })
  }, [])

  /** Wraps `load` with a flag a button can spin on — the visible fallback for
   *  anyone who would rather press something than trust the live update. */
  const refresh = useCallback(async () => {
    setS((p) => ({ ...p, refreshing: true }))
    await load()
  }, [load])

  useEffect(() => { void load() }, [load])

  /** The leads-table stream below is reliable once a row is already visible to
   *  a subscriber — that is the status/quality case. It is not reliable for the
   *  one event where a row *becomes* visible: assigning a lead is an UPDATE
   *  whose old image a member could never have read, and Supabase Realtime's
   *  per-event RLS re-check is documented to key off that same WAL image, so
   *  the newly-assigned member's client can miss it outright. `events` doesn't
   *  have that failure mode — its SELECT policy is a live subquery against the
   *  current `leads` row, not a snapshot of one WAL event, and by the time an
   *  "Assigned" row is logged the lead is already committed with its new
   *  owner. So every event re-reads its lead by id and reconciles it locally:
   *  a lead that newly passes RLS gets added, one that no longer does (a
   *  reassignment away) gets dropped. This runs for every event, not just
   *  "Assigned" — cheap, and it also catches the same class of gap for any
   *  other write that changes who can see a row. */
  const reconcileLead = useCallback(async (leadId: string) => {
    if (isDemo()) return
    const { data, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
    if (error) return
    setS((prev) => {
      if (!data) return { ...prev, leads: prev.leads.filter((l) => l.id !== leadId) }
      const row = toLead(data)
      const known = prev.leads.some((l) => l.id === row.id)
      return {
        ...prev,
        leads: known
          ? prev.leads.map((l) => (l.id === row.id ? { ...row, isNew: l.isNew } : l))
          : [{ ...row, isNew: true }, ...prev.leads],
      }
    })
  }, [])

  /**
   * Live updates. A salesperson setting a status and the owner watching the
   * board are two browsers looking at one table, so the change should land on
   * both without anybody reloading.
   *
   * Row level security applies to this stream exactly as it does to a query: a
   * member is only sent changes to rows they were already allowed to read, so
   * this widens nothing. Rows arrive as raw Postgres and go through the same
   * mappers the initial load uses.
   */
  useEffect(() => {
    if (isDemo()) return
    const channel = supabase
      .channel('workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p: any) => {
        setS((prev) => {
          if (p.eventType === 'DELETE') {
            return { ...prev, leads: prev.leads.filter((l) => l.id !== p.old?.id) }
          }
          const row = toLead(p.new)
          const known = prev.leads.some((l) => l.id === row.id)
          return {
            ...prev,
            leads: known
              // Keep isNew: it is a local flag about this session, not a column.
              ? prev.leads.map((l) => (l.id === row.id ? { ...row, isNew: l.isNew } : l))
              // A row this client has never seen before is, by definition, new to it.
              : [{ ...row, isNew: true }, ...prev.leads],
          }
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (p: any) => {
        setS((prev) => {
          const e = toEvent(p.new)
          if (prev.events.some((x) => x.id === e.id)) return prev   // our own write, echoed back
          return { ...prev, events: [...prev.events, e].slice(-200) }
        })
        // See reconcileLead above: the leads stream can silently miss exactly
        // this write, so every event re-checks its lead directly.
        void reconcileLead(p.new.lead_id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        void load()   // rarer, and it changes the rail and the cards together
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_members' }, () => {
        // Assigning a member's first lead in a project upserts their row here —
        // it's what projects_select needs to let them read the project itself.
        // Without this listener the project stayed invisible (name blank, not
        // in the rail) until the member reloaded, even once the lead itself
        // was showing up live.
        void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, (p: any) => {
        setS((prev) => {
          if (p.eventType === 'DELETE') {
            return { ...prev, departments: prev.departments.filter((d) => d.id !== p.old?.id) }
          }
          const row = toDepartment(p.new)
          const known = prev.departments.some((d) => d.id === row.id)
          return {
            ...prev,
            departments: (known
              ? prev.departments.map((d) => (d.id === row.id ? row : d))
              : [...prev.departments, row]
            ).sort((a, b) => a.sortOrder - b.sortOrder),
          }
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p: any) => {
        // A new signup should reach the owner's assign dropdown without
        // anyone reloading, the same way a status change reaches the board.
        const row = p.new ?? p.old
        if (!row) return
        setS((prev) => {
          if (p.eventType === 'DELETE') {
            return { ...prev, members: prev.members.filter((m) => m.id !== row.id) }
          }
          if (row.role !== 'member' && row.id !== prev.me?.id) return prev
          const m = toMember(row)
          const known = prev.members.some((x) => x.id === m.id)
          return {
            ...prev,
            members: known ? prev.members.map((x) => (x.id === m.id ? m : x)) : [...prev.members, m],
            me: prev.me?.id === m.id ? m : prev.me,
          }
        })
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [load, reconcileLead])

  const memberName = useCallback(
    (id: string | null) => (id ? (s.members.find((m) => m.id === id)?.name ?? 'Unknown') : 'Unassigned'),
    [s.members],
  )

  /** Append to the trail locally and durably, in that order. */
  const log = useCallback(async (leadId: string, what: string, from: string, to: string, by: string) => {
    const at = Date.now()
    setS((p) => ({
      ...p,
      events: [...p.events, { id: (p.events.at(-1)?.id ?? 0) + 1, leadId, what, from, to, by, at }],
    }))
    await supabase.from('events').insert({
      lead_id: leadId, what, from_val: from, to_val: to, by_name: by, at: new Date(at).toISOString(),
    })
  }, [])

  const write = useCallback(async (leadId: string, patch: Partial<Lead>, row: Record<string, unknown>) => {
    let rollback: Lead[] = []
    setS((p) => {
      rollback = p.leads
      return { ...p, leads: p.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)) }
    })
    if (isDemo()) return null
    const { error } = await supabase.from('leads').update(row).eq('id', leadId)
    if (error) {
      setS((p) => ({ ...p, leads: rollback, error: error.message }))
      return error.message
    }
    return null
  }, [])

  const setStatus = useCallback(async (l: Lead, status: LeadStatus, by: string) => {
    const was = STATUS[l.status].label
    const convertedAt = status === 'converted' ? new Date().toISOString() : null
    const patch: Partial<Lead> = { status, convertedAt, isNew: false }
    const row: Record<string, unknown> = { status, converted_at: convertedAt }
    // Leaving "converted" gives back the money fields the sale put there.
    if (status !== 'converted') { patch.amount = 0; patch.verified = false; row.amount = 0; row.verified = false }
    await write(l.id, patch, row)
    await log(l.id, 'Status', was, STATUS[status].label, by)
  }, [write, log])

  const setQuality = useCallback(async (l: Lead, quality: Quality, by: string) => {
    const was = l.quality ? QUALITY[l.quality].label : 'Not set'
    await write(l.id, { quality, isNew: false }, { quality })
    await log(l.id, 'Quality', was, QUALITY[quality].label, by)
  }, [write, log])

  const setOwner = useCallback(async (l: Lead, ownerId: string | null) => {
    const was = memberName(l.ownerId)
    const assignedAt = ownerId ? new Date().toISOString() : null
    await write(l.id, { ownerId, assignedAt, isNew: !!ownerId }, { owner_id: ownerId, assigned_at: assignedAt })
    await log(l.id, 'Assigned', was, ownerId ? memberName(ownerId) : 'Unassigned', 'Owner')
    // So the member can read the project's own row, not just their lead in it.
    if (ownerId && !isDemo()) await ensureProjectMember(l.projectId, ownerId)
  }, [write, log, memberName])

  const setVerified = useCallback(async (l: Lead, verified: boolean) => {
    const was = l.verified ? 'Verified' : 'Pending'
    await write(l.id, { verified }, { verified })
    await log(l.id, 'Payment', was, verified ? 'Verified' : 'Pending', 'Owner')
  }, [write, log])

  const recordSale = useCallback(async (l: Lead, amount: number, by: string) => {
    const convertedAt = new Date().toISOString()
    await write(
      l.id,
      { status: 'converted', amount, convertedAt, isNew: false },
      { status: 'converted', amount, converted_at: convertedAt },
    )
    await log(l.id, 'Status', STATUS[l.status].label, 'Converted', by)
    await log(l.id, 'Sale recorded', '', String(amount), by)
  }, [write, log])

  const addLeads = useCallback(async (projectId: string, rows: { name: string; email: string; phone: string; ownerId?: string | null }[]) => {
    if (isDemo()) {
      setS((p) => ({
        ...p,
        leads: [
          ...rows.map((r, i) => ({
            id: 'imp-' + Date.now() + '-' + i, projectId, name: r.name, email: r.email, phone: r.phone,
            status: 'new' as const, quality: null, ownerId: r.ownerId ?? null, amount: 0, verified: false,
            convertedAt: null, createdAt: new Date().toISOString(),
            assignedAt: r.ownerId ? new Date().toISOString() : null, isNew: true,
          })),
          ...p.leads,
        ],
      }))
      return { added: rows.length, error: null }
    }
    const { data, error } = await supabase
      .from('leads')
      .insert(rows.map((r) => ({
        name: r.name, email: r.email, phone: r.phone,
        owner_id: r.ownerId ?? null, project_id: projectId, status: 'new',
        assigned_at: r.ownerId ? new Date().toISOString() : null,
      })))
      .select()
    if (error) { setS((p) => ({ ...p, error: error.message })); return { added: 0, error: error.message } }
    // Every imported lead gets its own first line of history.
    if (data?.length) {
      await supabase.from('events').insert(
        data.map((l: any) => ({
          lead_id: l.id, what: 'Lead created', from_val: '', to_val: 'Import', by_name: 'Owner',
          at: new Date().toISOString(),
        })),
      )
      const owners = new Set(rows.map((r) => r.ownerId).filter(Boolean) as string[])
      await Promise.all([...owners].map((id) => ensureProjectMember(projectId, id)))
    }
    await load()
    return { added: data?.length ?? 0, error: null }
  }, [load])

  /** The profile fields a person edits about themselves. */
  const updateMe = useCallback(async (patch: { name?: string; phone?: string | null }) => {
    if (!s.me) return 'Not signed in.'
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.phone !== undefined) row.phone = patch.phone
    const { error } = await supabase.from('profiles').update(row).eq('id', s.me.id)
    if (error) return error.message
    setS((p) => ({
      ...p,
      me: p.me ? { ...p.me, ...patch, initials: patch.name ? initials(patch.name) : p.me.initials } : p.me,
      members: p.members.map((m) => (m.id === s.me!.id ? { ...m, ...patch } : m)),
    }))
    return null
  }, [s.me])

  const uploadAvatar = useCallback(async (file: File) => {
    if (!s.me) return { url: null, error: 'Not signed in.' }
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${s.me.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true, cacheControl: '3600',
    })
    if (upErr) return { url: null, error: upErr.message }
    // Busts any cached copy of the old photo at this same path.
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = data.publicUrl + '?v=' + Date.now()
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', s.me.id)
    if (dbErr) return { url: null, error: dbErr.message }
    setS((p) => ({
      ...p,
      me: p.me ? { ...p.me, avatarUrl: url } : p.me,
      members: p.members.map((m) => (m.id === s.me!.id ? { ...m, avatarUrl: url } : m)),
    }))
    return { url, error: null }
  }, [s.me])

  const removeAvatar = useCallback(async () => {
    if (!s.me) return 'Not signed in.'
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', s.me.id)
    if (error) return error.message
    setS((p) => ({
      ...p,
      me: p.me ? { ...p.me, avatarUrl: null } : p.me,
      members: p.members.map((m) => (m.id === s.me!.id ? { ...m, avatarUrl: null } : m)),
    }))
    return null
  }, [s.me])

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return error ? error.message : null
  }, [])

  /* ---------------------------------------------------------- owner only.
     Every one of these is refused by row level security for anybody who is
     not the owner, so the UI hiding them is a convenience rather than the
     thing keeping them safe. */

  const setMemberDepartment = useCallback(async (memberId: string, departmentId: string | null) => {
    const before = s.members
    setS((p) => ({
      ...p,
      members: p.members.map((m) => (m.id === memberId ? { ...m, departmentId } : m)),
    }))
    if (isDemo()) return null
    const { error } = await supabase.from('profiles').update({ department_id: departmentId }).eq('id', memberId)
    if (error) { setS((p) => ({ ...p, members: before, error: error.message })); return error.message }
    return null
  }, [s.members])

  const addDepartment = useCallback(async (name: string) => {
    const clean = name.trim()
    if (!clean) return 'Give the department a name.'
    const next = (s.departments.at(-1)?.sortOrder ?? 0) + 1
    if (isDemo()) {
      setS((p) => ({ ...p, departments: [...p.departments, { id: 'demo-' + next, name: clean, sortOrder: next, isActive: true }] }))
      return null
    }
    const { data, error } = await supabase
      .from('departments').insert({ name: clean, sort_order: next }).select().single()
    if (error) { setS((p) => ({ ...p, error: error.message })); return error.message }
    setS((p) => ({ ...p, departments: [...p.departments, toDepartment(data)] }))
    return null
  }, [s.departments])

  const renameDepartment = useCallback(async (id: string, name: string) => {
    const clean = name.trim()
    if (!clean) return 'Give the department a name.'
    setS((p) => ({ ...p, departments: p.departments.map((d) => (d.id === id ? { ...d, name: clean } : d)) }))
    if (isDemo()) return null
    const { error } = await supabase.from('departments').update({ name: clean }).eq('id', id)
    if (error) { setS((p) => ({ ...p, error: error.message })); return error.message }
    return null
  }, [])

  /** Retired, not deleted: people are still recorded against it, and deleting
   *  one would either orphan them or silently move them somewhere they never
   *  worked. A retired department stops being offered for new assignments. */
  const setDepartmentActive = useCallback(async (id: string, isActive: boolean) => {
    setS((p) => ({ ...p, departments: p.departments.map((d) => (d.id === id ? { ...d, isActive } : d)) }))
    if (isDemo()) return null
    const { error } = await supabase.from('departments').update({ is_active: isActive }).eq('id', id)
    if (error) { setS((p) => ({ ...p, error: error.message })); return error.message }
    return null
  }, [])

  const getInviteCode = useCallback(async () => {
    if (isDemo()) return { code: 'Metrol#9878', error: null }
    const { data, error } = await supabase.from('company_settings').select('invite_code').eq('id', 1).single()
    if (error) return { code: null, error: error.message }
    return { code: (data as any)?.invite_code as string, error: null }
  }, [])

  const setInviteCode = useCallback(async (code: string) => {
    const clean = code.trim()
    if (clean.length < 4) return 'Use at least 4 characters.'
    if (isDemo()) return null
    const { error } = await supabase
      .from('company_settings')
      .update({ invite_code: clean, updated_at: new Date().toISOString() })
      .eq('id', 1)
    return error ? error.message : null
  }, [])

  return {
    ...s,
    memberName,
    setStatus, setQuality, setOwner, setVerified, recordSale, addLeads,
    updateMe, uploadAvatar, removeAvatar, changePassword,
    setMemberDepartment, addDepartment, renameDepartment, setDepartmentActive,
    getInviteCode, setInviteCode,
    departmentName: (id: string | null) => s.departments.find((d) => d.id === id)?.name ?? null,
    reload: load,
    refresh,
    clearError: () => setS((p) => ({ ...p, error: null })),
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
