import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { Workspace } from '@/data/useWorkspace'

export function BroadcastModal({
  ws, onClose, onSend,
}: { ws: Workspace; onClose: () => void; onSend: (title: string, body: string, audience: string) => Promise<string | null> }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ok = title.trim().length > 0

  async function send() {
    setBusy(true); setErr(null)
    const message = await onSend(title.trim(), body.trim(), audience)
    setBusy(false)
    if (message) setErr(message)
  }

  return (
    <Modal
      title="New broadcast" sub="Everyone in the audience gets this — in the app, and as a push if they've enabled it." onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!ok || busy} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send broadcast'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="bcTitle">Title</label>
        <input className="input" id="bcTitle" autoFocus placeholder="e.g. Office closed for Diwali"
               value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="bcBody">Message (optional)</label>
        <textarea className="input" id="bcBody" rows={3} placeholder="Any details worth adding"
                  value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="bcAudience">Send to</label>
        <select className="input" id="bcAudience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="all">Everyone</option>
          {ws.departments.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}
        </select>
      </div>
      {err && <div className="auth-err" style={{ marginTop: 12 }}>{err}</div>}
    </Modal>
  )
}
