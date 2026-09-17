-- One query: what has actually been installed on this database.
--
-- Paste the whole thing into the Supabase SQL editor. It changes nothing — it
-- only reads. Every row says whether one migration's work is present.
--
-- Why this exists: CLAUDE.md said migrations 0009-0012 had never been run,
-- while the attendance SQL that ran clean on 2026-09-12 creates policies that
-- call my_employee_id(), which only 0009 defines. One of the two was wrong.
-- Checking beats inferring.

with have_table as (
  select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
have_fn as (
  select p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
have_col as (
  select table_name, column_name from information_schema.columns
   where table_schema = 'public'
)
select '0006 employees'            as migration, (select count(*) from have_table where relname = 'employees')::text            as present
union all
select '0009 leave_requests',       (select count(*) from have_table where relname = 'leave_requests')::text
union all
select '0009 my_employee_id()',     (select count(*) from have_fn where proname = 'my_employee_id')::text
union all
select '0010 salary_records',       (select count(*) from have_table where relname = 'salary_records')::text
union all
select '0011 onboarding_tasks',     (select count(*) from have_table where relname = 'onboarding_tasks')::text
union all
select '0011 employee_documents',   (select count(*) from have_table where relname = 'employee_documents')::text
union all
select '0012 exit_records',         (select count(*) from have_table where relname = 'exit_records')::text
union all
select '0013 attendance',           (select count(*) from have_table where relname = 'attendance')::text
union all
select '0013 holidays',             (select count(*) from have_table where relname = 'holidays')::text
union all
select '0014 office_locations',     (select count(*) from have_table where relname = 'office_locations')::text
union all
select '0014 old office columns GONE (must be 0)',
                                    (select count(*) from have_col where table_name = 'attendance_settings' and column_name = 'office_lat')::text
union all
select '0015 punch_by_qr()',        (select count(*) from have_fn where proname = 'punch_by_qr')::text
union all
select '0016 leave_type column',    (select count(*) from have_col where table_name = 'leave_requests' and column_name = 'leave_type')::text
union all
select '0016 working_days_between()',(select count(*) from have_fn where proname = 'working_days_between')::text
union all
select '0017 job_applications',     (select count(*) from have_table where relname = 'job_applications')::text
union all
select '0020 full-form columns (want 1)',
                                    (select count(*) from have_col where table_name = 'job_applications' and column_name = 'present_address')::text
union all
select '0021 application DELETE policy (want 1)',
                                    (select count(*) from pg_policies where schemaname = 'public'
                                       and tablename = 'job_applications' and policyname = 'job_applications_delete')::text
union all
select '— employees DELETE policy (must stay 0)',
                                    (select count(*) from pg_policies where schemaname = 'public'
                                       and tablename = 'employees' and cmd = 'DELETE')::text
union all
select '0022 leave_months',         (select count(*) from have_table where relname = 'leave_months')::text
union all
select '0022 leave_month_summary()',(select count(*) from have_fn where proname = 'leave_month_summary')::text
union all
select '0022 leave_month_board()',  (select count(*) from have_fn where proname = 'leave_month_board')::text
union all
select '0022 close_leave_month()',  (select count(*) from have_fn where proname = 'close_leave_month')::text
union all
select '0023 punch_methods column', (select count(*) from have_col where table_name = 'attendance_settings' and column_name = 'punch_methods')::text
union all
select '0023 punch_method_allowed()',(select count(*) from have_fn where proname = 'punch_method_allowed')::text
union all
select '0023 enforce trigger',      (select count(*) from pg_trigger where tgname = 'attendance_enforce_method' and not tgisinternal)::text
union all
-- Row counts only for tables 0013/0014 proved are there by running against
-- them. leave_requests is deliberately NOT counted here: if it turned out to be
-- missing, naming it in this query would make the whole query error and tell
-- you nothing at all — which is the failure this file exists to avoid. The
-- "0009 leave_requests" row above already answers whether it exists.
select '— data: office branches',   (select count(*)::text from public.office_locations)
union all
select '— data: employees on record',(select count(*)::text from public.employees)
union all
select '— data: holidays entered',  (select count(*)::text from public.holidays)
union all
-- Only meaningful once 0022 above reads back as installed — guarded so this
-- line cannot itself error the whole query on a database that doesn't have
-- it yet, which is the exact failure this file exists to avoid.
select '— data: leave months closed',
       case when (select count(*) from have_table where relname = 'leave_months') = 1
            then (select count(*)::text from public.leave_months) else 'n/a — 0022 not installed' end
order by 1;
