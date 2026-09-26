import { useMemo, useState } from 'react'
import { DataGrid, PhoneViewPick, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Chip, EditChip } from '@/components/bits'
import { Menu } from '@/components/Menu'
import { TaskModal, taskRights } from '@/modals/TaskModal'
import { usePersistedState } from '@/lib/usePersistedState'
import { count } from '@/lib/format'
import { byUrgency, doneStatusIds, fmtDue, isOverdue, priorityOf, type Task } from '@/lib/work'
import type { Client, Employee } from '@/lib/hr'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

type Whose = 'mine' | 'given' | 'all'

/**
 * Tasks (Phase 2, Round 2) — everybody's, the owner's and HR's alike, and
 * the one list a person checks in the morning. Most arrive by themselves:
 * a content item reaching a stage hands its task to whoever holds that role
 * on the client's team. The rest are given by hand ("+ Task").
 *
 *   Mine    given to me
 *   Given   given by me
 *   All     everything I can see — my team's, my clients'
 *
 * Finished tasks hide until "Show done"; the database keeps them all.
 */
export function TasksSection({
  ws, agency, flows, work, clients, staff, toast, lead, nav,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  clients: Client[]
  staff: Employee[]
  toast: (m: string) => void
  lead?: React.ReactNode
  /** Drawn under the title line — an employee's tab strip (Member.tsx), so
   *  the title sits where every other tab puts it. */
  nav?: React.ReactNode
}) {
  const meEmployee = agency.myEmployee?.id ?? null
  const meProfile = ws.me?.id ?? null
  const [whosePicked, setWhose] = usePersistedState<Whose | null>('tasks-whose', null)
  // Somebody with no employee record (the owner, HR's login) has no "mine".
  const whose: Whose = whosePicked === 'mine' && !meEmployee ? 'all' : whosePicked ?? (meEmployee ? 'mine' : 'all')
  const [showDone, setShowDone] = useState(false)
  const [phoneView, setPhoneView] = usePhoneView('tasks')
  const [open, setOpen] = useState<Task | 'new' | null>(null)
  const [statusMenu, setStatusMenu] = useState<{ anchor: HTMLElement; task: Task } | null>(null)

  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const statusById = useMemo(() => new Map(flows.statuses.map((s) => [s.id, s])), [flows.statuses])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const itemById = useMemo(() => new Map(work.items.map((i) => [i.id, i])), [work.items])

  const mine = (t: Task) => !!meEmployee && t.assigneeId === meEmployee
  const given = (t: Task) => !!meProfile && t.createdBy === meProfile
  const scoped = work.tasks.filter((t) => (whose === 'mine' ? mine(t) : whose === 'given' ? given(t) : true))
  const openRows = scoped.filter((t) => !done.has(t.statusId))
  const rows = (showDone ? scoped : openRows).slice().sort(byUrgency(done))
  const late = openRows.filter((t) => isOverdue(t, done)).length
  const doneCount = scoped.length - openRows.length

  const setStatus = (t: Task, statusId: string) => {
    const st = statusById.get(statusId)
    const item = t.contentItemId ? itemById.get(t.contentItemId) : null
    void work.updateTask(t.id, { statusId }).then((err) => {
      if (err) { toast(err); return }
      toast(st?.isDone && item ? `${t.code} done — ${item.code} moves on.` : `${t.code}: ${st?.name ?? 'updated'}.`)
    })
  }

  const cols: GridCol<Task>[] = [
    { key: 'code', label: 'ID', width: 90, render: (r) => <span className="cell-mono">{r.code}</span> },
    {
      key: 'task', label: 'Task', width: 300,
      render: (r) => {
        const c = r.clientId ? clientById.get(r.clientId)?.name : null
        return <span className="work-task"><span className="cell-strong">{r.title}</span>{c && <span className="cell-mute"> · {c}</span>}</span>
      },
    },
    {
      key: 'who', label: 'Who', width: 150,
      render: (r) => (r.assigneeId
        ? <span>{r.assigneeName}{mine(r) ? ' (you)' : ''}</span>
        : <Chip cls="chip--warn">Nobody yet</Chip>),
    },
    {
      key: 'status', label: 'Status', width: 150,
      render: (r) => {
        const st = statusById.get(r.statusId)
        const cls = 'chip--' + (st?.tone ?? 'mute')
        return taskRights(ws, agency, staff, clients, r).status
          ? <EditChip cls={cls} label={st?.name ?? '—'} onClick={(e) => { e.stopPropagation(); setStatusMenu({ anchor: e.currentTarget, task: r }) }} />
          : <Chip cls={cls}>{st?.name ?? '—'}</Chip>
      },
    },
    {
      key: 'due', label: 'Due', width: 150,
      render: (r) => (r.dueAt
        ? <span className={isOverdue(r, done) ? 'cell-late' : undefined}>{fmtDue(r.dueAt)}</span>
        : <span className="cell-dash">—</span>),
    },
    {
      key: 'priority', label: 'Priority', width: 100,
      render: (r) => { const p = priorityOf(r.priority); return <Chip cls={'chip--' + p.tone}>{p.label}</Chip> },
    },
    { key: 'from', label: 'From', width: 140, render: (r) => (given(r) ? 'You' : r.creatorName || <span className="cell-dash">—</span>) },
  ]

  return (
    <>
      <div className="page-head">
        {lead}
        <h1>Tasks</h1>
        <PhoneViewPick view={phoneView} onPick={setPhoneView} className="head-cta" />
        <div className="section-tools">
          <div className="seg" role="group" aria-label="Whose tasks">
            {meEmployee && <button className={whose === 'mine' ? 'is-on' : ''} onClick={() => setWhose('mine')}>Mine</button>}
            <button className={whose === 'given' ? 'is-on' : ''} onClick={() => setWhose('given')}>Given</button>
            <button className={whose === 'all' ? 'is-on' : ''} onClick={() => setWhose('all')}>All</button>
          </div>
          {agency.installed.work && (
            <button className="btn btn--sm btn--primary" aria-label="New task" onClick={() => setOpen('new')}>
              +<span className="on-desktop">&nbsp;Task</span>
            </button>
          )}
        </div>
      </div>
      {nav}

      {!agency.installed.work && (
        <div className="banner">
          <div>
            <div className="t">Tasks are not on the database yet</div>
            <div className="d">They arrive with update 0044. Until it is run there is nothing to show here.</div>
          </div>
        </div>
      )}
      {work.error && <div className="auth-err">{work.error}</div>}

      {agency.installed.work && !work.loading && (
        <div className="section">
          <DataGrid cols={cols} rows={rows} storageKey="tasks" phoneView={phoneView}
                    rowClass={(r) => (done.has(r.statusId) ? 'row-retired' : undefined)}
                    onRowClick={(r) => setOpen(r)}
                    empty={whose === 'mine' ? 'Nothing on your list — a task given to you, or a reel reaching your stage, lands here.'
                      : whose === 'given' ? 'You have not given anybody a task yet.' : 'No tasks yet.'}
                    foot={<div className="grid-foot">
                      <span>{count(openRows.length, 'open task')}{late ? <> · <span className="cell-late">{late} overdue</span></> : null}</span>
                      {doneCount > 0 && (
                        <button className="link-btn work-foot-act" onClick={() => setShowDone((v) => !v)}>
                          {showDone ? 'Hide done' : `Show done (${doneCount})`}
                        </button>
                      )}
                    </div>} />
        </div>
      )}

      {statusMenu && (
        <Menu
          anchor={statusMenu.anchor}
          items={flows.statuses.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({ value: s.id, label: s.name, cls: 'chip--' + s.tone }))}
          current={statusMenu.task.statusId}
          onPick={(v) => { if (v !== statusMenu.task.statusId) setStatus(statusMenu.task, v) }}
          onClose={() => setStatusMenu(null)}
        />
      )}

      {open && (
        <TaskModal ws={ws} agency={agency} flows={flows} work={work} clients={clients} staff={staff}
                   task={open === 'new' ? null : work.tasks.find((t) => t.id === open.id) ?? open}
                   toast={toast} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/** "My tasks" on a person's Overview — the next few, most urgent first.
 *  Nothing at all when nothing waits: an "all clear" card would be read once
 *  and scrolled past forever (layout law, rule 7). Tasks itself is a tab on
 *  a desktop and a row in Profile on a phone. */
export function MyTasksCard({
  ws, agency, flows, work, clients, staff, toast, onSeeAll,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  clients: Client[]
  staff: Employee[]
  toast: (m: string) => void
  onSeeAll: () => void
}) {
  const [open, setOpen] = useState<Task | null>(null)
  const me = agency.myEmployee?.id ?? null
  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const mine = work.tasks.filter((t) => me && t.assigneeId === me && !done.has(t.statusId)).sort(byUrgency(done))
  const late = mine.filter((t) => isOverdue(t, done)).length
  if (!agency.installed.work || work.loading || !me) return null
  return (
    <>
      {mine.length > 0 && (
        <div className="ov-card">
          <div className="ov-head">
            <h4>My tasks</h4>
            <span className="sub">{count(mine.length, 'open')}{late ? ` · ${late} overdue` : ''}</span>
          </div>
          <div className="ov-feed">
            {mine.slice(0, 4).map((t) => (
              <button key={t.id} type="button" className="ov-ev work-ov-row" onClick={() => setOpen(t)}>
                <span className="ov-ev-what"><b>{t.title}</b></span>
                <span className={'ov-ev-at' + (isOverdue(t, done) ? ' cell-late' : '')}>{t.dueAt ? fmtDue(t.dueAt) : '—'}</span>
              </button>
            ))}
          </div>
          <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onSeeAll}>
            {mine.length > 4 ? `See all ${mine.length} →` : 'Open Tasks →'}
          </button>
        </div>
      )}
      {/* Outside the card: finishing the last task empties the card, and the
          open task must not vanish with it mid-read. */}
      {open && (
        <TaskModal ws={ws} agency={agency} flows={flows} work={work} clients={clients} staff={staff}
                   task={work.tasks.find((t) => t.id === open.id) ?? open} toast={toast} onClose={() => setOpen(null)} />
      )}
    </>
  )
}
