-- HR module — Phase 1: the employee record, and the two switches around it.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Schema and row-level security ship in ONE file on purpose. Splitting them
-- across two migrations would leave a table holding phone numbers, addresses
-- and emergency contacts readable by the whole company in between.

-- ============================================ 1. the two new department rows

insert into public.departments (name, sort_order) values
  ('Human Resources',       7),
  ('Performance Marketing', 8)
on conflict (name) do nothing;

-- ============================================ 2. the team-lead switch

-- Adds one extra tab ("Manage team") to whatever dashboard the person already
-- has. It is deliberately NOT a role: a Sales team lead is still a Sales
-- person, and the flag changes nothing else about what they can do.
alter table public.profiles
  add column if not exists is_team_lead boolean not null default false;

-- ============================================ 3. the privilege guard
--
-- This closes a hole that opens the moment "which department you are in"
-- starts deciding what you can read. profiles_update (migration 0004) lets a
-- member edit their OWN profile row — which was harmless when department_id
-- only picked a dashboard. Now that Human Resources reads every employee
-- record, a salesperson could set their own department_id to Human Resources
-- and read the whole company's personal data. is_team_lead is the same story
-- one step down: set it yourself and you can read your department's records.
--
-- Both columns are therefore writable only by the owner or by HR, enforced
-- here rather than in a policy, because the existing policy is what allows the
-- legitimate self-edits (name, phone, avatar) to keep working.
--
-- This replaces guard_role_change() from 0001 and keeps everything it did.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A trigger fires for every connection, so an unconditional guard would lock
  -- out the SQL editor too — which is where the first owner has to be created.
  -- auth.uid() is null on a privileged connection and carries the user's id on
  -- a request from the app, so it is the honest way to separate them.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed from the client';
  end if;

  if (new.department_id is distinct from old.department_id
      or new.is_team_lead is distinct from old.is_team_lead)
     and not (public.is_owner() or public.is_hr()) then
    raise exception 'department and team lead can only be changed by the owner or HR';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role       on public.profiles;
drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

drop function if exists public.guard_role_change();

-- ============================================ 4. who is who
--
-- All three are security definer for the same reason is_owner() is: a policy
-- on employees that queried employees would recurse, and a member is not
-- allowed to read the profiles row these answers are derived from.

-- HR is a department, not a role. Nothing keys on a hardcoded string in a
-- component — this function is the single place the name is matched.
create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles p
    join public.departments d on d.id = p.department_id
   where p.id = auth.uid() and d.name = 'Human Resources'
) $$;

create or replace function public.leads_a_team()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(
  (select is_team_lead from public.profiles where id = auth.uid()), false
) $$;

create or replace function public.my_department()
returns uuid language sql stable security definer set search_path = public
as $$ select department_id from public.profiles where id = auth.uid() $$;

-- ============================================ 5. the employee record

create sequence if not exists public.employee_code_seq;

create table if not exists public.employees (
  id                 uuid primary key default gen_random_uuid(),
  -- MM-001, MM-002… generated below, never typed, so no two people collide.
  employee_code      text unique,
  -- Nullable on purpose: an employee does not need a CRM login. Someone who
  -- never signs in still has a record; linking one comes later or never.
  profile_id         uuid references public.profiles(id) on delete set null,

  full_name          text not null,
  designation        text not null default '',
  department_id      uuid references public.departments(id),
  employment_type    text not null default 'full_time'
                       check (employment_type in ('full_time','part_time','intern','contract')),
  date_of_joining    date not null,
  reporting_to       uuid references public.employees(id) on delete set null,

  work_email         text,
  personal_email     text,
  phone              text not null default '',
  date_of_birth      date,
  address            text,

  emergency_name     text not null default '',
  emergency_relation text,
  emergency_phone    text not null default '',

  -- Nobody is ever deleted. Someone who leaves becomes 'resigned' and stays.
  status             text not null default 'active'
                       check (status in ('active','notice','resigned')),
  last_working_day   date,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id)
);

-- One employee record per login. Two rows pointing at the same person would
-- give two answers to "when did they join".
create unique index if not exists employees_profile_unique
  on public.employees (profile_id) where profile_id is not null;

create index if not exists employees_department_idx on public.employees (department_id);
create index if not exists employees_status_idx     on public.employees (status);

-- ============================================ 6. codes and timestamps

create or replace function public.set_employee_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := 'MM-' || lpad(nextval('public.employee_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists employees_set_code on public.employees;
create trigger employees_set_code
  before insert on public.employees
  for each row execute function public.set_employee_code();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists employees_touch on public.employees;
create trigger employees_touch
  before update on public.employees
  for each row execute function public.touch_updated_at();

-- ============================================ 7. one department, not two
--
-- profiles.department_id decides which dashboard a person gets;
-- employees.department_id is HR's record of the same fact. Two columns holding
-- one truth drift — so when HR moves an employee who has a login, their
-- profile moves with them. Runs as definer, so RLS on profiles does not block
-- it; the guard above still applies, and HR is allowed to make this change.
create or replace function public.sync_profile_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.department_id is not null then
    update public.profiles
       set department_id = new.department_id
     where id = new.profile_id
       and department_id is distinct from new.department_id;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_sync_department on public.employees;
create trigger employees_sync_department
  after insert or update of department_id, profile_id on public.employees
  for each row execute function public.sync_profile_department();

-- ============================================ 8. row-level security
--
-- The table this app was most careful about. Read the four policies as one
-- sentence each:

alter table public.employees enable row level security;

-- READ — the owner and HR see everyone. A team lead sees their own department.
-- Everyone else sees exactly one record: their own.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select
  using (
    public.is_owner()
    or public.is_hr()
    or profile_id = auth.uid()
    or (
      public.leads_a_team()
      and department_id is not null
      and department_id = public.my_department()
    )
  );

-- CREATE — owner and HR only. A team lead cannot add people.
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert
  with check ( public.is_owner() or public.is_hr() );

-- EDIT — owner and HR only. Note the person themselves cannot edit their own
-- record: joining date and designation are HR's facts, not self-service.
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- DELETE — deliberately absent. RLS denies what no policy allows, and the
-- revoke below means even a future policy written by mistake cannot open it.
-- Someone who leaves is marked 'resigned'; the record stays forever.
revoke delete on public.employees from anon, authenticated;

-- ============================================ 9. realtime

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.employees'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 10. proof
-- Read the output. Expect: the employees table listed, RLS on, 3 policies,
-- and both new departments present.

select 'rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.employees'::regclass
union all
select 'policies on employees', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'employees'
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'employees' and cmd = 'DELETE'
union all
select 'new departments', string_agg(name, ', ' order by sort_order)
  from public.departments where name in ('Human Resources','Performance Marketing')
union all
select 'is_team_lead column', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_team_lead';
