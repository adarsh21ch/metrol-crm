import { useCallback, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'

type Row = Record<string, unknown>

export interface AppNotification {
  id: string
  type: 'broadcast' | 'birthday' | 'shift_reminder'
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toNotification = (r: Row): AppNotification => ({
  id: str(r.id),
  type: (r.type as AppNotification['type']) ?? 'broadcast',
  title: str(r.title),
  body: str(r.body),
  createdAt: str(r.created_at),
  readAt: (r.read_at as string | null) ?? null,
})

/**
 * The in-app feed the bell reads — your own notifications only, RLS already
 * scopes the plain select the same way it scopes leave_requests for a
 * salesperson. Same shape as useLeaveRequests: fetch once per mount, a
 * realtime INSERT subscription for a live badge (0025 put this table on the
 * same publication), dedup against what this browser already has.
 */
export function useNotifications(enabled = true) {
  const [rows, setRows] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(enabled)
  const fetched = useRef(false)
  const rowsRef = useRef<AppNotification[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) { setRows([]); setLoading(false); return }
    const { data, error: err } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) { setLoading(false); return }
    setRows((data ?? []).map((r) => toNotification(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase
      .channel('notifications-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p: any) => {
        const row = toNotification(p.new as Row)
        if (rowsRef.current.some((r) => r.id === row.id)) return
        setRows((prev) => [row, ...prev])
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [enabled])

  const markRead = useCallback(async (id: string) => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, readAt: r.readAt ?? new Date().toISOString() } : r)))
    if (isDemo()) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
  }, [])

  const markAllRead = useCallback(async () => {
    const unread = rowsRef.current.filter((r) => !r.readAt).map((r) => r.id)
    if (unread.length === 0) return
    setRows((p) => p.map((r) => (r.readAt ? r : { ...r, readAt: new Date().toISOString() })))
    if (isDemo()) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread)
  }, [])

  /** HR/owner only — RLS-equivalent check lives in create_broadcast() itself,
   *  the UI hiding the composer from anyone else is a convenience only.
   *  Fires the push Edge Function right after, best-effort: the in-app row
   *  from the RPC above is already the source of truth. */
  const broadcast = useCallback(async (title: string, body: string, audience: string): Promise<string | null> => {
    if (isDemo()) return 'Broadcasts cannot be sent in demo mode.'
    const { error: err } = await supabase.rpc('create_broadcast', { p_title: title, p_body: body, p_audience: audience })
    if (err) return err.message
    void supabase.functions.invoke('send-push', { body: { title, body, audience } })
      .then(({ error: pushErr }) => { if (pushErr) void functionErrorMessage(pushErr) })
    return null
  }, [])

  const unreadCount = rows.filter((r) => !r.readAt).length

  return { rows, loading, unreadCount, reload: () => load(true), markRead, markAllRead, broadcast }
}

export type Notifications = ReturnType<typeof useNotifications>
