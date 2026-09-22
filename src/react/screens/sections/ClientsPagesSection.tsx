import { useState } from 'react'
import { Chip } from '@/components/bits'
import { Tip } from '@/components/Tip'
import { isDemo } from '@/data/demo'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { PageDetailModal } from '@/modals/PageDetailModal'
import { CONTENT_MARKETING_DEPARTMENT, INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import type { IncentivePageType, Page } from '@/lib/hr'
import type { Clients } from '@/data/useClients'
import type { Pages } from '@/data/usePages'
import type { PageAssignments } from '@/data/usePageAssignments'
import type { PageReels } from '@/data/usePageReels'
import type { Employees } from '@/data/useEmployees'
import type { Workspace } from '@/data/useWorkspace'

interface FetchedProfile {
  handle: string
  fullName: string
  biography: string
  profilePicUrl: string
  followersCount: number | null
  verified: boolean
}

/**
 * HR's admin for Clients, Pages and who manages them (0032). Owner/HR only —
 * the RLS on clients/pages/page_assignments refuses everybody else at the
 * database, this screen is just where the write buttons live. Reassignment
 * stays here rather than on the department head's own dashboard (Adarsh,
 * 2026-09-22): that dashboard is read-only by design.
 *
 * The assignable roster is filtered to Content & Marketing today — the only
 * department this system serves so far. If a second department gets its own
 * Clients later, that filter is the one line to widen, not this whole screen.
 */
export function ClientsPagesSection({
  ws, clients, pages, pageAssignments, pageReels, staff, toast,
}: {
  ws: Workspace
  clients: Clients
  pages: Pages
  pageAssignments: PageAssignments
  pageReels: PageReels
  staff: Employees
  toast: (m: string) => void
}) {
  const [newClientName, setNewClientName] = useState('')
  const [addingPageFor, setAddingPageFor] = useState<string | null>(null)
  const [newPageType, setNewPageType] = useState<IncentivePageType>('main')
  const [newPageHandle, setNewPageHandle] = useState('')
  const [newPageLabel, setNewPageLabel] = useState('')
  const [assigningPageId, setAssigningPageId] = useState<string | null>(null)
  const [openPage, setOpenPage] = useState<Page | null>(null)
  const [fetchingProfile, setFetchingProfile] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [fetchedProfile, setFetchedProfile] = useState<FetchedProfile | null>(null)

  const cmDeptId = ws.departments.find((d) => d.name === CONTENT_MARKETING_DEPARTMENT)?.id ?? null
  const roster = staff.rows.filter((e) => e.status === 'active' && (!cmDeptId || e.departmentId === cmDeptId))
  const nameOf = (employeeId: string) => staff.rows.find((e) => e.id === employeeId)?.fullName ?? 'Former employee'

  const resetPageForm = () => {
    setNewPageType('main'); setNewPageHandle(''); setNewPageLabel('')
    setFetchErr(null); setFetchedProfile(null)
  }

  /** Paste a profile link, a bare @handle, or a plain username — the Edge
   *  Function's own actor call takes any of the three (Adarsh, 2026-09-22:
   *  "paste the client insta profile link... we fetch all the details after
   *  it"). Normalizes the handle and offers the fetched name as the label;
   *  the extra details (followers, verified, bio) are shown so what was
   *  fetched is visible, even though this table only has a column for the
   *  two that actually matter to the rest of the app. */
  const fetchProfile = async () => {
    if (!newPageHandle.trim()) return
    if (isDemo()) { setFetchErr('Not available in demo mode — type the handle directly.'); return }
    setFetchingProfile(true); setFetchErr(null); setFetchedProfile(null)
    const { data, error: err } = await supabase.functions.invoke('fetch-instagram-profile', { body: { url: newPageHandle.trim() } })
    const message = err ? await functionErrorMessage(err) : data?.error ? String(data.error) : null
    setFetchingProfile(false)
    if (message) { setFetchErr(message); return }
    const profile = data as FetchedProfile
    setFetchedProfile(profile)
    setNewPageHandle(profile.handle)
    if (!newPageLabel.trim() && profile.fullName) setNewPageLabel(profile.fullName)
  }

  const addPage = async (clientId: string) => {
    const message = await pages.add({ clientId, pageType: newPageType, instagramHandle: newPageHandle, label: newPageLabel })
    toast(message ?? 'Page added.')
    if (!message) { setAddingPageFor(null); resetPageForm() }
  }

  return (
    <div className="section">
      <Tip tipKey="hr-clients-pages">
        Clients are the brands you run social pages for. Each client can carry one main page and several fan
        pages — assign whoever manages one here; they'll see it on their own dashboard.
      </Tip>

      <div className="hol-add">
        <input className="input" type="text" aria-label="New client name" placeholder="e.g. Urban Bites Cafe"
               value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
        <button className="btn btn--sm btn--primary" disabled={!newClientName.trim()}
                onClick={() => void clients.add(newClientName).then((m) => { toast(m ?? 'Client added.'); if (!m) setNewClientName('') })}>
          Add client
        </button>
      </div>

      {clients.error && <div className="auth-err" style={{ marginBottom: 14 }}>{clients.error}</div>}
      {clients.rows.length === 0 ? (
        <p style={{ color: 'var(--ink-3)' }}>No clients on file yet.</p>
      ) : (
        [...clients.rows].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
          const clientPages = pages.rows.filter((p) => p.clientId === c.id)
          return (
            <div className="ov-card" key={c.id} style={{ marginBottom: 14 }}>
              <div className="ov-head">
                <h4>{c.name}{!c.isActive && <Chip cls="chip--mute">Retired</Chip>}</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn--sm"
                          onClick={() => { setAddingPageFor(addingPageFor === c.id ? null : c.id); resetPageForm() }}>
                    + Add page
                  </button>
                  <button className="btn btn--sm"
                          onClick={() => void clients.setActive(c.id, !c.isActive).then((m) => toast(m ?? (c.isActive ? 'Client retired.' : 'Client restored.')))}>
                    {c.isActive ? 'Retire' : 'Restore'}
                  </button>
                </div>
              </div>

              {addingPageFor === c.id && (
                <div style={{ padding: '0 16px 14px' }}>
                  <div className="hol-add">
                    <div className="seg seg--form" role="group" aria-label="Page type">
                      {(Object.keys(INCENTIVE_PAGE_TYPE) as IncentivePageType[]).map((t) => (
                        <button key={t} type="button" className={newPageType === t ? 'is-on' : ''}
                                aria-pressed={newPageType === t} onClick={() => setNewPageType(t)}>
                          {INCENTIVE_PAGE_TYPE[t]}
                        </button>
                      ))}
                    </div>
                    <input className="input" type="text" aria-label="Instagram profile link or handle"
                           placeholder="Paste the profile link, or type @handle" value={newPageHandle}
                           onChange={(e) => { setNewPageHandle(e.target.value); setFetchedProfile(null); setFetchErr(null) }} />
                    <button className="btn btn--sm" disabled={!newPageHandle.trim() || fetchingProfile}
                            onClick={() => void fetchProfile()}>
                      {fetchingProfile ? 'Fetching…' : 'Fetch details'}
                    </button>
                    <input className="input" type="text" aria-label="Label (optional)" placeholder="Label (optional)"
                           value={newPageLabel} onChange={(e) => setNewPageLabel(e.target.value)} />
                    <button className="btn btn--sm btn--primary" onClick={() => void addPage(c.id)}>Save page</button>
                  </div>
                  {fetchErr && <p className="punch-note" style={{ color: 'var(--bad)' }}>{fetchErr}</p>}
                  {fetchedProfile && (
                    <div className="td-flex" style={{ gap: 10, marginTop: 4 }}>
                      {fetchedProfile.profilePicUrl && (
                        <img src={fetchedProfile.profilePicUrl} alt="" width={32} height={32} style={{ borderRadius: '50%' }} />
                      )}
                      <span className="punch-note">
                        <strong>{fetchedProfile.fullName || fetchedProfile.handle}</strong>
                        {fetchedProfile.verified ? ' ✓' : ''}
                        {fetchedProfile.followersCount != null ? ` · ${fetchedProfile.followersCount.toLocaleString('en-IN')} followers` : ''}
                        {fetchedProfile.biography ? ` · ${fetchedProfile.biography}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {clientPages.length === 0 ? (
                <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>No pages on this client yet.</p>
              ) : (
                <div className="ov-actions">
                  {clientPages.map((p) => {
                    const holders = pageAssignments.rows.filter((a) => a.pageId === p.id)
                    const assignable = roster.filter((e) => !holders.some((h) => h.employeeId === e.id))
                    return (
                      <div className="ov-row" key={p.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
                        <button className="ov-l" style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}
                                onClick={() => setOpenPage(p)}>
                          {INCENTIVE_PAGE_TYPE[p.pageType]}{p.instagramHandle ? ` — ${p.instagramHandle}` : ''}
                          {p.label ? ` (${p.label})` : ''}
                          {!p.isActive && <Chip cls="chip--mute">Retired</Chip>}
                        </button>
                        <span className="ov-cta" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {holders.map((h) => (
                            <Chip key={h.id} cls="chip--mute">
                              {nameOf(h.employeeId)}
                              <button aria-label={`Unassign ${nameOf(h.employeeId)}`} style={{ marginLeft: 6, border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                                      onClick={() => void pageAssignments.unassign(h.id).then((m) => toast(m ?? 'Unassigned.'))}>
                                ×
                              </button>
                            </Chip>
                          ))}
                          {assigningPageId === p.id ? (
                            <select className="input" style={{ width: 'auto' }} autoFocus
                                    onChange={(e) => {
                                      const employeeId = e.target.value
                                      setAssigningPageId(null)
                                      if (employeeId) void pageAssignments.assign(p.id, employeeId).then((m) => toast(m ?? 'Assigned.'))
                                    }}
                                    onBlur={() => setAssigningPageId(null)}>
                              <option value="">Pick someone…</option>
                              {assignable.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                            </select>
                          ) : (
                            <button className="btn btn--sm" onClick={() => setAssigningPageId(p.id)} disabled={assignable.length === 0}>
                              + Assign
                            </button>
                          )}
                          <button className="btn btn--sm"
                                  onClick={() => void pages.setActive(p.id, !p.isActive).then((m) => toast(m ?? (p.isActive ? 'Page retired.' : 'Page restored.')))}>
                            {p.isActive ? 'Retire' : 'Restore'}
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      {openPage && (
        <PageDetailModal
          page={openPage}
          client={clients.rows.find((c) => c.id === openPage.clientId) ?? null}
          reels={pageReels.rows.filter((r) => r.pageId === openPage.id)}
          onClose={() => setOpenPage(null)}
          onRefresh={() => pageReels.refresh(openPage.id)}
        />
      )}
    </div>
  )
}
