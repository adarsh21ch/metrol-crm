import { LEAVE_TYPE, fmtDate, type LeaveRequest } from '@/lib/hr'

export interface LeaveAlert { id: string; request: LeaveRequest }

/**
 * A leave request landing while HR is looking at something else. The sidebar
 * count ("Leave (2)") is correct but silent — it only says something the
 * moment you happen to open the tab it lives on. This sits above every HR
 * screen instead, so the moment lands wherever HR actually is, and stacks
 * rather than replacing the way the routine save-toast does: a second
 * request arriving before the first is read should not erase it.
 *
 * Red rather than the app's usual gold, on purpose — gold already means
 * "pending" on the request itself, so a same-colour banner reads as one more
 * pending chip, not a fresh thing to look at.
 */
export function LeaveAlertStack({
  alerts, employeeName, onOpen, onDismiss,
}: {
  alerts: LeaveAlert[]
  employeeName: (id: string) => string
  onOpen: (a: LeaveAlert) => void
  onDismiss: (id: string) => void
}) {
  if (alerts.length === 0) return null
  return (
    <div className="leave-alert-stack">
      {alerts.map((a) => (
        <div className="leave-alert" key={a.id}>
          <div className="leave-alert-body" onClick={() => onOpen(a)}>
            <strong>New leave request</strong>
            <span>
              {employeeName(a.request.employeeId)} — {LEAVE_TYPE[a.request.leaveType].label.toLowerCase()},
              {' '}{a.request.daysCount === 1 ? '1 day' : a.request.daysCount + ' days'} from {fmtDate(a.request.startDate)}
            </span>
          </div>
          <button type="button" className="leave-alert-x" aria-label="Dismiss" onClick={() => onDismiss(a.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
