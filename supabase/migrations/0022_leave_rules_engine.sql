-- Round 2 of the attendance brief — the rules engine.
-- Late ladder, half days, paid leave by the month, pay-out or carry forward.
--
-- Run once in the Supabase SQL editor, after 0021. Safe to re-run.
--
-- Every rule below was settled by Adarsh on 2026-09-16, asked against
-- public/metrol-media-terms-and-conditions.pdf rather than guessed
-- (ATTENDANCE-PAYROLL-PLAN.md carries the answers):
--
--   • Lates 1–4 in a month are free. EVERY late after the 4th is a half day.
--   • A half day costs 0.5 paid leave. With no balance left, it is unpaid.
--   • 2 paid leaves a month. Approved sick/casual leave spends them; leave
--     that is only pending spends nothing.
--   • Absent with no approved leave = 1 day's salary. Paid leave untouched.
--   • At month end HR records pay-out or carry-forward. Pay-out pays EVERY
--     unused day and the balance goes back to 0; carry-forward starts next
--     month at what is left plus the new 2.
--   • Probation, same-day leave and period leave (T&C 3.9 / 3.10 / 3.7) are
--     HR's to manage: each is a setting, OFF by default.
--
-- What is stored and what is not: a month that is still running is WORKED
-- OUT every time it is asked for, from attendance, approved leave, holidays
-- and the settings — so a correction HR makes today shows up immediately and
-- nothing needs reconciling. Only a CLOSED month is written down
-- (public.leave_months), because that is the moment money is decided and the
-- numbers must stop moving.

-- ============================================ 1. the numbers — all of them HR's

alter table public.attendance_settings
  -- Lates 1..N in a month cost nothing; every late after the Nth is a half day.
  add column if not exists free_lates_per_month   int          not null default 4
    check (free_lates_per_month between 0 and 31),
  add column if not exists paid_leave_per_month   numeric(4,1) not null default 2
    check (paid_leave_per_month between 0 and 31),
  -- T&C 3.9. 0 = off. N = no paid leave for the joining month and the N-1
  -- months after it.
  add column if not exists probation_months       int          not null default 0
    check (probation_months between 0 and 24),
  -- T&C 3.10. When on, HR's approval screen defaults a request filed on the
  -- day itself to unpaid, and HR can keep it paid for a genuine emergency.
  add column if not exists same_day_leave_unpaid  boolean      not null default false,
  -- T&C 3.7. 0 = off. Period leave up to this many days a month is paid and
  -- does not touch the balance; anything beyond it is ordinary paid leave.
  add column if not exists period_leave_per_month int          not null default 0
    check (period_leave_per_month between 0 and 5),
  -- The first month the ledger counts. Nothing before it is judged by these
  -- rules, and nobody arrives at it with a balance from before.
  add column if not exists leave_rules_start      date         not null default date '2026-09-01'
    check (extract(day from leave_rules_start) = 1);

-- ============================================ 2. period leave is a type

alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check
  check (leave_type in ('sick','casual','unpaid','period'));

-- ============================================ 3. a closed month, written down

create table if not exists public.leave_months (
  employee_id        uuid not null references public.employees(id) on delete cascade,
  month              date not null check (extract(day from month) = 1),

  opening            numeric(5,1) not null default 0,  -- carried in from last month
  accrued            numeric(5,1) not null default 0,  -- this month's new paid leave

  leave_days         numeric(5,1) not null default 0,  -- approved sick/casual days
  half_days          int          not null default 0,  -- graded short days + late half days
  late_count         int          not null default 0,  -- every late arrival
  late_half_days     int          not null default 0,  -- the lates past the free ones
  period_days        numeric(5,1) not null default 0,
  period_paid        numeric(5,1) not null default 0,  -- the part the period allowance covered

  used               numeric(5,1) not null default 0,  -- taken out of the balance
  unpaid_overflow    numeric(5,1) not null default 0,  -- wanted paid, balance ran out
  unpaid_leave_days  numeric(5,1) not null default 0,  -- approved as unpaid
  absent_days        int          not null default 0,  -- no approved leave: salary
  unsettled_days     int          not null default 0,  -- always 0 once closed (see close)

  closing            numeric(5,1) not null default 0,  -- left over, before the choice
  choice             text not null check (choice in ('payout','carry')),
  payout_days        numeric(5,1) not null default 0,
  carried            numeric(5,1) not null default 0,

  -- The settings in force when the month was closed. HR changing a number in
  -- March must not leave nobody able to explain what January was judged by.
  rules              jsonb not null default '{}'::jsonb,

  closed_by          uuid references public.profiles(id) on delete set null,
  closed_at          timestamptz not null default now(),

  primary key (employee_id, month)
);

create index if not exists leave_months_month_idx on public.leave_months (month);

alter table public.leave_months enable row level security;

-- READ — owner and HR see everybody; a person sees their own months.
drop policy if exists leave_months_select on public.leave_months;
create policy leave_months_select on public.leave_months for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- WRITE — nobody, directly. close_leave_month() below is the only way in, the
-- same shape as attendance and punch_in(): a hand-made REST call cannot write
-- itself a closed month with a balance nobody earned.
revoke all on public.leave_months from anon;
revoke insert, update, delete on public.leave_months from authenticated;

-- ============================================ 4. one person's month, worked out
--
-- The day-by-day order is the employee's own calendar screen's order exactly
-- (lib/attendance.ts buildCalendar), so the grid somebody looks at and the
-- number they are paid on cannot disagree:
--
--   a real attendance row → a holiday → a week off → approved leave
--   → a day not over yet (nothing) → absent
--
-- A late arrival is a late arrival whatever the day turned into, so it is
-- numbered (L1, L2…) on every row with late_minutes > 0. A late past the free
-- ones turns a full day into a half day; a day that was ALREADY a half day or
-- an absence costs nothing extra — a day cannot cost more than itself.

create or replace function public.leave_month_summary(
  p_employee uuid,
  p_month    date,
  p_live     boolean default false   -- ignore a closed row; close_leave_month uses this
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

  -- Opening: what last month carried. If last month is not closed yet, what it
  -- WOULD carry — and the answer says so, because HR may still pay it out.
  if m_start > origin then
    prev := public.leave_month_summary(p_employee, (m_start - interval '1 month')::date);
    if coalesce((prev->>'closed')::boolean, false) then
      opening := (prev->>'carried')::numeric;
    else
      opening := (prev->>'closing')::numeric;
      provisional := true;
    end if;
  end if;

  -- Accrual. The joining month counts as month one of probation.
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
        -- HR marked it on the register. The type is the approved request's,
        -- when one covers the day; a bare "on leave" is ordinary paid leave.
        select l.leave_type into lt from public.leave_requests l
         where l.employee_id = p_employee and l.status = 'approved' and d between l.start_date and l.end_date
         order by l.created_at desc limit 1;
        lt := coalesce(lt, 'casual');
        if lt = 'unpaid' then unpaid_lv := unpaid_lv + 1;
        elsif lt = 'period' then period_days := period_days + 1;
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
      else leave_days := leave_days + 1;
      end if;
      continue;
    end if;

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

-- ============================================ 5. every person's month, for HR

create or replace function public.leave_month_board(p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (public.is_owner() or public.is_hr()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.leave_month_summary(x.id, m_start)
                     || jsonb_build_object('full_name', x.full_name, 'employee_code', x.employee_code)
                     order by x.full_name)
      from public.employees x
     where x.date_of_joining <= m_end
       and (x.last_working_day is null or x.last_working_day >= m_start)
       and (x.status <> 'resigned' or x.last_working_day is not null)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.leave_month_board(date) from public, anon;
grant execute on function public.leave_month_board(date) to authenticated;

-- ============================================ 6. closing a month
--
-- In order, or not at all: a month starts from what the one before it carried,
-- so January must be closed before February, and a month whose NEXT month is
-- already closed cannot be changed underneath it. Re-closing an open-ended
-- month is allowed — that is how a correction HR made afterwards lands.
--
-- A day somebody never punched out of has no cost yet (a full day? half?), so
-- a month with one is refused until HR settles it on the attendance screen.
-- Paying on a guess is exactly what this whole module exists to stop.

create or replace function public.close_leave_month(p_employee uuid, p_month date, p_choice text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s       record;
  e       record;
  m_start date := date_trunc('month', p_month)::date;
  origin  date;
  today   date;
  sm      jsonb;
  payout  numeric;
  carry   numeric;
begin
  if not (public.is_owner() or public.is_hr()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'message', 'Only HR or the owner can close a month.');
  end if;
  if p_choice is null or p_choice not in ('payout','carry') then
    return jsonb_build_object('ok', false, 'reason', 'bad_choice',
      'message', 'Choose pay-out or carry forward.');
  end if;

  select * into s from public.attendance_settings where id;
  select id, full_name, date_of_joining into e from public.employees where id = p_employee;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_employee', 'message', 'No such employee.');
  end if;

  today  := (now() at time zone s.timezone)::date;
  origin := greatest(s.leave_rules_start, date_trunc('month', e.date_of_joining)::date);

  if (m_start + interval '1 month')::date > today then
    return jsonb_build_object('ok', false, 'reason', 'not_ended',
      'message', 'A month can only be closed once it is over.');
  end if;
  if m_start < origin then
    return jsonb_build_object('ok', false, 'reason', 'not_counted',
      'message', format('%s is before leave was counted for %s.', to_char(m_start, 'Mon YYYY'), e.full_name));
  end if;
  if m_start > origin and not exists (
       select 1 from public.leave_months
        where employee_id = p_employee and month = (m_start - interval '1 month')::date) then
    return jsonb_build_object('ok', false, 'reason', 'previous_open',
      'message', format('Close %s first — this month starts from what that one carried.',
                        to_char(m_start - interval '1 month', 'Mon YYYY')));
  end if;
  if exists (
       select 1 from public.leave_months
        where employee_id = p_employee and month = (m_start + interval '1 month')::date) then
    return jsonb_build_object('ok', false, 'reason', 'next_closed',
      'message', format('%s is already closed, and it started from this month. It cannot change underneath it.',
                        to_char(m_start + interval '1 month', 'Mon YYYY')));
  end if;

  sm := public.leave_month_summary(p_employee, m_start, true);
  if not coalesce((sm->>'ok')::boolean, false) then
    return sm;
  end if;
  if (sm->>'unsettled_days')::int > 0 then
    return jsonb_build_object('ok', false, 'reason', 'unsettled',
      'message', format('%s has %s day(s) with no punch-out in %s. Settle them on the attendance screen first.',
                        e.full_name, sm->>'unsettled_days', to_char(m_start, 'Mon YYYY')));
  end if;

  payout := case when p_choice = 'payout' then (sm->>'closing')::numeric else 0 end;
  carry  := case when p_choice = 'carry'  then (sm->>'closing')::numeric else 0 end;

  insert into public.leave_months as lm (
    employee_id, month, opening, accrued, leave_days, half_days, late_count, late_half_days,
    period_days, period_paid, used, unpaid_overflow, unpaid_leave_days, absent_days, unsettled_days,
    closing, choice, payout_days, carried, rules, closed_by, closed_at
  ) values (
    p_employee, m_start,
    (sm->>'opening')::numeric, (sm->>'accrued')::numeric,
    (sm->>'leave_days')::numeric, (sm->>'half_days')::int,
    (sm->>'late_count')::int, (sm->>'late_half_days')::int,
    (sm->>'period_days')::numeric, (sm->>'period_paid')::numeric,
    (sm->>'used')::numeric, (sm->>'unpaid_overflow')::numeric, (sm->>'unpaid_leave_days')::numeric,
    (sm->>'absent_days')::int, 0,
    (sm->>'closing')::numeric, p_choice, payout, carry,
    sm->'rules', auth.uid(), now()
  )
  on conflict (employee_id, month) do update set
    opening = excluded.opening, accrued = excluded.accrued,
    leave_days = excluded.leave_days, half_days = excluded.half_days,
    late_count = excluded.late_count, late_half_days = excluded.late_half_days,
    period_days = excluded.period_days, period_paid = excluded.period_paid,
    used = excluded.used, unpaid_overflow = excluded.unpaid_overflow,
    unpaid_leave_days = excluded.unpaid_leave_days, absent_days = excluded.absent_days,
    unsettled_days = 0, closing = excluded.closing, choice = excluded.choice,
    payout_days = excluded.payout_days, carried = excluded.carried,
    rules = excluded.rules, closed_by = excluded.closed_by, closed_at = excluded.closed_at;

  return public.leave_month_summary(p_employee, m_start);
end;
$$;

revoke all on function public.close_leave_month(uuid, date, text) from public, anon;
grant execute on function public.close_leave_month(uuid, date, text) to authenticated;

-- ============================================ 7. proof

select 'rules columns on attendance_settings (must be 6)' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'attendance_settings'
   and column_name in ('free_lates_per_month','paid_leave_per_month','probation_months',
                       'same_day_leave_unpaid','period_leave_per_month','leave_rules_start')
union all
select 'period is a leave type', (pg_get_constraintdef(oid) like '%period%')::text
  from pg_constraint where conname = 'leave_requests_type_check'
union all
select 'leave_months rls enabled', relrowsecurity::text
  from pg_class where oid = 'public.leave_months'::regclass
union all
select 'leave_months write policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'leave_months' and cmd <> 'SELECT'
union all
select 'authenticated can insert leave_months (must be false)',
       has_table_privilege('authenticated', 'public.leave_months', 'insert')::text
union all
select 'the three functions exist (must be 3)', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('leave_month_summary','leave_month_board','close_leave_month')
union all
select 'current settings', format('free lates %s · paid leave %s/month · probation %s · same-day unpaid %s · period %s · counting from %s',
       free_lates_per_month, paid_leave_per_month, probation_months, same_day_leave_unpaid,
       period_leave_per_month, to_char(leave_rules_start, 'Mon YYYY'))
  from public.attendance_settings where id;
