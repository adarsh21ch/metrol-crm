// Metrol CRM — the page-analytics dashboard's own fetch
// (PAGE-ANALYTICS-DASHBOARD-PLAN.md, 2026-09-22 brief).
//
// Takes a pageId, resolves its handle, calls Apify's apify/instagram-reel-
// scraper for that profile's most recent reels, and upserts them into
// page_reels. Then — the part that also closes the "views not checked yet"
// gap on incentive claims — for every fetched reel, looks for an
// incentive_claims row on the SAME page whose reel_url matches, and updates
// its views. The existing set_incentive_tier trigger (0031/0032) recomputes
// the tier the moment views changes, so a matching claim goes from "Below
// threshold" to a real tier with no HR typing required. A claim with no
// matching reel (private, deleted, URL typo) is untouched — HR's manual
// "Save views" stays the fallback, on purpose.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "fetch-page-reels" → Deploy. Reuses the
// APIFY_API_KEY secret fetch-instagram-profile already has — no new secret.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Two rounds of guessing the exact field name Apify uses for views were
// both wrong, live, on a real account — the actor's actual output isn't
// fully documented and apparently drifts from its own published schema.
// Rather than guess a third time, this SEARCHES the reel's own keys for
// anything that looks like the metric wanted and is a number — resilient to
// whatever Apify actually calls it, today or after it changes again.
type ApifyReel = Record<string, unknown>

function findNumber(r: ApifyReel, patterns: RegExp[]): number | null {
  for (const [key, value] of Object.entries(r)) {
    if (typeof value !== 'number') continue
    if (patterns.some((p) => p.test(key))) return value
  }
  return null
}

// Lower than the plan's original 25 (2026-09-22, live): a real 25-reel scrape
// ran long enough that the connection to this function was cut before it
// could respond — each reel is its own page Apify has to visit, so this is
// a genuine time cost, not a bug. 10 finishes reliably inside a normal
// request's time budget; raise it again once a background/async job queue
// exists to run a longer fetch without the caller waiting on the connection.
const RESULTS_LIMIT = 10

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

  // Same privilege recheck fetch-instagram-profile already uses — the three
  // people who can write to pages can refresh its reels.
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
  const pageId = String(body.pageId ?? '')
  if (!pageId) return json({ error: 'pageId is required.' }, 400)

  const { data: page, error: pageErr } = await admin
    .from('pages').select('id, instagram_handle').eq('id', pageId).single()
  if (pageErr || !page) return json({ error: 'That page no longer exists.' }, 404)
  const handle = String(page.instagram_handle ?? '').replace(/^@/, '').trim()
  if (!handle) return json({ error: 'This page has no Instagram handle on file yet — add one first.' }, 400)

  let apifyRes: Response
  try {
    apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: [handle], resultsLimit: RESULTS_LIMIT }),
      },
    )
  } catch {
    return json({ error: 'Could not reach Instagram right now. Try again in a moment.' }, 502)
  }
  if (!apifyRes.ok) return json({ error: `Instagram lookup failed (${apifyRes.status}). Check the handle and try again.` }, 502)

  let items: ApifyReel[]
  try { items = await apifyRes.json() } catch { return json({ error: 'Instagram returned something unexpected.' }, 502) }
  if (!Array.isArray(items) || items.length === 0) {
    return json({ fetched: 0, matchedClaims: 0, warning: 'No reels came back for this handle — it may be private or have none.' })
  }

  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  const rows = items.map((r) => {
    const shortCode = str(r.shortCode) ?? str(r.code) ?? ''
    return {
      page_id: pageId,
      short_code: shortCode,
      reel_url: str(r.url) ?? (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : ''),
      caption: str(r.caption),
      // -1 is a real Instagram value here, not missing data — a creator can
      // hide their like count and the API reports exactly -1 for that.
      views: findNumber(r, [/view/i, /play/i]),
      likes: findNumber(r, [/like/i]),
      comments: findNumber(r, [/comment/i]),
      shares: findNumber(r, [/share/i]),
      thumbnail_url: str(r.displayUrl) ?? str(r.thumbnailUrl),
      posted_at: str(r.timestamp),
      fetched_at: new Date().toISOString(),
    }
  }).filter((r) => r.short_code && r.reel_url)

  const { error: upsertErr } = await admin.from('page_reels').upsert(rows, { onConflict: 'page_id,short_code' })
  if (upsertErr) return json({ error: upsertErr.message }, 500)

  // Fill in incentive_claims.views for any claim on this page whose
  // reel_url matches one just fetched — the trigger does the rest.
  let matchedClaims = 0
  const { data: claims } = await admin
    .from('incentive_claims').select('id, reel_url').eq('page_id', pageId).is('decided_at', null).eq('rejected', false)
  if (claims?.length) {
    for (const claim of claims) {
      const hit = rows.find((r) => claim.reel_url && r.reel_url && claim.reel_url.includes(r.short_code))
      if (hit?.views != null) {
        const { error: updErr } = await admin
          .from('incentive_claims').update({ views: hit.views, views_checked_at: new Date().toISOString() }).eq('id', claim.id)
        if (!updErr) matchedClaims++
      }
    }
  }

  // TEMPORARY, 2026-09-22: views keeps coming back null even after two
  // corrected field-name guesses, live, on a real account. Rather than
  // guess a third time, hand back the actual raw keys/values Apify sent for
  // one reel — visible right in the same popup — so the real field name can
  // be read off it directly instead of guessed at again. Remove this once
  // views are confirmed working.
  const sampleKeys = items[0] && typeof items[0] === 'object'
    ? Object.fromEntries(Object.entries(items[0] as Record<string, unknown>).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 30))
    : null

  return json({ fetched: rows.length, matchedClaims, debugSample: sampleKeys })
})
