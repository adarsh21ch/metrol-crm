import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { isOwnerLevel, type Client, type Employee, type Page, type PageAssignment } from '@/lib/hr'
import { actingRoles, doneStatusIds, fmtDue, fmtStamp, isOverdue, nextStage, personFor, workflowFor, type ContentItem, type Task } from '@/lib/work'
import type { Role } from '@/lib/agency'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

/**
 * One content item — new, or open to read, edit and move. Who does each
 * role on it is usually already decided: the page's holder for the SMM
 * role, the only editor on the client's team for Editing. Only where the
 * team has several (Subhash Goyal has three editors) does somebody have to
 * pick — and "Decide later" is allowed: the task then waits, unassigned,
 * and whoever made the item is told.
 */
export function ContentItemModal({
  ws, agency, flows, work, item, clients, presetClientId, pages, pageAssignments, staff, canEdit, toast, onOpenTask, onClose,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  item: ContentItem | null
  /** For a new item: the clients this person may add to. */
  clients: Client[]
  presetClientId: string | null
  pages: Page[]
  pageAssignments: PageAssignment[]
  staff: Employee[]
  canEdit: boolean
  toast: (m: string) => void
  onOpenTask: (t: Task) => void
  onClose: () => void
}) {
  const { access, team, accessData, myEmployee } = agency
  const isNew = !item
  const firstClient = presetClientId && clients.some((c) => c.id === presetClientId)
    ? presetClientId : clients.length === 1 ? clients[0]!.id : ''
  const [clientId, setClientId] = useState(item?.clientId ?? firstClient)
  const livePages = (cid: string) => pages.filter((p) => p.clientId === cid && (p.isActive || p.id === item?.pageId))
  const myPageOn = (cid: string) => livePages(cid).find((p) => pageAssignments.some((a) => a.pageId === p.id && a.employeeId === myEmployee?.id))?.id ?? ''
  const [pageId, setPageId] = useState(item?.pageId ?? (firstClient ? myPageOn(firstClient) : ''))
  const pageType = pages.find((p) => p.id === pageId)?.pageType ?? null
  const liveWfs = flows.workflows.filter((w) => w.isActive || w.id === item?.workflowId).sort((a, b) => a.sortOrder - b.sortOrder)
  const [wfChosen, setWfChosen] = useState<string | null>(item?.workflowId ?? null)
  const workflowId = wfChosen ?? workflowFor(flows.workflows, pageType === 'main' || pageType === 'fan' ? pageType : null)?.id ?? ''
  const [title, setTitle] = useState(item?.title ?? '')
  const [formatId, setFormatId] = useState(item?.formatId ?? '')
  const [postOn, setPostOn] = useState(item?.plannedPostOn ?? '')
  const [scriptUrl, setScriptUrl] = useState(item?.scriptUrl ?? '')
  const [script, setScript] = useState(item?.script ?? '')
  const [stageId, setStageId] = useState(item?.stageId ?? '')
  const named = (roleId: string) => (item ? work.people.find((p) => p.itemId === item.id && p.roleId === roleId)?.employeeId ?? '' : '')
  const [picks, setPicks] = useState<Record<string, string>>({})
  const pickOf = (roleId: string) => picks[roleId] ?? named(roleId)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const client = clients.find((c) => c.id === clientId) ?? null
  const stages = flows.stages.filter((s) => s.workflowId === workflowId).sort((a, b) => a.sortOrder - b.sortOrder)
  const stage = stages.find((s) => s.id === (item?.stageId ?? '')) ?? null
  const roles = useMemo(() => actingRoles(flows.stages, workflowId, accessData.roles), [flows.stages, workflowId, accessData.roles])
  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const itemTasks = item ? work.tasks.filter((t) => t.contentItemId === item.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []
  const canDelete = !!item && !!client && (isOwnerLevel(ws) || access.canForClient(client, 'manage_clients'))
  const editable = canEdit

  const nameOf = (employeeId: string) =>
    team.rows.find((t) => t.employeeId === employeeId)?.fullName
    ?? staff.find((e) => e.id === employeeId)?.fullName ?? 'Someone'

  /** A role's choices on this client, and who it falls to if nobody picks. */
  const roleChoices = (r: Role) => {
    const holders = [...new Set(team.rows.filter((a) => a.clientId === clientId && a.roleId === r.id && !a.endedAt).map((a) => a.employeeId))]
    const pageHolders = pageAssignments.filter((a) => a.pageId === pageId)
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt)).map((a) => a.employeeId)
    const auto = personFor({ named: null, isPageHolderRole: r.pageHolder, pageHolders, teamHolders: holders })
    const why = auto && r.pageHolder && pageHolders.length ? 'holds the page' : auto ? `the team's only ${r.name}` : ''
    const people = [...new Set([...holders, ...(r.pageHolder ? pageHolders : [])])]
    return { holders, auto, why, people }
  }

  const save = async () => {
    if (!title.trim()) { setErr('Give it a title.'); return }
    if (isNew && !clientId) { setErr('Pick a client.'); return }
    if (isNew && !workflowId) { setErr('Pick a workflow.'); return }
    setBusy('save'); setErr(null)
    if (isNew) {
      const people = roles.filter((r) => r.clientScoped && pickOf(r.id)).map((r) => ({ roleId: r.id, employeeId: pickOf(r.id) }))
      const res = await work.createItem({
        clientId, pageId: pageId || null, workflowId, title, formatId: formatId || null, script, scriptUrl,
        plannedPostOn: postOn || null, people,
      })
      setBusy(null)
      if (res.error) { setErr(res.error); return }
      toast(res.item ? `${res.item.code} added — its first task is out.` : 'Added.')
      onClose()
      return
    }
    const patch = {
      ...(title.trim() !== item.title ? { title } : {}),
      ...((pageId || null) !== item.pageId ? { pageId: pageId || null } : {}),
      ...((formatId || null) !== item.formatId ? { formatId: formatId || null } : {}),
      ...((postOn || null) !== item.plannedPostOn ? { plannedPostOn: postOn || null } : {}),
      ...(scriptUrl.trim() !== item.scriptUrl ? { scriptUrl } : {}),
      ...(script.trim() !== item.script ? { script } : {}),
    }
    let message: string | null = null
    if (Object.keys(patch).length) message = await work.updateItem(item.id, patch)
    for (const r of roles) {
      if (message) break
      if (r.id in picks && picks[r.id] !== named(r.id)) message = await work.setPerson(item.id, r.id, picks[r.id] || null)
    }
    if (!message && stageId && stageId !== item.stageId) message = await work.moveItem(item.id, stageId)
    setBusy(null)
    if (message) { setErr(message); return }
    toast('Saved.')
    onClose()
  }

  const remove = async () => {
    if (!item || !window.confirm(`Delete ${item.code} "${item.title}" and its tasks? This cannot be undone.`)) return
    setBusy('delete'); setErr(null)
    const message = await work.deleteItem(item.id)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(`${item.code} deleted.`)
    onClose()
  }

  const moveTo = stageId && item && stageId !== item.stageId ? stages.find((s) => s.id === stageId) : null
  const next = stage ? nextStage(flows.stages, stage) : null

  return (
    <Modal
      wide
      title={isNew ? 'New content' : item.title}
      sub={isNew ? 'Its first stage\'s task goes out the moment you add it.'
        : [item.code, client?.name, stage?.name].filter(Boolean).join(' · ')}
      onClose={onClose}
      foot={
        <>
          {canDelete && editable && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={() => void remove()}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>
          {editable && (
            <button className="btn btn--sm btn--primary" disabled={!title.trim() || !!busy} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="ciTitle">Title</label>
          <input className="input" id="ciTitle" autoFocus={isNew} value={title} disabled={!editable}
                 placeholder="5 herbs for better sleep" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="ciClient">Client</label>
            <select className="input" id="ciClient" value={clientId} disabled={!isNew}
                    onChange={(e) => { setClientId(e.target.value); setPageId(myPageOn(e.target.value)); setPicks({}) }}>
              {!clientId && <option value="">Pick a client</option>}
              {(isNew ? clients : clients.filter((c) => c.id === clientId)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ciPage">Page</label>
            <select className="input" id="ciPage" value={pageId} disabled={!editable || !clientId}
                    onChange={(e) => { setPageId(e.target.value); if (isNew) setWfChosen(null) }}>
              <option value="">No page</option>
              {livePages(clientId).map((p) => (
                <option key={p.id} value={p.id}>{(p.label || p.instagramHandle) + (p.pageType === 'main' ? ' (main)' : '')}</option>
              ))}
            </select>
          </div>
          {isNew ? (
            <div className="field">
              <label htmlFor="ciWf">Workflow</label>
              <select className="input" id="ciWf" value={workflowId} onChange={(e) => { setWfChosen(e.target.value); setPicks({}) }}>
                {!workflowId && <option value="">No workflow in use</option>}
                {liveWfs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="ciStage">Stage</label>
              <select className="input" id="ciStage" value={stageId} disabled={!editable} onChange={(e) => setStageId(e.target.value)}>
                {stages.filter((s) => s.isActive || s.id === item.stageId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.isActive ? '' : ' (retired)'}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="ciFormat">Format</label>
            <select className="input" id="ciFormat" value={formatId} disabled={!editable} onChange={(e) => setFormatId(e.target.value)}>
              <option value="">—</option>
              {flows.formats.filter((f) => f.isActive || f.id === formatId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ciPost">Post on</label>
            <input className="input" id="ciPost" type="date" value={postOn} disabled={!editable} onChange={(e) => setPostOn(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ciUrl">Script link</label>
            <input className="input" id="ciUrl" inputMode="url" placeholder="Google Doc link" value={scriptUrl} disabled={!editable}
                   onChange={(e) => setScriptUrl(e.target.value)} />
          </div>
        </div>
        {moveTo && (
          <p className="cell-mute" style={{ margin: 0 }}>
            Saving moves it to <b>{moveTo.name}</b>: the {stage?.name ?? 'current'} task closes
            {moveTo.isDone ? ' and it is finished.' : ' and the new stage\'s task goes to whoever holds it.'}
          </p>
        )}
        {!isNew && !moveTo && next && !stage?.isDone && (
          <p className="cell-mute" style={{ margin: 0 }}>Finishing the {stage?.name} task moves it on to {next.name}.</p>
        )}
        <div className="field">
          <label htmlFor="ciScript">Script</label>
          <textarea className="input" id="ciScript" rows={4} value={script} disabled={!editable}
                    placeholder="Or paste the script here" onChange={(e) => setScript(e.target.value)} />
        </div>

        {clientId && roles.length > 0 && (
          <div className="work-people">
            <div className="work-people-h">Who does what</div>
            {roles.map((r) => {
              if (!r.clientScoped) {
                return (
                  <div key={r.id} className="field field--inline">
                    <label>{r.name}</label>
                    <span className="cell-mute">whoever holds it company-wide</span>
                  </div>
                )
              }
              const c = roleChoices(r)
              const v = pickOf(r.id)
              return (
                <div key={r.id} className="field field--inline">
                  <label htmlFor={'ciRole' + r.id}>{r.name}</label>
                  <select className="input" id={'ciRole' + r.id} value={v} disabled={!editable}
                          onChange={(e) => setPicks((p) => ({ ...p, [r.id]: e.target.value }))}>
                    <option value="">
                      {c.auto ? `${nameOf(c.auto)} (${c.why})` : c.holders.length > 1 ? 'Decide later' : 'Nobody on the team yet'}
                    </option>
                    {c.people.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
                  </select>
                  {!v && !c.auto && (
                    <span className="cell-warn">
                      {c.holders.length > 1 ? 'its task waits until someone picks' : 'add one on the client\'s Team tab'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {itemTasks.length > 0 && (
          <div className="work-people">
            <div className="work-people-h">Tasks so far</div>
            <div className="work-tl">
              {itemTasks.map((t) => {
                const st = flows.stages.find((s) => s.id === t.stageId)
                const status = flows.statuses.find((s) => s.id === t.statusId)
                const late = isOverdue(t, done)
                return (
                  <button key={t.id} type="button" className="work-tl-row" onClick={() => onOpenTask(t)}>
                    <span className="work-tl-stage">{st?.name ?? t.title}</span>
                    <span className={t.assigneeId ? 'work-tl-who' : 'work-tl-who cell-warn'}>{t.assigneeName || 'Nobody yet'}</span>
                    <Chip cls={'chip--' + (status?.tone ?? 'mute')}>{status?.name ?? '—'}</Chip>
                    <span className={'work-tl-when' + (late ? ' cell-late' : '')}>
                      {done.has(t.statusId) ? fmtStamp(t.completedAt) : t.dueAt ? 'due ' + fmtDue(t.dueAt) : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
