import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { isOwnerLevel, type Client, type Employee } from '@/lib/hr'
import {
  SHOOT_STATUS, canEditWorkOn, nextStage, officeDay, plannedShootOf, safeUrl, shootDayLabel, shootStageFor,
  type ContentItem, type Shoot, type ShootDraft,
} from '@/lib/work'
import type { Agency } from '@/data/useAgency'
import type { Work } from '@/data/useWork'
import type { Workflows } from '@/data/useWorkflows'
import type { Workspace } from '@/data/useWorkspace'

const firstName = (n: string) => n.split(' ')[0] ?? n

/** can_run_shoot(), restated: the client's team (and whoever manages it),
 *  the owner and HR — and the shoot's own DOP and SMM. Only the first lot
 *  picks the reels (0046). */
export function shootRights(ws: Workspace, agency: Agency, client: Client | null, shoot: Shoot | null) {
  const me = agency.myEmployee?.id ?? null
  const plan = isOwnerLevel(ws) || (!!client && canEditWorkOn(ws, agency.access, client))
  const run = plan || (!!shoot && !!me && (shoot.dopId === me || shoot.smmId === me))
  return { plan, run }
}

/**
 * One shoot (Phase 2, Round 4): the day, the place, who films it, and which
 * reels it covers. Planning it gives those reels' shoot tasks to its DOP;
 * marking it done moves every one of them on to the next stage and tells
 * whoever holds that. The raw footage stays in Drive — the shoot keeps the
 * folder's link (Q14).
 */
export function ShootModal({
  ws, agency, flows, work, shoot, clients, staff, presetClientId, presetItemIds, presetDay, toast, onClose,
}: {
  ws: Workspace
  agency: Agency
  flows: Workflows
  work: Work
  shoot: Shoot | null
  clients: Client[]
  staff: Employee[]
  presetClientId?: string | null
  presetItemIds?: string[]
  presetDay?: string | null
  toast: (m: string) => void
  onClose: () => void
}) {
  const { team, accessData, myEmployee } = agency
  const isNew = !shoot
  const plannable = clients.filter((c) => c.isActive && shootRights(ws, agency, c, null).plan)
  const [clientId, setClientId] = useState(shoot?.clientId
    ?? (presetClientId && plannable.some((c) => c.id === presetClientId) ? presetClientId : plannable.length === 1 ? plannable[0]!.id : ''))
  const client = clients.find((c) => c.id === clientId) ?? null
  const rights = shootRights(ws, agency, client, shoot)
  const status = shoot?.status ?? 'planned'

  // The roles that film and that run the page: the shoot stage's own role,
  // and the role pages are held in.
  const dopRoleId = flows.stages.find((s) => s.isShoot && s.isActive && s.ownerRoleId)?.ownerRoleId ?? null
  const smmRoleId = accessData.roles.find((r) => r.pageHolder && r.clientScoped && r.isActive)?.id ?? null
  const holders = (roleId: string | null) => (roleId
    ? [...new Set(team.rows.filter((a) => a.clientId === clientId && a.roleId === roleId && !a.endedAt).map((a) => a.employeeId))]
    : [])
  const dops = holders(dopRoleId)
  const smms = holders(smmRoleId)
  const nameOf = (id: string) => team.rows.find((t) => t.employeeId === id)?.fullName ?? staff.find((e) => e.id === id)?.fullName ?? 'Someone'
  const firstSmm = smms.includes(myEmployee?.id ?? '') ? myEmployee!.id : smms.length === 1 ? smms[0]! : ''

  const onShoot = useMemo(() => new Set(work.shootItems.filter((x) => x.shootId === shoot?.id).map((x) => x.itemId)), [work.shootItems, shoot?.id])
  const [day, setDay] = useState(shoot?.shootOn ?? presetDay ?? '')
  const [time, setTime] = useState(shoot?.startsAt ?? '')
  const [location, setLocation] = useState(shoot?.location ?? '')
  const [dopId, setDopId] = useState(shoot ? shoot.dopId ?? '' : dops.length === 1 ? dops[0]! : '')
  const [smmId, setSmmId] = useState(shoot ? shoot.smmId ?? '' : firstSmm)
  const [brief, setBrief] = useState(shoot?.brief ?? '')
  const [equipment, setEquipment] = useState(shoot?.equipment ?? '')
  const [footage, setFootage] = useState(shoot?.footageUrl ?? '')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(shoot ? onShoot : presetItemIds ?? []))
  const [busy, setBusy] = useState<'save' | 'done' | 'cancel' | 'back' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const stageName = (it: ContentItem | undefined, fallback: string) =>
    (it ? flows.stages.find((s) => s.id === it.stageId)?.name : null) ?? fallback

  // The reels a shoot can take: this client's, not finished, not past their
  // shoot stage — plus whatever is on it already.
  const candidates = useMemo(() => work.items
    .filter((i) => i.clientId === clientId && (onShoot.has(i.id) || !!shootStageFor(flows.stages, i)))
    .sort((a, b) => a.code.localeCompare(b.code)), [work.items, clientId, onShoot, flows.stages])
  // Reels shot long ago are not loaded; the shoot's own list still names them.
  const offList = work.shootItems.filter((x) => x.shootId === shoot?.id && !work.items.some((i) => i.id === x.itemId))

  const draft = (): ShootDraft => ({
    clientId, shootOn: day, startsAt: time || null, location, dopId: dopId || null, smmId: smmId || null,
    brief, equipment, footageUrl: footage, itemIds: [...picked, ...offList.map((x) => x.itemId)],
  })
  const dirty = isNew || !shoot || day !== shoot.shootOn || (time || null) !== shoot.startsAt || location.trim() !== shoot.location
    || (dopId || null) !== shoot.dopId || (smmId || null) !== shoot.smmId || brief.trim() !== shoot.brief
    || equipment.trim() !== shoot.equipment || footage.trim() !== shoot.footageUrl
    || picked.size !== onShoot.size || [...picked].some((x) => !onShoot.has(x))

  const save = async (): Promise<boolean> => {
    if (isNew && !clientId) { setErr('Pick a client.'); return false }
    if (!day) { setErr('Pick the day of the shoot.'); return false }
    const r = await work.saveShoot(shoot?.id ?? null, draft())
    if (r.error) { setErr(r.error); return false }
    return true
  }

  const onSave = async () => {
    setBusy('save'); setErr(null)
    const ok = await save()
    setBusy(null)
    if (!ok) return
    const dop = dopId ? firstName(nameOf(dopId)) : null
    toast(isNew ? `Shoot planned${dop ? ` — ${dop} is told` : ''}.` : 'Saved — the people on it are told.')
    onClose()
  }

  const markDone = async () => {
    if (!shoot) return
    const n = picked.size + offList.length
    if (!window.confirm(`Mark ${shoot.code} done?${n ? ` Its ${n === 1 ? 'reel moves' : `${n} reels move`} on past the shoot.` : ''}`)) return
    setBusy('done'); setErr(null)
    if (dirty && !(await save())) { setBusy(null); return }
    const message = await work.setShootStatus(shoot.id, 'done', footage)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(`${shoot.code} done${n ? ` — ${n === 1 ? 'its reel moves' : `${n} reels move`} on` : ''}.`)
    onClose()
  }

  const flip = async (to: 'cancelled' | 'planned') => {
    if (!shoot) return
    if (to === 'cancelled' && !window.confirm(`Cancel ${shoot.code}? Its reels stay where they are; the DOP and SMM are told.`)) return
    setBusy(to === 'cancelled' ? 'cancel' : 'back'); setErr(null)
    const message = await work.setShootStatus(shoot.id, to)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(to === 'cancelled' ? `${shoot.code} cancelled.` : `${shoot.code} is back on.`)
    onClose()
  }

  const remove = async () => {
    if (!shoot || !window.confirm(`Delete ${shoot.code}? This cannot be undone.`)) return
    setBusy('delete'); setErr(null)
    const message = await work.deleteShoot(shoot.id)
    setBusy(null)
    if (message) { setErr(message); return }
    toast(`${shoot.code} deleted.`)
    onClose()
  }

  const toggle = (id: string) => setPicked((p) => { const q = new Set(p); if (q.has(id)) q.delete(id); else q.add(id); return q })
  const reelsLocked = !rights.plan || status === 'cancelled'
  const today = officeDay()
  const nextName = (it: ContentItem) => { const st = shootStageFor(flows.stages, it); return st ? nextStage(flows.stages, st)?.name ?? null : null }
  const footageLink = safeUrl(shoot?.footageUrl)

  return (
    <Modal
      wide
      title={isNew ? 'Plan a shoot' : `${shoot.code} · ${shoot.clientName}`}
      sub={isNew ? 'Its DOP gets the reels\' shoot tasks, and is told once.'
        : [shootDayLabel(shoot.shootOn, shoot.startsAt), SHOOT_STATUS[status].label, shoot.creatorName ? `planned by ${shoot.creatorName}` : null]
          .filter(Boolean).join(' · ')}
      onClose={onClose}
      foot={
        <>
          {shoot && rights.plan && status !== 'done' && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={() => void remove()}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
          {shoot && rights.run && status === 'planned' && (
            <button className="btn btn--sm" disabled={!!busy} onClick={() => void flip('cancelled')}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel shoot'}
            </button>
          )}
          {shoot && rights.run && status === 'cancelled' && (
            <button className="btn btn--sm" disabled={!!busy} onClick={() => void flip('planned')}>
              {busy === 'back' ? 'Putting back…' : 'Put back on'}
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>Close</button>
          {rights.run && (isNew || dirty) && (
            <button className={'btn btn--sm' + (status === 'planned' && !isNew ? '' : ' btn--primary')}
                    disabled={!!busy || (isNew && !rights.plan && plannable.length === 0)} onClick={() => void onSave()}>
              {busy === 'save' ? 'Saving…' : isNew ? 'Plan shoot' : 'Save'}
            </button>
          )}
          {shoot && rights.run && status === 'planned' && (
            <button className="btn btn--sm btn--primary" disabled={!!busy} onClick={() => void markDone()}
                    title={shoot.shootOn > today ? 'It is not the shoot day yet — mark it done once it is filmed' : undefined}>
              {busy === 'done' ? 'Marking…' : 'Mark done'}
            </button>
          )}
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      {isNew && plannable.length === 0 && (
        <p className="cell-warn" style={{ margin: 0 }}>You are not on any client's team, so there is no client to plan a shoot for.</p>
      )}
      <div className="auth-form">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="shClient">Client</label>
            <select className="input" id="shClient" value={clientId} disabled={!isNew}
                    onChange={(e) => { setClientId(e.target.value); setPicked(new Set()); setDopId(''); setSmmId('') }}>
              {!clientId && <option value="">Pick a client</option>}
              {(isNew ? plannable : clients.filter((c) => c.id === clientId)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="shDay">Day</label>
            <input className="input" id="shDay" type="date" value={day} disabled={!rights.run || status === 'done'}
                   onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="shTime">Time</label>
            <input className="input" id="shTime" type="time" value={time} disabled={!rights.run || status === 'done'}
                   onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="shPlace">Place</label>
            <input className="input" id="shPlace" value={location} disabled={!rights.run} placeholder="Studio, the client's clinic…"
                   onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="shDop">DOP</label>
            <select className="input" id="shDop" value={dopId} disabled={!rights.run || status === 'done' || !clientId}
                    onChange={(e) => setDopId(e.target.value)}>
              <option value="">{dops.length ? 'Pick later' : 'No DOP on the team yet'}</option>
              {[...new Set([...dops, ...(shoot?.dopId ? [shoot.dopId] : [])])].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="shSmm">SMM</label>
            <select className="input" id="shSmm" value={smmId} disabled={!rights.run || !clientId} onChange={(e) => setSmmId(e.target.value)}>
              <option value="">—</option>
              {[...new Set([...smms, ...(shoot?.smmId ? [shoot.smmId] : [])])].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </div>
        </div>
        {clientId && !dops.length && !shoot?.dopId && (
          <p className="cell-warn" style={{ margin: 0 }}>Nobody holds the DOP role on {client?.name ?? 'this client'}'s team — add one on its Team tab, or plan now and pick later.</p>
        )}

        <div className="field">
          <label htmlFor="shBrief">Brief</label>
          <textarea className="input" id="shBrief" rows={3} value={brief} disabled={!rights.run}
                    placeholder="What to film, wardrobe, anything the DOP must know" onChange={(e) => setBrief(e.target.value)} />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="shKit">Equipment</label>
            <input className="input" id="shKit" value={equipment} disabled={!rights.run} placeholder="Camera, lights, mics"
                   onChange={(e) => setEquipment(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="shRaw">
              Raw footage link
              {footageLink && <> · <a href={footageLink} target="_blank" rel="noreferrer">open ↗</a></>}
            </label>
            <input className="input" id="shRaw" inputMode="url" value={footage} disabled={!rights.run}
                   placeholder={status === 'planned' ? 'Drive folder — paste it when you mark it done' : 'Drive folder link'}
                   onChange={(e) => setFootage(e.target.value)} />
          </div>
        </div>

        {clientId && (
          <div className="work-people">
            <div className="work-people-h">
              Reels on this shoot{picked.size + offList.length > 0 ? ` (${picked.size + offList.length})` : ''}
            </div>
            {candidates.length === 0 && offList.length === 0 && (
              <p className="cell-mute" style={{ margin: 0 }}>
                No reel of {client?.name ?? 'this client'} is waiting for a shoot{rights.plan ? ' — plan it now and add reels later' : ''}.
              </p>
            )}
            <div className="shoot-reels">
              {candidates.map((it) => {
                const other = plannedShootOf(it.id, work.shoots, work.shootItems)
                const elsewhere = !!other && other.id !== shoot?.id
                const on = picked.has(it.id)
                const locked = reelsLocked || elsewhere || (status === 'done' && onShoot.has(it.id))
                const nx = nextName(it)
                return (
                  <label key={it.id} className={'shoot-reel' + (locked ? ' is-locked' : '')}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(it.id)} />
                    <span className="cell-mono">{it.code}</span>
                    <span className="shoot-reel-t">{it.title}</span>
                    <Chip cls={'chip--' + (flows.stages.find((s) => s.id === it.stageId)?.tone ?? 'mute')}>{stageName(it, '—')}</Chip>
                    {elsewhere
                      ? <span className="cell-mute">on {other!.code}</span>
                      : status === 'planned' && on && nx ? <span className="cell-mute on-desktop">→ {nx} when done</span> : null}
                  </label>
                )
              })}
              {offList.map((x) => (
                <div key={x.itemId} className="shoot-reel is-locked">
                  <input type="checkbox" checked disabled readOnly />
                  <span className="cell-mono">{x.itemCode}</span>
                  <span className="shoot-reel-t">{x.itemTitle}</span>
                  <Chip cls={x.stageDone ? 'chip--good' : 'chip--mute'}>{x.stageName}</Chip>
                </div>
              ))}
            </div>
            {!rights.plan && rights.run && <p className="cell-mute" style={{ margin: 0 }}>The client's team picks the reels.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** The shoot line on a reel (the item and task modals): the shoot it is
 *  planned on, the one it was shot on (with the raw footage), or — while it
 *  is at or just before its shoot stage — a way to plan one. */
export function ShootLine({
  item, work, flows, canPlan, onOpen,
}: {
  item: ContentItem
  work: Work
  flows: Workflows
  canPlan: boolean
  onOpen: (s: Shoot | 'new') => void
}) {
  if (!work.shootsOn) return null
  const planned = plannedShootOf(item.id, work.shoots, work.shootItems)
  if (planned) {
    return (
      <button type="button" className="shoot-line" onClick={() => onOpen(planned)}>
        <span className="shoot-line-k">Shoot</span>
        <span className="shoot-line-v">
          <b>{planned.code}</b> · {shootDayLabel(planned.shootOn, planned.startsAt)}
          {planned.location ? ` · ${planned.location}` : ''} · {planned.dopName ? `DOP ${firstName(planned.dopName)}` : <span className="cell-warn">no DOP yet</span>}
        </span>
        <span className="shoot-line-go">Open →</span>
      </button>
    )
  }
  const shot = work.shootItems.filter((x) => x.itemId === item.id)
    .map((x) => work.shoots.find((s) => s.id === x.shootId))
    .filter((s): s is Shoot => !!s && s.status === 'done')
    .sort((a, b) => b.shootOn.localeCompare(a.shootOn))[0]
  if (shot) {
    const raw = safeUrl(shot.footageUrl)
    return (
      <div className="shoot-line">
        <span className="shoot-line-k">Shot</span>
        <span className="shoot-line-v">
          <button type="button" className="link-btn" onClick={() => onOpen(shot)}>{shot.code}</button> · {shootDayLabel(shot.shootOn, null)}
          {raw ? <> · <a href={raw} target="_blank" rel="noreferrer">Raw footage ↗</a></> : ' · no footage link yet'}
        </span>
      </div>
    )
  }
  const due = shootStageFor(flows.stages, item)
  const cur = flows.stages.find((s) => s.id === item.stageId)
  const close = !!due && !!cur && (due.id === cur.id || nextStage(flows.stages, cur)?.id === due.id)
  if (!close || !canPlan) return null
  return (
    <button type="button" className="shoot-line is-empty" onClick={() => onOpen('new')}>
      <span className="shoot-line-k">Shoot</span>
      <span className="shoot-line-v">Not on a shoot yet</span>
      <span className="shoot-line-go">Plan one →</span>
    </button>
  )
}
