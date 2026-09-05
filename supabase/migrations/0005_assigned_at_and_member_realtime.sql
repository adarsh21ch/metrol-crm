-- Task #17: live sync when the owner assigns a lead. Run once in the SQL
-- editor. Safe to re-run.
--
-- Two independent gaps, both in the same family — a write that a member's
-- own browser never hears about without a manual refresh.

-- ------------------------------------------------- 1. when was this assigned?
--
-- The app already knew *who* a lead belonged to; it never recorded *when*
-- that became true. Without that, "N leads assigned to you since your last
-- visit" has nothing durable to compare against — a purely client-side flag
-- cannot answer that question because it never survives a reload.
alter table public.leads
  add column if not exists assigned_at timestamptz;

-- Backfill: every already-assigned lead reads as assigned on the day it was
-- created. Not literally true for a lead reassigned since, but it is the only
-- honest guess available, and it only matters for leads nobody has touched
-- since before this migration ran.
update public.leads
   set assigned_at = created_at
 where assigned_at is null and owner_id is not null;

-- ------------------------------------------------- 2. project_members, live
--
-- Assigning a member's first lead in a project upserts a project_members row
-- (see ensureProjectMember in useWorkspace.ts) — that row is what
-- projects_select needs to let the member read the *project* itself, not
-- just the lead. Nothing was ever added to the realtime publication for this
-- table, and nothing subscribed to it, so that row's arrival was invisible:
-- the member's browser had no way to know the project had just become
-- readable, and the project stayed missing from their view (blank project
-- name, nothing in the rail) until they reloaded.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.project_members'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ------------------------------------------------------------------ 3. proof
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and schemaname = 'public'
 order by tablename;
