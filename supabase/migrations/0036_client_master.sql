-- Agency OS, Phase 1, step 2 (AGENCY-OS-PLAN.md §3.1 and §3.3): the client
-- master, and the client team with its assignment chain.
--
-- Run once in the Supabase SQL editor, after 0035. Safe to re-run.
--
-- What this replaces: the TEAM block and the page columns of the "Client
-- Master Sheet" — a Client ID, contacts, dates, a status, links (the
-- Podcast sheet, Drive folders), and per page an Instagram page AND a
-- YouTube channel, coloured red or orange by hand.
--
-- The one live behaviour change: Clients, Pages, page assignments and page
-- reels move from the old name-matching rules (is_hr(), leads_content_
-- marketing()) onto the capabilities from 0035 — ONLY if the old and new
-- rules give every login exactly the same access. If they differ for anyone,
-- those four tables stay on the old rules and the proof at the bottom names
-- who differs. Everything else in this file is new tables nobody uses yet.

-- ============================================ 0. small helpers

-- Storage paths and pasted text are not always a uuid; a policy that casts
-- one and errors would refuse the whole request instead of one row.
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.page_client(p_page uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select client_id from public.pages where id = p_page $$;

-- ============================================ 1. client statuses — an editable list

-- tone is one of the app's own chip colours rather than a raw hex value, so
-- a status reads the same in light and dark mode.
create table if not exists public.client_statuses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  tone       text not null default 'mute' check (tone in ('good','warn','bad','accent','mute')),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.client_statuses (name, tone, sort_order)
select v.name, v.tone, v.sort_order
  from (values ('Onboarding', 'accent', 1), ('Active', 'good', 2), ('On hold', 'warn', 3), ('Ended', 'mute', 4))
       as v(name, tone, sort_order)
 where not exists (select 1 from public.client_statuses);

-- ============================================ 2. the client master columns

create sequence if not exists public.client_code_seq;

alter table public.clients add column if not exists code          text;
alter table public.clients add column if not exists company       text;
alter table public.clients add column if not exists industry      text;
alter table public.clients add column if not exists contact_name  text;
alter table public.clients add column if not exists contact_phone text;
alter table public.clients add column if not exists contact_email text;
alter table public.clients add column if not exists started_on    date;
alter table public.clients add column if not exists ends_on       date;
alter table public.clients add column if not exists status_id     uuid references public.client_statuses(id) on delete set null;
-- Which department serves the client. It is what "holds assign_team for the
-- client's department" (§3.3) is measured against. Every client today is
-- Content & Marketing's.
alter table public.clients add column if not exists department_id uuid references public.departments(id) on delete set null;

create unique index if not exists clients_code_unique on public.clients (code);

-- MM-0001, MM-0002… from a sequence, in the order clients were added, never
-- typed and never reused.
create or replace function public.set_client_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then
      new.code := 'MM-' || lpad(nextval('public.client_code_seq')::text, 4, '0');
    end if;
  elsif new.code is distinct from old.code and auth.uid() is not null then
    raise exception 'A Client ID never changes.';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_set_code on public.clients;
create trigger clients_set_code
  before insert or update on public.clients
  for each row execute function public.set_client_code();

do $$
declare r record; d_cm uuid := (select id from public.departments where name = 'Content and Marketing');
begin
  for r in select id from public.clients where code is null order by created_at, id loop
    update public.clients set code = 'MM-' || lpad(nextval('public.client_code_seq')::text, 4, '0') where id = r.id;
  end loop;

  if d_cm is not null then
    update public.clients set department_id = d_cm where department_id is null;
    -- A literal id, not a name looked up at insert time: renaming the
    -- department later cannot change which department new clients land in.
    execute format('alter table public.clients alter column department_id set default %L::uuid', d_cm);
  end if;

  update public.clients c
     set status_id = (select id from public.client_statuses where name = case when c.is_active then 'Active' else 'Ended' end)
   where c.status_id is null;
end $$;

-- ============================================ 3. client money — its own table, on purpose

-- RLS works per row, not per column. If the monthly value sat on clients,
-- every SMM and editor who can read a client would read what it pays.
create table if not exists public.client_financials (
  client_id      uuid primary key references public.clients(id) on delete cascade,
  monthly_value  numeric(12,2) check (monthly_value is null or monthly_value >= 0),
  payment_status text,
  notes          text,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create or replace function public.touch_client_financials()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists client_financials_touch on public.client_financials;
create trigger client_financials_touch
  before insert or update on public.client_financials
  for each row execute function public.touch_client_financials();

-- ============================================ 4. links, under any label

create table if not exists public.client_links (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  label      text not null,
  url        text not null,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_links_client_idx on public.client_links (client_id);

-- ============================================ 5. page statuses — the sheet's red and orange rows

-- What red and orange MEAN is Q6, unanswered. Seeded by colour so nothing is
-- guessed; renaming one to what it really means is one edit on the Roles &
-- access screen. A page with no status is an ordinary row.
create table if not exists public.page_statuses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  tone       text not null default 'mute' check (tone in ('good','warn','bad','accent','mute')),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.page_statuses (name, tone, sort_order)
select v.name, v.tone, v.sort_order
  from (values ('Red flag', 'bad', 1), ('Orange flag', 'warn', 2)) as v(name, tone, sort_order)
 where not exists (select 1 from public.page_statuses);

alter table public.pages add column if not exists status_id uuid references public.page_statuses(id) on delete set null;

-- ============================================ 6. page channels — one page, several platforms

-- The Client Master puts an Instagram page AND a YouTube channel on one
-- numbered fan page, so a page carries channels. The platform list stays in
-- code (instagram / youtube / facebook): adding one needs link parsing and a
-- lookup written anyway.
create table if not exists public.page_channels (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  platform   text not null check (platform in ('instagram','youtube','facebook')),
  handle     text not null default '',
  url        text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists page_channels_one_live_per_platform
  on public.page_channels (page_id, platform) where is_active;
create index if not exists page_channels_page_idx on public.page_channels (page_id);

-- "@handle" out of whatever was typed or pasted — a profile link, @handle,
-- or a bare username. The same shape fetch-instagram-profile returns.
create or replace function public.ig_handle(p text)
returns text language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~* 'instagram\.com/' then '@' || substring(p from '(?i)instagram\.com/([A-Za-z0-9_.]+)')
    else '@' || ltrim(btrim(p), '@')
  end
$$;

-- Backfilled from pages.instagram_handle before the sync triggers exist, so
-- the backfill cannot bounce back and rewrite what it copied.
insert into public.page_channels (page_id, platform, handle, url)
select pg.id, 'instagram', public.ig_handle(pg.instagram_handle),
       'https://www.instagram.com/' || ltrim(public.ig_handle(pg.instagram_handle), '@') || '/'
  from public.pages pg
 where public.ig_handle(pg.instagram_handle) is not null
   and not exists (select 1 from public.page_channels pc where pc.page_id = pg.id and pc.platform = 'instagram');

-- ONE source of truth is page_channels. pages.instagram_handle stays, as a
-- copy kept in step by these two triggers, because two things still read it:
-- the fetch-page-reels and fetch-instagram-profile Edge Functions (live
-- today, pasted by hand), and any browser still running yesterday's app.
-- Dropping the column waits until both are gone — see CLAUDE.md.
--
-- channel → page: whichever Instagram channel is live is the page's handle.
create or replace function public.sync_page_instagram_handle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_page uuid := coalesce(new.page_id, old.page_id); v_handle text;
begin
  select handle into v_handle from public.page_channels
   where page_id = v_page and platform = 'instagram' and is_active
   order by created_at limit 1;
  update public.pages set instagram_handle = nullif(v_handle, '')
   where id = v_page and instagram_handle is distinct from nullif(v_handle, '');
  if tg_op = 'UPDATE' and old.page_id is distinct from new.page_id then
    select handle into v_handle from public.page_channels
     where page_id = old.page_id and platform = 'instagram' and is_active
     order by created_at limit 1;
    update public.pages set instagram_handle = nullif(v_handle, '')
     where id = old.page_id and instagram_handle is distinct from nullif(v_handle, '');
  end if;
  return null;
end;
$$;

drop trigger if exists page_channels_sync_handle on public.page_channels;
create trigger page_channels_sync_handle
  after insert or update or delete on public.page_channels
  for each row execute function public.sync_page_instagram_handle();

-- page → channel: an old browser (or anything else) writing the column
-- directly is carried over into page_channels. pg_trigger_depth() = 1 means
-- "written directly", not by the trigger above — that is what stops the two
-- triggers bouncing a change back and forth.
create or replace function public.carry_page_instagram_handle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_handle text := public.ig_handle(new.instagram_handle);
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE' and new.instagram_handle is not distinct from old.instagram_handle then return null; end if;

  if v_handle is null then
    update public.page_channels set is_active = false
     where page_id = new.id and platform = 'instagram' and is_active;
  elsif exists (select 1 from public.page_channels where page_id = new.id and platform = 'instagram' and is_active) then
    update public.page_channels
       set handle = v_handle, url = 'https://www.instagram.com/' || ltrim(v_handle, '@') || '/'
     where page_id = new.id and platform = 'instagram' and is_active and handle is distinct from v_handle;
  else
    insert into public.page_channels (page_id, platform, handle, url)
    values (new.id, 'instagram', v_handle, 'https://www.instagram.com/' || ltrim(v_handle, '@') || '/');
  end if;
  return null;
end;
$$;

drop trigger if exists pages_carry_instagram_handle on public.pages;
create trigger pages_carry_instagram_handle
  after insert or update of instagram_handle on public.pages
  for each row execute function public.carry_page_instagram_handle();

-- ============================================ 7. the client team — with history

-- Unlike page_assignments, nothing here is deleted: a row gets ended_at.
-- That is what answers "who was on this client in May", for targets and for
-- who made what.
create table if not exists public.client_assignments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid references public.profiles(id) on delete set null
);

create unique index if not exists client_assignments_live_unique
  on public.client_assignments (client_id, employee_id, role_id) where ended_at is null;
create index if not exists client_assignments_client_idx on public.client_assignments (client_id);
create index if not exists client_assignments_employee_idx on public.client_assignments (employee_id) where ended_at is null;

create or replace function public.guard_client_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.roles r where r.id = new.role_id and r.client_scoped and r.is_active) then
      raise exception 'Only a per-client role (SMM, Editor…) can be given on a client.';
    end if;
    new.assigned_by := coalesce(auth.uid(), new.assigned_by);
    new.ended_at := null;
    new.ended_by := null;
    return new;
  end if;
  -- An assignment is history: the only thing that ever changes is that it ends.
  if new.client_id is distinct from old.client_id or new.employee_id is distinct from old.employee_id
     or new.role_id is distinct from old.role_id or new.assigned_at is distinct from old.assigned_at
     or new.assigned_by is distinct from old.assigned_by then
    raise exception 'An assignment cannot be edited — end it and add a new one.';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'That assignment has already ended.';
  end if;
  if new.ended_at is not null and old.ended_at is null then
    new.ended_by := coalesce(auth.uid(), new.ended_by);
  end if;
  return new;
end;
$$;

drop trigger if exists client_assignments_guard on public.client_assignments;
create trigger client_assignments_guard
  before insert or update on public.client_assignments
  for each row execute function public.guard_client_assignment();

-- A role cannot turn company-wide while people hold it on clients, or
-- per-client while people hold it company-wide (0035's half of this).
create or replace function public.guard_role_shape()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.client_scoped and not old.client_scoped
     and exists (select 1 from public.employee_roles where role_id = new.id) then
    raise exception 'People hold this role company-wide. Take it off them first, then make it a per-client role.';
  end if;
  if old.client_scoped and not new.client_scoped
     and exists (select 1 from public.client_assignments where role_id = new.id and ended_at is null) then
    raise exception 'People hold this role on clients. End those assignments first, then make it company-wide.';
  end if;
  return new;
end;
$$;

-- ============================================ 8. who is on a client, and what they may do there

create or replace function public.is_on_client_as(p_profile uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.client_assignments ca
      join public.employees e on e.id = ca.employee_id
     where ca.client_id = p_client and ca.ended_at is null
       and e.profile_id = p_profile and e.status <> 'resigned'
  )
$$;

-- A capability on one client: held company-wide, held for the client's
-- department (a department head), or held through a per-client role on THIS
-- client (an SMM on this client, not every client).
create or replace function public.has_capability_for_client_as(p_profile uuid, p_client uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_capability_in_department_as(
           p_profile, (select department_id from public.clients where id = p_client), p_cap)
      or exists (
        select 1 from public.client_assignments ca
          join public.employees e on e.id = ca.employee_id
          join public.roles r on r.id = ca.role_id
          join public.role_capabilities rc on rc.role_id = ca.role_id
         where ca.client_id = p_client and ca.ended_at is null
           and e.profile_id = p_profile and e.status <> 'resigned'
           and r.is_active and rc.capability = p_cap
      )
$$;

-- The caller holds this role for this client: on the client itself (a
-- per-client role), or company-wide / for the client's department.
create or replace function public.holds_role_for_client(p_client uuid, p_role uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from public.client_assignments ca
        join public.employees e on e.id = ca.employee_id
       where ca.client_id = p_client and ca.role_id = p_role and ca.ended_at is null
         and e.profile_id = auth.uid() and e.status <> 'resigned'
    )
    or exists (
      select 1 from public.role_holdings_for(auth.uid()) h
       where h.role_id = p_role
         and (h.scope_department is null
              or h.scope_department = (select department_id from public.clients where id = p_client))
    )
$$;

create or replace function public.is_on_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_on_client_as(auth.uid(), p_client) $$;

create or replace function public.has_capability_for_client(p_client uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_capability_for_client_as(auth.uid(), p_client, p_cap) $$;

-- Who may put somebody in a role on a client (§3.3): anybody holding
-- assign_team for the client (the department head, management, HR today),
-- OR anybody holding — on this client — the role that assigns that role. So
-- an SMM can add editors to their own clients and nobody else's, and
-- changing the chain is editing a role, not the code.
create or replace function public.can_assign_on_client(p_client uuid, p_role uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_capability_for_client(p_client, 'assign_team')
      or exists (
        select 1 from public.roles r
         where r.id = p_role and r.client_scoped and r.is_active
           and r.assigned_by_role_id is not null
           and public.holds_role_for_client(p_client, r.assigned_by_role_id)
      )
$$;

-- Everything a client's own screens show beyond its name: the team, the
-- department head and management, and whoever holds one of its pages.
create or replace function public.can_see_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_capability_for_client(p_client, 'view_all_clients')
      or public.is_on_client(p_client)
      or exists (
        select 1 from public.page_assignments pa
          join public.pages pg on pg.id = pa.page_id
         where pg.client_id = p_client and pa.employee_id = public.my_employee_id()
      )
$$;

-- Names, for the two places a person needs a colleague's name and employees'
-- own RLS (0006: everybody but HR, the owner and a team lead reads exactly
-- one record — their own) would hand back nothing:
--
--   * a client's Team — an SMM has to see who the client's editors are.
--   * the "add someone" picker — the Content & Marketing head assigns editors,
--     who sit in Video Editors, a department a team lead cannot read.
--
-- Both give out a name, a designation and a department — never the phone,
-- address or anything else on the employee record — and only to somebody
-- who can see that client (the view) or assign on it (the function). The
-- view runs with its owner's rights on purpose; the WHERE is the lock.
create or replace view public.v_client_team as
select ca.id, ca.client_id, ca.employee_id, ca.role_id, ca.assigned_at, ca.ended_at,
       e.full_name, e.designation, e.department_id, e.profile_id
  from public.client_assignments ca
  join public.employees e on e.id = ca.employee_id
 where public.can_see_client(ca.client_id);

revoke all on public.v_client_team from anon;
grant select on public.v_client_team to authenticated;

create or replace function public.assignable_staff(p_client uuid)
returns table (id uuid, full_name text, designation text, department_id uuid)
language sql stable security definer set search_path = public
as $$
  select e.id, e.full_name, e.designation, e.department_id
    from public.employees e
   where e.status <> 'resigned'
     and exists (select 1 from public.roles r
                  where r.client_scoped and r.is_active and public.can_assign_on_client(p_client, r.id))
   order by e.full_name
$$;

revoke all on function public.assignable_staff(uuid) from public, anon;
grant execute on function public.assignable_staff(uuid) to authenticated;

revoke all on function public.is_on_client_as(uuid, uuid)                    from public, anon, authenticated;
revoke all on function public.has_capability_for_client_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.is_on_client(uuid)                    to authenticated;
grant execute on function public.has_capability_for_client(uuid, text) to authenticated;
grant execute on function public.can_assign_on_client(uuid, uuid)      to authenticated;
grant execute on function public.can_see_client(uuid)                  to authenticated;

-- ============================================ 9. the two lists that must not drift apart

-- page_assignments still decides who may claim a page's reels (0032). Being
-- given a page puts you on the client's team, in the page-holder role (SMM),
-- if you are not on it already — in the database, so it holds for every way
-- a page gets assigned.
create or replace function public.page_assignment_joins_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_client uuid := public.page_client(new.page_id);
        v_role   uuid := (select id from public.roles where page_holder and client_scoped and is_active limit 1);
begin
  if v_client is null or v_role is null then return null; end if;
  if not exists (select 1 from public.client_assignments
                  where client_id = v_client and employee_id = new.employee_id and ended_at is null) then
    insert into public.client_assignments (client_id, employee_id, role_id, assigned_by)
    values (v_client, new.employee_id, v_role, auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists page_assignments_join_team on public.page_assignments;
create trigger page_assignments_join_team
  after insert on public.page_assignments
  for each row execute function public.page_assignment_joins_team();

-- And leaving a client's team — the last live assignment on it ending — hands
-- back that client's pages, so nobody keeps claiming reels on a client they
-- are no longer on.
create or replace function public.client_assignment_ended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ended_at is not null and old.ended_at is null
     and not exists (select 1 from public.client_assignments
                      where client_id = new.client_id and employee_id = new.employee_id and ended_at is null) then
    delete from public.page_assignments pa
     using public.pages pg
     where pg.id = pa.page_id and pg.client_id = new.client_id and pa.employee_id = new.employee_id;
  end if;
  return null;
end;
$$;

drop trigger if exists client_assignments_ended on public.client_assignments;
create trigger client_assignments_ended
  after update of ended_at on public.client_assignments
  for each row execute function public.client_assignment_ended();

-- Seeding: everybody holding a page today becomes SMM (the page-holder role)
-- on that page's client, dated from their earliest page there.
insert into public.client_assignments (client_id, employee_id, role_id, assigned_at)
select pg.client_id, pa.employee_id, r.id, min(pa.assigned_at)
  from public.page_assignments pa
  join public.pages pg on pg.id = pa.page_id
  cross join (select id from public.roles where page_holder and client_scoped and is_active limit 1) r
 where not exists (select 1 from public.client_assignments ca
                    where ca.client_id = pg.client_id and ca.employee_id = pa.employee_id and ca.ended_at is null)
 group by pg.client_id, pa.employee_id, r.id;

-- ============================================ 10. row-level security, new tables

alter table public.client_statuses    enable row level security;
alter table public.client_financials  enable row level security;
alter table public.client_links       enable row level security;
alter table public.page_statuses      enable row level security;
alter table public.page_channels      enable row level security;
alter table public.client_assignments enable row level security;

-- The two colour lists: everybody reads them, whoever edits settings edits them.
drop policy if exists client_statuses_select on public.client_statuses;
create policy client_statuses_select on public.client_statuses for select using ( auth.uid() is not null );
drop policy if exists client_statuses_write on public.client_statuses;
create policy client_statuses_write on public.client_statuses for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );
revoke delete on public.client_statuses from anon, authenticated;

drop policy if exists page_statuses_select on public.page_statuses;
create policy page_statuses_select on public.page_statuses for select using ( auth.uid() is not null );
drop policy if exists page_statuses_write on public.page_statuses;
create policy page_statuses_write on public.page_statuses for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );
revoke delete on public.page_statuses from anon, authenticated;

-- Money: only the people Q10 names — by default, Management, Super Admin and
-- the owner. Everybody else gets no row back at all.
drop policy if exists client_financials_select on public.client_financials;
create policy client_financials_select on public.client_financials for select
  using ( public.has_capability_for_client(client_id, 'see_client_money') );
drop policy if exists client_financials_write on public.client_financials;
create policy client_financials_write on public.client_financials for insert
  with check ( public.has_capability_for_client(client_id, 'see_client_money') );
drop policy if exists client_financials_update on public.client_financials;
create policy client_financials_update on public.client_financials for update
  using      ( public.has_capability_for_client(client_id, 'see_client_money') )
  with check ( public.has_capability_for_client(client_id, 'see_client_money') );
revoke delete on public.client_financials from anon, authenticated;

drop policy if exists client_links_select on public.client_links;
create policy client_links_select on public.client_links for select
  using ( public.can_see_client(client_id) );
drop policy if exists client_links_write on public.client_links;
create policy client_links_write on public.client_links for all
  using      ( public.has_capability_for_client(client_id, 'manage_clients') )
  with check ( public.has_capability_for_client(client_id, 'manage_clients') );

-- A channel is a public Instagram/YouTube handle — readable like pages are.
-- Retire, never delete: its weekly views hang off it (0037).
drop policy if exists page_channels_select on public.page_channels;
create policy page_channels_select on public.page_channels for select using ( true );
drop policy if exists page_channels_write on public.page_channels;
create policy page_channels_write on public.page_channels for all
  using      ( public.has_capability_for_client(public.page_client(page_id), 'manage_clients') )
  with check ( public.has_capability_for_client(public.page_client(page_id), 'manage_clients') );
revoke delete on public.page_channels from anon, authenticated;

-- Who is on which client is visible to everybody signed in, like who holds
-- which page (page_assignments_select, 0032). Adding and ending follow the
-- chain; deleting is not a thing — history is the point.
drop policy if exists client_assignments_select on public.client_assignments;
create policy client_assignments_select on public.client_assignments for select using ( auth.uid() is not null );
drop policy if exists client_assignments_insert on public.client_assignments;
create policy client_assignments_insert on public.client_assignments for insert
  with check ( public.can_assign_on_client(client_id, role_id) );
drop policy if exists client_assignments_update on public.client_assignments;
create policy client_assignments_update on public.client_assignments for update
  using      ( public.can_assign_on_client(client_id, role_id) )
  with check ( public.can_assign_on_client(client_id, role_id) );
revoke delete on public.client_assignments from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.client_assignments'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.page_channels';      exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 11. Clients & Pages onto capabilities — only if nothing changes

-- For every login, the old rule and the new rule must agree, for writing
-- clients/pages (manage_clients) AND for assigning pages (assign_team). Every
-- client is Content & Marketing's (section 2), so the department head's
-- scoped capability is measured against that department. If anybody
-- differs, nothing is swapped and the proof below names them.
do $$
declare
  d_cm uuid := (select id from public.departments where name = 'Content and Marketing');
  v_bad text;
begin
  select string_agg(coalesce(nullif(p.name, ''), p.email, p.id::text), ', ') into v_bad
    from public.profiles p
   where (p.role = 'owner'
          or exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources')
          or (p.is_team_lead and exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Content and Marketing')))
         is distinct from public.has_capability_in_department_as(p.id, d_cm, 'manage_clients')
      or (p.role = 'owner'
          or exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources')
          or (p.is_team_lead and exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Content and Marketing')))
         is distinct from public.has_capability_in_department_as(p.id, d_cm, 'assign_team');

  if d_cm is null then
    v_bad := coalesce(v_bad || '; ', '') || 'no department is named Content and Marketing';
  elsif exists (select 1 from public.clients where department_id is distinct from d_cm) then
    v_bad := coalesce(v_bad || '; ', '') || 'some clients are not in Content and Marketing';
  end if;

  if v_bad is not null then
    raise notice 'Clients & Pages stay on the old rules — old and new access differ for: %', v_bad;
    return;
  end if;

  execute 'drop policy if exists clients_write on public.clients';
  execute 'drop policy if exists clients_insert on public.clients';
  execute 'drop policy if exists clients_update on public.clients';
  execute $p$create policy clients_insert on public.clients for insert
    with check ( public.has_capability_in_department(department_id, 'manage_clients') )$p$;
  execute $p$create policy clients_update on public.clients for update
    using      ( public.has_capability_for_client(id, 'manage_clients') )
    with check ( public.has_capability_in_department(department_id, 'manage_clients') )$p$;

  execute 'drop policy if exists pages_write on public.pages';
  execute $p$create policy pages_write on public.pages for all
    using      ( public.has_capability_for_client(client_id, 'manage_clients') )
    with check ( public.has_capability_for_client(client_id, 'manage_clients') )$p$;

  execute 'drop policy if exists page_assignments_write on public.page_assignments';
  execute $p$create policy page_assignments_write on public.page_assignments for all
    using      ( public.has_capability_for_client(public.page_client(page_id), 'assign_team') )
    with check ( public.has_capability_for_client(public.page_client(page_id), 'assign_team') )$p$;

  execute 'drop policy if exists page_reels_write on public.page_reels';
  execute $p$create policy page_reels_write on public.page_reels for all
    using      ( public.has_capability_for_client(public.page_client(page_id), 'manage_clients') )
    with check ( public.has_capability_for_client(public.page_client(page_id), 'manage_clients') )$p$;
end $$;

-- ============================================ 12. proof

select 'client codes filled (must equal the number of clients)' as check,
       (select count(*) from public.clients where code is not null)::text || ' of ' || (select count(*) from public.clients)::text as result
union all
select 'clients with a department (must equal the number of clients)',
       (select count(*) from public.clients where department_id is not null)::text || ' of ' || (select count(*) from public.clients)::text
union all
select 'Instagram handles copied into page channels',
       (select count(*) from public.page_channels where platform = 'instagram')::text || ' channels for '
       || (select count(*) from public.pages where coalesce(btrim(instagram_handle), '') <> '')::text || ' pages with a handle'
union all
select 'page holders now on their client''s team',
       (select count(distinct (pg.client_id, pa.employee_id)) from public.page_assignments pa join public.pages pg on pg.id = pa.page_id)::text
       || ' page holders, ' || (select count(*) from public.client_assignments where ended_at is null)::text || ' team rows'
union all
select 'client statuses / page statuses', (select count(*) from public.client_statuses)::text || ' / ' || (select count(*) from public.page_statuses)::text
union all
select 'Clients & Pages use the new rules',
       case when exists (select 1 from pg_policy where polname = 'pages_write' and polrelid = 'public.pages'::regclass
                            and pg_get_expr(polqual, polrelid) like '%has_capability_for_client%')
            then 'yes' else 'NO — still on the old rules (see the notice, or ask Claude)' end
union all
select 'money table locked (policies)', (select count(*) from pg_policies where tablename = 'client_financials')::text;
