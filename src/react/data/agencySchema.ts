import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/data/demo'

export type Row = Record<string, unknown>

/**
 * Which of the Agency OS migrations the database has — asked once per
 * session, before any Agency screen draws.
 *
 * The app deploys the moment it is pushed; the SQL runs when Adarsh pastes
 * it. For the minutes (or days) in between, the live site must keep working
 * exactly as it did, so every Agency screen asks this first and the old
 * Clients & Pages screen stays in charge until 0036 is in.
 */
export interface AgencySchema {
  /** 0035 — roles and capabilities */
  access: boolean
  /** 0036 — client master, channels, the client team */
  clients: boolean
  /** 0037 — targets, weekly views, adjustments */
  targets: boolean
  /** 0043 — workflows, stages, task statuses, content formats */
  workflows: boolean
  /** 0044 — content items, tasks, the hand-off */
  work: boolean
}

/** PostgREST's "no such table" (PGRST205 today, 42P01 from older versions). */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === 'PGRST205' || err.code === '42P01'
    || /schema cache|does not exist/i.test(err.message ?? '')
}

let probe: Promise<AgencySchema> | null = null

export function agencySchema(): Promise<AgencySchema> {
  if (isDemo()) return Promise.resolve({ access: true, clients: true, targets: true, workflows: true, work: true })
  probe ??= (async () => {
    const has = async (table: string) => {
      // A plain one-row read, NOT a HEAD request: PostgREST answers HEAD on a
      // missing table with a bodiless 404, which supabase-js turns into
      // "204 No Content, no error" — every table looked installed, and the
      // new screens switched on before the SQL had run. A GET carries the
      // PGRST205 body that says the table is not there.
      const { error } = await supabase.from(table).select('id').limit(1)
      // Anything but "missing" means the table is there — a refused read is
      // still a table that exists.
      return !isMissingTable(error)
    }
    const [access, clients, targets, workflows, work] = await Promise.all([
      has('roles'), has('client_statuses'), has('view_targets'), has('workflows'), has('content_items'),
    ])
    return { access, clients, targets, workflows, work }
  })()
  return probe
}

/** null while the question is still in flight. */
export function useAgencySchema(): AgencySchema | null {
  const [s, setS] = useState<AgencySchema | null>(null)
  useEffect(() => {
    let alive = true
    void agencySchema().then((v) => { if (alive) setS(v) })
    return () => { alive = false }
  }, [])
  return s
}

/** One table, mapped — or empty and flagged when the migration behind it is
 *  not installed yet, so the screen can say so instead of showing an error. */
export async function loadTable<T>(
  table: string,
  map: (r: Row) => T,
  // The builder's own type is supabase-js generics all the way down.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build?: (q: any) => any,
): Promise<{ rows: T[]; error: string | null; missing: boolean }> {
  let q = supabase.from(table).select('*')
  if (build) q = build(q)
  const { data, error } = await q
  if (error) {
    const missing = isMissingTable(error)
    return { rows: [], error: missing ? null : error.message, missing }
  }
  return { rows: ((data ?? []) as Row[]).map(map), error: null, missing: false }
}

export const str = (v: unknown) => (v == null ? '' : String(v))
export const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v))
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
