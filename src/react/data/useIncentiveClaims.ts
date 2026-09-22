import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoIncentiveClaims, demoIncentiveRules, demoPages, isDemo } from '@/data/demo'
import type { IncentiveClaim } from '@/lib/hr'

type Row = Record<string, unknown>

const toClaim = (r: Row): IncentiveClaim => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  departmentId: String(r.department_id),
  pageId: (r.page_id as string | null) ?? null,
  reelUrl: String(r.reel_url ?? ''),
  views: Number(r.views) || 0,
  viewsCheckedAt: (r.views_checked_at as string | null) ?? null,
  watchUntil: String(r.watch_until ?? ''),
  tierRuleId: (r.tier_rule_id as string | null) ?? null,
  currentAmount: Number(r.current_amount) || 0,
  rejected: r.rejected === true,
  decidedBy: (r.decided_by as string | null) ?? null,
  decidedAt: (r.decided_at as string | null) ?? null,
  decisionNote: (r.decision_note as string | null) ?? null,
  createdAt: String(r.created_at ?? ''),
})

export interface IncentiveClaimDraft {
  employeeId: string
  departmentId: string
  /** Which of the employee's assigned Pages this reel went on (0032) — picked
   *  from a real page, not typed loose. */
  pageId: string
  reelUrl: string
  /** HR can type a starting view count at submission; an employee cannot —
   *  the insert policy (0031) only trusts self-submitted rows, so the app
   *  never sends a nonzero value on an employee's own submit. */
  views?: number
}

let channelSeq = 0

/**
 * Department-incentive claims (0031) — one row per reel. Realtime like
 * useVisitEntries: HR's review list needs to see a fresh submission land
 * without a manual reload, the same reason visit/WFH requests do.
 */
export function useIncentiveClaims(enabled = true, onIncoming?: (row: IncentiveClaim) => void) {
  const [rows, setRows] = useState<IncentiveClaim[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  const rowsRef = useRef<IncentiveClaim[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoIncentiveClaims)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('incentive_claims').select('*').order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toClaim(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase.channel(`incentive-claims-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incentive_claims' }, (p: any) => {
          const row = toClaim(p.new as Row)
          if (rowsRef.current.some((r) => r.id === row.id)) return
          setRows((prev) => [row, ...prev])
          onIncoming?.(row)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incentive_claims' }, (p: any) => {
          const row = toClaim(p.new as Row)
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
        })
        .subscribe()
    } catch (e) {
      console.error('[Metrol CRM] incentive claims realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled, onIncoming])

  const create = useCallback(async (draft: IncentiveClaimDraft): Promise<string | null> => {
    const clean = draft.reelUrl.trim()
    if (!clean) return 'Paste the reel link.'
    const watchUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (isDemo()) {
      setRows((p) => [{
        id: 'demo-ic-' + (p.length + 1), employeeId: draft.employeeId, departmentId: draft.departmentId,
        pageId: draft.pageId, reelUrl: clean,
        views: draft.views ?? 0, viewsCheckedAt: draft.views ? new Date().toISOString() : null,
        watchUntil, tierRuleId: null, currentAmount: 0, rejected: false,
        decidedBy: null, decidedAt: null, decisionNote: null, createdAt: new Date().toISOString(),
      }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('incentive_claims')
      .insert({
        employee_id: draft.employeeId, department_id: draft.departmentId, page_id: draft.pageId,
        reel_url: clean, views: draft.views ?? 0, watch_until: watchUntil,
      })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toClaim(data as Row), ...p])
    return null
  }, [])

  /** HR typing today's view count in — later, the Apify Edge Function calls
   *  this same path. The tier and current_amount are recomputed by the
   *  database trigger (set_incentive_tier, 0031/0032), never set here
   *  directly — demo mode has no database, so it mirrors that same rule here
   *  instead, reading the page's own type off demoPages rather than a
   *  free-typed field the claim no longer carries. */
  const setViews = useCallback(async (id: string, views: number): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => {
        if (r.id !== id) return r
        const pageType = demoPages.find((pg) => pg.id === r.pageId)?.pageType
        const best = demoIncentiveRules
          .filter((rule) => rule.isActive && rule.departmentId === r.departmentId && rule.pageType === pageType && rule.minViews <= views)
          .sort((a, b) => b.minViews - a.minViews)[0]
        return {
          ...r, views, viewsCheckedAt: new Date().toISOString(),
          tierRuleId: best?.id ?? null, currentAmount: best?.amount ?? 0,
        }
      }))
      return null
    }
    const patch: Row = { views, views_checked_at: new Date().toISOString() }
    const { data, error: err } = await supabase
      .from('incentive_claims').update(patch).eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toClaim(data as Row) : r)))
    return null
  }, [])

  const reject = useCallback(async (id: string, decidedBy: string, note?: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, rejected: true, decidedBy, decidedAt: new Date().toISOString(), decisionNote: note ?? null } : r)))
      return null
    }
    const { data, error: err } = await supabase
      .from('incentive_claims')
      .update({ rejected: true, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note ?? null })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((r) => (r.id === id ? toClaim(data as Row) : r)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), create, setViews, reject, clearError: () => setError(null) }
}

export type IncentiveClaims = ReturnType<typeof useIncentiveClaims>
