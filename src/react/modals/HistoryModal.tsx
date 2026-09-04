import { Modal } from '@/components/Modal'
import { fmtWhen, money } from '@/lib/format'
import { QUALITY, STATUS, type Lead, type LeadEvent, type Member } from '@/lib/types'

/** Every change to a lead, oldest first — so the owner can open any lead and
 *  see where it has been: who held it, how the status moved, when it closed. */
export function HistoryModal({
  lead, events, members, projectName, onClose,
}: {
  lead: Lead
  events: LeadEvent[]
  members: Member[]
  projectName: string
  onClose: () => void
}) {
  const mine = events
    .filter((e) => e.leadId === lead.id)
    .sort((a, b) => a.at - b.at || a.id - b.id)

  const owner = members.find((m) => m.id === lead.ownerId)
  const meta: [string, string][] = [
    ['Phone', lead.phone || '—'],
    ['Project', projectName],
    ['Email', lead.email || '—'],
    ['Status', STATUS[lead.status].label],
    ['Quality', lead.quality ? QUALITY[lead.quality].label : '—'],
    ['Assigned to', owner?.name ?? 'Unassigned'],
    ['Sale', lead.amount ? money(lead.amount) + (lead.verified ? ' · verified' : ' · pending') : '—'],
  ]

  return (
    <Modal
      title={lead.name} sub="Every change to this lead, oldest first" wide onClose={onClose}
      foot={<button className="btn btn--sm" onClick={onClose}>Close</button>}
    >
      <div className="hist-meta">
        {meta.map(([k, v]) => (
          <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
        ))}
      </div>
      <div className="hist-wrap">
        <table className="hist">
          <thead><tr><th>When</th><th>What changed</th><th>From</th><th>To</th><th>By</th></tr></thead>
          <tbody>
            {mine.length === 0 && (
              <tr><td colSpan={5} className="cell-dash">Nothing recorded for this lead yet.</td></tr>
            )}
            {mine.map((e) => (
              <tr key={e.id}>
                <td className="when">{fmtWhen(e.at)}</td>
                <td className="what">{e.what}</td>
                <td>{e.from || <span className="cell-dash">—</span>}</td>
                <td>{e.what === 'Sale recorded' && e.to ? money(Number(e.to)) : (e.to || <span className="cell-dash">—</span>)}</td>
                <td>{e.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
