-- Department incentives — phase 1 of 2 (2026-09-22 brief, see
-- INCENTIVE-PLAN.md for the full brief and Adarsh's decisions). This is the
-- schema and the manual-entry path; the Instagram/Apify auto-fetch is
-- phase 2, once Adarsh has picked and paid for an API.
--
-- Run once in the Supabase SQL editor, after 0030. Safe to re-run.
--
-- The shape, in one paragraph: an employee posts a reel and picks which page
-- type it went on (main or fan — chosen per reel, not fixed per employee,
-- since many people post to both). HR — or later, an API — records the view
-- count. A trigger looks up the highest-view-threshold rule that clears for
-- that department + page type and sets the reel's current tier amount. HR
-- approves the difference between that tier amount and what has already been
-- paid out, which drops a row in a ledger tagged to a salary period. A
-- payslip prefills its incentive figure from that ledger, and HR can still
-- override the number by hand — this pre-fills it, it does not lock it.

-- ============================================ 0. Social Media is a new department

-- Not one of the eight seeded so far (0004, 0006) — Adarsh's brief named it
-- directly as a real team with its own people, so it is added here rather
-- than the incentive rules below silently seeding zero rows against a
-- department name nothing matches. Same insert shape 0004/0006 used; HR can
-- rename it from the Departments screen same as any other.
insert into public.departments (name, sort_order) values
  ('Social Media', 9)
on conflict (name) do nothing;

-- ============================================ 1. incentive_rules — HR's own tiers, per department

-- Same retire-not-delete shape as tds_categories (0029) and visit_purposes
-- (0027): an old claim must keep reading the rule it was paid under even
-- after HR changes the going rate. Social Media's four rows (main/fan ×
-- 1M/10M) are seeded below; any other department gets its own rows in the
-- same table when that day comes — this is not hard-coded to Social Media,
-- only seeded for it.
create table if not exists public.incentive_rules (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  page_type     text not null check (page_type in ('main','fan')),
  label         text not null,
  min_views     bigint not null check (min_views >= 0),
  amount        numeric(12,2) not null check (amount >= 0),
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (department_id, page_type, min_views)
);

alter table public.incentive_rules enable row level security;

drop policy if exists incentive_rules_select on public.incentive_rules;
create policy incentive_rules_select on public.incentive_rules for select using ( true );

drop policy if exists incentive_rules_write on public.incentive_rules;
create policy incentive_rules_write on public.incentive_rules for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

insert into public.incentive_rules (department_id, page_type, label, min_views, amount, sort_order)
select d.id, v.page_type, v.label, v.min_views, v.amount, v.sort_order
  from public.departments d
  cross join (values
    ('main', '1M+ views',  1000000::bigint,  1000::numeric, 1),
    ('main', '10M+ views', 10000000::bigint, 7000::numeric, 2),
    ('fan',  '1M+ views',  1000000::bigint,   500::numeric, 3),
    ('fan',  '10M+ views', 10000000::bigint, 3500::numeric, 4)
  ) as v(page_type, label, min_views, amount, sort_order)
 where d.name = 'Social Media'
   and not exists (select 1 from public.incentive_rules where department_id = d.id);

-- ============================================ 2. incentive_claims — one row per reel

create table if not exists public.incentive_claims (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  -- Snapshotted at submission, not read live off employees.department_id —
  -- a claim must keep matching the rules it was actually submitted under
  -- even if HR moves the person to a different department later.
  department_id     uuid not null references public.departments(id) on delete restrict,
  page_type         text not null check (page_type in ('main','fan')),
  reel_url          text not null,
  instagram_handle  text,
  views             bigint not null default 0,
  views_checked_at  timestamptz,
  -- 30 days from submission (Adarsh, 2026-09-22): re-checking stops after
  -- this so a dead reel does not sit in a watch list forever.
  watch_until       date not null,
  tier_rule_id      uuid references public.incentive_rules(id) on delete set null,
  -- The full amount the reel's CURRENT tier is worth — not incremental.
  -- Set only by the trigger below, never by the app directly.
  current_amount    numeric(12,2) not null default 0,
  -- Rejecting is terminal for the claim (HR: this reel does not qualify,
  -- full stop) — separate from how much of current_amount has been paid,
  -- which lives in incentive_payouts so a claim that is topped up after an
  -- earlier partial approval has an honest paper trail, not an overwrite.
  rejected          boolean not null default false,
  decided_by        uuid references public.profiles(id) on delete set null,
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists incentive_claims_employee_idx on public.incentive_claims (employee_id);
create index if not exists incentive_claims_watch_idx on public.incentive_claims (watch_until);

-- Picks the highest-min_views active rule that the current view count
-- clears, for this claim's own department + page type. Runs on insert and
-- whenever views (or a HR override of department/page_type) changes — an
-- employee cannot set tier_rule_id or current_amount themselves, only views
-- and the reel's own facts, so this is the only path either column takes.
create or replace function public.set_incentive_tier()
returns trigger language plpgsql set search_path = public as $$
declare best record;
begin
  select r.id, r.amount into best
    from public.incentive_rules r
   where r.department_id = new.department_id
     and r.page_type = new.page_type
     and r.is_active
     and r.min_views <= new.views
   order by r.min_views desc
   limit 1;
  new.tier_rule_id := best.id;
  new.current_amount := coalesce(best.amount, 0);
  return new;
end;
$$;

drop trigger if exists incentive_claims_set_tier on public.incentive_claims;
create trigger incentive_claims_set_tier
  before insert or update of views, department_id, page_type on public.incentive_claims
  for each row execute function public.set_incentive_tier();

drop trigger if exists incentive_claims_touch on public.incentive_claims;
create trigger incentive_claims_touch
  before update on public.incentive_claims
  for each row execute function public.touch_updated_at();

alter table public.incentive_claims enable row level security;

drop policy if exists incentive_claims_select on public.incentive_claims;
create policy incentive_claims_select on public.incentive_claims for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- An employee can only ever submit a fresh, undecided claim for themselves —
-- never one that starts pre-approved or pre-rejected.
drop policy if exists incentive_claims_insert on public.incentive_claims;
create policy incentive_claims_insert on public.incentive_claims for insert
  with check (
    public.is_owner() or public.is_hr()
    or (
      employee_id = public.my_employee_id()
      and rejected = false and decided_by is null and decided_at is null
    )
  );

-- Views/tier updates (today: HR typing a number in; later: the Edge
-- Function) and reject/decide are both HR/owner only — an employee has no
-- update path onto their own claim at all, same as leave_requests once
-- submitted.
drop policy if exists incentive_claims_update on public.incentive_claims;
create policy incentive_claims_update on public.incentive_claims for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete on public.incentive_claims from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.incentive_claims'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 3. incentive_payouts — the paid ledger

-- Why a ledger and not just a "paid_amount" column on the claim: the same
-- reel can be approved twice (1M today, the 10M top-up next month), and
-- each approval belongs to a different salary period. A single column can
-- only ever hold one period; a row per approval event can hold as many as
-- actually happened, which is also the audit trail of who approved what and
-- when — the same reasoning salary_records already applies to a corrected
-- payslip (never overwritten, always re-stated).
create table if not exists public.incentive_payouts (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.incentive_claims(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  -- 'YYYY-MM' — which salary period's payslip this belongs to. HR's own
  -- call, defaulting to the approval month (Adarsh, 2026-09-22); free text
  -- rather than a date so it matches salary_records.period's own shape.
  period       text not null,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz not null default now()
);

create index if not exists incentive_payouts_claim_idx on public.incentive_payouts (claim_id);
create index if not exists incentive_payouts_period_idx on public.incentive_payouts (period);

alter table public.incentive_payouts enable row level security;

drop policy if exists incentive_payouts_select on public.incentive_payouts;
create policy incentive_payouts_select on public.incentive_payouts for select
  using (
    public.is_owner() or public.is_hr()
    or exists (select 1 from public.incentive_claims c
                where c.id = claim_id and c.employee_id = public.my_employee_id())
  );

drop policy if exists incentive_payouts_write on public.incentive_payouts;
create policy incentive_payouts_write on public.incentive_payouts for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete on public.incentive_payouts from anon, authenticated;

-- ============================================ 4. one more notification type

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('broadcast','birthday','shift_reminder','visit_request','wfh_request','incentive_claim'));

-- notify_approvers (0028) already accepts any p_type its caller passes as
-- long as it is in the CHECK list above — no function change needed, only
-- widening what the constraint allows.

-- ============================================ 5. proof

select 'Social Media department exists' as check, count(*)::text as result
  from public.departments where name = 'Social Media'
union all
select 'incentive_rules seeded (Social Media)', count(*)::text as result
  from public.incentive_rules r join public.departments d on d.id = r.department_id
 where d.name = 'Social Media'
union all
select 'incentive_claims table', (select count(*) from pg_class where relname = 'incentive_claims')::text
union all
select 'incentive_payouts table', (select count(*) from pg_class where relname = 'incentive_payouts')::text
union all
select 'set_incentive_tier() exists', count(*)::text from pg_proc where proname = 'set_incentive_tier'
union all
select 'notifications accepts incentive_claim',
       (pg_get_constraintdef(oid) like '%incentive_claim%')::text
  from pg_constraint where conname = 'notifications_type_check';
