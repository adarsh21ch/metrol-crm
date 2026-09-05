import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Rail, type RailItem } from '@/components/Rail'
import { Modal } from '@/components/Modal'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useHoverTip } from '@/components/HoverTip'
import { usePanes } from '@/lib/usePanes'
import { Avatar, Chip, IconBtn, Kpi } from '@/components/bits'
import { count, initials } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ProfileModal } from '@/modals/ProfileModal'
import { EmployeeModal } from '@/modals/EmployeeModal'
import { useEmployees, type EmployeeDraft } from '@/data/useEmployees'
import { EMPLOYMENT, EMP_STATUS, fmtDate, joinedThisMonth, tenure, todayISO, type Employee } from '@/lib/hr'
import type { Workspace } from '@/data/useWorkspace'

const PEOPLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
)
const DEPT_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
  </svg>
)
const GEAR_BACK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)

/** One label / value pair on the employee page. */
const Fld = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="hr-fld"><div className="l">{l}</div><div className="v">{v || '—'}</div></div>
)

/**
 * The HR dashboard. It gets the owner's rail rather than the salesperson's tab
 * strip, because HR grows: leave, salary, onboarding and exits are four more
 * sections arriving in phases 2 to 5, and a row of tabs runs out of room where
 * a sidebar does not.
 *
 * Who reaches this screen is decided by department, not by a role — see
 * migration 0006. Everything it can read or write is enforced there too, so
 * nothing on this page is load-bearing for security.
 */
export function HrPage({ ws, toast }: { ws: Workspace; toast: (m: string) => void }) {
  const panes = usePanes()
  const tip = useHoverTip()
  const hr = useEmployees()

  const [section, setSection] = useState<'directory' | 'departments'>('directory')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState<Partial<EmployeeDraft> | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [resigning, setResigning] = useState<Employee | null>(null)
  const [lastDay, setLastDay] = useState(todayISO())
  const [profileOpen, setProfileOpen] = useState(false)

  const [q, setQ] = useState('')
  const [deptId, setDeptId] = useState('')
  const [showLeavers, setShowLeavers] = useState(false)

  const open = openId ? hr.rows.find((e) => e.id === openId) ?? null : null

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return hr.rows.filter((e) => {
      if (!showLeavers && e.status === 'resigned') return false
      if (deptId && e.departmentId !== deptId) return false
      if (!needle) return true
      return [e.fullName, e.employeeCode, e.designation, e.phone, e.workEmail]
        .some((v) => v.toLowerCase().includes(needle))
    })
  }, [hr.rows, q, deptId, showLeavers])

  // Somebody with a login and no employee record is the most common gap in a
  // fresh HR module — worth saying out loud rather than leaving HR to notice.
  const recorded = new Set(hr.rows.map((e) => e.profileId).filter(Boolean))
  const unrecorded = ws.members.filter((m) => !recorded.has(m.id))

  const railItems: RailItem[] = [
    { key: 'directory', label: 'Directory', icon: PEOPLE_ICON, onClick: () => { setSection('directory'); setOpenId(null) } },
    { key: 'departments', label: 'Departments', icon: DEPT_ICON, onClick: () => { setSection('departments'); setOpenId(null) } },
  ]

  const cols: GridCol<Employee>[] = [
    {
      key: 'name', label: 'Name', width: 210,
      render: (e) => (
        <div className="td-flex">
          <Avatar>{initials(e.fullName)}</Avatar>
          <button className="name-btn" onClick={() => setOpenId(e.id)}>{e.fullName}</button>
        </div>
      ),
    },
    { key: 'code', label: 'Code', width: 92, render: (e) => <span className="cell-mono">{e.employeeCode || '—'}</span> },
    { key: 'desig', label: 'Designation', width: 168, render: (e) => e.designation || <span className="cell-dash">—</span> },
    { key: 'dept', label: 'Department', width: 158, render: (e) => ws.departmentName(e.departmentId) ?? <span className="cell-dash">—</span> },
    { key: 'type', label: 'Type', width: 104, render: (e) => <span className="cell-mute">{EMPLOYMENT[e.employmentType]}</span> },
    { key: 'joined', label: 'Joined', width: 124, render: (e) => fmtDate(e.dateOfJoining) },
    { key: 'status', label: 'Status', width: 116, render: (e) => <Chip cls={EMP_STATUS[e.status].cls}>{EMP_STATUS[e.status].label}</Chip> },
  ]

  const saveNew = async (draft: EmployeeDraft) => {
    const message = await hr.create(draft)
    if (!message) toast(draft.fullName + ' added to the directory.')
    return message
  }

  const saveEdit = async (draft: EmployeeDraft) => {
    if (!editing) return 'Nothing is open for editing.'
    const message = await hr.update(editing.id, draft)
    if (!message) toast('Saved.')
    return message
  }

  const confirmResign = async () => {
    if (!resigning) return
    const message = await hr.update(resigning.id, { status: 'resigned', lastWorkingDay: lastDay })
    setResigning(null)
    toast(message ?? (resigning.fullName + ' marked as resigned. The record stays.'))
  }

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <button className="user-chip" title="My profile" onClick={() => setProfileOpen(true)}>
            <Avatar lg src={ws.me?.avatarUrl}>{initials(ws.me?.name ?? '?')}</Avatar>
            <div>
              <div className="name">{ws.me?.name ?? 'HR'}</div>
              <div className="role">HR</div>
            </div>
          </button>
          <IconBtn title="Sign out" onClick={() => void supabase.auth.signOut()}>{GEAR_BACK}</IconBtn>
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} active={open ? 'directory' : section} panes={panes} tip={tip} items={railItems} />

        <div className="workspace">
          <div className="mobile-nav">
            <button className={section === 'directory' ? 'is-on' : ''}
                    onClick={() => { setSection('directory'); setOpenId(null) }}>Directory</button>
            <button className={section === 'departments' ? 'is-on' : ''}
                    onClick={() => { setSection('departments'); setOpenId(null) }}>Departments</button>
          </div>

          <div className="wrap">
            {hr.error && <div className="auth-err" style={{ marginBottom: 14 }}>{hr.error}</div>}

            {/* ------------------------------------------------ one person */}
            {open && (
              <>
                <div className="page-head">
                  <button className="btn btn--sm" onClick={() => setOpenId(null)}>← Directory</button>
                  <h1 style={{ marginTop: 10 }}>{open.fullName}</h1>
                  <div className="sub">
                    {open.designation || 'No designation'} · {ws.departmentName(open.departmentId) ?? 'No department'}
                    {' · '}{open.employeeCode} · {tenure(open.dateOfJoining)} with Metrol
                  </div>
                </div>

                <div className="hr-head">
                  <Chip cls={EMP_STATUS[open.status].cls}>{EMP_STATUS[open.status].label}</Chip>
                  <div className="hr-head-btns">
                    <button className="btn btn--sm" onClick={() => setEditing(open)}>Edit</button>
                    {open.status !== 'resigned' && (
                      <button className="btn btn--sm" onClick={() => { setLastDay(todayISO()); setResigning(open) }}>
                        Mark as resigned
                      </button>
                    )}
                  </div>
                </div>

                <div className="section">
                  <div className="section-head"><h3>Employment</h3></div>
                  <div className="hr-fields">
                    <Fld l="Joined" v={fmtDate(open.dateOfJoining)} />
                    <Fld l="Type" v={EMPLOYMENT[open.employmentType]} />
                    <Fld l="Department" v={ws.departmentName(open.departmentId)} />
                    <Fld l="Reports to" v={hr.rows.find((e) => e.id === open.reportingTo)?.fullName} />
                    <Fld l="Employee code" v={open.employeeCode} />
                    <Fld l="CRM login" v={open.profileId ? (ws.members.find((m) => m.id === open.profileId)?.email ?? 'Linked') : 'No login'} />
                    {open.status !== 'active' && <Fld l="Last working day" v={fmtDate(open.lastWorkingDay)} />}
                  </div>
                </div>

                <div className="section">
                  <div className="section-head"><h3>Contact</h3></div>
                  <div className="hr-fields">
                    <Fld l="Phone" v={open.phone} />
                    <Fld l="Work email" v={open.workEmail} />
                    <Fld l="Personal email" v={open.personalEmail} />
                    <Fld l="Date of birth" v={fmtDate(open.dateOfBirth)} />
                    <Fld l="Address" v={open.address} />
                  </div>
                </div>

                <div className="section">
                  <div className="section-head"><h3>Emergency contact</h3></div>
                  <div className="hr-fields">
                    <Fld l="Name" v={open.emergencyName} />
                    <Fld l="Relation" v={open.emergencyRelation} />
                    <Fld l="Phone" v={open.emergencyPhone} />
                  </div>
                </div>

                {open.notes && (
                  <div className="section">
                    <div className="section-head"><h3>Notes</h3></div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{open.notes}</p>
                  </div>
                )}

                <div className="section">
                  <div className="section-head">
                    <h3>Later phases</h3>
                    <div className="sub">These arrive on this same page rather than as new screens.</div>
                  </div>
                  <div className="hr-soon">
                    <Chip cls="chip--mute">Leave · phase 2</Chip>
                    <Chip cls="chip--mute">Salary · phase 3</Chip>
                    <Chip cls="chip--mute">Documents · phase 4</Chip>
                    <Chip cls="chip--mute">Exit · phase 5</Chip>
                  </div>
                </div>
              </>
            )}

            {/* ------------------------------------------------ directory */}
            {!open && section === 'directory' && (
              <>
                <div className="page-head">
                  <h1>Employees</h1>
                  <div className="sub">
                    {hr.loading ? 'Loading…' : `${count(hr.rows.length, 'record')} · ${count(shown.length, 'shown', 'shown')}`}
                  </div>
                </div>

                <div className="kpis">
                  <Kpi accent label="Employees" value={hr.rows.length} sub={count(hr.rows.filter((e) => e.status === 'active').length, 'active', 'active')} />
                  <Kpi label="On notice" value={hr.rows.filter((e) => e.status === 'notice').length} sub="working their notice" />
                  <Kpi label="Resigned" value={hr.rows.filter((e) => e.status === 'resigned').length} sub="kept, never deleted" />
                  <Kpi label="Joined this month" value={hr.rows.filter(joinedThisMonth).length} sub="new starters" />
                </div>

                {unrecorded.length > 0 && (
                  <div className="banner">
                    <div>
                      <div className="t">{count(unrecorded.length, 'person', 'people')} with a login and no employee record</div>
                      <div className="d">{unrecorded.map((m) => m.name).join(', ')}</div>
                    </div>
                    <button className="btn btn--sm" onClick={() => {
                      const m = unrecorded[0]!
                      setAdding({ profileId: m.id, fullName: m.name, workEmail: m.email ?? '', phone: m.phone ?? '', departmentId: m.departmentId })
                    }}>
                      Add {unrecorded[0]!.name.split(' ')[0]}
                    </button>
                  </div>
                )}

                <div className="section">
                  <div className="section-head">
                    <h3>Directory</h3>
                    <div className="section-tools">
                      <input className="input search" placeholder="Search name, code, phone…"
                             value={q} onChange={(e) => setQ(e.target.value)} />
                      <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                        <option value="">Every department</option>
                        {ws.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button className={'btn btn--sm' + (showLeavers ? ' btn--primary' : '')}
                              onClick={() => setShowLeavers((v) => !v)}>
                        {showLeavers ? 'Hiding nobody' : 'Show resigned'}
                      </button>
                      <button className="btn btn--sm btn--primary" onClick={() => setAdding({})}>Add employee</button>
                    </div>
                  </div>

                  {!hr.loading && hr.rows.length === 0 ? (
                    <div className="ov-card">
                      <div className="ov-head"><h4>Nobody is on the directory yet</h4></div>
                      <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                        Add the first employee, or start from someone who already has a login above.
                      </p>
                    </div>
                  ) : (
                    <DataGrid cols={cols} rows={shown} storageKey="hr-directory"
                              foot={<div className="grid-foot"><span>{count(shown.length, 'employee')}</span></div>} />
                  )}
                </div>
              </>
            )}

            {/* ---------------------------------------------- departments */}
            {!open && section === 'departments' && (
              <>
                <div className="page-head">
                  <h1>Departments</h1>
                  <div className="sub">Where everybody sits. Moving somebody here is done on their record.</div>
                </div>

                {[...ws.departments].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => {
                  const mine = hr.rows.filter((e) => e.departmentId === d.id && e.status !== 'resigned')
                  return (
                    <div className="ov-card" key={d.id}>
                      <div className="ov-head">
                        <h4>{d.name}</h4>
                        <span className="ov-cta">{count(mine.length, 'person', 'people')}</span>
                      </div>
                      {mine.length === 0
                        ? <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>Nobody yet.</p>
                        : (
                          <div className="ov-actions">
                            {mine.map((e) => (
                              <button className="ov-row" key={e.id} onClick={() => { setOpenId(e.id); setSection('directory') }}>
                                <span className="ov-n">{initials(e.fullName)}</span>
                                <span className="ov-l">{e.fullName} — {e.designation || 'no designation'}</span>
                                <span className="ov-cta">{EMP_STATUS[e.status].label} →</span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {tip.node}
      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}

      {adding && (
        <EmployeeModal ws={ws} employee={null} employees={hr.rows} prefill={adding}
                       onClose={() => setAdding(null)} onSave={saveNew} />
      )}
      {editing && (
        <EmployeeModal ws={ws} employee={editing} employees={hr.rows}
                       onClose={() => setEditing(null)} onSave={saveEdit} />
      )}

      {resigning && (
        <Modal
          title="Mark as resigned"
          sub={resigning.fullName + ' · ' + resigning.employeeCode}
          onClose={() => setResigning(null)}
          foot={
            <>
              <button className="btn btn--sm" onClick={() => setResigning(null)}>Cancel</button>
              <button className="btn btn--sm btn--primary" onClick={() => void confirmResign()}>Mark as resigned</button>
            </>
          }
        >
          <p style={{ marginBottom: 14 }}>
            The record is kept, not deleted — it stays in the directory under “Show resigned”, with
            everything on it. Only their status changes.
          </p>
          <div className="field">
            <label htmlFor="hrLast">Last working day</label>
            <input className="input" id="hrLast" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  )
}
