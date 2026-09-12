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
order by 1;
