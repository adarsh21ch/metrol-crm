import { useEffect, useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Kpi } from '@/components/bits'
import { count } from '@/lib/format'
import { doneStatusIds, fmtDue, fmtStamp, isOverdue, type Task } from '@/lib/work'
import type { Client } from '@/lib/hr'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const historyMonthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
export const stepHistoryMonth = (m: string, n: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7)
/** A month's first moment in the office (IST), as the database compares it. */
const monthStart = (m: string) => new Date(`${m}-01T00:00:00+05:30`).toISOString()

/** How late a finished task was: null on time (or no due date), else "2 days". */
function lateBy(t: Task): string | null {
  if (!t.dueAt || !t.completedAt) return null
  const ms = new Date(t.completedAt).getTime() - new Date(t.dueAt).getTime()
  if (ms <= 0) return null
  const h = Math.round(ms / 3_600_000)
  return h < 24 ? `${Math.max(1, h)} h` : `${Math.round(h / 24)} d`
}

/**
 * History — one person's work, month by month (the "employee dashboard" of
 * 2026-09-26): what they finished against last month, how much of it on
 * time, how many reels they moved on, and what is open now. Read fresh from
 * the database — the Tasks lists keep only 30 days of finished work.
 *
 * `who` is an employee id, or null for everyone this login can see.
 */
export function WorkHistory({
  work, flows, clients, who, whoName, month,
}: {
  work: Work
  flows: Workflows
  clients: Client[]
  who: string | null
  whoName: string
  month: string
}) {
  const [cur, setCur] = useState<Task[] | null>(null)
  const [prev, setPrev] = useState<Task[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { doneBetween } = work

  useEffect(() => {
    let alive = true
    setCur(null); setPrev(null); setErr(null)
    const last = stepHistoryMonth(month, -1)
    void Promise.all([
      doneBetween(who, monthStart(month), monthStart(stepHistoryMonth(month, 1))),
      doneBetween(who, monthStart(last), monthStart(month)),
    ]).then(([a, b]) => {
      if (!alive) return
      setCur(a.rows); setPrev(b.rows); setErr(a.error ?? b.error)
    })
    return () => { alive = false }
  }, [doneBetween, who, month])

  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const stageName = useMemo(() => new Map(flows.stages.map((s) => [s.id, s.name])), [flows.stages])
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])
  const open = work.tasks.filter((t) => !done.has(t.statusId) && (who ? t.assigneeId === who : true))
  const lateNow = open.filter((t) => isOverdue(t, done)).length

  const rows = cur ?? []
  const withDue = rows.filter((t) => t.dueAt)
  const onTime = withDue.filter((t) => !lateBy(t)).length
  const reels = rows.filter((t) => t.contentItemId).length
  const diff = cur && prev ? cur.length - prev.length : 0
  const pct = withDue.length ? Math.round((onTime / withDue.length) * 100) : null

  // Done per week of the month, Monday weeks, for the strip under the cards.
  const weeks = useMemo(() => {
    const out: { label: string; n: number }[] = []
    const first = new Date(`${month}-01T00:00:00Z`)
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    for (let d = 1; d <= days; d += 7) {
      const to = Math.min(days, d + 6)
      out.push({ label: `${d}–${to}`, n: 0 })
    }
    for (const t of rows) {
      const day = Number(new Date(t.completedAt!).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(8, 10))
      const w = out[Math.min(out.length - 1, Math.floor((day - 1) / 7))]
      if (w) w.n += 1
    }
    return out
  }, [rows, month])
  const peak = Math.max(1, ...weeks.map((w) => w.n))

  const cols: GridCol<Task>[] = [
    { key: 'at', label: 'Done', width: 140, render: (r) => fmtStamp(r.completedAt) },
    { key: 'code', label: 'ID', width: 90, render: (r) => <span className="cell-mono">{r.code}</span> },
    {
      key: 'task', label: 'Task', width: 300,
      render: (r) => {
        const c = r.clientId ? clientName.get(r.clientId) : null
        return <span className="work-task"><span className="cell-strong">{r.title}</span>{c && <span className="cell-mute"> · {c}</span>}</span>
      },
    },
    ...(!who ? [{ key: 'who', label: 'Who', width: 140, render: (r: Task) => r.assigneeName || <span className="cell-dash">—</span> }] : []),
    { key: 'stage', label: 'Stage', width: 130, render: (r) => (r.stageId ? stageName.get(r.stageId) ?? '—' : <span className="cell-mute">Given by hand</span>) },
    { key: 'due', label: 'Was due', width: 150, render: (r) => (r.dueAt ? fmtDue(r.dueAt) : <span className="cell-dash">—</span>) },
    {
      key: 'ontime', label: 'On time', width: 100,
      render: (r) => {
        if (!r.dueAt) return <span className="cell-dash">—</span>
        const l = lateBy(r)
        return l ? <span className="cell-late">{l} late</span> : <span className="cell-good">On time</span>
      },
    },
  ]

  const monthName = historyMonthLabel(month).split(' ')[0]
  return (
    <>
      {err && <div className="auth-err">{err}</div>}
      <div className="kpis">
        <Kpi accent label={`Done in ${monthName}`} value={cur ? cur.length : '…'}
             sub={prev ? <>{diff === 0 ? 'same as' : <b className={diff > 0 ? 'cell-good' : 'cell-late'}>{diff > 0 ? `▲ ${diff}` : `▼ ${-diff}`}</b>}{diff === 0 ? '' : ' vs'} {prev.length} last month</> : '…'} />
        <Kpi label="On time" value={pct == null ? '—' : `${pct}%`}
             sub={withDue.length ? <><b>{onTime}</b> of {withDue.length} with a due date</> : 'none had a due date'} />
        <Kpi label="Reels moved on" value={cur ? reels : '…'} sub={cur ? `${rows.length - reels} given by hand` : ''} />
        <Kpi label="Open now" value={open.length}
             sub={lateNow ? <b className="cell-late">{lateNow} late</b> : 'none late'} />
      </div>

      {rows.length > 0 && (
        <div className="hist-weeks" aria-label="Done per week">
          {weeks.map((w) => (
            <div key={w.label} className="hist-week" title={`${w.n} done, ${monthName} ${w.label}`}>
              <div className="hist-bar"><span style={{ height: `${Math.round((w.n / peak) * 100)}%` }} /></div>
              <div className="hist-n">{w.n}</div>
              <div className="hist-l">{w.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <DataGrid cols={cols} rows={rows} storageKey={who ? 'history' : 'history-all'}
                  empty={cur === null ? 'Loading…' : `Nothing finished in ${historyMonthLabel(month)}${who ? ` by ${whoName}` : ''}.`}
                  foot={<div className="grid-foot">
                    <span>{count(rows.length, 'task')} done{withDue.length ? ` · ${onTime} on time · ${withDue.length - onTime} late` : ''}</span>
                    <span className="grid-hint">Every finished task is kept — step back through the months</span>
                  </div>} />
      </div>
    </>
  )
}
