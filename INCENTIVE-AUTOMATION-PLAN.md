# Incentive automation & employee-wise reel dashboards — the brief, not built yet

Adarsh's brief, 2026-09-23, given right after the page-reel dashboard (per-
reel views/likes/engagement, PAGE-ANALYTICS-DASHBOARD-PLAN.md) went fully
live and correct. Nothing below is built. Read this file in full before
starting — it exists so a fresh session does not re-derive the brief.

## Confirmed already working — do not re-build

**Every page already gets this dashboard automatically.** `PageDashboard`
takes a `pageId` and looks up whichever page was clicked — it is not
hand-wired per page. Any fan page, any main page, any client added in the
future, opens the exact same screen with real views/likes/comments/
engagement, the moment `fetch-page-reels` is refreshed once. Nothing here
needs building for "future pages" — that part of the ask is done.

## What's actually new, in his own words

1. **Automatic tier detection.** "When the reel reach 1 million automatically
   verify tick, and when it reach 10 million automatically verify tick and we
   get sent the proper incentives of that particular reel" — today, a claim
   only updates when an EMPLOYEE has already submitted that exact reel via
   "Submit a reel." A tracked reel that crosses 1M/10M with no claim behind it
   sits there unnoticed.
2. **Employee's own incentive dashboard, filterable.** Which of their reels
   qualified, filterable by tier (1M+/10M+) — this already exists in miniature
   (the Claims tab + the two clickable KPI tiles on a page's dashboard), but
   he is asking for it pulled together as its own filterable view.
3. **Work-tracking, separate from incentives.** "How many reels they are
   posting on fan pages or main pages" — a productivity number, not a money
   number. An employee may post reels that never cross a threshold; HR still
   wants to see the volume.
4. **HR and department-head rollup dashboards, employee-wise.** For each
   employee: which pages, how many reels posted, total views, how many
   crossed 1M/10M — a chart per employee, not just per page.
5. **Automatic refresh — "without clicking refresh."** Views should update on
   their own, and crossing 1M/10M should notify someone, not wait for a human
   to open the page and press a button.

## The one real technical constraint, already hit once in this project

**This Supabase plan has no cron.** The exact same wall stopped the shift-end
attendance reminder from ever being built as anything but a screen-load
check (see CLAUDE.md's "Notifications, built" round, 2026-09-18) — a plain
`useEffect` firing once per mount is how this app fakes a scheduled job
everywhere else it needs one (`finalize_open_attendance()`,
`check_todays_birthdays()`). The three real options, unchanged from that
round:

- a free external cron service pinging an Edge Function on a schedule;
- Vercel Cron (needs a paid plan for anything more frequent than once a day);
- a screen-load check, which only runs when somebody happens to have the app
  open — the honest, weakest option, but the only free one.

**Whichever is picked, refresh cadence must be deliberate, not continuous.**
Apify bills per run — INCENTIVE-PLAN.md already made this exact call once
("batching the re-check to once a day per reel... keeps it sane"). The same
discipline applies here: once a day per page, not on every page load, is the
recommended default. Adarsh's call, not assumed.

## The one real design decision — needs his answer, not a guess

**When a tracked reel (not a submitted claim) crosses 1M/10M, does the system
create a real claim automatically, or just flag it as "eligible" for
someone to convert?**

- Auto-create is closer to what he described ("we get sent the proper
  incentives... automatically"), but a page can have MORE THAN ONE person
  assigned to it (confirmed, 2026-09-22) — an auto-created claim needs to
  know WHO earned it, and "whoever manages this page" is not always one
  answer.
- Flag-only (a badge on the page dashboard: "3 reels newly qualified, nobody
  has claimed them") keeps a human in the loop for exactly the case above,
  at the cost of the "fully automatic" framing.

**Recommendation: flag-only for v1.** It solves the actual pain — nobody
misses a reel that crossed a threshold — without inventing a rule for
multi-assignee attribution that hasn't been asked for yet. Auto-create can
follow once single-assignee pages are the common case, or once he says how
a shared page should split.

## The shape (a recommendation, not yet confirmed line by line)

**1. Tier-crossing detection, riding the existing refresh.** `fetch-page-
reels` already knows every reel's views on each run. Add: compare against
the PREVIOUS stored value for that `short_code`; if it just crossed 1M or
10M and has no `incentive_claims` row for that `reel_url`, write a row to
a new `page_reel_alerts` table (page_id, short_code, tier, views_at_alert,
created_at) instead of a claim. This is the "flag," not an auto-claim.

**2. Employee incentive dashboard.** A new tab or section on the employee's
own "Claims" view: every reel across every page THEY are assigned to,
whether claimed or not, with a tier badge and a one-click "Claim this" that
pre-fills the existing Submit-a-reel form from the alert.

**3. HR / department-head rollup — one new screen, reused the same way
`ClientsPagesSection`/`PageDashboard` already are.** Per employee: pages
held, reels posted (from `page_reels` joined through `page_assignments`),
total views, tier counts. A department-wide version sums it. No new
Instagram data needed — this is aggregation over what's already fetched.

**4. Scheduled refresh + notification.** Once the cadence and the cron
mechanism are chosen: a job that refreshes every active page once a day,
and calls the EXISTING notification system (`notifications` table,
`send-push`, already built and live since 2026-09-18 — no new
infrastructure) when a reel crosses a tier for the first time.

## Build order when it starts

1. `page_reel_alerts` table + the crossing-detection logic added to
   `fetch-page-reels`.
2. Employee's own filterable incentive view (uses data already fetched).
3. HR / department-head employee-wise rollup screen.
4. The scheduled trigger + push notification wiring — last, because it
   depends on Adarsh's answer on cron mechanism and refresh cadence, and it
   is the one piece that adds ongoing Apify cost per page per day rather
   than cost only when someone clicks a button.

## Why this was not built same-session (2026-09-23)

Cost, stated plainly: this session was already at $198+ when this was
asked for, on top of the full reel-analytics dashboard (including two
real Apify data-shape bugs) it had just finished. This is genuinely a
second project — automatic detection, two new rollup dashboards, and a
scheduling decision this app has hit and solved once before, just not for
this data. Recommended for a fresh session; nothing here blocks anything
already live.
