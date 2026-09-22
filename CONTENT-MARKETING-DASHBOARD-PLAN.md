# Content & Marketing department system — the plan, not yet built

Adarsh's brief, 2026-09-22, given right after the incentive-claims feature
shipped (see INCENTIVE-PLAN.md — this builds directly on top of it, same
day). Nothing below is built. Read this file in full before starting; it
exists so a fresh session does not have to re-derive the brief or re-spend
what today's session already spent figuring out the shape.

## The bug that triggered this

Logged in as the test employee (socialwiire@gmail.com, Content and
Marketing department — renamed from "Social Media" this session, see
below), Member.tsx's Overview tab shows the Sales pipeline dashboard (My
leads / Connected / Follow-ups / Converted / My sales) — because that
screen was built when "everyone sits in Sales" and has no department
branching. Not cosmetic: a Content & Marketing person has no sales
pipeline, so every number reads 0 and the screen is actively wrong for
them, not just generic.

Fixing this properly IS the dashboard build below — a patch that hides the
Sales KPIs without replacing them with something real would be thrown away
the moment this ships, so it was not attempted separately.

## Rename, already done or in flight

"Social Media" → "**Content and Marketing**" — Adarsh's own words. Nothing
in the app code keys on the department NAME (only demo.ts's seed did,
already fixed and pushed, commit 207d99a). The real database rename is a
one-line UPDATE, handed to Adarsh separately from this file — check
`select name from departments` before assuming it is done.

## The shape (Adarsh's brief + my recommendation, not yet confirmed line by line)

**New entities:**
- **Clients** — the brands Metrol Media runs social accounts for. id, name,
  notes, active/retired (retire-not-delete, same reasoning as every other
  list in this app).
- **Pages** — one row per Instagram page. client_id, page_type
  ('main'/'fan' — reuse `IncentivePageType` from lib/hr.ts, do not invent a
  second enum), instagram_handle, label. A client can have one main page and
  several fan pages — "clients have multiple pages," Adarsh's own words.
- **Page assignments** — who manages which page. Many-to-many: one person
  can hold several pages, a page can have more than one person on it
  (Adarsh: "a lot of employees, a lot of fan pages... a lot of clients").

**incentive_claims changes:** today a claim carries a free-typed page_type
with no link to a real page or client. This should become a real
`page_id` foreign key once Pages exist — the claim then already knows its
client and handle, nothing to re-type. This is a genuine schema change to
a table built earlier today; do not bolt Pages on beside the free-text
field, replace it, and write the migration that backfills existing claims
sensibly (there are only the demo/test claims so far, so this is safe now
but will not stay that way).

**Employee's own dashboard** (replaces the Sales Overview for this
department, gated the same way IncentiveClaimModal.tsx already gates on
department — reuse that pattern, do not invent a second one):
- Their assigned pages (client, page type, handle)
- Their incentive claims: pending / this month's paid / total earned
- A prominent "Submit a reel" entry point (the existing IncentiveClaimModal,
  updated to pick a Page instead of typing page_type loose)
- Recent activity

**Department head's dashboard** — reuse `is_team_lead` (employees table,
0006), the exact mechanism this app already has for "manages a team,
still not a separate role." Do not invent a second admin tier.
- Every employee in the department + which pages each holds
- Every client + every page + who is assigned
- The department's claims at a glance — NOT the same screen as HR's
  company-wide Incentive claims review (HrPage.tsx); this is one
  department's own view, scoped to it
- Reassigning a page between people is likely wanted here — confirm with
  Adarsh before building, not assumed

**Deliberately out of scope for v1** (Adarsh: "later we add on the features
and all" — this is the floor, not the whole building):
- Per-page analytics or historical charts
- Client billing
- Multiple approval tiers beyond HR + department head

## Open questions for Adarsh before or during the build

1. Page assignment: can a page really have more than one employee, or is
   that describing "the department has several people, each with their own
   pages" rather than shared ownership? The UI differs a lot depending on
   which.
2. Department head dashboard: does reassigning a page belong there, or is
   that still an HR-only action?
3. Should Pages have their own "retired" state independent of the Client's?
   (A client stops using a fan page but keeps the main one.)

## Why this was not built same-session (2026-09-22)

Cost, stated plainly to Adarsh: today's session was already at ~$65 by the
time this was scoped, on top of shipping the full incentive-claims system.
He chose a fresh session over continuing here. Nothing here is time-
sensitive or blocking anything live — the site works today, this is a
genuine "next" feature, not a fix to something broken in production.
