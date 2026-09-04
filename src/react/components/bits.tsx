import { QUALITY, STATUS, type LeadStatus, type Quality } from '@/lib/types'

export const Caret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
       strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
)

export const Avatar = ({ children, lg }: { children: React.ReactNode; lg?: boolean }) => (
  <span className={'avatar' + (lg ? ' avatar--lg' : '')}>{children}</span>
)

export const Chip = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={'chip ' + cls}>{children}</span>
)

/** The owner reads status and quality; the assigned salesperson sets them.
 *  Unset shows a dash, never an empty control. */
export const ReadStatus = ({ v }: { v: LeadStatus }) => <Chip cls={STATUS[v].cls}>{STATUS[v].label}</Chip>
export const ReadQuality = ({ v }: { v: Quality | null }) =>
  v ? <Chip cls={QUALITY[v].cls}>{QUALITY[v].label}</Chip> : <span className="cell-dash">—</span>

/** An editable chip keeps its fill, so the colour still reads at a glance; the
 *  caret and the hover ring are what mark it editable. Forcing it transparent
 *  is what made light mode look washed out. */
export function EditChip({
  cls, label, onClick,
}: { cls: string; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button className={'cell-edit chip ' + cls} onClick={onClick}>
      {label}<Caret />
    </button>
  )
}

export const Yn = ({ yes }: { yes: boolean }) => (
  <span className={yes ? 'yn' : 'yn is-no'}>{yes ? 'Yes' : 'No'}</span>
)

export function Kpi({
  label, value, sub, accent,
}: { label: string; value: React.ReactNode; sub: React.ReactNode; accent?: boolean }) {
  return (
    <div className={'kpi' + (accent ? ' kpi--accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

export const IconBtn = ({
  title, onClick, children,
}: { title: string; onClick?: () => void; children: React.ReactNode }) => (
  <button className="icon-btn" title={title} aria-label={title} onClick={onClick}>{children}</button>
)
