import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoIncentivePayouts, isDemo } from '@/data/demo'
import type { IncentivePayout } from '@/lib/hr'

type Row = Record<string, unknown>

const toPayout = (r: Row): IncentivePayout => ({
  id: String(r.id),
  claimId: String(r.claim_id),
  amount: Number(r.amount) || 0,
  period: String(r.period ?? ''),
  approvedBy: (r.approved_by as string | null) ?? null,
  approvedAt: String(r.approved_at ?? ''),
})

/**
 * The paid ledger for incentive claims (0031) — one row per approval event,
 * never edited or overwritten. A payslip's incentive figure is the sum of
 * this table for one employee + period; how much a claim has "already been
 * paid" is the sum of its own rows here, computed client-side rather than
 * stored, so approving the same claim twice (an initial tier, then a later
 * top-up) never has two different numbers to keep in sync.
 */
export function useIncentivePayouts(enabled = true) {
  const [rows, setRows] = useState<IncentivePayout[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoIncentivePayouts)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('incentive_payouts').select('*').order('approved_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toPayout(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** The approve action — a claim's owed amount (current_amount minus what
   *  this table already shows for it) becomes a new row here, tagged to
   *  whichever period HR picks. This IS the approval; there is no separate
   *  status flip on the claim itself. */
  const approve = useCallback(async (claimId: string, amount: number, period: string, approvedBy: string): Promise<string | null> => {
    if (amount <= 0) return 'Nothing owed on this claim.'
    if (isDemo()) {
      setRows((p) => [{ id: 'demo-ip-' + (p.length + 1), claimId, amount, period, approvedBy, approvedAt: new Date().toISOString() }, ...p])
      return null
    }
    const { data, error: err } = await supabase
      .from('incentive_payouts')
      .insert({ claim_id: claimId, amount, period, approved_by: approvedBy })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toPayout(data as Row), ...p])
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), approve, clearError: () => setError(null) }
}

export type IncentivePayouts = ReturnType<typeof useIncentivePayouts>
