import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoClientFinancials, demoClientLinks, isDemo } from '@/data/demo'
import { loadTable, newId, numOrNull, str, type Row } from '@/data/agencySchema'
import type { ClientFinancials, ClientLink } from '@/lib/agency'

const toLink = (r: Row): ClientLink => ({
  id: str(r.id), clientId: str(r.client_id), label: str(r.label), url: str(r.url), sortOrder: Number(r.sort_order) || 0,
})

const toMoney = (r: Row): ClientFinancials => ({
  clientId: str(r.client_id),
  monthlyValue: numOrNull(r.monthly_value),
  paymentStatus: str(r.payment_status),
  notes: str(r.notes),
  updatedAt: str(r.updated_at),
})

/**
 * A client's links (the sheet's Podcast link, Drive folders, brand
 * guidelines…) and its money (0036). Money is its own table so RLS can hand
 * it only to whoever holds see_client_money — everyone else simply gets no
 * row back, which is how a screen knows not to show the section at all.
 */
export function useClientExtras(enabled = true) {
  const [links, setLinks] = useState<ClientLink[]>([])
  const [money, setMoney] = useState<ClientFinancials[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) { setLinks(demoClientLinks); setMoney(demoClientFinancials); setLoading(false); return }
    const [l, m] = await Promise.all([
      loadTable('client_links', toLink, (q) => q.order('sort_order', { ascending: true })),
      loadTable('client_financials', toMoney),
    ])
    setError(l.error ?? m.error)
    setLinks(l.rows); setMoney(m.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const addLink = useCallback(async (clientId: string, label: string, url: string): Promise<string | null> => {
    const l = label.trim()
    let u = url.trim()
    if (!l || !u) return 'A link needs a label and an address.'
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    const sortOrder = links.filter((x) => x.clientId === clientId).reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1
    if (isDemo()) { setLinks((p) => [...p, { id: newId('cln'), clientId, label: l, url: u, sortOrder }]); return null }
    const { data, error: err } = await supabase.from('client_links')
      .insert({ client_id: clientId, label: l, url: u, sort_order: sortOrder }).select('*').single()
    if (err) return err.message
    setLinks((p) => [...p, toLink(data as Row)])
    return null
  }, [links])

  const removeLink = useCallback(async (id: string): Promise<string | null> => {
    const before = links
    setLinks((p) => p.filter((x) => x.id !== id))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('client_links').delete().eq('id', id).select('id')
    if (err || !data?.length) { setLinks(before); return err?.message ?? 'You do not have permission to change this client.' }
    return null
  }, [links])

  const saveMoney = useCallback(async (clientId: string, patch: { monthlyValue: number | null; paymentStatus: string; notes: string }): Promise<string | null> => {
    const row = { client_id: clientId, monthly_value: patch.monthlyValue, payment_status: patch.paymentStatus.trim() || null, notes: patch.notes.trim() || null }
    if (isDemo()) {
      const next: ClientFinancials = { clientId, ...patch, updatedAt: new Date().toISOString() }
      setMoney((p) => (p.some((m) => m.clientId === clientId) ? p.map((m) => (m.clientId === clientId ? next : m)) : [...p, next]))
      return null
    }
    const { data, error: err } = await supabase.from('client_financials').upsert(row, { onConflict: 'client_id' }).select('*').single()
    if (err) return err.message
    const saved = toMoney(data as Row)
    setMoney((p) => (p.some((m) => m.clientId === clientId) ? p.map((m) => (m.clientId === clientId ? saved : m)) : [...p, saved]))
    return null
  }, [])

  return { links, money, loading, error, reload: () => load(true), addLink, removeLink, saveMoney }
}

export type ClientExtras = ReturnType<typeof useClientExtras>
