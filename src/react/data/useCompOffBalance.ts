import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'

/**
 * Round 6 (0026) — how many Compulsory/Week-off days this one person has
 * earned and not yet spent. `comp_off_balance()` is a small, cheap RPC (one
 * count() against an indexed table), so this is fetched per employee rather
 * than folded into useEmployees or useAttendance, which both load everybody.
 *
 * Demo mode has no comp-off ledger to read — it answers null (shown as "—",
 * never as 0, which would read as "you have earned nothing").
 */
export function useCompOffBalance(employeeId: string | null): number | null {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!employeeId || isDemo()) { setBalance(null); return }
    let alive = true
    void supabase.rpc('comp_off_balance', { p_employee: employeeId }).then(({ data, error }) => {
      if (!alive) return
      setBalance(error || data == null ? null : Number(data))
    })
    return () => { alive = false }
  }, [employeeId])

  return balance
}
