import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Modal({
  title, sub, wide, onClose, children, foot,
}: {
  title: string
  sub?: string
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
  foot?: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return createPortal(
    <div className="backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' modal--wide' : '')}>
        <div className="modal-head">
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  )
}
