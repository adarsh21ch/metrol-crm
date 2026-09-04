import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anon)

// || rather than ??: an unset Vite variable arrives as an empty string, and
// createClient throws on an empty key — which took the whole app to a blank page.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
})

const DAY = 86400000
const daysAgo = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : 0)

function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('')
}

function agoWords(iso) {
  if (!iso) return 'just now'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' minutes ago'
  if (s < 86400) return Math.round(s / 3600) + ' hours ago'
  if (s < 172800) return 'Yesterday'
  if (s < 604800) return Math.round(s / 86400) + ' days ago'
  return 'Last week'
}

/* --------------------------------------------------------------------------
   The prototype's arrays are the contract. Everything below exists to hand it
   exactly the shapes it already knows how to render, so none of the UI or the
   logic above has to care that the rows now come from Postgres.
   -------------------------------------------------------------------------- */

export async function loadWorkspace() {
  const [{ data: me }, projRes, leadRes, memRes, evRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('projects').select('*').order('created_at', { ascending: true }),
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    supabase.from('project_members').select('project_id, profiles(*)'),
    supabase.from('events').select('*').order('at', { ascending: true }),
  ])

  const uid = me?.user?.id ?? null
  const { data: profile } = uid
    ? await supabase.from('profiles').select('*').eq('id', uid).single()
    : { data: null }

  const projects = projRes.data ?? []
  const leadRows = leadRes.data ?? []

  // PostgREST types an embedded to-one join as an array; normalise both shapes.
  const memberRows = (memRes.data ?? []).flatMap((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles : r.profiles ? [r.profiles] : []
    return p.map((x) => ({ ...x, project_id: r.project_id }))
  })

  const byId = new Map()
  for (const m of memberRows) if (!byId.has(m.id)) byId.set(m.id, m)
  // The signed-in user belongs in the member list even before anyone assigns
  // them to a project, otherwise their own name renders as "Unknown".
  if (profile && !byId.has(profile.id)) byId.set(profile.id, profile)

  const MEMBERS = [...byId.values()].map((m) => ({
    id: m.id, name: m.name || (m.email || '').split('@')[0], initials: initialsOf(m.name || m.email),
  }))

  const nameOf = new Map(projects.map((p) => [p.id, p.name]))

  const LEADS = leadRows.map((l) => ({
    id: l.id,
    pid: l.project_id,
    project: nameOf.get(l.project_id) || '',
    name: l.name,
    email: l.email || '',
    phone: l.phone || '',
    status: l.status,
    quality: l.quality,
    owner: l.owner_id,
    amount: Number(l.amount) || 0,
    verified: !!l.verified,
    daysAgo: daysAgo(l.converted_at || l.created_at),
    isNew: false,
    source: 'Meta lead form',
  }))

  const PROJECTS = projects.map((p) => {
    const mine = LEADS.filter((l) => l.pid === p.id)
    const conv = mine.filter((l) => l.status === 'converted')
    return {
      id: p.id,
      name: p.name,
      desc: p.description || '',
      status: p.status === 'active' ? 'Active' : p.status === 'paused' ? 'Paused' : 'Done',
      // Every project is real now; none of them is a stub that shows a toast.
      live: true,
      team: memberRows.filter((m) => m.project_id === p.id).length,
      updated: agoWords(p.updated_at || p.created_at),
      leads: mine.length,
      customers: conv.length,
      gross: conv.reduce((s, l) => s + l.amount, 0),
    }
  })

  const EVENTS = (evRes.data ?? []).map((e) => ({
    id: e.id, leadId: e.lead_id, what: e.what,
    from: e.from_val || '', to: e.to_val || '',
    by: e.by_name || '—', at: new Date(e.at).getTime(),
  }))

  return {
    MEMBERS, PROJECTS, LEADS, EVENTS,
    me: profile ? { id: profile.id, name: profile.name, email: profile.email, role: profile.role } : null,
    error: projRes.error || leadRes.error || null,
  }
}

/** Fire-and-report: the UI has already moved, so a failure surfaces as a toast
 *  rather than silently diverging from what the screen shows. */
export async function saveLead(id, patch) {
  const row = {}
  if ('status' in patch) row.status = patch.status
  if ('quality' in patch) row.quality = patch.quality
  if ('owner' in patch) row.owner_id = patch.owner
  if ('verified' in patch) row.verified = patch.verified
  if ('amount' in patch) row.amount = patch.amount
  if (patch.status === 'converted') row.converted_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(row).eq('id', id)
  return error ? error.message : null
}

export async function saveEvent(e) {
  const { error } = await supabase.from('events').insert({
    lead_id: e.leadId, what: e.what,
    from_val: e.from || '', to_val: e.to || '', by_name: e.by || '—',
    at: new Date(e.at || Date.now()).toISOString(),
  })
  return error ? error.message : null
}

export async function insertLeads(rows) {
  const { data, error } = await supabase.from('leads').insert(rows).select()
  return { data: data ?? [], error: error ? error.message : null }
}

export const auth = {
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signOut: () => supabase.auth.signOut(),
  session: () => supabase.auth.getSession(),
  onChange: (fn) => supabase.auth.onAuthStateChange(fn),
}
