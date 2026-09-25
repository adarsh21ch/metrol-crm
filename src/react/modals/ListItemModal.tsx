import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { TONES, type ListItem, type Tone } from '@/lib/agency'

/** One entry on one of the small lists — a client status, a page colour, an
 *  adjustment type. Retire rather than delete: rows already using it keep it. */
export function ListItemModal({
  title, item, withTone, onClose, onSave,
}: {
  title: string
  item: ListItem | null
  withTone: boolean
  onClose: () => void
  onSave: (patch: { name: string; tone: Tone; isActive: boolean }) => Promise<string | null>
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [tone, setTone] = useState<Tone>(item?.tone ?? 'mute')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    const message = await onSave({ name, tone, isActive })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={item ? `Edit ${title.toLowerCase()}` : `New ${title.toLowerCase()}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="liName">Name</label>
          <input className="input" id="liName" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void save() }} />
        </div>
        {withTone && (
          <div className="field">
            <label>Colour</label>
            <div className="li-tones">
              {TONES.map((t) => (
                <button key={t.key} type="button" className={'li-tone' + (tone === t.key ? ' is-on' : '')}
                        aria-pressed={tone === t.key} onClick={() => setTone(t.key)}>
                  <Chip cls={'chip--' + t.key}>{name.trim() || t.label}</Chip>
                </button>
              ))}
            </div>
          </div>
        )}
        {item && (
          <label className="check">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            In use — a retired entry cannot be picked for anything new
          </label>
        )}
      </div>
    </Modal>
  )
}
