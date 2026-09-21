// Metrol CRM — push delivery for the "an employee's request needs HR" case.
//
// send-push (2026-09-18) only ever pushes ONE direction: HR/owner broadcasts
// down to employees, and it refuses any caller who is not HR/owner. This is
// the opposite direction — a visit entry or WFH request an ordinary employee
// just filed, pushed to HR + owner's devices — so it cannot reuse send-push's
// gate. Any signed-in employee may call this; what keeps it safe is that the
// recipient list is hard-coded to HR + owner inside this function, never
// caller-supplied. notify_approvers() (0028) has already written the in-app
// notifications row by the time this runs, same fire-and-forget order
// create_broadcast() + send-push already use — this is best-effort delivery
// on top of a row that is already correct.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "notify-approvers" → Deploy. It reads the
// SAME VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets send-push already has —
// nothing new to add under Manage secrets.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
    ?? 'BHUJ78d5VEud5WybcQLKH_AcNHPQATWknciEoMyFycAh82kyIiy0EhhboyvizcR3SJE3WZn5av6dNGBpuaE4lSQ'
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hr@metrol.in'

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

  // Any signed-in employee may reach this far — unlike send-push, there is no
  // privilege gate on the CALLER, because the caller is the person filing the
  // request, not the person meant to receive it.
  const { data: callerEmp } = await admin.from('employees').select('id').eq('profile_id', callerId).single()
  if (!callerEmp) return json({ error: 'No employee record is linked to this login.' }, 403)

  if (!VAPID_PRIVATE_KEY) return json({ error: 'VAPID_PRIVATE_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const title = String(body.title ?? '').trim()
  const notifBody = String(body.body ?? '')
  if (!title) return json({ error: 'title is required.' }, 400)

  // Hard-coded to HR + owner — the one thing that makes an un-gated caller
  // safe. Excludes the caller themselves: HR logging a request on somebody
  // else's behalf does not need to be told about their own action.
  const { data: profiles } = await admin.from('profiles').select('id, role, department_id')
  const { data: departments } = await admin.from('departments').select('id, name').eq('name', 'Human Resources')
  const hrDeptId = departments?.[0]?.id
  const approverProfileIds = (profiles ?? [])
    .filter((p) => p.role === 'owner' || (hrDeptId && p.department_id === hrDeptId))
    .map((p) => p.id)
  if (approverProfileIds.length === 0) return json({ ok: true, sent: 0, note: 'No HR/owner profiles found.' })

  const { data: approverEmployees } = await admin
    .from('employees').select('id, profile_id').eq('status', 'active').in('profile_id', approverProfileIds)
  const employeeIds = (approverEmployees ?? []).map((e) => e.id).filter((id) => id !== callerEmp.id)
  if (employeeIds.length === 0) return json({ ok: true, sent: 0, note: 'No other HR/owner to notify.' })

  const { data: subs } = await admin
    .from('push_subscriptions').select('id, endpoint, p256dh, auth').in('employee_id', employeeIds)
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, note: 'Nobody in HR/owner has notifications enabled on a device yet.' })

  const payload = JSON.stringify({ title, body: notifBody })
  let sent = 0
  const dead: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) dead.push(s.id)
    }
  }))
  if (dead.length > 0) await admin.from('push_subscriptions').delete().in('id', dead)

  return json({ ok: true, sent, expired: dead.length })
})
