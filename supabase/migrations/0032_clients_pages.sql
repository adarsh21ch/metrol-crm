-- Content & Marketing department system (2026-09-22 brief, see
-- CONTENT-MARKETING-DASHBOARD-PLAN.md for the full brief and the three
-- answers Adarsh gave before this was built: pages are many-to-many with
-- employees, reassigning a page stays HR-only, and a Page retires
-- independently of its Client).
--
-- Run once in the Supabase SQL editor, after 0031. Safe to re-run.
--
-- The shape: Clients are the brands Metrol Media runs social accounts for.
-- Pages are the Instagram pages under a Client (a client can have one main
-- page and several fan pages). Page assignments are the many-to-many join
-- of who currently manages which page. incentive_claims — which today
-- carries a free-typed page_type with no link to a real page — is retrofit
-- onto a real page_id: a claim then already knows its client and handle,
-- nothing to re-type.

-- ============================================ 1. clients

create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select using ( true );

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete on public.clients from anon, authenticated;

-- ============================================ 2. pages

-- page_type reuses the exact 'main'/'fan' values incentive_rules (0031)
-- already checks against — one vocabulary, not two.
create table if not exists public.pages (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  page_type         text not null check (page_type in ('main','fan')),
  instagram_handle  text,
  label             text,
  -- Independent of the client's own is_active (Adarsh, 2026-09-22): a client
  -- can drop one fan page and keep everything else it has.
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists pages_client_idx on public.pages (client_id);

alter table public.pages enable row level security;

drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages for select using ( true );

drop policy if exists pages_write on public.pages;
create policy pages_write on public.pages for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete on public.pages from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.pages'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 3. page_assignments

-- Many-to-many, current state only (Adarsh, 2026-09-22: "a lot of employees,
-- a lot of fan pages... a lot of clients" — a page can carry more than one
-- person, and one person can hold several pages). This is a live join, not a
-- history record, so unassigning is a plain delete — unlike everything else
-- in this app that is retire-not-delete, there is nothing here worth keeping
-- a dead row for: who manages a page today is the only fact this table
-- states, and incentive_claims already carries its own permanent snapshot of
-- department_id for anything that needs to survive a reassignment.
create table if not exists public.page_assignments (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (page_id, employee_id)
);

create index if not exists page_assignments_page_idx on public.page_assignments (page_id);
create index if not exists page_assignments_employee_idx on public.page_assignments (employee_id);

alter table public.page_assignments enable row level security;

drop policy if exists page_assignments_select on public.page_assignments;
create policy page_assignments_select on public.page_assignments for select using ( true );

-- Reassignment stays HR-only (Adarsh, 2026-09-22) — a department head's own
-- dashboard reads this table, never writes it.
drop policy if exists page_assignments_write on public.page_assignments;
create policy page_assignments_write on public.page_assignments for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.page_assignments'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 4. incentive_claims — replace page_type/instagram_handle with page_id

-- "Do not bolt Pages on beside the free-text field, replace it" (the plan's
-- own words). page_id is left NULLABLE rather than backfilled: there is no
-- reliable way to match an existing claim's free-typed page_type back to one
-- specific new Page row, and the plan is explicit that this is safe today
-- because only demo/test claims exist so far. Nothing computes a tier off a
-- claim with no page_id (see the rewritten trigger below) — HR sees "No page
-- on file" rather than a guessed one, same as every other place this app
-- shows an em dash instead of hiding a gap.
alter table public.incentive_claims add column if not exists page_id uuid references public.pages(id) on delete restrict;

-- Rewritten: page_type now comes from the linked Page, not a column on the
-- claim itself. A claim with no page_id computes no tier (best stays null),
-- same behaviour as a claim with 0 views today.
create or replace function public.set_incentive_tier()
returns trigger language plpgsql set search_path = public as $$
declare v_page_type text; best record;
begin
  if new.page_id is not null then
    select p.page_type into v_page_type from public.pages p where p.id = new.page_id;
  end if;

  if v_page_type is not null then
    select r.id, r.amount into best
      from public.incentive_rules r
     where r.department_id = new.department_id
       and r.page_type = v_page_type
       and r.is_active
       and r.min_views <= new.views
     order by r.min_views desc
     limit 1;
  end if;

  new.tier_rule_id := best.id;
  new.current_amount := coalesce(best.amount, 0);
  return new;
end;
$$;

drop trigger if exists incentive_claims_set_tier on public.incentive_claims;
create trigger incentive_claims_set_tier
  before insert or update of views, department_id, page_id on public.incentive_claims
  for each row execute function public.set_incentive_tier();

-- The two columns Pages replace. Read the client/handle/type off pages via
-- page_id from here on — see useIncentiveClaims.ts / usePages.ts.
alter table public.incentive_claims drop column if exists page_type;
alter table public.incentive_claims drop column if exists instagram_handle;

-- ============================================ 5. proof

select 'clients table' as check, (select count(*) from pg_class where relname = 'clients')::text as result
union all
select 'pages table', (select count(*) from pg_class where relname = 'pages')::text
union all
select 'page_assignments table', (select count(*) from pg_class where relname = 'page_assignments')::text
union all
select 'incentive_claims.page_id column', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'incentive_claims' and column_name = 'page_id'
union all
select 'incentive_claims.page_type GONE (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'incentive_claims' and column_name = 'page_type'
union all
select 'incentive_claims.instagram_handle GONE (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'incentive_claims' and column_name = 'instagram_handle';
