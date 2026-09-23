import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import type { IncentivePageType } from '@/lib/hr'
import type { Department } from '@/lib/types'
import { fmtCompact, money } from '@/lib/format'
import type { IncentiveRules } from '@/data/useIncentiveRules'

/** HR's incentive tiers — a settings screen, not a daily one (Adarsh,
 *  2026-09-22: "not something they want to see regularly"), so it lives
 *  behind a button on the claims list rather than its own permanent section
 *  on the page. Same add/retire shape the inline version had; only where it
 *  lives changed. */
export function IncentiveRulesModal({
  rules, departments, onClose,
}: {
  rules: IncentiveRules
  departments: Department[]
  onClose: () => void
}) {
  const [dept, setDept] = useState('')
  const [pageType, setPageType] = useState<IncentivePageType>('main')
  const [label, setLabel] = useState('')
  const [minViews, setMinViews] = useState('')
  const [amount, setAmount] = useState('')

  return (
    <Modal
      title="Incentive rules"
      sub="What a viral reel is worth, per department"
      onClose={onClose}
      foot={<button className="btn btn--sm btn--primary" onClick={onClose}>Done</button>}
    >
      <p className="punch-note" style={{ margin: '0 0 14px' }}>
        An employee picks main or fan page per reel when they submit it — set the amount for each here.
      </p>
      <div className="hol-add" style={{ flexWrap: 'wrap' }}>
        <select className="input" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Department…</option>
          {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input" aria-label="Page type" value={pageType} onChange={(e) => setPageType(e.target.value as IncentivePageType)}>
          <option value="main">Main page</option>
          <option value="fan">Fan page</option>
        </select>
        <input className="input" type="text" aria-label="Tier name" placeholder="e.g. 1M+ views" style={{ maxWidth: 140 }}
               value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="input" type="number" min={0} aria-label="Minimum views" placeholder="Min views" style={{ maxWidth: 120 }}
               value={minViews} onChange={(e) => setMinViews(e.target.value)} />
        <input className="input" type="number" min={0} aria-label="Amount" placeholder="Amount ₹" style={{ maxWidth: 110 }}
               value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn btn--sm btn--primary"
                disabled={!dept || !label.trim() || minViews === '' || amount === ''}
                onClick={() => void rules.add({
                  departmentId: dept, pageType, label, minViews: Number(minViews), amount: Number(amount),
                }).then((m) => { if (!m) { setLabel(''); setMinViews(''); setAmount('') } })}>
          Add tier
        </button>
      </div>
      {rules.rows.length === 0 ? (
        <p style={{ color: 'var(--ink-3)' }}>No incentive rules set up yet.</p>
      ) : (
        <div className="ov-actions">
          {[...rules.rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => (
            <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
              <span className="ov-l">
                <strong>{departments.find((d) => d.id === r.departmentId)?.name ?? 'Unknown department'}</strong>
                {' · '}{INCENTIVE_PAGE_TYPE[r.pageType]}
                {' · '}{r.label} ({fmtCompact(r.minViews)}+ views)
                {' · '}{money(r.amount)}
                {!r.isActive && <span style={{ color: 'var(--ink-3)' }}>  ·  retired</span>}
              </span>
              <button className="btn btn--sm" style={{ marginLeft: 10 }}
                      onClick={() => void rules.setActive(r.id, !r.isActive)}>
                {r.isActive ? 'Retire' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
