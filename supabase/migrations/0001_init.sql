-- Metrol CRM — initial schema and row level security.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent enough to re-run on a fresh project, but it is NOT a
-- migration for a database that already holds data.
--
-- A note on one addition to the brief: projects carries an owner_id. The rule
-- "an owner can read/write everything in their own projects" cannot be written
-- as a policy unless a project knows who owns it, so the column is required.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  name       text not null default '',
  email      text,
  created_at timestamptz not null default now()
);

-- A profile row appears automatically when someone signs up, so the app never
-- has to create one and no user can exist without a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody promotes themselves to owner from the client. Role changes go through
-- the service role key (server side) or the SQL editor.
create or replace function public.guard_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ---------------------------------------------------------------- projects

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  status      text not null default 'active' check (status in ('active','paused','done')),
  image_url   text,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

-- ---------------------------------------------------------------- leads

create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  status       text not null default 'new'
               check (status in ('new','connected','follow_up','dead','converted')),
  quality      text check (quality in ('good','average','bad')),
  owner_id     uuid references public.profiles(id) on delete set null,
  amount       numeric(12,2) not null default 0,
  verified     boolean not null default false,
  converted_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists leads_project_idx on public.leads (project_id);
create index if not exists leads_owner_idx   on public.leads (owner_id);
create index if not exists leads_status_idx  on public.leads (project_id, status);
create index if not exists members_profile_idx on public.project_members (profile_id);

-- ------------------------------------------------- helpers for the policies
--
-- These are SECURITY DEFINER on purpose. A policy on profiles that itself
-- reads profiles recurses forever; going through a definer function reads the
-- table with RLS bypassed and breaks the cycle. search_path is pinned so the
-- function body cannot be hijacked by a caller's search_path.

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles where id = auth.uid() and role = 'owner'
) $$;

create or replace function public.owns_project(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.projects where id = pid and owner_id = auth.uid()
) $$;

create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.project_members
  where project_id = pid and profile_id = auth.uid()
) $$;

-- ---------------------------------------------------------------- policies

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.leads           enable row level security;

-- profiles: you see yourself; an owner sees the team.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using ( id = auth.uid() or public.is_owner() );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using ( id = auth.uid() )
  with check ( id = auth.uid() );

-- projects: the owner of the project, or somebody assigned to it.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using ( owner_id = auth.uid() or public.is_project_member(id) );

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check ( owner_id = auth.uid() and public.is_owner() );

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using ( owner_id = auth.uid() )
  with check ( owner_id = auth.uid() );

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using ( owner_id = auth.uid() );

-- project_members: the project's owner manages it; a member can see their own row.
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members for select
  using ( profile_id = auth.uid() or public.owns_project(project_id) );

drop policy if exists members_write on public.project_members;
create policy members_write on public.project_members for all
  using ( public.owns_project(project_id) )
  with check ( public.owns_project(project_id) );

-- leads: the heart of the brief.
--   owner  -> everything inside a project they own
--   member -> only the leads assigned to them
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using ( public.owns_project(project_id) or owner_id = auth.uid() );

-- A member may create a lead only inside a project they belong to, and only
-- assigned to themselves. An owner may create anything in their own project.
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (
    public.owns_project(project_id)
    or ( public.is_project_member(project_id) and owner_id = auth.uid() )
  );

-- USING decides which rows you may touch; WITH CHECK decides what they may
-- become. A member therefore cannot take a lead that is not theirs, and cannot
-- hand one of theirs to somebody else — only the project owner reassigns.
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using ( public.owns_project(project_id) or owner_id = auth.uid() )
  with check ( public.owns_project(project_id) or owner_id = auth.uid() );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using ( public.owns_project(project_id) );
