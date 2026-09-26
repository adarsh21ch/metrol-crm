import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { TONES, type Role, type StageDraft, type Tone, type WorkflowStage } from '@/lib/agency'

/** A stage's "who acts on it" choices: the roles held on a client's team
 *  first (they are who Round 2 hands a task to), then company-wide ones. */
export function RoleOptions({ roles }: { roles: Role[] }) {
  const live = roles.filter((r) => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const perClient = live.filter((r) => r.clientScoped)
  const company = live.filter((r) => !r.clientScoped)
  return (
    <>
      {perClient.length > 0 && (
        <optgroup label="On the client's team">
          {perClient.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      )}
      {company.length > 0 && (
        <optgroup label="Company-wide">
          {company.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      )}
    </>
  )
}

/**
 * One stage of a workflow — its name, who acts on it, and the three things a
 * stage can be: a review, something the client sees, the finish. A review
 * the client sees is the client's decision, recorded by the team (0045). Removing a
 * stage nothing uses deletes it; once reels sit in it (Round 2) the database
 * refuses, and it is retired instead so their history keeps its name.
 */
export function StageModal({
  stage, roles, onClose, onSave, onRemove,
}: {
  stage: WorkflowStage | null
  roles: Role[]
  onClose: () => void
  onSave: (d: StageDraft) => Promise<string | null>
  onRemove?: () => Promise<string | null>
}) {
  const [name, setName] = useState(stage?.name ?? '')
  const [ownerRoleId, setOwnerRoleId] = useState<string>(stage?.ownerRoleId ?? '')
  const [tone, setTone] = useState<Tone>(stage?.tone ?? 'accent')
  const [isReview, setIsReview] = useState(stage?.isReview ?? false)
  const [clientVisible, setClientVisible] = useState(stage?.clientVisible ?? false)
  const [isDone, setIsDone] = useState(stage?.isDone ?? false)
  const [sla, setSla] = useState(stage?.slaHours != null ? String(stage.slaHours) : '')
  const [isActive, setIsActive] = useState(stage?.isActive ?? true)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const slaNum = sla.trim() === '' ? null : Math.round(Number(sla))
  const slaBad = slaNum !== null && (!Number.isFinite(slaNum) || slaNum < 1 || slaNum > 8760)

  const save = async () => {
    if (slaBad) { setErr('Hours between 1 and 8760, or leave it empty.'); return }
    setBusy('save'); setErr(null)
    const message = await onSave({
      name, ownerRoleId: isDone ? null : ownerRoleId || null, tone, isReview, clientVisible, isDone,
      slaHours: isDone ? null : slaNum, isActive,
    })
    setBusy(null)
    if (message) { setErr(message); return }
    onClose()
  }

  const remove = async () => {
    if (!onRemove || !window.confirm(`Remove the stage "${stage?.name}"?`)) return
    setBusy('remove'); setErr(null)
    const message = await onRemove()
    setBusy(null)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={stage ? 'Edit stage' : 'New stage'}
      onClose={onClose}
      foot={
        <>
          {stage && onRemove && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={() => void remove()}>
              {busy === 'remove' ? 'Removing…' : 'Remove stage'}
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!name.trim() || !!busy} onClick={() => void save()}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="stName">Name</label>
          <input className="input" id="stName" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void save() }} />
        </div>
        <div className="field">
          <label htmlFor="stOwner">Who acts on it</label>
          <select className="input" id="stOwner" value={isDone ? '' : ownerRoleId} disabled={isDone}
                  onChange={(e) => setOwnerRoleId(e.target.value)}>
            <option value="">{isDone ? 'Nobody — it is the finish' : 'Nobody yet'}</option>
            <RoleOptions roles={roles} />
          </select>
        </div>
        <div className="field">
          <label>Colour</label>
          <div className="li-tones">
            {TONES.map((t) => (
              <button key={t.key} type="button" className={'li-tone' + (tone === t.key ? ' is-on' : '')}
                      aria-pressed={tone === t.key} onClick={() => setTone(t.key)}>
                <Chip cls={'chip--' + t.key}>{name.trim() || t.label}</Chip>
              </button>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={isReview} onChange={(e) => setIsReview(e.target.checked)} />
          A review — whoever acts here approves it or sends it back
        </label>
        <label className="check">
          <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
          The client sees it — on a review, the answer is the client's, recorded by whoever acts here
        </label>
        <label className="check">
          <input type="checkbox" checked={isDone} onChange={(e) => setIsDone(e.target.checked)} />
          The finish — a reel here is done, nobody gets a task
        </label>
        {!isDone && (
          <div className="field field--inline">
            <label htmlFor="stSla">Due within</label>
            <input className="input" id="stSla" inputMode="numeric" placeholder="—" value={sla}
                   onChange={(e) => setSla(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 90 }} />
            <span className="cell-mute">hours of reaching it (optional)</span>
          </div>
        )}
        {stage && (
          <label className="check">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            In use — a retired stage is skipped by new reels
          </label>
        )}
      </div>
    </Modal>
  )
}
