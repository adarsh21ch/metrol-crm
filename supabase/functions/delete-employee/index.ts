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
// door: owner-only, requires the service role, and lives at a URL nobody
// reaches by habit.
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

  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser()
  if (callerErr || !callerUser?.user) return json({ error: 'Could not verify who is calling this.' }, 401)
  const callerId = callerUser.user.id

  // OWNER ONLY — not HR, unlike approve-job-application. Approving is a
  // reviewable decision HR makes every day; deleting an employee outright is
  // not something this app should let more than one role reach.
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerId).single()
  if (callerProfile?.role !== 'owner') return json({ error: 'Only the owner can delete an employee record.' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const employeeId = String(body.employeeId ?? '')
  if (!employeeId) return json({ error: 'employeeId is required.' }, 400)

  const { data: employee, error: empErr } = await admin
    .from('employees').select('id, full_name, profile_id').eq('id', employeeId).single()
  if (empErr || !employee) return json({ error: 'That employee no longer exists.' }, 404)

  // 1. their files. Listed first, since a bucket with nothing under that
  // prefix is not an error — it just has nothing to remove.
  const { data: files } = await admin.storage.from(DOCS_BUCKET).list(employee.id)
  if (files && files.length > 0) {
    await admin.storage.from(DOCS_BUCKET).remove(files.map((f) => `${employee.id}/${f.name}`))
  }

  // 2. the row. Cascades take leave/salary/onboarding/exit/attendance/
  // documents with it — see the file header for why that is safe here.
  const { error: delErr } = await admin.from('employees').delete().eq('id', employee.id)
  if (delErr) return json({ error: `Could not delete the employee record: ${delErr.message}` }, 502)

  // 3. their login, if approving ever created one. A rejected or a manually
  // added employee may have no profile_id at all — nothing to do then.
  if (employee.profile_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(employee.profile_id)
    // Not fatal: the employee record — the part that actually matters for
    // "get this test data out of my directory" — is already gone. A login
    // Postgres no longer has an employee row for is inert, not dangerous,
    // and worth surfacing rather than hiding.
    if (authErr) return json({ ok: true, warning: `Employee deleted, but the login could not be removed: ${authErr.message}` })
  }

  return json({ ok: true })
})
