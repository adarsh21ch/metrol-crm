// Metrol CRM — Clients & Pages: paste an Instagram profile link, get the
// handle and display name back instead of typing them (Adarsh, 2026-09-22,
// live on company.metrol.in: "we get all the details of the client... we
// fetch all the details after it").
//
// Same reason send-payslip-email and approve-job-application are
// server-side: this needs the Apify API key, which must never be compiled
// into the browser bundle. Apify's own actor for this is public
// (apify/instagram-profile-scraper) — this function just calls it with
// whatever was pasted (a full profile URL, a bare @handle, or a plain
// username all work: the actor accepts any of the three in its `usernames`
// input) and hands back the fields the Add-page form fills in.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "fetch-instagram-profile" → Deploy. Needs
// ONE new secret: APIFY_API_KEY (Adarsh gave this key on 2026-09-22 — put it
// under Edge Functions → Manage secrets, same place RESEND_API_KEY already
// lives). Nothing works until that secret is set; the function says so
// plainly rather than failing silently.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

interface ApifyProfile {
  username?: string
  fullName?: string
  biography?: string
  profilePicUrl?: string
  followersCount?: number
  verified?: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY')

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

  // Reproduces is_owner() / is_hr() / leads_content_marketing() (0001, 0006,
  // 0033) by hand — this connection uses the service role, so RLS (and
  // those functions running AS the caller) does not apply to it. Same three
  // people who can write to clients/pages/page_assignments can call this.
  const { data: callerProfile } = await admin
    .from('profiles').select('role, department_id, is_team_lead').eq('id', callerId).single()
  let isPrivileged = callerProfile?.role === 'owner'
  if (!isPrivileged && callerProfile?.department_id) {
    const { data: dept } = await admin
      .from('departments').select('name').eq('id', callerProfile.department_id).single()
    isPrivileged = dept?.name === 'Human Resources'
      || (!!callerProfile.is_team_lead && dept?.name === 'Content and Marketing')
  }
  if (!isPrivileged) return json({ error: 'Only HR, the owner, or the Content & Marketing lead can do this.' }, 403)

  if (!APIFY_API_KEY) return json({ error: 'APIFY_API_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const input = String(body.url ?? '').trim()
  if (!input) return json({ error: 'Paste a profile link or handle first.' }, 400)

  let apifyRes: Response
  try {
    apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The actor accepts a URL, a bare @handle, or a plain username in
        // this same array — nothing here has to parse the link ourselves.
        body: JSON.stringify({ usernames: [input] }),
      },
    )
  } catch {
    return json({ error: 'Could not reach Instagram right now. Try again in a moment.' }, 502)
  }

  if (!apifyRes.ok) {
    // A bad/private/deleted profile is a normal outcome here, not a bug —
    // say so rather than surfacing a raw HTTP status.
    return json({ error: `Instagram lookup failed (${apifyRes.status}). Check the link and try again.` }, 502)
  }

  let items: ApifyProfile[]
  try { items = await apifyRes.json() } catch { return json({ error: 'Instagram returned something unexpected.' }, 502) }
  const profile = items?.[0]
  if (!profile?.username) return json({ error: "Could not find that Instagram profile — check the link." }, 404)

  return json({
    handle: '@' + profile.username,
    fullName: profile.fullName ?? '',
    biography: profile.biography ?? '',
    profilePicUrl: profile.profilePicUrl ?? '',
    followersCount: profile.followersCount ?? null,
    verified: !!profile.verified,
  })
})
