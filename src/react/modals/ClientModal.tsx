import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Client } from '@/lib/hr'
import type { ListItem } from '@/lib/agency'
import type { ClientDetails } from '@/data/useClients'

/** The Client Master's columns for one client — add or edit. The Client ID
 *  (MM-0001) is the database's, never typed. */
export function ClientModal({
  client, statuses, onClose, onSave,
}: {
  client: Client | null
  statuses: ListItem[]
  onClose: () => void
  onSave: (d: ClientDetails) => Promise<string | null>
}) {
  const [f, setF] = useState<ClientDetails>(() => ({
    name: client?.name ?? '',
    notes: client?.notes ?? '',
    company: client?.company ?? '',
    industry: client?.industry ?? '',
    contactName: client?.contactName ?? '',
    contactPhone: client?.contactPhone ?? '',
    contactEmail: client?.contactEmail ?? '',
    startedOn: client?.startedOn ?? null,
    endsOn: client?.endsOn ?? null,
    statusId: client?.statusId ?? statuses.find((s) => s.isActive)?.id ?? null,
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof ClientDetails>(k: K, v: ClientDetails[K]) => setF((p) => ({ ...p, [k]: v }))
  const badDates = !!f.startedOn && !!f.endsOn && f.endsOn < f.startedOn

  const save = async () => {
    setBusy(true); setErr(null)
    const message = await onSave(f)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      wide
      title={client ? 'Edit client' : 'Add client'}
      sub={client?.code || 'The Client ID is given when you save.'}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!f.name.trim() || badDates || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : client ? 'Save changes' : 'Add client'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="clName">Client</label>
          <input className="input" id="clName" autoFocus value={f.name} placeholder="e.g. Subhash Goyal"
                 onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clStatus">Status</label>
          <select className="input" id="clStatus" value={f.statusId ?? ''} onChange={(e) => set('statusId', e.target.value || null)}>
            <option value="">—</option>
            {statuses.filter((s) => s.isActive || s.id === f.statusId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="clCompany">Company</label>
          <input className="input" id="clCompany" value={f.company} onChange={(e) => set('company', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clIndustry">Industry</label>
          <input className="input" id="clIndustry" value={f.industry} placeholder="e.g. Ayurveda & health"
                 onChange={(e) => set('industry', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clContact">Contact person</label>
          <input className="input" id="clContact" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clPhone">Contact phone</label>
          <input className="input" id="clPhone" type="tel" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clEmail">Contact email</label>
          <input className="input" id="clEmail" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clStart">Started</label>
          <input className="input" id="clStart" type="date" value={f.startedOn ?? ''} onChange={(e) => set('startedOn', e.target.value || null)} />
        </div>
        <div className="field">
          <label htmlFor="clEnd">Contract ends</label>
          <input className="input" id="clEnd" type="date" value={f.endsOn ?? ''} onChange={(e) => set('endsOn', e.target.value || null)} />
          {badDates && <p className="field-hint" style={{ color: 'var(--bad)' }}>Ends before it starts.</p>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="clNotes">Notes</label>
        <textarea className="input" id="clNotes" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </Modal>
  )
}
