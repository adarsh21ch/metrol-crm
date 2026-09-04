# Metrol Media CRM — Claude Code Context

## Status of this file

**This is a reconstructed context file, not the original.** The original
`CLAUDE.md` (114 lines) was written in a previous Claude Code session running
locally on the client's Mac at `/Users/apple/metrol-crm/`. That folder was never
pushed to GitHub, so it is not reachable from a cloud session.

What is captured below is only what could be recovered from the handover summary
of that session. **Missing and still required:**

- The original 114-line `CLAUDE.md` — contains the full original brief, the stack
  decisions, the 7 interpretations made during the first build, and the 4 open
  questions for Metrol Media.
- `design/metrol-crm-prototype.html` — the actual prototype. This is the file the
  four changes below have to be applied to. Nothing here can proceed without it.
- The published artifact URL for the prototype, which lives on a different Claude
  account and cannot be republished to from this one.

## What this project is

A CRM prototype for **Metrol Media**, built as a single self-contained HTML file
at `design/metrol-crm-prototype.html` and published as a Claude artifact for the
client to review.

## NEXT UP — the four requested changes

These are the changes the client asked for and that are still outstanding.

### 1. Black / white / yellow rebrand

Premium black-and-white base, with **yellow as the highlight colour** — active
sidebar item, focus rings, selected states.

- Green / amber / red stay **exactly** as they are. They carry status and quality
  meaning and must not be folded into the new palette.
- **Legibility constraint:** yellow text on a white background is genuinely hard
  to read. Yellow must be used as a **fill with black text on top**, never as
  small text.

### 2. Projects screen

- Three smaller cards per row, replacing the current wide bands.
- A **Cards / List toggle**.
- List view must be a proper table: serial number, thumbnail, name, click-to-open.
- Project photos supported in **both** views.

### 3. Two sidebars inside a project

- **Sidebar A** — lists all projects, so you can jump straight between them
  without going back to home.
- **Sidebar B** — Overview / Leads / Sales / Tracking / Sales dashboard.
- **Recommendation given to the client:** make the projects sidebar a narrow icon
  rail, so the wide leads table keeps its room. The client's stated alternative is
  showing full project names instead — their call.

### 4. Light / dark toggle

A real button in the topbar, with the choice remembered between visits. Not
buried inside the prototype panel where it currently sits.

## Working notes

- The prototype is a single HTML file — no build step, no framework.
- When the prototype is republished, it must go to the **same artifact URL** the
  client already has. That republish can only be done from the Claude account
  that originally published it.
