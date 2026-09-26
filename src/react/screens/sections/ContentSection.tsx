import { useMemo, useState } from 'react'
import { Board } from '@/components/Board'
import { DataGrid, useIsPhone, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Chip, EditChip } from '@/components/bits'
import { Menu } from '@/components/Menu'
import { ContentItemModal } from '@/modals/ContentItemModal'
import { TaskModal } from '@/modals/TaskModal'
import { usePersistedState } from '@/lib/usePersistedState'
import { count } from '@/lib/format'
import { fmtDate, type Client, type Employee, type Page, type PageAssignment } from '@/lib/hr'
import { boardStages, canEditWorkOn, doneStatusIds, fmtDue, isOverdue, type ContentItem, type Task } from '@/lib/work'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

const firstName = (n: string) => n.split(' ')[0] ?? n

/** What a client page needs to show its Content tab — handed down by a
 *  screen that loads them, absent (no tab) where nothing does. */
export interface WorkKit { work: Work; flows: Workflows; staff: Employee[] }

/**
 * Content (Phase 2, Round 2): every reel and post, as a board by stage or a
 * list. A card moves when its stage's task is finished — or when somebody
 * drags it, which is the same write: the database closes the old stage's
 * task and hands the new one to whoever holds that role on the client's team.
 *
 * `clientId` scopes it to one client (the client page's Content tab); the
 * heading is then a section's, not the page's.
 */
export function ContentSection({
  ws, agency, flows, work, clients, pages, pageAssignments, staff, toast, clientId, lead,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  clients: Client[]
  pages: Page[]
  pageAssignments: PageAssignment[]
  staff: Employee[]
  toast: (m: string) => void
  clientId?: string
  lead?: React.ReactNode
}) {
  const { access } = agency
  const scoped = !!clientId
  // A phone opens on the cards: eleven stages side by side show one column
  // at a time there, and the reel you want is usually off to the right.
  const isPhone = useIsPhone()
  const [view, setView] = usePersistedState<'board' | 'list'>('content-view', isPhone ? 'list' : 'board')
  const [clientPick, setClientPick] = usePersistedState<string>('content-client', '')
  const [wfPick, setWfPick] = usePersistedState<string>('content-wf', '')
  const [phoneView, setPhoneView] = usePhoneView('content')
  const [editing, setEditing] = useState<ContentItem | 'new' | null>(null)
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [stageMenu, setStageMenu] = useState<{ anchor: HTMLElement; item: ContentItem } | null>(null)

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages])
  const stageById = useMemo(() => new Map(flows.stages.map((s) => [s.id, s])), [flows.stages])
  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const onClient = clientId ?? (clientById.has(clientPick) ? clientPick : '')

  const items = useMemo(
    () => work.items.filter((i) => !onClient || i.clientId === onClient),
    [work.items, onClient],
  )
  /** The task an item is waiting on — its stage's open one. */
  const current = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of work.tasks) {
      if (!t.contentItemId || done.has(t.statusId)) continue
      const it = work.items.find((i) => i.id === t.contentItemId)
      if (it && it.stageId === t.stageId) m.set(it.id, t)
    }
    return m
  }, [work.tasks, work.items, done])

  const canEdit = (it: ContentItem) => { const c = clientById.get(it.clientId); return !!c && canEditWorkOn(ws, access, c) }
  const addable = clients.filter((c) => c.isActive && canEditWorkOn(ws, access, c))
  const canAdd = scoped ? addable.some((c) => c.id === clientId) : addable.length > 0

  // The board shows one workflow at a time — their stages differ. The ones
  // in use, plus any retired one that still has items on it.
  const wfs = flows.workflows
    .filter((w) => w.isActive || items.some((i) => i.workflowId === w.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  // Unpicked, it opens on the workflow with the most on it (a fan-page heavy
  // client's fan board); ties keep the settings' order.
  const onWf = (id: string) => items.filter((i) => i.workflowId === id).length
  const wf = wfs.find((w) => w.id === wfPick) ?? [...wfs].sort((a, b) => onWf(b.id) - onWf(a.id))[0] ?? null
  const onBoard = wf ? items.filter((i) => i.workflowId === wf.id) : []
  const cols = wf ? boardStages(flows.stages, wf.id, onBoard) : []

  const move = (it: ContentItem, stageId: string) => {
    const to = stageById.get(stageId)
    void work.moveItem(it.id, stageId).then((err) => toast(err ?? `${it.code} moved to ${to?.name ?? 'the new stage'}.`))
  }

  const who = (it: ContentItem) => {
    const st = stageById.get(it.stageId)
    if (st?.isDone) return <span className="work-who is-done">Done</span>
    const t = current.get(it.id)
    if (!t) return <span className="work-who">—</span>
    const late = isOverdue(t, done)
    if (!t.assigneeId) return <span className="work-who is-none">Nobody yet</span>
    return <span className={'work-who' + (late ? ' is-late' : '')} title={late ? 'Overdue' : undefined}>{firstName(t.assigneeName)}{late ? ' · late' : ''}</span>
  }

  const card = (it: ContentItem) => {
    const p = it.pageId ? pageById.get(it.pageId) : null
    const sub = [!scoped ? clientById.get(it.clientId)?.name : null, p ? (p.label || p.instagramHandle) : null].filter(Boolean).join(' · ')
    return (
      <>
        <div className="board-card-head">
          <span className="board-card-nm">{it.title}</span>
        </div>
        <div className="board-card-meta">
          <span className="board-card-sub">{it.code}{sub ? ' · ' + sub : ''}</span>
          {who(it)}
        </div>
      </>
    )
  }

  const listCols: GridCol<ContentItem>[] = [
    { key: 'code', label: 'ID', width: 92, render: (r) => <span className="cell-mono">{r.code}</span> },
    { key: 'title', label: 'Title', width: 260, render: (r) => <span className="cell-strong">{r.title}</span> },
    ...(!scoped ? [{ key: 'client', label: 'Client', width: 150, render: (r: ContentItem) => clientById.get(r.clientId)?.name ?? '—' }] : []),
    {
      key: 'page', label: 'Page', width: 150,
      render: (r) => { const p = r.pageId ? pageById.get(r.pageId) : null; return p ? (p.label || p.instagramHandle) : <span className="cell-dash">—</span> },
    },
    {
      key: 'stage', label: 'Stage', width: 150,
      render: (r) => {
        const st = stageById.get(r.stageId)
        const cls = 'chip--' + (st?.tone ?? 'mute')
        return canEdit(r)
          ? <EditChip cls={cls} label={st?.name ?? '—'} onClick={(e) => { e.stopPropagation(); setStageMenu({ anchor: e.currentTarget, item: r }) }} />
          : <Chip cls={cls}>{st?.name ?? '—'}</Chip>
      },
    },
    { key: 'who', label: 'With', width: 130, render: (r) => who(r) },
    {
      key: 'due', label: 'Due', width: 150,
      render: (r) => {
        const t = current.get(r.id)
        if (!t?.dueAt) return <span className="cell-dash">—</span>
        return <span className={isOverdue(t, done) ? 'cell-late' : undefined}>{fmtDue(t.dueAt)}</span>
      },
    },
    { key: 'post', label: 'Post on', width: 110, render: (r) => (r.plannedPostOn ? fmtDate(r.plannedPostOn) : <span className="cell-dash">—</span>) },
  ]

  // Counted over what each view shows: the board is one workflow, the list
  // is all of them — a fan-page reel's late task is not the main board's.
  const finished = items.filter((i) => stageById.get(i.stageId)?.isDone).length
  const waitingIn = (list: ContentItem[]) => list.filter((i) => { const t = current.get(i.id); return t && !t.assigneeId }).length
  const lateIn = (list: ContentItem[]) => list.filter((i) => { const t = current.get(i.id); return t && isOverdue(t, done) }).length
  const waiting = waitingIn(items)
  const late = lateIn(items)
  const boardWaiting = waitingIn(onBoard)
  const boardLate = lateIn(onBoard)

  const Title = scoped ? 'h3' : 'h1'
  // One switch, as My leads has it: Board · Cards · List. Cards is the
  // phone's (above the breakpoint the list is always the table), so a
  // phone never shows a second Cards/List switch beside this one.
  const seg = (
    <div className={'seg seg--leads' + (scoped ? '' : ' head-cta')} role="group" aria-label="Board, cards or list">
      <button className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}>Board</button>
      <button className={'seg-cards' + (view === 'list' && phoneView === 'cards' ? ' is-on' : '')}
              onClick={() => { setView('list'); setPhoneView('cards') }}>Cards</button>
      <button className={view === 'list' && (phoneView === 'list' || !isPhone) ? 'is-on' : ''}
              onClick={() => { setView('list'); if (isPhone) setPhoneView('list') }}>List</button>
    </div>
  )

  return (
    <>
      <div className={scoped ? 'section-head' : 'page-head'}>
        {lead}
        <Title>Content</Title>
        {!scoped && seg}
        <div className={scoped ? 'section-tools section-tools--tight' : 'section-tools'}>
          {scoped && seg}
          {!scoped && (
            <select className="input" aria-label="Which client" value={onClient} onChange={(e) => setClientPick(e.target.value)}>
              <option value="">Every client</option>
              {clients.filter((c) => c.isActive || work.items.some((i) => i.clientId === c.id))
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {view === 'board' && wfs.length > 1 && (
            <select className="input" aria-label="Which workflow" value={wf?.id ?? ''} onChange={(e) => setWfPick(e.target.value)}>
              {wfs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          {canAdd && (
            <button className="btn btn--sm btn--primary" aria-label="Add content" onClick={() => setEditing('new')}>
              +<span className="on-desktop">&nbsp;Content</span>
            </button>
          )}
        </div>
      </div>

      {!agency.installed.work && (
        <div className="banner">
          <div>
            <div className="t">Content is not on the database yet</div>
            <div className="d">It arrives with update 0044. Until it is run there is nothing to show here.</div>
          </div>
        </div>
      )}
      {work.error && <div className="auth-err">{work.error}</div>}

      {agency.installed.work && !work.loading && (view === 'board' ? (
        wf ? (
          <Board
            cols={cols.map((s) => ({ key: s.id, label: s.name + (s.isActive ? '' : ' (retired)'), dotCls: 'chip--' + s.tone }))}
            rows={onBoard}
            colOf={(it) => it.stageId}
            emptyText="Nothing here"
            canDrag={canEdit}
            onOpen={(it) => setEditing(it)}
            onDrop={(it, col) => {
              const st = stageById.get(col)
              if (!st?.isActive) { toast('That stage is retired — it takes no new items.'); return }
              move(it, col)
            }}
            renderCard={card}
            cardClass={(it) => { const t = current.get(it.id); return t && isOverdue(t, done) ? 'is-late' : undefined }}
          />
        ) : (
          <p className="cell-mute">No workflow yet — add one on Settings → Workflows &amp; lists.</p>
        )
      ) : (
        <div className="section">
          <DataGrid cols={listCols} rows={items} storageKey={scoped ? 'content-client' : 'content'} phoneView={phoneView}
                    onRowClick={(r) => setEditing(r)}
                    empty={canAdd ? 'No content yet — add the first reel.' : 'Nothing you work on yet.'}
                    foot={<div className="grid-foot">
                      <span>{count(items.length, 'item')}{finished ? ` · ${finished} done` : ''}{waiting ? ` · ${waiting} waiting for a person` : ''}{late ? ` · ${late} late` : ''}</span>
                      <span className="grid-hint">Finished items leave the list after 30 days</span>
                    </div>} />
        </div>
      ))}

      {view === 'board' && agency.installed.work && !work.loading && onBoard.length > 0 && (
        <div className="grid-foot grid-foot--plain">
          <span>{count(onBoard.length, 'item')} on {wf?.name}{boardWaiting ? ` · ${boardWaiting} waiting for a person` : ''}{boardLate ? ` · ${boardLate} late` : ''}</span>
          <span className="grid-hint">Drag a card to move it — its task goes to whoever holds the next stage</span>
        </div>
      )}

      {stageMenu && (
        <Menu
          anchor={stageMenu.anchor}
          items={flows.stages.filter((s) => s.workflowId === stageMenu.item.workflowId && s.isActive)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({ value: s.id, label: s.name, cls: 'chip--' + s.tone }))}
          current={stageMenu.item.stageId}
          onPick={(v) => { if (v !== stageMenu.item.stageId) move(stageMenu.item, v) }}
          onClose={() => setStageMenu(null)}
        />
      )}

      {editing && (
        <ContentItemModal
          ws={ws} agency={agency} flows={flows} work={work}
          item={editing === 'new' ? null : work.items.find((i) => i.id === editing.id) ?? editing}
          clients={editing === 'new' ? addable : clients}
          presetClientId={clientId ?? (onClient || null)}
          pages={pages} pageAssignments={pageAssignments} staff={staff}
          canEdit={editing === 'new' || canEdit(editing)}
          toast={toast}
          onOpenTask={(t) => { setEditing(null); setOpenTask(t) }}
          onClose={() => setEditing(null)}
        />
      )}
      {openTask && (
        <TaskModal ws={ws} agency={agency} flows={flows} work={work} clients={clients} staff={staff}
                   task={work.tasks.find((t) => t.id === openTask.id) ?? openTask} toast={toast}
                   onClose={() => setOpenTask(null)} />
      )}
    </>
  )
}
