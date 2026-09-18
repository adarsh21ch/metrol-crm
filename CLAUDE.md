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

---

# Round 19 — a polish pass, found by looking at a real workspace instead of the sample data

Adarsh opened this one up: "if you want to improvise the UI/UX… anything you
want to suggest to upgrade." Per the quality bar at the top of this file that
means **polish, not modules** — so nothing here adds a feature. Every item was
found the same way, and it is a method worth repeating.

## The method: test against six leads, not a hundred and twenty-two

The demo fixture has 122 leads in Funding Room. Adarsh's live workspace has
**one project and six leads**. Almost every fault below is invisible at 122
rows and obvious at six — so the audit was done by temporarily shrinking
`demo.ts` to one project with six leads and one sale, screenshotting every
screen, then restoring it. **Do this again before any future round is called
done.** A CRM's worst-looking day is its first one.

## What was actually wrong

1. **Singular counts read as broken English.** "1 closed deals", "1 payments
   pending", "1 leads with nobody on them", "1 follow-ups open right now",
   "1 salespeople on this project", "updated 1 minutes ago". Nobody saw these
   for fourteen rounds because the sample data never produces a 1. Added
   `plural()` / `count()` to `lib/format.ts` and used them everywhere a count
   is written by hand — including inside `agoWords`, which was generating
   "1 minutes ago" on every project card. Two places already did this properly
   (`Dashboard`'s `deals()`, `ImportModal`) and now share the helper.

2. **A one-row table drew 240px of blank white below itself.**
   `.grid-scroll--page` carried `min-height:300px` alongside its
   `max-height`. The cap is what keeps the page itself from scrolling and had
   to stay; the *floor* was doing nothing but making a short table look
   half-loaded. Floor removed — the empty row now carries its own height
   instead, so nothing collapses when a table genuinely has nothing in it.

3. **Every empty table said the same four words.** `DataGrid` had one
   hard-coded "Nothing here yet." with inline styles. It now takes an `empty`
   prop, so each table says something that helps: Leads offers Import when
   you are the owner, quotes your search term when a search is what emptied
   it, tells a salesperson the owner will hand them leads; Sales explains
   that a sale appears when a lead is marked Converted with an amount; Team
   tracking says assign somebody a lead and they will show up.

4. **`Who closed it` could total less than the tiles above it.** It summed
   converted leads per member and simply dropped any converted lead nobody
   holds — which Adarsh has live right now (Rahul Sharma: Converted,
   unassigned). The dashboard said ₹6,000 and the breakdown said ₹0, under a
   sidebar that promises "every number here is calculated from the rows in the
   tables". Unassigned money now gets its own row.

5. **Two column headers opened truncated** — "CONNECT…" and "FOLLOW-U…" on
   Team tracking and on the member dashboard's by-project table. The columns
   were 106/110px against headers that need ~120. Widened. A resizable table
   whose headers start clipped reads as broken rather than adjustable.

6. **The avatar stack on a project card was an unreadable smear** — the open
   item this file has been carrying since Round 9. Five 22px avatars
   overlapping at -6px left half-initials on top of each other. Now four at
   most, at -4px, with a `+N` beside them; the sentence next to it was
   already counting the whole team anyway.

## Verified in Chromium, at both data volumes

Sparse: every count reads correctly at 1, the one-row Sales table hugs its
row, the empty state renders at a sane height and quotes the search term,
"Unassigned ₹6,000" reconciles the dashboard with its own tiles, no header
truncates. Full 122 rows: the page still does not scroll (the cap survived
the floor's removal), the grid still caps at 688px in a 900px window, 50 rows
paginate as before, and a 120px column drag still moves the edge exactly
120px. Both themes, and 390px with no horizontal overflow. Only console
error: the Google Fonts stylesheet this sandbox blocks.

## Still open, deliberately not done

- **Sales dashboard has no rows, so the density slider does nothing there.**
  Honest — a bar chart has nothing to tighten — but it is the one page where
  the control is inert. Left alone rather than hidden, because a control that
  appears and disappears as you navigate is worse.
- **A brand-new project's Overview shows three zeros and an empty feed.** It
  is truthful and the empty states now carry it, but a first-run "add your
  first lead" prompt would carry it better. Not built: it is a feature, and
  the rule here is to note rather than add.

---

# Round 20 — the salesperson's screen becomes three sections

Adarsh: "Overview, then My leads, then My sales… once the sale is done and
verified, who wants to read it again and again? A person doing sales doesn't
want to see a sale that already happened. If he wants the list he can switch
to that tab."

He is describing the exact call Round 4 made for the owner's project screen —
sections become pages instead of one endless scroll — which the salesperson's
screen never got. It was one column: KPI row, then the leads board, then a
"My sales" table underneath that a salesperson scrolls past on the way to
nothing, every single time they open the app.

## Three sections, in his order

`Member.tsx` now carries a `MemberSec` of `overview | leads | sales`,
defaulting to Overview.

- **Overview** — the "N leads assigned to you" banner, the five KPI tiles, and
  a **What needs you** card: leads not called yet, follow-ups to make, leads
  called but not rated. Same `.ov-card` / `.ov-row` markup as the owner's
  Overview, asking the question a salesperson actually has — what do I do
  next — with every row a button into My leads. Without it the tab would be
  five tiles and whitespace, which is the same trap Round 4 noted for the
  owner's Overview.
- **My leads** — the board or list, now with the whole page to itself.
- **My sales** — the closed-deals table, one tap away and out of the way.

## Why tabs and not a sidebar

The owner switches sections with a sidebar, but the owner also has a rail of
projects for it to sit beside. A salesperson has no projects to switch
between, works mostly from a phone, and has three destinations — so a chip
strip (`.tabs`) directly under the page head, identical at every width.

Deliberately **not** the `.seg` control: `.seg` means "another view of the
same thing" (Board/List, Cards/List), and the My leads tab contains a `.seg`
of its own. Two identical-looking controls on one screen meaning two
different things is how a simple screen stops being simple.

The tabs carry counts (`My leads 163`, `My sales 30`), mirroring the owner's
sidebar. Board/List moved into the page head's `.section-tools` and only
appears on the My leads tab. **Refresh stays on all three** — it is a
"get me current data" action, not a property of one section.

## Verified in Chromium

Lands on Overview; all three tabs switch, with the head title and sub
changing with them ("30 deals closed · ₹7,91,000 total" on My sales, "163
leads across 6 projects" on My leads). The sales table is genuinely not
rendered while you are on My leads — checked, not assumed, since not
scrolling past it is the entire point. Board/List shows only on My leads;
Refresh on all three. Editing quality from a board card still opens the same
menu. 390px on every tab with no horizontal overflow, and dark mode correct.
Only console error: the Google Fonts stylesheet this sandbox blocks.

## One thing to watch

The tab choice is **not** remembered — every visit opens on Overview, the
same way the owner's project screen always opens on its own Overview. That is
deliberate: Overview is where the "N leads assigned to you" notice lives, so a
salesperson who lands anywhere else would stop seeing it. If Adarsh finds the
extra tap annoying, remembering the last tab in `localStorage` is a one-line
change — but it costs him that notice.

---

# NEXT MODULE — HR (briefed 2026-09-05, not started)

Adarsh asked for an HR department. Asked to scope it, he answered: **"HR manages
every department and everything — from offer, to joining, to every department
operation, finance, salary, leave or resign and all. If anything we need to
restrict we do it later."**

Access: **owner + a new HR role** — a third role alongside `owner` and `member`,
grantable to specific people (e.g. an office manager). Not owner-only.

## Read this before building it

This is a second module, comparable in size to the CRM itself, and it touches
**salary and personal employee data** — the most sensitive data this app will
ever hold. Two rules follow from that:

1. **RLS first, not last.** A salesperson must never be able to read anyone's
   salary, and an HR user must not inherit owner powers over leads/sales.
   Write and test the policies before building any screen on top of them.
2. **Phase it.** Do not attempt offer + joining + operations + finance + salary
   + leave + resignation in one round. That is exactly the kind of sweeping
   change that deleted the importer for six rounds. The whole scope is recorded
   here so nothing is lost — build it in order.

## Suggested phase order (foundation first — everything else hangs off it)

- **Phase 1 — the HR role and the employee record.** Add the `hr` role, its RLS
  policies, and an `employees` table (one row per person: joining date,
  designation, department, employment type, contact, emergency contact,
  status active/resigned). An HR section in the nav, an employee directory, and
  an employee detail page. Nothing else. Everything below needs this to exist.
- **Phase 2 — leave.** Requests, approve/reject, balance. The most-used HR
  feature day to day, and it is self-contained.
- **Phase 3 — salary/finance.** Monthly salary records, payslip history.
  Strictest RLS in the app: a person sees only their own.
- **Phase 4 — offer & joining.** Offer letter records, onboarding checklist per
  new hire, documents collected.
- **Phase 5 — resignation/exit.** Resignation record, notice period, exit
  checklist, marking the employee inactive (never deleting the record).

Confirm each phase with Adarsh before starting the next. He explicitly said
restrictions can be decided later, which is permission to scope down, not
permission to build all five at once.

## The access model, as Adarsh described it on 2026-09-05

Read this before building any dashboard. **Three independent things** decide
what a person sees when they log in. They are orthogonal — do not collapse them
into one `role` column.

| Thing | Column | What it decides |
|---|---|---|
| **Role** | `profiles.role` — `owner` \| `member` | The owner sees everything, across every department. Unchanged. |
| **Department** | `profiles.department_id` | **Which dashboard they get.** A Sales person gets the leads/sales dashboard. An HR person gets the HR dashboard. Etc. |
| **Team lead** | `profiles.is_team_lead` — NEW, boolean | Adds **one extra tab** — "Manage team" — to whatever dashboard they already have. Nothing else changes. |

In Adarsh's words: *"every department member has their own dedicated dashboard
designed for their work, and every department has a team leader who has access
to see the information and data of their team members — one more extra tab,
that is Manage team. That's it."*

### What "Manage team" is, and what it is not

It is **not** a separate dashboard and **not** the owner's view scoped down. It
is one additional tab on the lead's own department dashboard, showing the
track record of the people who share their `department_id`. A Sales team lead
keeps their own leads and sales tabs exactly as they are, and gains a tab
listing their team's numbers.

### HR is a department, not a parallel role

Adarsh: *"the owner can assign a particular team member the role of HR — he
tags them, this team member is my HR — so when he logs in he gets the HR
dashboard."* That is precisely what assigning `department_id` already does, so
**model HR as a department row**, not as a third value in `profiles.role`.
Adding `hr` to the role enum would create a second, competing way to express
"what work does this person do" beside `department_id`, and they would drift.

The HR dashboard is broad by design — HR spans every department (offer,
joining, operations, finance, salary, leave, resignation per the brief above),
so it reads across departments while a Sales person reads only Sales. That
breadth lives in the HR dashboard's RLS policies, not in a role column.

*If Adarsh later wants HR powers grantable independently of which department
someone sits in, revisit this — but do not build both mechanisms at once.*

### Still unknown — ask before building

**Only the Sales dashboard has ever been designed.** Production, Content
Creation, Video Editors, Developers, AI Staff and Performance Marketing all
exist as department rows with **no defined content whatsoever**. Nobody has
said what a Production person or a video editor actually tracks day to day.

Do not invent them. Shipping five hollow dashboards would break the quality bar
at the top of this file harder than shipping none. Ask Adarsh what each
department's people actually need to see, one department at a time, and build
only the ones he answers for.

### Naming, settled 2026-09-05

The department is **"Human Resources"** — spelled out in the `departments` row,
consistent with "Content Creation" and "Video Editors". The UI may show a short
"HR" label where space is tight. The **person** is not called "HR"; their
`designation` on the employee record is **"HR Manager"** (or HR Executive, etc.),
the same way a Sales person is a "Sales Executive" and the tagged lead is the
"Sales Team Lead".

Adarsh considered "HRT" for the department and it was talked out of: it is not a
business term and reads as the medical one. He added: *"if needed we change the
UI label later if they want"* — so the label is cosmetic and changeable; the
`departments.name` value is what code should key on, never a hardcoded string in
a component.

---

# HR Phase 1 — decisions locked, then built (2026-09-05)

A plan was written as a page first and approved before any code:
**https://claude.ai/code/artifact/64e34218-183b-4538-ba52-59344590cbf9**
(republish to that same URL to keep the link Adarsh has).

## What Adarsh answered

He accepted every recommendation in the plan, so these are settled — do not
re-ask:

1. **An employee can exist without a CRM login.** `employees.profile_id` is
   nullable. An accountant or office staffer who never signs in still has a
   record.
2. **HR and the owner both create and edit** employee records.
3. **A person can read their own record**, and only their own. They cannot edit
   it — joining date and designation are HR's facts, not self-service.
4. **Employee codes auto-generate** — `MM-001`, from a sequence, never typed.
5. **"Manage team" shows real numbers for Sales only.** Every other
   department's lead gets a plain roster until Adarsh says what that department
   actually tracks. No invented metrics. Still unanswered, still do not guess.
6. **HR sees the owner's own employee record.**
7. **Date of birth and address included, both optional.** PAN, Aadhaar, bank
   and documents wait for Phase 4 (they need file storage and stricter rules).
8. **Performance Marketing added** as a department row — it was named in this
   file but had never existed in the database. UI label for the department is
   the short "HR"; `departments.name` stays "Human Resources" and code keys on
   that, never on the label.

## His one addition, and it changes the shell

> "HR should get the sidebar in his dashboard like the owner one instead of the
> employee [tabs], because HR may need to manage a lot of things later."

Correct call, and it is now the plan. The salesperson's Overview / My leads /
My sales **tab strip does not scale** to leave + salary + onboarding + exits —
that is four more Phase-2-to-5 sections fighting for one row of space. So:

- HR gets the **owner's `Rail`** (`src/react/components/Rail.tsx`), the same
  app-wide left nav, not a copy of it. Extend that component with an optional
  set of nav items; when the prop is absent it must render exactly what it
  renders today for the owner. Do not fork it — a second rail would drift.
- Rail items for HR: **Directory**, **Departments**, then Settings. Phases 2-5
  add **Leave**, **Salary**, **Onboarding**, **Exits** to the same rail, which
  is the whole point of choosing it.
- The **team lead's "Manage team" stays a tab**, as briefed. A tab is right
  there: it is one addition to an existing three, not a growing module.

## Two real problems found while writing the policies

**1. A privilege-escalation hole, created by this module and closed in it.**
`profiles_update` (migration 0004) lets a member edit their own profile row.
That was harmless while `department_id` only picked a dashboard. The moment
Human Resources reads every employee record, a salesperson could set their own
`department_id` to Human Resources — or set their own `is_team_lead` — and read
the company's personal data. Fixed in `0006` by replacing
`guard_role_change()` with `guard_profile_privileges()`, which blocks changes to
`role`, `department_id` and `is_team_lead` from anyone who is not the owner or
HR. The legitimate self-edits (name, phone, avatar) still work.

**2. Two columns holding one truth.** `profiles.department_id` decides which
dashboard you get; `employees.department_id` is HR's record of the same fact.
They would drift. An `after insert or update` trigger on `employees` now moves
the linked profile with the record.

## Built so far

| File | What it is |
|---|---|
| `supabase/migrations/0006_hr_employees.sql` | Departments, `is_team_lead`, the guard, `employees`, its triggers, and all its RLS in **one** file — schema and policies deliberately not split, so the table is never briefly readable by everyone. No DELETE policy exists and DELETE is revoked outright. |
| `supabase/tests/0006_rls_checks.sql` | Eight checks, run inside a transaction that rolls back. Picks real people out of the team automatically and says SKIPPED, not PASS, when one does not exist yet. |

**Not yet run against the database.** The Supabase CLI is installed on this
machine (`/opt/homebrew/bin/supabase` — the older note in this file saying there
is none is stale), but there is no `.env`, no project link and no database
password here, so the migration still has to be pasted into the SQL editor by
hand. Screens must not be called done until the checks above have actually been
run and reported back.

## Phase 1 shipped (2026-09-05)

All nine RLS checks passed against the live database before any screen existed
(`supabase/tests/0006_rls_checks.sql`, results as rows — the first version
reported through RAISE NOTICE, which the Supabase SQL editor does not display,
so it ran and printed nothing).

| File | What it is |
|---|---|
| `src/react/lib/hr.ts` | The module's own vocabulary — Employee, statuses, `fmtDate`, `tenure`, `HR_DEPARTMENT`. Kept beside `types.ts` rather than widening it, as that file asks. |
| `src/react/data/useEmployees.ts` | Reads and writes `employees`. Takes an `enabled` flag so a salesperson's app never makes the request. Re-reads the row after an update rather than trusting the patch. |
| `src/react/screens/HrPage.tsx` | The HR dashboard: directory, one employee's page, departments. |
| `src/react/modals/EmployeeModal.tsx` | Add and edit. No delete anywhere — the table has no delete policy and DELETE is revoked. |
| `src/react/components/Rail.tsx` | Now takes optional `items`. With none passed it renders exactly the owner's rail; HR passes its own. **Do not fork this component for phases 2-5** — add rail items. |
| `src/react/screens/Member.tsx` | The Manage team tab, shown only when `is_team_lead`. |
| `supabase/migrations/0007_hr_reads_profiles.sql` | HR reads every profile; a team lead reads their own department's. |
| `supabase/migrations/0008_team_lead_reads_team_leads.sql` | A team lead reads their department's leads, read-only. |

**0007 and 0008 were found by building, not by planning.** `profiles_select`
was "your own row or you are the owner", which left HR unable to link a record
to a login; `leads_select` was "your own leads", which would have rendered
Manage team as a table of zeros. Expect more of these in phases 2-5: a policy
written for the owner-only app is usually too narrow the moment a second
dashboard reads the same table.

### Verified in Chromium, not asserted

`?demo=1&as=hr`, `&as=lead` and `&as=member` were added to `demo.ts` so every
screen can be walked without a real account for each. Walked at 1280px and
375px: directory, employee page, add (MM-007 generated), mark-as-resigned,
departments, the lead's four tabs, an ordinary member's three. Owner's app
re-checked because Rail is shared — unchanged. Console clean throughout.

Two mobile faults were found that way and fixed: the directory's search box
collapsed to an empty sliver at 375px, and `.section-tools` (one nowrap row,
right for two buttons) carried "Add employee" off the right edge.

### Open, deliberately

- **Nobody has `is_team_lead = true` yet.** Manage team is built and tested in
  demo, but has never run against real data. Setting it is two commented lines
  in `supabase/scripts/set_hr_person.sql`. Do not set it on the only ordinary
  member while testing RLS — check 3 then has nobody to run as.
- **The production `employees` table is empty.** HR enters the first records;
  the directory offers anybody who has a login but no record.
- **Still nobody has said what Production, Content Creation, Video Editors,
  Developers or AI Staff track.** Their leads get the roster and a line saying
  why. Ask one department at a time; do not invent a dashboard.
- Phases 2 to 5 (leave, salary, offer/joining, exit) are untouched. Each hangs
  off the employee page or a new rail item. **Confirm with Adarsh before
  starting Phase 2.**

---

# HR Phase 2 — leave (2026-09-06)

Built in the same session as this note, immediately after Phase 1. Two things
were fixed before any Phase 2 code, both found while reconciling this file
against the shipped code rather than guessed at:

1. **The chips on the employee page (`HrPage.tsx`, "Later phases") said
   "Documents · phase 4"; this file's phase order calls it "Onboarding".**
   Numbering already agreed (2/3/4/5) — only the name was off. Fixed to
   "Onboarding · phase 4", matching the Rail-item names this file already
   promised: *"Leave, Salary, Onboarding and Exits."*
2. **The owner had no route into `HrPage` at all.** Decision #2 from Phase 1
   ("HR and the owner both create and edit employee records") was never wired
   up — `App.tsx`'s owner branch only ever rendered Projects / ProjectShell /
   TeamPage. Phase 2 needs the owner to approve leave too, so this was a real
   blocker, not a nice-to-have. Fixed: a new `{ name: 'hr' }` route, an "HR"
   button on the owner's own `Rail` (between Team and Settings, only shown
   when `onOpenHr` is passed — HR's own rail never gets it), and
   `HrPage` takes an optional `onBackToProjects` that draws a "← Projects"
   button in its topbar, given only when the owner opens it.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0009_hr_leave.sql` | `leave_requests` table plus `employees.annual_leave_days`. Schema and RLS in one file, same discipline as 0006. Four policies: owner/HR read and write everything; anybody else reads only their own requests, can create one for themselves (always starting `pending` — nobody approves their own leave on the way in), and can cancel their own while it is still pending. No DELETE policy, same as `employees` — a mistaken request is cancelled, not erased. `days_count` is set by a trigger from the two dates, never trusted from the client. |
| `supabase/tests/0009_rls_checks.sql` | Nine checks, results as rows (0006's lesson about `RAISE NOTICE` applied from the start this time). SKIPPED, not a quiet PASS, when a needed person or employee record doesn't exist yet. **Not yet run against the live database** — same constraint as Phase 1: no `.env`, no project link here. Paste it into the Supabase SQL editor after 0009 and report the results back before trusting this in production. |
| `src/react/lib/hr.ts` | Added the leave vocabulary: `LeaveRequest`, `LeaveStatus`, `LEAVE_STATUS`, `usedLeaveDays()`. Balance is computed (entitlement minus this year's approved days), never stored — nothing to reconcile when a request changes. |
| `src/react/data/useLeaveRequests.ts` | Mirrors `useEmployees`: `create` (self-service, always pending), `decide` (HR/owner approve or reject, with an optional note), `cancel` (self, pending only). |
| `src/react/modals/LeaveRequestModal.tsx` | Dates + reason. No status field — the database decides what state it starts in. |
| `src/react/modals/LeaveDecisionModal.tsx` | One modal for both Approve and Reject, opened by whichever button was clicked. |
| `src/react/screens/HrPage.tsx` | New **Leave** rail item: company-wide table, KPIs (pending / on leave today / decided this month / total), approve/reject inline, and a "Log leave for…" picker so HR can record a request on behalf of anyone (useful for the no-login employees Phase 1 already allows). The employee detail page gained its own **Leave** section — entitlement / used / remaining and that one person's history — parallel to Directory and Departments being rail-level while Employment/Contact/Emergency contact are record-level. |
| `src/react/screens/Member.tsx` | Every non-owner, non-HR employee reaches this screen regardless of department (see App.tsx), so **Leave is a fifth tab here**, not gated by `isLead` — Overview, My leads, My sales, Manage team (leads only), Leave. Shows the same balance, a Request leave button, and Cancel on a pending request. `useEmployees` is now called unconditionally (`useEmployees(true)`) instead of `useEmployees(isLead)`, since everybody now needs their own record for their entitlement — RLS still hands back exactly one row to anyone who isn't HR, owner, or a team lead. |

## Verified in Chromium, not asserted

`?demo=1&as=hr`: directory → employee → Leave section (entitlement math right,
history right) → company-wide Leave rail page → approved a pending request,
KPIs updated live, toast fired. `?demo=1&as=member`: Leave tab → balance
correct against one cancelled demo request → filed a new request (balance and
tab badge updated) → cancelled it (status flipped, badge cleared). `?demo=1`
(owner): the new HR rail button reaches `HrPage`, directory loads, "←
Projects" returns to Projects. `?demo=1&as=lead`: Manage team re-checked
unchanged — regression clean. Mobile at 375px: HR's three tabs fit without
overflow; the member's tab strip already overflows past four tabs before this
phase (a team lead has Overview/My leads/My sales/Manage team) and Leave makes
it five — pre-existing horizontal-scroll behavior, not a new fault, and out of
scope for this phase to redesign.

## Deliberate calls, not asked because the brief already answered them

- **One leave type, no half-days, no working-day calendar.** The brief said
  "Requests, approve/reject, balance" — nothing about sick vs. casual vs.
  earned leave, or excluding weekends from the day count. Built the simplest
  version that is fully extensible later rather than guessing at a taxonomy
  nobody asked for.
- **18 days/year default entitlement**, editable per employee in
  `EmployeeModal` (HR/owner only, same as every other field there). Ordinary
  default, not a policy decision — change it per person any time.
- **No team-lead reach into Leave.** Phase 2's brief never mentioned a team
  lead approving their team's leave, unlike Manage team's read-only numbers.
  Skipped rather than invented; easy to add later if Adarsh asks.

## Open, deliberately

- **0009 has not run against the live database yet** — paste it and the test
  file into the Supabase SQL editor and report the results back before this
  phase is trusted with real employees.
- Phases 3 to 5 (salary, offer/joining, exit) are untouched.

---

# HR Phase 3 — salary (2026-09-06)

**Adarsh's answer, asked before writing a line of this phase:** should HR see
salary amounts, or only manage the process? *"Go with [HR sees amounts] —
under HR the company finance department also comes, so it will help. If owner
asks to not allow / restrict something, we can do it later."* That is the
access model below — restricting it later is a policy change to one RLS
clause, not a schema change.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0010_hr_salary.sql` | `salary_records` — one payslip per employee per month (unique index on `employee_id, period`). **The strictest table in the app**: owner and HR read and write everything; an employee reads only their own — and unlike `leave_requests`, has NO write path at all, not even to cancel a wrong entry. Reuses `my_employee_id()` from 0009. No DELETE policy — a wrong amount is corrected in place, never erased, because it is a financial record. |
| `supabase/tests/0010_rls_checks.sql` | Eight checks, results as rows. Confirms HR reads actual amounts (not just row existence), confirms a member is refused on create *and* update *and* delete with no exception, and confirms the one-payslip-per-month unique index holds. **Not yet run against the live database** — same constraint as Phases 1 and 2: paste 0010 then this file into the Supabase SQL editor and report the results back. |
| `src/react/lib/hr.ts` | Added `SalaryRecord`, `SalaryStatus`, `SALARY_STATUS`, `fmtPeriod()`, `currentPeriod()`. |
| `src/react/data/useSalaryRecords.ts` | Mirrors `useEmployees`/`useLeaveRequests` in shape, but `create`/`update`/`markPaid` are only ever called from `HrPage` — a member's own screen uses this hook read-only by construction, since RLS refuses every write from them anyway. |
| `src/react/modals/SalaryRecordModal.tsx` | Add or correct one payslip: month, gross, net, notes. No status field — a new payslip always starts pending; "paid" is a separate one-click action on the row, not a form field. |
| `src/react/screens/HrPage.tsx` | New **Salary** rail item: company-wide table, KPIs (pending / paid this month / payroll this month / total payslips), "Add payslip for…" picker, inline Mark paid and Edit. The employee detail page gained its own **Salary** section — that one person's payslip history — same parallel structure as Leave (rail-level company view + record-level personal section). |
| `src/react/screens/Member.tsx` | **Salary is a sixth tab**, read-only: month, net, gross, status. No buttons of any kind — there is nothing this screen is allowed to do to this data. |

## Verified in Chromium, not asserted

`?demo=1&as=hr`: Salary rail page shows all 12 demo payslips (two months ×
six people) with correct KPIs → marked one paid, KPIs updated live → opened
Mohit Verma's record, added a third payslip (Jul 2026) via the modal, count
went from 2 to 3. `?demo=1&as=member`: Salary tab shows exactly that person's
two payslips, amounts correct, **no edit or mark-paid controls present** —
confirms the RLS design (no self-write path) is mirrored in the UI, not just
enforced underneath it.

## Deliberate calls, not asked because the brief already answered them

- **Gross and net entered directly by HR**, no deductions breakdown (PF/ESI/
  TDS aren't specified anywhere and vary by how Adarsh actually runs payroll
  today) — two numbers, not an invented computation between them.
- **One payslip per employee per month**, enforced by a unique index rather
  than left to convention.

## Open, deliberately

- **0010 has not run against the live database yet** — same as 0009, paste
  and report back before trusting this with real money.
- Phases 4 and 5 (offer/joining, exit) are untouched.

---

# HR Phase 4 — offer, onboarding checklist, documents (2026-09-06)

The phase Phase 1 explicitly deferred here: *"PAN, Aadhaar, bank and
documents wait for Phase 4 (they need file storage and stricter rules)."*
No new decision was needed from Adarsh — the brief ("offer letter records,
onboarding checklist per new hire, documents collected") was specific enough
to build directly, with two scope calls recorded below rather than guessed at
silently.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0011_hr_onboarding.sql` | Three things in one file: two optional offer dates on `employees`; `onboarding_tasks` (one row per checklist item, auto-seeded with five defaults by a trigger on every new employee, backfilled for the six who already existed); `employee_documents` metadata plus a **private** `employee-documents` storage bucket with its own RLS on `storage.objects`. Every write to either table is owner/HR-only — like salary, an employee has no path to tick their own box or upload their own document; unlike salary, HR/owner **can** delete a checklist item or a document record, because a checklist entry is process tracking, not a financial fact. |
| `supabase/tests/0011_rls_checks.sql` | Nine checks on the two Postgres tables, results as rows. Storage bucket policies are not simulated (that needs the real upload API, not a raw SQL insert) — the migration's own "proof" section confirms the four storage policies exist; verify one real upload through the UI as HR before trusting it. **Not yet run against the live database.** |
| `src/react/lib/hr.ts` | `OnboardingTask`, `DocType`, `DOC_TYPE`, `EmployeeDocument`; `offerExtendedOn`/`offerAcceptedOn` added to `Employee`. |
| `src/react/data/useOnboardingTasks.ts`, `useEmployeeDocuments.ts` | Same shape as the other Phase 2/3 hooks. `useEmployeeDocuments` calls `supabase.storage` directly for upload/remove/signed-URL, alongside the metadata table — the two always move together. |
| `src/react/modals/DocumentUploadModal.tsx` | Doc type + file picker. HR/owner only — there is no self-service variant. |
| `src/react/screens/HrPage.tsx` | New **Onboarding** rail item: company-wide roster with each active person's task completion and document count, linking into their own record. The employee page gained an **Offer & onboarding** section — offer dates, an inline checklist (checkbox + remove, plus an "Add task" input for anything beyond the seeded five), and a document list with upload/remove. |
| `src/react/screens/Member.tsx` | **Onboarding is a seventh tab**, entirely read-only: checklist shown as done/not-done chips, documents listed with type and date. No controls of any kind — same reasoning as Salary. |

## Verified in Chromium, not asserted

`?demo=1&as=hr`: Onboarding rail page (roster, completion counts) → opened
Sneha Kulkarni (the one demo employee seeded partway through, 2/5 done) →
ticked a checkbox (state flipped, confirmed via the DOM, not just visually) →
added a custom task ("Signed NDA") → removed it again. `?demo=1&as=member`:
Onboarding tab shows exactly that person's own checklist and one document,
**no edit/upload/remove controls present** — same confirmation pattern as
Phase 3, that the RLS design is mirrored in the UI rather than only enforced
beneath it. Mobile at 375px: the new section reflows cleanly; the HR mobile
tab strip is now five items and overflows past the visible width the same
way the member's tab strip already did from Phase 2 on — pre-existing
horizontal-scroll behavior, not a new fault, and still out of scope to
redesign in this pass.

## Deliberate calls, not asked because the brief already answered them

- **No candidate/applicant pipeline before an employee record exists.** Rule 4
  for this whole module says these phases are sections on the *same* employee
  record, not new entities — so "offer letter records" became two dates on
  the existing record, not a new pre-hire stage.
- **A fixed five-item default checklist** (offer letter, ID proof, bank
  details, equipment, induction), auto-seeded per employee, but freely
  editable — HR can add or remove items per person. Generic defaults rather
  than an invented rigid process, extensible rather than locked.
- **HR/owner upload every document; there is no employee self-upload.**
  "Documents collected" reads as HR's job in the brief (an employee hands over
  the physical document or scan) — consistent with the strict, no-self-write
  shape Adarsh confirmed for salary being the right default for anything
  identity- or money-adjacent, restrictable further later if he wants it
  looser instead (e.g. letting an employee upload their own PAN card).

## Open, deliberately

- **0011 has not run against the live database yet**, storage bucket
  included — paste it and the test file into the Supabase SQL editor, then
  do one real upload through the HR UI as a manual check the automated tests
  can't cover, and report both back before trusting this with real documents.
- Phase 5 (exit) is untouched.

---

# HR Phase 5 — resignation, notice period, exit checklist (2026-09-06)

The last phase in the plan. Marking somebody inactive already existed from
Phase 1 (`employees.status = 'resigned'`, the record kept forever, "Mark as
resigned" already a button on the employee page) — this phase is what
happens around that moment, not a replacement for it.

**One privacy call, made rather than asked**, because it only narrows access
beyond what anyone requested and is trivially loosened later if Adarsh wants
it: the REASON someone left, and any exit-interview notes, can carry HR's
frank and possibly unflattering assessment — so `exit_records` has no
self-select policy at all. Not "the employee sees a filtered version"; they
get zero rows if they ever query that table. The procedural facts —
resignation date, notice period, last working day — live on `employees`
itself instead, which an employee already reads about themselves; they are
told nothing they don't already know from having lived through it.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0012_hr_exit.sql` | Two new `employees` columns (`resignation_date`, `notice_period_days`); `exit_records` (HR/owner read AND write — no employee branch on SELECT at all, the only table in this module shaped that way); `exit_tasks` (same shape as `onboarding_tasks` — HR/owner manage, employee reads only their own). A trigger seeds the six-item exit checklist the first time anybody's status leaves `'active'`, whether they land on `'notice'` or jump straight to `'resigned'` — so the checklist is live during the notice period, not sprung on the last day. Backfilled for anyone already not-active. |
| `supabase/tests/0012_rls_checks.sql` | Eight checks. The one that matters most: confirms an employee reading `exit_records` for their own id gets **zero rows**, not a redacted one. Flips a real member's status to `'notice'` and back to actually exercise the seed trigger, guarded so it only ever touches somebody who had no exit checklist yet, and cleans up afterward. **Not yet run against the live database.** |
| `src/react/lib/hr.ts` | `ExitTask`, `ExitRecord`; `resignationDate`/`noticePeriodDays` added to `Employee`. |
| `src/react/data/useExitTasks.ts`, `useExitRecords.ts` | The first mirrors every other Phase 2–4 hook. The second has no self-service caller anywhere in the app — it is only ever imported into `HrPage`, because there is nothing for a member's own screen to call that RLS would honor. |
| `src/react/screens/HrPage.tsx` | New **Exit** rail item: everybody currently on notice or resigned, with checklist progress. The employee page gained an **Exit** section, shown only once `status !== 'active'` — resignation date, notice period, last working day, rehire eligibility, the reason (if one was given), and the checklist. The existing "Mark as resigned" modal now also asks for resignation date, notice period, a reason (labelled, in the modal itself, as HR/owner-only), and a rehire-eligible checkbox — one action, not a separate two-step notice-then-exit flow, since the brief didn't ask for a state machine, only for these facts to be recorded. |
| `src/react/screens/Member.tsx` | **Exit is an eighth tab — shown only when that person's own status is not `'active'`.** An active employee never sees it; showing "Exit" to someone who isn't leaving would read as a strange, unprompted question. Read-only: status, resignation date, notice period, last working day, and the checklist as done/not-done chips. Never queries `exit_records` at all — the privacy design is enforced by what the screen doesn't ask for, not by a policy silently returning nothing underneath it. |

## Verified in Chromium, not asserted

`?demo=1&as=hr`: Exit rail page (Imran Shaikh, seeded partway through demo
data, 2/6 done) → opened his record, confirmed resignation date/notice
period/last working day/rehire/reason all render → ticked a checklist item,
confirmed via the DOM. Ran the enriched "Mark as resigned" flow on Arjun
Mehta end to end: filled notice period + reason, confirmed, watched his
status flip to Resigned and a new **Exit** section appear on his own record
with everything just entered, reason included. Confirmed by reading the
component tree that `Member.tsx`'s Exit tab never imports or queries
`exit_records` — the reason field literally cannot reach that screen, not
just isn't shown by it. Mobile at 375px: the Exit rail page reflows cleanly;
the HR tab strip is now five items wide and overflows, same pre-existing
pattern noted in Phases 2–4.

One demo-only gap, not a real one: `useExitTasks`'s demo branch returns a
static seeded list rather than actually running the database trigger, so
resigning somebody fresh in `?demo=1` (like Arjun, above) shows an empty
checklist instead of the auto-seeded six — the real database trigger in 0012
does not have this limitation, only the demo data does.

## Deliberate calls, not asked because the brief already answered them

- **No separate "start notice" / "confirm exit" workflow.** The brief listed
  "notice period" as a fact to record, not a state machine to build. One
  enriched "Mark as resigned" action captures it; `employees.status` already
  supports `'notice'` as a value HR can set via the ordinary Edit form if they
  want to reflect somebody serving notice before this action is taken.
- **A fixed six-item default exit checklist**, editable the same way
  onboarding's is not (no add/remove UI was built for this one, since the
  brief's checklist items — assets returned, access revoked, settlement, exit
  interview, experience letter — read as closer to a fixed compliance list
  than onboarding's more variable one). Revisit if Adarsh wants per-person
  customization here too.

## The whole module, now that all five phases exist

| Phase | Rail item | Employee-record section | Employee's own tab |
|---|---|---|---|
| 1 | Directory, Departments | — | (their record itself) |
| 2 — Leave | Leave | Leave | Leave (request/cancel) |
| 3 — Salary | Salary | Salary | Salary (read-only) |
| 4 — Onboarding | Onboarding | Offer & onboarding | Onboarding (read-only) |
| 5 — Exit | Exit | Exit (once not active) | Exit (read-only, once not active) |

Every migration from 0009 through 0012 still needs to be pasted into the
Supabase SQL editor and its test file run, in order, with results reported
back — none of them have touched the live database yet. Still open from
Phase 1 and never revisited in this session: Production, Content Creation,
Video Editors, Developers and AI Staff still have no defined dashboard
content, and the owner-into-HrPage route added in Phase 2 means the owner can
now reach every one of these five phases the same way HR does.

---

# HR Phase 6 — attendance: punch in, punch out, and the geofence (2026-09-12)

The paper register goes away. Adarsh's brief, in his words: everybody logs in,
presses punch in when they reach the office and punch out when they leave;
somebody who is not at the office must not be able to register attendance; HR
sets the office location and the radius; a punch out asks "are you sure"; HR
can correct a time by hand; three shifts (09:30 / 10:00 / 10:30); nine hours
makes a full day; seven minutes of relaxation, past which the day is a late
coming and the late comings are counted.

## The one thing to say out loud about this feature

**A browser location can be faked.** Devtools on a laptop, a mock-location app
on a rooted Android. Nothing written here changes that, and the client should
hear it from us rather than discover it. What IS true:

- The distance is computed **in the database**, in `punch_in()` / `punch_out()`,
  not in the page. A hand-made REST call with "I am at the office" in it gets
  the same check.
- The **time comes from `now()` inside the function.** The phone's clock is
  never read, so changing it does nothing.
- **An employee has no insert and no update policy on `public.attendance` at
  all** (0013). The two security-definer functions are the only way a row can
  appear. This is the whole design: the geofence is not UI, it is RLS.
- The **accuracy filter** is the practical anti-spoof measure. A phone on GPS
  knows itself to ~10–30 m; a laptop guessing from wifi, and most fake-location
  setups, report something much vaguer. Anything worse than
  `max_accuracy_meters` (default 100) is refused with "step outside and try
  again". HR can raise it, and the modal says plainly that raising it a lot
  makes punching easier and the record weaker.
- Every punch stores its **raw coordinates, accuracy and computed distance**,
  and every row says whether it came from the geofence (`source = 'self'`) or
  from HR (`'hr'`). That is what a dispute is settled with.

Genuinely spoof-proof needs a native app with device attestation, or a fixed
tablet at the door. Not a browser. Say so before anybody assumes otherwise.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0013_hr_attendance.sql` | `attendance_settings` (one row, enforced by a boolean primary key: office lat/lng, radius, grace, required and half-day minutes, accuracy ceiling, week offs, timezone), `shifts` seeded with the three, `employees.shift_id`, `holidays`, `attendance` (one row per person per day, unique on it), `attendance_edits` (before/after JSON of every HR change). `meters_between()` is haversine in plain SQL — no extension to enable on somebody else's project. `grade_attendance()` is the single grading rule, used by punch-out AND by HR's correction so a fixed day is judged like any other. `punch_in()` / `punch_out()` return jsonb rather than raising, because "you are 3 km away" is a normal thing to tell somebody, not a 500. `finalize_open_attendance()` settles yesterday's unclosed days (a free plan has no cron, so the HR screen calls it). |
| `supabase/tests/0013_rls_checks.sql` | Sixteen checks. The ones that matter: a member cannot INSERT or UPDATE attendance at all; punch_in from 3 km away is refused; punch_in with a 2 km accuracy fix is refused; inside 50 m it records and stores the evidence; a second punch-in is refused; the four grading rules (09:35 on a 09:30 shift with 9 h → present; 09:50 → late; on time but 5½ h → half day; never punched out → in_progress); an HR correction lands in `attendance_edits` AND is re-graded; a member cannot move the office location. Borrows a real member, moves the office to a test coordinate, puts everything back. **Not yet run against the live database.** |
| `src/react/lib/attendance.ts` | Types, `ATT_STATUS` read through `statusChip()` (a status from a newer migration must not blank the screen), `getFix()` with `enableHighAccuracy` and `maximumAge: 0` — a cached fix from an hour ago is not evidence of standing in the office — and three distinct permission/unavailable/timeout messages, because the fix for each is different. |
| `src/react/data/useAttendance.ts` | Rows, settings and shifts in one hook. `punchIn`/`punchOut` call the RPCs and then **re-read** rather than patching the response in: the database decided the status, and guessing it here is how two truths start to exist. |
| `src/react/components/PunchCard.tsx` | The employee's whole day. Phone-first: 52px button, a running clock while they are in, the distance rule stated in plain words, and a **confirm step on punch out** showing how far short of a full day they are — the mistaken-punch-out case Adarsh called out by name. |
| `src/react/modals/AttendanceSettingsModal.tsx` | HR stands in the office and presses "Use my current location". Typing coordinates is not a thing to ask of anybody and a map picker is a third-party script this app does not load. A fix worse than 50 m is refused **as the office centre** — it would move the whole fence. |
| `src/react/modals/AttendanceEditModal.tsx` | HR's correction. A reason is required, not optional — a trail of timestamps with no "why" is not a trail. Leaving Status on "work it out from the times" re-grades by the ordinary rule; picking one says something the clock cannot (on leave, holiday). |
| `src/react/screens/sections/HrAttendance.tsx` | One day across everybody, not a month grid — the question at 10am is "who is in and who is not". People with no row show as **Not in** with an "Add day" button; everybody else sorts in-office → recorded → absent. A Distance column shows `16 m ±17`, which is also how you notice somebody punching from 49 m away every single day. |
| `HrPage.tsx` / `Member.tsx` | A rail item and a mobile-nav entry for HR; an **Attendance tab, second** in the employee's own app — it is what they open the app to do. Each person's own record page gained an Attendance section: this month's tiles, then the days. |

## Decisions made rather than asked

- **The fence applies on the way out too.** Punching out from the bus would
  make the last hour of every day unverifiable.
- **"Late coming" counts arrivals, not days graded late.** Somebody who comes
  in at 11 and leaves at 4 is a half day AND a late arrival; counting only the
  first hides exactly what HR is looking for.
- **`late_minutes` is measured past the grace period, not past the shift.**
  Inside the relaxation it is zero, not "4 minutes late" — a day nobody
  considers late should not carry a number.
- **Short of the full day but past half of it is `half_day`; below that is
  `absent`.** Both thresholds are settings, not constants.
- **A day HR typed is labelled as such on the employee's own screen too.** They
  are entitled to see which of their days came from the geofence.

## Verified in Chromium, not asserted

Demo mode, both roles, at 375px and desktop. Member: punch in → `0h 00m` and
"In office" → punch out → confirm modal states how short the day is → recorded
and graded. HR: today's list with five in the office, one late, one with no
punch; correction modal **refuses to save without a reason**; corrected day
re-graded to Half day and relabelled "HR entry"; a correction that picks
"On leave" keeps that status instead of re-grading; settings modal captured a
location, saved, and the toast confirmed. No horizontal overflow at 375px on
either screen. `tsc --noEmit` clean, `npm run build` clean.

Two real bugs found by testing rather than reading: a day that had just started
rendered as `—` instead of `0h 00m` (the dash meant "no hours", which is a
different fact), and the demo correction path spread `status: undefined` over
the row and took the screen down — fixed at the cause, plus `statusChip()` so
an unknown status can never do it again.

## Still open on attendance, deliberately

- Nobody has run 0013 or its test file against the live database yet. Same
  backlog as 0009–0012.
- **Week offs and holidays have a column and a table but no UI** — a Sunday
  simply has no rows. Absence reporting needs them; nobody has asked for
  absence reporting yet.
- No monthly export. When payroll wants it, it is a CSV of what is already on
  screen.
- Team leads cannot see their department's attendance. One policy, when asked.

## The rest of the brief, not yet built (phases 7–9)

Recorded here so the next session does not have to re-derive it from the voice
note:

- **Phase 7 — leave, finished.** Today a request goes to HR/owner. Adarsh wants
  an **assigned manager**, picked by name or employee ID from a dropdown, who
  approves it; pending shows amber, approved green, on the employee's own
  dashboard. Needs `leave_requests.approver_id`, a policy letting that person
  (and only that person, plus HR/owner) decide it, a leave TYPE (sick / casual /
  unpaid), and the day count excluding week offs and holidays.
- **Phase 8 — the joining form.** What exists today is HR adding an employee and
  ticking an onboarding checklist. What Adarsh wants is a **public link HR sends
  on WhatsApp**: the candidate fills it in, uploads documents (the form cannot
  be submitted until they do), sets their own password, and gets nothing until
  HR approves. On approval they are emailed their employee ID, with a resend
  button. Real work: a public-write table for applications, anonymous document
  upload into a quarantined bucket, an approval step that creates the auth user,
  and an email path (the app has no transactional email yet — this is the piece
  with an external dependency).
- **Phase 9 — sign in with employee ID or email.** Supabase Auth is email-keyed,
  so MM-004 has to be resolved to an email first — a `security definer` RPC that
  takes a code and returns only the work email, rate-limited, plus "change
  password" in the profile modal.

Do them in that order: 7 is small and closes a module that is already live, 8 is
the one with an external dependency, 9 depends on 8 having created the accounts.

---

# Phase 6b/6c — two branches, the QR punch, and four-digit IDs (2026-09-12)

Adarsh, same day, after seeing Phase 6: Metrol has two offices (Noida Sector 6
and Sector 10), a third is likely, each has its own location; HR assigns a
person to a branch; somebody sitting at the other branch for a day should still
work. Then: a QR poster per office, scanned to punch in and scanned again to
punch out, with the location still checked. And employee IDs as four random
digits, not MM-001.

## Branches — the office stops being a setting

`attendance_settings` held one office because there was one. That was the wrong
shape the moment there were two, so `office_locations` is a table: name,
address, coordinates, **its own radius** (a small office off a main road and a
floor in a tower do not deserve the same fence), active flag, QR token. The old
`office_*` columns are **dropped** in 0014 — a location with two homes is a
location that disagrees with itself within a month. A third branch is one row
from the Branches screen: no migration, no code change.

`employees.office_id` says where somebody works. `attendance.office_id`
snapshots where the day was actually measured — a transfer next month must not
rewrite where somebody stood today, and it is also what records the flexible
case the client asked for. `resolve_punch_office()` is the single place that
decides: your own branch if you are standing in it, otherwise any active branch
you are standing in (`allow_any_branch`, on by default and switchable), and the
punch **says so out loud** — "Punched in at Noida Sector 10 — not your usual
branch. It is recorded that way." HR's table shows it as "Sector 10 (visiting)".

Branches are never deleted — attendance rows point at them and history must not
lose where it happened. Closing one is `is_active = false`.

## The QR punch — and what it is actually worth

**The QR is not the security.** Anybody can photograph a printed poster. What
makes it worth having is that `punch_by_qr()` measures the phone against *that*
branch exactly like the button does, so a photographed code scanned from home is
refused for being 8 km away. The code's job is to say WHICH branch, instantly,
without the app guessing. The geofence still says whether you are in it.

- One function for both directions, because that is how a poster is used: no
  row yet means arriving, an open row means leaving, a closed day says so.
- A scan **within 2 minutes** of punching in is refused as a double-scan rather
  than closing somebody's day and making HR fix it.
- `punch_in_method` / `punch_out_method` record button / qr / hr, and HR's table
  shows it. The button is untouched — Adarsh's call is that both exist and each
  office uses whichever it prefers.
- If a printout walks, **Make a new code** rotates the token and every photocopy
  stops working.
- `jsQR` over the browser's BarcodeDetector: that API is Chrome-only and half
  the office is on an iPhone. One code path that works everywhere beats a fast
  path plus a fallback nobody tests. Frames are downscaled to 480px before
  decoding — full-resolution scanning on a mid-range phone buys nothing.

## Employee IDs

MM-001 tells anybody holding two ID cards who joined first, how many people work
here, and what the next number will be. Now four random digits, 1000–9999, with
a retry loop on collision and the unique index as the backstop. Existing
sequential codes are converted by 0015 so the company does not end up with two
styles of ID; nothing joins on `employee_code`, it is only ever displayed.

## Answers Adarsh gave, now settled

- **Sunday is the only week off.** (`week_offs` already defaults to `{0}`.)
- **HR approves leave**, not a line manager — so Phase 7's approver work is
  smaller than planned: the assigned-manager dropdown is not needed yet.
- **Resend** is the email service (they have a subscription). Used for the
  joining-form approval mail in Phase 8.

## Verified in Chromium

Demo now carries two branches with three people each. HR: branch list with
head-counts, per-branch radius, Branch column showing "(visiting)" when a day
happened at the other office, How column showing QR scan vs Button, branch
filter, and the QR poster rendering at 640px with Print and rotate. Member at
375px: the card names the person's branch, both Punch in and Scan office code
are there, and the scanner degrades to a plain sentence when the camera is
refused — which is what a staff member who denies permission will see.

**The camera itself could not be tested here** (the preview pane blocks capture).
What WAS tested is the pair it depends on: a token rendered by `QrPoster` and
decoded by `QrScanner`'s exact jsQR call round-trips byte for byte. First scan
on a real phone is still the thing to watch.

## One file to run

Running 0013, 0014 and 0015 separately is what failed the first time — 0014
needs 0013's tables and the SQL editor rolled the whole thing back. They are
concatenated in order as **`supabase/RUN-THIS-attendance.sql`**, safe to run
more than once. Use that, not the three files, when talking Adarsh through it.

## Installed on the live database — 2026-09-12

`RUN-THIS-attendance.sql` (0013 + 0014 + 0015) ran clean against the Metrol
Media project. Proof came back: both punch-method columns present,
`punch_by_qr` exists, zero sequential employee codes remaining, the one real
employee record converted to a random four-digit code (6068), zero branches —
which is correct, HR creates those from the Branches screen.

### The RLS test file — rewritten for office_locations (2026-09-12)

The old `supabase/tests/0013_rls_checks.sql` saved and restored
`attendance_settings.office_lat / office_lng / radius_meters`, which 0014
dropped. It errored on its first statement, so for six days the security claim
of this whole module rested on reading the policies rather than exercising
them. Rewritten in place — **same path**, so nothing else has to change.

What it does now: creates two throwaway branches (`ZZ Test Branch A` / `B`) at a
Jabalpur-ish coordinate ~800 km from the real Noida offices, so no real branch
can ever be the one a test punch resolves to; borrows one real member whose
employee record is `active` or `notice`; assigns them to Branch A for the run;
and puts everything back — branches deleted, the member's own branch restored,
`max_accuracy_meters` and `allow_any_branch` restored, every test row removed.
Dates are in 2099 wherever a date can be chosen. **It never touches a member who
already has a real row for today** — every punch check reports SKIPPED instead.
The whole thing is one `do` block, so an uncaught error rolls back the test
branches too: it cannot leave the fence half-moved.

Twenty-six checks. The new ones over the old file:

- `has_function_privilege` on `punch_in` / `punch_out` / `punch_by_qr` **first**.
  A missing grant makes every later call raise, which aborts the `do` block and
  prints nothing at all — which is precisely how the old file managed to be
  useless without anybody noticing. This one names the cause.
- a member cannot INSERT into `office_locations` (invent a branch at their house)
- a member cannot UPDATE one (move a branch, or widen its radius to 5 km)
- a member cannot loosen `attendance_settings` (`max_accuracy_meters`, grace)
- a member cannot call `rotate_office_qr`
- rotating actually changes the token — run through the RPC as HR, so the
  rotation path is proven and not just the refusal
- `punch_by_qr()` with a **valid** code from 3 km away is refused
- `punch_by_qr()` with a **rotated-away** code is refused, while standing at
  that very branch — the photocopied-poster case
- `allow_any_branch = false`: a Branch-A person scanning Branch B's code is
  refused, **and no row is written by the refusal**
- `allow_any_branch = true`: the same scan lands, and `attendance.office_id`
  records **Branch B**, not their assigned branch
- a second scan within 2 minutes is refused as a double-scan, **and the day is
  still open** — not closed for HR to fix
- the button punch stores `punch_in_method = 'button'` and the scan stores
  `'qr'`, so the How column on HR's table is proven, not assumed

Everything the old file checked is kept: the haversine sanity pair, a member
cannot insert or update `public.attendance` at all, `punch_in` too_far /
weak_fix / inside-records-it / already_in / punch_out-grades-it, the four
grading rules, an HR correction landing in `attendance_edits` and being
re-graded, and a member reading nobody else's day.

**It has NOT been run yet.** There is no Postgres, no Docker and no `.env` on
this machine, so it was structurally linted (block nesting balanced, dollar
quotes paired) and not executed. Until Adarsh pastes it into the SQL editor and
the rows come back, the geofence is still only verified by reading the policies.
Say that plainly rather than implying the module is proven.

---

# HR Phase 7 — leave, finished (2026-09-12)

The phase this file has been carrying since Round 6's handoff note. Adarsh
settled every open question before a line was written, so these are decisions,
not guesses — **do not re-ask them**:

1. **HR (and the owner) approve.** Not a line manager. So there is no
   `approver_id`, no approver dropdown and no per-request routing; 0009's
   policies already said exactly this and were left alone. The
   "assigned manager" idea in the old Phase 7 note is **dropped**, on his word.
2. **Sick and casual share ONE entitlement** (`employees.annual_leave_days`,
   18 by default).
3. **Unpaid does not touch that balance.** It is recorded, counted and shown on
   its own, because taking leave without pay is not spending a paid day.
4. **HR enters the holiday list themselves.** Nothing seeded — a company's
   closures are its own, and a pre-loaded national-holiday list would have to
   be pruned before it was true.

Pending-amber / approved-green was **already** right (`LEAVE_STATUS` has used
`chip--warn` / `chip--good` since Phase 2). Confirmed on screen rather than
taken from the code, and not rebuilt.

## What shipped

| File | What it is |
|---|---|
| `supabase/migrations/0016_leave_types_and_working_days.sql` | `leave_requests.leave_type` (`sick`/`casual`/`unpaid`, defaulted to casual, constrained); `working_days_between(date,date)` — Sundays via `attendance_settings.week_offs`, holidays via the `holidays` table; `set_leave_days_count()` rewritten to use it. **It recounts every existing row**, which changes historical day counts on purpose: two arithmetics inside one balance would be worse. `security definer` deliberately — both tables it reads are select-true today, but a tightened policy later must not silently make holidays count as working days. |
| `supabase/tests/0016_rls_checks.sql` | Fourteen checks. The two that matter: a member sending `days_count = 99` with a one-day request gets **1** stored, and a member **cannot** turn their own pending request into an approved one — the regression test 0009's policy never had. Also: the Saturday-counts rule, a holiday removing a day, an invented leave type refused, no-type defaulting to casual, a member unable to enter or remove a holiday, HR able to decide, and a member reading nobody else's requests. **Not yet run against the live database.** |
| `src/react/lib/hr.ts` | `LeaveType`, `LEAVE_TYPE`, `isPaidLeave`, `unpaidLeaveDays()`, and `workingDaysBetween()` — the last is for the **form's preview and demo mode only**. The stored number is always the trigger's, and the hook re-reads the saved row, so a drift between the two leaves the record right and only a sentence wrong. |
| `src/react/data/useLeaveRequests.ts` | Maps `leave_type`; the draft carries it; `days_count` is deliberately **not sent** on insert. |
| `src/react/data/useAttendance.ts` | Now also loads `holidays`, with `addHoliday` (upsert — the date is the PK, so entering a day twice is not an error in HR's face) and `removeHoliday`. It went here, not into a hook of its own, because this hook already owns `week_offs` and a leave count needs both together or it is wrong — and every screen that asks about leave already calls it. |
| `src/react/lib/attendance.ts` | `Holiday`. |
| `src/react/modals/LeaveRequestModal.tsx` | A three-way type picker and the sentence that **is** this phase: *"5 working days — 1 Sunday and Diwali are not counted."* Refuses to send a range that is all Sundays and holidays, naming the day when it is only one. |
| `src/react/modals/LeaveDecisionModal.tsx` | Now says the **type** in the header — approving three unpaid days is not the same decision as three sick ones — and an extra line for unpaid saying it takes nothing out of their balance. The raw ISO dates that used to be in the subtitle (`2026-11-02 to 2026-11-02`) moved into the body through `fmtDate`; they read like a database field. |
| `src/react/screens/HrPage.tsx` | A **Type** column on the company-wide table, an **Unpaid taken** field on the employee record's Leave section, and the **Holidays** list — add, remove, with the consequence stated: changing the list changes how *new* requests are counted, and decided ones keep the number they were approved with. |
| `src/react/screens/Member.tsx` | The Entitlement tile folded into Remaining's own sub line (*"15 — of 18 paid days this year"*) to make room for an **Unpaid** tile; the type named in bold on each request row rather than given a second chip, because that row already carries a status chip and sometimes a Cancel button at 375px. |
| `src/prototype.css` | `.seg--form` (the segmented control as a form choice: full width, equal thirds, 34px instead of the topbar's 26px — a modal a salesperson fills in on a bus needs a real touch target), `.field-hint`, `.hol-add`. |

## Judgement calls worth Adarsh seeing

1. **No holidays rail item.** The list sits on the Leave page, because the only
   thing it changes is how leave is counted and that is the page somebody is
   already on when they think about it. One fewer nav item.
2. **Removing a holiday does not rewrite decided requests.** The trigger only
   fires when the dates change, so an approved 4-day request stays 4 days. That
   is the honest behaviour — a number somebody was told and agreed to should not
   move under them — and the card says so in words.
3. **Not built, noted instead:** half-day leave, carry-forward, a month
   calendar view, per-type approval routing. None were asked for.

## Two real bugs found by testing, not by reading

1. **"2 Sundays is not counted."** The verb keyed off how many *phrases*
   described the exclusions, not how many *days* were excluded — one phrase
   reading "2 Sundays" still takes a plural verb. This is the Round 19 failure
   mode exactly, and it only appeared because the modal was driven through
   one-Sunday, two-Sunday and one-holiday ranges rather than looked at once.
2. **`.hol-add` had no CSS at all.** `.input` is `width:100%`, so on a 1280px
   screen the date, the name and the button stacked as three full-width rows.
   Measured, not eyeballed — it looked deliberate in a screenshot. Now one row
   on a laptop, wrapping to two on a phone.

Also fixed in passing: the holiday row put the full date in `.ov-n`, a slot
sized for a number like "34", so "21 Oct 2026" shouted and the holiday's name
whispered. Name first now, matching a leave row on the employee's own screen.

## Verified in Chromium, not asserted

`tsc --noEmit` and `npm run build` both clean.

`?demo=1&as=member` at 375px: Remaining 15 of 18, Used 3, Unpaid 2, Pending 0 —
and 18 − 3 = 15 with the 2 unpaid days **not** deducted, which is decision 3
proved arithmetically rather than described. Filed an unpaid request over a
weekend: preview said *"3 working days — 1 Sunday is not counted"*, the row
landed as `3d Unpaid … Pending` with an amber chip, Pending went to 1, Remaining
did **not** move (pending deducts nothing), the tab badge read `Leave 1`.
Cancelled it: status flipped, badge cleared. A Sunday alone and Diwali alone
were each refused by name with Send disabled.

`?demo=1&as=hr`: Type column present; Arjun's 20–24 Oct reads **4 days**, not 5,
because Diwali sits inside it. Approved a request — modal reads
*"Arjun Mehta · Casual leave / 20 Oct 2026 – 24 Oct 2026 · 4 working days"* —
Pending 2→1, Decided this month 0→1. Logged leave for somebody else as unpaid
and the approval modal carried the unpaid line. Added a holiday (appeared in
date order, toast fired, inputs cleared), removed it, emptied the list entirely
and got *"No holidays entered yet, so leave counts currently skip Sundays
only."* `?demo=1` (owner) reaches the same page through the rail's HR button.

375px and 1280px, light and dark, `scrollWidth === clientWidth` on every screen
touched. Singular/plural checked deliberately at 1 day, 1 Sunday and 2 Sundays.
Only console error throughout: the Google Fonts stylesheet this sandbox blocks
(`index.html:14`), pre-existing and fine on Vercel.

## Noted for the UI/UX pass (item 4), not changed here

- **`.btn--sm` is 28px tall.** The Cancel button on a pending leave row measures
  28×59 at 375px, well under a comfortable touch target. It is a global class
  used everywhere, so moving it is the layout pass's job, not this phase's.
- **The employee tab strip is now seven items** (Overview, Attendance, My leads,
  My sales, Leave, Salary, Onboarding) and scrolls off both edges at 375px —
  the pre-existing overflow noted since Phase 2, now definitely worth solving.
- **A salary row wraps to 77px** at 375px while its neighbour is 49px, because
  "Net ₹28,520 · Gross ₹31,000" breaks mid-line.

## Open

- **0016 and its test file have not been run against the live database.** Same
  backlog as the rewritten `0013_rls_checks.sql`. Nothing here is proven until
  both come back as rows.
## Install state — CONFIRMED against the live database, 2026-09-12

`supabase/WHATS-INSTALLED.sql` was run and **0016 was run**. Both came back
clean. This replaces every earlier claim in this file about what has and has not
touched the database — several of which were wrong. Do not re-derive it:

- **Migrations 0006 through 0016 are ALL installed.** `employees`,
  `leave_requests`, `my_employee_id()`, `salary_records`, `onboarding_tasks`,
  `employee_documents`, `exit_records`, `attendance`, `holidays`,
  `office_locations`, `punch_by_qr()`, `leave_type`, `working_days_between()` —
  every one present, and the dropped `attendance_settings.office_lat` confirmed
  gone. **The repeated "0009–0012 have never run" note in the Phase 2–5
  sections above is FALSE** and was corrected by measurement, not argument.
- **0016's own arithmetic proved itself on the live database**: Mon→Fri = 5,
  Fri→Mon = **3** (Saturday in, Sunday out), a Sunday alone = 0.
- **`leave requests recounted: 0`.** There are zero leave requests company-wide,
  so 0016's recount changed no historical number. The risk flagged when it was
  written did not materialise and cannot now.

### What the data says, and what it blocks

| | Count | What it means |
|---|---|---|
| office branches | **0** | **Attendance is inert.** `punch_in()` returns `no_office`; nobody can punch anything until HR stands in an office and saves it from the Branches screen. A physical errand, not code. |
| employees on record | **1** | **Both RLS test files will mostly report SKIPPED.** They borrow a real ordinary member (`role = 'member'`, department ≠ Human Resources, employee status active/notice) to run the punch and leave checks as. With one record there is very likely no such person, so the checks that matter cannot execute. |
| holidays entered | **0** | Leave counts currently skip Sundays only — correct and expected; HR enters the list. |

**Before telling Adarsh to run `0013_rls_checks.sql` or `0016_rls_checks.sql`,
establish that an ordinary member with a linked employee record exists.** Running
them against a one-record company produces a page of SKIPPED and proves nothing,
which is worse than not running them — it looks like a pass at a glance. The
tests are correct to skip rather than fake it; the company data is what is
missing, and HR creating the real employee records is the fix.

---

# PROVEN on the live database — 2026-09-12

Both RLS test files were run against the Metrol Media project and **every check
passed. 31 of 31 on attendance, 16 of 16 on leave. Zero FAIL, zero SKIPPED.**

Nothing SKIPPED matters as much as the passes: it means the borrowed-person
guards all found somebody, so every check actually executed. The one employee
record on the books (6068, Adarsh, `role = member`, department *AI & Developers*,
status active) is a valid ordinary member, and `metrolhr` sits in Human
Resources — so the member-side and HR-side branches both ran for real.

**Delete the hedging.** Every earlier note in this file saying the geofence is
"verified by reading the policies, not by exercising them" is now obsolete. It
has been exercised. What is established, by measurement:

- A member cannot INSERT or UPDATE `public.attendance`, create an
  `office_locations` row, move a branch, widen its radius, loosen
  `max_accuracy_meters`/`grace_minutes`, or call `rotate_office_qr`. All seven
  refused at the database.
- `punch_in()` 3 km away → `too_far` ("about 3002 m from … within 50 m").
  A 2000 m accuracy fix → `weak_fix`. Inside 22.2 m → recorded, with branch,
  coordinates, distance and a server timestamp on the row. Second punch-in →
  `already_in`. `punch_out()` closed and graded it.
- `punch_by_qr()` with a valid code 3 km away → `too_far`. With a
  rotated-away token while standing AT that branch → `bad_code`. Rotation
  through the RPC as HR genuinely changed the token.
- `allow_any_branch = false` → `wrong_branch`, **and no row was written by the
  refusal**. `allow_any_branch = true` → punch landed and
  `attendance.office_id` recorded **Branch B**, the visited one.
- A second scan inside 2 minutes → `too_soon`, **and `punch_out_at` stayed
  null** — the day was not closed for HR to clean up.
- All four grading rules: 09:35 on a 09:30 shift with 9 h → `present`, 0 late;
  09:50 → `late`, 13 min past the grace; 5 h 30 → `half_day`; no punch-out →
  `in_progress`.
- An HR correction wrote to `attendance_edits` AND was re-graded (present, ~9 h)
  rather than left as typed.
- A member read 0 other people's days.

And Phase 7: `working_days_between` correct at 5 / 3 / 0 / 1, a holiday inside a
range removing exactly one day, a member asking for **99 days on a one-day
request getting 1 stored**, an invented leave type refused by the constraint, a
missing type defaulting to casual, a member unable to approve their own request
but able to cancel it, a member unable to enter or remove a holiday, HR able to
approve, and a member reading 0 other people's requests.

Both files cleaned up after themselves (`Clean up: PASS` on each) — test
branches deleted, test rows deleted, the borrowed member's `office_id` and the
company settings restored.

## What is still NOT done — and it is not code

| | Count | Consequence |
|---|---|---|
| office branches | **0** | Attendance is inert. `punch_in()` returns `no_office`. Somebody has to stand in each office and save it from HR → Attendance → Branches. |
| employees on record | **1** | Only Adarsh. HR enters the rest before leave, salary or attendance means anything to the team. |
| holidays | **0** | Leave counts skip Sundays only until HR enters the list. |

Phase 7's code is committed locally and **not deployed** — the database is ahead
of the site, which is harmless (the new column goes unread by the old bundle)
but means nobody sees leave types or the holiday list yet.

## How to hand Adarsh SQL, from now on

He cannot open files. Do not send attachments or paths. Give **one `pbcopy`
command per file in a bash block** — the desktop app puts a Run button on bash
blocks, so one click loads it onto his clipboard for the Supabase editor:

```bash
pbcopy < /Users/apple/metrol-crm/supabase/tests/0016_rls_checks.sql
```

His instruction, after three rounds of being handed file cards. Printing the
whole file inline also works but cost real money on a $114 session; the pbcopy
command crosses once.

---

# Deploy confirmed live — 2026-09-12

`493aa08` pushed to `main`; Vercel built and served it. Proof: the new bundle
`/assets/main-nkUT4C6v.js` returns HTTP 200 on company.metrol.in, and that
filename exists only in this build. Seven commits went live at once — Phase 6
(attendance + geofence), 6b (two branches), 6c (QR punch + four-digit IDs) and
Phase 7 (leave types, working-day counts, holidays).

**Watch for this when checking a deploy:** `index.html` is served from Vercel's
edge cache (`cache-control: max-age=0, must-revalidate`, but an `age` of ~16
minutes was observed), so it can still name the PREVIOUS bundle for a while
after a successful deploy. Comparing the hash in `index.html` against the local
`dist/` therefore reports a false negative. The reliable test is to request the
NEW bundle's path directly and look for a 200 — a hash that only exists in the
new build cannot be served unless that build deployed.

**Correction, 2026-09-13: curl cannot verify this deploy at all.**
company.metrol.in sits behind a **Vercel Security Checkpoint** (bot challenge).
Every curl request — a real bundle path, an invented one, or `/` itself —
returns `200 text/html`, 2,856 bytes, titled "Vercel Security Checkpoint". So
both the status code AND the content-type are the challenge page's, never the
app's, and the recipe above measures nothing. A browser passes the challenge
and sees the real site; `curl` never will.

Verify a deploy one of these ways instead:
- the Vercel dashboard (or the Vercel MCP tools) — did the commit build green;
- open the site in a real browser and check the Network tab's bundle name;
- ask Adarsh to hard-reload the page, since he is signed in there anyway.

Do not spend a ten-minute curl poll on it again.

---

# HANDOFF → Phase 8 (joining form) and Phase 9 (sign in by employee ID)

Written at the end of the session that shipped Phase 7, deliberately in a NEW
session's favour: this file plus the sections above is the whole context. Nothing
below needs re-deriving, and no migration or test needs re-running — the install
state and the test results above are measured facts, not claims.

## Start here, in this order

1. Read this file. Do not re-run `WHATS-INSTALLED.sql` or either RLS test — the
   PROVEN section above records their results.
2. Phase 8 — the joining form. The brief is in the Phase 6 section under
   "Phase 8 — the joining form"; the decisions are below.
3. Phase 9 — sign in by employee ID or email, plus change-password in the
   profile modal. It depends on Phase 8 only in that Phase 8 creates the
   accounts; the RPC itself is independent and small.

## The architecture constraint that shapes Phase 8 — read before designing

**The Resend API key must NEVER reach the browser.** Anything named `VITE_*` in
this Vite app is compiled into the public bundle and readable by every visitor.
So the email cannot be sent from React. It has to go through a **Supabase Edge
Function** with the key stored as a Supabase secret.

That is this project's first server-side code. Two ways to get the function
deployed, and it needs a decision before the phase is finished:

- **Supabase dashboard → Edge Functions → create in the browser editor**, paste
  the TypeScript, add the secret under Settings. No CLI, no login flow. Slower
  to iterate, but Adarsh can do it himself from the dashboard he already uses.
- **`supabase login` + `supabase link` + `supabase functions deploy`** from this
  machine. The CLI is installed (`/opt/homebrew/bin/supabase`) but there is no
  login, no project link and no database password here — `login` opens a browser
  flow only Adarsh can complete.

Whichever is chosen, the function's shape is the same. Write it to
`supabase/functions/send-employee-id/index.ts` either way so it is in the repo.

**Resend also needs a verified sending domain.** A `from` address on an
unverified domain is rejected by Resend, so "does metrol.in exist in the Resend
account, and what should the From address be" is a real blocker, not a detail.

## The design tension in Adarsh's own brief, and how it was resolved

He said both *"the candidate… sets their own password"* and *"nothing is created
until HR approves it."* Taken literally those conflict — a password cannot be
stored for later without creating something, and storing a plaintext password in
an application row would be indefensible for a table the public can write to.

See the ANSWERS section below for which way he chose.

## What Phase 8 needs regardless of the answers

- A `job_applications` table the **anon** role can INSERT into and cannot SELECT
  from — a public-write table is a spam surface, so: no read for anon, a rate
  limit or a per-link token, and HR/owner read-and-decide only.
- A **quarantined** storage bucket for anonymous uploads, separate from
  `employee-documents`. Files from an unapproved stranger must not land in the
  same bucket as a real employee's PAN card. On approval, move or re-link them.
- An approval step that creates the auth user, the `profiles` row and the
  `employees` row **in one transaction or not at all** — a half-created employee
  is worse than a rejected application. `employees` already auto-generates the
  four-digit code and auto-seeds the onboarding checklist, so approval should
  reuse those triggers rather than duplicate them.
- A **resend** button on the application, as asked.
- The public form is a route with no auth guard. Check `App.tsx`'s routing: every
  existing screen sits behind a session. This is the first one that must render
  for a signed-out stranger, and it must not pull `useWorkspace` or any hook
  that queries a policied table.

## Phase 9, in one paragraph

Supabase Auth is email-keyed, so `6068` has to become an email before
`signInWithPassword` can be called. A `security definer` RPC granted to `anon`
that takes a code and returns ONLY the work email — never the name, never
anything else — plus a guard against using it to enumerate the company
(four-digit codes are a 9,000-wide space, so rate-limit it or accept that it
confirms whether a code exists). Then `SignIn.tsx` tries: if the field has no
`@`, resolve it first. Change-password already exists in `ProfileModal` from the
avatars round — confirm it works rather than rebuilding it.

## ANSWERS — Adarsh settled these on 2026-09-12. Do NOT re-ask.

**1. Password: a set-password link AFTER approval.** The candidate fills the form
and uploads documents; **no auth account, no profile and no employee row exists
at that point** — only a `job_applications` row. On approval they get one email
carrying their four-digit employee ID *and* a link to set their own password.
This resolves the contradiction in his brief in favour of "nothing is created
until HR approves", and it closes the abuse surface: anybody who gets the
WhatsApp link can submit an application, but nobody can create a login.

**2. Mandatory uploads before the form will submit:** photo, PAN, Aadhaar, bank
proof (cancelled cheque or passbook), and a previous experience / relieving
letter. Education certificates are **not** required.

> **Flagged, needs one decision before the form goes to real candidates:** a
> fresher has no relieving letter and under this rule literally cannot submit.
> The likely fix is a "no previous employment" checkbox that waives that one
> upload. Do not silently make it optional — ask him, since he chose it
> deliberately, and the answer is probably the checkbox.

**3. HR fills at approval, not the candidate:** branch, department, shift,
designation, joining date, salary (gross and net), and leave entitlement. The
candidate fills only their own personal details and the documents. Salary stays
owner/HR-only exactly as `salary_records` already enforces. Leave entitlement
still defaults to 18 if HR leaves it alone.

**4. Email: `metrol.in` IS verified in Resend. Send from `hr@metrol.in`.** The
key goes in as a **Supabase secret**, never into `.env` and never with a `VITE_`
prefix — tell him the exact place to paste it and never ask for it in chat.

---

# Phase 8 built — 2026-09-12, in a fresh session off the handoff above

Built exactly what the handoff specified, no more: the public form, the
quarantine table and bucket, the Edge Function, and the HR review screen.
`npm run typecheck` and `npm run build` both pass; the whole flow was walked
in the browser under `?demo=1&as=hr` (Applications tab, review modal, approve
form, and the public `/apply` form with the fresher checkbox actually hiding
the relieving-letter upload). The Edge Function itself cannot be exercised
from here — it needs a live deploy — so treat its logic as reviewed-but-not-
fired-in-anger until the first real approval goes through.

**Files:**
- `supabase/migrations/0017_job_applications.sql` — the `job_applications`
  table, a `quarantine_job_application()` trigger that overwrites
  status/decided_by/employee_id/invite fields back to their defaults on any
  client-originated insert (so anon cannot self-approve by just sending more
  columns), RLS (anon: insert-only, no select; HR/owner: select + update, no
  delete), and the private `job-applications` storage bucket.
- `supabase/functions/approve-job-application/index.ts` — NOT deployed yet.
  Paste-ready for Dashboard → Edge Functions → New function, name it exactly
  `approve-job-application`. Needs one secret: `RESEND_API_KEY`.
- `src/react/screens/ApplyPage.tsx` — the public form. Reached at `/apply`,
  gated in `App.tsx` BEFORE the session check and before `useWorkspace` is
  called, so it renders for a signed-out visitor with zero authenticated
  queries.
- `src/react/data/useJobApplications.ts` — `submit` (anon, uploads then
  inserts), `reject` (a plain client-side update HR's own RLS already
  allows), `approve`/`resend` (both call the Edge Function, since only it can
  create a login).
- `src/react/modals/ApplicationReviewModal.tsx` + a new "Applications" rail
  section in `HrPage.tsx` (badge shows the pending count in the label, e.g.
  "Applications (2)" — Rail.tsx was left alone rather than adding a badge
  prop to a shared component for one caller).
- `src/react/lib/hr.ts` — `JobApplication`, `APP_STATUS`, `APPLICATION_DOCS`.
- `src/react/data/demo.ts` — three seeded applications (pending/approved/
  rejected) so the Applications tab is walkable in `?demo=1` without a
  database; nothing here touches the live project.

**Design calls made without asking, because the brief already settled them:**
- Approve and resend both round-trip through the Edge Function rather than
  writing straight to the table, even though HR's RLS would technically allow
  the table write — the Edge Function is the only thing that can create the
  auth user, so centralizing both there (instead of splitting "create the row
  changes here, create the login there") keeps one place responsible for "did
  this application actually get decided."
- The Edge Function deletes its own auth user if the `employees` insert fails
  after the login was created — an orphan login with no employee behind it is
  worse than a failed approval the reviewer can just retry.
- Documents move (download from quarantine, upload to `employee-documents`,
  delete from quarantine) rather than staying referenced in place — Adarsh's
  own words were "must not land in the same bucket as a real employee's PAN
  card," which means after approval too, not just before.
- A failed email does not fail the approval. The account and employee record
  are real either way; the function returns a `warning` string HR sees, and
  "Resend" repeats only the email step. Silently succeeding while claiming
  failure (or vice versa) is the failure mode a half-done approval invites.

**What is NOT done, and is not code:**
- **The Edge Function is not deployed.** Nothing in Phase 8 works end-to-end
  until Adarsh pastes it into the Dashboard and adds the `RESEND_API_KEY`
  secret. Handed to him as its own message, not buried here.
- **Migration 0017 is not applied.** Same — handed to him as a `pbcopy`
  command per this file's own rule above.
- The fresher-checkbox decision from the ANSWERS section is now live in the
  form; nothing further needed there.
- Phase 9 (sign in by employee ID) still has not been started. It depends on
  Phase 8 only in that Phase 8 creates the accounts it will resolve — the RPC
  itself is independent and small, exactly as the handoff said.
- No rate limit or CAPTCHA on the public form or its uploads — a public
  insert-and-upload surface is inherently a spam target, and this build did
  not add one. Worth a decision from Adarsh before the link is shared widely,
  not before the first internal test.

---

# The phone build — 2026-09-12, same session as Phase 8

Adarsh's brief, in his words: the app "is not optimized for the mobile screen",
you have to "pinch down to fit in the screen", there is horizontal drift left
and right, and the sections live in a strip you must scroll sideways to read —
"not a good UI UX for the mobile users". He asked for a bottom navigation, and
asked separately about an APK / add-to-home-screen (explicitly deferred: "APK
later… but we need to fix this particular issue now").

## What was actually wrong — measured, not guessed

Every screen was checked at 375×812 with a script that walks the DOM and
reports any element whose right edge passes the viewport without a scrolling
ancestor. Result: **the page never scrolled horizontally on any screen.** The
previous sessions had already contained that. So the felt problem was three
other things:

1. **The zoom trap, and this was the big one.** `body` is 14px, `input,select`
   inherit it, and `.search .input` is 12.5px. iOS Safari zooms the entire page
   in whenever a focused input's text is under **16px** — it is a rule, not a
   preference. So tapping any search box or dropdown zoomed the layout wider
   than the screen, and you then had to pinch back out and could drag sideways.
   That is exactly the symptom he described, and it is one number.
2. **The chip strip.** `.mobile-nav` was `overflow-x:auto`, so HR's eight
   sections and the salesperson's nine were mostly off the edge, discoverable
   only by dragging the bar.
3. **Tables.** The HR directory grid is 972px wide inside a 375px window, read
   by dragging it sideways — the other half of "moving left and right".

## What was built

- **`src/react/components/BottomNav.tsx`** — a fixed tab bar, five slots. Past
  five, the fifth becomes "More" and opens a bottom sheet with the rest; HR
  (8 sections) and the salesperson (up to 9) are why the overflow exists. Items
  are shape-compatible with `RailItem`, so HrPage feeds one array to both the
  desktop rail and the phone bar rather than maintaining two. `short` shortens a
  label for a 75px tab ("Team tracking" → "Team"); `badge` moves a count out of
  the words and onto the icon.
- **`DataGrid` renders cards under 860px.** Same rows, no horizontal scroll:
  first wide column is the heading, a narrow leading column (the 52px "#") sits
  above it as a small line rather than becoming a card titled "1", labelled
  columns become label/value pairs, and unlabelled columns (the action cells)
  become a strip along the bottom. **The desktop table is untouched** — verified
  after the change that at 1440px the table still renders with its six resize
  strips, the rail is visible, inputs are still 14px and `.grid-shell` still has
  its border. The resizable columns are the client's first requirement and
  nothing here goes near them.
- **`prototype.css`** — one commented block at the end, "THE PHONE BUILD":
  16px inputs, 44px inputs / 40px buttons, safe-area insets on the topbar and
  the tab bar, `-webkit-tap-highlight-color` and `touch-action:manipulation`
  (the 300ms double-tap-zoom delay), `overscroll-behavior` on the scroller,
  tighter KPI tiles because four desktop-sized ones filled the whole first
  screen, and the card styles. `.mobile-nav`'s rules were deleted with its
  markup.
- **`index.html`** — `viewport-fit=cover` plus the iOS/Android standalone meta
  tags, so adding it to the home screen already opens it without browser chrome.
  **Zoom is deliberately not disabled.** `user-scalable=no` would have hidden
  the symptom while taking pinch-zoom away from anybody who needs it; the 16px
  rule fixes the cause.

## Verified

At 375×812, on HR, the salesperson, the owner's Projects, and a project's
Leads: no page-level horizontal scroll, nothing overflowing without a scroller,
zero inputs under 16px, tab bar present with 52px targets, tables replaced by
cards, the More sheet opening with the four overflow sections, and a modal
fitting the screen. At 1440px: bottom nav `display:none`, table and resize
strips intact, rail visible. `typecheck` and `build` both pass.

## Still open

- **APK / installable app — not done, and deliberately.** The meta tags above
  already make "Add to Home Screen" open fullscreen on both platforms. A real
  installable PWA additionally needs a `manifest.webmanifest` and PNG icons
  (192/512), and an APK on top of that needs a wrapper (TWA via Bubblewrap, or
  Capacitor) plus a Play Console account. That is its own task with its own
  decisions — Adarsh deferred it himself and it should stay deferred until the
  app is finished.
- The leads board (`.board-scroll`) still scrolls sideways on a phone. That one
  is correct — it is a kanban board, and swiping between columns is how a board
  is read. Left alone on purpose.

---

# HANDOFF → the HR shell rework (briefed 2026-09-13, ONE of four parts built)

Adarsh reviewed the phone build and asked for four things. **Only part 3 is
built.** The other three are specified below in enough detail to build without
re-deriving anything from a voice note.

His framing, which explains all four: the phone tabs are currently ordered by
what the module happened to grow, not by what HR opens the app to do, and the
card view spends vertical space he does not want spent.

## Part 1 — reorder the HR tabs, and build the Dashboard that goes first

His order, in his words, with his reasons:

| # | Tab | Why he put it there |
|---|---|---|
| 1 | **Dashboard** | "First should be the dashboard… which is required. We can show them which on daily basis they want to see." Does not exist yet — HR currently opens on the directory. |
| 2 | **Attendance** | "For India attendance, they will receive a leave if somebody have a leave today. So edit of decision notification and also we have one option to open the leave step, to see a leave." → who is in, who is on leave today, and a way through to Leave from here. |
| 3 | **Departments** | "Departments should be in middle one because this one is the big one… every department have their work and all. So we go more deeper in that." Middle slot is deliberate — it is the one he intends to grow. |
| 4 | **Employees** | He first said finance/salary, then corrected himself outright: *"no no… fourth one should be Team members — that is called employees — the employees list data department wise."* This is the existing Directory, renamed **Employees**, grouped by department. |
| 5 | **More** | Everything left: Leave, Salary, Onboarding, Exit, Applications. |

Implementation notes so the next session does not rediscover them:

- `HrPage.tsx` already has `railItems` (desktop) and `navItems` (phone) built
  from one array — reorder there, and set the default `section` to the new
  `dashboard`. The `section` union and `NAV_SHORT` both need the new key.
- **Salary/finance moves into More.** He swapped it out himself; do not
  reinstate it as a tab because an earlier sentence in the same voice note
  said "finance fourth".
- The Dashboard's content is the one open question. Nothing was invented here.
  What he actually said is "which on daily basis they want to see", and the
  things this app already knows daily are: who is in / late / absent today,
  leave requests waiting on a decision, applications waiting on a decision,
  headcount, and anybody on notice. Build from what exists; do not invent a
  metric this database cannot answer. Ask him if in doubt.

## Part 2 — the employee profile page

> "Create profile page. Every employee have a profile page — their name, their
> employee ID, every data regarding it — then put all the other remaining
> options in the profile tab."

Today HR's employee record (`HrPage.tsx`, the `{open && …}` branch) is **one
long scroll**: Employment, Contact, Emergency contact, Notes, Attendance,
Leave, Salary, Offer & onboarding, Exit, stacked. On a phone that is a very
long page, which is the same wasted-vertical-space complaint as part 3.

Make it a profile: a header carrying avatar, name, **employee ID**, designation,
department and status chip — then the sections as **tabs within the profile**
rather than stacked. The data is already all there and every section already
renders; this is a container change, not new content.

**The same idea applies to the employee's own app** (`Member.tsx`), and is
probably what "put all the other remaining options in the profile tab" means
for them specifically: they currently carry up to nine tabs (Overview,
Attendance, My leads, My sales, Manage team, Leave, Salary, Onboarding, Exit).
Leave / Salary / Onboarding / Exit are all "about me" — they belong behind one
**Profile** tab, which would take the bottom bar down to about four real tabs
and remove the need for the More sheet on that screen entirely.

## Part 3 — DONE: Cards or List, the reader's choice, on a phone

> "We can show card view we have already, but one more view… that is list view,
> like Excel sheet table format. In this way, in less space, correct information
> shows in less space in a better format. So we have to make sure that
> unnecessarily vertical space not be used or waste."

Built. `DataGrid` shows a small right-aligned **Cards | List** segmented control
on phones only; List is the real table, horizontally scrollable inside its own
shell exactly as on desktop, which is what fits four times the rows on a screen.
The choice is remembered **per table** (`metrol-gridview-<storageKey>` in
`localStorage`), because the right answer differs per table — a six-row Sales
list and a 122-row Leads list do not want the same view. Default stays Cards.

`.grid-shell--list` restores the border/background the card view strips off, so
in List view it reads as a table again rather than cards in a box.

`typecheck` and `build` pass. **Not yet checked in a browser at 375px** — that
is the first thing to do next session, along with confirming the toggle does not
itself eat the vertical space it was added to save.

## Part 4 — make the cards themselves denser

Same sentence as part 3: vertical space "not be used or waste". The card is
currently `padding:12px 13px`, `gap:11px`, a two-column field grid and an
actions strip with its own border and padding. Nothing was tightened in this
round. Worth doing after part 3 is looked at on a real phone, because the List
option may already answer the complaint and a second change would then be
solving a problem that no longer exists.

## What is still true and unfinished from Phase 8

Unchanged by this round, still waiting on Adarsh, not on code:
`RESEND_API_KEY` is not set as a Supabase secret, so an approval creates the
login and the employee record but the "set your password" email does not send —
by design, it returns a warning and the Resend button repeats the email step.

---

# HR shell rework — parts 1 and 2 built (2026-09-13)

Picking up the handoff above. Parts 1 and 2 are now built; part 4 (denser
cards) is still deliberately not done, and part 3 still has not been looked at
in a browser with real data.

## Part 1 — the tabs are Adarsh's order, and Dashboard exists

`railItems` in `HrPage.tsx` is now the single source of the order, and
`navItems` is derived from it rather than re-listing the keys — the two orders
had to be kept in sync by hand before, which is exactly the kind of thing that
drifts. The order is his: **Dashboard, Attendance, Departments, Employees**,
then Leave, Salary, Onboarding, Exit, Applications. On a phone that means the
first four are tabs and everything after them is behind More, which is the
split he described. Salary is not a tab — he swapped it out for Employees
himself, and the note in the handoff was right to warn about the earlier
sentence in the same voice note.

**Directory is now Employees, and it is grouped by department** ("the employees
list data department wise"): one small heading and one table per department,
plus a "No department" group, in the departments' own `sortOrder`. Searching or
filtering to a single department drops back to one flat table — at that point
the grouping is answering a question nobody asked. The grouped tables share the
`hr-directory-dept` column widths, separate from the flat table's
`hr-directory`, because they are a column short: department is the heading
there, so as a column it would be the same word on every row.

**The Dashboard** answers "what is today", and every number on it is one this
database already holds — nothing was invented, per the handoff's instruction:

- four tiles, all about today: in office now, late today, not in yet, on leave
  today. There was a fifth (joined this month) and it was cut — five tiles
  leave an orphan on a phone's two-column grid, and headcount is already in the
  line under the heading.
- **Waiting on a decision** — pending leave requests and pending applications in
  one card, because "what needs me" is one question even though the two queues
  live on different pages. An application row opens the review modal straight
  from here.
- **Today** — who is on leave (with the date they are back) and who has not
  punched in, each row opening that person's profile. Approved leave is taken
  out of the not-in list: somebody on leave is not missing. Capped, with a way
  through to Attendance.
- **On the way out**, when anybody is on notice, and the "login with no employee
  record" banner, which moved here from Employees — it is a thing that needs
  doing, and this is now the page for those.

**Attendance also gained the leave half of his sentence.** `HrAttendance` takes
two new optional props (`leave`, `onOpenLeave`) and now shows an "On leave
today" tile, a list of who is on leave that day, and a button through to Leave.
The day's table marks those people **On leave** instead of "Not in", and the
"No punch" count no longer includes them — an absence that is already accounted
for is not a no-show.

## Part 2 — the profile page

HR's employee record was nine sections stacked into one scroll. It is now a
profile: a header card (`.prof-head`) carrying the avatar, name, **employee ID
in mono**, designation, department and status chip, with Edit / Mark as
resigned on the right — and the sections behind **tabs inside the profile**:
Overview (employment, contact, emergency, notes), Attendance, Leave, Salary,
Onboarding, and Exit only once somebody is leaving. No section changed, only
where it lives. `openEmployee(id)` replaces the bare `setOpenId(id)` at every
call site so opening a second person never lands you on the first one's Salary
tab.

**The employee's own app got the same treatment** — the handoff was right that
this is what "put all the other remaining options in the profile tab" means for
them. `Member.tsx` had up to nine tabs; Leave, Salary, Onboarding and Exit are
all "about me", so they are one **Profile** tab with those four as sub-tabs
inside it (Exit only when they are actually leaving). The bottom bar is now
Overview, Attendance, My leads, My sales, Profile — five, so **an ordinary
employee never sees the More sheet again**. A team lead still overflows, and
More holds Manage team and Profile for them; six destinations do not fit in
five slots and nothing about that is new.

The profile's sub-tab strip is `.tabs`, not `.tabs--nav` — unlike the section
strip above it, this one is the only way around inside Profile, so it has to
survive on a phone.

## Checked

`typecheck` and `build` pass. The new CSS (`.prof-head`, `.prof-meta`,
`.prof-code`, `.prof-actions`, `.prof-tabs`) was rendered at 375px and 1280px
against static markup and reads correctly in both — that check covers the
layout, not the wiring, because there is still no `.env` in this environment
and nothing can sign in to see real rows.

## Still open

- **Part 3** — the Cards/List toggle has still never been seen at 375px with a
  real table under it.
- **Part 4** — denser cards. Unchanged advice: look at part 3 on a phone first,
  because the List option may already answer the complaint.
- `RESEND_API_KEY` is still not set as a Supabase secret, so an approval still
  cannot email the "set your password" link.

---

# HR Phase 9 — sign in with an employee ID (2026-09-13)

The last numbered phase. Small, exactly as the handoff predicted.

Supabase Auth is keyed on email, so `6068` has to become an email before
`signInWithPassword` is called, and the person doing that is not signed in yet.
`email_for_employee_code(text)` (migration 0018) is a `security definer`
function granted to `anon` that returns **one thing** — the work email — and
returns nothing for a resigned employee, whose login is gone and whose address
should not still be findable by ID. `employees` itself stays unreadable to anon,
exactly as 0006 left it.

**The throttle, and why it is global rather than per-IP.** A four-digit code is
a 9,000-wide space, so anybody who can call this can walk it and collect every
current employee's work email. Postgres cannot see the caller's IP through
PostgREST, so a per-IP limit is not available. Instead `employee_code_lookups`
counts calls company-wide and the function raises `rate_limited` past **30 in a
minute** — a human signing in never reaches it, a script walking 9,000 codes
hits it on the first second, and during an attack a real person is told to use
their email address, which still works. The table has RLS on and **no policies
at all**: only the definer function ever touches it.

**`SignIn.tsx`** now takes either. Anything containing `@` is passed straight
through and never calls the RPC, so ordinary email sign-in is byte-for-byte the
request it always was. The input had to become `type="text"` — as `type="email"`
the browser refused to submit `6068` before any of this code ran, which is the
kind of thing that looks like a broken button rather than a validation rule.

**Change password was already there** and was confirmed rather than rebuilt:
`ProfileModal` has had it since the avatars round (`pfPw1`/`pfPw2`, matching
check, `supabase.auth.updateUser`). The handoff said to check, not to build, and
that was right.

`supabase/tests/0018_rls_checks.sql` — twelve checks in one rolled-back
transaction: the grant (checked first, because a missing grant makes every later
call raise and print nothing), anon still locked out of `employees` and the
throttle table, a real borrowed employee's code resolving to the right address,
that same employee resigned inside the transaction resolving to null, unknown
and empty codes, the 31st call in a minute refused by name, and recovery after
the window. Borrows a real row and reports SKIPPED rather than faking a pass.

`typecheck` and `build` pass. **0018 and its test file have not been run against
the live database** — same as 0017.

## The HR module is now feature-complete

Phases 1–7 are live. Phase 8's code is built and waiting on three manual steps
(0017, the Edge Function, `RESEND_API_KEY`). Phase 9 is built and waiting on
0018. Nothing else in the original brief is unbuilt.

What remains is not code:

| | |
|---|---|
| migrations 0017 + 0018 | not run against the live database |
| `approve-job-application` | not deployed to Supabase Edge Functions |
| `RESEND_API_KEY` | not set as a Supabase secret |
| office branches | **0** — attendance is inert until HR saves one from inside each office |
| employees on record | **1** |
| holidays | **0** |
| shell rework part 4 | denser cards, still deliberately not done |

## PROVEN on the live database — 2026-09-14

0017, 0018, 0019 and `0018_rls_checks.sql` all ran against the Metrol Media
project. **12 of 12 PASS, zero SKIPPED** — the borrowed-employee guard found
somebody (6068 → teamnevorai@gmail.com), so every check actually executed.

Established by measurement: a real code resolves to the right address, a
resigned code resolves to null, unknown and empty codes resolve to null, the
31st lookup in a minute is refused by name and it recovers after the window,
and anon reads zero employee rows. 0017's own proof: RLS on, 4 policies, **0**
delete policies, the `job-applications` bucket created, 3 storage policies, the
quarantine trigger installed.

**Two bugs in my own SQL, both found by Adarsh running it:**

1. **0017 was not safe to re-run.** A bare `add constraint` raises 42710 the
   second time and rolls back everything after it, so a partly-applied 0017
   could never be completed by re-running the file — which is exactly the state
   it was in. It drops the constraint first now, like every policy in it
   already did. **Every future migration: guard every statement, not most of
   them.**
2. **0018's anon check measured the wrong thing and reported a leak that did
   not exist.** `has_table_privilege('anon', <any table>, 'select')` is TRUE in
   every Supabase project — the grant is handed out by default, and **RLS is
   what returns nothing** to an unauthenticated caller. The check now does
   `set local role anon` and counts rows. 0019 revokes the grant as well, so
   there are two locks; the SECURITY DEFINER resolver is unaffected by it and
   `authenticated` is untouched.

**Do not write another `has_table_privilege` check and call it a security
proof.** Ask the question as the role and count what comes back.

## What is left, and none of it is code

| | |
|---|---|
| `approve-job-application` | not deployed to Supabase Edge Functions |
| `RESEND_API_KEY` | not set as a Supabase secret |
| office branches | **0** — attendance is inert until HR saves one from inside each office |
| employees on record | **1** |
| holidays | **0** |
| shell rework part 4 | denser cards, deliberately not done |

Every migration 0006–0019 is installed. The HR module is feature-complete.

---

# Holidays — seeded with the fixed-date ones, festivals left to HR (2026-09-16)

Adarsh asked for the holiday list to start filled rather than empty, with HR
free to edit/add/remove from there — the UI for that already exists (Leave →
Holidays, built in Phase 7), so this is data, not a feature.

**Seeded, because these are safe to be certain about:** Gandhi Jayanti,
Christmas, New Year's Day, Republic Day, Independence Day — fixed on the
Gregorian calendar, same date every year, nationally gazetted or
near-universally observed. `supabase/scripts/seed_national_holidays.sql`,
forward-looking only from today (2026-09-16) since a past holiday changes
nothing.

**Deliberately NOT seeded: Diwali, Holi, Dussehra, Eid, and every other
lunar/lunisolar festival.** Their Gregorian date shifts every year and I do
not have a reliable way to compute or recall the exact 2026/2027 dates with
certainty. This table directly governs real leave-day counting — a wrong date
here would silently mis-count somebody's leave, not just look wrong on a
page. Guessing was the wrong trade here; HR adding the confirmed date from an
official calendar is the right one. The script says this in its own comment
too, so the reason travels with the file.

**What Adarsh/HR do:** run the script once (paste-and-run, upsert-safe), then
add the festival dates themselves via the Holidays screen as each one is
confirmed for the year.

---

# Two more done, by Adarsh directly — 2026-09-16

**Holidays seeded.** `seed_national_holidays.sql` ran clean — 7 rows on the
table (Gandhi Jayanti, Christmas ×2, New Year's Day, Republic Day,
Independence Day ×2, forward-looking from today). Confirmed by screenshot of
the query result.

**`approve-job-application` deployed to Supabase Edge Functions.** Confirmed
by screenshot: "Successfully updated edge function", live at
`https://nsgvcfesyihffspofxiq.supabase.co/functions/v1/approve-job-application`.
Phase 8 (the joining form) is now fully wired end to end EXCEPT the email
step, which needs `RESEND_API_KEY` — Adarsh is adding that himself, in his
own time, not blocking anything else.

## What is actually left now

| | Whose task |
|---|---|
| `RESEND_API_KEY` secret | Adarsh, whenever — approvals work either way, just no email until then |
| Office branches (0 set) | Adarsh, physically, from inside each office |
| Employee records (1 on file) | HR, data entry |
| Festival holiday dates (Diwali, Holi, Eid, etc.) | HR, from Holidays screen, per date confirmed |
| Denser cards on phone | Optional polish, not asked for again — skip unless requested |

No code is owed. Every phase (1–9) plus the shell rework (parts 1–3) is built,
proven against the live database, and now deployed. Part 4 (denser cards) is
the only deliberately-skipped item, and it was never re-requested.

---

# Departments — Cards or List, same as Projects (2026-09-16)

Adarsh, looking at the Departments screen: too basic as a stacked list, and
he wanted the same Cards/List choice the owner's Projects screen already has
— cards by default, a grid of three, click a department to open it. **Not**
a new per-department dashboard — that is still the thing nobody has defined
content for and still explicitly not being invented. "Open that department"
turned out to already exist: the Employees page already filters to one
department via its own dropdown, so a card click just sets that filter and
switches to Employees (`openDept()`). Reusing what is there rather than
building a second way to see the same people.

**The grid is the literal `.proj-grid` class**, not a copy of its rules —
Projects' 3/2/1-column responsive breakpoints now serve both screens from one
place, so they cannot drift apart the way a duplicated rule eventually does.
`.dept-card` is new and lighter than `.proj-card`: no photo (a department has
none), a monogram badge instead, a headcount stat, and the same avatar-stack
footer Projects already uses for its team. List view is untouched — the exact
markup from before this round, same wording, same behaviour.

`metrol-crm-deptview` remembers the choice per browser, mirroring
`metrol-crm-projview`. Default Cards.

**Verified in Chromium**, `?demo=1&as=hr`: renders 3-column at 1280px, single
column at phone width; clicking Sales opens Employees pre-filtered to Sales
(5 of 6 shown, dropdown reads Sales); an empty department's card reads
"Nobody yet" in the footer and "0 · People" in the stat, matching the list
view's own empty wording. `typecheck` and `build` clean.

---

# The apply form's width, and a question waiting on photos (2026-09-16)

Adarsh, looking at `/apply` on a wide desktop browser: a narrow strip lost in
the middle of the screen, and he asked why the site doesn't use the desktop's
own width the way the rest of it does.

**The cause:** `ApplyPage.tsx` reused `.auth-card` — the exact box SignIn and
SignUp use, `width:min(384px,100%)`. That is the right width for a two- or
three-field login form; it was never meant to hold ten-plus fields and five
file pickers, and stretching a long form into it is what produced the
strip-in-the-middle look. **This was never true of the rest of the site** —
the phone build round already gave every other screen the split he is asking
for (a table on desktop, cards on a phone; the rail on desktop, a tab bar on
a phone) — `/apply` is the one page that inherited a login template instead
of getting its own container, because it was built off SignIn's shape rather
than designed for its own content.

**Fixed with a new `.apply-card`** (`width:min(680px,100%)`, same visual
treatment otherwise) and a `.field-grid` — full name/phone/email/position pair
up two-to-a-row, and the five document pickers do the same, both via
`auto-fit, minmax(220px,1fr)` rather than a breakpoint, so the same markup
folds to one column on a phone with no separate mobile rule to maintain
(matches `.hr-fields`' existing pattern). Verified at 1400px (two columns,
card centred with real margins either side, not swallowed by them) and at
375px (one column, full-width touch-sized fields, nothing overflowing).
`typecheck` and `build` clean.

## Open — waiting on the real joining form

Adarsh's physical/company joining form asks for more than this page collects
today. **He is sending photos of it next**, and decided the fields belong on
this form itself — the candidate fills them before submitting, not HR at
approval — so nothing was guessed here. Add exactly what the photos show,
once they arrive; do not invent fields from memory of what a joining form
"usually" asks.

---

# The joining form becomes the real joining form (2026-09-16)

Adarsh sent ten photographs of Metrol Media's printed **APPLICATION FORM** and
its **TERMS & CONDITIONS OF EMPLOYMENT**, and asked for three things: collect
what the paper collects, make it bearable on a phone, and do not lose what
somebody typed if they close the tab.

**Nothing here was invented.** Every field below is a line on that paper. The
sample employee's own details in the photographs were ignored, as instructed.

## What the paper asks, and where it now lives

`supabase/migrations/0020_application_full_form.sql` adds 26 columns:
first/last name, father's or husband's name, gender, DOB, place of birth,
nationality, religion, marital status, dependents, Aadhaar number, present and
permanent address, pincode, technical qualification, the four bank fields,
reference name and department, and the two acceptance timestamps — plus
**four jsonb columns** for education, employment history and languages.

**Why jsonb and not child tables:** those three are TABLES on the paper with
room for several rows each, and nothing in this app will ever ask "every
applicant who passed 12th in 2022". HR reads them as a block, on one screen,
for one person. A jsonb array keeps that block together, keeps an unapproved
stranger's data out of the tables real employees live in, and means approving
somebody does not fan rows across four more tables. Normalise it the day a
report over this data is actually wanted.

**The two acceptances are timestamps, not booleans**, and 0020's trigger
overwrites both with the server's `now()`. A boolean cannot answer "when did
they agree to this", which is the only question that matters if it is ever
disputed — and the moment must not come from a clock the applicant controls.

## The wizard, and the two things Adarsh asked for by name

Eight sections, one screen each: Personal → Contact & address → Education →
Work history → Bank → Languages & reference → Documents → Declaration & terms.
`.field-grid` pairs short fields two-to-a-row on a desktop card and folds to one
on a phone, so the same markup serves both with no breakpoint of its own.

**Progress survives closing the tab.** Every keystroke writes the draft to
`localStorage` under `metrol-apply-draft-v1` — no debounce, because a debounce
is exactly what loses the last thing typed before a tab closes — and the step
they were on comes back with it. The draft is cleared only on a *successful*
submit; a failed one leaves it exactly where it was.

**Files are the one thing this cannot keep**, and the form says so rather than
letting somebody discover it: a `File` cannot be serialised into
`localStorage`, so a restored draft shows a notice on step 1 and again on step
7 telling them the documents need re-attaching. Saying it twice is deliberate —
the first is a warning, the second is where it actually bites.

**A bug found by testing, not by reading:** the persist effect ran on mount, so
merely *opening* the page wrote an empty draft — and the next visit then
greeted a first-time visitor with "we found answers you had already started"
over a blank form. `isBlank()` now guards both the read and the write: a draft
of nothing is not progress. This only showed up because the form was opened
twice in a row; opening it once looked perfect.

## Terms & Conditions

`public/metrol-media-terms-and-conditions.pdf` — the full twelve sections,
typeset from the photographs with reportlab (`scratchpad/gen_tc.py` built it;
the PDF is committed, the script is not). Step 8 shows the declaration verbatim
from the paper, a tick for it, a **Download PDF** button, and a separate tick
for the terms. Both are required before Submit will go.

**One thing Adarsh should look at:** the printed T&C numbers its third section
twice — 3.1–3.6, then restarts at 3.2 Period Leave through 3.5 Same-Day Leave
Rule, so there are two 3.2s, two 3.3s, two 3.4s and two 3.5s. The PDF
renumbers that run sequentially as 3.7–3.10 so it reads correctly. **The source
document still has the duplicates** — worth fixing there too, especially if
anything ever cites a clause by number.

## HR's side

`ApplicationReviewModal` now shows all of it, in the paper's own order, under
`.rev-sec` headings — HR is usually reading this next to the physical file, so
matching that order is what makes it checkable. Blank fields render an em dash
rather than disappearing: "they left it blank" is itself something HR needs to
see.

## Verified in Chromium

At 375px: one column, the progress bar and step name, repeatable rows as their
own boxed cards, declaration and T&C with the download button. Typed two
fields, did a full page reload, both came back with the restore notice — the
exact scenario Adarsh described. At 1400px: two columns, no dead strip. The PDF
serves (HTTP 200, 9 KB). `typecheck` and `build` clean.

## Open

- **0020 has not been run against the live database.** Until it is, the new
  fields have nowhere to land and a submit will fail on the missing columns.
- The Edge Function copies documents and creates the login; it does **not** yet
  copy the new paper-form fields onto the `employees` record at approval. They
  stay on the application, which HR can still open. Worth doing when Adarsh
  says which of them belong on the permanent employee record.

## +91 is furniture, not something to type (2026-09-16)

Adarsh: every number this company collects is Indian, so the field should
carry the country code and the person should enter ten digits.

`.phone-wrap` prints **+91** in a fixed block attached to the left of the
input (focus ring belongs to the pair, not half of it). The field stores the
ten digits alone and `tenDigits()` normalises whatever arrives — a pasted
"+91 98765 43210", a leading 0, or spaces all reduce to the same ten
characters, so what is stored never depends on how somebody typed it.
Verified by pasting exactly that string: it became `9876543210`.

The number is reassembled as `+91 XXXXXXXXXX` on submit, because HR, the
employee record and any future WhatsApp link want a dialable number rather
than ten bare digits. A draft saved before this change is normalised on
restore.

Applied to **SignUp** too, which had the same `placeholder="+91 …"` invitation
to type it by hand.

## Three faults on the live form, and one of them was app-wide (2026-09-16)

Adarsh filled the real form on company.metrol.in and hit all three.

**1. The upload actually failed.** `Could not upload photo: Invalid key:
…/photo-1789540289794-Screenshot 2026-09-16 at 11.58.23 AM.png` — Supabase
storage rejects spaces and colons in an object key, and the single most likely
file anybody attaches from a Mac is called exactly that. `safeName()` in
`useJobApplications.ts` now lowercases, replaces every unsafe run with a
hyphen, caps the length and keeps the extension (the extension decides how the
file opens for HR later). Checked against the failing name and four others:
`"Screenshot 2026-09-16 at 11.58.23 AM.png"` → `screenshot-2026-09-16-at-11-58-23-am.png`,
a Devanagari name → `card.pdf`, `"...."` → `file`.

**2. `.input` never declared a colour — and this was not only the apply form.**
An `<input>` inherits the page's colour; a **`<textarea>` and a `<select>` take
the browser's own default instead**, which is black. On the dark theme that is
black text on a near-black field. Every textarea in this app has had it —
leave reason, decision notes, exit reason, the holiday name — and it survived
every round because the screens were checked in light mode, where black is
right. `.input` now sets `color:var(--ink)` explicitly. Measured after:
textarea, select and input all report `14px rgb(242,242,242)`.

**Do not rely on an element inheriting anything the class does not say.**

**3. No textarea rule existed at all**, so a textarea wearing `.input` took a
monospace default a size smaller, and `.input`'s `padding:0` pinned the text to
the top edge of the box — which is what Adarsh saw as "font too small and shows
upward, not in middle". `textarea.input` now sets `height:auto`,
`min-height:78px`, real vertical padding, `line-height:1.5` and `font:inherit`.

**Also added: `*` on every required field**, with a line under the heading
saying what it means. The marks come from one `<Req />` component and match
exactly what `blocking()` enforces, so the asterisk and the rule cannot drift.
Required: first name, last name, gender, DOB, contact number, email, present
address, pincode, and every document (the relieving letter drops off the list
when "fresher" is ticked).

---

# Two fields the candidate already typed, carried to the employee record (2026-09-16)

Left open at the end of the last round: the approval Edge Function creates the
`employees` row but copies none of the joining form's new paper fields onto it.
That was parked on Adarsh deciding which of them belong on a permanent employee
record — and it still is, for most of them, because **`employees` has no column
for father's name, gender, Aadhaar, religion, marital status, the bank block,
education or employment history.** Giving them a home means ~20 new columns on
the table real employees live in, and that is a schema decision, not a
copy-paste.

**Two of the twenty-six need no decision at all**: `employees.date_of_birth` and
`employees.address` already exist, already mean exactly what the application's
`date_of_birth` and `present_address` mean, and are already on the HR employee
form — so today HR reads them on the application and then re-types them into
the employee record by hand. The function now carries both.

**Written to survive 0020 not being installed yet**: `app.date_of_birth ?? null`
and `app.present_address ?? ''`, because `select('*')` simply will not return
columns that do not exist, and an approval must not start failing on a missing
field. It fills them when they are there and behaves exactly as before when
they are not.

`address` takes the **present** address, not the permanent one — an employee
record's single address field is the one you would post something to or expect
somebody at, which is where they live now.

## Verified

`typecheck` and `build` clean. `deno check` on the function reports the **same
two `TS2322` errors as `HEAD` does** — a `SupabaseClient` generic mismatch
between the two `createClient` instantiations at lines 197/216, pre-existing,
unrelated to this change, and not what the deployed bundle resolves (the
function has been live and working since 2026-09-16). Confirmed by stashing and
re-running: 2 before, 2 after.

## THE LIVE FORM IS BROKEN UNTIL 0020 RUNS

Not a new finding, but it needs saying at the top of its own section rather than
in a bullet: `0020_application_full_form.sql` has **not** been run on the live
database, and `useJobApplications.submit()` inserts 26 columns that do not exist
there yet. A real applicant on company.metrol.in fills eight steps, uploads five
documents, presses Submit — and gets a database error at the last moment, with
the draft still in `localStorage` and nothing on HR's screen. This is the single
thing blocking the feature that is otherwise finished.

## Still Adarsh's, unchanged

`RESEND_API_KEY` secret · office branches (0) · employee records (1) · festival
holiday dates. And **one question worth answering when convenient**: of the
other twenty-four paper fields, which belong on the permanent employee record?
The bank block and Aadhaar are the likely yes — payroll and statutory filing
both want them — but nothing will be added to `employees` on a guess.

---

# 0020 is installed, and Submit was not stuck — it was silent (2026-09-16)

Adarsh ran `0020_application_full_form.sql` and redeployed the Edge Function.
Verified by screenshot of his own check query: **new columns present — true (26
of 26)**, acceptance constraint installed — true, quarantine trigger still
installed — true. He then filled the real form on company.metrol.in, watched
the button sit on "Submitting…", and asked why it was stuck.

**It was not stuck. The second screenshot is "Application received".** It
submitted — it just took long enough, with nothing on screen changing, to be
indistinguishable from a hang. That is a real defect even though the data
arrived: the next person to see that button will close the tab.

## Two causes, and the bigger one is not the obvious one

**1. The uploads ran one after another.** A plain `for` loop `await`ed each of
the five files in turn, so five independent uploads paid five serialised
round-trips. They go up together now via `Promise.all`. `done` is *counted*
rather than indexed, because parallel uploads finish out of order — the number
means "how many are up", not "which one is going".

**2. The files were enormous, and that is what actually cost the minute.**
Five documents straight off a phone are 20–30 MB. Parallelism does not help
much when the uplink is saturated — 25 MB is 25 MB — so the real fix was to
stop sending 25 MB.

`shrink()` resamples any image over 600 KB to **1600px on its long edge at JPEG
0.82**. Measured in Chromium on a 4000×3000 photo: out at 1600×1200, **92%
smaller**.

**Why 1600 and not smaller:** these are PAN and Aadhaar cards, and the whole
point of collecting them is that HR can READ them. A card photographed
edge-to-edge puts its number around 1100px wide at this size — comfortably
legible. Going further would start trading away the document's only purpose.

**Three deliberate pass-throughs:** a PDF (no pixels to resample), anything
already under 600 KB (nothing to win), and **any re-encode that came out
bigger** than the original — an already-optimised JPEG can do exactly that, and
shipping the larger one would be a loss. Every failure path returns the
original file: a browser that cannot decode the image must still be able to
apply.

## The button now says what it is doing

`submit()` takes an optional `onProgress`, and the button reads
**Preparing… → Uploading 1 of 5… → … → Saving…** instead of one frozen
"Submitting…". Shrinking is announced before the count starts so it does not
appear to stall at "1 of 5" while the biggest photo is being resampled.

Labels are deliberately short. `.wiz-next` is `min-width:160px`, and measured
at 375px the row is 245px with Back at 59px and Submit at 160px — it fits
inside the existing minimum, so nothing reflows and the page does not scroll
sideways. "Uploading documents… 3 of 5" would not have.

## Verified in Chromium

`typecheck` and `build` clean. Layout measured at 375px as above. The shrink
path exercised end to end on a generated 4000×3000 JPEG: `createImageBitmap` →
canvas → `toBlob`, 1600×1200 out, 92% saved.

**No Edge Function change in this round — nothing to redeploy.** Vercel picks
this up from `main` on its own.

## One live record now exists

Adarsh's own test application (ADARSH, socialwiire@gmail.com) is a real row on
`job_applications`. It is the first end-to-end proof the pipeline works, and
it is also the obvious thing to approve or reject when testing HR's side.

---

# Approve stopped feeling frozen, and two records became deletable (2026-09-16)

Three separate complaints, one round. Adarsh had approved his own test
applications to prove the pipeline worked — which left real employees and real
logins in a directory of six people, with nothing anywhere in the app able to
remove them.

## 1. Approve was slow for the same reason Submit was

Same shape as the Submit fix earlier the same day, one layer down.

**The five documents moved out of quarantine one after another.** Each one is
download → upload → insert → remove, four awaited round-trips, and a plain
`for` loop serialised all five. The four steps of ONE file genuinely depend on
each other; the five files never did. `Promise.all` over `DOC_MAP` now.

**The invite email was inside the response.** HR pressed Approve and waited on
Resend — an external service on the other side of the internet — before seeing
anything. The application is marked decided FIRST, then the email runs under
`EdgeRuntime.waitUntil` after the response has already gone back.
`invite_sent_count` / `invite_sent_at` fill in quietly when the send lands, and
"Resend invite email" was already there for a genuine failure.

Because the email now outlives the response, the toast no longer claims it was
sent: **"approved — creating their login."** The employee row is real by then;
the email is not yet a fact.

**`approve()` and `resend()` re-selected every application** after the Edge
Function returned — a second network round trip stacked on the slowest call in
the app, to learn something the first response had already told us. Both patch
the one row they changed instead.

## 2. Approve read as a broken button

Clicking "Approve…" dropped the role form in BELOW the whole candidate dump,
so confirming meant scrolling down to hunt for a second, differently-worded
button. It looked exactly like the first click had not registered.

Two named steps now: **Step 1 of 2 — Role details** (the form, with the
candidate dump stepped aside, Close / Continue →) and **Step 2 of 2 — Confirm
& approve** (a recap, Back / Approve and create login). Back returns to step 1
with everything still typed. The required-field error fires on Continue, so it
appears on the screen that holds the fields.

Step 2 is a **recap, not the form again** — a second step earns its place by
asking a different question. Salary goes through `money()` there: ₹32,000 is
measurably easier to check than ₹32000, and it is the last look anybody gets
before that number becomes payroll.

## 3. Two different deletes, deliberately two different doors

**An application** (`useJobApplications.remove` + migration `0021`) is
low-stakes: no login, no payroll row, nothing points at it. HR or owner, from
the client, at any status. Its documents go first, then the row.

**An employee** (`useEmployees.remove` + the `delete-employee` Edge Function)
is not. DELETE stays revoked on `employees` and the table still has no delete
policy — `update` to `resigned` is still how a real person leaves, record
intact. This is a **second, harder door**: owner only (not HR), service role,
a `window.confirm` that names who is about to be erased. It removes the
`auth.users` login and the storage files by hand — neither is a row Postgres
can cascade — and lets the `on delete cascade` from 0009–0013 take leave,
salary, attendance, onboarding, exit and documents with the row.

Deleting an application never touches the employee it produced, and the
reverse is also true. They are separate records with separate doors.

## 4. Nine queries on open became four

HrPage fired nine `select *`s the moment it mounted, five of them for sections
most visits never reach. Salary, onboarding, documents, exit tasks and exit
records are now gated on the section — or the profile tab — that reads them.
`useExitRecords` gained the `enabled` flag its eight siblings already had.

**They are not "profile-only", which is what this looked like at first.** Every
one of these tables is read in TWO places: its own top-level section AND the
matching tab of somebody's profile. Gate on only the profile and Payroll draws
an empty table; gate on only the section and the payslip tab does. Each
condition names both. `docs` rides with `onboarding` — Onboarding is where
documents are counted and listed, they have no page of their own.

The five hooks are declared further down the component than the other four,
because the gate reads `section` and `profTab`, which are state declared below
the original hook block.

## Three defects found by testing, not by reading

1. **`onDelete` was in the modal's props type but never destructured.** `tsc`
   caught it; `vite build` does not typecheck, so the button would have thrown
   a ReferenceError on the first click in production.
2. **The footer spacer was inverted** — `marginLeft: mode === 'view' ? 0 :
   'auto'`, which is backwards. `.modal-foot` is `justify-content:flex-end`,
   so with no auto margin the destructive button sat touching Close. It now
   renders only in view mode, with the auto margin, and measures at left:18px.
3. **At 375px the fourth button clipped the first one off the edge.** Not
   scrolled to — cut in half and unreadable. `.modal-foot` wraps now; on a
   phone Approve takes its own row, which puts the primary and the destructive
   button further apart than the desktop layout does.

## Verified in Chromium, `?demo=1`

Demo honours `enabled` (the gate check precedes the `isDemo()` branch), so
walking the sections proved the gate both ways: Salary 12 payslips, Onboarding
6 documents / 30 checklist items, Exit 1 leaver — all empty until opened, all
correct once opened. Profile Salary and Onboarding tabs likewise. Approve step
1 → validation error → fill → step 2 recap → Back preserves every field. Foot
buttons measured at 1440 and 375, no clipping and no horizontal scroll on
either. `.btn--danger` in light mode is #A81E12 on #FCE0DC.
`typecheck`, `build` and `deno check` on the new function all clean.

## All three manual steps DONE — 2026-09-16

Adarsh ran 0021 and deployed both functions the same day the round shipped.

**`delete-employee` is live, confirmed here rather than taken on trust.** A POST
to `/functions/v1/delete-employee` returns the gateway's
`UNAUTHORIZED_NO_AUTH_HEADER` 401, and a POST to an invented function name
returns `NOT_FOUND` 404 — so the route exists. `approve-job-application` answers
the same way. **That differential is the whole test**: a bare 401 on its own
proves nothing, because a 401 is also what you would get if every unknown path
demanded auth. The 404 control is what turns it into evidence.

This works on `*.supabase.co` precisely where the same idea fails on
company.metrol.in — Vercel's bot checkpoint answers 200 to everything, including
paths that do not exist (see the 2026-09-13 correction above). Different host,
different rules; do not generalise either result to the other.

`WHATS-INSTALLED.sql` gained four rows so the state is measurable rather than
remembered: 0017's table, 0020's `present_address` column, 0021's delete policy,
and — as a standing invariant — that `employees` still has **zero** DELETE
policies. That last one is not a migration check. It is the harder-door design
asserting itself: the day somebody adds a delete policy to `employees`, the
owner-only Edge Function stops being the only way in and nobody would otherwise
notice.

## Measured on the live database — 2026-09-16, 21 of 21 rows

`WHATS-INSTALLED.sql` was run. Every migration row reads 1, and **both
must-stay-zero invariants read 0** — `employees` has no DELETE policy (the
owner-only Edge Function is still the only door) and 0014's old office columns
are still gone. 0017, 0020 and 0021 all present.

**Two numbers this file has been carrying as blockers have moved, and the old
text was about to mislead the next session:**

- **Office branches: 1, not 0.** Every earlier section here says attendance is
  *inert* because `punch_in()` returns `no_office`. **That is no longer true.**
  Somebody stood in an office and saved it. Punching in works now — the whole
  attendance module went live without a line of code, exactly as designed.
- **Employees on record: 2, not 1.** Holidays 7, matching the seed.

Do not repeat the "attendance is inert / only one employee" line from the
sections above without re-running the query. That is the same stale-claim
failure this file already caught itself in once, on 2026-09-12, when several
sections insisted migrations 0009–0012 had never run and measurement proved
they all had.

## Still Adarsh's

`RESEND_API_KEY` secret · employee records (2, HR entering the rest) · festival
holiday dates. And the open question from two rounds ago: of the twenty-four
remaining paper fields, which belong on the permanent employee record? Bank
block and Aadhaar are the likely yes; nothing goes on a guess.

**The Delete buttons themselves are still only proven in demo mode.** The
database and both functions are measured facts; the two buttons wired to them
have never been clicked against a real row. That is the one thing left to
confirm, and it takes two clicks.

---

# Sign out was broken, the account block moved to the sidebar, HR can delete (2026-09-16)

Three things Adarsh asked for in one message.

## 1. Sign out genuinely did nothing, and the reason is a footgun

`supabase.auth.signOut()` defaults to `scope: 'global'`, which POSTs to
`/auth/v1/logout`. **When that POST fails — an expired or already-revoked
refresh token is the ordinary case, not an exotic one — supabase-js RETURNS the
error and leaves the stored session exactly where it was.** Every call site in
this app was `void supabase.auth.signOut()`, so the error went nowhere,
`onAuthStateChange` never fired, and the button did nothing at all: no spinner,
no message, no sign-out.

`signOut()` in `lib/supabase.ts` now degrades instead of giving up — server,
then `scope: 'local'`, then drop the `sb-*-auth-token` key by hand and reload.
There is no state in which pressing Sign out should leave somebody signed in.

**The `void` is what hid this.** `void somePromise()` discards a rejection AND
a returned error object. Do not use it on anything whose failure matters.

## 2. The account block belongs in the sidebar

Adarsh: "if we have a sidebar, why is the top section showing the profile name
and the sign out button… we will be working on the desktop." Right — on a
desktop this app is a rail and a canvas, so "signed in as" is navigation
chrome, not something the content area should carry.

`AccountControls` is **one** component in two homes: the rail's foot on a
desktop, the topbar on a phone where there is no rail at all. Which one shows
is decided in CSS (`.topbar-account` is `display:none` above 860px; the rail is
`display:none` below it), so exactly one is ever on screen and the two cannot
drift — the lesson `Rail.tsx`'s own header already records about forking.

Collapsed to 64px the foot shows the avatar alone; widening the rail brings
back the name and role, ellipsised.

Three things fell out of doing it:

- **ProjectShell had no Sign out button at all.** Nobody had noticed; it has
  one now, for free, because the rail carries it everywhere.
- **The topbar gear is gone from Projects, TeamPage and ProjectShell.** The
  rail has had a Settings entry on all three since Round 16, and this file
  already said the topbar copy was the one to drop if the duplication ever
  read as redundant. It did. Nothing is lost — verified Settings still opens
  from the rail on each.
- **`.topbar-account--always`** exists for the employee's own app, which has no
  rail, so its topbar block is the only one and must survive on a desktop.
  `Member` and `ProjectShell` pass their density slider through `extra` —
  ProjectShell's was nearly dropped in this move and was caught by `tsc`
  reporting the now-unused import.

## 3. HR can delete an employee

It shipped owner-only on the reasoning that erasing somebody is not a daily HR
action. Adarsh's answer: HR is the one **maintaining** the directory. He is
right — the person who enters every record is the person who has to fix a wrong
one, and routing that through the owner makes the owner a bottleneck on HR's
own data.

Both gates changed, and they must stay in step: `canDelete` in `HrPage.tsx`
(courtesy only — hiding a button stops nobody) and the real one in
`delete-employee/index.ts`. **HR is a department, not a role**, so the function
mirrors `public.is_hr()` from 0006 by name — it cannot call `is_hr()` itself,
because `admin` runs as the service role and that function reads `auth.uid()`.

This now matches migration 0021, which already granted `is_owner() or is_hr()`
on applications. Both deletes answer to the same two people. What has NOT
changed: `employees` still has zero DELETE policies and DELETE is still revoked
— the browser cannot delete a row, only ask the function to.

## Verified in Chromium, `?demo=1`

Desktop 1440px: rail foot visible with theme/sign-out/profile on HR, owner
Projects and inside a project; `.topbar-right` empty on all three; Settings
still in the rail. Rail widened → "Priya Sharma / HR" with no overflow.
375px: rail hidden, topbar block visible with the same three controls, no
horizontal scroll. Member at 1440px: topbar block still visible (no rail) and
its density slider intact. HR at 1440px now sees **Edit · Mark as resigned ·
Delete** on an employee. `typecheck`, `build` and `deno check` clean.

## Redeployed — 2026-09-16

Adarsh pasted the updated `delete-employee` into Edge Functions the same day.
Both gates are now in step: HR sees the button and the server accepts HR.

**Nothing is owed.** Every phase (1-9), the shell rework, the approve/delete
round and this one are built, proven and deployed. The remaining items are all
data or a secret, never code: `RESEND_API_KEY` (approvals work without it, just
no email), employee records HR still has to enter, and the festival holiday
dates. Attendance is live — one office branch is saved, so the old "attendance
is inert" line in the sections above is stale; see the measured table dated
2026-09-16.

---

# The performance audit — why every click felt like wading (2026-09-16)

Adarsh, and he was right to be blunt: delete takes 20-30 seconds, every tab is
slow, and other products on this machine (Academy OS, Sadhna) open instantly.
"The button should work instantly if it is pressing."

Audited the whole path — client hooks, render behaviour, queries, the Edge
Functions. **Four causes, and one of them was mine from the round before.**

## 1. An RPC that WRITES, fired on every single render

`HrAttendance.tsx` had:

```
useEffect(() => { void att.finalizeOpen() }, [att])
```

`att` is the object literal `useAttendance` returns, and **no hook in this
folder memoises its return**, so `att` is a brand-new object on every render.
The effect therefore re-ran on EVERY RENDER of the attendance screen — every
keystroke in the search box, every toast, every tab click — each time calling
`finalize_open_attendance()`, an RPC that scans and UPDATES attendance rows.

A write endpoint hammered continuously for the life of the page, against a
database every other query on screen is also waiting on. This is the single
biggest reason the app felt like it was wading, and nothing about it was
visible without looking at the dependency array.

`finalizeOpen` is a `useCallback` with an empty dep list, so the fix is to
depend on the FUNCTION rather than the object: `[att.finalizeOpen]` cannot
change, so it runs exactly once. `CompanyAdminModal` had the identical bug on
`[ws]`, refetching the invite code continuously while the modal was open.

**The rule: never put a whole hook-return object in a dependency array.** Put
the specific function, and make sure that function is a `useCallback`.

**The underlying hazard is still there and is deliberately not swept in this
round:** all ten hooks in `data/` return a fresh object literal every render.
Fixing that means wrapping each return in `useMemo` with a correct dependency
list, and a wrong list there causes stale data — a worse bug than a slow one.
The two live instances are fixed; anyone adding an effect keyed on `ws`, `att`,
`hr` or friends will reintroduce it, so this is the first thing to check when
something feels slow again.

## 2. Nothing was optimistic — every button waited on the server

This is the one Adarsh described exactly: "we already know what the next step
is going to be, the button should work instantly." He is right, and the wait
bought nothing — the outcome is known the moment the button is pressed.

Delete employee, delete application, approve, mark-paid and every onboarding /
exit CHECKBOX now apply the change immediately and reconcile after. Each keeps
the exact state it replaced and puts it back if the server refuses.

**The honesty rule they all follow: a failure must be LOUDER than the
optimistic success, never quieter.** Every one returns the server's own message
and restores precisely what was there, so a refused write can never be mistaken
for one that worked. A checkbox that waits on the network before it ticks is
the most obviously broken thing any app can do.

## 3. Tab switches refetched — and that was MY regression

The previous round gated five HR hooks on the section that reads them, which
took HR's opening queries from nine to four. The cost, which nobody asked for:
`enabled` flips on every tab switch, so Salary → Leave → Salary re-queried
Salary each time. The rows were already in state and already correct.

Every `enabled` hook now fetches **once per mount, not once per visit** — a
`fetched` ref short-circuits the repeat. `reload()` became `load(true)` and
still forces a genuine re-read, which is what the Refresh buttons and the
post-approve reconcile need.

Gating on a tab is right. Re-fetching because of it was not.

## 4. `delete-employee` was eight round trips in a straight line

Now three waves:

- **Wave 1** — who is calling AND which employee, together. These never
  depended on each other: the employee id comes from the request body, not
  from the caller.
- **Wave 2** — role and department name in ONE request, via PostgREST's
  foreign-key embed (`select('role, departments(name)')`), instead of a second
  round trip to learn one string.
- **Wave 3** — the `employees` row and the `auth.users` login together.
  Postgres and GoTrue are separate systems with nothing to say to each other.

**Security order re-checked after the reshuffle**: the 403 still fires before
the 404, so an unauthorised caller cannot use this endpoint to discover which
employee ids exist. Verified by reading the returns in order.

## What this does NOT fix, said plainly

**Edge Function cold start.** Both functions do `import { createClient } from
'npm:@supabase/supabase-js@2'`, which the edge runtime resolves at boot. A
function invoked a few times a day is always cold, and that is seconds before
a single line of our code runs. Nothing on the client can shorten it.

What it can do is stop making the user watch it — which is exactly what the
optimistic writes above achieve. The row disappears the instant Delete is
pressed; the function finishing afterwards is no longer the user's problem.

If cold start ever needs to actually go away, the route is to drop the SDK from
`delete-employee` and use plain `fetch` against PostgREST and the Auth admin
API — it is six requests and no dependency, so the isolate boots with nothing
to download. Not done here: it is a rewrite of a security-sensitive function
and deserves its own round rather than being slipped into a long one.

## Not a cause, checked and cleared

- `useWorkspace.load()` is already fully parallelised and its `events` query
  bounded to 200. It is not the problem.
- `attendance` is capped at 2000 rows. Fine at today's size; revisit when the
  company has a year of punches.
- The 592 KB main bundle is a first-load cost, not a per-click one, and does
  not explain a slow button.
- HrPage is 1408 lines with almost no memoisation, so every state change
  re-renders every section. Real, but tens of milliseconds — nowhere near the
  reported 20-30 seconds, and not worth a risky refactor on that evidence.

## Verified in Chromium, `?demo=1&as=hr`

Salary → Onboarding → Exit → Salary → Onboarding: every tab renders correct
data, and revisits still carry it (12 payslips, 6 documents, 1 leaver), so the
fetch-once guard caches rather than blanks. HR still sees Delete on an employee
profile. `typecheck`, `build` and `deno check` clean.

**Timings were deliberately NOT measured here.** There is no `.env` on this
machine, so the dev server cannot reach the real database and any number from
demo mode would be about demo mode. The claims above rest on the code — a
stable `useCallback` in a dependency array cannot re-fire — not on a stopwatch.

## Redeployed 2026-09-16 — but NOT yet confirmed faster by the user

Adarsh redeployed `delete-employee` the same day. **He has not yet said whether
the app actually feels faster**, so do not record this round as proven. The
code changes are verified; the outcome he cares about is not.

How he can check the biggest fix: Attendance tab → F12 → Network → type in the
search box. Before this round every keystroke fired a `finalize_open_attendance`
request; after it, none do.

If delete still drags on the FIRST click of a session and is quick afterwards,
that is Edge Function cold start, not this code — the fix for that is dropping
the npm SDK from `delete-employee` for plain `fetch`, which is deliberately
left as its own round (see above).

---

# The QR poster becomes a file, and three attendance faults (2026-09-16)

Adarsh, after the performance round: check whether it is actually faster, then
go over attendance properly — punch in, punch out, and **being able to download
a branch's QR code with the branch name and address printed on it** so it can go
to a printer and onto a wall.

## First, the performance round — what is verified and what is NOT

Read every change from that round back against the working tree. All four are
in place and cannot regress on their own:

| Fix | State |
|---|---|
| `finalize_open_attendance()` on every render | fixed — `HrAttendance.tsx` depends on `[att.finalizeOpen]`, a `useCallback` with an empty dep list, so it cannot re-fire |
| `CompanyAdminModal` refetching the invite code | fixed — `[ws.getInviteCode]` |
| Tab switches refetching | fixed — a `fetched` ref in all eight gated hooks; `reload()` is `load(true)` |
| `delete-employee` eight serial round trips | three waves, 403 still before 404 |

**Still not measured against the live database, and that has not changed: there
is no `.env` on this machine, so the dev server cannot reach Supabase and every
number demo mode produces is a number about demo mode.** The claims rest on the
code. What Adarsh can do in thirty seconds is in the report he was given: HR →
Attendance → F12 → Network → type in the search box. Before that round every
keystroke fired a `finalize_open_attendance` POST. It should now fire none.

One hazard of the same class survives and is deliberately left: `App.tsx`'s
error effect keys on `[ws.error, ws.loading, toast, ws]`. It re-runs on every
render, but its first line returns unless there is an unshown error, so it costs
a comparison and no network. Noted so nobody "fixes" it by adding work inside.

## 1. A punch waited for the company's entire attendance history

`punchIn` / `punchOut` / `punchByQr` each called `load()` when the RPC came
back — five queries, one of them up to **2000 attendance rows** — while
somebody stood at the door with their thumb on the button. The button does not
release until it resolves, so that read IS the wait, on office wifi or on
whatever signal there is in the lift lobby.

None of it was needed. A punch changes exactly one row on exactly one date.
`refreshDay(date)` re-reads that day only, and the reason the full reload
existed is kept intact — the row is READ BACK, never patched in from the RPC
response, so the database stays the only thing that decides a status.

The date comes from the timestamp **the database stamped** (`at` in the
response), not from the device clock, so a punch either side of midnight still
lands on the day the database filed it under. A failed narrow read falls back to
the full one rather than leaving the screen stale, and a refusal that means our
copy is stale (`already_in`, `already_out`, `not_in`) re-reads too — those are
exactly the cases where the screen is wrong and needs correcting.

## 2. The scanner restarted the camera every 30 seconds

`QrScanner`'s effect depended on `[onCode]`, and every caller passes an inline
arrow — so `onCode` was a new function on every render of the parent. The
cleanup stops the camera track and the effect reopens it, so **every parent
render tore the camera down and started it again.**

On the punch screen this is not theoretical: the "you have been in for 3h 12m"
line runs a 30-second interval while somebody is punched in, so scanning to
punch OUT meant the camera cutting out mid-aim, once a minute, for as long as
they held the phone up. The callback is read through a ref now and the effect
has an empty dep list.

**The camera itself still cannot be exercised here** — the preview pane blocks
capture, and the scanner correctly falls back to "Camera permission is blocked"
(tested). First scan on a real phone is still the thing to watch.

## 3. Three things the database was told that were not true

- **A scan of any other printed square returned a Postgres error.**
  `punch_by_qr(p_token uuid, …)`. A camera pointed at the UPI code taped to the
  same desk sent a string Postgres cannot cast, so the person at the door read
  `invalid input syntax for type uuid` instead of being told the code is not
  ours. The token is shape-checked in the client now and answered with a
  sentence. No migration — this is entirely client-side.
- **An HR correction still claimed to have come from the geofence.** The live
  `correct()` patch never set `source`, and `attendance_regrade()` does not set
  it either — it re-grades and logs the edit and says nothing about origin. So
  on the real database a day HR typed was indistinguishable from a day somebody
  punched, while demo mode showed it correctly as "HR entry". `source: 'hr'` is
  in the patch now. **Days corrected before today are still marked 'self' — that
  is history and it is not being rewritten.**
- **A day HR added from scratch said it came from the button.**
  `punch_in_method` / `punch_out_method` default to `'button'` (0015) and
  `addDay` did not set them. Both are `'hr'` now.

## 4. The QR poster is a file you can print, not just a print dialog

What existed: a 190px square on screen and a Print button that built a separate
HTML page. No download at all, and the sheet that printed was assembled in a
second place from the one on screen.

`src/react/lib/qrPoster.ts` draws **one** poster — A4 at 150 dpi, 1240 × 1754 —
and Preview, Download and Print all use it, so the file mailed to the other
branch is the sheet on this branch's wall. On it: the branch name, its address,
the code at 760px (about 13 cm on A4), "Scan to punch in / Scan again when you
leave", the route through the app, **the branch's own allowed distance in
metres**, the line saying a photo of it will not work from home, and a foot
stamp of the code's first 8 characters and the date it was issued — which is
how HR tells two generations of poster apart after rotating one.

- **Download QR is a button on the branch row itself**, not two clicks deep in
  the edit modal. It was the thing HR does most often.
- The preview in the modal is now **the sheet**, not a bare square — a preview
  that omits the name is how two branches end up with posters nobody can tell
  apart. It keeps paper-white in dark mode, because that is what prints.
- **PNG, not PDF.** Every phone, printer and WhatsApp takes a PNG; a PDF means
  a library in the bundle for one sheet of paper.
- The square still encodes **only the token**. The name and address are ink for
  the human being, never inside the code.

## 5. One sentence that was false to the person reading it

The punch card told anybody without a branch "You can still punch at any
office". That is only true while `allow_any_branch` is on. With it off they are
refused, so the card now says to ask HR to assign them instead of sending them
to press a button that cannot work.

## Verified in Chromium, `?demo=1`

- Member: punch in → "In office", `0h 00m`, In stamped, month count 12 → 13 days
  → Punch out → confirm modal states how short the day is → recorded, graded
  **Absent** (correct for a one-minute day), "Today is closed", and the day
  appears in Recent days. Zero console errors across the whole flow.
- Member: Scan office code opens and degrades to the permission sentence.
- HR: Branches → **Download QR** on both branches, no errors; Edit branch →
  the poster preview renders and measures **1240 × 1754** with the right branch
  name, address, 50 m distance and issue date.
- Mobile 375px: the branches rows stack, both buttons fit, `scrollWidth` equals
  `innerWidth` — no horizontal overflow.
- `npm run typecheck` and `npm run build` clean.

## The geofence, re-proven on the live database — 2026-09-16

**31 of 31 PASS, zero FAIL, zero SKIPPED**, run by Adarsh the same day this
round shipped. Zero SKIPPED is the part that matters: every borrowed-person
guard found somebody, so every check actually executed rather than being waved
through.

What is established by measurement, after this round's code changes were live:
a member cannot insert or edit an attendance row, create an office location,
move a branch or widen its radius, loosen the punch settings, or rotate a
branch code — seven refusals at the database. `punch_in()` 3 km away → too_far
(3002 m against a 50 m fence); a 2 km accuracy fix → weak_fix; inside 22.2 m →
recorded with branch, coordinates, distance and a server timestamp; a second
punch-in → already_in; `punch_out()` closed and graded it. `punch_by_qr()` 3 km
away → refused; a rotated-away code while standing at that very branch →
refused; `allow_any_branch = false` → wrong_branch **and no row written by the
refusal**; `allow_any_branch = true` → the VISITED branch recorded, not the
assigned one; a second scan inside 2 minutes → too_soon **and the day left
open**. All four grading rules correct. An HR correction logged to
`attendance_edits` and re-graded rather than left as typed. A member read 0
other people's days. Clean up: PASS — no test branches or rows left behind.

**A correction to my own note, made the moment Adarsh ran it:** the line above
this section originally said the file "has still never been run". That was
wrong, and it was wrong the same way this file has caught itself once before —
by reading the "It has NOT been run yet" line in the Phase 6b/6c section and
not reconciling it against **PROVEN on the live database — 2026-09-12**, twenty
sections further down, which already recorded 31 of 31. **Read forward to the
newest measured claim before repeating an older one.** The result today is a
re-proof after this round's changes, not a first run.

## Open, deliberately

- No migration is needed for anything in this round.
- Monthly attendance export still does not exist. Nobody has asked.
- Week offs and holidays still have no effect on a day with no rows.
- The QR **camera** has still never been exercised — not here (the pane blocks
  capture) and not yet on a real phone. The button punch is proven end to end
  on the live database; the scan path is proven everywhere except the lens.

---

# Two permission prompts, one of them after the scan (2026-09-16)

Adarsh, having got a real punch working: signing in asks for one permission,
and then **after scanning it asks again** — he wants it asked once and then
never again.

## What was actually happening, and it is not one permission asked twice

Punching needs **location**. Scanning the poster needs **location AND the
camera**. Two separate browser permissions; nothing in any app can merge them.

But the ORDER was genuinely wrong. `scanned()` called `getFix()` *after* the
code was decoded, so the sequence was: tap Scan → camera prompt → aim → decode
→ **then** a location prompt, at the exact moment the person believes they have
finished. That is the second prompt he is describing, and it is ours.

`openScanner()` now starts the location fix **at the same moment** it opens the
camera. Both dialogs arrive together at the start, and the scan itself finishes
with nothing left to ask. The warm fix is reused only while it is **under 90
seconds old** — somebody who left the app open may have walked, and a stale
coordinate is the one thing this module must never file as evidence. Past that
it takes a fresh one.

## "Allow camera & location (once)"

A line on the punch card runs both requests in one deliberate moment the person
chose, rather than letting them arrive one at a time mid-task. It reports what
is still blocked and prints **the exact taps for the phone in their hand** —
generic "check your browser settings" is what makes somebody give up at the
door. It remembers having been run (`metrol-crm-perm-setup`, per browser) and
stops offering itself.

## What the browser will not let us promise, and the card says so

- **Android Chrome** remembers "Allow" for an https site permanently. "Allow
  this time" is the one that comes back tomorrow — the line says which to pick.
- **iPhone Safari asks again on a new page load** unless it is set per-site
  ("aA" → Website Settings) or in iOS Settings → Safari → Camera / Location.
  That is Apple's rule. **Do not tell Adarsh the app can stop it** — tell him
  the two taps that do.
- **Add to Home Screen** gives the app its own permission state and generally
  ends the repeat asking on both platforms. The meta tags for it have been in
  `index.html` since the phone build.

`permState()` reads the Permissions API where it exists. **Safari does not
implement the `camera` name and throws**, so every path returns `'unknown'`
rather than assuming denied — an unknown permission reported to somebody as a
blocked one is a worse lie than saying nothing. `askCamera()` opens the stream
only long enough for the browser to ask and then stops the tracks: holding it
would leave the camera light on while nobody is scanning, which staff notice
and distrust.

## Verified

`typecheck` and `build` clean. `?demo=1&as=member`: punch in records, the
scanner still opens, and the setup line is correctly **absent** in demo — it is
gated on `!isDemo()`, because a demo has no real permissions to arrange.
**The setup line itself has therefore only been seen on the live site, not
here.** Watch it on the first real phone.

## Adarsh's open question — do NOT build a toggle yet

His words: between the button and the QR, "one should be the continue… I can
ask HR which they thought would be best". Both still exist and both work. He is
asking HR which one the office should standardise on. **Wait for that answer.**
If it comes back as one method, the change is hiding the other button on the
punch card — not deleting `punch_by_qr` or the button path, because the other
branch may want the other one.

---

# Adarsh hit the real bug the moment he tested Resend (2026-09-16)

He clicked "Send invite email" on his own test application, right after adding
`RESEND_API_KEY`. The button showed a red banner: **"Edge Function returned a
non-2xx status code."**

## That is not what went wrong. That is `supabase.functions.invoke()` hiding
## what went wrong.

`approve-job-application` and `delete-employee` both `return json({ error:
'…the real, specific reason…' }, someStatusCode)` on every failure — that was
the whole point of writing them that way. But when the HTTP status is not
2xx, the client SDK throws a `FunctionsHttpError` whose **own** `.message` is
the literal string every screenshot from this bug will show: "Edge Function
returned a non-2xx status code". It does not read the response body for you.
The real JSON — `{ error: "RESEND_API_KEY is not set…" }` or whatever it
actually was — sits on `err.context`, a `Response` object, unread, on
**all three** of this app's Edge Function calls: `approve()`, `resend()` in
`useJobApplications.ts`, and `remove()` in `useEmployees.ts`. Every one did
`return err.message` (or folded it into the same `message = err ? err.message
: …` optimistic-write pattern the performance round introduced) and showed
Adarsh the SDK's wrapper text instead of our own sentence.

**This is the second time this app has hidden its own error behind a generic
one** — the first was `void supabase.auth.signOut()` silently swallowing a
result altogether. That one discarded an error; this one had the error in
hand and displayed the wrong string on top of it. Same family of bug, same
fix: stop trusting the library's own surface-level message and go get the
one this app actually wrote.

## The fix

`functionErrorMessage()` in `lib/supabase.ts` — the same file that already
carries `signOut()`'s "make the failure loud" fix — reads `err.context.json()`
and returns its `.error` string when there is one, falling back to
`err.message` for a genuine network failure (`FunctionsFetchError`, no
`.context` at all) or a body that was not JSON. All three call sites now
`await functionErrorMessage(err)` instead of reading `err.message` directly.

**Tested against three shapes with a throwaway Node script** (not a browser —
this is a pure function over a `Response`, nothing DOM-shaped): a real
`FunctionsHttpError`-style object with a JSON body resolves to the body's
`.error` string; a plain network `Error` with no `.context` falls back to its
own `.message`; a `.context` whose body is not valid JSON also falls back
rather than throwing. All three behaved correctly. `typecheck` and `build`
clean.

## What this does NOT tell us yet

**The actual reason Resend failed is still unknown** — this round fixes the
messenger, not the message. The likely candidates, in order: `RESEND_API_KEY`
was mistyped or saved under the wrong name; the function was deployed before
the secret was added and needs a redeploy for the new environment to attach;
or Resend has not verified `hr@metrol.in` as a sending domain, which the code
has assumed since Phase 8 and nobody has confirmed. **Once this file is
redeployed, the SAME button will show the real sentence.** Do not guess
further until that text is in hand.

## Redeploy needed

Client-only change — no migration, and the Edge Functions' own source did not
change, only how the browser reads their response. But the site itself has to
ship the new bundle before the real error becomes visible, so this still
needs the normal `git push` → Vercel path, already done.

---

# Two more bugs, found within a minute of Adarsh actually using it (2026-09-16)

Both from the same click: he opened his own test application and pressed
"Send invite email".

## 1. "Only an already-approved application can be resent" — on an approved one

The Edge Function's resend guard was one combined check: `app.status !==
'approved' || !app.employee_id`, one generic message for both. Adarsh's
application genuinely says Approved on screen, so the message was simply
wrong for what actually happened.

**The real reason: he deleted the employee this application produced**, using
the Delete button this very session built and asked him to test. 0017's own
FK is `employee_id uuid references public.employees(id) on delete set null`
— the moment `delete-employee` removed the employee row, Postgres set
`job_applications.employee_id` back to null **by itself**. Nothing marks the
application as changed. It still reads "Approved", because it was — the
decision stands, only the record it created is gone. Split into two honest
messages: still-pending gets the original sentence, approved-but-orphaned
gets its own — "approved, but the employee record it created has since been
deleted — there is no login left to invite."

**This is the interaction of two features from the same day**, not a bug in
either one alone: approve-then-delete-the-employee is a sequence that did not
exist before this session, and nothing prompted for it.

## 2. "The delete button also got pressed" — it didn't, its LABEL lied

One shared `busy` boolean drove FOUR different buttons' text — Approve,
Reject, Resend, Delete all read the same flag. Press "Send invite email" and
`busy` goes true; the Delete button next to it also reads `busy`, so its
label flips to **"Deleting…"** while nothing is being deleted. Adarsh saw
this immediately and described it exactly right: both buttons looked like
they were "pressing continuously".

Replaced the boolean with `action: 'approve' | 'delete' | 'reject' | 'resend'
| null`. `action !== null` still disables every button — two of these
overlapping for real is not a state worth allowing — but only the button
whose OWN action matches shows a busy label. Verified no live code reference
to `busy` survives (comments describing the old bug, which mention the word,
correctly do).

## Verified

`typecheck` and `build` clean. `deno check` reports the same 2 pre-existing
`TS2322` errors confirmed earlier this session as unrelated (a generic
mismatch between two `createClient` calls, present at HEAD before today,
nowhere near either line touched here).

## What this does NOT tell us

**Whether Resend actually sends an email is still unconfirmed.** Both bugs
found today sit IN FRONT of that check — the guard now correctly explains why
THIS PARTICULAR application can't be resent (no employee behind it anymore),
but that says nothing about `RESEND_API_KEY` or the `hr@metrol.in` sending
domain. **The next real test needs an application that still HAS an
employee** — either a fresh approval, or one Adarsh has not deleted the
employee for.

---

# Round 1 of the attendance brief — the employee's own month (2026-09-16)

Adarsh dictated a large multi-round brief (attendance → leave → payroll)
before sleeping. It is written down in full in `ATTENDANCE-PAYROLL-PLAN.md`
so none of it depends on remembering this conversation. This is Round 1.

## What was already there, and it was most of the rules

Before building anything, the live schema was checked against what he asked
for. Four of his "rules we need to create" already existed:

| He asked for | Already in `attendance_settings` |
|---|---|
| a 7-minute relaxation before late | `grace_minutes` default **7** |
| a 9-hour day | `required_minutes` default **540** |
| half-day threshold | `half_day_minutes` default **270** |
| Sunday off automatically | `week_offs` default `{0}` |

And the **passport photo he asked for has been collected since Phase 8** — the
joining form takes it, approval copies it into `employee-documents` as
`doc_type='photo'`. It was never displayed to the person it belongs to. This
round shows it rather than building a second uploader.

**The gap was never data collection. It was display.**

## The real problem: most days that matter have no attendance row

A Sunday, a holiday, an approved leave and a plain absence are all "no row in
`attendance`" — and the old Recent-days list rendered rows, so all four were
simply invisible. You could not check a month against a payslip because the
month had holes in it.

`buildCalendar()` in `lib/attendance.ts` synthesises **every date in a range**
and says what it is. Precedence, and the first rule is the one that matters:

1. **A real attendance row always wins.** Somebody who came in and punched on
   a Sunday or a national holiday worked that day. The row is evidence; the
   holiday is only a default. No calendar rule gets to erase it.
2. Approved leave — **approved only**. Adarsh was explicit that a request HR
   has not approved is not leave. The status filter lives inside the function,
   not in the caller, so pending leave cannot be passed in by accident.
3. Holiday (named), then week off, then — for a date already past — absent.
4. A future date is left blank rather than accused of anything.

`calendarTotals()` counts off the SAME list the grid and the table render, so
a tile can never disagree with the days under it. A late day counts in BOTH
present and late: "how many days was I here" and "how many times was I late"
are different questions and one number serves neither.

## What the employee now sees

- **Header**: the passport photo, name, employee ID, designation, department,
  email — the identity block he described.
- **Range filter**: two date inputs ("from where to where", his words) plus
  This month / Last month / Last 30 days, because typing two dates to get
  "this month" is a tax on the nine-out-of-ten case.
- **Colour grid**: seven columns so a row IS a week and Sundays line up under
  each other. Leading blanks pad the first week — a grid that merely wraps at
  seven puts every month's Sundays somewhere different.
- **The Excel-shaped table**: Date · Punch in · Punch out · Work duration ·
  Remark, every date present, newest first.

**The half day is not amber-on-amber.** It shares late's colour family but
carries a diagonal slash, so the two stay separable by shape — which is what
somebody who cannot tell one amber from another needs.

## Verified in Chromium, `?demo=1&as=member`, at 375px

Not asserted — measured. **6 and 13 September 2026 rendered `H` / "Weekly
off", and both are genuinely Sundays**; two padding cells, and 1 September
2026 is genuinely a Tuesday, so the week lines up. The 7th shows the half-day
slash at 5h 20m. Tiles read Present 11 (9 plain + 2 late), Late 2, Half 1,
Absent 2. The table shows a row for the 13th reading "Weekly off" with em
dashes where the times would be.

**No horizontal page scroll at 375px** — `scrollWidth` equals the 375px
viewport. The table is 573px inside a 345px `.att-table-wrap`, contained by
its own `overflow-x:auto`, which is this file's standing rule for tables.

**A measurement trap worth recording:** the first overflow check reported
`viewport: 0` and flagged every element as overflowing. The browser pane was
collapsed, so `clientWidth` was zero and everything "overflowed" nothing.
**Set an explicit viewport before believing an overflow measurement.**

`typecheck` and `build` clean.

## Rounds 2–5 are specified, not built

`ATTENDANCE-PAYROLL-PLAN.md` carries them: the rules engine (L1–L4 then the
5th late becomes a half day, paid-leave accrual, carry-forward vs
encashment), QR-only mode, payroll from attendance with two pay periods, and
the T&C as an in-app page. **Round 2 is the gate** — salary cannot be built
on rules that do not exist yet.

## The punch-out bug is NOT fixed, and was not guessed at

He reported a QR punch-out that did not update. `punch_by_qr`'s punch-out
branch was read end to end and is correct, and it is proven live (31/31). Two
candidates remain and they need one answer from him to tell apart: the
deliberate **2-minute double-scan guard** (`too_soon`), or a scan that never
decoded. Asking beats shipping a fix for the wrong one.

---

# Round 1, finished — the phone table, and two things the month got wrong (2026-09-16)

`21d8f7d` shipped the CSS to hide the year on a phone and said so in its own
message: **the `.yr` / `.ampm` spans it targets were never put in the JSX**, so
the year still showed. Adarsh's ask was "hide what is obvious — the year", and
"no sideways scroll on a phone". Done now, and measured rather than claimed:

## The claim "all five columns fit" was false until this round

Measured at 375px before any change: **the table was 469px in a 345px box.**
Hiding the year alone would never have fixed it. Where the width actually went:

- **"WORK DURATION" was the widest thing in its column** — the header, not the
  hours under it. Phones now read `In · Out · Hours`; a laptop keeps the full
  words. Two spans per header (`.lbl-long` / `.lbl-short`), one table.
- **The remark repeated its own chip**: a chip reading *Late* followed by
  "Late · 6 min late". `buildCalendar()`'s `remark` now carries ONLY what the
  label does not already say ("6 min late", a holiday's name) or nothing; the
  grid tooltip composes label + remark itself.
- **Remark is the one column allowed to wrap** on a phone, so a holiday name or
  "corrected by HR" drops under its chip instead of setting the width of every
  row in the month.
- **am/pm is hidden on phones too.** Tried keeping it: it fit 360px only until
  a chip as long as "No punch out" appeared, which pushed it 13px over.

With the worst real rows injected (No punch out, a holiday + HR note, a late
note): **412 / 390 / 375 / 360 px all fit exactly, zero sideways scroll.**
320px overflows by 12px *inside the table's own box* (the page does not
scroll) — the documented last resort, on a screen size nobody at Metrol has.

## Two faults in Round 1 itself, found while in there

1. **HR's own corrections rendered as a red Absent.** `buildCalendar()` mapped
   five row statuses and sent everything else to `absent` — so a day HR marked
   *On leave*, *Holiday* or *Week off* told the employee the opposite, and a
   day somebody punched in and never closed (`missing_punch_out`) called a
   person who was in the office absent. All nine statuses in 0013 are now
   named; `no_punch_out` is a new `DayKind` (neutral open-day square, counted
   as present — they were here — with the red "No punch out" chip in the table
   asking HR to settle it). Proved by importing the module and feeding it all
   five cases: leave / holiday / no_punch_out / late[6 min late] / absent,
   and a PENDING leave still correctly absent.
2. **Leave was not blue.** The brief said blue; the build used the brand
   yellow, which sits one shade from late's amber in BOTH themes (`#2A2410`
   vs `#332812` in dark). The legend swatches were indistinguishable. New
   `--info` / `--info-soft` / `--info-line` tokens in all three theme blocks,
   used only by `.cal--leave` and its legend swatch.

`typecheck` and `build` clean (the >500 kB chunk warning is pre-existing).

**Noted, not changed:** the *Worked* tile wraps "105h / 50m" onto two lines at
360px. Pre-existing, cosmetic, left for a polish pass.

---

# Round 2 — the leave rules engine, finished (2026-09-16)

The ladder, the accrual and the choice, all the way from Postgres to both
screens. Adarsh's answers from the plan file were followed exactly; nothing
here was invented.

## What the engine does

`0022_leave_rules_engine.sql` — `leave_month_summary()` (one person, one
month), `leave_month_board()` (everybody in a month, HR only) and
`close_leave_month()`. **2 paid days accrue per month.** Lates 1–4 in a month
are free; **every late after the 4th is a half day**, and a half day costs 0.5
of the balance. **Absent with no approved leave does not touch paid leave** —
it is a day's salary, per answer 2. **Only APPROVED leave spends the balance**;
pending is not leave. Closing records the employee's choice: **pay out** pays
every unused day and the balance restarts at zero, **carry** adds them to next
month. The three T&C extras — probation, same-day-unpaid, period leave — are
numbers/switches in Settings and are **off by default**, per answer 3.

A month refuses to close until it has ended, the month before it is closed, and
every day nobody punched out of is settled. All three refusals come back as the
database's own sentence.

`leaveRules.ts` is the TypeScript mirror for demo mode and **matches the
database on all 16 checks**, down to the half day.

## What was built this round (the part that was missing)

The two screens that still showed the old yearly "18 days a year" model, which
is why the tree would not compile:

- **The employee's Leave tab** is a MONTH now, with a month stepper: Available
  (brought forward + earned), Used, Left, Unpaid. Plus the sentences that make
  the numbers mean something — a provisional opening balance when HR has not
  closed last month, the late ladder's running cost, and days never punched out
  of. Closed months are listed underneath with the choice that was made.
- **HR's profile Leave tab** — the same four figures for whoever is open.
- **HR's "Close the month" board** — one row per person (closing balance, used,
  unpaid, late count, unsettled days) with **Carry forward** and **Pay out**.
  This is where the employee's choice is recorded, and it is what Round 4's
  payroll will read.
- **Period leave is not offered in the request form until HR switches it on**
  (`periodLeavePerMonth > 0`). Offering a type the engine will not pay is how
  somebody applies for something that silently becomes ordinary leave.

## Verified in Chromium, `?demo=1`

Member: Available 2 (0 brought forward + 2 earned), Used 1, Left 1, Unpaid 1,
and the provisional notice. HR: the board lists all six with their own figures
(Mohit 5 late, Arjun 2). **Closing the CURRENT month is refused** — "A month
can only be closed once it is over." Stepped back to August 2026 and paid out:
toast fired, the row became **"Paid out 1.5"**. `typecheck` and `build` clean,
no console errors.

**One wording bug of mine, caught by reading the rendered sentence rather than
the code:** `lateHalfDays` COUNTS half days, it is not a number of days — the
note said 5 lates had "taken 1 off your balance" when one half day costs 0.5.
It now names both: how many half days, and what they cost.

## 0022 IS NOT INSTALLED ON THE LIVE DATABASE

Until Adarsh runs it, every leave figure on the live site shows the hook's own
sentence — "The leave rules are not installed on the database yet — migration
0022 has to be run first" — rather than PostgREST's schema-cache error. Nothing
else on the site is affected; attendance, payroll and the rest are untouched.

## Rounds 3–5 still specified, not built

`ATTENDANCE-PAYROLL-PLAN.md` carries them: QR-only mode, payroll from
attendance with two pay periods, and the T&C as an in-app page. Round 4 is now
unblocked — it reads the closed months this round produces.

---

# The attendance screen, redesigned (2026-09-17)

Adarsh, bluntly: the typography is bad, the right half of a desktop is blank,
and three paragraphs of rules sit under a button somebody presses twice a day.

**The principle the whole round follows: what stays on screen daily is what
CHANGES daily.** Anything identical every morning — how far you have to stand,
why the camera is needed — is read once and then gets out of the way.

## What moved

- **Identity first.** The photo/name/ID block was stranded between the punch
  card and the month; it is the page's header, so it is at the top and slim.
- **Today is one horizontal strip**, not a narrow card against a blank right
  half. Date and branch · the clock · In/Out · the buttons, across the full
  width. **Measured at 1440px: 1248px wide and 74px tall**, where the old card
  was a fraction of the width and several hundred pixels tall.
- **The month is the first thing under it, and on a laptop it is ONE line** —
  every day of the month as a small column carrying its own weekday letter.
  Measured: 17 days, 17 columns, 78px tall. On a phone the same cells fall back
  to seven-per-row weeks (measured: 7 columns, the S M T W T F S header back on,
  pad cells back on) because 31 columns on a 375px screen is four pixels a day.
  **One markup, two shapes, no second copy to keep in step.**
- **The rules left the screen.** `.punch-note` count on the attendance screen is
  now **0**. They live in a **one-time popup on the first visit** — which is also
  where both browser permissions are asked for, together, once — and behind an
  **ⓘ button** on the strip for anybody who wants them again. The standing
  "Allow camera & location (once)" line is gone with them.
- **The range controls sit on the "My attendance" heading line**, not on a band
  of their own.
- **The profile's sub-tabs and its month stepper share one line** — the stepper
  is a filter for the tab it sits in, and it had a whole strip of white to
  itself for two arrows.
- Tiles tightened: 20px numbers, 8px padding.

## Verified in Chromium, `?demo=1&as=member`

1440px: strip 1248x74, month one row of 17, zero permanent notes, no page
scroll. 375px: month back to 7 columns with its header, strip stacks to 219px,
`scrollWidth` equals the 375px viewport. `typecheck` and `build` clean.

## NOT done — the wider sweep

Adarsh asked for an audit of **every** page with the same eye. This round did
the two screens he named in detail (his Attendance, and the Profile tab's
stepper line). **HR's own screens, Projects, the project shell and the
salesperson's other tabs have NOT been through this pass yet** — do not claim
otherwise. The same three questions apply to each: is anything here read only
once, is any block narrower than the screen for no reason, and does any control
have a row to itself that belongs on a heading line.

---

# Punching stopped waiting on the GPS, and the method became a rule (2026-09-17)

Two asks in one message: make punching feel instant with a green confirmation,
and let the owner/HR switch one method off entirely.

## 1. The wait was never our code — it was the fix

`go()` called `getFix()` when the button was pressed. A high-accuracy position
is **seconds of work for the phone**, and `maximumAge: 0` forbade reusing even
the fix taken moments earlier. So the button sat on "Checking…" through the
slowest part of the operation, and the RPC after it — the part we control —
was already fast.

- **The fix is now warmed the moment the Attendance screen opens**, and again
  after every successful punch so the punch OUT is warm too. By the time a
  thumb reaches the button the answer is in hand.
- **`getFix` gained a `maximumAge` argument, still defaulting to 0.** A punch
  passes 30 s, which lets the browser hand back the position it just took
  instead of powering the GPS up again. **The default stays 0 on purpose**:
  capturing a branch's centre must never reuse an old fix, and that call was
  deliberately left alone.
- A warm fix is only spent while it is **under 90 seconds old** — somebody may
  have walked — otherwise a fresh one is taken.
- **The button says which half it is in**: "Finding you…" then "Recording…",
  instead of one static word across two very different waits.

**Nothing was made optimistic here, and that is deliberate.** The database
decides whether somebody is inside the fence; a green tick before it answers
would be the app claiming an attendance record that may not exist. What was
removed is the waiting that bought nothing.

## 2. The green line

`.pb-ok` — a green bar with the database's own sentence, under the strip, where
the thumb just was. The toast stays, but a toast is easy to miss on a phone held
at arm's length at the office door. Verified: pressing Punch in produced
**"✓ Punched in at Noida Sector 6. Have a good day."**, the buttons flipped to
Punch out, and the clock started at 0h 00m.

## 3. Button, QR, or both — enforced on the row

`0023_punch_methods.sql` adds `attendance_settings.punch_methods`
(`both` | `button` | `qr`) and a **BEFORE INSERT OR UPDATE trigger on
`attendance`** that refuses a punch made by a method the company has switched
off. HR entries (`source = 'hr'`) are never affected.

**Why a trigger and not three rewritten functions:** `punch_in`, `punch_out`
and `punch_by_qr` are proven live (31 of 31, 2026-09-16), and re-typing their
bodies to add one check at the top is exactly the kind of edit that silently
loses a line. The trade is the shape of the refusal — this raises, so the
client shows the sentence rather than a jsonb `{ok:false}`. The sentences are
written for the person at the door: *"The punch buttons are switched off here.
Scan the office QR code instead."*

**Hiding a button stops nobody**, which is why this is not UI-only: a hand-made
REST call to `punch_in()` gets the same refusal.

HR sets it in **Settings → How people may punch**. The punch strip then shows
only what is allowed, and in QR-only mode the scan button becomes the primary
one and reads "Scan to punch in".

The client sends `punch_methods` **only once the column exists**
(`punchMethodsInstalled`), the same guard 0022 needed — naming an unknown
column would refuse the whole settings save, grace minutes included.

## Verified

`typecheck` and `build` clean. Demo: punch in → green line → buttons flip →
clock runs. **0023 has NOT been run on the live database** — until it is, the
setting is absent, the app behaves as 'both' exactly as it did before, and the
dropdown's choice will not save.

---

# Reconciling two sessions, and what is actually still open in Round 3 (2026-09-17)

Adarsh's other Claude Code account hit its usage limit mid-Round-3 ("$211,
your most expensive session — stop here for today"); this session picks up
from the committed result, not from that session's own transcript. Checked
rather than assumed: `git status` clean, three commits since 0022 was written
(`410503f` Round 2 reaching both screens, `acd807c` the attendance redesign,
`36a2bce` the punch-method rule + the GPS-warming fix), and `typecheck`/`build`
both clean on everything together.

**Adarsh ran `0023`'s own proof query directly against the live database** (a
Supabase SQL editor screenshot, not fetched by this session) and it came back
installed: the column, the guard function, the trigger, all present, mode
`both`. That is stronger evidence than anything in CLAUDE.md's own log, which
still said "0023 has NOT been run" as of the commit that added it — the log
was simply written before he ran it.

**Correction, minutes later: `0022` IS confirmed live too.** Adarsh ran the
extended `WHATS-INSTALLED.sql` and pasted back all 29 rows — every 0022 and
0023 row reads 1, both guard rows (`employees DELETE policy`, `old office
columns GONE`) correctly read 0. Both migrations are fully installed. The
caution above was right to ask for evidence rather than assume it, and wrong
for about five minutes; recorded here rather than quietly edited away, same
as every other stale claim this file has caught.

**Round 3 is HALF done, corrected in `ATTENDANCE-PAYROLL-PLAN.md` rather than
left reading as finished.** Read the actual code before ticking anything:
QR-only mode and the settings switch are real, enforced in the database, not
just the UI. But the check-out confirmation still opens on every punch-out
regardless of hours worked (the brief asked for it to skip past 9 hours), and
manual correction is still open to HR, not moved to the owner. Neither is
built.

## WHAT YOU DO NEXT

1. **Run the updated install check** — one paste, answers whether 0022 is live
   (0023 already is):
   ```bash
   pbcopy < /Users/apple/metrol-crm/supabase/WHATS-INSTALLED.sql
   ```
   Paste into Supabase → SQL Editor → Run, and send back the rows.
2. **If any `0022` row reads 0**, run the migration itself the same way:
   ```bash
   pbcopy < /Users/apple/metrol-crm/supabase/migrations/0022_leave_rules_engine.sql
   ```
   Until it runs, every leave figure on the live site shows "the leave rules
   are not installed yet" instead of a real number — nothing else on the site
   is affected.
3. **Everything else keeps building here** — the two open Round 3 items above,
   then Round 4 (payroll), unless you'd rather redirect.

---

# Round 4 (payroll) and Round 5 (Terms & Conditions) — both built and pushed (2026-09-17)

Both were fully specified in `ATTENDANCE-PAYROLL-PLAN.md` with Adarsh's own
answers already recorded, so this session built straight through without
re-asking anything. Full detail is in that file's own Round 4 and Round 5
sections; this is the short version.

**Round 4.** `employees.monthly_salary` (new, nullable — nobody is priced
yet), `lib/payroll.ts` turns it plus `leave_month_summary()`'s own numbers
into a payslip (gross, net, a 1st–15th/16th–end breakdown), a "Compute from
attendance" button on the existing payslip form fills those fields for HR to
review before saving, and `send-payslip-email` (new Edge Function, same
Resend pattern as the job-application invite) emails one payslip with
sent/resend tracked on `salary_records`. Migration `0024_monthly_salary.sql`
is two `ALTER TABLE ADD COLUMN` statements — proven against a throwaway local
Postgres cluster (a fresh `initdb`, not this repo's real schema, since the
change itself never touches anything but two new columns): idempotent on a
second run, the salary check constraint accepts null and a positive number
and rejects a negative one, `salary_records`' two new columns default to 0
and null correctly.

**Round 5.** The printed T&C is now a full page — HR's sidebar and every
employee's own Profile → Terms tab (`screens/sections/TermsAndConditions.tsx`)
— transcribed by hand from the PDF rather than parsed from it at runtime, with
a live table comparing every number the T&C states against today's
`attendance_settings`. As of this session: the late-arrival ladder, paid
leave count, payout/carry-forward behaviour, the 6-day week, and the 9-hour
shift all match. Period leave, probation, and same-day-unpaid are switched
off in the database even though the T&C states them as active policy — not a
bug, HR's own switches, off by default per Adarsh's 2026-09-16 answer. The
late-arrival WINDOW (flexible 10:00–10:30 vs. shift-based) and 3.3's
"double-day deduction" (not automatic — settled the same day) are flagged as
deliberate differences, not disagreements to fix.

**Typecheck and `vite build` both clean.** Verified in Chromium at `?demo`
(owner) and `?demo&as=member` (employee): Salary section shows the new
Emailed column and Email/Resend buttons, Add payslip's "Compute from
attendance" button correctly shows as disabled ("Not available in demo
mode") since demo mode never touches the network, a payslip still saves
correctly with the new fields present, and the Terms & Conditions page
renders and computes its comparison table correctly on both the HR and
employee sides.

**CONFIRMED live on the real database, 2026-09-17.** Adarsh ran `0024`
directly in the Supabase SQL editor (screenshot, not fetched by this
session) and its own proof query came back correct: `employees.monthly_salary
column (must be 1)` → 1, `salary_records payslip-email columns (must be 2)`
→ 2. Its data rows read `employees priced so far` → 0 and `employees total`
→ 1 — the column exists and works, nobody has used it yet. That last number
is a live-database fact worth double-checking with Adarsh separately: it is
lower than the headcount this file's earlier rounds describe (six seeded in
the demo, several named directly in Round 2/3 notes), so either the company
code most people signed up with is not this one, or most of the team simply
has no `employees` row yet — checking rather than assuming, same discipline
as everywhere else in this file.

## WHAT YOU DO NEXT

1. **Set everyone's monthly salary once** — Employees → open each person →
   Edit → "Monthly salary (₹)". Until this is filled in, "Compute from
   attendance" will refuse to run for that person, on purpose. Worth first
   confirming how many employees the live directory actually shows — the
   migration's own proof query read `employees total: 1`, which is fewer
   than expected; if the directory in the app also shows just one person,
   that is worth understanding before pricing anybody.
2. **Try a real payslip** — Salary → pick someone who is now priced → Add
   payslip → Compute from attendance → check the numbers → save. Then try
   "Email payslip" on it and confirm it actually lands in an inbox (Resend's
   own dashboard shows delivery status if it doesn't).
3. **Read the Terms & Conditions page** (HR sidebar, or any employee's
   Profile → Terms) and tell me if the three "switched off" items — period
   leave, probation, same-day-unpaid — should actually be turned ON in
   Attendance Settings, or stay off as they are now.

---

# UI polish round: calendar redesign, Joining merge, camera speed, Request leave (2026-09-17)

Same day as Rounds 4–5, a separate string of asks from Adarsh after payroll
shipped. All pushed to main; Vercel deploys each commit automatically.

- **Refresh-persistence fixed everywhere.** Every "which tab am I on" —
  App.tsx's route, HrPage's section/profile-tab/open-employee,
  ProjectShell's section, Member's section/profile-tab — used to reset to
  the default on a page refresh. `lib/usePersistedState.ts` (sessionStorage,
  not the URL) fixes this app-wide.
- **Employee's own attendance month redesigned**, through several rounds of
  feedback: ended on ONE horizontal strip (not a multi-row grid), full
  calendar month (1st–30th/31st, not clipped to today), cells stretch edge
  to edge, each cell shows its own weekday letter + a soft gradient fill per
  status, today gets the app's gold accent ring.
- **Applications + Onboarding merged into one "Joining" tab** (Applications
  / Onboarding toggle inside it) — they were never the same data
  (job_applications vs onboarding_tasks), but looked like duplicate
  tracking of the same person. Sidebar: 10 tabs → 9.
- **Camera scanning sped up.** GPS was already pre-warmed on page load; the
  camera was not — `PunchCard` now warms and reuses ONE camera stream for
  the whole visit (only once permission was already granted before, never
  as a first-visit surprise), and asks for 640×480 instead of the camera's
  default resolution. `QrScanner` accepts a borrowed stream and never stops
  one it doesn't own.
- **"Request leave" now also lives on the Attendance tab itself** (same
  modal Profile → Leave already used), not one tab away.
- **HR's Leave tab shows a pending count** in the sidebar ("Leave (2)"),
  same pattern as Joining's applications count.

## NOT done — explicitly deferred, not forgotten

1. **Camera speed fix not yet confirmed working** by Adarsh directly on the
   live site — built and pushed, verified in the browser here, but the
   actual "does Scan code feel faster now" answer is his to give.

---

# Attendance/Leave merge + live leave alert (2026-09-17)

Both items deferred at the end of the previous round, built this session.

**Attendance/Leave merge.** One sidebar tab ("Attendance", labelled
`Attendance (n)` when n requests are pending — same pattern Joining already
used for pending applications), with a Day/Leave toggle inside it
(`HrPage.tsx`'s new `attView` state, persisted the same way `joiningView`
is). Deliberately NOT copy-pasted from the Joining merge: Joining's two
halves (Applications, Onboarding) are simple lists that share one `<h1>`
cleanly. Attendance (day table, branch settings, QR poster management) and
Leave (approve/reject, close-the-month payout math, holidays) are both full
screens in their own right, so each keeps its own page-head below a shared
toggle rather than being forced under one heading — reads as two real
screens with one door, not one screen wearing two hats. Every place that used
to jump to a standalone Leave tab (`HrAttendance`'s "Open Leave →", the
Dashboard's "decide →" rows, the "more leave request(s)" overflow line) now
sets `attView('leave')` on the same Attendance tab instead. `typecheck` and
`vite build` both clean; verified in Chromium at `?demo` — toggle switches
correctly, refresh persists whichever half you were on, both desktop sidebar
and the phone-width bottom tab bar (with its badge) checked.

**Live leave alert.** `leave_requests` was already on the `supabase_realtime`
publication (migration 0009) but nothing in the app actually subscribed to
it — the sidebar count was the only signal, and only updated on reload/own
writes. `useLeaveRequests.ts` now opens a `postgres_changes` INSERT channel
(same pattern `useWorkspace.ts`'s lead/event channels already use, RLS
applies exactly as it does to a query — this widens nothing), and skips
rows this browser's own `create()` just wrote itself (checked via a
`rowsRef` mirror, not the `toast`-eating "echoed back" comment pattern from
`useWorkspace`, since re-alerting HR about the leave they just logged
themselves would be noise, not news). A new `LeaveAlertStack.tsx` renders a
stacked, dismissible, click-to-open banner top-right, in the app's existing
`--bad` red (not gold — gold already means "pending" on the chip itself,
so a gold banner would have read as one more pending chip rather than a
fresh thing to look at) — deliberately separate from the routine
save-confirmation `toast`, which is one slot, three seconds, and would
otherwise silently erase a request nobody has seen yet. It renders once at
the top of `HrPage`'s JSX, outside the `section` switch, so it is not tied
to whichever HR sub-screen (Dashboard, Attendance, Salary, Exit…) is open —
"wherever HR is" means anywhere inside the HR module; leaving the module
entirely for Projects unmounts it, same as every other HR-only feature on
this page. `typecheck` and `vite build` both clean. NOT verified against a
second live browser yet (demo mode has no realtime, so this session's
`?demo` check only confirmed the banner's own visual design by injecting it
directly into the DOM) — the real test is two tabs, one logged in as an
employee submitting a request, one as HR watching it land.

## WHAT YOU DO NEXT

1. **Try Scan code twice in a row on the live site** and tell me if it feels
   faster — the one open item from last round.
2. **Try the Attendance/Leave merge live** — Attendance tab, Day/Leave
   toggle at the top, refresh on either half to confirm it stays put.
3. **Try the leave alert with two browsers** (or your phone + laptop) — log
   in as an employee in one, HR/owner in the other, submit a leave request
   from the employee side, and confirm a red card appears top-right on the
   HR side without refreshing. This is the one thing I could not verify
   myself in this session (demo mode has no live database to push a real
   insert through), so it's worth an actual test before calling it done.

---

# Uniformity, weight, and motion (2026-09-17)

Adarsh, with two screenshots side by side: *"you are not maintaining the
uniformity of the UI/UX and premiumness… in one tab you put the todos on the
right side, and in another tab, Attendance, you put it in the top-left corner.
If you are putting the todos in the top-right corner, put them in the top-right
corner in every tab."* Then: the buttons are too small, it *"looks mechanic"*,
and switching tabs should have an animation.

He was right on every count, and the first one was structural rather than
cosmetic — worth recording precisely, because it is the kind of thing that
creeps back in the moment somebody adds a screen.

## 1. The inconsistency was real, and here is exactly what it was

- **Joining's** Applications/Onboarding switch lived INSIDE
  `.page-head > .section-tools`, which is `margin-left:auto` — so top right, on
  the heading line.
- **Attendance's** Day/Leave switch lived in a bare `.seg` block **above** the
  page head — so top left, on a row of its own.

Same control, same job, two different corners. Fixed by handing the switch into
each half (`HrAttendance` takes a `viewToggle` node) rather than rendering it
above them, so both halves keep their own `<h1>` and the control sits where
Joining's already did.

**Then a second pass, because "inside the right-aligned group" is not the same
as "in the corner".** First attempt put the switch FIRST in `.section-tools`,
which measured 670px from the right edge on the Day view (four other controls
after it) and 0px on Joining. It goes **last** now. Measured after: `gapRight`
is **0 on all three** — Attendance-Day, Attendance-Leave, Joining.

**The rule, and check it before adding any screen:** every page-level control
belongs in `.section-tools` on the heading line, and a view switch goes last so
it lands in the same corner every time. Nothing gets its own band above the
`<h1>`.

## 2. "Looks mechanic" — three causes, all measurable

- **34px at font-weight 500 is a web button, not a product one.** `.btn` is now
  38px / 13.5px / 600. `.btn--sm` 28 → **32** (this file's own Phase 7 notes had
  already flagged 28px as under a comfortable touch target and nothing was done
  about it). `.btn--lg` 42 → 46.
- **Nothing had elevation.** Every control sat perfectly flat on its own
  background. A two-layer shadow on the primary button, a one-layer hint on the
  rest — no new colours, the palette is untouched.
- **Hover only changed a colour**, so nothing ever moved under the cursor.
  Hover now lifts 1px and deepens the shadow; **pressing returns it to the
  resting plane** rather than pushing it below, so the travel is up-then-back,
  which reads as a key being struck.
- **A toolbar was three different heights** — a 30px search beside a 32px button
  beside a 26px segment. `.section-tools` normalises every child to **36px**.
  Measured after: the set of control heights on a page head is exactly `[36]`.

`.seg` and `.tabs` were raised to match (30px / 36px, weight 600, the active
state carrying a real shadow instead of a flat fill).

## 3. The tab animation

`key` + `.view-in` on HrPage's `.wrap`: a section swap remounts the wrapper,
which replays a keyframe — 7px rise and a fade over **0.24s** on a
`cubic-bezier(.22,.61,.36,1)`. Short on purpose: somebody clicking through four
tabs must never wait for the animation, which is the failure mode of animated
tabs. Keyed on the open profile too, so opening a record arrives like a tab
does. `prefers-reduced-motion` switches it, and the hover lifts, off.

## Verified in Chromium, `?demo=1&as=hr`

1440px: the switch measures 0px from the right edge on Attendance-Day,
Attendance-Leave and Joining; toolbar control heights are a single value (36);
`animation-name` on the wrap reads `viewIn`; no page scroll. 375px: the switch
still renders, `scrollWidth` equals the viewport. `typecheck` and `build` clean.

## NOT done — and he asked for more than this

His question was *"what are the things you can improve for me so you can do
that?"*, which is broader than the three items above. **Only HR's screens went
through this pass.** `Projects`, `ProjectShell`, `TeamPage` and the
salesperson's `Member` screen have NOT been checked against the same rule, and
they almost certainly break it somewhere — that is the next session's work, and
the three questions to ask of each screen are:

1. Is any page-level control NOT in `.section-tools` on the heading line?
2. Is anything on screen daily that is only read once?
3. Does any block sit narrower than the screen for no reason?

---

# Exit folds into Joining — the arrival-to-departure arc in one tab (2026-09-17)

Adarsh: *"we can also merge the joining and exit tabs… In the joining tab, we
make one option there: the exit or leave employee section. Exit is not something
HR is going to open on a regular basis, right?"*

Right, and it is the same argument that merged Attendance/Leave: a screen opened
a few times a year does not deserve a permanent slot in a nav somebody reads
every morning. Joining now holds **Applications · Onboarding · Exit** — the
whole arc from somebody applying to somebody leaving.

**The rail is 7 items, down from 8.** Measured: `Dashboard, Attendance (2),
Departments, Employees, Salary, Joining & Exit (1), Terms & Conditions`.

## The tab is renamed, and that was not asked for

A tab labelled "Joining" that contains the Exit screen is a label that lies, and
mislabelled navigation is exactly the class of thing this project keeps finding
late. It reads **"Joining & Exit"**. One string to change back if he disagrees.

## Done WITHOUT moving any JSX

This file's own Round 9 rule — *never delete or move code by slicing between two
markers* — was followed literally. The Exit block stays exactly where it sits in
the tree; only its **condition** changed, from `section === 'exit'` to
`onExitView`. Both blocks are siblings under `.wrap` and only one section ever
renders, so nothing had to be cut and re-pasted. Everything else was an
exact-match edit:

- `joiningView` gains `'exit'`; the Joining block now renders when
  `joiningView !== 'exit'` and the Exit block when it is.
- The switch is built once as `joiningToggle` and dropped into BOTH page heads'
  `.section-tools`. **Exit's page head had no `.section-tools` at all** — it does
  now, which is what makes the switch reachable from inside Exit and keeps the
  corner rule from this morning intact. Measured `gapRight: 0`.
- `useExitTasks` follows `onExitView` instead of a section that no longer exists.
- The Dashboard's "Open Exit →" button sets the section AND the view.
- The Exit badge counts people **on notice only** — somebody who resigned in
  March is history, not a task.

**A stored section of `'exit'` would have rendered nothing** for anybody whose
browser persisted it before this change, since the tab it names is gone. A mount
effect sends them to the view that replaced it. Worth remembering: every one of
these merges leaves a stale `usePersistedState` value behind in real browsers.

## Verified in Chromium, `?demo=1&as=hr`

Rail 7 items; Joining's switch reads `Applications (1) · Onboarding · Exit (1)`;
clicking Exit swaps the heading to "Exit" and the switch is still on screen (3
buttons, 0px from the right edge); no page scroll. `typecheck` and `build` clean.
Two now-dead things removed rather than left: the `EXIT_ICON` rail icon and an
invalid `short` prop `RailItem` does not have.

## Still not swept

`Projects`, `ProjectShell`, `TeamPage` and the salesperson's `Member` screen
have **still** not been through the uniformity pass. Unchanged from this
morning's note.

---

# The front door, rebuilt around the real logo (2026-09-17)

Adarsh sent the finished Metrol Media logo — a rendered plate, black ground,
gold rim light, the M mark beside the stacked wordmark — and asked for it on the
landing page, "upgraded to look premium and aesthetic".

## The one decision everything else follows from

**The landing page is now pinned DARK and does not follow the light/dark
toggle.** Two reasons, the first deciding it:

1. **The logo is a rendered plate, not a transparent mark.** Its own black
   background and gold lighting are baked into the pixels. On the old white
   card it read as a screenshot of a logo pasted onto a page. On black it reads
   as the logo — the plate's ground and the page's ground are the same colour,
   so the mark floats free of any visible edge.
2. Black/white/gold **is** the brand. A front door should state that rather
   than inherit whatever the viewer's laptop was set to last night.

So every colour in this block is **literal, not a token** — a token would flip
under the theme toggle and undo the whole point. This is the only screen in the
app written that way, and the comment in `prototype.css` says so.

## What is on it

A transparent top bar with a ghost Sign in (it must not compete with the one
real CTA) · the logo with **no plate, no border, no card** — the render carries
its own environment and a box around it is a second frame inside the first · a
gold radial glow behind it, picking up the same gold the render already throws
onto its own floor · a gold eyebrow · the headline with **the company's name in
gold, one accent in one place, which is what keeps it meaning something** · the
sub copy · a gold CTA with a warm shadow · the access note demoted out of the
paragraph to its own small line under the button · a muted footer.

The `public/logo.png` mechanism is unchanged and still the switch: the file's
presence swaps the lockup for the image, `onError` swaps it back. **The
"Placeholder — drop your logo" line is gone** — the fallback lockup is now
styled to look deliberate rather than unfinished, because it is what shows on
the live site until the file is committed.

## Verified in Chromium

1440px with a stand-in image at the real logo's aspect ratio (**generated, used
to check the layout, and deleted before the commit — a fake logo must never
ship**), and again with no file at all so the fallback path was seen as Adarsh
will see it. 375px: no horizontal scroll, `scrollWidth` equals the viewport, the
CTA goes full width capped at 340px. `typecheck` and `build` clean.

## THE FILE IS NOT IN THE REPO

**A pasted image does not reach the file system** — this session could see the
logo and could not save it. `public/logo.png` does not exist. Until Adarsh drops
it there and pushes, the live site shows the fallback lockup, which is correct
behaviour and not a bug. Do not record this round as finished on the live site
until he confirms the file is in.

---

# The real logo lands, and the uniformity sweep continues (2026-09-17)

`public/logo.png` arrived (committed as `5a847fa`, a 1774×887 render) and
Adarsh iterated on the hero live in chat through three shapes before landing
on one:

1. **The plate boxed, full size, copy below it** — close to the placeholder
   round's own layout, just with the real image.
2. **The plate as a full-bleed BACKGROUND**, copy overlaid in the middle. Built
   and rejected on sight: the render's own wordmark sits in the middle of the
   plate, so bold overlaid text landed directly on top of "METROL MEDIA"
   already printed in the image — two sets of letters fighting for the same
   pixels. No scrim tuning fixes that; the collision is structural.
3. **Back to (1), with sharper copy.** This is what shipped. `Landing.tsx`
   shows the full plate — no crop, no background trick — with a bold two-line
   headline (`One workspace, every `**`Metrol Media`**` project.` / a lighter
   sub-line under it) and a plain outlined "Sign in" button. The eyebrow tag,
   the long paragraph and the "Access is limited…" note from the placeholder
   round are gone; two lines was the ask.

**Verified in Chromium**, 1440px and 375px: full plate visible, no cropping,
no horizontal scroll, `typecheck` and `build` clean.

## The uniformity pass, continued onto Projects / the project view / Team / Member

The morning's HR pass (three questions: is a page-level control outside
`.section-tools`, is anything daily-visible only read once, does anything sit
narrower than the screen for no reason) had explicitly NOT touched these four
areas. Swept this round, `?demo=1` / `&as=member` / `&as=lead`:

- **Projects, ProjectShell's five sections (Overview/Leads/Sales/Team/Dashboard),
  TeamPage** — all already conform. Every page-level control lives in
  `.section-tools`, every control on a page head measures 36px, `gapRight` to
  the page edge matches the page-head pattern everywhere it was checked.
  Nothing to fix.
- **Team roster cards truncated** — `.team-grid`'s `minmax(240px,1fr)` let
  `auto-fill` pack exactly five columns at a normal desktop width, which is
  also exactly this roster's size, so every card locked to its narrowest
  possible share and "163 leads · 30 converted" clipped to "163 leads · 3…".
  `minmax(280px,1fr)` fixed it (verified: `scrollWidth === clientWidth` on
  every stat line now) without changing how any other screen's cards wrap.
- **Member's Attendance tab broke on a phone** — "My attendance" and the
  From/To range sit on one row on desktop (`.section-head--wrap`,
  `align-items:center`), which was never wrong there. On a 375px screen the
  range's own fields wrap onto two or three rows internally, and centering the
  heading against that whole wrapped stack put "My attendance" floating
  mid-way down beside the "To" field instead of above everything — the exact
  "looks mechanic" class of bug from this morning, just one screen over. Fixed
  with a `max-width:600px` rule that stacks the heading above a full-width
  range-bar instead of sharing its row. The equivalent rule for `.section-tools`
  already existed a few lines up in the file for the same reason (HR's
  directory toolbar collapsing) — this is the same fix for a different control.

**Verified in Chromium** at 1440px and 375px, `?demo=1&as=lead` (Manage team
tab included) and `&as=member`: both fixes confirmed by measuring
`scrollWidth` against `clientWidth` directly, not just eyeballing it.
`typecheck` and `build` clean throughout.

## Not yet committed

Both fixes and the landing-page copy are sitting in the working tree, same as
every other round in this file — ask before committing, this repo has more
than one session touching it.

**Committed as `59be944`** the next morning, on Adarsh's explicit yes.

---

# The permission popup was broken three ways (2026-09-18)

Adarsh, from his iPhone on the live site: *"I am clicking on this multiple
times, but it is not working. Laptop also, mobile also. Plus I think it is
opening the camera."* His screenshot showed the "Before you start" popup still
on screen with "Done — you should not be asked again" already printed inside
it, and the green camera dot lit in the iOS status bar.

He was right on both counts, and there was a third fault behind them.

1. **The popup never closed on success.** `allowBoth()` set a note and stopped.
   Nothing ever set `intro` back to false, so after a successful Allow the
   popup sat there unchanged except for one line of text — and pressing the
   button again just re-ran an already-granted request to no visible effect.
   That is the entire "clicking multiple times, not working" report: the
   button worked perfectly every time and never once looked like it had.
2. **Granting the permission switched the camera on and left it on.**
   `allowBoth()` ended with `warmCamera()`, which opened a `getUserMedia`
   stream and *held* it — camera light on, green iOS recording dot on, for as
   long as anybody had the Attendance screen open, with no viewfinder anywhere
   in sight. Introduced as a speed fix ("Scan code" felt slow); the cost was
   never worth it and `permissions.ts` had already said so in writing: a
   camera light on while nobody is scanning "is the kind of thing staff notice
   and distrust."
3. **`SETUP_KEY` meant two different things** — "has seen the intro" (set by
   **Skip** too) and "has granted the camera before" (what `warmCamera` read
   it as). So pressing Skip, which grants nothing, marked the browser as
   granted and let the camera be opened on that person later.

## The camera pre-warm is gone, deliberately

Not fixed — removed. The warm stream only ever helped a *second* scan minutes
after the first, and the real day is a scan at 9am and a scan at 6pm, nine
hours and a page reload apart (a scanner that fails to read keeps looking
rather than reopening, so that is not a second open either). What it actually
did on an ordinary day was keep the camera lit for nothing. `QrScanner` now
owns its camera outright — opens on mount, stops on close, every time — and
the `sharedStream` borrowing path went with it. Fault 3 dissolved on its own
once the only consumer of the "granted" meaning was gone.

**The trade, stated plainly so nobody re-adds it:** the first tap on "Scan
code" now costs about a second of "Opening the camera…", at the one moment a
person is actually expecting their camera to come on. That is the correct
place to spend it.

## Verified in Chromium, `?demo&as=member`, both branches

The Browser pane hard-blocks real camera access, which made the **denied**
branch testable for free: popup correctly stays open and prints the
platform-specific "here is how to unblock it" instructions. The **granted**
branch was then exercised by stubbing `getUserMedia` (a canvas
`captureStream`) and `getCurrentPosition` to succeed — popup closes
immediately and toasts "Camera and location allowed. You are all set."
`typecheck` and `build` clean; grepped for leftovers, none.

---

# PARKED — notifications, properly, and the birthday calendar

Adarsh, same message, explicitly asked for this to be **recorded and not built
yet**: *"whenever we complete all the phases, then we build the notification
properly. Not first option — second option properly."* He was choosing against
the cheap in-app-banner version I had offered for the 9-hour shift reminder
and in favour of real push notifications, because the reminder is not the
point — a notification SYSTEM is:

- **HR broadcasts.** Any update, any message, holiday announcements. "They
  will receive a notification like they receive on WhatsApp."
- **A notification tab in the app** — everybody sees the messages there too,
  like Telegram/Snapchat's notification section, not only as a push.
- **Push notifications proper**, arriving when the app is closed. This is the
  part that needs the real build: a service worker, Web Push subscriptions
  stored per employee, VAPID keys, and something to send on a schedule — this
  Supabase plan has no cron, which is the same constraint that made
  `finalize_open_attendance()` a screen-load job instead of a midnight one.
- **A birthday calendar**, in the Employees tab. HR sees whose birthday falls
  on which date, and *today's* birthday surfaces on its own so HR can plan the
  cake. On the day, everybody gets the happy-birthday notification.
- The **9-hour shift reminder** that started this conversation folds in here
  as one more notification type, rather than being built as a one-off banner.

**Do not start this before the current phases are finished** — that was his
instruction, not an assumption. `employees` has no date-of-birth column yet;
that is the one schema change this will need and it should land with the rest
of the feature, not ahead of it.

---

# Notifications, built — broadcasts, the feed, real push, birthdays (2026-09-18)

The phases finished (all 5 rounds of the payroll brief, plus the punch-out
QR "bug" turning out to be the 2-minute guard working correctly) unparked
this. Built in full, against a plan Adarsh approved first.

**Two things the plan-mode research corrected before any code was written:**
this app deploys on **Vercel** (`vercel.json`), not Cloudflare — the
Cloudflare assumption came from `nevorai`, a sibling product, not this repo.
And `employees.date_of_birth` **already existed** (since `0006`, collected on
the joining form since `0020`) — the line above saying otherwise was stale;
no schema change was needed for birthdays, only a screen.

## What shipped

- **`0025_notifications.sql`** — `notifications` (fan-out on write, one row
  per recipient, same shape as `salary_records`/`employee_documents` rather
  than a shared row plus a read-tracking table) and `push_subscriptions`,
  both RLS'd the same way `leave_requests` (0009) already is. Two
  `security definer` RPCs: `create_broadcast()` (HR/owner only, self-checked
  the way `finalize_open_attendance()` checks itself) and
  `check_todays_birthdays()` (idempotent — safe to call on every screen
  load, which is exactly what happens).
- **The "cron tick" reused, not reinvented.** This Supabase plan still has
  no scheduler. `check_todays_birthdays()` gets the identical treatment
  `finalize_open_attendance()` already proved out: a plain `useEffect`
  firing once per mount, wired into `HrPage.tsx` and `Member.tsx` — the two
  screens that get opened daily by *somebody*.
- **The bell lives in `AccountControls.tsx`**, not a new rail tab — that
  component is already mounted in every screen's topbar AND rail-foot, so
  it's the one place "wherever you are" is actually true, and it sidesteps
  `BottomNav`'s tab budget (Member+team-lead was already at 6, overflowing
  into More). Clicking it opens a portal panel (`NotificationBell.tsx`) with
  its own two-axis collision handling — it has to work anchored near the
  bottom-left (rail) AND the top-right (phone topbar), which plain
  `right`-based positioning couldn't do; it now mirrors `Menu.tsx`'s
  left-anchored, clamped, flip-above-when-tight approach on both axes.
- **HR/owner get a "+ New broadcast" button inside that same panel**
  (`BroadcastModal.tsx`) rather than a separate composer screen — title,
  optional message, audience (everyone or one department).
- **Birthdays surface in HR's existing Employees tab** — a new block above
  the directory, this month's birthdays sorted by day, today's called out
  with a chip. Reads `hr.rows` (already loaded), no new query.
- **Real push**, the part Adarsh specifically distinguished from the cheap
  version: `public/sw.js` (push + notificationclick, nothing else — no
  offline cache, that's a different feature), `src/react/lib/push.ts`
  (subscribe/unsubscribe against the Push API, wired to an "Enable
  notifications" toggle inside `ProfileModal.tsx` — the one profile surface
  every role already shares, so this needed no per-screen duplication —
  deliberately behind an explicit tap, not asked for on load, the same
  lesson the camera-permission popup fix a day earlier just finished
  drawing), and `supabase/functions/send-push/index.ts` (same
  bearer-token → service-role → manual `is_owner()/is_hr()` recheck shape
  `send-payslip-email` already uses, `npm:web-push@3` for the actual VAPID
  signing, expired 404/410 subscriptions cleaned up on send rather than
  retried forever).

## VAPID keys — generated, one half committed, one half needs Adarsh

Generated with `npx web-push generate-vapid-keys` (pure local crypto, no
account needed). The **public** key is meant to be public and is committed
plainly in `src/lib/push.ts` and as the fallback in `send-push/index.ts`.
The **private** key is a real secret and was handed to Adarsh directly in
chat, not committed — he needs to add it under Supabase Dashboard → Edge
Functions → Manage secrets (the same place `RESEND_API_KEY` already lives,
per `send-payslip-email`'s own header comment — this repo deploys Edge
Functions by pasting the file into the Dashboard, not via CLI), alongside
`VAPID_SUBJECT=mailto:<his email>`.

## Verified in Chromium, `?demo=1`

Demo mode is fully client-side (`demo.ts`'s own comment), so it cannot
exercise real Supabase realtime, RPCs, or an actual push send — what it DID
verify: the bell renders and opens correctly in both the rail (owner/HR,
initially clipped off-screen bottom-left until the two-axis positioning fix
above) and the phone topbar (salesperson); "+ New broadcast" shows only for
owner, not for `as=lead`; the composer modal opens correctly; the birthday
date-formatting math was checked directly (no demo employee's DOB happens to
fall on today, so the block correctly renders nothing rather than showing a
false positive); the "Enable notifications" toggle fails gracefully with a
readable error rather than crashing — the Browser pane sandbox blocks real
service worker registration the same way it already blocks real camera
access (noted in the punch-QR round two days ago), so genuine push delivery
needs testing on the deployed site after the VAPID secret is set.
`typecheck` and `build` clean throughout.

## Still open — needs Adarsh's answer, not a guess

**The shift-end reminder has no trigger yet.** Everything above works
because a screen gets opened daily. "9 hours after punch-in, notify me" has
to fire even with the app closed, which the screen-load trick genuinely
cannot do, and this Supabase plan has no cron. The notification *type*
exists and is sendable; nothing calls it on a schedule. Three options were
laid out for him in the plan (a free external cron ping; Vercel Cron, which
needs a paid plan for sub-daily frequency; or accepting a screen-load
approximation that could arrive late) — not decided yet.

---

# 2026-09-18 — the white screen, named

The ErrorBoundary added an hour earlier did its job: instead of a blank
window the owner got a sentence, and the sentence was the whole diagnosis —

> Error: cannot add `postgres_changes` callbacks for realtime:notifications-live
> after `subscribe()`.

## The cause

`AccountControls` renders **twice** on every screen that has a rail — once in
the topbar, once inside `Rail` — and which of the two you see is decided in
CSS (`.topbar-account` is hidden above 860px, the rail below it). Both are
mounted in React, always. That was fine until the notifications round put
`useNotifications()` inside it, which made two subscribers on one hard-coded
realtime topic.

`supabase.channel(topic)` does **not** always give you a new channel:
`RealtimeClient.channel()` returns an existing one when the topic matches, and
`RealtimeChannel.on()` throws outright if the channel has already subscribed.
So the second copy of the bell grabbed the first copy's live channel and threw
— inside a `useEffect`, i.e. *after* first paint, which is exactly why the
dashboard appeared for a fraction of a second and then vanished.

Every condition Adarsh reported falls out of that:

- **signed out** — `AccountControls` never mounts, no crash
- **demo** — the subscribe effect returns early before `.on()`, no crash
- **a salesperson** — `Member.tsx` has no rail, so only ONE copy mounts
- **the owner (and HR)** — rail + topbar, two copies, crash

## The fix

Notifications are session state, so they now live above the screens:
`NotificationsProvider` holds the one feed and both bells read it through
context. One fetch and one subscription for the whole session, the two bells
can no longer disagree about the unread count, and navigating between screens
no longer tears the channel down and rebuilds it.

Two smaller guards alongside it, because the goal is that this class of bug
cannot paint the window white again:

- the realtime topic is now unique per mount (`notifications-live-<n>`), so
  the client can never hand back a subscribed channel — this also settles the
  unmount/remount race, since `removeChannel()` is async and the old channel
  lingers in the client's list while it drains
- `.on().subscribe()` is wrapped: a realtime failure costs the live badge, not
  the screen. The feed still loads, and the bell reloads whenever it is opened.

`useNotifications.ts` became `.tsx` (it holds a provider now).

## Verified

The throw was reproduced character-for-character against the installed
`@supabase/realtime-js` 2.115.0 — old pattern (one fixed topic, subscribed
twice) throws the exact message from Adarsh's screenshot, new pattern does
not. The provider contract was render-tested with two bells: both resolve to
the *same* feed object (so exactly one hook instance), and a bell rendered
outside the provider fails loudly rather than quietly showing an empty feed.
`typecheck` and `build` clean.

Not verified in a browser: the Browser pane's dev server was blocked by a
stale port registration from another session, and demo mode cannot exercise
this path anyway (it skips the subscribe). **The live site with the owner
account is the real confirmation** — that is Adarsh's one step.

## Worth knowing for next time

Anything session-wide — a realtime channel, a polling loop, a subscription —
must not be created inside `AccountControls`, `Rail`, or anything else that
CSS renders twice. `useWorkspace` and `useLeaveRequests` are fine today
(one call site each), but they use fixed topics too, so the same trap is set
for whoever mounts them a second time.

# The other two channels, closed off (2026-09-18)

The entry above ends by naming the trap that was still set: `useWorkspace` and
`useLeaveRequests` also used fixed realtime topics, safe only because each has
exactly one live call site. Both now get the treatment `useNotifications` got
— a per-mount topic (`workspace-<n>`, `leave-requests-live-<n>`) so
`supabase.channel()` can never hand back an already-subscribed channel, and a
`try`/`catch` around `.on().subscribe()` so a realtime failure costs the live
updates, not the screen.

Nothing about the app changes. This is the same class of bug being made
impossible rather than merely improbable: one call site each is no longer what
stands between a second mount and a white window.

## Verified

Both old topics reproduce the crash character-for-character against the
installed `@supabase/realtime-js` 2.115.0 —

> cannot add `postgres_changes` callbacks for realtime:workspace after
> `subscribe()`.

— and both new ones take a second subscriber without throwing, on genuinely
separate channel objects. `typecheck` and `build` clean.

## Found on the way — NOT fixed

`HrPage.tsx:138` hands `useLeaveRequests` an inline arrow as `onIncoming`, and
that hook's subscribe effect lists `onIncoming` in its dependencies. A fresh
function identity on every render means HR tears its realtime channel down and
builds a new one **on every render** — a websocket join and leave per render.
The unique topic now absorbs the collision risk, so this is waste rather than
a crash, but it is waste on a screen HR keeps open all day. The fix is the one
this file already uses for `rows`: mirror `onIncoming` into a ref and drop it
from the deps. Left alone because it was not this round's ask.

---

# PENDING — mobile UI/UX density pass, requested 2026-09-18 (not started)

Adarsh's own words (voice-dictated, cleaned up below — check against the
original if any line reads oddly). Scope is the **Member app** first
(Profile, Attendance, My Sales, Overview), then the **same patterns**
wherever they repeat for HR, other departments, and the owner's own screens.
Nothing in this section is built yet — this is the brief, not a log of work
done.

## Profile tab
- Give it a real header card at the top, same shape as the identity card
  already on Attendance: photo/DP on the left, name + ID number + role/
  department beside it.
- Section pills (Leave / Salary / Onboarding / Terms) stay below it, as today.
- **Sign out moves INTO this tab**, as the last item after scrolling — not a
  top-bar icon anymore.
- Top bar: remove the sign-out icon. Adarsh also said "remove the logo at
  the top right" — the brand mark is on the top-LEFT today, so this is most
  likely the avatar/profile shortcut on the top-right (redundant once Profile
  is its own bottom-nav tab), not literally the brand logo. **Confirm which he
  means before removing anything** — don't guess on this one line.

## Attendance tab
- Move **Refresh** into the top-right of the section's own header row —
  today it sits on its own line below "Attendance", wasting a row.
- The line **"Punch in when you reach the office, punch out when you
  leave"** stops being permanent copy. Replace it with a one-time dismissible
  notice (an ✕ to close it, and it never shows again once dismissed for that
  user). Same treatment for any other always-on instructional/disclaimer text
  found elsewhere in the app — this is meant as a general rule, not just this
  one line.
- **Request leave**: move it beside the identity card (horizontal), not
  full-width below it, so the card block is denser.
- **"Friday, 18 Sept" and "Noida Sector 6 · shift 10:30"**: one line, not
  two — branch and shift don't change day to day, so they don't need their
  own visual row.
- Check-in/check-out block: centre the typography properly (it currently
  reads a little uneven around the big hour counter).
- The **"In office"** pill: right-aligned (top-right of that card), green
  when active.
- Date range controls: the three separate buttons (This month / Last month /
  Last 30 days) plus the always-visible From/To fields collapse into **one
  dropdown**. Default: "This month". From/To only appear when "Custom" is
  picked from that dropdown.
- **Mobile only**: the day-strip calendar wraps to two rows (roughly half
  the month each) instead of one horizontally-scrolling row — nobody should
  have to swipe sideways to see the whole month on a phone. Desktop keeps the
  single strip.
- The legend row (Present / Late-half day / Leave / Absent dots) stops being
  permanently visible — replace with a small **(i)** icon that reveals it on
  tap.
- Attendance table column order becomes: **Date → Check-in → Check-out →
  Remark → Hours** (Hours moves from 4th to last, after Remark, since reading
  check-in/check-out then immediately the hour total was reading confusingly
  next to Remark in between).

## Everywhere else
- Same pass — tighter vertical rhythm, no redundant always-on text, top bar
  kept minimal — applies to **My Sales**, **Overview**, and the equivalent HR/
  other-department/owner screens wherever the same issues repeat. Not a
  literal per-screen spec; use judgement screen by screen the way the
  Attendance spec above demonstrates the intent.

## Not yet decided
- The exact wording/one-time-notice mechanism (localStorage key vs. a DB
  column, given other users on other devices) — pick the simplest thing that
  actually never shows the notice again for that person.
- The Profile top-bar line above ("logo" vs. avatar) — ask Adarsh before
  removing either.
