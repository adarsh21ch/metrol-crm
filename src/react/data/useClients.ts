import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoClients, isDemo } from '@/data/demo'
import type { Client } from '@/lib/hr'

type Row = Record<string, unknown>

const toClient = (r: Row): Client => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  notes: String(r.notes ?? ''),
  isActive: r.is_active !== false,
  createdAt: String(r.created_at ?? ''),
  // 0036's columns — absent (so empty) on a database that does not have it yet.
  code: String(r.code ?? ''),
  company: String(r.company ?? ''),
  industry: String(r.industry ?? ''),
  contactName: String(r.contact_name ?? ''),
  contactPhone: String(r.contact_phone ?? ''),
  contactEmail: String(r.contact_email ?? ''),
  startedOn: (r.started_on as string | null) ?? null,
  endsOn: (r.ends_on as string | null) ?? null,
  statusId: (r.status_id as string | null) ?? null,
  departmentId: (r.department_id as string | null) ?? null,
})

/** Everything on the client master form. Only sent once 0036 is installed —
 *  the columns do not exist before it, and naming one would fail the save. */
export interface ClientDetails {
  name: string
  notes: string
  company: string
  industry: string
  contactName: string
  contactPhone: string
  contactEmail: string
  startedOn: string | null
  endsOn: string | null
  statusId: string | null
}

const detailRow = (d: Partial<ClientDetails>): Row => {
  const row: Row = {}
  const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null)
  if (d.name !== undefined) row.name = d.name.trim()
  if (d.notes !== undefined) row.notes = text(d.notes)
  if (d.company !== undefined) row.company = text(d.company)
  if (d.industry !== undefined) row.industry = text(d.industry)
  if (d.contactName !== undefined) row.contact_name = text(d.contactName)
  if (d.contactPhone !== undefined) row.contact_phone = text(d.contactPhone)
  if (d.contactEmail !== undefined) row.contact_email = text(d.contactEmail)
  if (d.startedOn !== undefined) row.started_on = d.startedOn || null
  if (d.endsOn !== undefined) row.ends_on = d.endsOn || null
  if (d.statusId !== undefined) row.status_id = d.statusId || null
  return row
}

/**
 * The brands Metrol Media runs social accounts for (0032). Small, rarely
 * changed, no realtime — same shape as useIncentiveRules. Read by anybody
 * signed in; written by owner/HR only, enforced in clients_write (0032).
 */
export function useClients(enabled = true) {
  const [rows, setRows] = useState<Client[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoClients)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('clients').select('*').order('name', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toClient(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const add = useCallback(async (name: string, notes?: string): Promise<string | null> => {
    const clean = name.trim()
    if (!clean) return 'Give the client a name.'
    if (isDemo()) {
      setRows((p) => [...p, {
        id: 'demo-client-' + (p.length + 1), name: clean, notes: notes?.trim() ?? '', isActive: true,
        createdAt: new Date().toISOString(), code: 'MM-' + String(p.length + 1).padStart(4, '0'),
        company: '', industry: '', contactName: '', contactPhone: '', contactEmail: '',
        startedOn: null, endsOn: null, statusId: null, departmentId: 'd9',
      }])
      return null
    }
    const { data, error: err } = await supabase
      .from('clients').insert({ name: clean, notes: notes?.trim() || null }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toClient(data as Row)])
    return null
  }, [])

  const update = useCallback(async (id: string, patch: { name?: string; notes?: string }): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      return null
    }
    const row: Row = {}
    if (patch.name !== undefined) row.name = patch.name.trim()
    if (patch.notes !== undefined) row.notes = patch.notes.trim() || null
    const { error: err } = await supabase.from('clients').update(row).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    return null
  }, [])

  /** Retiring, not deleting — a client's pages and any claims made against
   *  them keep their own history. */
  const setActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((c) => (c.id === id ? { ...c, isActive } : c)))
      return null
    }
    const { error: err } = await supabase.from('clients').update({ is_active: isActive }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((c) => (c.id === id ? { ...c, isActive } : c)))
    return null
  }, [])

  /** The client master form (0036): a new client with all its details,
   *  returning its id so the caller can open it. The code (MM-0001) and the
   *  department come from the database, not the form. */
  const create = useCallback(async (d: ClientDetails): Promise<{ error: string | null; id: string | null }> => {
    if (!d.name.trim()) return { error: 'Give the client a name.', id: null }
    if (isDemo()) {
      const id = 'demo-client-' + Date.now().toString(36)
      setRows((p) => [...p, {
        id, name: d.name.trim(), notes: d.notes.trim(), isActive: true, createdAt: new Date().toISOString(),
        code: 'MM-' + String(p.length + 1).padStart(4, '0'), company: d.company.trim(), industry: d.industry.trim(),
        contactName: d.contactName.trim(), contactPhone: d.contactPhone.trim(), contactEmail: d.contactEmail.trim(),
        startedOn: d.startedOn || null, endsOn: d.endsOn || null, statusId: d.statusId || null, departmentId: 'd9',
      }])
      return { error: null, id }
    }
    const { data, error: err } = await supabase.from('clients').insert(detailRow(d)).select('*').single()
    if (err) return { error: err.message, id: null }
    const row = toClient(data as Row)
    setRows((p) => [...p, row])
    return { error: null, id: row.id }
  }, [])

  const updateDetails = useCallback(async (id: string, d: Partial<ClientDetails>): Promise<string | null> => {
    const row = detailRow(d)
    if (isDemo()) {
      setRows((p) => p.map((c) => (c.id === id ? { ...c, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) } : c)))
      return null
    }
    const { data, error: err } = await supabase.from('clients').update(row).eq('id', id).select('*').single()
    if (err) return err.message
    // An update RLS refused comes back as no row, not an error.
    if (!data) return 'You do not have permission to change this client.'
    setRows((p) => p.map((c) => (c.id === id ? toClient(data as Row) : c)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), add, update, setActive, create, updateDetails, clearError: () => setError(null) }
}

export type Clients = ReturnType<typeof useClients>
