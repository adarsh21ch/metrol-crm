import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { PageKind, Workflow } from '@/lib/agency'

const FOR: { key: PageKind | 'any'; label: string }[] = [
  { key: 'main', label: 'Main pages' },
  { key: 'fan', label: 'Fan pages' },
  { key: 'any', label: 'Any page' },
]

/**
 * A workflow's name and which pages it is for. A new one can start as a copy
 * of another's stages — most new workflows are an old one with a stage more
 * or less, and eleven stages typed by hand is how mistakes get in.
 */
export function WorkflowModal({
  workflow, workflows, onClose, onSave,
}: {
  workflow: Workflow | null
  workflows: Workflow[]
  onClose: () => void
  onSave: (patch: { name: string; pageType: PageKind | null; isActive: boolean }, copyFrom: string | null) => Promise<string | null>
}) {
  const [name, setName] = useState(workflow?.name ?? '')
  const [pageFor, setPageFor] = useState<PageKind | 'any'>(workflow ? workflow.pageType ?? 'any' : 'main')
  const [isActive, setIsActive] = useState(workflow?.isActive ?? true)
  const [copyFrom, setCopyFrom] = useState<string>(workflows.find((w) => w.isActive)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    const message = await onSave(
      { name, pageType: pageFor === 'any' ? null : pageFor, isActive },
      workflow ? null : copyFrom || null,
    )
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={workflow ? 'Edit workflow' : 'New workflow'}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="wfName">Name</label>
          <input className="input" id="wfName" autoFocus placeholder="e.g. Main page carousel" value={name}
                 onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void save() }} />
        </div>
        <div className="field">
          <label>For</label>
          <div className="seg seg--form" role="group" aria-label="Which pages">
            {FOR.map((f) => (
              <button key={f.key} type="button" className={pageFor === f.key ? 'is-on' : ''} onClick={() => setPageFor(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>
        {!workflow && workflows.length > 0 && (
          <div className="field">
            <label htmlFor="wfCopy">Start with the stages of</label>
            <select className="input" id="wfCopy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Nothing — I will add them one by one</option>
              {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isActive ? '' : ' (retired)'}</option>)}
            </select>
          </div>
        )}
        {workflow && (
          <label className="check">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            In use — a retired workflow is not offered for new reels
          </label>
        )}
      </div>
    </Modal>
  )
}
