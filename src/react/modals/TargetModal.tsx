import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { fmtCompact } from '@/lib/format'
import { PLATFORM, PLATFORMS, type Platform, type ViewTarget, type ViewTargetPeriod, type WeekRule } from '@/lib/agency'
import { addDays, fmtDay, parseViews } from '@/lib/targets'

export { parseViews }
import type { PeriodDraft, TargetDraft } from '@/data/useTargets'

/** A number back into the box exactly as it is: "750M" when that IS the
 *  number, the full digits when shorthand would round it (425,296,713 must
 *  not come back as 425.3M and be saved as 425,300,000). */
export const viewsText = (n: number) => {
  const short = fmtCompact(n)
  return parseViews(short) === n ? short : n.toLocaleString('en-US')
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (from: string, to: string) =>
  `${MON[Number(from.slice(5, 7)) - 1]} – ${MON[Number(to.slice(5, 7)) - 1]}`

interface PeriodForm { id: string | null; label: string; startsOn: string; endsOn: string; share: string; own: string }

/**
 * A client's view target — the Client Master's TARGET block: a total split
 * into periods (April–June 20%, July–Sep 30%, Oct–Dec 50%). A period can
 * carry its own number too, because LavBhushan's sheet says "30% = 400M"
 * of a 1000M target (Q3): both are kept, and the period's own number wins.
 */
export function TargetModal({
  clientId, target, periods, onClose, onSave,
}: {
  clientId: string
  target: ViewTarget | null
  periods: ViewTargetPeriod[]
  onClose: () => void
  onSave: (d: TargetDraft, ps: PeriodDraft[]) => Promise<string | null>
}) {
  const year = new Date().getFullYear()
  const [label, setLabel] = useState(target?.label ?? `FY ${year}-${String(year + 1).slice(2)}`)
  const [total, setTotal] = useState(target ? viewsText(target.totalViews) : '')
  const [startsOn, setStartsOn] = useState(target?.startsOn ?? `${year}-04-01`)
  const [endsOn, setEndsOn] = useState(target?.endsOn ?? `${year + 1}-03-31`)
  const [countMain, setCountMain] = useState(target?.countMain ?? true)
  const [countFan, setCountFan] = useState(target?.countFan ?? true)
  const [platforms, setPlatforms] = useState<Platform[]>(target?.platforms ?? ['instagram', 'youtube'])
  const [rule, setRule] = useState<WeekRule>(target?.weekCountsIn ?? 'start')
  const [notes, setNotes] = useState(target?.notes ?? '')
  const [rows, setRows] = useState<PeriodForm[]>(() => periods
    .filter((p) => p.targetId === target?.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((p) => ({
      id: p.id, label: p.label, startsOn: p.startsOn, endsOn: p.endsOn,
      share: p.sharePct == null ? '' : String(p.sharePct), own: p.targetViews == null ? '' : viewsText(p.targetViews),
    })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const totalN = parseViews(total)
  const shareSum = rows.reduce((t, r) => t + (Number(r.share) || 0), 0)
  const setRow = (i: number, patch: Partial<PeriodForm>) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  /** Calendar quarters across the target, shares left for the reader to set
   *  — the sheet's 20/30/50 is a decision, not a default. */
  const quarters = () => {
    const out: PeriodForm[] = []
    let from = startsOn
    while (from <= endsOn && out.length < 8) {
      const m = Number(from.slice(5, 7))
      const y = Number(from.slice(0, 4))
      const qEndMonth = m + (2 - ((m - 1) % 3))
      const nextStart = qEndMonth === 12 ? `${y + 1}-01-01` : `${y}-${String(qEndMonth + 1).padStart(2, '0')}-01`
      const to = addDays(nextStart, -1) > endsOn ? endsOn : addDays(nextStart, -1)
      out.push({ id: null, label: monthLabel(from, to), startsOn: from, endsOn: to, share: '', own: '' })
      from = nextStart
    }
    setRows(out)
  }

  const addPeriod = () => {
    const last = rows[rows.length - 1]
    const from = last ? addDays(last.endsOn, 1) : startsOn
    const to = addDays(from, 90) > endsOn ? endsOn : addDays(from, 90)
    setRows((p) => [...p, { id: null, label: monthLabel(from, to), startsOn: from, endsOn: to, share: '', own: '' }])
  }

  const invalid = useMemo(() => {
    if (!label.trim()) return 'Give the target a name.'
    if (!totalN || totalN <= 0) return 'Type the total, e.g. 750M.'
    if (endsOn < startsOn) return 'It ends before it starts.'
    if (!countMain && !countFan) return 'Count main pages, fan pages, or both.'
    if (platforms.length === 0) return 'Pick at least one platform.'
    for (const r of rows) {
      if (!r.label.trim()) return 'Every period needs a name.'
      if (r.endsOn < r.startsOn) return `${r.label} ends before it starts.`
      if (!r.share.trim() && !r.own.trim()) return `${r.label} needs a share or its own number.`
      if (r.own.trim() && !parseViews(r.own)) return `${r.label}'s own number is not a number.`
    }
    return null
  }, [label, totalN, endsOn, startsOn, countMain, countFan, platforms, rows])

  const save = async () => {
    if (invalid || !totalN) return
    setBusy(true); setErr(null)
    const message = await onSave(
      { clientId, label, totalViews: totalN, startsOn, endsOn, countMain, countFan, platforms, weekCountsIn: rule, notes },
      rows.map((r, i) => ({
        id: r.id, label: r.label, startsOn: r.startsOn, endsOn: r.endsOn,
        sharePct: r.share.trim() ? Number(r.share) : null, targetViews: r.own.trim() ? parseViews(r.own) : null, sortOrder: i + 1,
      })),
    )
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      wide
      title={target ? 'Edit target' : 'Set a target'}
      sub={totalN ? `${fmtCompact(totalN)} views · ${fmtDay(startsOn)} to ${fmtDay(endsOn)}` : 'Views to reach, split into periods'}
      onClose={onClose}
      foot={
        <>
          {invalid && <span style={{ marginRight: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>{invalid}</span>}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!!invalid || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : target ? 'Save target' : 'Set target'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="tgLabel">Name</label>
          <input className="input" id="tgLabel" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tgTotal">Total views</label>
          <input className="input" id="tgTotal" value={total} placeholder="e.g. 750M" inputMode="decimal"
                 onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tgFrom">From</label>
          <input className="input" id="tgFrom" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tgTo">To</label>
          <input className="input" id="tgTo" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
      </div>

      <div className="tg-counts">
        <span className="tg-counts-l">Counts</span>
        <label className="check"><input type="checkbox" checked={countMain} onChange={(e) => setCountMain(e.target.checked)} />Main pages</label>
        <label className="check"><input type="checkbox" checked={countFan} onChange={(e) => setCountFan(e.target.checked)} />Fan pages</label>
        {PLATFORMS.map((p) => (
          <label className="check" key={p}>
            <input type="checkbox" checked={platforms.includes(p)}
                   onChange={(e) => setPlatforms((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))} />
            {PLATFORM[p].label}
          </label>
        ))}
      </div>

      <div className="field">
        <label>A week that runs into the next period counts in</label>
        <div className="seg seg--form" role="group">
          <button type="button" className={rule === 'start' ? 'is-on' : ''} onClick={() => setRule('start')}>The period it starts in</button>
          <button type="button" className={rule === 'end' ? 'is-on' : ''} onClick={() => setRule('end')}>The one it ends in</button>
        </div>
      </div>

      <div className="section-head">
        <h3 style={{ fontSize: 14 }}>Periods</h3>
        <div className="section-tools section-tools--tight">
          <button className="btn btn--sm" type="button" onClick={quarters}>Quarters</button>
          <button className="btn btn--sm" type="button" onClick={addPeriod}>+ Period</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="field-hint">No periods — progress is measured against the whole target only.</p>
      ) : (
        <div className="tg-periods">
          <div className="tg-period tg-period--head" aria-hidden="true">
            <span>Name</span><span>From</span><span>To</span><span>Share %</span><span>Own number</span><span />
          </div>
          {rows.map((r, i) => {
            const goal = r.own.trim() ? parseViews(r.own) : totalN && r.share ? Math.round((totalN * Number(r.share)) / 100) : null
            return (
              <div className="tg-period" key={r.id ?? 'new' + i}>
                <input className="input" aria-label="Period name" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
                <input className="input" aria-label="From" type="date" value={r.startsOn} onChange={(e) => setRow(i, { startsOn: e.target.value })} />
                <input className="input" aria-label="To" type="date" value={r.endsOn} onChange={(e) => setRow(i, { endsOn: e.target.value })} />
                <input className="input" aria-label="Share of the total, %" inputMode="decimal" value={r.share} placeholder="%"
                       onChange={(e) => setRow(i, { share: e.target.value.replace(/[^\d.]/g, '') })} />
                <input className="input" aria-label="Own number (optional)" value={r.own} placeholder={goal ? fmtCompact(goal) : '—'}
                       onChange={(e) => setRow(i, { own: e.target.value })} />
                <button className="icon-btn" type="button" aria-label={`Remove ${r.label}`} onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>×</button>
              </div>
            )
          })}
          <p className="field-hint">
            Shares add up to {shareSum}%{shareSum !== 100 && shareSum > 0 ? ` — ${shareSum < 100 ? 100 - shareSum : shareSum - 100}% ${shareSum < 100 ? 'of the target sits in no period' : 'more than the target'}` : ''}.
            A period's own number, when there is one, is its target instead of its share.
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="tgNotes">Notes</label>
        <input className="input" id="tgNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}
