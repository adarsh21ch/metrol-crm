# Department incentives — the brief, and the decisions already made

Adarsh's voice brief, 2026-09-22. Nothing below is built yet. This file exists
so the money rules survive the session they were decided in.

## The shape of it

Incentive is currently a plain number HR types on a payslip. This replaces that
with a claim an employee files and HR approves, and the payslip's incentive
field becomes the sum of the approved claims for that month — still editable,
but no longer typed from memory.

Rules are **per department**, HR-editable (amounts, thresholds, new tiers, or a
different scheme entirely). Social Media is the first department; it is an
example of the shape, not the shape itself.

### Social Media's starting rules

| Page type | 1M+ views | 10M+ views |
|-----------|-----------|------------|
| Main page | ₹1,000    | ₹7,000     |
| Fan page  | ₹500      | ₹3,500     |

Fan page is half of main page **at these amounts today** — it is not a rule that
fan is always half. They are four independent, HR-editable numbers.

**Page type is chosen per reel, not per employee.** Some people only post to
main pages, some only to fan pages, and many do both — so it cannot be a fixed
property of the employee.

## The flow

1. Employee pastes the Instagram reel link and picks Main or Fan page.
2. The view count and the Instagram handle are fetched automatically.
3. If views clear a threshold, the claim is verified and tagged with that tier.
4. HR is notified (reuse `notify_approvers()` — already live), sees handle,
   views, tier and amount in one list, and can approve, reject or override.
5. On payslip creation for that employee and month, approved claims total up
   into the incentive field, with a breakdown of which reels made it up.

## Decisions — Adarsh, 2026-09-22, do not re-guess these

- **A reel pays its highest tier once.** 1M pays ₹1,000; if that same reel later
  crosses 10M, he is paid the ₹6,000 *difference*, not another ₹7,000. Total for
  that reel is ₹7,000.
- **Views are re-checked for 30 days** after submission — refreshed when HR opens
  the screen, plus a manual "Refresh views" button. A reel submitted at 800K that
  goes viral a week later still qualifies, without resubmitting.
- **The month is HR's call, defaulting to the approval month.** A reel submitted
  28 Sep and approved 3 Oct lands in October by default; HR can move it to
  September while that payroll is still open.

## Resolved — the API

**Apify.** Key given 2026-09-22 — not stored in this repo (never is, same rule
as VAPID/Resend); it goes into Supabase Dashboard → Edge Functions → Manage
secrets as `APIFY_API_KEY` when phase 2 (the fetch Edge Function) is built.

Worth knowing before wiring it:

- Apify charges per run. Re-checking every open claim daily for 30 days is the
  cost driver — batching the re-check to once a day per reel, and only while a
  claim is open, keeps it sane.
- Instagram's own Graph API is free and reliable but only reads accounts the
  company owns and has linked. Fan pages almost certainly are not linked, so a
  scraper is the realistic path for at least half the claims.
- **Scraping breaks.** Rate limits, layout changes, private accounts. HR's manual
  verify is therefore not a nicety — it is the fallback the feature needs to keep
  working on a bad day, exactly as Adarsh already asked for.

## Build order when it starts

1. Migration: `incentive_rules` (per department, retire-not-delete, same shape as
   `visit_purposes`/`tds_categories`) and `incentive_claims`.
2. HR's rules admin — the four numbers above, editable, per department.
3. Employee's submit form + their own list of claims and what each paid.
4. HR's review list: handle, views, tier badge, amount, approve/reject, refresh.
5. Edge Function that reads a reel's views and handle from the chosen API.
6. Payslip integration: approved claims for the month total into `incentive`.

Steps 1–4 and 6 work with HR typing the view count by hand. Step 5 is the only
one that needs the API key, which is why it is last and not first.
