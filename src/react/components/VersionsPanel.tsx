import { useMemo, useState } from 'react'
import {
  backStage, earlierStages, fmtMoment, fmtStamp, makesVersion, nextStage, parseNotes, safeUrl,
  type ContentItem, type ContentReview, type ContentVersion, type Decision, type VersionDraft,
} from '@/lib/work'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'

/**
 * A reel's versions and what was said about them (Phase 2, Round 3 — 0045),
 * shared by the task and the item modals.
 *
 *   * At the stage that makes what the next one reviews (Editing), the link
 *     box is open: paste V2, say what changed.
 *   * At a review stage, whoever holds the review sees the box that decides
 *     it: Approve moves the reel on; Ask for changes sends it back — to
 *     Editing unless they pick another stage — and the editor who cut the
 *     last version gets the task with the notes. At a stage the client sees
 *     (Client review) the same box records the CLIENT's answer.
 *   * Below, every version newest first, each with its reviews; a note that
 *     began with a time ("0:14 cut this") shows that moment.
 *
 * Draws nothing while there is nothing to show and nothing to do here.
 */
export function VersionsPanel({
  item, flows, work, canAdd, canReview, mayFix, draft, onDraft, toast, onReviewed,
}: {
  item: ContentItem
  flows: Workflows
  work: Work
  /** May add a version: the client's team, whoever manages it, anyone working on the reel. */
  canAdd: boolean
  /** May decide the review the reel is waiting on (it sits at a review stage). */
  canReview: boolean
  /** Whoever added a version (and the owner, HR) may correct its link until it is reviewed. */
  mayFix: (v: ContentVersion) => boolean
  /** The link being typed — held by the modal, so its own Save adds it too. */
  draft: VersionDraft
  onDraft: (d: VersionDraft) => void
  toast: (m: string) => void
  /** A review was recorded: the reel has moved, the modal closes. */
  onReviewed: () => void
}) {
  const [text, setText] = useState('')
  const [backPick, setBackPick] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [fixing, setFixing] = useState<{ id: string; url: string; note: string } | null>(null)
  const [busy, setBusy] = useState<Decision | 'add' | 'fix' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const stage = flows.stages.find((s) => s.id === item.stageId) ?? null
  const versions = useMemo(
    () => work.versions.filter((v) => v.itemId === item.id).sort((a, b) => b.number - a.number),
    [work.versions, item.id],
  )
  const reviews = useMemo(
    () => work.reviews.filter((r) => r.itemId === item.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [work.reviews, item.id],
  )
  const latest = versions[0] ?? null
  const reviewing = canReview && !!stage?.isReview
  const making = !!stage && makesVersion(flows.stages, stage)
  const earlier = stage ? earlierStages(flows.stages, stage) : []
  const defaultBack = stage ? backStage(flows.stages, stage, versions, latest?.id ?? null) : null
  const backId = earlier.some((s) => s.id === backPick) ? backPick : defaultBack?.id ?? ''
  const next = stage ? nextStage(flows.stages, stage) : null
  const nextNumber = (latest?.number ?? 0) + 1
  const stageName = (id: string | null) => (id ? flows.stages.find((s) => s.id === id)?.name ?? null : null)
  // The link box: open where versions are made; one click away elsewhere
  // (a reviewer fixing a typo themselves), never on a finished reel.
  const canAddHere = canAdd && !stage?.isDone
  const showAdd = canAddHere && (making || addOpen || !!draft.url)
  const orphans = reviews.filter((r) => !r.versionId || !versions.some((v) => v.id === r.versionId))
  const script = safeUrl(item.scriptUrl)

  if (versions.length === 0 && reviews.length === 0 && !reviewing && !(canAddHere && making)) return null

  const decide = async (decision: Decision) => {
    if (!stage) return
    const notes = parseNotes(text)
    if (decision === 'changes' && notes.length === 0) {
      setErr(stage.clientVisible ? 'Write what the client asked to change.' : 'Say what to change.')
      return
    }
    setBusy(decision); setErr(null)
    const message = await work.review({
      itemId: item.id, versionId: latest?.id ?? null, decision, notes,
      backToStageId: decision === 'changes' ? backId || null : null,
    })
    setBusy(null)
    if (message) { setErr(message); return }
    toast(decision === 'approved'
      ? `${stage.clientVisible ? 'The client\'s approval is recorded' : 'Approved'} — ${item.code} moves on${next ? ' to ' + next.name : ''}.`
      : `${item.code} went back to ${stageName(backId) ?? 'an earlier stage'} with the notes.`)
    onReviewed()
  }

  const add = async () => {
    if (!draft.url.trim()) return
    setBusy('add'); setErr(null)
    const message = await work.addVersion(item.id, draft.url, draft.note)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(`V${nextNumber} added.`)
    onDraft({ url: '', note: '' })
    setAddOpen(false)
  }

  const fix = async () => {
    if (!fixing) return
    setBusy('fix'); setErr(null)
    const message = await work.fixVersion(fixing.id, fixing.url, fixing.note)
    setBusy(null)
    if (message) { setErr(message); return }
    setFixing(null)
    toast('Link corrected.')
  }

  return (
    <div className="work-people">
      {/* The heading's line carries the script link and the way to add a
          version where the box is not already open (layout law, rule 1). */}
      <div className="ver-h">
        <span className="work-people-h">Versions</span>
        {script && <a className="ver-link" href={script} target="_blank" rel="noopener noreferrer">Script ↗</a>}
        {canAddHere && !showAdd && (
          <button type="button" className="link-btn" onClick={() => setAddOpen(true)}>+ V{nextNumber}</button>
        )}
      </div>
      {err && <div className="auth-err">{err}</div>}

      {reviewing && stage && (
        <div className="ver-review">
          <div className="ver-review-h">
            <b>{stage.clientVisible ? 'The client\'s answer' : 'Review'}{latest ? ` on V${latest.number}` : ''}</b>
            {latest && safeUrl(latest.url)
              ? <a className="ver-link" href={latest.url} target="_blank" rel="noopener noreferrer">Open V{latest.number} ↗</a>
              : <span className="cell-warn">No version on file</span>}
          </div>
          <textarea
            className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            aria-label={stage.clientVisible ? 'What the client said' : 'What to change'}
            placeholder={(stage.clientVisible ? 'What the client said' : 'What to change')
              + ' — start a line with a time for that moment: 0:14 cut this pause'}
          />
          <div className="ver-review-act">
            <label className="ver-back">
              <span>Changes go back to</span>
              <select className="input" value={backId} disabled={!earlier.length || !!busy} onChange={(e) => setBackPick(e.target.value)}>
                {earlier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="ver-review-btns">
              <button className="btn btn--sm" disabled={!!busy || !earlier.length} onClick={() => void decide('changes')}>
                {busy === 'changes' ? 'Sending back…' : stage.clientVisible ? 'Client wants changes' : 'Ask for changes'}
              </button>
              <button className="btn btn--sm btn--primary" disabled={!!busy} onClick={() => void decide('approved')}>
                {busy === 'approved' ? 'Saving…' : stage.clientVisible ? 'Client approved' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="ver-add">
          <input className="input ver-add-url" inputMode="url" autoFocus={addOpen} aria-label={`V${nextNumber} link`}
                 placeholder={`V${nextNumber} — Drive or Frame.io link`} value={draft.url}
                 onChange={(e) => onDraft({ ...draft, url: e.target.value })}
                 onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
          <input className="input ver-add-note" aria-label="What changed" placeholder="What changed (optional)"
                 value={draft.note} onChange={(e) => onDraft({ ...draft, note: e.target.value })}
                 onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
          <button className="btn btn--sm ver-add-btn" disabled={!draft.url.trim() || !!busy} onClick={() => void add()}>
            {busy === 'add' ? 'Adding…' : `Add V${nextNumber}`}
          </button>
        </div>
      )}

      {(versions.length > 0 || orphans.length > 0) && (
        <div className="ver-list">
          {versions.map((v) => {
            const said = reviews.filter((r) => r.versionId === v.id)
            if (fixing?.id === v.id) {
              return (
                <div key={v.id} className="ver">
                  <div className="ver-add">
                    <input className="input ver-add-url" inputMode="url" autoFocus aria-label={`V${v.number} link`} value={fixing.url}
                           onChange={(e) => setFixing({ ...fixing, url: e.target.value })} />
                    <input className="input ver-add-note" aria-label="What changed" placeholder="What changed (optional)" value={fixing.note}
                           onChange={(e) => setFixing({ ...fixing, note: e.target.value })} />
                    <div className="ver-add-btn ver-fix-act">
                      <button className="btn btn--sm" disabled={!!busy} onClick={() => setFixing(null)}>Cancel</button>
                      <button className="btn btn--sm btn--primary" disabled={!fixing.url.trim() || !!busy} onClick={() => void fix()}>
                        {busy === 'fix' ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }
            const link = safeUrl(v.url)
            return (
              <div key={v.id} className="ver">
                <div className="ver-top">
                  <span className="ver-n">V{v.number}</span>
                  <span className="ver-by">{v.authorName || 'Someone'} · {fmtStamp(v.createdAt)}</span>
                  {said.length === 0 && mayFix(v) && (
                    <button type="button" className="link-btn" onClick={() => setFixing({ id: v.id, url: v.url, note: v.note })}>Fix link</button>
                  )}
                  {link && <a className="ver-link" href={link} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                </div>
                {v.note && <div className="ver-note">{v.note}</div>}
                {said.map((r) => <ReviewLine key={r.id} r={r} backName={stageName(r.backToStageId)} />)}
              </div>
            )
          })}
          {orphans.length > 0 && (
            <div className="ver">
              <div className="ver-top"><span className="ver-by">Reviewed with no version on file</span></div>
              {orphans.map((r) => <ReviewLine key={r.id} r={r} backName={stageName(r.backToStageId)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One decision: who, what, where it sent the reel — and its notes, a
 *  moment of the video first where the note had one. */
function ReviewLine({ r, backName }: { r: ContentReview; backName: string | null }) {
  const who = r.reviewerName || 'Someone'
  const head = r.forClient
    ? (r.decision === 'approved' ? 'The client approved' : 'The client asked for changes')
    : (r.decision === 'approved' ? `${who} approved` : `${who} asked for changes`)
  const after = [r.forClient ? `recorded by ${who}` : null, r.decision === 'changes' && backName ? `back to ${backName}` : null]
    .filter(Boolean).join(' · ')
  return (
    <div className={'ver-rv is-' + r.decision}>
      <div className="ver-rv-top">
        <span className="ver-rv-mark" aria-hidden>{r.decision === 'approved' ? '✓' : '↺'}</span>
        <b>{head}</b>
        {after && <span className="cell-mute">{after}</span>}
        <span className="ver-rv-at">{fmtStamp(r.createdAt)}</span>
      </div>
      {r.notes.length > 0 && (
        <ul className="ver-notes">
          {r.notes.map((n, i) => (
            <li key={i}>
              {n.at != null && <span className="ver-at">{fmtMoment(n.at)}</span>}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
