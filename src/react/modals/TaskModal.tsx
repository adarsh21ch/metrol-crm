import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { VersionsPanel } from '@/components/VersionsPanel'
import { isOwnerLevel, type Client, type Employee } from '@/lib/hr'
import {
  NO_VERSION_DRAFT, PRIORITIES, canEditWorkOn, doneStatusIds, eventWords, fmtStamp, fromLocalInput, nextStage, toLocalInput,
  type ContentItem, type ContentVersion, type Priority, type Task, type TaskPatch, type ThreadEntry, type VersionDraft,
} from '@/lib/work'
import type { StaffPick } from '@/data/useClientTeam'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

/** can_manage_task() and friends, restated so a screen can hide what the
 *  database would refuse. `manage`: change what the task IS (title, who,
 *  due, priority); `status`: move it along; `del`: remove it. */
export function taskRights(ws: Workspace, agency: Agency, staff: Employee[], clients: Client[], t: Task) {
  const owner = isOwnerLevel(ws)
  const meProfile = ws.me?.id ?? null
  const meEmployee = agency.myEmployee?.id ?? null
  const client = t.clientId ? clients.find((c) => c.id === t.clientId) ?? null : null
  const assignee = t.assigneeId ? staff.find((e) => e.id === t.assigneeId) ?? null : null
  const manage = owner
    || (!!meProfile && t.createdBy === meProfile)
    || (!!client && canEditWorkOn(ws, agency.access, client))
    || (!!assignee && ((!!meEmployee && assignee.reportingTo === meEmployee)
      || agency.access.canInDepartment(assignee.departmentId, 'view_all_work')))
  const mine = !!meEmployee && t.assigneeId === meEmployee
  return { manage, status: manage || mine, del: !t.contentItemId && (owner || (!!meProfile && t.createdBy === meProfile)) }
}

/** Who may do what with a reel's versions (0045's rules, restated):
 *  `add` — the client's team, whoever manages it, anyone named on the reel
 *  or holding a task on it; `fix` — whoever added that version, the owner, HR. */
export function versionRights(ws: Workspace, agency: Agency, work: Work, client: Client | null, item: ContentItem) {
  const me = agency.myEmployee?.id ?? null
  const worksOn = !!me && (work.people.some((p) => p.itemId === item.id && p.employeeId === me)
    || work.tasks.some((t) => t.contentItemId === item.id && t.assigneeId === me))
  return {
    add: (!!client && canEditWorkOn(ws, agency.access, client)) || worksOn,
    fix: (v: ContentVersion) => isOwnerLevel(ws) || (!!ws.me?.id && v.createdBy === ws.me.id),
  }
}

/**
 * One task: new, or open. The person it is given to moves its status; the
 * person who gave it (or manages the client, or the assignee) can change
 * everything else. A stage's task says what finishing it does — the item
 * moves on and the next person gets theirs. Below it, the thread:
 * comments and what the database recorded, oldest first.
 */
export function TaskModal({
  ws, agency, flows, work, clients, staff, task, presetClientId, toast, onClose,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  clients: Client[]
  staff: Employee[]
  task: Task | null
  presetClientId?: string | null
  toast: (m: string) => void
  onClose: () => void
}) {
  const isNew = !task
  const rights = task ? taskRights(ws, agency, staff, clients, task) : { manage: true, status: true, del: false }
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [clientId, setClientId] = useState<string>(task?.clientId ?? presetClientId ?? '')
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId ?? (isNew ? agency.myEmployee?.id ?? '' : ''))
  const [due, setDue] = useState(toLocalInput(task?.dueAt ?? null))
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal')
  const [statusId, setStatusId] = useState(task?.statusId ?? '')
  const [people, setPeople] = useState<StaffPick[] | null>(null)
  const [thread, setThread] = useState<ThreadEntry[] | null>(null)
  const [note, setNote] = useState('')
  const [verDraft, setVerDraft] = useState<VersionDraft>(NO_VERSION_DRAFT)
  const [busy, setBusy] = useState<'save' | 'delete' | 'comment' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const taskId = task?.id ?? null
  const { thread: readThread, assignable } = work
  useEffect(() => {
    if (!taskId) return
    let alive = true
    void readThread(taskId).then((r) => { if (alive) { setThread(r.rows); if (r.error) setErr(r.error) } })
    return () => { alive = false }
  }, [taskId, readThread])

  const scopeClient = clientId || null
  useEffect(() => {
    if (!rights.manage) return
    let alive = true
    void assignable(scopeClient).then((r) => { if (alive) setPeople(r.rows) })
    return () => { alive = false }
  }, [scopeClient, rights.manage, assignable])

  const item = task?.contentItemId ? work.items.find((i) => i.id === task.contentItemId) ?? null : null
  const stage = task?.stageId ? flows.stages.find((s) => s.id === task.stageId) ?? null : null
  const next = stage ? nextStage(flows.stages, stage) : null
  const statuses = flows.statuses.filter((s) => s.isActive || s.id === task?.statusId).sort((a, b) => a.sortOrder - b.sortOrder)
  const client = clients.find((c) => c.id === (task?.clientId ?? clientId)) ?? null
  const seeClients = useMemo(() => clients.filter((c) => c.isActive || c.id === task?.clientId), [clients, task?.clientId])
  // The reel's current task, still open — the one whose stage it sits in.
  // Only that task decides a review; an older one just shows the history.
  const done = useMemo(() => doneStatusIds(flows.statuses), [flows.statuses])
  const current = !!task && !!item && task.stageId === item.stageId && !done.has(task.statusId)
  const verRights = item ? versionRights(ws, agency, work, client, item) : null

  // Keep the current holder in the list even if the picker no longer offers
  // them (resigned, or off the client's team) — so the select shows the truth.
  const pickList = (() => {
    const list = [...(people ?? [])]
    if (task?.assigneeId && !list.some((p) => p.id === task.assigneeId)) {
      list.unshift({ id: task.assigneeId, fullName: task.assigneeName || 'Current holder', designation: '', departmentId: null })
    }
    return list
  })()

  const reloadThread = async () => {
    if (!taskId) return
    const r = await readThread(taskId)
    setThread(r.rows)
  }

  const save = async () => {
    if (!title.trim()) { setErr('Say what the task is.'); return }
    setBusy('save'); setErr(null)
    if (isNew) {
      const message = await work.createTask({
        title, description, clientId: clientId || null, assigneeId: assigneeId || null,
        dueAt: fromLocalInput(due), priority,
      })
      setBusy(null)
      if (message) { setErr(message); return }
      toast(assigneeId && assigneeId !== agency.myEmployee?.id ? 'Task given.' : 'Task added.')
      onClose()
      return
    }
    // A link typed but not yet added goes in with the save.
    if (item && verDraft.url.trim()) {
      const message = await work.addVersion(item.id, verDraft.url, verDraft.note)
      if (message) { setBusy(null); setErr(message); return }
      setVerDraft(NO_VERSION_DRAFT)
    }
    const patch: TaskPatch = {}
    if (rights.manage) {
      if (title.trim() !== task.title) patch.title = title
      if (description.trim() !== task.description) patch.description = description
      if ((assigneeId || null) !== task.assigneeId) patch.assigneeId = assigneeId || null
      const dueIso = fromLocalInput(due)
      if (toLocalInput(dueIso) !== toLocalInput(task.dueAt)) patch.dueAt = dueIso
      if (priority !== task.priority) patch.priority = priority
    }
    if (rights.status && statusId && statusId !== task.statusId) patch.statusId = statusId
    if (Object.keys(patch).length === 0) { setBusy(null); onClose(); return }
    const message = await work.updateTask(task.id, patch)
    setBusy(null)
    if (message) { setErr(message); return }
    const finished = patch.statusId && flows.statuses.find((s) => s.id === patch.statusId)?.isDone
    toast(finished && next && item ? `Done — ${item.code} moves on to ${next.name}.` : 'Saved.')
    onClose()
  }

  const remove = async () => {
    if (!task || !window.confirm(`Delete ${task.code} "${task.title}"?`)) return
    setBusy('delete'); setErr(null)
    const message = await work.deleteTask(task.id)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(`${task.code} deleted.`)
    onClose()
  }

  const send = async () => {
    if (!task || !note.trim()) return
    setBusy('comment'); setErr(null)
    const message = await work.comment(task.id, note)
    setBusy(null)
    if (message) { setErr(message); return }
    setNote('')
    await reloadThread()
  }

  const canSave = isNew || rights.manage || rights.status
  const sub = isNew
    ? 'They are told the moment you save it.'
    : [task.code, client?.name, item ? `${item.code} · ${stage?.name ?? ''}` : null, task.creatorName ? `from ${task.creatorName}` : null]
      .filter(Boolean).join(' · ')

  return (
    <Modal
      wide
      title={isNew ? 'New task' : task.title}
      sub={sub}
      onClose={onClose}
      foot={
        <>
          {rights.del && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={() => void remove()}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>{canSave ? 'Cancel' : 'Close'}</button>
          {canSave && (
            <button className="btn btn--sm btn--primary" disabled={!title.trim() || !!busy} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : isNew ? (assigneeId && assigneeId !== agency.myEmployee?.id ? 'Give task' : 'Add') : 'Save'}
            </button>
          )}
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        {(isNew || rights.manage) && !task?.contentItemId && (
          <div className="field">
            <label htmlFor="tkTitle">Task</label>
            <input className="input" id="tkTitle" autoFocus={isNew} value={title} placeholder="What needs doing"
                   onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
        {current && item && next && (
          <p className="cell-mute" style={{ margin: 0 }}>
            {stage?.isReview && work.versionsOn
              ? <>Approving it moves {item.code} on to <b>{next.name}</b>.</>
              : <>{stage?.isReview ? 'A review. ' : ''}Finishing it moves {item.code} on to <b>{next.name}</b> — whoever holds that gets the next task.</>}
          </p>
        )}
        {task && item && work.versionsOn && verRights && (
          <VersionsPanel
            item={item} flows={flows} work={work}
            canAdd={verRights.add} canReview={current && rights.status} mayFix={verRights.fix}
            draft={verDraft} onDraft={setVerDraft} toast={toast} onReviewed={onClose}
          />
        )}
        <div className="field-grid">
          {!task?.contentItemId && (
            <div className="field">
              <label htmlFor="tkClient">Client</label>
              <select className="input" id="tkClient" value={clientId} disabled={!isNew && !rights.manage}
                      onChange={(e) => { setClientId(e.target.value); setPeople(null) }}>
                <option value="">No client</option>
                {seeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="tkWho">Who does it</label>
            {rights.manage ? (
              <select className="input" id="tkWho" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">{people === null ? 'Loading…' : 'Nobody yet'}</option>
                {pickList.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}{p.id === agency.myEmployee?.id ? ' (you)' : ''}</option>
                ))}
              </select>
            ) : (
              <input className="input" id="tkWho" value={task?.assigneeName || 'Nobody yet'} disabled />
            )}
          </div>
          {!isNew && (
            <div className="field">
              <label htmlFor="tkStatus">Status</label>
              <select className="input" id="tkStatus" value={statusId} disabled={!rights.status} onChange={(e) => setStatusId(e.target.value)}>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="tkDue">Due</label>
            <input className="input" id="tkDue" type="datetime-local" value={due} disabled={!rights.manage}
                   onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tkPri">Priority</label>
            <select className="input" id="tkPri" value={priority} disabled={!rights.manage}
                    onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        </div>
        {(isNew || rights.manage || description) && (
          <div className="field">
            <label htmlFor="tkDesc">Details</label>
            <textarea className="input" id="tkDesc" rows={3} value={description} disabled={!isNew && !rights.manage}
                      placeholder="Anything they need to know" onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}

        {task && (
          <div className="work-people">
            <div className="work-people-h">Comments &amp; history</div>
            {thread === null ? <p className="cell-mute" style={{ margin: 0 }}>Loading…</p> : (
              <div className="work-thread">
                {thread.map((e) => (
                  <div key={e.kind + e.id} className={'work-th' + (e.kind === 'comment' ? ' is-comment' : '')}>
                    <div className="work-th-top">
                      <b>{e.who}</b>
                      {e.kind === 'event' && <span> {eventWords(e)}</span>}
                      <span className="work-th-at">{fmtStamp(e.at)}</span>
                    </div>
                    {e.body && <div className={e.kind === 'comment' ? 'work-th-body' : 'work-th-note'}>{e.body}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="work-reply">
              <textarea className="input" rows={2} aria-label="Write a comment" placeholder="Write a comment — they are told"
                        value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn--sm" disabled={!note.trim() || !!busy} onClick={() => void send()}>
                {busy === 'comment' ? 'Sending…' : 'Comment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
