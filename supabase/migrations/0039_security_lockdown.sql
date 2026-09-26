-- 0039 — security & privacy lockdown (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0038. Safe to re-run.
--
-- What was found, asking the LIVE API with nothing but the public key that
-- every visitor's browser already holds:
--
--   1. Seven tables answered anyone at all, signed in or not: office_locations
--      (with each branch's qr_token — the QR punch secret), attendance_settings,
--      shifts, holidays, tds_categories, visit_purposes, incentive_rules.
--   2. Anyone can CREATE an account: Supabase's sign-up is open, and the
--      company code is only checked by the app's own form — the Auth API never
--      sees it (and the default code sits in migration 0004, in a public
--      repo). So "signed in" was never "works at Metrol". A stranger who signs
--      up could read every client with its contact phone and email, every
--      page, every client team, every role, and — once 1. is closed the
--      obvious way — the QR secret too.
--   3. Every employee could read the QR secret, which lets QR-only mode be
--      satisfied without standing at the poster.
--   4. email_for_employee_code() answers any 4-digit ID with that person's
--      email to a signed-out caller, 30 a minute: every employee's email in
--      about five hours.
--
-- What this changes:
--   A. is_staff(): the owner, a team lead, anyone with a live employee
--      record, or HR. None of it can be self-granted (guard_profile_
--      privileges() blocks the team-lead switch, employees has no self-insert,
--      a new account lands in Sales, not HR). Every read rule that said
--      "anyone" or "anyone signed in" now says "staff" — 20 tables. A
--      stranger's new account sees nothing.
--   B. office_locations.qr_token is no longer readable through the API at all.
--      HR and the owner get it from office_qr_tokens() to print the poster;
--      punch_by_qr() and rotate_office_qr() run with their own rights and
--      are unaffected.
--   C. Signing in with an employee ID needs the password in the same call:
--      the email comes back only when the password is right, so the lookup
--      no longer hands out addresses.
--   D. The employee-photo bucket can no longer be listed by a signed-out
--      visitor (a photo's own link still works, as before).
--   E. Job-application uploads must sit in an application's own folder, and
--      a file is capped at 25 MB — the open upload stays open for candidates
--      but is no longer a free file host.
--
-- Deliberately NOT changed: any function's EXECUTE grant. A policy's
-- functions are permission-checked when the query starts, even for a branch
-- that never runs, so revoking is_owner() from anon would break the /apply
-- form's anonymous upload (storage.objects' other insert rules call it).

-- ============================================ 0. stop before changing anything
-- C. needs pgcrypto and a read of auth.users; if either is missing, nothing
-- below runs.

do $$
begin
  perform extensions.crypt('probe', extensions.gen_salt('bf', 4));
  perform 1 from auth.users where encrypted_password is not null limit 1;
exception when others then
  raise exception '0039 stopped before changing anything: %', sqlerrm;
end $$;

-- ============================================ A. who counts as staff

-- NOT "has a department": profiles.department_id defaults to Sales
-- (default_department(), 0004), so a stranger's new account has one too.
-- Every signal here is one only HR or the owner can give.
create or replace function public.is_staff_as(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile is not null and (
    -- the owner, or a team lead (guard_profile_privileges(): owner/HR only)
    exists (select 1 from public.profiles p
             where p.id = p_profile and (p.role = 'owner' or p.is_team_lead))
    -- a live employee record (HR, or HR's approval of an application)
    or exists (select 1 from public.employees e
                where e.profile_id = p_profile and e.status <> 'resigned')
    -- HR itself, which may have no employee record at all (the live HR login)
    or public.holds_capability_as(p_profile, 'manage_hr')
  )
$$;
-- Asked about anyone — for proofs and other SQL only, like 0035's *_as().
revoke all on function public.is_staff_as(uuid) from public, anon, authenticated;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff_as(auth.uid())
$$;
-- anon too: a policy's functions must be executable by whoever queries.
grant execute on function public.is_staff() to anon, authenticated;

-- Every read rule that answered "anyone" or "anyone signed in". Each is
-- named <table>_select. `(select …)` makes Postgres ask once per query, not
-- once per row.
do $$
declare t text;
begin
  foreach t in array array[
    'attendance_settings', 'client_assignments', 'client_statuses', 'clients',
    'departments', 'employee_roles', 'holidays', 'incentive_rules',
    'office_locations', 'page_assignments', 'page_channels', 'page_reels',
    'page_statuses', 'pages', 'role_capabilities', 'roles', 'shifts',
    'tds_categories', 'view_adjustment_types', 'visit_purposes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ( (select public.is_staff()) )', t || '_select', t);
  end loop;
end $$;

-- ============================================ B. the QR punch secret

-- Column privileges: the API can read every column but the token. A
-- `select *` now fails, so the app lists its columns (useAttendance.ts).
revoke select on public.office_locations from anon, authenticated;
grant select (id, name, address, lat, lng, radius_meters, is_active, sort_order,
              created_at, updated_at, created_by, qr_rotated_at)
  on public.office_locations to authenticated;

create or replace function public.office_qr_tokens()
returns table (office_id uuid, qr_token uuid)
language sql stable security definer set search_path = public as $$
  select o.id, o.qr_token
    from public.office_locations o
   where public.is_owner() or public.is_hr()
$$;
revoke all on function public.office_qr_tokens() from public, anon;
grant execute on function public.office_qr_tokens() to authenticated;

-- ============================================ C. sign in with an employee ID

-- Same throttle as 0018 (30 lookups a minute, company-wide), but the email
-- comes back only when p_password is that login's password — so a wrong
-- guess and an unknown ID look the same, and no address leaks. The hash is
-- Supabase Auth's own bcrypt; the CASE keeps crypt() away from a login that
-- has no password yet (an invite not yet accepted).
create or replace function public.email_for_employee_code(p_code text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := btrim(coalesce(p_code, ''));
  v_recent integer;
  v_email  text;
begin
  if v_code = '' or coalesce(p_password, '') = '' then
    return null;
  end if;

  delete from public.employee_code_lookups
   where looked_up_at < now() - interval '10 minutes';

  select count(*) into v_recent
    from public.employee_code_lookups
   where looked_up_at > now() - interval '1 minute';

  if v_recent >= 30 then
    raise exception 'rate_limited';
  end if;

  insert into public.employee_code_lookups default values;

  -- The login is the employee's own profile; a login made by hand and never
  -- linked is found by the work email HR typed, as 0018 did.
  select u.email
    into v_email
    from public.employees e
    join auth.users u
      on u.id = e.profile_id
      or (e.profile_id is null and coalesce(e.work_email, '') <> ''
          and lower(u.email) = lower(e.work_email))
   where e.employee_code = v_code
     and e.status <> 'resigned'
     and case when u.encrypted_password like '$2%'
              then u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
              else false end
   limit 1;

  return nullif(btrim(coalesce(v_email, '')), '');
end;
$$;

revoke all on function public.email_for_employee_code(text, text) from public;
grant execute on function public.email_for_employee_code(text, text) to anon, authenticated;

-- The one-argument version is the address book; it goes.
drop function if exists public.email_for_employee_code(text);

-- ============================================ D. employee photos

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using ( bucket_id = 'avatars'
          and ((select public.is_staff())
               or (storage.foldername(name))[1] = auth.uid()::text) );

-- ============================================ E. job-application uploads

-- useJobApplications.ts uploads to "<application id>/<field>-<time>-<name>";
-- anything else is not an application.
drop policy if exists job_applications_storage_insert on storage.objects;
create policy job_applications_storage_insert on storage.objects for insert
  to anon, authenticated
  with check ( bucket_id = 'job-applications'
               and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' );

-- Photos are shrunk to ~0.3 MB before upload; a scanned PDF fits easily.
update storage.buckets
   set file_size_limit = 26214400
 where id = 'job-applications'
   and (file_size_limit is null or file_size_limit > 26214400);

-- ---------------------------------------------------------------- proof
-- Expect: 0 / 20 / no / yes / yes / "N of M" / no / yes, then the list of
-- logins that are NOT staff — each one should be someone you do not know,
-- or a person who still needs a department (Employees → their record).

select 'read rules still open to anyone (expect 0)' as check,
       count(*)::text as result
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)')
union all
select 'read rules now for staff only (expect 20)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd = 'SELECT' and qual like '%is_staff()%'
union all
select 'QR secret readable through the API (expect no)',
       case when has_column_privilege('authenticated', 'public.office_locations', 'qr_token', 'select')
              or has_column_privilege('anon', 'public.office_locations', 'qr_token', 'select')
            then 'YES — still readable' else 'no' end
union all
select 'HR prints the poster through office_qr_tokens() (expect yes)',
       case when to_regprocedure('public.office_qr_tokens()') is not null then 'yes' else 'NO' end
union all
select 'employee-ID sign-in needs the password (expect yes)',
       case when to_regprocedure('public.email_for_employee_code(text, text)') is not null
             and to_regprocedure('public.email_for_employee_code(text)') is null
            then 'yes' else 'NO' end
union all
select 'employee IDs whose login has a password (can sign in by ID)',
       (select count(*) filter (where u.encrypted_password like '$2%')::text || ' of ' || count(*)::text
          from public.employees e
          left join auth.users u on u.id = e.profile_id
         where e.employee_code is not null and e.status <> 'resigned')
union all
select 'employee photos listable while signed out (expect no)',
       case when exists (select 1 from pg_policies where schemaname = 'storage'
                          and policyname = 'avatars_read' and qual like '%is_staff%')
            then 'no' else 'YES' end
union all
select 'job-application uploads need an application folder (expect yes)',
       case when exists (select 1 from pg_policies where schemaname = 'storage'
                          and policyname = 'job_applications_storage_insert' and with_check like '%~*%')
            then 'yes' else 'NO' end
union all
select 'logins that are NOT staff — they now see no client or office data',
       coalesce((select string_agg(coalesce(nullif(p.name, ''), '(no name)') || ' <' || coalesce(p.email, '?') || '>', ', '
                                   order by p.created_at)
                   from public.profiles p
                  where not public.is_staff_as(p.id)), 'none');
