# Metrol Media CRM — project context

**Read this file first.** It carries everything from the previous session so you can continue without that chat history.

## What this is

An in-house CRM for **Metrol Media** (metrol.in) — the company Adarsh works at. Not a SaaS product, not part of the Nevorai family. One company, one team, internal use only.

Adarsh is the developer/owner of this build. He is **non-technical-leaning** — always end replies with a plain-language numbered **"WHAT YOU DO NEXT"** section. He is also **cost-conscious about Claude usage**: batch your checks, don't iterate one query at a time, don't re-derive things this file already answers.

## The quality bar (stated by the client-facing side)

> "It should not look childish, incomplete, or have bad UI/UX. Give them more than they expect. But maintain a minimalistic approach — do not include unnecessary features which they did not ask for. If they later ask, we can build that."

So: **spend effort on polish and smoothness, not on extra modules.** No feature creep. When tempted to add something, don't — note it instead.

## Current state

- **`design/metrol-crm-prototype.html`** — a single-file clickable prototype covering all 5 screens. This is the design source of truth. It is **not** the app; no real code is scaffolded yet.
- **Current Artifact: https://claude.ai/code/artifact/ba33a3c3-1d12-4f96-91bf-985da26362a9**
  Publish with `url` set to that to keep the link. Publishing without `url` from a
  new conversation creates a *separate* artifact.
- **The original artifact (6cf4afe7-4d07-4b9e-8619-175b16c13949) is stranded.**
  It was published from a different Claude account. From this account it reads back
  as "not found", so it cannot be republished to and the link the client may already
  hold will never update. Either re-send the new link, or redo a publish from the
  account that owns the old one.
- Verified working, re-tested in Chromium after the changes below: column resize
  (drag, drag that leaves the handle, double-click reset, 64px min clamp), live KPI
  recalculation, assign modal, status+quality dropdowns, convert→record-sale→owner-
  sees-it flow, light/dark in all three states, mobile at 390px with no page-level
  horizontal scroll.

### How to preview it locally

The file has no `<!doctype>/<html>/<body>` wrapper (the Artifact host adds those). To test in a browser, wrap a copy **inside the current project folder** or the preview pane renders it as a dead static snapshot:

```bash
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n'; cat design/metrol-crm-prototype.html; printf '\n</body></html>\n'; } > .preview.html
```

Then open `file:///Users/apple/metrol-crm/.preview.html` in the Browser pane. Delete `.preview.html` when done. Note: `.workspace` has `scroll-behavior:smooth` — set it to `auto` before measuring element positions in tests, or you'll measure mid-animation.

## Stack decisions (settled — don't relitigate)

- **Not Lovable.** Hand-coded here.
- **Supabase** — Postgres + Auth + Row Level Security. RLS does permissions in the database: a salesperson can only read/edit leads assigned to them; owner sees everything.
- **Frontend hosting: Vercel or Cloudflare Pages** (free tier), not Render. Render only if a persistent Node service is ever needed beyond Supabase Edge Functions.
- Planned tables: `profiles` (role: owner|member), `projects`, `project_members`, `leads`, and sales stored as converted leads (amount, verified, converted_by, closed date).
- Running cost target: **₹0** on free tiers.

## The original brief

- **metrol.in** = a simple one-page gate. Logo, short description, sign in. Not a marketing site.
- **Two roles only:** owner, and team member (salesperson). Email + password each.
- **Owner:** sees project cards → clicks one → that project's dashboard.
- **Project dashboard sections, in this order:** KPI row (total leads / connected / follow-up / customers / gross sale) → **Leads** → **Sales** → **Team tracking** → **Sales dashboard** (today / this week / month / year). Sidebar scroll-spies between them.
- **Leads columns:** S.No, name, email, phone, connected, status, quality, assigned-to (+ assign popup).
- **Quality** = Good / Average / Bad — green / yellow / red. Set by the salesperson.
- **Status** = New / Connected / Follow-up / Converted / Dead.
- **Sales:** customer, amount, payment verified or not, who converted it.
- **Salesperson dashboard:** only their assigned leads, a new-lead notification, update status + quality, convert.
- **Must work on mobile**, though the manager uses a MacBook.
- **Emphasized hardest: Excel-like resizable columns that feel smooth.** Never regress this.

## Interpretation decisions already made (client has NOT confirmed these yet)

1. **Team tracking = one row per salesperson** (a leaderboard). The brief mixed "date, client name" with per-member totals; those are two different tables.
2. **"Connected" is calculated from Status**, not typed separately — avoids double data entry.
3. **Dead leads render grey, not red**, so red only ever means "bad quality".
4. **Row height → a Compact/Comfortable density switch**, instead of dragging individual rows taller.
5. **Converting a lead prompts for the amount and creates the Sales row.** This is what links Leads to Sales; owner then verifies payment.
6. Added a **Closed date** column to Sales and a **last-7-days bar chart** to the Sales dashboard.
7. **Landing page copy and logo are placeholder** — real ones not supplied yet.

## Open questions for the client (still unanswered)

1. **Where do leads come from?** Manual entry / CSV upload / Meta lead-form webhook? Adarsh runs their Meta ads, so likely Meta. **This changes the data model — get the answer before scaffolding the real app.**
2. Real logo file + a real paragraph describing Metrol Media.
3. Team tracking says "number of calls connected" — currently counts *leads* connected. True per-call counts need a "log call" button. Wanted or not?
4. Does Gross Sale include unverified payments? (Currently yes, with pending shown separately.)

---

# DONE — the four requested changes (2026-09-04)

All four are built, browser-tested and published. Kept for reference; the notes
under each one record the judgement calls, which the client has not yet seen.

## 1. Rebrand to the Metrol Media palette (black / white / yellow)

Metrol Media's brand colours are **black, white, and yellow**. Replace the blue accent (`--accent:#1E4FD8` / `#6E99FF`) throughout.

- **Premium black-and-white base**, with **yellow as the highlight colour** — active sidebar item, focus rings, selected states, the accented KPI rule.
- **Neutrals should be true black/white/grey**, not the current blue-tinted greys.
- **Contrast warning:** yellow text on white fails legibility. Use yellow as a *fill* with black text on top, never as small text on a light ground. Suggested: `#F5C518`-ish. In dark mode a slightly warmer/brighter yellow reads better on black.
- **Primary buttons:** black with white text in light mode, white/near-white with black text in dark mode. Reserve yellow for active/highlight states so it stays meaningful.
- **Keep the semantic colours as they are** — green / amber / red for status and quality chips. Adarsh explicitly said these stay.

## 2. Projects screen — smaller cards + a list view

- Cards are currently too wide. Show **3 per row** on desktop so they read as a scannable grid, not one project per horizontal band.
- Add a **Cards / List toggle**.
- **List view** = a proper table: serial number, project thumbnail, project name, description, leads, customers, gross sale, status. Clicking a row opens the project.
- Support an optional **project photo/preview image**, shown in both card and list view, with a sensible placeholder when a project has none.

## 3. Two sidebars inside a project (the big structural change)

Right now, switching projects means going back to the home screen. Instead:

- **Sidebar 1 — projects.** Lists all the owner's projects so they can jump straight between them. Recommend a narrow **icon rail (~64px)** of project monograms with names on hover, plus an "All projects" entry at the top — this preserves horizontal room for the data grid, which matters because the leads table is ~1144px wide. If Adarsh prefers full names visible, widen it to ~200px instead.
- **Sidebar 2 — sections within the current project:** Overview, Leads, Sales, Team tracking, Sales dashboard. This is the existing scroll-spy nav; keep that behaviour.
- On mobile both must collapse — projects into a topbar dropdown, sections into the existing horizontal chip strip.

## 4. Light/dark mode toggle as a real product control

Currently the theme switch only lives in the black "Prototype" panel. Add a proper **sun/moon toggle button in the app topbar**, and persist the choice to `localStorage` (wrap reads/writes in try/catch — it throws in some contexts). Keep all three theme states working: explicit light, explicit dark, and unstamped "follow the device".

---

# How those four were actually built

## Palette

Two tokens were added because the brief's contrast rule needs them:

- `--accent-ink` — the yellow darkened until it is legible **as text** (`#7A5A00`
  light, and the plain bright yellow on dark, where yellow-on-black is already
  fine). Everywhere the old design used `color:var(--accent)` on a light ground —
  active sidebar count, banner title, menu tick, assign-button hover — now uses
  this. `--accent` itself is only ever a fill.
- `--pri` / `--pri-hover` / `--pri-on` — the primary button, black-on-light and
  near-white-on-dark, so yellow is not spent on the most common button.

Two judgement calls worth confirming with Adarsh:

1. **`.chip--accent` ("Connected", and the Connected Yes/No cell) is now an ink
   outline, not yellow.** Yellow there would have sat right next to the amber
   Follow-up and Average chips and read as the same signal. Yellow is reserved for
   active/selected state, exactly as the brief asks.
2. **The drag-resize handle and its guide line are ink, not yellow.** A 2px yellow
   hairline on white is close to invisible, and this is the never-regress feature.

Green / amber / red are untouched, as instructed.

## Projects screen

`repeat(3,1fr)` on desktop, 2 up to 1080px, 1 up to 860px. Cards gained a 16:9
`.proj-media` header. A project photo is an **inline SVG data URI** — a published
Artifact's CSP blocks images from any outside host, so a real uploaded photo has to
be stored and served the same self-contained way. `p2` and `p4` deliberately have no
photo so the "no photo yet" placeholder is visible in both views. List view reuses
`buildTable`, so its columns resize like every other grid.

## Two sidebars

A 64px icon rail (`#projRail`) sits left of the section sidebar — the narrow option
from the brief, because the leads grid is 1144px and the workspace is 1162px at
1440px wide, so it only just fits. **If Adarsh wants full project names instead,
widen `--rail-w` to ~200px and expect the leads table to start scrolling
horizontally.** Below 860px the rail is replaced by `#projSelect` in the topbar.

## Theme

`applyTheme(v, persist)` / `effectiveTheme()` / `paintTheme()`, keyed on
`localStorage["metrol-crm-theme"]`, every access in try/catch. The topbar button
flips light↔dark; the prototype panel still offers "Match device", which clears the
key and the attribute.

---

# Two pre-existing bugs found and fixed

Neither was caused by the four changes; both were in the resize feature.

1. **Half of every column-resize handle was dead.** `.rz` sat at `right:-5px`, so it
   overhung into the next `<th>` — and because each sticky header cell is its own
   stacking context at `z-index:3`, that overhanging half was painted over by the
   next header. `elementFromPoint` at the handle's centre returned the `TH`, so
   `e.target.closest(".rz")` was null and the drag never started. The handle is now
   flush right and fully inside its own cell, with `::after` nudged back onto the
   column edge so the indicator still lines up. Verified live across the handle's
   whole width.
2. **`up()` could drop the final frame.** A `pointermove` schedules a rAF that
   `pointerup` then cancels, leaving `_widths` correct but the DOM one frame stale.
   `up()` now paints once after cancelling.

---

# ROUND 2 — Adarsh's review of the rebrand (2026-09-04)

## Owner reads, the salesperson writes

The owner does not work leads, so **Status and Quality are read-only in the owner's
table** — plain filled chips, and an em dash where nothing is set. The salesperson
dashboard keeps both editable, because that is whose job it is. The owner keeps the
one control that *is* their job: **Payment verified / pending** in the Sales table.

## Status colours now survive light mode

Two separate problems. First, `.cell-edit` forced `background:transparent`, so every
status chip in the tables was bare coloured text — that is why light mode looked
washed out. An editable chip now keeps its chip fill and is marked as editable by the
caret and a hover ring instead. Second, the semantic palette itself was too pale.
Measured contrast of chip text on chip fill, both themes:

| | light | dark |
|---|---|---|
| good  | 5.54 | 8.06 |
| warn  | 6.10 | 8.61 |
| bad   | 5.89 | 6.79 |

All above the 4.5 AA threshold. **Note this reverses the earlier "keep the semantic
colours exactly as they are" instruction** — Adarsh asked for the change directly.

## Both sidebars drag

`.pane-rz` handles on the right edge of the rail and of the section nav, dragging
like a table column, double-click to reset, widths remembered in
`metrol-crm-rail-w` / `metrol-crm-side-w`. The rail runs 56–300px and **swaps
monograms for full project names past 132px** (`.rail.is-wide`). The section nav runs
168–380px. Widening either one takes room from the 1144px leads grid, which then
scrolls inside its own container — that is the trade Adarsh chose by asking for it.

## Scroll-spy could never reach the last section

`Sales dashboard` is shorter than the viewport, so its top never crossed the 120px
threshold and the nav stuck on the third item. The spy now pins the last section
once the scroller has bottomed out.

## Reassignment — this was the "team member option not working"

The roster was already right (3 men, 2 women: Mohit, Arjun, Imran / Priya, Sneha).
The actual bug: `ownerCell` only rendered a control when a lead was **un**assigned,
so a lead could be assigned once and never moved. An assigned cell is now a button,
the modal says "Reassign", marks the current holder, and offers **Unassign**.

## Import leads from Excel or CSV

"Import" beside "Add lead". CSV is parsed in-file with no dependency. `.xlsx` goes
through **SheetJS, loaded from cdnjs** — one of the few script hosts the Artifact CSP
admits. Header row required; it looks for Name / Phone / Email / Assign to, ignores
other columns, skips rows whose phone already exists in the project, and reports what
it found before you commit. Imported leads are stamped `source: "Excel import"`.

> **UNVERIFIED:** this sandbox's network policy blocks cdnjs, so the SheetJS load
> could not be tested. CSV is fully tested. If `.xlsx` ever fails on the live page,
> the modal already says "save the sheet as CSV" — but check a real `.xlsx` once and
> confirm the script URL.

## Lead history

`EVENTS` + `logEvent()` record every create, assign, status, quality, sale and
payment change. Click any lead's **name** to open its history: a meta strip (phone,
project, source, status, quality, owner, sale) over a chronological table of
When / What changed / From / To / By. `seedHistory()` back-fills a plausible trail
for the sample leads so the table is never empty.

---

# ROUND 3 — Adarsh on the chrome (2026-09-04)

He was right that the table had grown furniture. Everything here is subtraction.

- **The pill around "Assigned to" is gone.** It had become a `.cell-edit` button —
  a rounded outline at 11.5px, which is also why the person's name looked small and
  faint. It is now `.assignee`: plain 13px table text at full `--ink`, avatar beside
  it, and a caret that only fades in on hover. Measured name contrast 19.8 light,
  16.5 dark. `+ Assign` is text now too, not a dashed pill.
- **"Connected" is just the word.** No chip, no dot, no outline: `Yes` in ink, `No`
  in `--ink-3`. It is a fact, not a status.
- **The black outline chip is gone from the Status column too.** `chip--accent`
  (Connected) is now the same soft fill as New/Dead but at full ink strength, so an
  in-progress lead reads stronger than a parked one without a hard black edge.
- **Assignment is a dropdown, not a modal.** `openAssignMenu()` reuses the same
  `showMenu()` the status and quality cells use — click the name, the five people
  drop down under it, tick on the current one, Unassign at the bottom when there is
  someone to remove. The whole `#assignModal` (and `.member-row` / `.member-list`
  CSS, and the search field inside it) is deleted, not just bypassed.
  `showMenu()` items now accept an optional `html` field so a row can be a person
  instead of a chip.
- The per-member lead count that used to show in the assign modal is gone with it.
  Worth re-adding to the dropdown if Adarsh misses it when balancing workloads.

---

# ROUND 4 — the dashboard becomes pages (2026-09-04)

## The sidebar navigates instead of scrolling

Overview / Leads / Sales / Team tracking / Sales dashboard are now five **pages**,
not five bands in one endless scroll. `showPane()` swaps them; `PANES` lists them;
the scroll-spy is deleted outright (with it, the last-section bug it used to have).
The pane CSS is scoped `#screen-project .wrap > .section` so the salesperson
dashboard keeps its stacked sections.

## Overview is a real summary now

A page with only five KPI tiles would have been empty, so Overview carries:

- **Needs attention** — unassigned leads, open follow-ups, unverified payments.
  Each row is a button that jumps to the page that fixes it.
- **Recent activity** — the last 8 `EVENTS` across every lead in the project,
  reusing the history engine rather than inventing a second one.

## 50 per page

`PAGE_SIZE = 50`, `PAGES = {leads, sales}`, `pageSlice()` / `pagerHTML()`.
Serial numbers run across the whole filtered set, so page 2 starts at 51.
Searching resets to page 1. The pager only renders when there is more than
one page, so Sales (9 rows) shows none.

**The sample data was topped up to make this real**: `fillLeads()` adds 95 leads
to Funding Room, taking it to 122 — three pages. None of them convert, so Sales
stays at 9 deals and the gross stays ₹13,28,000 exactly as hand-written.

## The Leads grid fills the window

It was still capped at the old `--grid-h:466px` from the stacked layout, which on a
dedicated page meant 11 rows and a screenful of nothing. `.grid-scroll--page` sizes
it to `calc(100dvh - 212px)` so the grid scrolls with its header stuck and **the
page itself does not** — verified single-scrollbar at 620px, 900px and 1080px tall.
On mobile the cap is dropped entirely: one page scroll beats a touch scroller
nested inside another one.

---

# ROUND 5 — the dashboard, and why the resize guide lied (2026-09-04)

## The drag guide was drawn in the wrong coordinate space

Two separate faults, both from `min-width:100%` on the table.

1. **The guide sat left of the cursor.** The browser stretched every column
   proportionally to fill the container whenever the grid's natural width was
   narrower than its box — Team tracking is 1114px in a ~1350px box, so a 1.2x
   stretch. `_widths` no longer described the screen, and `place()` computed the
   guide from `_widths`. It now reads the header cell's own
   `getBoundingClientRect().right`, which is true whatever the stretch.
2. **A 70px drag moved the edge ~95px**, for the same reason.

`applyWidths()` no longer sets `min-width`. Slack goes to the **last column only**,
so `_widths` always matches the screen and dragging is one-to-one. `reflowGrids()`
re-applies on window resize, since the container width decides the slack.

The guide is also `position:fixed` now with its top/height taken from the scroller.
As an absolutely-positioned child it was laid out against the *content* origin, so
it drifted out of view as soon as a grid was scrolled vertically.

## Column separators

`border-right: var(--line-2)` on body cells, `var(--line)` on headers — light, but
enough that you can see the edge before hunting for it.

## Team tracking

**This week** added between Today and This month.

## Sales dashboard, rebuilt

It was a narrow chart beside a 2x2 tile block, with dead space either side.

- Four money tiles across the **full width**, one row.
- Under them, `.dash-grid` at 1.55fr / 1fr: **Last 7 days** beside **Who closed it**.
- Bars capped at 44px (`max-width` + `margin:0 auto`) — seven days across a wide
  card read as bars, not blocks.
- **Selective labels**, per the dataviz guidance: the best day and today are always
  called out, every other bar reveals its value on hover. Labels sit in the flow
  above their own bar, so a small bar's number is never stranded at chart-top.
- **Who closed it** is the same `team` figures, ranked, as horizontal bars. Every
  row is labelled because a ranked list is read by row, not by axis.

---

# ROUND 6 — collapsing sidebars, and resize from anywhere (2026-09-04)

## Both sidebars collapse to icons

- **Section nav**: a chevron beside the "FUNDING ROOM" label toggles `.is-mini` —
  64px, icons only, names on hover via `.side-tip`, the active marker kept. The
  drag handle hides while collapsed (the toggle owns the width then).
- **Projects rail**: `#railToggle` at its foot flips between 64px and 208px; the
  drag still works and the chevron follows whatever the width ends up being.
- Both remember: `metrol-crm-side-mini`, `metrol-crm-rail-w`.
- Collapsing both hands **150px back to the grid** at 1440px — enough that the
  Assigned-to column stops being clipped.

## Column resize now works from any row

The handle used to live inside the header `<th>`. There is now an `.rz-layer`
above the table holding one `.rz-strip` per boundary, each spanning the grid's
full height — so a boundary can be grabbed beside row 10, spreadsheet-style,
and double-click-to-reset works from there too.

Two things this quietly fixed: the strips sit in their own stacking context, so
the old "half the handle is dead because the next sticky `<th>` paints over it"
problem cannot recur; and `renderResizeStrips()` **reuses** its elements rather
than rebuilding them, because replacing a strip mid-drag would drop the pointer
capture and kill the drag.

`applyWidths()` calls it, so anything that moves a column moves the strips.
`showPane()` calls `reflowGrids()` because a hidden pane measures zero height and
its strips would otherwise be 0px tall when it is first shown.

---

# ROUND 7 — drag to fold, and the content uses the room (2026-09-04)

## The sidebar folds by feel, not by button

`setSideWidth()` now watches the width it is handed: drag the edge left past
`SIDE_SNAP` (150px) and the sidebar folds to icons on its own, drag it back out
and it opens. The chevron still does the same thing in one click, and the drag
handle **stays available while folded** (it used to be `display:none` in
`.is-mini`, which meant a folded sidebar could only be reopened by the button).

`wirePaneResize()` gained a `commit` callback so a drag can persist the folded
state alongside the width, and it calls `reflowGrids()` on release so the grid
takes up the freed space immediately.

## A little more width, not all of it

`#screen-project .wrap` goes from the 1180px reading measure to **1360px**. On a
1440px laptop with both sidebars folded the leads grid goes 1144 → **1262px** and
the dead margin either side disappears; on a 27" monitor the cap still stops a
table sprawling edge to edge. Adarsh explicitly wanted "a little, not too much" —
**this is one number to revert if it reads as too wide.**

## Bug: a literal escape in two tooltips

`title="Drag to resize \u00b7 double-click to reset"` was written into two HTML
attributes, where `\u00b7` is just eight characters — the tooltip read the escape
out loud. It is only decoded inside a JS string literal. Both now carry a real "·".
**Watch for this**: several strings in the JS legitimately use `\u00b7` / `\u2014`,
so a blind find-and-replace across the file would break them.

---

# ROUND 8 — the rail's tooltips were being clipped (2026-09-04)

Hovering a collapsed sidebar icon named it; hovering a project icon named nothing.
Same CSS, different result, and the reason is `.rail-list`: it is a scroller
(`overflow-y:auto`, and any scroller clips both axes), so a tooltip sitting at
`left: calc(100% + 9px)` was cut off at the rail's 64px edge. The sidebar has no
scroller, so its copy survived.

Rather than fight the clip, there is now **one** `.hover-tip` node fixed to the
viewport, positioned by JS from the hovered element's rectangle and flipped to the
left side if it would run off screen. Controls carry `data-tip="…"`; the two
in-button `.rail-tip` / `.side-tip` spans are gone.

It stays quiet when it would only repeat what is already on screen — `showTip()`
checks whether the control's own `.rail-name` / `.side-nm` is displayed, so a
widened rail or an expanded sidebar shows no tooltip. Keyboard focus raises it too.

---

# ROUND 9 — two real faults (2026-09-04)

## Recent activity looked dead. It wasn't — the seed data was in the future.

`seedHistory()` anchored a converted lead's chain at `ct = now - daysAgo*DAY`,
then added offsets. For a deal **closed today** `ct === now`, so "Sale recorded"
landed at `now + 72 minutes` and "Payment Verified" at `now + 9.6 hours`. The feed
sorts newest-first, so those future rows sat permanently on top and a real change
was pushed below the fold — it *was* recorded, it just never showed.

Every seeded timestamp is now clamped by `past()` to at most `now - 5min`, and a
deal closed today is anchored six hours back so its own chain still fits behind it.
**If you ever add seeded events, run them through `past()`.**

## The Excel importer had been deleted since round 3

Worse, and mine. Round 3 removed the assign modal with a text slice from
`var assignId = null;` to the `/* history UI */` marker — and the entire importer
block sat inside that range. `parseCSV`, `mapImport`, `impSay`, `impLoad`,
`openImport` and `runImport` all went, 174 lines, while the button and modal markup
stayed. Clicking Import threw `openImport is not defined` for six rounds.

It went unnoticed because the round-2 test covered import and no test after it did.
Restored verbatim from `3e2ddc4`.

**Two rules out of this:**
1. Never delete code by slicing between two markers without printing what is in
   the range first. Delete by exact match.
2. **Before publishing, walk every flow, not just the one that changed.** The list:
   sign in → project → all five pages → paginate → search → import → assign,
   reassign, unassign → status/quality from the salesperson view → verify a payment
   → open a lead's history → check Recent activity updated → resize a column from a
   body row → fold both sidebars → theme toggle → reload → mobile at 390px.
   Zero console errors is part of the pass.

## Reconciliation now checked, not assumed

Team tracking's All-time column sums to ₹13,28,000, matching the This-year tile
exactly. Worth re-checking whenever the sample data changes.

---

# NEXT UP — nothing assigned yet

Open items, smallest first. None of these were asked for; do not build them unasked.

- **Confirm one real `.xlsx` import on the live artifact** — see the UNVERIFIED note
  above. This is the only thing shipped that has not been tested end to end.
- **"The whole tabs should be rearranged or reordered in this way" is ambiguous.**
  Built: sidebars that resize and reflow. NOT built: dragging nav items into a
  different order. Ask which he meant before building the second one.
- **The overlapping avatar stack in the project card footer is hard to read**
  (`.stack .avatar`, 22px at `margin-left:-6px`). Pre-existing, unchanged. Worth
  raising with Adarsh rather than silently redesigning.
- **The density switch is hidden below 860px.** The topbar could not fit the back
  button, the project dropdown, density, theme and the user chip at 390px. Density
  is a desktop reading preference and the 38px compact row is right on a phone —
  but it is a removal, so it needs a yes.
- **Project photos are placeholders.** Real upload needs a decision on where files
  live (Supabase Storage is the obvious answer) before it is worth wiring.
- The four client questions below are still unanswered, and the lead-source one
  still blocks scaffolding the real app.

---

## Working rules

- **Do not scaffold the real app** until the prototype is signed off by Metrol Media *and* the lead-source question is answered.
- Keep the minimalism rule. Polish over features.
- Test changes in the browser before claiming they work — this project has already had two real bugs (a resize drag that broke when the pointer left the handle, and a drag guide that got stuck on screen) that only surfaced through actual interaction testing.

---

## Where this project lives (added when the real app was scaffolded)

| Thing | Value |
|---|---|
| GitHub | https://github.com/adarsh21ch/metrol-crm |
| Supabase project | `Metrol Media`, ref `nsgvcfesyihffspofxiq`, region `ap-southeast-1` |
| Supabase URL | `https://nsgvcfesyihffspofxiq.supabase.co` |
| Vercel | not deployed yet |

A session picking this up cold needs three things and no conversation:

1. `npm install`
2. `cp .env.example .env`, then fill `VITE_SUPABASE_ANON_KEY` from
   Supabase → Project Settings → API Keys → `anon` `public`.
3. `npm run dev`

The `service_role` key has no place in this app. It bypasses every policy in
`supabase/migrations/0001_init.sql`; the browser bundle must never see it.

### The schema is written but not yet applied

`supabase/migrations/0001_init.sql` has not been run against the project. There
is no Supabase CLI or database credential in the build environment, so it has to
be pasted into the SQL editor once (Dashboard → SQL Editor → New query). Until
then the app signs in but every table read comes back empty.

### The app, and what it is not yet

`design/metrol-crm-prototype.html` stays as the signed-off design reference. The
React app carries the tokens over verbatim so the two cannot drift.

Working: auth, projects (cards/list toggle, remembered), project view (two
collapsible sidebars, the second draggable and foldable), leads and sales tables
with resizable columns, role-aware editing, light/dark with persistence.

Not carried over from the prototype yet: Excel/CSV import, the event history
trail and Recent Activity feed, lead assignment UI, pagination, and search. The
`events` table those need is not in the migration either.

---

## The React port (in progress → ready for your test)

The app ships two builds from one repo while the port is proven:

| Path | Build | State |
|---|---|---|
| `/` | the React app | live — this is the product |
| `/legacy.html` | the vanilla prototype wired to Supabase | fallback only; delete it, and `src/app.js`, once nobody has needed it |

Both load the **same** `src/prototype.css`. The design is never retyped, so the
two cannot drift, and the port is a translation of markup and behaviour rather
than a redesign.

### Why a port at all

The vanilla build is one 1,500-line script. Every feature adds to the same file,
every change redraws the whole screen, and a second developer would want to
rewrite it. React splits the app into screens and components a finance or HR
module can sit beside. The database design — not the framework — is what decides
whether those modules are possible, and that part is already sound.

### Demo mode

`?demo=1` feeds the prototype's own sample data in and never touches the
network: 6 projects, 122 leads in Funding Room, 5 salespeople, a plausible
history trail. `?demo=1&as=member` shows the salesperson's app instead of the
owner's. It exists because the sandbox this was built in cannot reach Supabase
at all — no screen past sign-in could otherwise be checked — and it doubles as a
way to show the product before a client's data exists.

### Verified in a browser at 1440px and 390px

Every section renders; search narrows and re-pages; a 120px column drag moves
the edge exactly 120px; both panes fold and remember it; the theme flips and
survives a reload; no horizontal overflow on a phone; zero console errors.

Verified against the real database on 4 Sept by signing in as the owner: the
project, leads and KPIs all loaded, and assigning a lead and verifying a payment
both wrote through and came back in Recent activity. That round trip is what the
cutover was waiting on.

---

## Round: the assign bug, self-signup, avatars, profile editing

### The bug that was actually happening
`ws.members` (the list the assign dropdown reads) was built entirely from the
`project_members` join table. A brand-new account is in `profiles` but not yet
in `project_members`, so it was invisible to the assign menu until someone
hand-wrote a row for it in SQL — and that would recur for every future signup.

Fixed: members are now loaded directly from `profiles where role = 'member'`,
system-wide. The owner's RLS already permits reading every profile
(`is_owner()` in `profiles_select`), so this reads what was already allowed —
it does not widen anything. `project_members` still exists and still matters:
assigning a lead now auto-upserts a row into it, which is what lets that
member's browser read the *project* itself (`projects_select` requires
`is_project_member`), not just the lead they hold.

While testing this fix, found and fixed a second, pre-existing bug in the same
area: the owner was being added to the assignable list (`ws.members`), so
"Owner" showed up as a target you could hand a lead to. An owner is never a
salesperson, so that was always wrong; it was masked before because nobody had
looked closely at that dropdown. Fixed in both the live query and the demo
fixture.

### Migration to run
`supabase/migrations/0003_profiles_and_storage.sql` — adds `phone` and
`avatar_url` to `profiles`, updates the signup trigger to store phone, and
creates the `avatars` storage bucket with policies (anyone signed in can read
any avatar; a user can only write into their own folder).

### Self-service signup
New screen, reachable from the landing page → Sign in → "Create an account".
Mandatory: name, phone, email, password. Calls `supabase.auth.signUp` with
`name`/`phone` in the metadata, which the updated trigger writes into
`profiles`. Every self-created account is `role = 'member'` by the schema
default, and the existing guard trigger blocks a client from ever changing
that — there is no path from this form to an owner account.

If email confirmation is on in Supabase Auth settings (the default), a new
signup sees "check your email" rather than being signed in immediately — the
form handles both cases depending on whether `signUp` returns a session.

### Avatars
`profiles.avatar_url`. The `Avatar` component (`components/bits.tsx`) shows
the photo when one exists, initials otherwise — every call site (Team, Sales,
Leads, Projects, the assign menu, both topbars) was updated to pass it. Upload
goes through the `ProfileModal`, writing to the `avatars` bucket at
`<uid>/avatar.<ext>` and updating `profiles.avatar_url`.

### Profile editing
`ProfileModal`, opened by clicking the user chip in the topbar (works for both
the owner and a salesperson). Name, phone, photo upload, and change password.
Deliberately a modal, not a new side-panel pattern — every other editor in the
app (import, a sale, a lead's history) is already one.

### Still true from before
Realtime is live (leads, events, projects, and now profiles too — a new
signup reaches the owner's screen without a reload). The React app at `/` is
the product; `/legacy.html` is the retired vanilla build kept as a fallback.

---

# Round 12 — the company code, departments, and why a write could fail in silence

### A rejected write used to leave a lie on screen
The owner saw "Bad" on a lead the salesperson had set to "Good". The write is
optimistic — the UI moves first, then the row is reconciled — and a rollback
set `ws.error`, but `ws.error` was only ever *rendered* when
`projects.length === 0`. So inside a loaded project a refused write rolled the
row back and said nothing, which is exactly the shape of the symptom reported.
`App.tsx` now toasts any `ws.error` and clears it, so a refusal is always
visible. This is the fix for the *silence*; migration 0004 below carries the
fix for the likeliest *cause* (realtime never actually publishing `leads`) and,
more usefully, prints proof either way.

### Migration to run
`supabase/migrations/0004_company_code_and_departments.sql`. It is safe to
re-run. Three things:

1. **Adds the tables to the realtime publication one statement at a time.** The
   earlier attempt wrapped all of them in a single `do $$ ... exception when
   others then null $$`, so if the *first* table was already published the block
   swallowed the error and skipped the rest — `leads` may never have been added
   at all. Each is now its own guarded statement.
2. **`company_settings`** — a one-row table holding the invite code. Readable
   and writable only by the owner. Signup checks it through
   `check_invite_code(text)`, a `SECURITY DEFINER` function granted to `anon`,
   because someone creating an account is not signed in yet and so cannot read
   the table. The function returns a boolean and never reveals the code.
3. **`departments`** — seeded with Sales, Production, Content Creation, Video
   Editors, Developers, AI Staff. `profiles.department_id` references it and
   defaults to Sales; every existing member is backfilled to Sales. Readable by
   anyone signed in, writable only by the owner. `profiles_update` is widened so
   the owner can move somebody between departments (previously a person could
   only update their own row).

The migration ends with a `select` against `pg_publication_tables` — the output
is the answer to "is realtime actually on for these tables", which until now
was assumed rather than checked.

### The company code
An account can no longer be created by anyone who finds the URL. The signup
form asks for a company code first and refuses before calling `signUp` if it
does not match. The owner reads and rotates it in **Company settings** (the
gear in the topbar, owner-only, on both the Projects screen and inside a
project). Rotating it does not affect anyone already signed in — it only gates
new accounts.

The gate is a deterrent, not a wall: the code is checked by an RPC anyone can
call, so it stops a stranger who stumbles on the URL, not someone determined to
brute-force it. What actually protects the data is role plus RLS — a
self-created account is always `role = 'member'` and can only ever see the
leads assigned to it.

### Departments
Infrastructure now, per-department dashboards later, which is how it was asked
for. The owner can add a department, rename one inline, and retire one.
Retiring is deliberate: departments are never deleted, because deleting one
either orphans the people in it or silently moves them somewhere they never
worked. A retired department stops being offered for new assignments and stays
selectable for whoever is still recorded against it.

The salesperson's topbar now reads their actual department instead of the word
"Sales", which was hardcoded when Sales was the only one that existed.

### Verified in Chromium before this was called done
Signup shows all six fields in order (Company code, Name, Phone number, Email,
Password, Confirm password). The gear appears for the owner on both screens and
not at all for a member. Company settings loads the code, lists the six seeded
departments, adds a seventh, and moves a person between departments with the
change sticking. The only console error is the Google Fonts stylesheet, which
this sandbox blocks and Vercel does not.

---

# Round 13 — a board view for leads, and a mobile overflow bug found along the way

### The board view
The salesperson's Leads section now has a List/Board toggle (`Leads` →
`section-tools`, next to the search box, remembered in `localStorage` the same
way the Projects screen remembers Cards/List). Board view lays leads out as
one column per status — New, Connected, Follow-up, Converted, Dead — and
dragging a card to another column calls the exact same `ws.setStatus` the
list's status dropdown already calls. There is one write path, not two, so
the two views can never disagree about what a lead's status is: change it in
either one and the other updates immediately, because both are just reading
the same `ws.leads` array.

Dropping a card on Converted with no sale amount yet opens the same "Record
sale" modal the dropdown opens — converting was never just a status flip, and
the board doesn't get a shortcut around that rule.

New component: `src/react/components/LeadsBoard.tsx`. Wired into
`src/react/screens/Member.tsx` only, not the owner's Leads table — the owner
never sets status or quality (the assigned salesperson does), so there was
nothing for the owner to drag.

### Built on pointer events, not HTML5 drag-and-drop
The first version used the browser's native `draggable` attribute. It works
with a mouse and does nothing on a touch screen — Safari iOS never fires
`dragstart` from a touch, and Chrome Android is unreliable at best. Since this
is a CRM a sales team will mostly run from a phone, that would have shipped a
feature that only worked in the demo. Rewritten on `pointerdown` /
`pointermove` / `pointerup`, the same primitives the column-resize handles in
`DataGrid.tsx` already use — one code path for mouse, touch, and pen. A small
movement threshold (6px) tells a drag apart from a tap, so tapping a lead's
name still opens its history.

Verified with a real mouse-drag simulation, and separately by dispatching
synthetic `PointerEvent`s with `pointerType: 'touch'` directly at the DOM —
this exercises the exact listeners a real finger would, rather than trusting
that a screenshot merely renders correctly.

### A pre-existing mobile bug, found while testing this — not caused by it
Testing the board at 390px width turned up the page itself scrolling
horizontally — on both the new board **and** the existing list view, and on
both the owner's and the salesperson's screens. Not something this round
introduced; it was already there. Two separate causes, both fixed:

1. `.grid-shell` (the table's own wrapper) and `.section` had no
   `min-width:0`. Both sit inside a column flex container, and a flex item's
   default `min-width:auto` refuses to shrink below its content's natural
   size — so a wide table widened its container instead of scrolling inside
   its own `overflow:auto` box. Same fix applied to the new `.board` for the
   same reason. This is the same class of bug `.workspace` was already
   guarded against elsewhere in this file.
2. The real cause of the specific 60px overflow measured: `ProjectShell.tsx`'s
   Compact/Comfortable density toggle carries `id="density"`, and a mobile
   media query hides it by id to free up room in the topbar
   (`#density,#densityM{display:none}`) — written for exactly this problem.
   `Member.tsx` has the identical toggle but never got the `id` when it was
   ported, so it never hid, and kept forcing the topbar wider than the
   screen. One missing attribute; added it.

### Verified in Chromium before this was called done
Board and list agree after a drag in either direction, in both directions.
Dropping on Converted with no amount opens the sale modal, same as the
dropdown. A synthetic touch-typed drag produces the same result as a mouse
drag. Dark mode matches the rest of the app. At 390px width, `document.
documentElement.scrollWidth` equals `clientWidth` on both the owner's and the
salesperson's Leads screens, in both list and board view — no page-level
horizontal scroll anywhere this touched.

---

# Round 14 — the board card itself moves, and gets a quality control

Two client reports drove this round, both on the board view from Round 13.

**The drag didn't look like a drag.** The card only faded in place and the
target column highlighted — nothing visibly moved, and dragging across a
column header or a card's text triggered the browser's own click-and-drag
text selection, which read as a broken page, not a kanban board. Rebuilt:
the dragged card is now a floating clone (`position:fixed`, pinned to the
exact point it was grabbed) that follows the pointer; its old slot becomes a
dashed placeholder, not a second visible card. Drop on a different column and
it commits immediately; drop anywhere invalid (another spot, or outside the
board) and it flies back to the placeholder over 180ms instead of vanishing.
`user-select:none` on `.board` stops the text-selection bug outright.

**No way to set quality from the board.** Only the list view had the
Good/Average/Bad dropdown. Restructured each card to two rows — name plus a
quality control top-right (row 1), project name plus sale amount (row 2) —
so a card is the same height whether or not it carries data. The quality
control opens the *exact* `Menu`/`edit` state `Member.tsx`'s list view
already uses (`onEditQuality` prop into `LeadsBoard`), so there is one editing
code path, not two. Its own click stops propagation so it doesn't also open
the lead's history underneath. Sized down (`.board-card-head .cell-edit`,
scoped so the list view's own chip is untouched) after the client asked for
it smaller still.

Verified each round in Chromium: the floating clone is genuinely
`position:fixed` mid-drag; a valid drop commits and an invalid one animates
back with counts unchanged; a plain click (no drag) still opens history; a
synthetic touch-typed `PointerEvent` drag produces the same result as a mouse
drag; picking a quality on a board card updates the same lead's row in the
list view too.

---

# Round 15 — Task #17: live sync on assignment

## The actual gap, not a guess

Status and quality changes were already realtime because the row being
changed was already visible to the member — `owner_id` doesn't move, so
`leads_select`'s `owner_id = auth.uid()` clause was true both before and
after the write, on both the writer's and the reader's connection.
Assignment is the one write where that's not true: the row moves from
*invisible* to a member (someone else's lead, or unassigned) to *visible*
(now theirs). That is exactly the case Supabase Realtime's own community
issue tracker flags as unreliable for `postgres_changes` — a per-event RLS
re-check keyed to the row image in that one WAL entry, rather than a live
re-query, so a member's socket can simply never be told about the one UPDATE
that would have started sending them rows.

Two more places had the identical shape of gap, quieter because they don't
show up as "nothing happens" but as "half of it happened":

- **`project_members`** was never added to the realtime publication and
  nothing subscribed to it — so the row `ensureProjectMember` inserts (what
  lets a member read the *project* their new lead lives in, via
  `projects_select`'s `is_project_member`) landed silently. A member's very
  first lead in a project used to show up with a blank Project column and
  the project itself missing from their view until they reloaded.
- **`isNew`** was never set on a lead this client had never seen before —
  neither in the raw `leads` realtime handler's "unknown row" branch, nor
  anywhere else — so even on the rare occasion the leads stream *did*
  deliver the assignment, the row arrived with no visual "new" marker.

## The fix

`events` doesn't have the same failure mode: its `events_select` policy
(`exists (select 1 from leads l where l.id = lead_id)`) is a **live**
subquery against the current `leads` table, not a snapshot of one WAL
event — and by the time an "Assigned" row is logged, the lead is already
committed with its new `owner_id`. So `useWorkspace.ts`'s `events` INSERT
handler now calls a new `reconcileLead(leadId)` for every event (not just
"Assigned" — this is a general-purpose safety net): it re-reads that one
lead by id and reconciles it into local state — added if it newly passes
RLS, updated if already known, **removed** if it no longer passes (a
reassignment away, which has the identical problem in reverse). This runs
*alongside* the existing `leads` postgres_changes stream, not instead of
it — harmless and idempotent if that stream already delivered the same
row, and the actual fix on the runs where it didn't.

`project_members` is now in the realtime publication (migration 0005) and
`useWorkspace.ts` subscribes to its INSERTs, triggering the same `load()`
the `projects` table's own changes already trigger. And both the raw
`leads` handler and `reconcileLead` now mark a row `isNew: true` the moment
it's a row this client has never held before.

None of this could be exercised against real Supabase from this sandbox
(no network path to it, same as every round before this one) — the reasoning
above is what the fix rests on, not a live test. `?demo=1` never touches
realtime at all (`isDemo()` short-circuits the subscription), so the parts
that *were* browser-tested are the two additions below, plus that the
existing app still works (reassign/unassign in the owner's Leads grid,
mobile, dark mode — see the checklist at the end of this round).

## Two additions, same question: what should update live

- **`leads.assigned_at`** (migration 0005, backfilled to `created_at` for
  every already-assigned lead) is the durable answer to "did this land
  since I last looked?" — `isNew` can't answer that because it never
  survives a reload. `Member.tsx` reads a `metrol-crm-lastvisit-<id>`
  timestamp from `localStorage` **before** overwriting it with now, so it
  has a real "since when" to compare against. First-ever visit has no
  previous timestamp to compare to (everything would count, which is just
  the whole backlog restated, not news) — that case pins the reference to
  now and quietly skips the notice.
- **A refresh button with a spinner**, in `Member.tsx`'s page head, wired
  to a new `ws.refresh()` / `ws.refreshing` pair in `useWorkspace.ts` (a
  thin wrapper around the existing `load()`). In demo mode `load()` has no
  real async gap, so the spinner frame can't be caught by a screenshot
  there — confirmed instead that the CSS itself is correctly wired
  (`animation-name / duration / iteration-count` all present on the `.spin`
  class) and that real network latency in production will keep
  `refreshing: true` on screen for the request's duration.

## Migration to run

`supabase/migrations/0005_assigned_at_and_member_realtime.sql` — adds
`leads.assigned_at` (+ backfill) and adds `project_members` to the
`supabase_realtime` publication. Safe to re-run; ends with the same
`pg_publication_tables` proof query Round 12 introduced.

## Verified in Chromium (demo mode, both roles)

First visit shows no banner (by design). Seeding an old `lastvisit` and
reloading shows "N leads assigned to you", dismiss makes it disappear. The
refresh button's spinner CSS is correctly wired; clicking it re-triggers a
load with no console errors. Reassign/unassign from the owner's Leads grid
still works end to end (menu → write → row updates, matching the demo
fixture's own `isNew`/`assignedAt` state). 390px width: no page-level
horizontal scroll on the salesperson screen with the new refresh button in
place. Dark mode unaffected. Only console error throughout: the Google
Fonts stylesheet this sandbox blocks (pre-existing, unrelated).

---

# Round 16 — Task #18: an owner-level sidebar, Team, and per-member dashboards

## The rail becomes app-wide, not extracted-and-duplicated

The project rail (`ProjectShell.tsx`'s left-hand icon strip: "All projects"
+ every project, foldable/resizable via `usePanes`) was already meant to be
persistent — Round 3's original design note called it Sidebar 1, "so they
can jump straight between them" — but it only ever rendered *inside* a
project, and vanished the instant you clicked back to the grid. That's the
actual gap Adarsh was pointing at, not a missing feature so much as an
inconsistently-scoped existing one.

Fixed by extraction, not duplication: `src/react/components/Rail.tsx` is the
exact same markup (`rail` / `rail-list` / `rail-btn` / `rail-sep` /
`rail-toggle` / `pane-rz`, all pre-existing, unmodified CSS) as a shared
component, parameterized by which entry is `active` and four navigation
callbacks. `ProjectShell.tsx` now renders it instead of its own inline copy.
`Projects.tsx` and the new `TeamPage.tsx` render the same component, each
constructing their own `usePanes()` / `useHoverTip()` — safe because both
hooks key their state off `localStorage` and a CSS custom property on
`document.documentElement`, not component identity, so the rail's width and
fold state carry across screens exactly as if it had never unmounted.

Two new entries live below a separator, outside the (scrollable)
project list so they never scroll out of reach: **Team** and **Settings**.

## Settings stays a modal

Company settings is a company code field, a department list, and a roster
table with one dropdown each — not enough surface to earn its own page, and
turning it into one would mean either duplicating `CompanyAdminModal`'s
logic or unwinding a working, already-tested piece for no behavioural gain.
It's now reachable from the Rail on every owner screen (in addition to the
gear icon each topbar already had, left alone rather than removed — no
regression risk to something that already worked, and it's still the
mobile-safe path now that the Rail itself hides under 861px same as it
always did inside a project).

## Team: grouped by department, drilling into one member

`TeamPage.tsx`, a new top-level screen (`App.tsx`'s `Route` gained `'team'`
and `'member'; id` cases, mirroring the existing `'projects'`/`'project'`
shape). Two views in one screen, chosen by whether a `memberId` is set:

- **Roster** — every member from `ws.members`, grouped by
  `departmentId` against `ws.departments` (sorted by `sortOrder`, with a
  trailing "No department" bucket for anyone unset). A department with
  nobody in it doesn't render a heading for nobody. Each member is a card
  (name, lead/converted counts, all-time sale value) — clicking one drills
  in.
- **Member dashboard** — `sections/Team.tsx` already computed almost this
  exact shape (assigned/connected/follow-up/converted, sales
  today/week/month/all-time) but scoped to one project's `leads` prop; this
  is that same computation read off `ws.leads` **unfiltered by project**,
  for one member. Added a per-project breakdown table underneath (project,
  leads, connected, follow-ups, converted, sale value) so "every project,
  not just one" is an actual table you can read, not just a claim the KPI
  row makes.

## Mobile

The Rail hides under 861px exactly as it always did — nothing new needed
there. `Projects.tsx` and `TeamPage.tsx` each gained a two-button
`.mobile-nav` chip strip (Projects/Team), the same pre-existing class
`ProjectShell.tsx`'s section-switcher already uses. `ProjectShell.tsx`'s
existing `.proj-select` dropdown (the mobile stand-in for the rail's project
list) gained a trailing "Team" option. `TeamPage.tsx` briefly also carried a
"jump to a project" `<select>` in its topbar; dropped it after a 390px
screenshot showed it fighting the brand wordmark for room in a way
`ProjectShell.tsx` never had to solve (that screen has no brand text in its
topbar to begin with) — the mobile-nav chip to Projects, then a card tap,
covers the same need without inventing new topbar real estate.

## Verified in Chromium (demo mode)

Projects, Team, and a project all show the same rail, each with the right
entry lit; clicking a project icon from Team opens it, clicking Team from
inside a project returns to the roster — width and fold state survive every
jump. Roster groups correctly (5 members, 1 seeded department in the demo
fixture). A member card opens their dashboard with figures matching the
roster card's own counts; per-project table sums are consistent; "← Team"
returns to the roster. Settings opens from the Rail on every screen. Light
and dark both correct. 390px: no page-level horizontal scroll on Projects,
Team, the member dashboard, or inside a project with the new "Team" select
option, checked via `scrollWidth === clientWidth`. Only console error
throughout: the Google Fonts stylesheet this sandbox blocks.

## Judgement calls worth Adarsh seeing

1. **Settings is reachable from two places now** (topbar gear, kept; Rail,
   added) rather than one. If that reads as redundant once he's looked at
   it, the topbar gear is the one to drop — the Rail's is the one that
   matches every other screen.
2. **The per-project breakdown table on a member's dashboard** wasn't
   explicitly asked for — "track record across every project" was — but a
   table answering that literally seemed like the minimal way to actually
   deliver it, not an extra module. Flagging it per the project's own
   feature-creep rule: built because it directly answers what was asked,
   not layered on top of it.

## A pre-existing bug found while regression-testing this round, not caused by it

Folding the section sidebar, then reloading, silently unfolded it again —
on the original code too, nothing to do with the Rail extraction. `usePanes`
correctly read the stored `sideMini` flag into its own `useState`
initializer, but its mount effect then called `applySide(storedWidth)` for
the *width*, and `applySide` unconditionally derives `sideMini` from that
width against `SIDE_SNAP` — overwriting the just-initialized flag back to
`false`, since folding doesn't change the stored width, only the mini flag.
`usePanes.ts`'s mount effect now writes `--side-w` directly instead of
routing through `applySide`, so it can't stomp a mini flag it never needed
to touch. Verified: fold the sidebar, reload, reopen the project — stays
folded.

## Next up — nothing assigned yet

Both items handed off at the end of the last session are done. Nothing new
queued; the open items list from earlier in this file (the `.xlsx` import
never confirmed against a live artifact, the avatar-stack legibility note,
the density switch hidden under 860px, real project photo upload) is still
exactly where it was.

---

# Round 17 — the salesperson's Leads view: Board by default, List remembered

Adarsh's ask: a salesperson doing the actual calling works better from Board
(the kanban card view, dragging status across columns) most of the time, but
someone who prefers working down a straight list — easier to call in
sequence — should have that respected once they've chosen it. The two
requirements aren't in tension, they're sequential: **default** to Board for
anyone who has never touched the toggle; **remember** whichever view someone
actually picks, per browser, from then on.

`Member.tsx`'s `pickView` already wrote the choice to `localStorage`
(`metrol-crm-leadsview`) on every click — that half was already correct. The
bug was the *fallback* read on first load: `localStorage.getItem(KEY) ===
'board' ? 'board' : 'list'` defaulted to List for absolutely everyone who had
never touched the toggle, since an unset key is neither `'board'` nor
anything else. Flipped the comparison: `=== 'list' ? 'list' : 'board'` — now
nothing-stored (or anything not literally `'list'`) reads as Board, and a
browser that has explicitly picked List keeps seeing List.

Verified in Chromium (`?demo=1&as=member`): a fresh browser profile (no
`localStorage`) opens straight to Board. Clicking List, then reloading,
stays on List. Clicking back to Board, then reloading, stays on Board.
One-line fix, no migration, no other screen affected — the owner's Leads
grid has no Board/List toggle at all.

**Follow-up, same round:** the toggle's default *selection* was fixed above,
but its left-to-right *order* wasn't — it still read List, then Board, so
the default landed on the right-hand button, not the left. Adarsh caught
this from a live screenshot. Swapped the two `<button>`s so Board is first
(left, and the one lit by default) and List is second (right) — matching
"first should be the card, next should be the list" literally, not just in
which one starts active. Re-verified: same toggle order, same default.

---

# Round 18 — Compact/Comfortable becomes a slider, and starts telling the truth

Adarsh's read was correct on both counts, and the first half is the more
interesting one.

## The old switch really did nothing on Overview

`Compact | Comfortable` only ever drove one CSS rule —
`.dense-comfortable table.grid th,td{height:48px}` against a 38px default.
Overview has no `table.grid` at all (KPI tiles, Needs attention, Recent
activity), so the control sat in the topbar of that page doing literally
nothing. Same on Sales dashboard, and on the salesperson's Board view.

Rather than hide the control on those pages — a control that appears and
disappears as you navigate is its own kind of broken — Overview's two row
lists now scale with the same setting: `.ov-row` (Needs attention) and
`.ov-ev` (Recent activity) take their vertical padding from
`calc(var(--row-h) * ratio)`, where each ratio is just today's padding over
today's row height. At the default setting they render pixel-identical to
before; they only move when somebody moves the slider. Four of the five
project pages now respond. Sales dashboard is charts and still doesn't —
that one is honest, a bar chart has no rows to tighten.

## Why a slider is safe here, specifically

Three things were worth checking before building it, since row height is one
step away from the never-regress column resize:

1. **Nothing measures row height.** `.rz-layer` is sized `height:100%` in
   CSS and the strips inherit it, so the grab handles follow a taller or
   shorter grid without any JS. Verified by drag-testing at every stop: a
   120px drag moves the column edge exactly 120px at 32px, 38px and 56px
   rows, and double-click still resets.
2. **It cannot lag.** The height lives in a `--row-h` custom property on
   `<html>`, written straight to the DOM as the slider moves — no React
   state, so a fifty-row table is never re-rendered mid-drag. Only the
   release writes to `localStorage`. This is the same split `usePanes`
   already uses for the draggable sidebars.
3. **It snaps.** Six stops — 32 / 35 / 38 / 44 / 48 / 56 — not free
   dragging. The floor is real: an avatar and an editable chip are both
   26px, so under ~32px they start touching the row's own borders and the
   table reads as broken. Above ~56px it is just wasted screen. Stops mean
   the control cannot be parked somewhere that looks like a bug.

## Nothing moves for anyone until they touch it

Default is stop 2 = **38px**, exactly what Compact always gave. `useDensity`
also reads the old `metrol-crm-dense` key: anyone who had picked Comfortable
starts on stop 4 = **48px**, exactly what Comfortable always gave. So the
change is invisible until somebody drags it, in either direction.

New files: `src/react/lib/useDensity.ts` (the hook and the stops) and
`src/react/components/DensitySlider.tsx` (shared by `ProjectShell.tsx` and
`Member.tsx`, so the markup exists once — the duplicated-rail lesson from
Round 16). The control keeps `id="density"`, which is what the existing
`@media (max-width:860px){#density,#densityM{display:none}}` rule hides on a
phone — so mobile behaviour carried over for free, verified.

## A deletion that would have broken the fallback build

Removing the now-unused `.dense-comfortable` rule was the obvious cleanup,
and it was wrong: `src/app.js` — the retired vanilla build still served at
`/legacy.html` — toggles that exact class, and shares this same stylesheet.
Deleting the rule would have silently killed the legacy build's own density
switch, the same shape of mistake as the importer that vanished for six
rounds in Round 9. The rule stays, with a comment saying it belongs to
`app.js` and goes when `app.js` does.

## Verified in Chromium

Slider renders on the owner's and the salesperson's topbars. Every stop
produces its stated height (32/35/38/44/48/56) on the real table. The
setting survives a reload and carries between screens (the property is on
`<html>`, not per-screen state). Overview's Needs attention and Recent
activity rows both grow and shrink with it; at the default they measure the
same as before the change. Column resize exact at every stop, as above.
Hidden at 390px with no page-level horizontal scroll. Dark mode reads
correctly — `accent-color` paints the track and thumb brand-yellow in both
themes, which is a great deal less CSS than styling the WebKit and Firefox
pseudo-elements separately. Only console error: the Google Fonts stylesheet
this sandbox blocks.
