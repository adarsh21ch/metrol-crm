// Metrol CRM — deleting an employee record outright.
//
// This exists for exactly one reason: Adarsh entered 2-3 real test
// applications through the live `/apply` form to prove Phase 8 worked, and
// approving them (also real, also a good test) created real employees with
// real logins — and there is no way to remove them. `useEmployees.ts` says so
// on purpose: "Nothing here deletes. The table has no delete policy and
// DELETE is revoked... leaving is a status change, and the record stays."
// That was the right call for a REAL employee — resignation should never be
// one accidental click from erasing someone's history. This function does
// NOT reverse that decision. The client still cannot delete an employee row;
// DELETE is still revoked at the table. This is a second, separate, harder
// door: it requires the service role and lives at a URL nobody reaches by
// habit. Owner OR HR may open it — see the check below for why HR belongs
// there, and note that "HR" is a department, not a role.
//
// What it actually deletes:
//   1. The auth.users login (if one exists) — the one piece nothing in
//      Postgres can cascade away, because it is not a table this project
//      owns.
//   2. The employee's files in the 'employee-documents' bucket — also not
//      a DB row, also not covered by a foreign key.
//   3. The `employees` row itself. Every table that references it —
//      leave_requests, salary_records, onboarding_tasks, exit tasks/records,
//      attendance_logs, employee_documents — was built with
//      `on delete cascade` from the start (checked against every migration
//      0009–0013 before writing this function), so deleting this one row is
//      enough; nothing is left behind as an orphan.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "delete-employee" → Deploy. No new secret
// needed — it reuses the same SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY every
// function in this project already has.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const DOCS_BUCKET = 'employee-documents'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Sign in required.' }, 401)

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const employeeId = String(body.employeeId ?? '')
  if (!employeeId) return json({ error: 'employeeId is required.' }, 400)

  // WAVE 1 — who is calling, and which employee, TOGETHER. These were two
  // awaits in a straight line, and they never depended on each other: the
  // employee id comes from the request body, not from the caller. Reading the
  // employee before the permission check is safe because nothing is returned
  // to the caller until the check below passes.
  const [callerRes, employeeRes] = await Promise.all([
    asCaller.auth.getUser(),
    admin.from('employees').select('id, full_name, profile_id').eq('id', employeeId).single(),
  ])

  const { data: callerUser, error: callerErr } = callerRes
  if (callerErr || !callerUser?.user) return json({ error: 'Could not verify who is calling this.' }, 401)
  const callerId = callerUser.user.id

  // OWNER OR HR. This shipped owner-only, on the reasoning that erasing
  // somebody is not a daily action. Adarsh's answer was that HR is the one
  // MAINTAINING the directory — the person who enters every record is the
  // person who has to fix a wrong one, and routing that through the owner
  // makes the owner a bottleneck on HR's own data. Migration 0021 already
  // grants exactly this pair on applications (`is_owner() or is_hr()`), so
  // both deletes now answer to the same two people.
  //
  // HR is a DEPARTMENT, not a role — that is settled in CLAUDE.md and is why
  // `profiles.role` has no 'hr' value to test. This mirrors public.is_hr()
  // from migration 0006 exactly: the caller's department's name. Spelled out
  // here rather than calling the SQL function, because `admin` runs as the
  // service role and is_hr() reads auth.uid(), which is not the caller here.
  // WAVE 2 — the role AND the department name in one request. PostgREST
  // embeds the foreign key, so `departments(name)` comes back with the
  // profile instead of costing a second round trip to learn one string.
  const HR_DEPARTMENT = 'Human Resources'
  const { data: callerProfile } = await admin
    .from('profiles').select('role, departments(name)').eq('id', callerId).single()

  const deptRel = (callerProfile as { departments?: { name?: string } | { name?: string }[] } | null)?.departments
  const deptName = Array.isArray(deptRel) ? deptRel[0]?.name : deptRel?.name
  const allowed = callerProfile?.role === 'owner' || deptName === HR_DEPARTMENT
  if (!allowed) return json({ error: 'Only the owner or HR can delete an employee record.' }, 403)

  const { data: employee, error: empErr } = employeeRes
  if (empErr || !employee) return json({ error: 'That employee no longer exists.' }, 404)

  // 1. their files. Listed first, since a bucket with nothing under that
  // prefix is not an error — it just has nothing to remove.
  const { data: files } = await admin.storage.from(DOCS_BUCKET).list(employee.id)
  if (files && files.length > 0) {
    await admin.storage.from(DOCS_BUCKET).remove(files.map((f) => `${employee.id}/${f.name}`))
  }

  // WAVE 3 — the row and the login TOGETHER. Postgres and GoTrue are separate
  // systems with nothing to say to each other, so awaiting one before starting
  // the other only ever cost a round trip. Cascades take leave/salary/
  // onboarding/exit/attendance/documents with the row — see the file header.
  const [rowRes, authRes] = await Promise.all([
    admin.from('employees').delete().eq('id', employee.id),
    employee.profile_id
      ? admin.auth.admin.deleteUser(employee.profile_id)
      : Promise.resolve({ error: null }),
  ])

  if (rowRes.error) return json({ error: `Could not delete the employee record: ${rowRes.error.message}` }, 502)

  // Not fatal: the employee record — the part that actually matters for "get
  // this test data out of my directory" — is gone. A login Postgres no longer
  // has an employee row for is inert, not dangerous, and worth surfacing
  // rather than hiding.
  if (authRes.error) {
    return json({ ok: true, warning: `Employee deleted, but the login could not be removed: ${authRes.error.message}` })
  }

  return json({ ok: true })
})
