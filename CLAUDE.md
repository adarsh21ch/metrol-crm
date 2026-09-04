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

# NEXT UP — nothing assigned yet

Open items, smallest first. None of these were asked for; do not build them unasked.

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
