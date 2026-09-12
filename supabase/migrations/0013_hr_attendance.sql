-- HR module — Phase 6: attendance. Punch in, punch out, and the geofence.
-- Run once in the Supabase SQL editor, after 0012. Schema and RLS ship in one
-- file, same as every HR migration before it.
--
-- The whole point of this table is that it replaces a paper register somebody
-- can sign on a friend's behalf. So two rules drive every decision below:
--
--   1. AN EMPLOYEE NEVER WRITES TO public.attendance. Not one policy allows
--      it. The only way in is punch_in() / punch_out(), which are security
--      definer — they run with the table's own rights, check where the phone
--      says it is, and write the row themselves. A employee who calls the REST
--      API directly with a hand-made row gets rejected by RLS, not by the UI.
--   2. THE TIME COMES FROM THE DATABASE, never from the phone. now() inside
--      the function. Changing the clock on the handset does nothing.
--
-- What this CANNOT do, stated plainly because the client should know: a web
-- page asks the browser for a location, and a determined person can lie to the
-- browser (desktop devtools, a mock-location app on a rooted Android). The
-- defences here are the honest ones — the accuracy filter below rejects the
-- coarse network-derived fix a laptop or a spoofer usually produces, every
-- punch stores its raw coordinates, accuracy and computed distance for HR to
-- look at, and the row says whether it came from the employee or from HR. A
-- truly spoof-proof punch needs a native app with device attestation, or a
-- fixed device at the door. Not a browser.

-- ============================================ 1. the settings, one row only
--
-- id is a boolean that can only ever be true, so a second settings row is
-- impossible — cleaner than a nullable singleton the app has to defend.

create table if not exists public.attendance_settings (
  id                  boolean primary key default true check (id),

  -- HR stands in the office and saves their current position. Null until they
  -- do, and punching is refused until then rather than silently allowing
  -- everybody through from anywhere.
  office_label        text    not null default 'Head office',
  office_lat          numeric(9,6),
  office_lng          numeric(9,6),
  radius_meters       int     not null default 50  check (radius_meters between 10 and 5000),

  -- 7 minutes past the shift start is not late. Beyond it, it is.
  grace_minutes       int     not null default 7   check (grace_minutes between 0 and 120),
  -- A full day. 9 hours.
  required_minutes    int     not null default 540 check (required_minutes between 60 and 1440),
  -- Below this, the day is not a half day either.
  half_day_minutes    int     not null default 270 check (half_day_minutes between 30 and 1440),

  -- A GPS fix that says "somewhere within 2km" is not evidence of being at the
  -- desk. It is also what a laptop on wifi and most spoofers report. Reject it
  -- and ask the person to step outside or turn on precise location.
  max_accuracy_meters int     not null default 100 check (max_accuracy_meters between 20 and 2000),

  -- Which day of the week is off: 0 = Sunday … 6 = Saturday.
  week_offs           smallint[] not null default '{0}',

  -- Attendance is a local-calendar idea, and this server is not in India.
  timezone            text    not null default 'Asia/Kolkata',

  updated_by          uuid references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);

insert into public.attendance_settings (id) values (true) on conflict (id) do nothing;

-- ============================================ 2. the three shifts

create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_at  time not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.shifts (name, starts_at, sort_order) values
  ('Shift 1', '09:30', 1),
  ('Shift 2', '10:00', 2),
  ('Shift 3', '10:30', 3)
on conflict (name) do nothing;

-- Which shift a person is on. Null means "not scheduled yet" — they can still
-- punch, and the day is recorded, but nothing is judged late.
alter table public.employees
  add column if not exists shift_id uuid references public.shifts(id) on delete set null;

-- ============================================ 3. holidays
--
-- Only ever read to decide whether a missing day is an absence or simply a day
-- nobody was expected. Nothing in this phase writes attendance rows for them.

create table if not exists public.holidays (
  holiday_date date primary key,
  name         text not null,
  created_at   timestamptz not null default now()
);

-- ============================================ 4. the attendance row
--
-- One row per person per working day. The unique constraint is what stops a
-- double punch-in creating two half-days.

create table if not exists public.attendance (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.employees(id) on delete cascade,
  work_date           date not null,

  -- Snapshotted at punch-in. If HR moves somebody to a later shift next month,
  -- last month's lateness must not silently rewrite itself.
  shift_id            uuid references public.shifts(id) on delete set null,
  shift_start         time,

  punch_in_at         timestamptz,
  punch_in_lat        numeric(9,6),
  punch_in_lng        numeric(9,6),
  punch_in_accuracy   numeric(7,1),
  punch_in_distance_m numeric(8,1),

  punch_out_at        timestamptz,
  punch_out_lat       numeric(9,6),
  punch_out_lng       numeric(9,6),
  punch_out_accuracy  numeric(7,1),
  punch_out_distance_m numeric(8,1),

  worked_minutes      int  not null default 0,
  late_minutes        int  not null default 0,

  -- in_progress  — punched in, still at work
  -- present      — full hours, on time
  -- late         — full hours, arrived after the grace period
  -- half_day     — short of the full day but past the half-day floor
  -- absent       — punched in and left almost immediately
  -- missing_punch_out — a past day still open; only HR can settle it
  -- on_leave / holiday / week_off — written by HR, never by a punch
  status              text not null default 'in_progress'
                        check (status in ('in_progress','present','late','half_day',
                                          'absent','missing_punch_out','on_leave',
                                          'holiday','week_off')),

  -- 'self' came through the geofence. 'hr' was typed by a human.
  source              text not null default 'self' check (source in ('self','hr')),
  edited_by           uuid references public.profiles(id) on delete set null,
  edit_reason         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (employee_id, work_date)
);

create index if not exists attendance_employee_idx on public.attendance (employee_id, work_date desc);
create index if not exists attendance_date_idx     on public.attendance (work_date desc);
create index if not exists attendance_status_idx   on public.attendance (status);

-- ============================================ 5. the edit trail
--
-- HR can change a time. That is a feature — somebody punches out at lunch by
-- mistake and the day has to be fixed. It is also exactly the power that makes
-- attendance data worth doubting, so every change keeps its before and after.

create table if not exists public.attendance_edits (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  edited_by     uuid references public.profiles(id) on delete set null,
  edited_at     timestamptz not null default now(),
  before_row    jsonb not null,
  after_row     jsonb not null,
  reason        text
);

create index if not exists attendance_edits_row_idx on public.attendance_edits (attendance_id, edited_at desc);

-- ============================================ 6. distance, without an extension
--
-- earthdistance/postgis would do this, but they are an extension to enable on
-- a project somebody else administers. Haversine in plain SQL is exact enough
-- for a 50 metre fence and has no install step.

create or replace function public.meters_between(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable as $$
  select round((
    6371000 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      )
    )
  )::numeric, 1)
$$;

-- ============================================ 7. how a day is judged
--
-- One function, used by punch_out AND by HR's manual correction, so a day that
-- HR fixed is graded by exactly the same rule as one nobody touched.

create or replace function public.grade_attendance(
  p_shift_start time,
  p_punch_in    timestamptz,
  p_punch_out   timestamptz
) returns table (worked_minutes int, late_minutes int, status text)
language plpgsql stable set search_path = public as $$
declare
  s record;
  local_in  timestamp;
  worked int := 0;
  late   int := 0;
begin
  select * into s from public.attendance_settings where id;

  if p_punch_in is null then
    return query select 0, 0, 'absent'::text; return;
  end if;

  if p_shift_start is not null then
    local_in := p_punch_in at time zone s.timezone;
    late := greatest(0, ceil(extract(epoch from (local_in::time - p_shift_start)) / 60)::int - s.grace_minutes);
    -- Inside the grace period is not late at all, so the counter stays at zero
    -- rather than recording "2 minutes late" on a day nobody considers late.
  end if;

  if p_punch_out is null then
    return query select 0, late, 'in_progress'::text; return;
  end if;

  worked := greatest(0, floor(extract(epoch from (p_punch_out - p_punch_in)) / 60)::int);

  if worked >= s.required_minutes then
    return query select worked, late, case when late > 0 then 'late' else 'present' end;
  elsif worked >= s.half_day_minutes then
    return query select worked, late, 'half_day'::text;
  else
    return query select worked, late, 'absent'::text;
  end if;
end;
$$;

-- ============================================ 8. punching in
--
-- Returns jsonb rather than raising, because every refusal here is a normal
-- thing to tell somebody standing in a doorway — too far, no fix, already in —
-- and an exception would reach the browser as an opaque 500.

create or replace function public.punch_in(
  p_lat numeric, p_lng numeric, p_accuracy numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s   record;
  emp record;
  dist numeric;
  today date;
  existing public.attendance;
  shift_start time;
  g record;
begin
  select * into s from public.attendance_settings where id;
  if s.office_lat is null or s.office_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_office',
      'message', 'HR has not set the office location yet.');
  end if;

  select e.*, sh.starts_at as shift_starts_at
    into emp
    from public.employees e
    left join public.shifts sh on sh.id = e.shift_id
   where e.profile_id = auth.uid()
   limit 1;

  if emp.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_employee',
      'message', 'No employee record is linked to this login. Ask HR.');
  end if;
  if emp.status <> 'active' and emp.status <> 'notice' then
    return jsonb_build_object('ok', false, 'reason', 'not_active',
      'message', 'This employee record is not active.');
  end if;

  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_location',
      'message', 'Location is switched off. Turn it on and try again.');
  end if;
  if p_accuracy is not null and p_accuracy > s.max_accuracy_meters then
    return jsonb_build_object('ok', false, 'reason', 'weak_fix', 'accuracy', p_accuracy,
      'message', format('Your location is only accurate to about %s m. Step outside or turn on precise location.', round(p_accuracy)));
  end if;

  dist := public.meters_between(p_lat, p_lng, s.office_lat, s.office_lng);
  if dist > s.radius_meters then
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'distance', dist,
      'radius', s.radius_meters,
      'message', format('You are about %s m from %s. You have to be within %s m.',
                        round(dist), s.office_label, s.radius_meters));
  end if;

  today := (now() at time zone s.timezone)::date;

  select * into existing from public.attendance
   where employee_id = emp.id and work_date = today;

  if existing.id is not null and existing.punch_in_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in',
      'punched_in_at', existing.punch_in_at,
      'message', 'You are already punched in for today.');
  end if;

  shift_start := emp.shift_starts_at;
  select * into g from public.grade_attendance(shift_start, now(), null);

  insert into public.attendance as a (
    employee_id, work_date, shift_id, shift_start,
    punch_in_at, punch_in_lat, punch_in_lng, punch_in_accuracy, punch_in_distance_m,
    late_minutes, status, source
  ) values (
    emp.id, today, emp.shift_id, shift_start,
    now(), p_lat, p_lng, p_accuracy, dist,
    g.late_minutes, 'in_progress', 'self'
  )
  on conflict (employee_id, work_date) do update set
    punch_in_at = excluded.punch_in_at,
    punch_in_lat = excluded.punch_in_lat,
    punch_in_lng = excluded.punch_in_lng,
    punch_in_accuracy = excluded.punch_in_accuracy,
    punch_in_distance_m = excluded.punch_in_distance_m,
    shift_id = excluded.shift_id,
    shift_start = excluded.shift_start,
    late_minutes = excluded.late_minutes,
    status = 'in_progress',
    updated_at = now()
  returning * into existing;

  return jsonb_build_object(
    'ok', true, 'action', 'punch_in',
    'at', existing.punch_in_at, 'distance', dist,
    'late_minutes', existing.late_minutes,
    'message', case when existing.late_minutes > 0
                 then format('Punched in. %s minutes past the grace period.', existing.late_minutes)
                 else 'Punched in. Have a good day.' end
  );
end;
$$;

-- ============================================ 9. punching out

create or replace function public.punch_out(
  p_lat numeric, p_lng numeric, p_accuracy numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s   record;
  emp_id uuid;
  dist numeric;
  today date;
  row_a public.attendance;
  g record;
begin
  select * into s from public.attendance_settings where id;
  if s.office_lat is null or s.office_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_office',
      'message', 'HR has not set the office location yet.');
  end if;

  emp_id := public.my_employee_id();
  if emp_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_employee',
      'message', 'No employee record is linked to this login. Ask HR.');
  end if;

  today := (now() at time zone s.timezone)::date;
  select * into row_a from public.attendance where employee_id = emp_id and work_date = today;

  if row_a.id is null or row_a.punch_in_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in',
      'message', 'You have not punched in today.');
  end if;
  if row_a.punch_out_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_out',
      'punched_out_at', row_a.punch_out_at,
      'message', 'You already punched out today. Ask HR if that was a mistake.');
  end if;

  -- The fence applies on the way out too. Leaving the building and punching
  -- out from the bus would otherwise make the last hour of the day unverifiable.
  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_location',
      'message', 'Location is switched off. Turn it on and try again.');
  end if;
  if p_accuracy is not null and p_accuracy > s.max_accuracy_meters then
    return jsonb_build_object('ok', false, 'reason', 'weak_fix', 'accuracy', p_accuracy,
      'message', format('Your location is only accurate to about %s m. Step outside or turn on precise location.', round(p_accuracy)));
  end if;

  dist := public.meters_between(p_lat, p_lng, s.office_lat, s.office_lng);
  if dist > s.radius_meters then
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'distance', dist,
      'radius', s.radius_meters,
      'message', format('You are about %s m from %s. Punch out from inside the office.',
                        round(dist), s.office_label));
  end if;

  select * into g from public.grade_attendance(row_a.shift_start, row_a.punch_in_at, now());

  update public.attendance set
    punch_out_at = now(),
    punch_out_lat = p_lat,
    punch_out_lng = p_lng,
    punch_out_accuracy = p_accuracy,
    punch_out_distance_m = dist,
    worked_minutes = g.worked_minutes,
    late_minutes = g.late_minutes,
    status = g.status,
    updated_at = now()
  where id = row_a.id
  returning * into row_a;

  return jsonb_build_object(
    'ok', true, 'action', 'punch_out',
    'at', row_a.punch_out_at,
    'worked_minutes', row_a.worked_minutes,
    'late_minutes', row_a.late_minutes,
    'status', row_a.status,
    'message', case row_a.status
      when 'present'  then 'Punched out. Full day recorded.'
      when 'late'     then 'Punched out. Full hours, but marked late.'
      when 'half_day' then format('Punched out after %s h %s m — short of a full day.',
                                  row_a.worked_minutes / 60, row_a.worked_minutes % 60)
      else 'Punched out.' end
  );
end;
$$;

-- ============================================ 10. days left open
--
-- Somebody walks out without punching out. The row would sit at 'in_progress'
-- for ever and quietly count as neither present nor absent. This marks every
-- past open day for HR to settle, and is called when the HR screen loads
-- rather than needing a scheduled job on a free plan.

create or replace function public.finalize_open_attendance()
returns int
language plpgsql security definer set search_path = public as $$
declare
  s record; n int;
begin
  if not (public.is_owner() or public.is_hr()) then
    return 0;
  end if;
  select * into s from public.attendance_settings where id;
  update public.attendance
     set status = 'missing_punch_out', updated_at = now()
   where status = 'in_progress'
     and work_date < (now() at time zone s.timezone)::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ============================================ 11. HR's correction, graded the same
--
-- When HR changes a time, the derived fields are recomputed from that time —
-- HR cannot leave 9 hours on a row that now reads 20 minutes. When HR changes
-- the STATUS itself in the same update (marking a day 'on_leave', say), that
-- choice is kept. Both paths are written to attendance_edits.

create or replace function public.attendance_regrade()
returns trigger language plpgsql set search_path = public as $$
declare g record;
begin
  if new.status is not distinct from old.status
     and (new.punch_in_at is distinct from old.punch_in_at
          or new.punch_out_at is distinct from old.punch_out_at
          or new.shift_start is distinct from old.shift_start) then
    select * into g from public.grade_attendance(new.shift_start, new.punch_in_at, new.punch_out_at);
    new.worked_minutes := g.worked_minutes;
    new.late_minutes   := g.late_minutes;
    new.status         := g.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_regrade on public.attendance;
create trigger attendance_regrade
  before update on public.attendance
  for each row execute function public.attendance_regrade();

create or replace function public.attendance_log_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null from the SQL editor; a row written by the punch
  -- functions is not an edit and never reaches here with a changed shape.
  if auth.uid() is not null and (public.is_owner() or public.is_hr()) then
    insert into public.attendance_edits (attendance_id, edited_by, before_row, after_row, reason)
    values (new.id, auth.uid(), to_jsonb(old), to_jsonb(new), new.edit_reason);
  end if;
  return null;
end;
$$;

drop trigger if exists attendance_log_edit on public.attendance;
create trigger attendance_log_edit
  after update on public.attendance
  for each row execute function public.attendance_log_edit();

drop trigger if exists attendance_settings_touch on public.attendance_settings;
create or replace function public.touch_attendance_settings()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end;
$$;
create trigger attendance_settings_touch
  before update on public.attendance_settings
  for each row execute function public.touch_attendance_settings();

-- ============================================ 12. row-level security

alter table public.attendance           enable row level security;
alter table public.attendance_settings  enable row level security;
alter table public.attendance_edits     enable row level security;
alter table public.shifts               enable row level security;
alter table public.holidays             enable row level security;

-- attendance — READ: owner and HR see everyone; everybody else sees only their
-- own days. A team lead deliberately does NOT get their department's
-- attendance here; nobody asked for it, and it is one policy to add later.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- attendance — WRITE: HR and the owner only. This is the geofence. An employee
-- has no insert policy and no update policy, so the ONLY way their own row can
-- appear is punch_in() / punch_out(), which check the distance first.
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete on public.attendance from anon, authenticated;

-- settings — everyone reads (the punch screen shows the office and the radius);
-- only HR and the owner change it.
drop policy if exists attendance_settings_select on public.attendance_settings;
create policy attendance_settings_select on public.attendance_settings for select using ( true );

drop policy if exists attendance_settings_update on public.attendance_settings;
create policy attendance_settings_update on public.attendance_settings for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

revoke delete, insert on public.attendance_settings from anon, authenticated;

-- the edit trail — HR and owner read it. Nobody writes it by hand; the trigger
-- is security definer and does not need a policy.
drop policy if exists attendance_edits_select on public.attendance_edits;
create policy attendance_edits_select on public.attendance_edits for select
  using ( public.is_owner() or public.is_hr() );

revoke insert, update, delete on public.attendance_edits from anon, authenticated;

-- shifts and holidays — read by all (the punch screen names your shift),
-- written by HR and the owner.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select using ( true );
drop policy if exists shifts_write on public.shifts;
create policy shifts_write on public.shifts for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays for select using ( true );
drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- ============================================ 13. who may call the functions

revoke all on function public.punch_in(numeric, numeric, numeric)  from public, anon;
revoke all on function public.punch_out(numeric, numeric, numeric) from public, anon;
revoke all on function public.finalize_open_attendance()           from public, anon;
grant execute on function public.punch_in(numeric, numeric, numeric)  to authenticated;
grant execute on function public.punch_out(numeric, numeric, numeric) to authenticated;
grant execute on function public.finalize_open_attendance()           to authenticated;

-- ============================================ 14. realtime
--
-- So HR's "in the office right now" list fills in as people arrive, without a
-- refresh, the same way leads do.

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.attendance'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 15. proof

select 'rls on attendance' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.attendance'::regclass
union all
select 'attendance policies', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'attendance'
union all
select 'write policies open to employees (must be 0)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'attendance'
   and cmd in ('INSERT','UPDATE','ALL')
   and coalesce(with_check, qual, '') not like '%is_owner%'
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'attendance' and cmd = 'DELETE'
union all
select 'shifts seeded', count(*)::text from public.shifts
union all
select 'settings row', count(*)::text from public.attendance_settings
union all
select 'shift_id column on employees', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees' and column_name = 'shift_id'
union all
select 'distance sanity (must be ~111)', public.meters_between(0,0,0.001,0)::text;
