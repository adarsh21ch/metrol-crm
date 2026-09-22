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
})

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
        createdAt: new Date().toISOString(),
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

  return { rows, loading, error, reload: () => load(true), add, update, setActive, clearError: () => setError(null) }
}

export type Clients = ReturnType<typeof useClients>
