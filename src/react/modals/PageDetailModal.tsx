import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Kpi } from '@/components/bits'
import { INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import type { Client, Page, PageReel } from '@/lib/hr'

const VIRAL_THRESHOLD = 10_000_000

const fmtViews = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN'))
const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One Instagram page's own dashboard (PAGE-ANALYTICS-DASHBOARD-PLAN.md,
 * 2026-09-22) — reached by clicking a page row from My pages, the
 * department head's roster, or HR's Clients & Pages. Reels only for v1, per
 * the plan; sorted by views because "what's going viral" is the question
 * this screen answers. Refresh is a button, never automatic — Apify bills
 * per run, same discipline INCENTIVE-PLAN.md already applies to claims.
 */
export function PageDetailModal({
  page, client, reels, onClose, onRefresh,
}: {
  page: Page
  client: Client | null
  reels: PageReel[]
  onClose: () => void
  onRefresh: () => Promise<{ message: string | null; matchedClaims: number }>
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const sorted = [...reels].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
  const totalViews = reels.reduce((t, r) => t + (r.views ?? 0), 0)
  const viralCount = reels.filter((r) => (r.views ?? 0) >= VIRAL_THRESHOLD).length
  const lastFetched = reels.reduce<string | null>((latest, r) => (!latest || r.fetchedAt > latest ? r.fetchedAt : latest), null)

  const refresh = async () => {
    setBusy(true); setNote(null)
    const { message, matchedClaims } = await onRefresh()
    setBusy(false)
    if (message) { setNote(message); return }
    setNote(matchedClaims > 0 ? `Refreshed — ${matchedClaims} claim${matchedClaims === 1 ? '' : 's'} updated with fresh views.` : 'Refreshed.')
  }

  return (
    <Modal
      title={`${client?.name ?? 'Unknown client'} — ${INCENTIVE_PAGE_TYPE[page.pageType]}`}
      sub={page.instagramHandle || 'No handle on file'}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Close</button>
          <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Refreshing…' : 'Refresh reels'}
          </button>
        </>
      }
    >
      {note && <p className="punch-note" style={{ marginBottom: 14 }}>{note}</p>}

      <div className="kpis" style={{ marginBottom: 18 }}>
        <Kpi accent label="Reels tracked" value={reels.length} sub={lastFetched ? `last fetched ${fmtDate(lastFetched)}` : 'never fetched'} />
        <Kpi label="Total views" value={totalViews.toLocaleString('en-IN')} sub="across all tracked reels" />
        <Kpi accent label="10M+ views" value={viralCount} sub="reels gone viral" />
      </div>

      {reels.length === 0 ? (
        <p style={{ color: 'var(--ink-3)' }}>
          No reels fetched yet — press Refresh reels to pull this page's latest ones from Instagram.
        </p>
      ) : (
        <div className="ov-actions">
          {sorted.map((r) => (
            <div className="ov-row" key={r.id} style={{ cursor: 'default', display: 'flex', gap: 10, alignItems: 'center' }}>
              {r.thumbnailUrl && (
                <img src={r.thumbnailUrl} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={r.reelUrl} target="_blank" rel="noreferrer">{r.caption ? r.caption.slice(0, 60) : 'Reel'}{r.caption && r.caption.length > 60 ? '…' : ''}</a>
                </div>
                <div className="punch-note" style={{ margin: 0 }}>posted {fmtDate(r.postedAt)}</div>
              </div>
              <div style={{ flex: '0 0 auto', textAlign: 'right', fontSize: 12.5 }}>
                <div><strong>{fmtViews(r.views)}</strong> views</div>
                <div className="punch-note" style={{ margin: 0 }}>{fmtViews(r.likes)} likes · {fmtViews(r.comments)} comments</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
