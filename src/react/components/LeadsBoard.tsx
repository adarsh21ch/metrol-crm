import { Board } from '@/components/Board'
import { EditChip } from '@/components/bits'
import { QUALITY, STATUS, type Lead, type LeadStatus } from '@/lib/types'
import { money } from '@/lib/format'

const COLUMNS = Object.keys(STATUS) as LeadStatus[]

/** Name and the quality control share the top row; project name and the sale
 *  amount share the row under it — a bare lead and a converted, rated one
 *  then take up the same two lines instead of quality growing a third. */
function CardBody({
  l, projectName, onEditQuality,
}: { l: Lead; projectName: (id: string) => string; onEditQuality?: (e: React.MouseEvent<HTMLButtonElement>, l: Lead) => void }) {
  return (
    <>
      <div className="board-card-head">
        <span className="board-card-nm">
          {l.isNew && <span className="new-dot" title="New lead" />}
          {l.name}
        </span>
        {onEditQuality && (
          <EditChip
            cls={l.quality ? QUALITY[l.quality].cls : 'chip--none'}
            label={l.quality ? QUALITY[l.quality].label : 'Not set'}
            onClick={(e) => { e.stopPropagation(); onEditQuality(e, l) }}
          />
        )}
      </div>
      <div className="board-card-meta">
        <span className="board-card-sub">{projectName(l.projectId)}</span>
        {l.amount > 0 && <span className="cell-money">{money(l.amount)}</span>}
      </div>
    </>
  )
}

/** The same leads as the list, one column per status — the drag engine is
 *  Board's, shared with the Content board. */
export function LeadsBoard({
  leads, projectName, onOpenHistory, onDropStatus, onEditQuality,
}: {
  leads: Lead[]
  projectName: (id: string) => string
  onOpenHistory: (l: Lead) => void
  onDropStatus: (lead: Lead, status: LeadStatus) => void
  onEditQuality: (e: React.MouseEvent<HTMLButtonElement>, lead: Lead) => void
}) {
  return (
    <Board
      cols={COLUMNS.map((c) => ({ key: c, label: STATUS[c].label, dotCls: STATUS[c].cls }))}
      rows={leads}
      colOf={(l) => l.status}
      emptyText="No leads here"
      onOpen={onOpenHistory}
      onDrop={(l, col) => onDropStatus(l, col as LeadStatus)}
      renderCard={(l) => <CardBody l={l} projectName={projectName} onEditQuality={onEditQuality} />}
    />
  )
}
