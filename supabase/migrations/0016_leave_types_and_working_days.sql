-- HR Phase 7 — finishing leave: a leave type, and a day count that stops
-- charging people for Sundays and holidays.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Two decisions Adarsh made on 2026-09-12, recorded here because the schema
-- is shaped by them:
--   • HR (and the owner) approve leave. NOT a line manager — so there is no
--     approver_id column and no per-request approval routing. 0009's policies
--     already say exactly this and are left alone.
--   • Sick and casual draw from ONE shared entitlement
--     (employees.annual_leave_days), and unpaid does not touch it at all.
--     That is a reading of the data, not a column: nothing here stores a
--     balance, so there is nothing to reconcile when a request changes.

-- ============================================ 1. what kind of leave
--
-- Defaulted rather than nullable, and defaulted to 'casual' rather than to
-- nothing, so the ~zero existing rows and any future insert that forgets the
-- field both land on the ordinary case instead of on a null nobody renders.
alter table public.leave_requests
  add column if not exists leave_type text not null default 'casual';

do $$
begin
  alter table public.leave_requests
    add constraint leave_requests_type_check
    check (leave_type in ('sick','casual','unpaid'));
exception when duplicate_object then null;
end $$;

create index if not exists leave_requests_type_idx on public.leave_requests (leave_type);

-- ============================================ 2. what counts as a working day
--
-- Sunday is the only week off (attendance_settings.week_offs, '{0}'), and a
-- holiday is a row in public.holidays. Friday to Monday is therefore 2 working
-- days, not 4, and nobody is charged for the day the office was shut.
--
-- security definer deliberately. Both tables it reads are select-true today,
-- so it does not NEED it — but if either policy is ever tightened, the count
-- must not silently start treating holidays as working days. A leave balance
-- that is quietly wrong is worse than one that errors.
--
-- It lives in the database, not in the page, for the same reason the geofence
-- does: the client tells us two dates and nothing else, so a hand-made request
-- cannot inflate or shrink its own day count.
create or replace function public.working_days_between(p_start date, p_end date)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') g(d)
   where extract(dow from g.d)::smallint <> all (
           coalesce((select week_offs from public.attendance_settings where id), '{0}'::smallint[]))
     and not exists (select 1 from public.holidays h where h.holiday_date = g.d::date)
$$;

-- The trigger below runs as whoever inserted the request, which is usually an
-- ordinary employee asking for their own leave — so they need to be able to
-- call this. anon never should: nobody files leave without signing in.
revoke all on function public.working_days_between(date, date) from public, anon;
grant execute on function public.working_days_between(date, date) to authenticated;

-- ============================================ 3. the trigger changes meaning
--
-- 0009 counted inclusive CALENDAR days. This counts working days. Same column,
-- same "never trusted from the client" rule, different arithmetic.
create or replace function public.set_leave_days_count()
returns trigger language plpgsql set search_path = public as $$
begin
  new.days_count := public.working_days_between(new.start_date, new.end_date);
  return new;
end;
$$;

-- The trigger itself is unchanged from 0009 (before insert or update of the
-- two dates); re-created here only so a database that somehow has the columns
-- without the trigger ends up correct either way.
drop trigger if exists leave_requests_set_days on public.leave_requests;
create trigger leave_requests_set_days
  before insert or update of start_date, end_date on public.leave_requests
  for each row execute function public.set_leave_days_count();

-- ============================================ 4. recount what is already there
--
-- Every existing row was counted the old way, so a Friday-to-Monday request
-- says 4 and the new rule says 2. Leaving them alone would mean two different
-- arithmetics inside one balance. Recounted in place — this CHANGES historical
-- day counts, which is the point, and is why it is written down here.
--
-- days_count is set directly rather than by touching the dates: the trigger
-- fires on update OF start_date/end_date, so a plain days_count update is not
-- overwritten by it.
update public.leave_requests
   set days_count = public.working_days_between(start_date, end_date)
 where days_count is distinct from public.working_days_between(start_date, end_date);

-- ============================================ 5. holidays are about to get a UI
--
-- The table has existed since 0013 with no way to put anything in it, which
-- would make "excluding holidays" hollow. HrPage grows a small add/remove list
-- this phase. The policies it needs (holidays_select true, holidays_write
-- owner-or-HR) are already in 0013 — nothing to add, but DELETE has to be
-- possible here, unlike everywhere else in this module: a holiday entered on
-- the wrong date is a typo, not a fact of somebody's employment history.
--
-- Stated rather than assumed:
select 'holidays delete privilege for authenticated' as check,
       has_table_privilege('authenticated', 'public.holidays', 'delete')::text as result;

-- ============================================ 6. proof

select 'leave_type column' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'leave_type'
union all
select 'leave_type constraint', count(*)::text
  from pg_constraint where conname = 'leave_requests_type_check'
union all
select 'working_days_between exists', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'working_days_between'
union all
-- Mon-to-Fri, no Sunday in it: 5 in, 5 out. Both of these read 1 lower per
-- holiday already entered in that week, which is the feature working.
select 'Mon 14 Sep → Fri 18 Sep 2026 = 5 working days',
       public.working_days_between(date '2026-09-14', date '2026-09-18')::text
union all
-- Fri, Sat, Sun, Mon. Sunday drops out; SATURDAY DOES NOT — Sunday is the only
-- week off, so 4 calendar days is 3 working days.
select 'Fri 11 Sep → Mon 14 Sep 2026 = 3 working days (Sunday out, Saturday in)',
       public.working_days_between(date '2026-09-11', date '2026-09-14')::text
union all
select 'Sun 13 Sep 2026 alone = 0 working days',
       public.working_days_between(date '2026-09-13', date '2026-09-13')::text
union all
select 'holidays on record', count(*)::text from public.holidays
union all
select 'leave requests recounted', count(*)::text from public.leave_requests;
