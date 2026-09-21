import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'

type Row = Record<string, unknown>

export interface AppNotification {
  id: string
  type: 'broadcast' | 'birthday' | 'shift_reminder' | 'visit_request' | 'wfh_request'
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Makes every realtime topic its own — see the subscribe effect below. */
let channelSeq = 0

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
    /* The topic is unique per mount, never the bare 'notifications-live' it
       used to be. supabase.channel() hands back an EXISTING channel when the
       topic matches, and .on('postgres_changes') THROWS on a channel that has
       already subscribed — an uncaught throw in an effect, which unmounts the
       whole tree and paints the window white. That is the 2026-09-18 crash.
       The provider below makes two subscribers impossible; a topic nobody
       else can collide with makes it harmless if it ever happens again, and
       also settles the unmount/remount race, since removeChannel() is async
       and the old channel is still in the client's list while it drains. */
    const channel = supabase.channel(`notifications-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p: any) => {
          const row = toNotification(p.new as Row)
          if (rowsRef.current.some((r) => r.id === row.id)) return
          setRows((prev) => [row, ...prev])
        })
        .subscribe()
    } catch (e) {
      /* A live badge is a nicety; the feed itself still loads above and
         reloads whenever the bell is opened. Losing the subscription must
         cost the badge, never the screen. */
      console.error('[Metrol CRM] notifications realtime unavailable:', e)
    }
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

/**
 * The other direction — an ordinary employee's visit entry or WFH request
 * reaching HR, not HR broadcasting down. Not part of the hook above: nothing
 * here reads `rows` or needs a component around it, and every caller (the
 * two request modals) already has nothing else from useNotifications loaded.
 *
 * Best-effort and silent by design, same reasoning as `broadcast`'s push
 * call: the request itself is already saved by the time this runs (0028's
 * notify_approvers() is the in-app row, this is delivery on top of it), so a
 * failure here must never read to the employee as their request failing.
 * Errors go to the console for whoever is watching, not to the person who
 * just filed a visit entry.
 */
export async function notifyApprovers(type: 'visit_request' | 'wfh_request', title: string, body: string): Promise<void> {
  if (isDemo()) return
  const { error: err } = await supabase.rpc('notify_approvers', { p_type: type, p_title: title, p_body: body })
  if (err) { console.error('[Metrol CRM] notify_approvers failed:', err.message); return }
  void supabase.functions.invoke('notify-approvers', { body: { title, body } })
    .then(({ error: pushErr }) => { if (pushErr) void functionErrorMessage(pushErr).then((m) => console.error('[Metrol CRM] notify-approvers push failed:', m)) })
}

/* ───────────────────────────────────────────────────────────────────────────
   One feed per session, not one per bell.

   AccountControls renders TWICE on every screen that has a rail — the rail's
   copy and the topbar's — and which of the two you see is decided in CSS, not
   in React: both are mounted, always. So a hook called from inside it ran
   twice, and two subscribers on one realtime topic is what threw the error
   that painted the dashboard white for the owner (never for a member, whose
   screen has no rail, and never in demo, where the subscribe is skipped).

   Holding the feed above the screens fixes the cause rather than the symptom:
   there is exactly one fetch and one subscription for the whole session, the
   two bells can no longer disagree about the unread count, and navigating
   between screens no longer tears the subscription down and builds it again.
   ───────────────────────────────────────────────────────────────────────── */

const FeedContext = createContext<Notifications | null>(null)

export function NotificationsProvider(
  { enabled, children }: { enabled: boolean; children: React.ReactNode },
) {
  const feed = useNotifications(enabled)
  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>
}

/** The bell's way in. Throws rather than returning an empty feed, because a
 *  bell rendered outside the provider would otherwise sit there silently
 *  claiming you have no notifications. */
export function useNotificationFeed(): Notifications {
  const feed = useContext(FeedContext)
  if (!feed) throw new Error('NotificationBell rendered outside NotificationsProvider')
  return feed
}
