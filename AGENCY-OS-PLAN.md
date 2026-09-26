# Agency OS — the plan (Phase 1 BUILT 2026-09-26; Phase 2 APPROVED 2026-09-26 — Rounds 1–3 BUILT, 0043 and 0044 installed, 0045 not yet)

Brief, 2026-09-24. There are three inputs:
- HR's 7-page "Integrated Digital Marketing Agency Software Blueprint"
  (`~/Desktop/Integrated_Digital_Marketing_Agency_Software_Blueprint.pdf`).
- Adarsh's screenshots of the Google Sheets Metrol runs today: "Client Master
  Sheet" and "LavBhusan Target".
- His workflow notes.

**Phase 1 is built and deployed; its SQL (0035–0037) waits to be run** — see
CLAUDE.md, "Agency OS Phase 1 — built", for what shipped, the judgement calls
and what was verified. Phases 2–4 below are not built. Read CLAUDE.md, CONTENT-MARKETING-DASHBOARD-PLAN.md,
INCENTIVE-AUTOMATION-PLAN.md and PAGE-ANALYTICS-DASHBOARD-PLAN.md first. This plan
builds on all of them and replaces none.

## 1. The shape, in one paragraph

The blueprint's golden rule is that each department's finished work becomes the
next department's starting point. In data terms that is one chain:
**Client → Page/Service → Content item → Shoot → Raw data → Edit version → SMM
approval → Client approval → Post → Performance.**

This app already has both ends of the chain:
- **Start:** Clients and Pages.
- **End:** `page_reels`, the incentive claims, and the by-link view lookup shipped
  2026-09-24.
- **Beside it:** a complete HR module.

The plan fills in the middle with ONE workflow engine whose stages, owners and
hand-offs are rows in tables, not code. Before that, it replaces the Google
Sheets with a per-client target and weekly-views tracker, because that is what
Metrol uses every day.

Three rules hold in every phase:
- **Nothing Metrol might rename or reorder is code.** That covers departments,
  roles, who-assigns-whom, workflow stages, task statuses, adjustment types, page
  statuses, targets and splits. They are all rows that management or HR edit on
  screen.
- **Reuse before adding.** §2 lists what is reused, piece by piece.
- **THE LAYOUT LAW and demo fixtures for every new screen,** as in every round so
  far.

## 2. The blueprint mapped onto what already exists

| Blueprint area | Already built | Plan |
|---|---|---|
| Organization | `departments` (HR edits them), `company_settings`, `employees.reporting_to` (the reporting line), `profiles.is_team_lead` | Reuse. Department head becomes a real role (§4), not a flag matched by department name |
| Users, roles, permissions | `profiles.role` = owner/member. `is_hr()` and `leads_content_marketing()` match department **names**. Edge Functions re-derive the same checks by hand | Replace with editable roles and capabilities (§4). This is the one real foundation gap |
| Sales CRM | `projects`, `leads` (5 fixed statuses), `events` history, CSV import, assignment | Keep. Stages become editable in Phase 3; the "Deal won → client" hook depends on Q12 |
| Clients and projects | `clients` (name, notes, active), `pages` (main/fan, Instagram handle), `page_assignments` | Extend in Phase 1: Client ID, contacts, links, YouTube/Facebook channels, page status |
| Content & Marketing | Incentive rules/claims/payouts, page dashboards, the department head's Manage team tab | Keep. Claims join content items by the reel's short code (Phase 2) |
| Production, post-production, posting | — | New in Phase 2: content items and the workflow engine, shoots, edit versions, reviews |
| Organic performance | `page_reels` (Apify; only a page's newest 25, older ones pruned). `fetch-page-reels` `claimIds` mode looks any post up by its own link | Reuse the by-link lookup for posted content. The weekly views tracker is new (Phase 1) |
| Performance marketing | — | Phase 3 |
| HR | Employees, attendance, leave, payroll, onboarding, exit, documents, `/apply` job applications | Reuse. Recruitment stages and assets are Phase 3 additions |
| Admin (assets, equipment) | — | Phase 3 |
| Notifications | `notifications`, `push_subscriptions`, `send-push`, `notify-approvers` | Reuse for every hand-off. Widen the type CHECK per new type, as 0031 did |
| Files | Supabase Storage for documents and photos | Screenshots and proofs go to Storage, using the joining form's shrink-before-upload pattern. Video stays where it lives today, stored as **links** (Q14); raw footage in Storage would be expensive |
| Client portal | — | Phase 3 |

## 3. Phase 1 data model — replacing the Google Sheets

### 3.1 Client master (migration 0036)

- **`clients` gains:**
  - `code`: the Client ID, e.g. `MM-0001`. Comes from a sequence and is never
    reused.
  - `company`, `industry`, `contact_name`, `contact_phone`, `contact_email`.
  - `started_on`, `ends_on`.
  - `status_id`, pointing at an editable `client_statuses` list.
- **`client_financials`** (client_id, monthly_value, payment_status, notes). This
  is a **separate table on purpose.** RLS works per row, not per column. If money
  sat on `clients`, every SMM and editor who can read a client would also read its
  value. Only the people Q10 names get this table.
- **`client_links`** (client_id, label, url). Holds the sheet's Podcast link,
  Drive folders, brand guidelines, and any other link under any label.
- **`page_channels`** (page_id, platform, handle, url, is_active).
  - Platform is `instagram`, `youtube` or `facebook`.
  - The Client Master puts an Instagram page AND a YouTube channel on one numbered
    fan page, so one page can carry several platforms.
  - Backfilled from `pages.instagram_handle`. `fetch-page-reels`, the claims
    Username column and the profile fetch then switch to reading the channel.
    `pages.instagram_handle` is dropped at the end of the phase, so there is one
    source of truth.
- **`page_statuses`** (name, color, sort) plus `pages.status_id`. These are the
  sheet's red and orange rows (Q6), as an editable list.

Two deliberate exceptions to "nothing hard-coded", both explained:
- **Platforms stay a fixed list in code.** Adding one needs code anyway, for link
  parsing and lookups.
- **Main vs fan stays the two fixed page types.** They are the blueprint's own two
  service segments, and the live incentive rules are wired to them. If a third
  kind ever appears, they can become a `page_types` table with `incentive_rules`
  pointing at it.

### 3.2 Targets, splits, weekly views, adjustments (0037)

Built to match both sheets column for column.

- **`view_targets`**: client_id, label (e.g. "FY 2026-27"), total_views (e.g.
  750M), starts_on, ends_on. It also records what counts toward the target:
  `count_main`, `count_fan`, and `platforms[]` (Q2).
- **`view_target_periods`**: target_id, label (e.g. "Apr–Jun"), starts_on,
  ends_on, `share_pct` (20/30/50) and an optional `target_views` override.
  - The effective target is the override if set, otherwise total × pct.
  - Both are stored because LavBhushan's sheet reads "30% = 400M" of a 1000M
    target, and 30% would be 300M (Q3). Keeping both makes either reading visible
    instead of one silently winning.
- **`weekly_views`**: channel_id, `week_start`, views, followers, `proof_path`,
  entered_by/at, updated_by/at. Unique on (channel_id, week_start).
  - `week_start` is a Monday. The sheet's weeks run Monday–Sunday: 27 Apr – 3 May
    2026 starts on a Monday.
  - `followers` is optional. LavBhushan's sheet tracks followers/subs, and
    Instagram follower counts can be auto-filled from the start, because
    `fetch-instagram-profile` already returns them.
  - `proof_path` is the sheet's SS column: a screenshot in a private Storage
    bucket.
  - Edits are audited in `weekly_view_edits`, the same shape as `attendance_edits`
    (0013).
- **`view_adjustment_types`**: an editable list, seeded with the three in the
  sheet (Q5):
  - "Difference due to technical issue"
  - "Collaboration views"
  - "Suspended account views"
- **`view_adjustments`**: target_id, period_id, optional week_start, type_id,
  views, note, created_by/at.
  - Views are signed, since suspended-account views go negative.
  - The note carries entries like "jyotidrishti views, zone, Lavbhushanworld
    views".
- **`v_target_progress`**: a `security_invoker` view (so RLS still applies). For
  each target, period and week it gives:
  - target
  - achieved: counted channels' weekly views plus adjustments
  - left, and the running balance
  - the main/fan and Instagram/YouTube splits
  - pace: share of the period elapsed vs share of the target achieved

  Nothing is stored twice; the grid and every dashboard read these same numbers.

A week that straddles two periods (e.g. 29 Jun – 5 Jul) counts in the period where
it **starts**, unless Q4 says to split by day.

### 3.3 Client team — the assignment chain (0036)

- **`client_assignments`**: client_id, employee_id, role_id, assigned_by,
  assigned_at, ended_at.
  - The role comes from the editable roles list: SMM, Editor, DOP, Account
    manager, and so on.
  - History is kept: a row gets `ended_at` instead of being deleted. Unlike
    `page_assignments`, this answers "who was on this client in May", for targets
    and attribution.
- **Who may assign whom is data:** each role has an `assigned_by_role_id`.
  - Seeded chain: Department head → SMM, and SMM → Editor.
  - The insert rule allows a new assignment if the caller either holds
    `assign_team` for the client's department (the head, management), or is
    currently on THIS client in the role that assigns the new role.
  - So an SMM can add editors to their own clients and nobody else's. Changing the
    chain means editing a role, not the code.
- **`page_assignments` stays.** It already decides who may claim a page's reels.
  Assigning a page to someone who isn't on the client's team offers to add them as
  SMM, so the two lists can't drift apart.
- **Seeding:** everyone holding a page today becomes SMM on that page's client.

## 4. Roles & permissions (0035)

What exists today:
- Helpers: `is_owner()`, `is_hr()` (department NAME = 'Human Resources'),
  `leads_content_marketing()` (team lead of the department NAMED 'Content and
  Marketing'), `leads_a_team()`, `my_employee_id()`.
- Edge Functions that repeat the same checks by hand.

Renaming a department silently changes who counts as HR. That is the "hard-coded"
Adarsh wants gone.

- **`roles`**: name, optional department_id, `client_scoped`, `assigned_by_role_id`,
  sort, is_active.
  - `client_scoped` means the role is held per client (SMM, Editor) rather than
    globally (HR, Management).
  - Seeded from the blueprint's §23 (Q9): Super Admin, Management, Department
    Head, Sales, SMM, Editor, DOP/Production, Performance Marketing, HR, Admin,
    Client.
- **`role_capabilities`**: a role_id plus a capability.
  - Capabilities are a short fixed list in code, because the app has to know what
    each one means: `view_all_clients`, `manage_clients`, `see_client_money`,
    `manage_targets`, `enter_views`, `assign_team`, `manage_workflows`,
    `view_all_work`, `approve_incentives`, `manage_hr`, `manage_payroll`,
    `manage_assets`, `manage_settings`.
  - WHICH role holds WHICH capability is data. Management edits it on a Settings
    screen.
- **`employee_roles`**: employee_id plus a global role, with a department for
  "Head of X".
- **SQL helpers:** `has_capability(cap)`, `has_capability_for_client(client_id,
  cap)`, `is_on_client(client_id)`.
  - Security definer with a pinned search_path, the same pattern as 0001's.
  - Every new table's RLS is written against them.
  - Edge Functions call them as the caller instead of mirroring the rules by hand.
- **The live rules migrate gradually, table by table, never all at once.**
  1. The seed reproduces today's access exactly.
  2. `is_hr()` and `leads_content_marketing()` are rewritten ON TOP of the new
     tables, so their callers don't change.
  3. They are retired later.

  Every step ends with proof queries, as usual.

Phase 1 access, in plain terms (defaults, pending Q10):

| Who | Clients & teams | Targets | Weekly views | Client money |
|---|---|---|---|---|
| Owner / Management | all | edit | edit | yes |
| Content & Marketing head | all in the department | edit | edit | Q10 |
| SMM | clients they're on | read | enter for their own pages | no |
| Editor | clients they're on | Q10 | read | no |
| HR | read + edit | edit (0038 — HR runs Clients) | edit | no |

## 5. Phase 2 — the workflow engine (the golden rule)

One engine, configured in tables, used by every department.

- **`workflows`** (e.g. "Fan page reel", "Main page reel", each tied to a page
  type) and **`workflow_stages`** (workflow_id, name, sort, `owner_role_id`,
  `is_review`, `client_visible`, `is_done`, color, optional SLA hours).
  - `owner_role_id` is who acts at that stage.
  - Seeded from the blueprint's §7–9 and §17: Idea → Scripting → Script ready →
    Shoot → Raw data → Editing → SMM review → Client review → Approved → Scheduled
    → Posted. Metrol may skip some stages for fan pages (Q15).
- **`content_items`** is the spine: code (C-00001), client_id, page_id,
  workflow_id, stage_id, title/idea, format (editable list), script (text or doc
  link), shoot_id, planned_post_on, due_at, posted_url, `post_short_code`,
  posted_at.
- **`content_item_assignees`** (item, role, employee). Defaults to whoever holds
  that role on the client's team (§3.3), and can be overridden per item.
- **The hand-off rule — the golden rule as one trigger:**
  1. When an item enters a stage, the system creates a task for whoever holds that
     stage's owner role on the item.
  2. It notifies them through the existing notifications and push.
  3. Finishing the task moves the item to the next stage, which creates the next
     person's task.

  Stages, owners and their order are all rows. Nothing about "Editing comes after
  Shoot" lives in code.
- **`tasks`**, also usable on their own, since not every task is a reel:
  - Fields: code, client, content item and stage (both optional), department,
    title, assignee, created_by, priority, due_at, status, depends_on,
    completed_at.
  - Status comes from an editable `task_statuses` list. The blueprint's default:
    Not started → In progress → Pending review → Revision → Approved → Completed.
  - `task_comments` has an `internal` flag; the client portal never shows internal
    comments.
  - `task_events` is the activity history, the same idea as `events` for leads.
- **Deadline crossed → notify the reporting manager.** `employees.reporting_to`
  already exists.
- **`content_versions`**: V1, V2, and so on, never deleted. Each stores a link to
  the file (Drive, Frame.io) plus uploader, time and note.
- **`content_reviews`**: version, reviewer (SMM or client), approve or request
  changes, reason, comment. Also a timestamp in seconds, for feedback like "at
  0:14, cut this".
- **`shoots`** (code S-0001, client, date, location, DOP, SMM, brief, status,
  raw-footage folder link, equipment note) and **`shoot_items`** (which content
  items the shoot covers). Marking a shoot completed moves every linked item on and
  notifies its SMM.
- **Posting closes the loop:**
  1. The SMM pastes the post URL.
  2. Its short code (`reelShortCode()`, already in lib/hr.ts) matches the item to
     `page_reels`, to any `incentive_claims` on the same reel, and to the by-link
     view lookup.
  3. A posted item then has live performance without anyone typing numbers.
- **The master view Adarsh asked for** ("who submitted it, who was assigned, where
  it is in the workflow"):
  - One table of every reel, joined on the short code: client, page, stage,
    SMM/editor, due date, overdue flag, who claimed it, views, tier.
  - A first version ships at the end of Phase 1 from what already exists (claims,
    pages, client team). Phase 2 adds the stage column.

Giving `incentive_claims` a `short_code` column also allows a unique rule so one
reel can't be paid twice. Today nothing stops a duplicate claim. That rule waits
on Q16.

## 6. Build order

A round is roughly one focused session; the counts below are rough sizes, not
promises. Daily use comes first.

**Phase 0 — done 2026-09-24.** Claim views are fetched on submit, and a Check
views button fixes claims that were stuck (see CLAUDE.md). Still open: Q17.

**Phase 1 — Foundation and the sheets replacement — BUILT 2026-09-26 (all four steps):**
1. **Roles & capabilities (0035).** Tables, helpers, and seeds that reproduce
   today's access exactly. A Settings screen for roles, capabilities and
   who-assigns-whom. Nothing changes for anyone yet; proof queries only.
2. **Client master and client team (0036).**
   - Client ID, contacts, links, Instagram/YouTube/Facebook channels, page
     statuses, `client_financials`.
   - A Clients list and a client page header.
   - Team assignment with the chain from §3.3.
3. **Targets tracker (0037).**
   - Targets, periods, weekly entries with screenshots, adjustments, and the
     progress view.
   - The client page's weekly grid: pages × platforms × weeks, with adjustment
     rows under it, like the sheet.
   - A "This week" screen for each SMM: every channel they hold, with one input
     and one screenshot button each.
   - A Monday reminder.
4. **Import the sheets.**
   1. Adarsh exports each client's tab as CSV.
   2. A one-time SQL script loads the history.
   3. The script is checked against the sheet's own Achieved and Left totals.

   The reel master view v1 ships at the end of this round.

Option, if speed matters more than order: step 3 can ship before step 1, on
today's helpers. It then needs one extra migration pass to move onto
capabilities.

**Phase 2 — Core agency workflow (about 4–5 rounds):**
1. Workflow tables and their Settings screen.
2. Content items, the hand-off trigger, tasks and notifications.
3. Edit versions and SMM review.
4. Shoots and raw-data links.
5. Posting with auto-match, and the master view with stages.

Client approval is recorded internally (the SMM marks "client approved") until the
portal exists.

**Phase 3 — Wider departments (about 4 rounds, ordered by Metrol's need):**
- Sales stages made editable, and Deal won → an onboarding checklist → client
  created (Q12). The checklist reuses HR's `onboarding_tasks` pattern.
- Client portal: client logins, approvals and reports. RLS limits each client to
  their own client-visible stages (Q13).
- Performance-marketing campaigns.
- Admin assets and equipment, with statuses Available, Assigned, Under
  maintenance, Damaged and Lost.
- Recruitment stages on top of `/apply`.

**Phase 4 — Automation & intelligence:**
- Scheduled refresh and tier alerts (INCENTIVE-AUTOMATION-PLAN.md).
- Automatic weekly views, which is what removes manual entry if Q1 says the
  number comes from Insights:
  - **YouTube:** could come early. Channel totals are public through the free
    YouTube Data API key, so weekly views = this Monday's total − last Monday's.
  - **Instagram:** account-level views need the official Graph API on pages
    Metrol controls, which requires Meta app review.
- Client report PDFs.
- Deadline-risk and workload alerts.
- AI content suggestions.

INCENTIVE-AUTOMATION-PLAN.md records that "this Supabase plan has no cron".
Nothing in Phases 1–2 needs a scheduler, because people enter weekly views and
stage changes. Scheduling first matters in Phase 4.

## 7. Questions only Adarsh / HR can answer

**Right now (it affects money already):**
17. Open one claimed reel in the Instagram app. Does its view count match ours,
    or is ours several times smaller? Apify returns two different "views"
    numbers; see CLAUDE.md.

**Blocking Phase 1:**
1. Where does each week's views number come from? The Instagram/YouTube Insights
   "last 7 days" screen (hence the screenshot), or something else? Per page, per
   platform?
2. What counts toward a client's target: Instagram + YouTube (+ Facebook)? Main
   pages AND fan pages? (LavBhushan's sheet counts both; the Client Master shows
   fan pages.)
3. LavBhushan's sheet says "30% = 400M" of a 1000M target, but 30% would be 300M.
   Which is right? Is a period always a % of the total, or can it have its own
   number?
4. A week that crosses two quarters (e.g. 29 Jun – 5 Jul): does it count in the
   quarter where it starts, or split by day?
5. Adjustments: are "technical issue difference", "collaboration views" and
   "suspended account views" the full list? Who may add one — only the department
   head and management?
6. What do the red and orange page colours in the Client Master mean?
7. Who enters the weekly numbers today — each SMM for their own pages, or one
   person? By when, e.g. every Monday?
8. Is an editor tied to a client (as the sheet lists them), assigned per reel, or
   both?
9. Is this the full list of roles: SMM, Editor, DOP, Scriptwriter, Performance
   marketer, Sales, HR, Admin, Management, Department head? Anyone missing, e.g.
   graphic designer or account manager?
10. Who may see a client's money (monthly value, payment status)? Can SMMs and
    editors see its view targets?
11. Do all clients run April–March with quarterly splits, or does each client get
    its own periods?

**Needed before Phases 2–3:**
12. Today's Leads/Projects module: is it Metrol's OWN sales (winning new clients),
    or calling leads on behalf of clients?
13. Client portal: wanted, or do clients approve on WhatsApp and should stay
    there?
14. Where do raw footage and edits live today (Google Drive? whose account?), and
    roughly how big is one shoot?
15. Fan pages vs main pages: are the blueprint's stages right, or does Metrol skip
    some (e.g. client approval on fan pages)?
16. If two people claim the same reel, who should get it?

## 8. Deliberately not in this plan

- **Invoicing and GST.** The blueprint only names "finance" in its Phase 3 list;
  not scoped until asked.
- **Uploading video into the app.** Video is stored as links, for cost, unless
  Q14's answer changes that.
- **Anything in INCENTIVE-AUTOMATION-PLAN.md.** Unchanged; it slots into Phase 4.
  Its employee-wise rollups get better once content items record who made each
  reel.

**Phase 1 built. Phase 2 APPROVED by Adarsh on 2026-09-26** — see §9.

## 9. Phase 2 — approved 2026-09-26: the build, round by round

Adarsh, on the live Dashboard: *"develop the second phase — I want to see the whole
thing, proper tabs, navigation and options, categorised, easy to maintain and
understand, the flow built end to end."* He expected the blueprint's daily flow
and saw only Phase 1 (the sheets). Each round ends deployed, demo-verified at 375 px
and desktop, SQL tested in the local kit, and handed over as pbcopy commands.
THE ACCESS RULE applies throughout: owner AND HR get everything (`is_owner_level()`,
`isOwnerLevel(ws)`, every new capability ticked on HR).

**Round 1 — navigation that explains the app, and the workflow settings.** BUILT 2026-09-26
(a1390bc + walk-through fixes; CLAUDE.md "Phase 2, Round 1"). 0043 installed on live 2026-09-26.
- Regroup the owner/HR rail (and the phone's Profile rows) into labelled groups
  instead of one flat list: *People* (Employees, Attendance, Salary, Joining & Exit,
  Departments) · *Clients & content* (Clients, Content, Tasks, Shoots, Reels) ·
  *Sales* (Projects) · *Settings* (Roles & access, Workflows & lists, Company,
  Terms). Screens not built yet do not appear — no dead buttons.
- Migration: `workflows`, `workflow_stages` (name, sort, owner_role_id, is_review,
  client_visible, is_done, colour, sla_hours), `task_statuses`, `content_formats`
  — all editable lists; seeded from the blueprint (§5).
- Settings → Workflows: stages as rows, drag to reorder, owner role per stage.

**Round 2 — content items, the hand-off, tasks (the heart of it).** BUILT 2026-09-26
(2f3cef8 + walk-through fixes; CLAUDE.md "Phase 2, Round 2"). 0044 installed on live 2026-09-26.
- `content_items` (C-00001, client, page, workflow, stage, title, format, script /
  doc link, planned post date, due), `content_item_assignees`.
- The golden-rule trigger: entering a stage creates a task for whoever holds the
  stage's owner role on the client's team; notification + push; finishing the task
  moves the item on.
- `tasks` (T-00001; also usable alone), `task_comments` (internal flag),
  `task_events`. **My tasks** for everyone (Member screen too). Overdue → the
  reporting manager is notified (screen-load tick, like birthdays).
- Client page gains a **Content** tab: a board by stage + a list.

**Round 3 — versions and reviews.** BUILT 2026-09-26 (9f1330e; CLAUDE.md "Phase 2,
Round 3"). 0045 NOT yet installed. `content_versions` (V1, V2… as links),
`content_reviews` (approve / request changes, a note at a timestamp, e.g. "0:14").
The SMM-review stage gets its screen; "client approved" is recorded internally.
- As built: a Versions panel in the task and item modals. At Editing the link box
  is open; at a review stage the holder decides — Approve moves the reel on, Ask for
  changes sends it back (to Editing unless another earlier stage is picked) and the
  editor who cut the last version gets the task, the notes leading it. At Client
  review the same box records the client's answer. Cards show "V2" / "V1 ↺".

**Round 4 — shoots.** `shoots` (S-0001: client, date, place, DOP, SMM, brief,
raw-footage link), `shoot_items`. Completing a shoot moves every linked item on
and notifies its SMM. A Shoots list + calendar.

**Round 5 — posting closes the loop.** The SMM pastes the post link → short code →
matched to page_reels, claims and the by-link views; the Reels master view gains
the Stage column; one reel cannot be claimed twice (Q16 default below).

**Defaults used unless Adarsh says otherwise** (each one is data, changeable on
screen):
- Q15: main pages use every blueprint stage; fan pages skip Client review.
- Q14: footage and edits stay where they are, stored as links (no video uploads).
- Q13: no client portal yet; client approval is recorded by the SMM.
- Q16: the first claim on a reel wins; a second claim is flagged for HR.
- Q12: the Leads/Projects module is not touched by Phase 2.
