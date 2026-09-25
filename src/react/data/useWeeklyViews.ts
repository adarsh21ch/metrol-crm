import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoWeeklyViews, isDemo } from '@/data/demo'
import { isMissingTable, str, numOrNull, type Row } from '@/data/agencySchema'
import { shrinkImage } from '@/lib/shrinkImage'
import type { WeeklyView } from '@/lib/agency'

const toWeekly = (r: Row): WeeklyView => ({
  id: str(r.id),
  channelId: str(r.channel_id),
  weekStart: str(r.week_start),
  views: Number(r.views) || 0,
  followers: numOrNull(r.followers),
  proofPath: (r.proof_path as string | null) ?? null,
  enteredBy: (r.entered_by as string | null) ?? null,
  enteredAt: str(r.entered_at),
  updatedBy: (r.updated_by as string | null) ?? null,
  updatedAt: (r.updated_at as string | null) ?? null,
})

export interface WeeklyEdit {
  id: string
  action: 'update' | 'delete'
  editedBy: string | null
  editedAt: string
  before: { views: number; followers: number | null }
  after: { views: number; followers: number | null } | null
}

/* Demo mode shares ONE list across every screen that asks, so a number typed
   on "This week" is there on the client's grid a moment later — the same
   thing the database gives the live app for free. */
let demoStore: WeeklyView[] | null = null
export const demoRows = () => (demoStore ??= [...demoWeeklyViews])

/** PostgREST hands back at most 1,000 rows a request; a busy client passes
 *  that in a year (26 channels × 40 weeks). Read in pages until it stops. */
const PAGE = 1000

/**
 * One number per channel per week (0037) — for the channels asked for, from
 * a week onward. The client's grid asks for all its channels; "This week"
 * asks for the pages one person holds. Writes go through the same RLS the
 * database enforces: an SMM only for pages they hold, the head for any.
 */
export function useWeeklyViews(channelIds: string[], fromWeek: string | null, enabled = true) {
  const [rows, setRows] = useState<WeeklyView[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const key = useMemo(() => [...channelIds].sort().join(',') + '|' + (fromWeek ?? ''), [channelIds, fromWeek])
  const ids = useRef(channelIds)
  useEffect(() => { ids.current = channelIds }, [channelIds])
  const loadedKey = useRef<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (loadedKey.current === key && !force) { setLoading(false); return }
    loadedKey.current = key
    const want = new Set(ids.current)
    if (isDemo()) {
      setRows(demoRows().filter((w) => want.has(w.channelId) && (!fromWeek || w.weekStart >= fromWeek)))
      setLoading(false)
      return
    }
    if (want.size === 0) { setRows([]); setLoading(false); return }
    const out: WeeklyView[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('weekly_views').select('*').in('channel_id', [...want])
      if (fromWeek) q = q.gte('week_start', fromWeek)
      const { data, error: err } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (err) {
        setError(isMissingTable(err) ? null : err.message)
        break
      }
      out.push(...((data ?? []) as Row[]).map(toWeekly))
      if (!data || data.length < PAGE) break
    }
    setRows(out)
    setLoading(false)
  }, [enabled, key, fromWeek])

  useEffect(() => { void load() }, [load])

  const put = (row: WeeklyView) => {
    if (isDemo()) {
      const store = demoRows()
      const i = store.findIndex((w) => w.channelId === row.channelId && w.weekStart === row.weekStart)
      if (i >= 0) store[i] = row; else store.push(row)
    }
    setRows((p) => {
      const i = p.findIndex((w) => w.channelId === row.channelId && w.weekStart === row.weekStart)
      if (i < 0) return [...p, row]
      const next = [...p]; next[i] = row; return next
    })
  }

  /** A week's number (and, when given, followers). Optimistic, and louder
   *  than the success if the database says no. */
  const saveViews = useCallback(async (channelId: string, weekStart: string, views: number, followers?: number | null): Promise<string | null> => {
    if (!Number.isFinite(views) || views < 0) return 'Views must be a number, 0 or more.'
    const before = rows.find((w) => w.channelId === channelId && w.weekStart === weekStart) ?? null
    const now = new Date().toISOString()
    const optimistic: WeeklyView = before
      ? { ...before, views: Math.round(views), followers: followers === undefined ? before.followers : followers, updatedAt: now }
      : { id: 'pending-' + channelId + weekStart, channelId, weekStart, views: Math.round(views), followers: followers ?? null,
          proofPath: null, enteredBy: null, enteredAt: now, updatedBy: null, updatedAt: null }
    put(optimistic)
    if (isDemo()) return null
    const row: Row = { channel_id: channelId, week_start: weekStart, views: Math.round(views) }
    if (followers !== undefined) row.followers = followers
    const { data, error: err } = await supabase.from('weekly_views')
      .upsert(row, { onConflict: 'channel_id,week_start' }).select('*').single()
    if (err || !data) {
      if (before) put(before)
      else setRows((p) => p.filter((w) => !(w.channelId === channelId && w.weekStart === weekStart)))
      return err?.message ?? 'You cannot enter views for this page.'
    }
    put(toWeekly(data as Row))
    return null
  }, [rows])

  /** Many weeks at once — the sheet import. One request per 500 numbers,
   *  not one per cell; a refused chunk is reported, the rest still land. */
  const bulkSave = useCallback(async (items: { channelId: string; weekStart: string; views: number }[]): Promise<{ saved: number; error: string | null }> => {
    if (isDemo()) {
      for (const it of items) {
        const before = demoRows().find((w) => w.channelId === it.channelId && w.weekStart === it.weekStart)
        put(before ? { ...before, views: it.views, updatedAt: new Date().toISOString() } : {
          id: `wv-${it.channelId}-${it.weekStart}`, channelId: it.channelId, weekStart: it.weekStart, views: it.views, followers: null,
          proofPath: null, enteredBy: null, enteredAt: new Date().toISOString(), updatedBy: null, updatedAt: null,
        })
      }
      return { saved: items.length, error: null }
    }
    let saved = 0
    let error: string | null = null
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500).map((it) => ({ channel_id: it.channelId, week_start: it.weekStart, views: it.views }))
      const { data, error: err } = await supabase.from('weekly_views').upsert(chunk, { onConflict: 'channel_id,week_start' }).select('*')
      if (err) { error = err.message; continue }
      for (const r of (data ?? []) as Row[]) put(toWeekly(r))
      saved += data?.length ?? 0
    }
    return { saved, error }
  }, [])

  /** The sheet's SS column: a screenshot, shrunk before it leaves the phone
   *  (the joining form's pattern), in the private view-proofs bucket. */
  const attachProof = useCallback(async (channelId: string, weekStart: string, file: File): Promise<string | null> => {
    const row = rows.find((w) => w.channelId === channelId && w.weekStart === weekStart)
    if (!row) return 'Enter the number first, then its screenshot.'
    if (isDemo()) { put({ ...row, proofPath: `${channelId}/${weekStart}-demo.jpg` }); return null }
    const small = await shrinkImage(file)
    const ext = small.type === 'image/png' ? 'png' : small.type === 'application/pdf' ? 'pdf' : 'jpg'
    const path = `${channelId}/${weekStart}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('view-proofs').upload(path, small, { contentType: small.type || 'image/jpeg' })
    if (upErr) return upErr.message
    const { data, error: err } = await supabase.from('weekly_views').update({ proof_path: path }).eq('id', row.id).select('*').single()
    if (err || !data) return err?.message ?? 'You cannot change this week\'s screenshot.'
    put(toWeekly(data as Row))
    return null
  }, [rows])

  /** A short-lived link — nobody holds a permanent public URL to a proof. */
  const proofUrl = useCallback(async (path: string): Promise<string | null> => {
    if (isDemo()) return null
    const { data } = await supabase.storage.from('view-proofs').createSignedUrl(path, 300)
    return data?.signedUrl ?? null
  }, [])

  /** Every change to one week's number, newest first (weekly_view_edits). */
  const history = useCallback(async (weeklyViewId: string): Promise<WeeklyEdit[]> => {
    if (isDemo() || weeklyViewId.startsWith('pending-')) return []
    const { data } = await supabase.from('weekly_view_edits').select('*')
      .eq('weekly_view_id', weeklyViewId).order('edited_at', { ascending: false })
    return ((data ?? []) as Row[]).map((r) => {
      const b = (r.before_row ?? {}) as Row
      const a = (r.after_row ?? null) as Row | null
      return {
        id: str(r.id), action: r.action === 'delete' ? 'delete' : 'update', editedBy: (r.edited_by as string | null) ?? null,
        editedAt: str(r.edited_at),
        before: { views: Number(b.views) || 0, followers: numOrNull(b.followers) },
        after: a ? { views: Number(a.views) || 0, followers: numOrNull(a.followers) } : null,
      }
    })
  }, [])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const row = rows.find((w) => w.id === id)
    if (!row) return null
    setRows((p) => p.filter((w) => w.id !== id))
    if (isDemo()) { demoStore = demoRows().filter((w) => w.id !== id); return null }
    const { data, error: err } = await supabase.from('weekly_views').delete().eq('id', id).select('id')
    if (err || !data?.length) { put(row); return err?.message ?? 'Only whoever sets this client\'s targets can remove a week.' }
    return null
  }, [rows])

  return { rows, loading, error, reload: () => load(true), saveViews, bulkSave, attachProof, proofUrl, history, remove }
}

export type WeeklyViews = ReturnType<typeof useWeeklyViews>
