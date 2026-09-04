import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Lead } from '@/lib/types'

export function SaleModal({
  lead, onClose, onSave,
}: { lead: Lead; onClose: () => void; onSave: (amount: number) => Promise<void> }) {
  const [v, setV] = useState(lead.amount ? String(lead.amount) : '')
  const [busy, setBusy] = useState(false)
  const amount = parseInt(v, 10)
  const ok = Number.isFinite(amount) && amount > 0

  return (
    <Modal
      title="Record sale" sub={lead.name} onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!ok || busy}
                  onClick={async () => { setBusy(true); await onSave(amount); setBusy(false) }}>
            Save sale
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="saleAmount">Sale amount (₹)</label>
        <input className="input" id="saleAmount" type="number" inputMode="numeric" autoFocus
               placeholder="e.g. 125000" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        The owner verifies the payment once it lands. Until then it shows as{' '}
        <b style={{ color: 'var(--warn)' }}>Pending</b> in the Sales section.
      </p>
    </Modal>
  )
}
