-- 0041 — site_settings: only the owner and HR may change it (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0040. Safe to re-run.
--
-- `site_settings` is not in any migration and nothing in this app (or any
-- local repo, or metrol.in, which is parked) reads it — it was made by hand
-- in the dashboard with two rules: "public can read settings" (0040 already
-- made that staff-only) and "authenticated can update settings", which let
-- ANY signed-in account rewrite it — including one a stranger signs up for
-- (Supabase sign-up is open). Now: owner and HR, per THE ACCESS RULE.
-- The table and its data are left exactly as they are.

do $$
begin
  if to_regclass('public.site_settings') is null then
    raise notice 'No site_settings table here — nothing to change.';
    return;
  end if;
  execute 'drop policy if exists "authenticated can update settings" on public.site_settings';
  execute 'drop policy if exists "owner and HR can update settings" on public.site_settings';
  execute 'create policy "owner and HR can update settings" on public.site_settings for update
             using ( public.is_owner_level() ) with check ( public.is_owner_level() )';
end $$;

-- ---------------------------------------------------------------- proof
-- Expect: none / 0, then what the table holds (column names and row count
-- only, no values) so we can decide later whether it is still needed.

select 'rules that let anyone signed in WRITE (expect none)' as check,
       coalesce((select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
                   from pg_policies
                  where schemaname = 'public' and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
                    and regexp_replace(coalesce(qual, '') || coalesce(with_check, ''), '\s', '', 'g')
                        in ('true', '(auth.uid()ISNOTNULL)', 'truetrue', '(auth.uid()ISNOTNULL)(auth.uid()ISNOTNULL)')
                    and tablename <> 'job_applications'), 'none') as result
union all
select 'read rules still open to anyone (expect 0)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)')
union all
select 'site_settings — its rules now',
       coalesce((select string_agg(policyname || ' (' || cmd || ')', ', ' order by cmd)
                   from pg_policies where schemaname = 'public' and tablename = 'site_settings'), 'no table')
union all
select 'site_settings — columns (no values shown)',
       coalesce((select string_agg(column_name, ', ' order by ordinal_position)
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'site_settings'), 'no table')
union all
select 'site_settings — rows',
       coalesce((select (xpath('/row/n/text()',
                   query_to_xml('select count(*) as n from public.site_settings', false, true, '')))[1]::text
                 where to_regclass('public.site_settings') is not null), 'no table');
