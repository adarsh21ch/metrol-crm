-- 0040 — HR has everything the owner has (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0039. Safe to re-run.
--
-- Adarsh's rule, standing from today: whatever the owner may do, HR may do.
-- Something becomes owner-only only when Adarsh says "this is not for HR" —
-- he will decide those with the owner later. So every "owner or HR" check
-- below goes through ONE helper, is_owner_level(); making something
-- owner-only later is swapping that one call for is_owner() in that one
-- place, nothing else.
--
-- What HR could NOT do before this, and now can:
--   * every capability on Roles & access — ticked on the HR role, so each
--     one can be unticked there later (the owner's are fixed; HR's are not);
--     this brings client money, Roles & access itself, and the rest;
--   * the sales side: see and manage every project, its leads and its team
--     (a project was visible only to whoever created it), create projects;
--   * company settings (the sign-up code) and departments;
--   * edit anyone's name, phone and photo (never their role — still blocked).
--
-- Also: 0039's proof counted ONE read rule still open to anyone signed in
-- that is not in any migration (made by hand in the dashboard). Every such
-- read rule becomes staff-only here and is NAMED in the proof; a rule that
-- also allows writing is only reported, never guessed at.

-- ============================================ 1. one helper

create or replace function public.is_owner_level()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or public.is_hr()
$$;
-- anon too: a policy's functions must be executable by whoever queries.
grant execute on function public.is_owner_level() to anon, authenticated;

-- ============================================ 2. every capability for HR

insert into public.role_capabilities (role_id, capability)
select r.id, c.capability
  from public.roles r
 cross join unnest(array[
   'view_all_clients', 'manage_clients', 'see_client_money',
   'view_targets', 'manage_targets', 'enter_views', 'assign_team',
   'manage_workflows', 'view_all_work', 'approve_incentives',
   'manage_hr', 'manage_payroll', 'manage_assets', 'manage_settings'
 ]) as c(capability)
 where r.name = 'HR'
on conflict (role_id, capability) do nothing;

-- ============================================ 3. the sales side

-- owns_project() is what every leads / members / events rule asks. The
-- owner-level see and manage every project, whoever created it.
create or replace function public.owns_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner_level()
      or exists (select 1 from public.projects where id = pid and owner_id = auth.uid())
$$;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using ( public.owns_project(id) or public.is_project_member(id) );

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check ( owner_id = auth.uid() and public.is_owner_level() );

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using ( public.owns_project(id) ) with check ( public.owns_project(id) );

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using ( public.owns_project(id) );

-- ============================================ 4. company settings, departments, profiles

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings for select
  using ( public.is_owner_level() );

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings for update
  using ( public.is_owner_level() ) with check ( public.is_owner_level() );

drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all
  using ( public.is_owner_level() ) with check ( public.is_owner_level() );

-- guard_profile_privileges() still refuses any change to `role` from the app.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using ( id = auth.uid() or public.is_owner_level() )
  with check ( id = auth.uid() or public.is_owner_level() );

-- ============================================ 5. the read rule 0039 could not see

create temp table if not exists _fixed_rules (rule text) on commit preserve rows;

do $$
declare r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)')
  loop
    execute format('alter policy %I on public.%I using ( (select public.is_staff()) )', r.policyname, r.tablename);
    insert into _fixed_rules values (r.tablename || ' → ' || r.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------- proof
-- Expect: 14 of 14 / none / your HR login's name / yes / the table whose
-- read rule was fixed (or "none") / none / 0.

select 'HR role capabilities (expect 14 of 14)' as check,
       (select count(*) from public.role_capabilities rc join public.roles r on r.id = rc.role_id
         where r.name = 'HR')::text || ' of 14' as result
union all
select 'owner-only rules left (expect none — HR has them all)',
       coalesce((select string_agg(tablename || '.' || policyname, ', ')
                   from pg_policies
                  where schemaname = 'public'
                    and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_owner\(\)'
                    and (coalesce(qual, '') || coalesce(with_check, '')) !~ '(is_hr\(\)|is_owner_level\(\))'), 'none')
union all
select 'logins with owner-level access now',
       coalesce((select string_agg(coalesce(nullif(p.name, ''), p.email), ', ')
                   from public.profiles p
                   left join public.departments d on d.id = p.department_id
                  where p.role = 'owner' or d.name = 'Human Resources'), 'none')
union all
select 'projects: HR sees every project (expect yes)',
       case when pg_get_functiondef('public.owns_project(uuid)'::regprocedure) like '%is_owner_level%'
            then 'yes' else 'NO' end
union all
select 'read rule found open and made staff-only',
       coalesce((select string_agg(rule, ', ') from _fixed_rules), 'none')
union all
select 'rules that let anyone signed in WRITE (expect none — tell Claude if not)',
       coalesce((select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
                   from pg_policies
                  where schemaname = 'public' and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
                    and regexp_replace(coalesce(qual, '') || coalesce(with_check, ''), '\s', '', 'g')
                        in ('true', '(auth.uid()ISNOTNULL)', 'truetrue', '(auth.uid()ISNOTNULL)(auth.uid()ISNOTNULL)')
                    and tablename <> 'job_applications'), 'none')
union all
select 'read rules still open to anyone (expect 0)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
