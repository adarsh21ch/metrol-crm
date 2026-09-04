import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { initials } from '@/lib/format'
import type { Lead, LeadEvent, LeadStatus, Member, Project, Quality } from '@/lib/types'
import { QUALITY, STATUS } from '@/lib/types'
import { demoAllMembers, demoEvents, demoLeads, demoMe, demoProjects, isDemo } from './demo'

interface State {
  me: Member | null
  members: Member[]
  projects: Project[]
  leads: Lead[]
  events: LeadEvent[]
  loading: boolean
  error: string | null
}

const EMPTY: State = {
  me: null, members: [], projects: [], leads: [], events: [], loading: true, error: null,
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
        me: demoMe, members: demoAllMembers, projects: demoProjects,
        leads: demoLeads, events: demoEvents, loading: false, error: null,
      })
      return
    }
    // getSession reads the JWT out of localStorage; getUser posts it to the
    // server to be revalidated. That was a whole network round trip in front of
    // every other query, on every load, for an id we already had.
    const { data: sessionRes } = await supabase.auth.getSession()
    const uid = sessionRes?.session?.user?.id ?? null

    const [profRes, projRes, leadRes, memRes, evRes] = await Promise.all([
      uid ? supabase.from('profiles').select('*').eq('id', uid).single() : Promise.resolve({ data: null, error: null }),
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('project_members').select('project_id, profiles(*)'),
      // Bounded: the feed shows eight. A lead's full trail is fetched by the
      // history drawer when it opens, so this never has to grow without limit.
      supabase.from('events').select('*').order('at', { ascending: false }).limit(200),
    ])

    const err = projRes.error || leadRes.error || memRes.error
    if (err) {
      setS({ ...EMPTY, loading: false, error: err.message })
      return
    }

    const toMember = (p: any): Member => ({
      id: p.id,
      name: p.name || String(p.email ?? '').split('@')[0] || 'Unknown',
      initials: initials(p.name || p.email || '?'),
      email: p.email ?? null,
      role: p.role,
    })

    // PostgREST types an embedded to-one join as an array; normalise both shapes.
    const joined = (memRes.data ?? []).flatMap((r: any) => {
      const ps = Array.isArray(r.profiles) ? r.profiles : r.profiles ? [r.profiles] : []
      return ps.map((p: any) => ({ member: toMember(p), projectId: r.project_id as string }))
    })

    const byId = new Map<string, Member>()
    for (const j of joined) byId.set(j.member.id, j.member)
    const meRow = (profRes as any).data
    const me = meRow ? toMember(meRow) : null
    // The signed-in user belongs in the list even before anyone assigns them to
    // a project, otherwise their own name renders as "Unknown".
    if (me && !byId.has(me.id)) byId.set(me.id, me)

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
      leads: (leadRes.data ?? []).map((l: any): Lead => ({
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
      })),
      events: [...(evRes.data ?? [])].reverse().map((e: any): LeadEvent => ({
        id: e.id,
        leadId: e.lead_id,
        what: e.what,
        from: e.from_val ?? '',
        to: e.to_val ?? '',
        by: e.by_name ?? '—',
        at: new Date(e.at).getTime(),
      })),
      loading: false,
      error: null,
    })
  }, [])

  useEffect(() => { void load() }, [load])

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
    await write(l.id, { ownerId, isNew: !!ownerId }, { owner_id: ownerId })
    await log(l.id, 'Assigned', was, ownerId ? memberName(ownerId) : 'Unassigned', 'Owner')
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
            convertedAt: null, createdAt: new Date().toISOString(), isNew: true,
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
    }
    await load()
    return { added: data?.length ?? 0, error: null }
  }, [load])

  return {
    ...s,
    memberName,
    setStatus, setQuality, setOwner, setVerified, recordSale, addLeads,
    reload: load,
    clearError: () => setS((p) => ({ ...p, error: null })),
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
