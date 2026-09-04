-- Two things a company needs before it has more than one kind of employee:
-- a gate on who may create an account, and somewhere to record what work a
-- person actually does. Run once in the SQL editor.

-- ------------------------------------------------------- 1. realtime, again
-- The earlier block that enabled these swallowed every exception, so it
-- reported success whether or not the tables were actually added. This one is
-- still safe to re-run, and the SELECT at the bottom of this file proves what
-- really happened rather than asking you to trust it. profiles is new here —
-- it was missed the first time, which is why a new signup did not appear on
-- the owner's screen without a reload.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.leads';       exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.events';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.projects';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.profiles';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.departments'; exception when duplicate_object then null; end;
exception when undefined_object then
  -- No supabase_realtime publication on this project at all; nothing to add to.
  null;
end $$;

-- ------------------------------------------------------ 2. the company code

create table if not exists public.company_settings (
  id          int primary key default 1,
  invite_code text not null,
  updated_at  timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)
);

insert into public.company_settings (id, invite_code)
values (1, 'Metrol#9878')
on conflict (id) do nothing;

alter table public.company_settings enable row level security;

-- Only the owner ever reads the code itself, or changes it.
drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings for select
  using ( public.is_owner() );

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings for update
  using ( public.is_owner() )
  with check ( public.is_owner() );

-- A signup form has no session yet, so it cannot read company_settings — and
-- it should not be able to, or the code would be sitting in the network tab
-- for anyone who opened devtools. It calls this instead: the function has the
-- privilege to read the row, but only ever answers yes or no.
create or replace function public.check_invite_code(code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.company_settings where invite_code = code)
$$;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- ------------------------------------------------------- 3. departments

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.departments (name, sort_order) values
  ('Sales', 1),
  ('Production', 2),
  ('Content Creation', 3),
  ('Video Editors', 4),
  ('Developers', 5),
  ('AI Staff', 6)
on conflict (name) do nothing;

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id);

-- Everyone who already exists is Sales, because that is how the whole team has
-- been treated up to now. The owner moves people out of it as the other
-- departments become real.
update public.profiles
   set department_id = (select id from public.departments where name = 'Sales')
 where department_id is null and role = 'member';

create or replace function public.default_department()
returns uuid language sql stable
set search_path = public
as $$ select id from public.departments where name = 'Sales' limit 1 $$;

alter table public.profiles
  alter column department_id set default public.default_department();

alter table public.departments enable row level security;

-- A department name is closer to a job title than to a secret, and a member
-- has to be able to read their own. Any signed-in account may read the list.
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select
  using ( auth.uid() is not null );

-- Only the owner adds, renames, or retires one.
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all
  using ( public.is_owner() )
  with check ( public.is_owner() );

-- The owner needs to be able to move somebody between departments, which means
-- writing a row that is not their own. A member still edits only themselves.
-- Role changes stay blocked for everyone from the client by the existing
-- guard trigger, so this does not open a path to making someone an owner.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using ( id = auth.uid() or public.is_owner() )
  with check ( id = auth.uid() or public.is_owner() );

-- --------------------------------------------------------------- 4. proof
-- Run this and read the output. Every table the app watches live should be
-- listed. If one is missing, realtime for it genuinely is not on.
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and schemaname = 'public'
 order by tablename;
