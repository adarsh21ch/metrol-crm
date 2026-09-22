# Page analytics dashboard — the brief, not built yet

Adarsh's brief, 2026-09-22, given right after the "paste a link, fetch the
client's profile" feature went live (see CONTENT-MARKETING-DASHBOARD-PLAN.md
— this builds on top of it, same day). Nothing below is built. Read this
file in full before starting; it exists so a fresh session does not have to
re-derive the brief.

## What triggered this

On the live site, `?My pages` lists an employee's assigned pages as plain
rows — clicking one does nothing. Adarsh: an employee should be able to open
a page and see a real dashboard for it — how its content is performing, per
reel, views, virality, what topics are working — pulled automatically from
the same Apify account already wired up, not typed in by hand.

His own framing: *"if all the details we can fetch from Apify API, why
should not we see that details inside our application... proper dashboard
of that particular Instagram page open and all the details we have of that
page... how the content is performing, what topics they are creating, how
they are going viral, how many views they are getting."*

This was explicitly marked **out of scope for v1** in
CONTENT-MARKETING-DASHBOARD-PLAN.md ("Per-page analytics or historical
charts") — that was the right call for that round; this is the next one.

## What already exists — do not re-build

- `APIFY_API_KEY` is set as a Supabase secret (Edge Functions → Manage
  secrets) and already works — `fetch-instagram-profile`
  (`supabase/functions/fetch-instagram-profile/index.ts`) calls
  `apify/instagram-profile-scraper` and is live on company.metrol.in.
- `pages` table (0032): one row per Instagram page, `client_id`,
  `page_type`, `instagram_handle`, `label`, `is_active`.
- The employee's own "My pages" tab (`Member.tsx`, `sec === 'leads'` when
  `isContentMarketing`) and the department head's "Manage team" tab both
  already list pages — this is the entry point that needs to become
  clickable, not a new list to build.

## This also closes a gap Adarsh hit within the hour: "views not checked yet"

Every submitted claim on the live site shows "views not checked yet" and
"Below threshold" — correct today, because nothing fetches a reel's view
count automatically yet (INCENTIVE-PLAN.md's own Step 5, still unbuilt).
That is the SAME data this dashboard fetches. Build them together:

- `fetch-page-reels` (below) should, after upserting `page_reels`, also look
  for any `incentive_claims` row whose `reel_url` matches a fetched reel's
  URL for that page, and `update views = <fetched views>` on it — the
  existing `set_incentive_tier` trigger (0031/0032) already recomputes the
  tier the moment `views` changes, so a claim goes from "Below threshold" to
  a real tier with no HR typing required, the moment its page is refreshed.
- This does not replace HR's manual "Save views" button in
  `IncentiveClaimReviewModal` — Apify can be down, a reel can be private, a
  claim's URL can not-quite-match; manual stays the fallback, exactly as
  INCENTIVE-PLAN.md's own reasoning already says ("HR's manual verify is
  therefore not a nicety — it is the fallback the feature needs to keep
  working on a bad day").

## The two Apify actors involved

Checked directly against Apify's own listing, 2026-09-22:

| Actor | ID | What it returns per item |
|---|---|---|
| Reels | `apify/instagram-reel-scraper` | reel URL/short code, caption, **views/plays**, likes, comments, shares, thumbnail, video URL, posted timestamp, hashtags |
| Posts | `apify/instagram-post-scraper` | same shape, for ordinary (non-reel) posts |

Both accept a username, profile URL, or direct post/reel URLs, plus a
results-per-profile limit. **Start with reels only for v1** — that is what
the incentive-claims system already tracks and what Adarsh's own words
describe ("going viral," "how many views"); posts can be a fast follow with
the second actor once the shape is proven.

## The shape (a recommendation, not yet confirmed with Adarsh)

**New table: `page_reels`** — one row per fetched reel, keyed to `page_id`.
Reel URL/short code, caption, views, likes, comments, shares, thumbnail
URL, posted date, `fetched_at`. Same retire-never-needed shape as a cache:
re-fetching overwrites the numbers for a reel already on file rather than
duplicating the row (unique on `page_id, short_code`).

**A new Edge Function**, `fetch-page-reels` — same auth/privilege pattern
as `fetch-instagram-profile` (owner/HR/`leads_content_marketing()`), takes
a `pageId`, resolves its handle, calls `apify/instagram-reel-scraper` with a
results limit (20–25 to start), and upserts the rows.

**A page detail screen** — reached by clicking a page row from My pages
(employee), the department head's roster, or HR's Clients & Pages. Shows
the page's own header (handle, client, avatar from the profile fetch) and a
table/card grid of its reels: thumbnail, caption (truncated), views, likes,
comments, posted date — sortable by views to answer "what's going viral."

## The cost question — ask before building, do not guess

Apify charges per run, and a full reel-refresh is a heavier call than the
single-profile lookup already shipped. `INCENTIVE-PLAN.md` already made this
same call once, for the exact same reason: *"batching the re-check... keeps
it sane."* Recommend the same discipline here — **fetch on demand via a
"Refresh" button, never automatic/on every page view** — but this is
Adarsh's call, not an assumption:

1. How many reels per page, per fetch — 20? 25? All of them?
2. Refresh on a button only, or also automatically re-check reels newer
   than N days (mirroring the 30-day incentive-claim watch window)?
3. Posts (the second actor) in the same round, or a later one?

## Build order when it starts

1. Migration: `page_reels` table + RLS (mirror `pages`' own: select-true,
   write owner/HR/`leads_content_marketing()`).
2. `fetch-page-reels` Edge Function.
3. The page detail screen + "Refresh" button, reachable from all three
   existing page lists.
4. Posts (`apify/instagram-post-scraper`), if Adarsh wants them — same
   shape, second table or a `kind` column on `page_reels`, his call.

## Why this was not built same-session (2026-09-22)

Cost, stated plainly to Adarsh: this session was already well past $75 by
the time this was asked for, on top of the full Clients/Pages/incentive
rework it had just shipped. He chose a fresh session over continuing here.
Nothing here is blocking anything live — the profile-fetch feature works
today: this is a genuine "next" feature, not a fix to something broken.
