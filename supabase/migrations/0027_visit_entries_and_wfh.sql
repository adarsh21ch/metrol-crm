-- Round 7 of the attendance brief — Adarsh's 2026-09-21 voice brief:
--
--   Some departments' work happens away from the office — a shoot, a client
--   meeting, a branch visit. That should never read as Absent; it is a
--   present-kind-of-day, applied for and approved exactly like leave, but it
--   must not touch the paid-leave balance (leave and a client visit are not
--   the same kind of day off). Same shape again for Work From Home.
--
-- Run once in the Supabase SQL editor, after 0026. Safe to re-run.
--
-- Two decisions this file encodes:
--   • Neither table lives inside leave_requests. A visit or a WFH day is not
--     a leave TYPE — it does not spend annual_leave_days, is not subject to
--     Period's gender/once-a-month rule or Compulsory's comp-off balance, and
--     carries fields (a purpose, a detail, a visit type) leave has no use
--     for. Two small tables, not one wide one with half its columns null
--     depending on the row.
--   • Approval is HR/owner only, same as leave (0016's own note: "HR (and
--     the owner) approve leave. NOT a line manager"). employees.reporting_to
--     already exists and is shown on the record, but nothing here gates
--     approval on it — Adarsh's own words, "by default reporting person is
--     HR as of now." Routing approval TO reporting_to is a real follow-up,
--     not built here.

-- ============================================ 1. the purpose dropdown

-- HR's own list, editable without a deploy — "shoot", "client meeting",
-- "branch visit" today, more or fewer tomorrow. is_active rather than a hard
-- delete for the same reason nothing else in this module deletes: an old
-- visit_entries row must keep reading its original purpose's name even after
-- HR retires it from the dropdown.
create table if not exists public.visit_purposes (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.visit_purposes enable row level security;

drop policy if exists visit_purposes_select on public.visit_purposes;
create policy visit_purposes_select on public.visit_purposes for select using ( true );

drop policy if exists visit_purposes_write on public.visit_purposes;
create policy visit_purposes_write on public.visit_purposes for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

insert into public.visit_purposes (label, sort_order)
select v.label, v.sort_order
  from (values ('Shoot', 1), ('Client meeting', 2), ('Branch visit', 3)) as v(label, sort_order)
 where not exists (select 1 from public.visit_purposes);

-- ============================================ 2. the visit entry request

create table if not exists public.visit_entries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  purpose_id    uuid references public.visit_purposes(id) on delete set null,
  -- Free text beside the purpose — which client, which branch, where the
  -- shoot is. Adarsh's own words: "they have to name on which client" /
  -- "which branch" / "where you are going to shoot". Not required at the
  -- database: a purpose HR adds later may not need one.
  detail        text not null default '',

  visit_type    text not null default 'full_day'
                  check (visit_type in ('full_day','half_day','custom')),
  start_date    date not null,
  end_date      date not null,
  -- Working days, same rule leave uses (0016) — a half day is always 0.5
  -- regardless of what that counts to, set by the trigger below.
  days_count    numeric(4,1) not null default 0,

  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','cancelled')),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (end_date >= start_date)
);

create index if not exists visit_entries_employee_idx on public.visit_entries (employee_id);
create index if not exists visit_entries_status_idx   on public.visit_entries (status);

-- full_day and half_day are always a single date — the form only ever shows
-- one date field for them; custom is the multi-day range. Forcing end_date
-- here rather than trusting the client keeps a stray custom-shaped payload
-- from sneaking a range in under a type that promises one day.
create or replace function public.set_visit_days_count()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.visit_type in ('full_day','half_day') then
    new.end_date := new.start_date;
  end if;
  new.days_count := public.working_days_between(new.start_date, new.end_date);
  if new.visit_type = 'half_day' and new.days_count > 0 then
    new.days_count := 0.5;
  end if;
  return new;
end;
$$;

drop trigger if exists visit_entries_set_days on public.visit_entries;
create trigger visit_entries_set_days
  before insert or update of start_date, end_date, visit_type on public.visit_entries
  for each row execute function public.set_visit_days_count();

drop trigger if exists visit_entries_touch on public.visit_entries;
create trigger visit_entries_touch
  before update on public.visit_entries
  for each row execute function public.touch_updated_at();

alter table public.visit_entries enable row level security;

drop policy if exists visit_entries_select on public.visit_entries;
create policy visit_entries_select on public.visit_entries for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

drop policy if exists visit_entries_insert on public.visit_entries;
create policy visit_entries_insert on public.visit_entries for insert
  with check (
    public.is_owner() or public.is_hr()
    or (
      employee_id = public.my_employee_id()
      and status = 'pending' and decided_by is null and decided_at is null
    )
  );

drop policy if exists visit_entries_update_hr on public.visit_entries;
create policy visit_entries_update_hr on public.visit_entries for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists visit_entries_update_self_cancel on public.visit_entries;
create policy visit_entries_update_self_cancel on public.visit_entries for update
  using ( employee_id = public.my_employee_id() and status = 'pending' )
  with check (
    employee_id = public.my_employee_id() and status = 'cancelled'
    and decided_by is null and decided_at is null
  );

revoke delete on public.visit_entries from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.visit_entries'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 3. the work-from-home request

create table if not exists public.wfh_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  days_count    int  not null default 0,
  reason        text not null default '',

  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','cancelled')),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (end_date >= start_date)
);

create index if not exists wfh_requests_employee_idx on public.wfh_requests (employee_id);
create index if not exists wfh_requests_status_idx   on public.wfh_requests (status);

create or replace function public.set_wfh_days_count()
returns trigger language plpgsql set search_path = public as $$
begin
  new.days_count := public.working_days_between(new.start_date, new.end_date);
  return new;
end;
$$;

drop trigger if exists wfh_requests_set_days on public.wfh_requests;
create trigger wfh_requests_set_days
  before insert or update of start_date, end_date on public.wfh_requests
  for each row execute function public.set_wfh_days_count();

drop trigger if exists wfh_requests_touch on public.wfh_requests;
create trigger wfh_requests_touch
  before update on public.wfh_requests
  for each row execute function public.touch_updated_at();

alter table public.wfh_requests enable row level security;

drop policy if exists wfh_requests_select on public.wfh_requests;
create policy wfh_requests_select on public.wfh_requests for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

drop policy if exists wfh_requests_insert on public.wfh_requests;
create policy wfh_requests_insert on public.wfh_requests for insert
  with check (
    public.is_owner() or public.is_hr()
    or (
      employee_id = public.my_employee_id()
      and status = 'pending' and decided_by is null and decided_at is null
    )
  );

drop policy if exists wfh_requests_update_hr on public.wfh_requests;
create policy wfh_requests_update_hr on public.wfh_requests for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists wfh_requests_update_self_cancel on public.wfh_requests;
create policy wfh_requests_update_self_cancel on public.wfh_requests for update
  using ( employee_id = public.my_employee_id() and status = 'pending' )
  with check (
    employee_id = public.my_employee_id() and status = 'cancelled'
    and decided_by is null and decided_at is null
  );

revoke delete on public.wfh_requests from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.wfh_requests'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ 4. leave_month_summary learns to skip both

-- Exactly where a holiday and a week-off already sit in this function's
-- day-by-day walk (0022): a day with no attendance row that an APPROVED
-- visit entry or WFH request covers is skipped entirely — not absent, not
-- unpaid, not a leave day, not touching the balance. Everything else in this
-- function is unchanged from 0026.
create or replace function public.leave_month_summary(
  p_employee uuid,
  p_month    date,
  p_live     boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s           record;
  e           record;
  lm          public.leave_months%rowtype;
  r           public.attendance%rowtype;
  m_start     date := date_trunc('month', p_month)::date;
  m_end       date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  origin      date;
  today       date;
  d           date;
  lt          text;
  is_late     boolean;
  prev        jsonb;
  provisional boolean := false;
  opening     numeric := 0;
  accrued     numeric := 0;
  leave_days  numeric := 0;
  half_days   int := 0;
  late_count  int := 0;
  late_half   int := 0;
  period_days numeric := 0;
  period_paid numeric := 0;
  compulsory_days numeric := 0;
  unpaid_lv   numeric := 0;
  absent_days int := 0;
  unsettled   int := 0;
  demand      numeric;
  available   numeric;
  used        numeric;
  overflow    numeric;
  closing     numeric;
  last_choice text;
begin
  if not (public.is_owner() or public.is_hr() or p_employee = public.my_employee_id()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'You can only see your own leave.');
  end if;

  select * into s from public.attendance_settings where id;
  select id, date_of_joining, last_working_day into e
    from public.employees where id = p_employee;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_employee', 'message', 'No such employee.');
  end if;

  today  := (now() at time zone s.timezone)::date;
  origin := greatest(s.leave_rules_start, date_trunc('month', e.date_of_joining)::date);

  if m_start < origin or m_start > date_trunc('month', coalesce(e.last_working_day, m_start))::date then
    return jsonb_build_object('ok', true, 'counted', false, 'closed', false,
      'employee_id', p_employee, 'month', m_start);
  end if;

  if not p_live then
    select * into lm from public.leave_months where employee_id = p_employee and month = m_start;
    if found then
      return to_jsonb(lm) || jsonb_build_object(
        'ok', true, 'counted', true, 'closed', true, 'provisional', false,
        'ended', m_end < today,
        'available', lm.opening + lm.accrued,
        'unpaid_days', lm.absent_days + lm.unpaid_leave_days + lm.unpaid_overflow,
        'suggested_choice', lm.choice);
    end if;
  end if;

  if m_start > origin then
    prev := public.leave_month_summary(p_employee, (m_start - interval '1 month')::date);
    if coalesce((prev->>'closed')::boolean, false) then
      opening := (prev->>'carried')::numeric;
    else
      opening := (prev->>'closing')::numeric;
      provisional := true;
    end if;
  end if;

  if m_start >= (date_trunc('month', e.date_of_joining) + make_interval(months => s.probation_months))::date then
    accrued := s.paid_leave_per_month;
  end if;

  for d in
    select g::date from generate_series(greatest(m_start, e.date_of_joining),
                                        least(m_end, coalesce(e.last_working_day, m_end)),
                                        interval '1 day') g
  loop
    select * into r from public.attendance a where a.employee_id = p_employee and a.work_date = d;

    if found then
      is_late := r.punch_in_at is not null and r.late_minutes > 0
                 and r.status in ('present','late','half_day','absent','in_progress','missing_punch_out');
      if is_late then late_count := late_count + 1; end if;

      if r.status = 'half_day' then
        half_days := half_days + 1;
      elsif r.status = 'absent' then
        absent_days := absent_days + 1;
      elsif r.status = 'missing_punch_out' or (r.status = 'in_progress' and d < today) then
        unsettled := unsettled + 1;
      elsif r.status = 'on_leave' then
        select l.leave_type into lt from public.leave_requests l
         where l.employee_id = p_employee and l.status = 'approved' and d between l.start_date and l.end_date
         order by l.created_at desc limit 1;
        lt := coalesce(lt, 'casual');
        if lt = 'unpaid' then unpaid_lv := unpaid_lv + 1;
        elsif lt = 'period' then period_days := period_days + 1;
        elsif lt = 'compulsory' then compulsory_days := compulsory_days + 1;
        else leave_days := leave_days + 1;
        end if;
      end if;

      if is_late and late_count > s.free_lates_per_month
         and r.status in ('present','late','in_progress','missing_punch_out') then
        late_half := late_half + 1;
        half_days := half_days + 1;
      end if;
      continue;
    end if;

    continue when exists (select 1 from public.holidays h where h.holiday_date = d);
    continue when extract(dow from d)::smallint = any (s.week_offs);

    lt := null;
    select l.leave_type into lt from public.leave_requests l
     where l.employee_id = p_employee and l.status = 'approved' and d between l.start_date and l.end_date
     order by l.created_at desc limit 1;
    if lt is not null then
      if lt = 'unpaid' then unpaid_lv := unpaid_lv + 1;
      elsif lt = 'period' then period_days := period_days + 1;
      elsif lt = 'compulsory' then compulsory_days := compulsory_days + 1;
      else leave_days := leave_days + 1;
      end if;
      continue;
    end if;

    -- New this round: an approved visit entry or WFH request covering this
    -- day is a present-kind-of-day, exactly like a holiday above — skipped
    -- before it can ever reach the absent count below.
    continue when exists (
      select 1 from public.visit_entries v
       where v.employee_id = p_employee and v.status = 'approved'
         and d between v.start_date and v.end_date
    );
    continue when exists (
      select 1 from public.wfh_requests w
       where w.employee_id = p_employee and w.status = 'approved'
         and d between w.start_date and w.end_date
    );

    continue when d >= today;
    absent_days := absent_days + 1;
  end loop;

  period_paid := least(period_days, s.period_leave_per_month);
  demand    := leave_days + half_days * 0.5 + (period_days - period_paid);
  available := opening + accrued;
  used      := least(demand, available);
  overflow  := demand - used;
  closing   := available - used;

  select m.choice into last_choice from public.leave_months m
   where m.employee_id = p_employee and m.month < m_start
   order by m.month desc limit 1;

  return jsonb_build_object(
    'ok', true, 'counted', true, 'closed', false, 'provisional', provisional,
    'ended', m_end < today,
    'employee_id', p_employee, 'month', m_start,
    'opening', opening, 'accrued', accrued, 'available', available,
    'leave_days', leave_days, 'half_days', half_days,
    'late_count', late_count, 'late_half_days', late_half,
    'period_days', period_days, 'period_paid', period_paid,
    'compulsory_days', compulsory_days,
    'used', used, 'unpaid_overflow', overflow, 'unpaid_leave_days', unpaid_lv,
    'absent_days', absent_days, 'unsettled_days', unsettled,
    'closing', closing, 'unpaid_days', absent_days + unpaid_lv + overflow,
    'choice', null, 'payout_days', null, 'carried', null,
    'suggested_choice', coalesce(last_choice, 'payout'),
    'rules', jsonb_build_object(
      'free_lates_per_month', s.free_lates_per_month,
      'paid_leave_per_month', s.paid_leave_per_month,
      'probation_months', s.probation_months,
      'period_leave_per_month', s.period_leave_per_month,
      'grace_minutes', s.grace_minutes,
      'required_minutes', s.required_minutes,
      'half_day_minutes', s.half_day_minutes));
end;
$$;

revoke all on function public.leave_month_summary(uuid, date, boolean) from public, anon;
grant execute on function public.leave_month_summary(uuid, date, boolean) to authenticated;

-- ============================================ 5. proof

select 'rls enabled: visit_purposes' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.visit_purposes'::regclass
union all
select 'rls enabled: visit_entries', relrowsecurity::text
  from pg_class where oid = 'public.visit_entries'::regclass
union all
select 'rls enabled: wfh_requests', relrowsecurity::text
  from pg_class where oid = 'public.wfh_requests'::regclass
union all
select 'seeded purposes', count(*)::text from public.visit_purposes
union all
select 'delete policies on visit_entries (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'visit_entries' and cmd = 'DELETE'
union all
select 'delete policies on wfh_requests (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'wfh_requests' and cmd = 'DELETE';
