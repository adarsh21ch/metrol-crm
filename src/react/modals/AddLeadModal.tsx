import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Member } from '@/lib/types'

export function AddLeadModal({
  members, onClose, onSave,
}: {
  members: Member[]
  onClose: () => void
  onSave: (row: { name: string; phone: string; email: string }, ownerId: string | null) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [owner, setOwner] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = name.trim() !== '' || phone.trim() !== ''

  return (
    <Modal
      title="Add lead" sub="One lead, typed in by hand." onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!ok || busy}
                  onClick={async () => {
                    setBusy(true)
                    await onSave({ name: name.trim() || '(no name)', phone: phone.trim(), email: email.trim() }, owner || null)
                    setBusy(false)
                  }}>
            Add lead
          </button>
        </>
      }
    >
      <div className="auth-form">
        <div className="field">
          <label htmlFor="nlName">Name</label>
          <input className="input" id="nlName" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nlPhone">Phone</label>
          <input className="input" id="nlPhone" inputMode="tel" placeholder="+91 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nlEmail">Email</label>
          <input className="input" id="nlEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nlOwner">Assign to</label>
          <select className="input" id="nlOwner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Leave unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}
