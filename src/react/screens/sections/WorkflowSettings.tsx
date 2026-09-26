import { useState } from 'react'
import { Chip } from '@/components/bits'
import { Tip } from '@/components/Tip'
import { ListItemModal } from '@/modals/ListItemModal'
import { RoleOptions, StageModal } from '@/modals/StageModal'
import { WorkflowModal } from '@/modals/WorkflowModal'
import { useDragOrder } from '@/lib/useDragOrder'
import { usePersistedState } from '@/lib/usePersistedState'
import { isOwnerLevel } from '@/lib/hr'
import { count } from '@/lib/format'
import type { ListItem, TaskStatus, Workflow, WorkflowStage } from '@/lib/agency'
import type { ListKind } from '@/data/useAgencyLists'
import type { Agency } from '@/data/useAgency'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

/** The three colour/name lists Phase 1 put on Roles & access — they are lists,
 *  so they live with the other lists now. Same tables, same rules (0036/0037). */
const COLOUR_LISTS: { kind: ListKind; title: string; one: string; tone: boolean; hint: string }[] = [
  { kind: 'client_statuses', title: 'Client statuses', one: 'Client status', tone: true, hint: 'On every client' },
  { kind: 'page_statuses', title: 'Page colours', one: 'Page colour', tone: true, hint: 'The sheet\'s red and orange rows — rename them to what they mean' },
  { kind: 'view_adjustment_types', title: 'Adjustment types', one: 'Adjustment type', tone: false, hint: 'The in-between rows of a target sheet' },
]

const NEW_WORKFLOW = '__new'

const GRIP = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
)
const PENCIL = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/**
 * Settings → Workflows & lists (AGENCY-OS-PLAN.md §9, Round 1). Everything
 * Agency OS picks from, as rows the owner and HR edit instead of code:
 *
 *   Stages          a workflow's stages, top to bottom — drag to reorder, and
 *                   beside each the role that acts on it (Round 2 gives that
 *                   person the task)
 *   Task statuses   the first is where a task starts; a finished one ends it
 *   Content formats Reel, Carousel…
 *   + the three Phase 1 lists (client statuses, page colours, adjustments)
 *
 * The owner and HR edit it (THE ACCESS RULE), and so does a role given
 * "Workflows & lists" on Roles & access; everybody else reads it.
 */
export function WorkflowSettings({
  ws, agency, flows, toast, lead,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  toast: (m: string) => void
  /** HR's "← Profile" on a phone */
  lead?: React.ReactNode
}) {
  const { access, accessData, lists, installed } = agency
  const canFlows = isOwnerLevel(ws) || access.can('manage_workflows')
  const canLists = access.can('manage_settings')
  const [openWf, setOpenWf] = usePersistedState<string | null>('wf-open', null)
  const [wfEdit, setWfEdit] = useState<Workflow | 'new' | null>(null)
  const [stageEdit, setStageEdit] = useState<WorkflowStage | 'new' | null>(null)
  const [statusEdit, setStatusEdit] = useState<TaskStatus | 'new' | null>(null)
  const [formatEdit, setFormatEdit] = useState<ListItem | 'new' | null>(null)
  const [listEdit, setListEdit] = useState<{ kind: ListKind; item: ListItem | null } | null>(null)

  const workflows = [...flows.workflows].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder)
  const wf = workflows.find((w) => w.id === openWf) ?? workflows[0] ?? null
  const stages = wf ? flows.stages.filter((s) => s.workflowId === wf.id).sort((a, b) => a.sortOrder - b.sortOrder) : []
  const stageById = new Map(stages.map((s) => [s.id, s]))
  const statusById = new Map(flows.statuses.map((s) => [s.id, s]))
  const firstStatus = flows.statuses.find((s) => s.isActive)?.id ?? null

  const say = (m: string | null) => { if (m) toast(m) }
  const stageDrag = useDragOrder(stages.map((s) => s.id), (ids) => void flows.reorder('workflow_stages', ids).then(say))
  const statusDrag = useDragOrder(flows.statuses.map((s) => s.id), (ids) => void flows.reorder('task_statuses', ids).then(say))

  const live = stages.filter((s) => s.isActive)
  const stageFlags = (st: WorkflowStage) => [
    st.isReview && 'review',
    st.clientVisible && 'client sees it',
    st.slaHours && `due in ${st.slaHours} h`,
    !st.isActive && 'retired',
  ].filter(Boolean).join(' · ')

  return (
    <>
      <div className="page-head">
        {lead}
        <h1>Workflows &amp; lists</h1>
      </div>

      {!installed.workflows && (
        <div className="banner">
          <div>
            <div className="t">Workflows are not on the database yet</div>
            <div className="d">They arrive with update 0043. Until it is run, the lists below are all this screen has.</div>
          </div>
        </div>
      )}

      {installed.workflows && flows.error && <div className="auth-err">{flows.error}</div>}

      {installed.workflows && !flows.loading && (
        <>
          <Tip tipKey="wf-stages">
            A reel moves down these stages, top to bottom. The role beside each is who acts on it — once reels are
            tracked here (the next round), whoever holds that role on the client's team gets it as a task.
            Drag ⋮⋮ to change the order.
          </Tip>

          {/* ------------------------------------------------ the stages */}
          <div className="section">
            <div className="section-head">
              <h3>Stages</h3>
              <div className="section-tools section-tools--tight">
                <select className="input wf-pick" aria-label="Which workflow" value={wf?.id ?? ''}
                        onChange={(e) => (e.target.value === NEW_WORKFLOW ? setWfEdit('new') : setOpenWf(e.target.value))}>
                  {!wf && <option value="">No workflow yet</option>}
                  {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isActive ? '' : ' (retired)'}</option>)}
                  {canFlows && <option value={NEW_WORKFLOW}>+ New workflow…</option>}
                </select>
                {canFlows && wf && (
                  <button className="icon-btn" title="Edit this workflow" aria-label="Edit this workflow" onClick={() => setWfEdit(wf)}>{PENCIL}</button>
                )}
                {canFlows && wf && <button className="btn btn--sm btn--primary" onClick={() => setStageEdit('new')}>+ Stage</button>}
              </div>
            </div>

            {wf && (
              <div className="wf-list" ref={stageDrag.listRef}>
                {stageDrag.order.map((id, i) => {
                  const st = stageById.get(id)
                  if (!st) return null
                  return (
                    <div key={st.id} data-drag-id={st.id}
                         className={'wf-row' + (stageDrag.dragging === st.id ? ' is-dragging' : '') + (st.isActive ? '' : ' is-retired')}>
                      {canFlows && (
                        <button type="button" className="wf-grip" aria-label={`Move ${st.name} (drag, or arrow keys)`} {...stageDrag.handle(st.id)}>{GRIP}</button>
                      )}
                      <span className="wf-n">{i + 1}</span>
                      <button type="button" className="wf-main" disabled={!canFlows} onClick={() => setStageEdit(st)}>
                        <Chip cls={'chip--' + st.tone}>{st.name}</Chip>
                        {stageFlags(st) && <span className="wf-flags">{stageFlags(st)}</span>}
                      </button>
                      {st.isDone ? (
                        <span className="wf-owner wf-owner--done">The finish</span>
                      ) : (
                        <select className="input wf-owner" aria-label={`Who acts on ${st.name}`} value={st.ownerRoleId ?? ''}
                                disabled={!canFlows}
                                onChange={(e) => void flows.setStageOwner(st, e.target.value || null).then(say)}>
                          <option value="">Nobody yet</option>
                          <RoleOptions roles={accessData.roles} />
                        </select>
                      )}
                    </div>
                  )
                })}
                {stages.length === 0 && <div className="wf-empty">No stages yet{canFlows ? ' — add the first one.' : '.'}</div>}
                <div className="grid-foot">
                  <span>
                    {count(live.length, 'stage')} · for {wf.pageType === 'main' ? 'main pages' : wf.pageType === 'fan' ? 'fan pages' : 'any page'}
                    {live.some((s) => s.clientVisible) && ` · the client sees ${live.filter((s) => s.clientVisible).length}`}
                    {!wf.isActive && ' · retired'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ----------------------------------------------- task statuses */}
          <div className="section">
            <div className="section-head">
              <h3>Task statuses</h3>
              {canFlows && (
                <div className="section-tools section-tools--tight">
                  <button className="btn btn--sm" onClick={() => setStatusEdit('new')}>+ Status</button>
                </div>
              )}
            </div>
            <div className="wf-list" ref={statusDrag.listRef}>
              {statusDrag.order.map((id, i) => {
                const t = statusById.get(id)
                if (!t) return null
                const notes = [t.id === firstStatus && 'new tasks start here', t.isDone && 'finished', !t.isActive && 'retired'].filter(Boolean).join(' · ')
                return (
                  <div key={t.id} data-drag-id={t.id}
                       className={'wf-row' + (statusDrag.dragging === t.id ? ' is-dragging' : '') + (t.isActive ? '' : ' is-retired')}>
                    {canFlows && (
                      <button type="button" className="wf-grip" aria-label={`Move ${t.name} (drag, or arrow keys)`} {...statusDrag.handle(t.id)}>{GRIP}</button>
                    )}
                    <span className="wf-n">{i + 1}</span>
                    <button type="button" className="wf-main" disabled={!canFlows} onClick={() => setStatusEdit(t)}>
                      <Chip cls={'chip--' + t.tone}>{t.name}</Chip>
                      {notes && <span className="wf-flags">{notes}</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* --------------------------------------------- content formats */}
          <div className="section">
            <div className="section-head">
              <h3>Content formats</h3>
              {canFlows && (
                <div className="section-tools section-tools--tight">
                  <button className="btn btn--sm" onClick={() => setFormatEdit('new')}>+ Add</button>
                </div>
              )}
            </div>
            <div className="li-row">
              {flows.formats.map((f) => (
                <button key={f.id} className={'li-item' + (f.isActive ? '' : ' is-retired')} disabled={!canFlows} onClick={() => setFormatEdit(f)}>
                  <Chip cls="chip--mute">{f.name}</Chip>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {installed.workflows && flows.loading && <p className="cell-mute" style={{ margin: 0 }}>Loading…</p>}

      {/* ------------------------------------- the Phase 1 lists, moved here */}
      {installed.clients && COLOUR_LISTS.map((l) => (
        <div className="section" key={l.kind}>
          <div className="section-head">
            <h3>{l.title}</h3>
            <span className="sub">{l.hint}</span>
            {canLists && (
              <div className="section-tools section-tools--tight">
                <button className="btn btn--sm" onClick={() => setListEdit({ kind: l.kind, item: null })}>+ Add</button>
              </div>
            )}
          </div>
          <div className="li-row">
            {lists[l.kind].map((item) => (
              <button key={item.id} className={'li-item' + (item.isActive ? '' : ' is-retired')} disabled={!canLists}
                      onClick={() => setListEdit({ kind: l.kind, item })}>
                {l.tone ? <Chip cls={'chip--' + item.tone}>{item.name}</Chip> : <Chip cls="chip--mute">{item.name}</Chip>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {wfEdit && (
        <WorkflowModal workflow={wfEdit === 'new' ? null : wfEdit} workflows={workflows}
                       onClose={() => setWfEdit(null)}
                       onSave={async (patch, copyFrom) => {
                         const r = await flows.saveWorkflow(wfEdit === 'new' ? null : wfEdit.id, patch, copyFrom)
                         if (r.id && wfEdit === 'new') setOpenWf(r.id)
                         if (!r.error) toast(wfEdit === 'new' ? 'Workflow added.' : 'Workflow saved.')
                         return r.error
                       }} />
      )}
      {stageEdit && wf && (
        <StageModal stage={stageEdit === 'new' ? null : stageEdit} roles={accessData.roles}
                    onClose={() => setStageEdit(null)}
                    onSave={async (d) => {
                      const m = await flows.saveStage(stageEdit === 'new' ? null : stageEdit.id, wf.id, d)
                      if (!m) toast(stageEdit === 'new' ? 'Stage added.' : 'Stage saved.')
                      return m
                    }}
                    onRemove={stageEdit === 'new' ? undefined : async () => {
                      const r = await flows.removeStage(stageEdit)
                      if (!r.error) toast(r.retired ? 'Reels sit in that stage, so it is retired instead of removed.' : 'Stage removed.')
                      return r.error
                    }} />
      )}
      {statusEdit && (
        <ListItemModal title="Task status" item={statusEdit === 'new' ? null : statusEdit} withTone
                       doneLabel="Finished — a task here is done" done={statusEdit === 'new' ? false : statusEdit.isDone}
                       onClose={() => setStatusEdit(null)}
                       onSave={async (patch) => {
                         const m = await flows.saveStatus(statusEdit === 'new' ? null : statusEdit.id, patch)
                         if (!m) toast('Saved.')
                         return m
                       }} />
      )}
      {formatEdit && (
        <ListItemModal title="Content format" item={formatEdit === 'new' ? null : formatEdit} withTone={false}
                       onClose={() => setFormatEdit(null)}
                       onSave={async (patch) => {
                         const m = await flows.saveFormat(formatEdit === 'new' ? null : formatEdit.id, patch)
                         if (!m) toast('Saved.')
                         return m
                       }} />
      )}
      {listEdit && (
        <ListItemModal title={COLOUR_LISTS.find((l) => l.kind === listEdit.kind)!.one} item={listEdit.item}
                       withTone={COLOUR_LISTS.find((l) => l.kind === listEdit.kind)!.tone}
                       onClose={() => setListEdit(null)}
                       onSave={async (patch) => {
                         const m = await lists.save(listEdit.kind, listEdit.item?.id ?? null, patch)
                         if (!m) toast('Saved.')
                         return m
                       }} />
      )}
    </>
  )
}
