import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { fmtCompact } from '@/lib/format'
import { isDemo } from '@/data/demo'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { INCENTIVE_PAGE_TYPE, type IncentivePageType, type Page } from '@/lib/hr'
import { PLATFORM, PLATFORMS, channelHandle, platformOfUrl, type PageChannel, type Platform } from '@/lib/agency'

export interface PageDraft {
  pageType: IncentivePageType
  label: string
  /** handle or pasted link, per platform — '' means the page has none */
  channels: Record<Platform, string>
}

interface FetchedProfile { handle: string; fullName: string; followersCount: number | null; verified: boolean }

/**
 * One page and its channels — the Client Master's row: a numbered fan page
 * with its Instagram page AND its YouTube channel. Paste any link into any
 * box; it is read for what it is. Instagram keeps its "Fetch details" from
 * the old Clients & Pages screen (fetch-instagram-profile, already live).
 */
export function PageModal({
  page, channels, onClose, onSave,
}: {
  page: Page | null
  channels: PageChannel[]
  onClose: () => void
  onSave: (d: PageDraft) => Promise<string | null>
}) {
  const live = (p: Platform) => {
    const c = channels.find((x) => x.platform === p && x.isActive)
    return c ? (c.url && p !== 'instagram' ? c.url : c.handle) : ''
  }
  const [f, setF] = useState<PageDraft>(() => ({
    pageType: page?.pageType ?? 'fan',
    label: page?.label ?? '',
    channels: { instagram: live('instagram'), youtube: live('youtube'), facebook: live('facebook') },
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState<FetchedProfile | null>(null)

  const setChannel = (p: Platform, v: string) => {
    // A link pasted into the wrong box goes where it belongs.
    const actual = platformOfUrl(v) ?? p
    setF((prev) => ({ ...prev, channels: { ...prev.channels, [actual]: v, ...(actual !== p ? { [p]: prev.channels[p] } : {}) } }))
    if (actual === 'instagram') setFetched(null)
  }

  const fetchProfile = async () => {
    const input = f.channels.instagram.trim()
    if (!input) return
    if (isDemo()) { setErr('Not available in demo mode — type the handle directly.'); return }
    setFetching(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('fetch-instagram-profile', { body: { url: input } })
    const message = error ? await functionErrorMessage(error) : data?.error ? String(data.error) : null
    setFetching(false)
    if (message) { setErr(message); return }
    const profile = data as FetchedProfile
    setFetched(profile)
    setF((prev) => ({
      ...prev,
      channels: { ...prev.channels, instagram: profile.handle },
      label: prev.label.trim() ? prev.label : profile.fullName || prev.label,
    }))
  }

  const save = async () => {
    setBusy(true); setErr(null)
    const message = await onSave(f)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  const empty = !f.label.trim() && PLATFORMS.every((p) => !f.channels[p].trim())

  return (
    <Modal
      title={page ? 'Edit page' : 'Add page'}
      sub={page ? (page.label || INCENTIVE_PAGE_TYPE[page.pageType]) : 'A main page or a fan page, with its channels'}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={empty || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : page ? 'Save page' : 'Add page'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label>Page type</label>
          <div className="seg seg--form" role="group" aria-label="Page type">
            {(Object.keys(INCENTIVE_PAGE_TYPE) as IncentivePageType[]).map((t) => (
              <button key={t} type="button" className={f.pageType === t ? 'is-on' : ''} aria-pressed={f.pageType === t}
                      onClick={() => setF((p) => ({ ...p, pageType: t }))}>
                {INCENTIVE_PAGE_TYPE[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pgLabel">Page name</label>
          <input className="input" id="pgLabel" value={f.label} placeholder="e.g. Healing Rahasya"
                 onChange={(e) => setF((p) => ({ ...p, label: e.target.value }))} />
        </div>
        {PLATFORMS.map((p) => (
          <div className="field" key={p}>
            <label htmlFor={'pgCh' + p}>{PLATFORM[p].label}</label>
            <div className="td-flex">
              <input className="input" id={'pgCh' + p} value={f.channels[p]}
                     placeholder={p === 'instagram' ? 'Paste the profile link, or @handle' : `Paste the ${PLATFORM[p].label} link`}
                     onChange={(e) => setChannel(p, e.target.value)} />
              {p === 'instagram' && (
                <button className="btn btn--sm" type="button" disabled={!f.channels.instagram.trim() || fetching}
                        onClick={() => void fetchProfile()}>
                  {fetching ? 'Fetching…' : 'Fetch'}
                </button>
              )}
            </div>
            {p !== 'instagram' && f.channels[p].trim() && (
              <p className="field-hint">Saved as {channelHandle(p, f.channels[p]) || '—'}</p>
            )}
          </div>
        ))}
        {fetched && (
          <p className="field-hint">
            <strong>{fetched.fullName || fetched.handle}</strong>{fetched.verified ? ' ✓' : ''}
            {fetched.followersCount != null ? ` · ${fmtCompact(fetched.followersCount)} followers` : ''}
          </p>
        )}
      </div>
    </Modal>
  )
}
