import { cn } from '@/lib/utils'
import type { LeadStatus, Quality } from '@/lib/types'
import { STATUS_LABEL, QUALITY_LABEL } from '@/lib/types'

/** The chip keeps its fill. An earlier round made these transparent to signal
 *  "editable" and the colour washed out; editability is shown by the caret and
 *  the hover ring instead. */
const tone = {
  good: 'bg-good-soft text-good border-good-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  bad: 'bg-bad-soft text-bad border-bad-line',
  neutral: 'bg-surface-3 text-ink-2 border-line',
} as const

const STATUS_TONE: Record<LeadStatus, keyof typeof tone> = {
  new: 'neutral',
  connected: 'warn',
  follow_up: 'warn',
  dead: 'bad',
  converted: 'good',
}
const QUALITY_TONE: Record<Quality, keyof typeof tone> = {
  good: 'good',
  average: 'warn',
  bad: 'bad',
}

export function Chip({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode
  variant?: keyof typeof tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center rounded border px-2 text-[12px] font-medium',
        tone[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const StatusChip = ({ value }: { value: LeadStatus }) => (
  <Chip variant={STATUS_TONE[value]}>{STATUS_LABEL[value]}</Chip>
)

/** An unset quality reads as a hyphen, never an empty chip. */
export const QualityChip = ({ value }: { value: Quality | null }) =>
  value ? <Chip variant={QUALITY_TONE[value]}>{QUALITY_LABEL[value]}</Chip> : <span className="text-ink-3">—</span>
