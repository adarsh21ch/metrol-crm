import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { agoWords } from '@/lib/format'
import { BroadcastModal } from '@/modals/BroadcastModal'
import type { Notifications } from '@/data/useNotifications'
import type { Workspace } from '@/data/useWorkspace'

const BELL = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const TITLE: Record<string, string> = { broadcast: 'From HR', birthday: 'Birthday', shift_reminder: 'Shift reminder' }

/**
 * One bell, mounted once inside AccountControls (rail on desktop, topbar on
 * phone), so "wherever you are" is true without fighting any screen's own
 * BottomNav tab budget. The panel is a portal anchored to the icon, same
 * positioning trick Menu.tsx uses, because a rich feed doesn't fit that
 * component's plain pick-list shape.
 */
export function NotificationBell({ ws, n, isPrivileged }: { ws: Workspace; n: Notifications; isPrivileged: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Same two collisions Menu.tsx already guards against, because this bell
    // shows up in two very different corners: the rail's copy sits near the
    // bottom-LEFT of the screen (a panel opening straight down and anchored
    // to the button's right edge would run off both the bottom and the
    // left), the topbar's copy sits near the top-right on a phone.
    const panelH = panelRef.current?.offsetHeight ?? 0
    const panelW = panelRef.current?.offsetWidth ?? 360
    let top = r.bottom + 8
    if (top + panelH > window.innerHeight - 10) top = Math.max(10, r.top - panelH - 8)
    const left = Math.min(r.left, window.innerWidth - panelW - 12)
    setPos({ top, left: Math.max(12, left) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('click', away), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', away) }
  }, [open])

  return (
    <>
      <span className="bell-wrap">
        <button ref={btnRef} className="icon-btn" title="Notifications" aria-label="Notifications"
                onClick={() => { setOpen((v) => !v); if (!open) void n.reload() }}>
          {BELL}
        </button>
        {n.unreadCount > 0 && (
          <span className="bell-badge">{n.unreadCount > 9 ? '9+' : n.unreadCount}</span>
        )}
      </span>

      {open && createPortal(
        <div className="menu notif-panel" ref={panelRef}
             style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
          <div className="notif-head">
            <strong>Notifications</strong>
            <span className="notif-head-actions">
              {isPrivileged && <button className="btn btn--sm" onClick={() => setComposing(true)}>+ New broadcast</button>}
              {n.unreadCount > 0 && <button className="link-btn" onClick={() => void n.markAllRead()}>Mark all read</button>}
            </span>
          </div>
          <div className="notif-list">
            {n.rows.length === 0 && <p className="notif-empty">Nothing yet.</p>}
            {n.rows.map((r) => (
              <button key={r.id} className={'notif-row' + (r.readAt ? '' : ' is-unread')}
                      onClick={() => { if (!r.readAt) void n.markRead(r.id) }}>
                <span className="notif-kind">{TITLE[r.type] ?? 'Update'}</span>
                <span className="notif-title">{r.title}</span>
                {r.body && <span className="notif-body">{r.body}</span>}
                <span className="notif-when">{agoWords(r.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {composing && (
        <BroadcastModal ws={ws} onClose={() => setComposing(false)}
                         onSend={async (title, body, audience) => {
                           const err = await n.broadcast(title, body, audience)
                           if (!err) setComposing(false)
                           return err
                         }} />
      )}
    </>
  )
}
