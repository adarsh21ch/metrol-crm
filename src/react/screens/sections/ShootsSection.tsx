import { useMemo, useState } from 'react'
import { DataGrid, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Chip } from '@/components/bits'
import { ShootModal, shootRights } from '@/modals/ShootModal'
import { usePersistedState } from '@/lib/usePersistedState'
import { count } from '@/lib/format'
import { addDays, isoDow } from '@/lib/targets'
import { SHOOT_STATUS, fmtClock, officeDay, safeUrl, shootDayLabel, type Shoot } from '@/lib/work'
import type { Client, Employee } from '@/lib/hr'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const firstName = (n: string) => n.split(' ')[0] ?? n
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const stepMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** The days a month's calendar shows: whole weeks, Monday first. */
function monthGrid(month: string): string[] {
  const first = month + '-01'
  const last = addDays(stepMonth(month, 1) + '-01', -1)
  const start = addDays(first, 1 - isoDow(first))
  const end = addDays(last, 7 - isoDow(last))
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Shoots (Phase 2, Round 4): a month's calendar, or the list. Planning one
 * gives its reels' shoot tasks to its DOP; marking it done moves them on.
 * `clientId` scopes it to one client (the client page's Shoots tab).
 */
export function ShootsSection({
  ws, agency, flows, work, clients, staff, toast, clientId, lead, nav,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  clients: Client[]
  staff: Employee[]
  toast: (m: string) => void
  clientId?: string
  lead?: React.ReactNode
  nav?: React.ReactNode
}) {
  const scoped = !!clientId
  const today = officeDay()
  const [view, setView] = usePersistedState<'calendar' | 'list'>('shoots-view', 'calendar')
  const [clientPick, setClientPick] = usePersistedState<string>('shoots-client', '')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [phoneView] = usePhoneView('shoots')
  const [open, setOpen] = useState<Shoot | { day: string | null } | null>(null)

  const onClient = clientId ?? (clients.some((c) => c.id === clientPick) ? clientPick : '')
  const shoots = useMemo(() => work.shoots.filter((s) => !onClient || s.clientId === onClient), [work.shoots, onClient])
  const canAdd = clients.some((c) => c.isActive && (!clientId || c.id === clientId) && shootRights(ws, agency, c, null).plan)
  const byDay = useMemo(() => {
    const m = new Map<string, Shoot[]>()
    for (const s of shoots) m.set(s.shootOn, [...(m.get(s.shootOn) ?? []), s])
    for (const list of m.values()) list.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
    return m
  }, [shoots])

  const days = monthGrid(month)
  const inMonth = shoots.filter((s) => s.shootOn.startsWith(month)).sort((a, b) => a.shootOn.localeCompare(b.shootOn)
    || (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
  const planned = shoots.filter((s) => s.status === 'planned')
  const lateOnes = planned.filter((s) => s.shootOn < today)
  const weekEnd = addDays(today, 7 - isoDow(today))
  const thisWeek = planned.filter((s) => s.shootOn >= today && s.shootOn <= weekEnd).length

  const what = (s: Shoot) => (scoped ? s.code : s.clientName)
  const chip = (s: Shoot) => (
    <button key={s.id} type="button" className={'shoot-chip is-' + s.status + (s.status === 'planned' && s.shootOn < today ? ' is-late' : '')}
            title={`${s.code} · ${s.clientName} · ${shootDayLabel(s.shootOn, s.startsAt)}${s.location ? ' · ' + s.location : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpen(s) }}>
      {s.startsAt && <span className="shoot-chip-t">{fmtClock(s.startsAt).replace(':00', '')}</span>}
      <span className="shoot-chip-n">{what(s)}</span>
    </button>
  )

  // Planned first, soonest first; then what is done or off, newest first.
  const listRows = [...shoots].sort((a, b) => {
    const pa = a.status === 'planned' ? 0 : 1
    const pb = b.status === 'planned' ? 0 : 1
    if (pa !== pb) return pa - pb
    return pa === 0 ? a.shootOn.localeCompare(b.shootOn) : b.shootOn.localeCompare(a.shootOn)
  })
  const cols: GridCol<Shoot>[] = [
    { key: 'code', label: 'ID', width: 80, render: (r) => <span className="cell-mono">{r.code}</span> },
    {
      key: 'day', label: 'When', width: 170,
      render: (r) => <span className={r.status === 'planned' && r.shootOn < today ? 'cell-late' : 'cell-strong'}>{shootDayLabel(r.shootOn, r.startsAt)}</span>,
    },
    ...(!scoped ? [{ key: 'client', label: 'Client', width: 150, render: (r: Shoot) => r.clientName }] : []),
    { key: 'place', label: 'Place', width: 170, render: (r) => r.location || <span className="cell-dash">—</span> },
    { key: 'dop', label: 'DOP', width: 120, render: (r) => (r.dopName ? firstName(r.dopName) : r.status === 'planned' ? <Chip cls="chip--warn">Not picked</Chip> : <span className="cell-dash">—</span>) },
    { key: 'smm', label: 'SMM', width: 120, render: (r) => (r.smmName ? firstName(r.smmName) : <span className="cell-dash">—</span>) },
    { key: 'reels', label: 'Reels', width: 70, render: (r) => r.itemCount || <span className="cell-dash">—</span> },
    { key: 'status', label: 'Status', width: 110, render: (r) => <Chip cls={'chip--' + SHOOT_STATUS[r.status].tone}>{SHOOT_STATUS[r.status].label}</Chip> },
    {
      key: 'raw', label: 'Footage', width: 100,
      render: (r) => {
        const u = safeUrl(r.footageUrl)
        return u ? <a href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open ↗</a> : <span className="cell-dash">—</span>
      },
    },
  ]

  const Title = scoped ? 'h3' : 'h1'
  const seg = (
    <div className={'seg' + (scoped ? '' : ' head-cta')} role="group" aria-label="Calendar or list">
      <button className={view === 'calendar' ? 'is-on' : ''} onClick={() => setView('calendar')}>Calendar</button>
      <button className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}>List</button>
    </div>
  )
  const stepper = (
    <div className="month-step">
      <button className="btn btn--sm" aria-label="Previous month" onClick={() => setMonth((m) => stepMonth(m, -1))}>←</button>
      <strong>{monthLabel(month)}</strong>
      <button className="btn btn--sm" aria-label="Next month" onClick={() => setMonth((m) => stepMonth(m, 1))}>→</button>
    </div>
  )

  return (
    <>
      <div className={scoped ? 'section-head' : 'page-head'}>
        {lead}
        <Title>Shoots</Title>
        {!scoped && seg}
        <div className={scoped ? 'section-tools section-tools--tight' : 'section-tools'}>
          {scoped && seg}
          {!scoped && (
            <select className="input" aria-label="Which client" value={onClient} onChange={(e) => setClientPick(e.target.value)}>
              <option value="">Every client</option>
              {clients.filter((c) => c.isActive || work.shoots.some((s) => s.clientId === c.id))
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {canAdd && (
            <button className="btn btn--sm btn--primary" aria-label="Plan a shoot" onClick={() => setOpen({ day: null })}>
              +<span className="on-desktop">&nbsp;Shoot</span>
            </button>
          )}
        </div>
      </div>
      {nav}

      {!work.shootsOn && !work.loading && (
        <div className="banner">
          <div>
            <div className="t">Shoots are not on the database yet</div>
            <div className="d">They arrive with update 0046. Until it is run there is nothing to show here.</div>
          </div>
        </div>
      )}
      {work.error && <div className="auth-err">{work.error}</div>}

      {work.shootsOn && !work.loading && view === 'calendar' && (
        <div className="section">
          <div className="shoot-cal-head">
            {stepper}
            {month !== today.slice(0, 7) && (
              <button className="link-btn" onClick={() => setMonth(today.slice(0, 7))}>This month</button>
            )}
          </div>
          <div className="shoot-cal" role="grid" aria-label={monthLabel(month)}>
            {DOW.map((d) => <div key={d} className="shoot-cal-dow">{d}</div>)}
            {days.map((d) => {
              const list = byDay.get(d) ?? []
              const out = !d.startsWith(month)
              return (
                <div key={d} role="gridcell"
                     className={'shoot-cal-day' + (out ? ' is-out' : '') + (d === today ? ' is-today' : '') + (canAdd ? ' is-open' : '')}
                     onClick={() => { if (list.length === 1 && window.matchMedia('(max-width:860px)').matches) setOpen(list[0]!); else if (canAdd) setOpen({ day: d }) }}
                     title={canAdd ? 'Plan a shoot on this day' : undefined}>
                  <span className="shoot-cal-d">{Number(d.slice(8, 10))}</span>
                  {list.map(chip)}
                </div>
              )
            })}
          </div>
          {inMonth.length > 0 && (
            <div className="shoot-agenda">
              {inMonth.map((s) => (
                <button key={s.id} type="button" className="shoot-agenda-row" onClick={() => setOpen(s)}>
                  <span className={'shoot-agenda-day' + (s.status === 'planned' && s.shootOn < today ? ' cell-late' : '')}>
                    {shootDayLabel(s.shootOn, s.startsAt)}
                  </span>
                  <span className="shoot-agenda-what"><b>{s.code}</b> · {s.clientName}{s.location ? ' · ' + s.location : ''}</span>
                  <Chip cls={'chip--' + SHOOT_STATUS[s.status].tone}>{SHOOT_STATUS[s.status].label}</Chip>
                </button>
              ))}
            </div>
          )}
          <div className="grid-foot grid-foot--plain">
            <span>
              {count(inMonth.length, 'shoot')} in {monthLabel(month).split(' ')[0]}
              {inMonth.length ? ` · ${inMonth.filter((s) => s.status === 'planned').length} planned · ${inMonth.filter((s) => s.status === 'done').length} done` : ''}
              {lateOnes.length ? <> · <span className="cell-late">{lateOnes.length} past its day, not marked done</span></> : null}
            </span>
            {canAdd && <span className="grid-hint">Tap a day to plan a shoot on it</span>}
          </div>
        </div>
      )}

      {work.shootsOn && !work.loading && view === 'list' && (
        <div className="section">
          <DataGrid cols={cols} rows={listRows} storageKey={scoped ? 'shoots-client' : 'shoots'} phoneView={phoneView}
                    rowClass={(r) => (r.status === 'cancelled' ? 'row-retired' : undefined)}
                    onRowClick={(r) => setOpen(r)}
                    empty={canAdd ? 'No shoots yet — plan the first one.' : 'No shoots of yours yet.'}
                    foot={<div className="grid-foot">
                      <span>
                        {count(planned.length, 'planned shoot')}{thisWeek ? ` · ${thisWeek} this week` : ''}
                        {lateOnes.length ? <> · <span className="cell-late">{lateOnes.length} past its day</span></> : null}
                      </span>
                      <span className="grid-hint">Done and cancelled shoots leave the list after six months</span>
                    </div>} />
        </div>
      )}

      {open && (
        <ShootModal ws={ws} agency={agency} flows={flows} work={work}
                    shoot={'id' in open ? work.shoots.find((s) => s.id === open.id) ?? open : null}
                    clients={clients} staff={staff} presetClientId={onClient || null}
                    presetDay={'day' in open ? open.day : null}
                    toast={toast} onClose={() => setOpen(null)} />
      )}
    </>
  )
}
