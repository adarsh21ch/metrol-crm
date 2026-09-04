import { Kpi } from '@/components/bits'
import { fmtWhen, money, pct } from '@/lib/format'
import { isConnected, type Lead, type LeadEvent } from '@/lib/types'

/** A summary that points at the other pages, not a copy of them: three things
 *  worth acting on, and what has happened lately. */
export function Overview({
  leads, conv, events, onGo,
}: {
  leads: Lead[]
  conv: Lead[]
  events: LeadEvent[]
  onGo: (sec: 'leads' | 'sales') => void
}) {
  const gross = conv.reduce((s, l) => s + l.amount, 0)
  const connected = leads.filter(isConnected).length

  const attention = [
    { n: leads.filter((l) => !l.ownerId).length, label: 'leads with nobody on them', cta: 'Assign', go: 'leads' as const },
    { n: leads.filter((l) => l.status === 'follow_up').length, label: 'follow-ups open right now', cta: 'Open leads', go: 'leads' as const },
    { n: conv.filter((l) => !l.verified).length, label: 'payments still unverified', cta: 'Open sales', go: 'sales' as const },
  ]

  const here = new Set(leads.map((l) => l.id))
  const byId = new Map(leads.map((l) => [l.id, l]))
  const recent = events
    .filter((e) => here.has(e.leadId))
    .sort((a, b) => b.at - a.at || b.id - a.id)
    .slice(0, 8)

  return (
    <div className="section is-on">
      <div className="section-head">
        <h3>Overview</h3>
        <div className="sub">Everything in this project, right now</div>
      </div>

      <div className="kpis">
        <Kpi accent label="Total leads" value={leads.length}
             sub={`${leads.filter((l) => l.status === 'new').length} waiting to be called`} />
        <Kpi label="Connected" value={connected} sub={`${pct(connected, leads.length)} of all leads`} />
        <Kpi label="Follow-ups" value={leads.filter((l) => l.status === 'follow_up').length} sub="open right now" />
        <Kpi label="Customers" value={conv.length} sub={`${pct(conv.length, leads.length)} conversion`} />
        <Kpi label="Gross sale" value={money(gross)} sub={`${conv.filter((l) => !l.verified).length} payments pending`} />
      </div>

      <div className="ov-grid">
        <div className="ov-card">
          <div className="ov-head"><h4>Needs attention</h4></div>
          <div className="ov-actions">
            {attention.map((x) => (
              <button className="ov-row" key={x.label} onClick={() => onGo(x.go)}>
                <span className={'ov-n' + (x.n ? '' : ' is-zero')}>{x.n}</span>
                <span className="ov-l">{x.label}</span>
                <span className="ov-cta">{x.cta} →</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-head"><h4>Recent activity</h4><span className="sub">Across every lead here</span></div>
          <div className="ov-feed">
            {recent.length === 0 && <div className="cell-dash">Nothing recorded yet.</div>}
            {recent.map((e) => (
              <div className="ov-ev" key={e.id}>
                <span className="ov-ev-nm">{byId.get(e.leadId)?.name ?? '—'}</span>
                <span className="ov-ev-what">
                  {e.what}
                  {e.to && <> <b>{e.what === 'Sale recorded' ? money(Number(e.to)) : e.to}</b></>}
                </span>
                <span className="ov-ev-by">{e.by}</span>
                <span className="ov-ev-at">{fmtWhen(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
