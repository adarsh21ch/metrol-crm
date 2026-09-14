-- 0019 — take the table-level grant on `employees` away from anon.
--
-- WHY THIS EXISTS, because the reason matters more than the line of SQL:
--
-- 0018's own proof asked `has_table_privilege('anon','public.employees','select')`
-- and got TRUE, which reads like a leak and is not one. Supabase grants anon and
-- authenticated SELECT on every table in `public` as a matter of course; what
-- actually stops an unauthenticated read is RLS, and `employees` has had RLS with
-- owner / HR / self policies since 0006. An anon request carries no `auth.uid()`,
-- so no policy matches and it comes back with zero rows. That was already true
-- before this file and stays true after it.
--
-- So this is defence in depth, not a fix: nothing in this app has ever needed
-- anon to read `employees`. The one public path that touches the table is
-- `email_for_employee_code()`, which is SECURITY DEFINER and runs as its owner —
-- the revoke does not reach it. With the grant gone there are two locks instead
-- of one, and 0018's check finally measures something worth measuring.
--
-- `authenticated` is untouched. It is a separate role and does not inherit from
-- anon, so every signed-in screen reads exactly what it read yesterday, still
-- filtered by the same policies.

revoke all on public.employees from anon;

-- -------------------------------------------------------------------- proof
-- The first row is the grant. The second is the one that always mattered: it
-- asks the question as `anon` itself and counts what comes back. Zero is the
-- answer whether or not this migration ever ran — that is the point.
select 'anon holds no table grant on employees' as check,
       (not has_table_privilege('anon', 'public.employees', 'select'))::text as result
union all
select 'anon still cannot read job_applications',
       (not exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = 'job_applications'
            and cmd = 'SELECT' and 'anon' = any(roles)
       ))::text
union all
select 'employees has RLS enabled',
       (select relrowsecurity::text from pg_class where oid = 'public.employees'::regclass);
