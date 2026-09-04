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
| `/` | the vanilla prototype wired to Supabase | live, in daily use |
| `/app.html` | the React port | complete, needs testing against real data |

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

**Not verified:** anything against the real database. Supabase is unreachable
from the build environment, so the port has never talked to Postgres. That is
what the next test is for, and why `/` has not been replaced yet.
