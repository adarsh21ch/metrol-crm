import { useMemo } from 'react'
import { useAgencySchema } from '@/data/agencySchema'
import { useAccessData } from '@/data/useAccessData'
import { useClientTeam } from '@/data/useClientTeam'
import { useAgencyLists } from '@/data/useAgencyLists'
import { usePageChannels } from '@/data/usePageChannels'
import { useClientExtras } from '@/data/useClientExtras'
import { useTargets } from '@/data/useTargets'
import { makeAccess } from '@/lib/access'
import type { Employee } from '@/lib/hr'
import type { Pages } from '@/data/usePages'
import type { Workspace } from '@/data/useWorkspace'

/**
 * Everything Agency OS Phase 1 reads, loaded once per screen that shows it
 * (HR's and the owner's app, and a Content & Marketing person's) and handed
 * down as one object instead of eight props.
 *
 * Nothing loads until the database has said which migrations it has
 * (useAgencySchema). Before 0036 the screens keep showing the old Clients &
 * Pages; before 0035, "who may do what" answers with today's rules.
 */
export function useAgency(ws: Workspace, staff: Employee[], pages: Pages, enabled = true) {
  const schema = useAgencySchema()
  const on = enabled && !!schema
  const clientsOn = on && !!schema?.clients
  const accessData = useAccessData(ws.departments, on)
  const team = useClientTeam(clientsOn)
  const lists = useAgencyLists(clientsOn)
  const { patchLocal } = pages
  const channels = usePageChannels(clientsOn, (pageId, handle) => patchLocal(pageId, { instagramHandle: handle }))
  const extras = useClientExtras(clientsOn)
  const targets = useTargets(on && !!schema?.targets)

  const me = ws.me
  const myEmployee = useMemo(() => staff.find((e) => e.profileId === me?.id) ?? null, [staff, me])
  const access = useMemo(() => makeAccess(
    {
      isOwner: me?.role === 'owner',
      departmentId: me?.departmentId ?? null,
      isTeamLead: !!me?.isTeamLead,
      employeeId: myEmployee?.id ?? null,
      employeeActive: !!myEmployee && myEmployee.status !== 'resigned',
    },
    { roles: accessData.roles, caps: accessData.caps, employeeRoles: accessData.employeeRoles, assignments: team.rows },
  ), [me, myEmployee, accessData.roles, accessData.caps, accessData.employeeRoles, team.rows])

  return {
    /** null until the database has answered */
    schema,
    installed: { access: !!schema?.access, clients: !!schema?.clients, targets: !!schema?.targets, workflows: !!schema?.workflows, work: !!schema?.work,
      shoots: !!schema?.shoots, posting: !!schema?.posting },
    access, accessData, team, lists, channels, extras, targets, myEmployee,
  }
}

export type Agency = ReturnType<typeof useAgency>
