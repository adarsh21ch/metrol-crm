-- Agency OS, Phase 1, step 1 (AGENCY-OS-PLAN.md §4): roles and capabilities.
--
-- Run once in the Supabase SQL editor, after 0034. Safe to re-run.
--
-- What exists before this file: is_owner(), is_hr() — which matches the
-- department NAMED 'Human Resources' — and leads_content_marketing(), which
-- matches the team lead of the department NAMED 'Content and Marketing'.
-- Renaming a department silently changes who counts as HR. That is the
-- hard-coding Adarsh wants gone.
--
-- What this file adds, in one paragraph: a ROLE is a row (SMM, Editor, HR,
-- Department Head…). A CAPABILITY is one of a short fixed list the app knows
-- the meaning of (manage_clients, enter_views…). WHICH role holds WHICH
-- capability is data — the owner edits it on the Roles & access screen. Who
-- holds a role is also data, three ways:
--   * 'assigned'    — given to a person by hand (employee_roles), or for a
--                     per-client role, per client (client_assignments, 0036)
--   * 'department'  — everyone in the role's department holds it. HR is a
--                     department, not a role (0006) — this keeps that true,
--                     keyed by the department's id instead of its name.
--   * 'team_leads'  — the team leads of the role's department hold it,
--                     scoped to their own department. This is what the
--                     existing "team lead" switch in HR's employee form
--                     already means, so there is still ONE switch, not two.
--
-- NOTHING CHANGES FOR ANYONE IN THIS FILE. The seed reproduces today's access
-- exactly, and the proof at the bottom compares the old rules with the new
-- ones for every login. No existing policy is touched here; 0036 moves the
-- Clients & Pages tables over, and only if that comparison is clean.

-- ============================================ 1. roles

create table if not exists public.roles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  -- Which department the role belongs to. For held_by = 'department' it is
  -- the membership rule; for 'team_leads' it narrows which leads hold it;
  -- for anything else it is only a label that groups the role on screen.
  department_id       uuid references public.departments(id) on delete set null,
  -- Held per client (SMM, Editor) rather than company-wide (HR, Management).
  -- A per-client role is held through client_assignments, never here.
  client_scoped       boolean not null default false,
  held_by             text not null default 'assigned'
                        check (held_by in ('assigned','department','team_leads')),
  -- Who may put somebody in this role on a client (§3.3). Seeded as
  -- Department Head → SMM → Editor. Changing the chain is editing a row.
  assigned_by_role_id uuid references public.roles(id) on delete set null,
  -- The one role somebody gets on a client when they are given one of its
  -- pages (0036). Seeded on SMM; a flag rather than a name the code matches.
  page_holder         boolean not null default false,
  sort_order          int not null default 0,
  -- Retire, never delete: an old client assignment must keep naming the role
  -- it was made under.
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  constraint roles_shape check (
    (not client_scoped or held_by = 'assigned')
    and (held_by <> 'department' or department_id is not null)
    and (not page_holder or client_scoped)
  )
);

create unique index if not exists roles_one_page_holder on public.roles (page_holder) where page_holder;

-- ============================================ 2. role_capabilities

-- The capability list is fixed here AND in src/react/lib/access.ts — the app
-- has to know what each one means, so adding one is a code change anyway.
-- Keep the two lists in step.
create table if not exists public.role_capabilities (
  role_id    uuid not null references public.roles(id) on delete cascade,
  capability text not null check (capability in (
    'view_all_clients', 'manage_clients', 'see_client_money',
    'view_targets', 'manage_targets', 'enter_views', 'assign_team',
    'manage_workflows', 'view_all_work', 'approve_incentives',
    'manage_hr', 'manage_payroll', 'manage_assets', 'manage_settings'
  )),
  primary key (role_id, capability)
);

-- ============================================ 3. employee_roles

-- A company-wide role given to one person by hand — "Management", or
-- "Department Head" of a department whose lead is not flagged in HR's form.
-- department_id narrows it: "Head of Video Editors" is Department Head with
-- the Video Editors department on the row.
create table if not exists public.employee_roles (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  role_id       uuid not null references public.roles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  granted_by    uuid references public.profiles(id) on delete set null,
  granted_at    timestamptz not null default now()
);

create unique index if not exists employee_roles_global_unique
  on public.employee_roles (employee_id, role_id) where department_id is null;
create unique index if not exists employee_roles_scoped_unique
  on public.employee_roles (employee_id, role_id, department_id) where department_id is not null;
create index if not exists employee_roles_employee_idx on public.employee_roles (employee_id);

create or replace function public.guard_employee_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.roles r where r.id = new.role_id and r.client_scoped) then
    raise exception 'That role is held per client — add the person on the client''s Team tab instead.';
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := coalesce(auth.uid(), new.granted_by);
  end if;
  return new;
end;
$$;

drop trigger if exists employee_roles_guard on public.employee_roles;
create trigger employee_roles_guard
  before insert or update on public.employee_roles
  for each row execute function public.guard_employee_role();

-- A role cannot flip between company-wide and per-client while somebody
-- holds it the other way — the holding would silently stop meaning anything.
-- 0036 re-creates this to check client_assignments too.
create or replace function public.guard_role_shape()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.client_scoped and not old.client_scoped
     and exists (select 1 from public.employee_roles where role_id = new.id) then
    raise exception 'People hold this role company-wide. Take it off them first, then make it a per-client role.';
  end if;
  return new;
end;
$$;

drop trigger if exists roles_guard_shape on public.roles;
create trigger roles_guard_shape
  before update on public.roles
  for each row execute function public.guard_role_shape();

-- ============================================ 4. who holds what
--
-- ONE implementation, asked about any login (the "_as" functions), so the
-- proof below can compare the old rules and the new ones for everybody. The
-- caller's own versions — what policies call — are one-line wrappers.
-- security definer for the same reason is_owner() is (0001): a policy that
-- read these tables directly would recurse or be filtered by their own RLS.

create or replace function public.role_holdings_for(p_profile uuid)
returns table (role_id uuid, scope_department uuid)
language sql stable security definer set search_path = public
as $$
  -- 1. given by hand, to somebody still on the books
  select er.role_id, er.department_id
    from public.employee_roles er
    join public.employees e on e.id = er.employee_id
    join public.roles r on r.id = er.role_id
   where e.profile_id = p_profile
     and e.status <> 'resigned'
     and r.is_active and not r.client_scoped
  union
  -- 2. everybody in a department, company-wide
  select r.id, null::uuid
    from public.roles r
    join public.profiles p on p.id = p_profile
   where r.held_by = 'department' and r.is_active
     and r.department_id = p.department_id
  union
  -- 3. a department's team leads, inside their own department
  select r.id, p.department_id
    from public.roles r
    join public.profiles p on p.id = p_profile
   where r.held_by = 'team_leads' and r.is_active
     and p.is_team_lead and p.department_id is not null
     and (r.department_id is null or r.department_id = p.department_id)
$$;

create or replace function public.is_owner_as(p_profile uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = p_profile and role = 'owner') $$;

-- Company-wide only, and deliberately NOT true for the owner just for being
-- the owner — the one thing that lets is_hr() be rebuilt on this later
-- without the owner suddenly counting as a member of HR.
create or replace function public.holds_capability_as(p_profile uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.role_holdings_for(p_profile) h
      join public.role_capabilities rc on rc.role_id = h.role_id
     where h.scope_department is null and rc.capability = p_cap
  )
$$;

-- The owner holds every capability. Nothing on the Roles & access screen can
-- take that away, so nobody can lock the company out of its own settings.
create or replace function public.has_capability_as(p_profile uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_owner_as(p_profile) or public.holds_capability_as(p_profile, p_cap) $$;

create or replace function public.has_capability_in_department_as(p_profile uuid, p_dept uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_capability_as(p_profile, p_cap)
      or exists (
        select 1 from public.role_holdings_for(p_profile) h
          join public.role_capabilities rc on rc.role_id = h.role_id
         where h.scope_department = p_dept and rc.capability = p_cap
      )
$$;

-- What every policy calls: the same questions, about whoever is asking.
create or replace function public.has_capability(p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_capability_as(auth.uid(), p_cap) $$;

create or replace function public.has_capability_in_department(p_dept uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_capability_in_department_as(auth.uid(), p_dept, p_cap) $$;

-- The "_as" functions answer about ANY login, which is for this file's proof
-- and the SQL editor — not for the app to ask about somebody else.
revoke all on function public.role_holdings_for(uuid)                          from public, anon, authenticated;
revoke all on function public.is_owner_as(uuid)                                from public, anon, authenticated;
revoke all on function public.holds_capability_as(uuid, text)                  from public, anon, authenticated;
revoke all on function public.has_capability_as(uuid, text)                    from public, anon, authenticated;
revoke all on function public.has_capability_in_department_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.has_capability(text)                    to authenticated;
grant execute on function public.has_capability_in_department(uuid, text) to authenticated;

-- ============================================ 5. row-level security

alter table public.roles             enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.employee_roles    enable row level security;

-- Who holds which role is no more secret than who sits in which department
-- (departments_select, 0004): any signed-in account reads all three, and the
-- app hides what a screen has no business showing.
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using ( auth.uid() is not null );
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );
-- Retire, never delete (see is_active above).
revoke delete on public.roles from anon, authenticated;

drop policy if exists role_capabilities_select on public.role_capabilities;
create policy role_capabilities_select on public.role_capabilities for select using ( auth.uid() is not null );
drop policy if exists role_capabilities_write on public.role_capabilities;
create policy role_capabilities_write on public.role_capabilities for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );

drop policy if exists employee_roles_select on public.employee_roles;
create policy employee_roles_select on public.employee_roles for select using ( auth.uid() is not null );
drop policy if exists employee_roles_write on public.employee_roles;
create policy employee_roles_write on public.employee_roles for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.roles';             exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.role_capabilities'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.employee_roles';    exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 6. the seed — today's access, exactly
--
-- Runs once, on an empty roles table. After that the Roles & access screen
-- owns this list, and re-running this file must not put back a capability
-- somebody deliberately took away.
--
-- The eleven roles are the blueprint's §23 list (Q9 may add more — that is a
-- row on the Roles & access screen, not a code change). What reproduces
-- today's rules, and why:
--   HR              — held by the Human Resources department (by id), so it
--                     is exactly is_hr(). Holds what HR can do today on
--                     Clients & Pages (manage clients, assign pages) plus the
--                     HR-module capabilities for when those tables move over.
--   Department Head — held by the Content and Marketing team lead, inside
--                     that department, so it is exactly
--                     leads_content_marketing(). Holds what that lead can do
--                     today (clients, pages, assignments) plus the new
--                     targets and weekly views (plan §4 table).
--   Super Admin, Management — every capability; nobody holds them until
--                     somebody is given one. The owner already holds all.
--   SMM             — per client: read its targets, enter its weekly views.
--   Editor, DOP     — per client; nothing extra yet (Q10 decides whether an
--                     editor sees targets — one tick on the screen).

do $$
declare
  d_hr    uuid := (select id from public.departments where name = 'Human Resources');
  d_cm    uuid := (select id from public.departments where name = 'Content and Marketing');
  d_sales uuid := (select id from public.departments where name = 'Sales');
  d_pm    uuid := (select id from public.departments where name = 'Performance Marketing');
  d_prod  uuid := (select id from public.departments where name = 'Production');
  d_edit  uuid := (select id from public.departments where name = 'Video Editors');
begin
  if exists (select 1 from public.roles) then return; end if;

  insert into public.roles (name, department_id, client_scoped, held_by, page_holder, sort_order) values
    ('Super Admin',           null,    false, 'assigned', false, 1),
    ('Management',            null,    false, 'assigned', false, 2),
    -- If the department is missing, nobody holds it implicitly rather than
    -- EVERY team lead holding it — the safe way to fail.
    ('Department Head',       d_cm,    false, case when d_cm    is null then 'assigned' else 'team_leads' end, false, 3),
    ('Sales',                 d_sales, false, case when d_sales is null then 'assigned' else 'department' end, false, 4),
    ('SMM',                   d_cm,    true,  'assigned', true,  5),
    ('Editor',                d_edit,  true,  'assigned', false, 6),
    ('DOP / Production',      d_prod,  true,  'assigned', false, 7),
    ('Performance Marketing', d_pm,    false, case when d_pm    is null then 'assigned' else 'department' end, false, 8),
    ('HR',                    d_hr,    false, case when d_hr    is null then 'assigned' else 'department' end, false, 9),
    ('Admin',                 null,    false, 'assigned', false, 10),
    ('Client',                null,    false, 'assigned', false, 11);

  update public.roles set assigned_by_role_id = (select id from public.roles where name = 'Department Head') where name = 'SMM';
  update public.roles set assigned_by_role_id = (select id from public.roles where name = 'SMM')             where name = 'Editor';

  insert into public.role_capabilities (role_id, capability)
  select r.id, c.cap
    from public.roles r
    cross join unnest(array[
      'view_all_clients', 'manage_clients', 'see_client_money',
      'view_targets', 'manage_targets', 'enter_views', 'assign_team',
      'manage_workflows', 'view_all_work', 'approve_incentives',
      'manage_hr', 'manage_payroll', 'manage_assets', 'manage_settings'
    ]) as c(cap)
   where r.name in ('Super Admin', 'Management');

  insert into public.role_capabilities (role_id, capability)
  select r.id, c.cap
    from public.roles r
    join (values
      ('Department Head', 'view_all_clients'),
      ('Department Head', 'manage_clients'),
      ('Department Head', 'assign_team'),
      ('Department Head', 'view_targets'),
      ('Department Head', 'manage_targets'),
      ('Department Head', 'enter_views'),
      ('Department Head', 'view_all_work'),
      ('SMM',             'view_targets'),
      ('SMM',             'enter_views'),
      ('HR',              'view_all_clients'),
      ('HR',              'manage_clients'),
      ('HR',              'assign_team'),
      ('HR',              'manage_hr'),
      ('HR',              'manage_payroll'),
      ('HR',              'approve_incentives'),
      ('Admin',           'manage_assets')
    ) as c(role_name, cap) on c.role_name = r.name;
end $$;

-- ============================================ 7. proof
--
-- Read the rows. The two "differ" rows are the ones that matter: each names
-- every login whose access under the NEW rules is not exactly what the OLD
-- rules give them today. Both must say "none". Anything else is a question to
-- answer before 0036, which moves Clients & Pages onto these rules only if
-- this comparison is clean.

with who as (
  select p.id, coalesce(nullif(p.name, ''), p.email, p.id::text) as nm,
         -- today's rules, exactly as 0006 and 0033 write them
         exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources') as old_hr,
         (p.role = 'owner'
          or exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources')
          or (p.is_team_lead and exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Content and Marketing'))
         ) as old_clients_write,
         -- the new ones
         public.holds_capability_as(p.id, 'manage_hr') as new_hr,
         public.has_capability_in_department_as(
           p.id, (select id from public.departments where name = 'Content and Marketing'), 'manage_clients'
         ) as new_clients_write
    from public.profiles p
)
select 'roles seeded (expect 11 on a first run)' as check, count(*)::text as result from public.roles
union all
select 'capabilities ticked', count(*)::text from public.role_capabilities
union all
select 'HR role follows the department (by id, not name)',
       coalesce((select r.held_by || ' — ' || coalesce(d.name, 'no department')
                   from public.roles r left join public.departments d on d.id = r.department_id
                  where r.name = 'HR'), 'HR role missing')
union all
select 'Department Head follows the C&M team lead',
       coalesce((select r.held_by || ' — ' || coalesce(d.name, 'no department')
                   from public.roles r left join public.departments d on d.id = r.department_id
                  where r.name = 'Department Head'), 'Department Head role missing')
union all
select 'logins checked', count(*)::text from who
union all
select 'HR access — old vs new differ for',
       coalesce(string_agg(nm, ', ' order by nm) filter (where old_hr <> new_hr), 'none')
  from who
union all
select 'Clients & Pages access — old vs new differ for',
       coalesce(string_agg(nm, ', ' order by nm) filter (where old_clients_write <> new_clients_write), 'none')
  from who
union all
select 'has_capability() callable', (select count(*) from pg_proc where proname = 'has_capability')::text;
