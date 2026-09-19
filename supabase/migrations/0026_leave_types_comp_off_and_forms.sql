-- Round 6 of the attendance brief — Adarsh's 2026-09-19 voice brief, in order:
--
--   1. Leave types collapse to three: Casual (default), Compulsory/Week-off
--      (earned by working a week-off day, e.g. Sunday), and Period (paid,
--      female employees only, at most one a month). Sick and Unpaid stay in
--      the database (old rows still read correctly) but are no longer
--      offered on the request form.
--   2. The joining application form gets three more optional-or-required
--      uploads: a signature, and (only when the applicant has previous
--      employment) an experience letter and a salary slip.
--   3. `employees` needs a `gender` column — nothing stored it before this —
--      so Period leave can be offered to female employees automatically
--      instead of being one blanket HR switch.
--
-- Run once in the Supabase SQL editor, after 0025. Safe to re-run.

-- ============================================ 1. gender lives on employees now
--
-- job_applications already asks for it (0020); employees never carried it
-- through, which is why Period leave has been one company-wide switch rather
-- than "offer it to the people the T&C (3.7) actually means." The Edge
-- Function (approve-job-application) is updated separately to copy it across
-- on approval — existing employees are simply null until HR fills this in.

alter table public.employees
  add column if not exists gender text;

-- ============================================ 2. a third leave type

alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check
  check (leave_type in ('sick','casual','unpaid','period','compulsory'));

-- ============================================ 3. comp-off credits
--
-- Working a week-off day (Sunday, by default) earns one credit. Spending one
-- is a Compulsory/Week-off leave request — checked at the point of asking
-- (trigger 5 below refuses a request beyond the balance) and settled at the
-- point of approval (trigger 6 marks the oldest unused credits as spent, and
-- gives them back if the approval is ever undone). Kept as its own table,
-- deliberately outside leave_months/leave_month_summary: this balance never
-- touches the paid-leave balance or costs a day's salary, so it does not
-- belong inside a function that computes exactly those two things.

create table if not exists public.comp_off_credits (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references public.employees(id) on delete cascade,
  -- The week-off date actually worked. One credit per date, so punching in
  -- and out twice on one Sunday (impossible today, but not worth relying on)
  -- still earns exactly one.
  earned_date           date not null,
  used                  boolean not null default false,
  used_in_leave_request uuid references public.leave_requests(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (employee_id, earned_date)
);

create index if not exists comp_off_credits_emp_idx on public.comp_off_credits (employee_id, used);

alter table public.comp_off_credits enable row level security;

drop policy if exists comp_off_credits_select on public.comp_off_credits;
create policy comp_off_credits_select on public.comp_off_credits for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- WRITE — nobody, directly. The trigger below (security definer, same shape
-- as attendance and leave) is the only way a row appears or changes.
revoke all on public.comp_off_credits from anon;
revoke insert, update, delete on public.comp_off_credits from authenticated;

create or replace function public.comp_off_balance(p_employee uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.comp_off_credits
   where employee_id = p_employee and used = false
$$;

revoke all on function public.comp_off_balance(uuid) from public, anon;
grant execute on function public.comp_off_balance(uuid) to authenticated;

-- A day's attendance row lands as present/late/half_day on a week-off day only
-- when somebody actually punched in and it graded as worked — buildCalendar
-- and leave_month_summary already treat a real row as always winning over the
-- week-off default, so "there is a row here, and it graded as work" IS "they
-- came in on their day off." Trigger rather than a nightly job: the balance
-- must be right the moment HR looks at it, not the next morning.
create or replace function public.credit_comp_off()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  if new.status not in ('present','late','half_day') then
    return new;
  end if;
  select week_offs into s from public.attendance_settings where id;
  if s.week_offs is null or not (extract(dow from new.work_date)::smallint = any (s.week_offs)) then
    return new;
  end if;
  insert into public.comp_off_credits (employee_id, earned_date)
  values (new.employee_id, new.work_date)
  on conflict (employee_id, earned_date) do nothing;
  return new;
end;
$$;

drop trigger if exists attendance_credit_comp_off on public.attendance;
create trigger attendance_credit_comp_off
  after insert or update of status on public.attendance
  for each row execute function public.credit_comp_off();

-- ============================================ 4. requesting compulsory or period leave

-- Refused at the point of ASKING, not only at approval, so the request form
-- can show an honest balance and a person is never left with a pending
-- request HR can never actually grant:
--   • Compulsory/week-off — cannot ask for more days than comp_off_balance().
--   • Period — female employees only, and at most one PER CALENDAR MONTH
--     (any status except rejected/cancelled counts, so a pending one already
--     blocks a second).
create or replace function public.check_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  bal   int;
  emp   record;
  dupe  int;
begin
  if new.leave_type = 'compulsory' then
    bal := public.comp_off_balance(new.employee_id);
    if new.days_count > bal then
      raise exception 'Not enough compulsory/week-off leave earned: % day(s) requested, % available.', new.days_count, bal;
    end if;
  elsif new.leave_type = 'period' then
    select gender into emp from public.employees where id = new.employee_id;
    if emp.gender is distinct from 'Female' then
      raise exception 'Period leave is only available to female employees.';
    end if;
    select count(*) into dupe from public.leave_requests
     where employee_id = new.employee_id and leave_type = 'period'
       and status not in ('rejected','cancelled')
       and date_trunc('month', start_date) = date_trunc('month', new.start_date)
       and id is distinct from new.id;
    if dupe > 0 then
      raise exception 'A period leave request already exists for this month.';
    end if;
  end if;
  return new;
end;
$$;

-- AFTER the days_count trigger (0016's leave_requests_set_days), which is
-- named earlier alphabetically and therefore fires first on the same event —
-- this one needs the real days_count, not the client's guess.
drop trigger if exists leave_requests_check on public.leave_requests;
create trigger leave_requests_check
  before insert or update of leave_type, start_date, end_date on public.leave_requests
  for each row execute function public.check_leave_request();

-- ============================================ 5. spending and returning comp-off credits on approval

create or replace function public.settle_comp_off_on_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Just approved a compulsory/week-off request: mark the oldest unused
  -- credits as spent, oldest first — the same "spend what you earned
  -- earliest" order a person would expect.
  if new.leave_type = 'compulsory' and new.status = 'approved' and old.status is distinct from 'approved' then
    update public.comp_off_credits set used = true, used_in_leave_request = new.id
     where id in (
       select id from public.comp_off_credits
        where employee_id = new.employee_id and used = false
        order by earned_date asc
        limit new.days_count
     );
  -- An approval undone (HR corrects a mistake, or a cancel reaches an
  -- already-approved row) hands the credits back.
  elsif new.leave_type = 'compulsory' and old.status = 'approved' and new.status is distinct from 'approved' then
    update public.comp_off_credits set used = false, used_in_leave_request = null
     where used_in_leave_request = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_settle_comp_off on public.leave_requests;
create trigger leave_requests_settle_comp_off
  after update of status on public.leave_requests
  for each row execute function public.settle_comp_off_on_decision();

-- ============================================ 6. leave_month_summary learns the new type
--
-- Compulsory/week-off leave is fully paid and never touches the paid-leave
-- balance — the request could not have been approved beyond what was earned
-- (section 4 above), so by the time it is approved it costs nothing further.
-- It is counted and returned (compulsory_days) purely for display, the same
-- way period_days already is. Everything else in this function is unchanged
-- from 0022.

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

-- ============================================ 7. the application form's three new uploads

alter table public.job_applications
  add column if not exists signature_path         text,
  add column if not exists experience_letter_path  text,
  add column if not exists salary_slip_path        text;

alter table public.employee_documents drop constraint if exists employee_documents_doc_type_check;
alter table public.employee_documents add constraint employee_documents_doc_type_check
  check (doc_type in ('pan','aadhaar','bank_proof','photo','resume','signature','experience_letter','salary_slip','other'));

-- ============================================ 8. proof

select 'employees.gender column' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees' and column_name = 'gender'
union all
select 'compulsory is a leave type', (pg_get_constraintdef(oid) like '%compulsory%')::text
  from pg_constraint where conname = 'leave_requests_type_check'
union all
select 'comp_off_credits rls enabled', relrowsecurity::text
  from pg_class where oid = 'public.comp_off_credits'::regclass
union all
select 'authenticated cannot write comp_off_credits directly (must be false)',
       has_table_privilege('authenticated', 'public.comp_off_credits', 'insert')::text
union all
select 'four new functions exist (must be 4)', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('comp_off_balance','credit_comp_off','check_leave_request','settle_comp_off_on_decision')
union all
select 'job_applications new upload columns (must be 3)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'job_applications'
   and column_name in ('signature_path','experience_letter_path','salary_slip_path')
union all
select 'employee_documents accepts the new doc types', (pg_get_constraintdef(oid) like '%signature%')::text
  from pg_constraint where conname = 'employee_documents_doc_type_check'
union all
select 'comp-off credits on record', count(*)::text from public.comp_off_credits
union all
select 'employees with gender set', count(*)::text from public.employees where gender is not null;
