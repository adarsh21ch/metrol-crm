-- ===========================================================================
-- METROL CRM — ATTENDANCE, BRANCHES AND QR. RUN THIS WHOLE FILE, ONCE.
--
-- Paste all of it into the Supabase SQL editor and press Run. It is migrations
-- 0013, 0014 and 0015 in the right order, which is what went wrong running them
-- one at a time — 0014 needs the tables 0013 creates.
--
-- Safe to run more than once: every table is "create if not exists", every
-- function is "create or replace", every policy is dropped before it is made.
--
-- What it installs:
--   • attendance — one row per person per day, with the geofence in the
--     database rather than in the page
--   • office_locations — a row per branch, each with its own coordinates and
--     its own radius. A third branch later is one row, not a migration
--   • shifts — 09:30 / 10:00 / 10:30, assigned per employee
--   • QR punch — one printed code per branch, and the phone still has to be
--     standing at that branch for a scan to count
--   • employee IDs as four random digits instead of MM-001, MM-002
--
-- The last result you see is the proof list from the final section. Read it.
-- ===========================================================================


-- ############ PART 1 of 3 — attendance ############

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

-- ############ PART 2 of 3 — branches ############

-- HR module — Phase 6b: branches. Metrol has two offices, and will have three.
-- Run once in the Supabase SQL editor, AFTER 0013.
--
-- 0013 put one office in a settings row, because there was one office. That was
-- the wrong shape the moment a second one existed, so the location moves OUT of
-- attendance_settings and into a table with a row per branch. What stays in
-- settings is what is true company-wide — the grace period, the length of a
-- full day, the accuracy filter — because none of that changes between Noida
-- Sector 6 and Noida Sector 10.
--
-- Adding the third branch later is then one INSERT from the Branches screen,
-- with no migration and no code change. Moving somebody between branches is one
-- dropdown on their employee record.

-- ============================================ 1. the branches

create table if not exists public.office_locations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  -- Free text for the human address. Nothing computes with it; it is what HR
  -- reads to be sure they picked the right branch.
  address       text not null default '',

  -- NOT NULL, unlike the old settings columns. A branch with no coordinates
  -- cannot be punched at, so a half-made branch must not be able to exist —
  -- HR captures the location in the same step that creates it.
  lat           numeric(9,6) not null,
  lng           numeric(9,6) not null,

  -- Per branch, not company-wide: a small office off a main road and a floor in
  -- a tower do not deserve the same fence.
  radius_meters int not null default 50 check (radius_meters between 10 and 5000),

  is_active     boolean not null default true,
  sort_order    int not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null
);

drop trigger if exists office_locations_touch on public.office_locations;
create trigger office_locations_touch
  before update on public.office_locations
  for each row execute function public.touch_updated_at();

-- ============================================ 2. carry the old office over
--
-- If 0013 was already run and HR had saved a location, it becomes the first
-- branch rather than being lost. If it was never set, nothing is invented —
-- HR creates both branches from the screen.

do $$
declare s record;
begin
  select * into s from public.attendance_settings where id;
  if s.office_lat is not null and s.office_lng is not null
     and not exists (select 1 from public.office_locations) then
    insert into public.office_locations (name, lat, lng, radius_meters, sort_order)
    values (coalesce(nullif(s.office_label, ''), 'Head office'), s.office_lat, s.office_lng,
            coalesce(s.radius_meters, 50), 1);
  end if;
end $$;

-- ============================================ 3. who works where

alter table public.employees
  add column if not exists office_id uuid references public.office_locations(id) on delete set null;

-- If exactly one branch exists at this point, everybody already on the books
-- belongs to it. With two, the assignment is HR's to make and this does nothing.
do $$
declare only_one uuid;
begin
  if (select count(*) from public.office_locations) = 1 then
    select id into only_one from public.office_locations;
    update public.employees set office_id = only_one where office_id is null;
  end if;
end $$;

-- ============================================ 4. where a punch actually happened
--
-- Snapshotted on the row, not looked up through the employee, for the same
-- reason shift_start is: somebody transferred to another branch next month must
-- not silently rewrite where they stood last Tuesday. It also records the case
-- the client asked for — a person from Sector 6 spending the day at Sector 10.

alter table public.attendance
  add column if not exists office_id uuid references public.office_locations(id) on delete set null;

-- ============================================ 5. settings: what is still global

alter table public.attendance_settings
  -- Somebody from Sector 6 who turns up at Sector 10 can punch there, and the
  -- row records which branch it was. Switch this off and a punch is only ever
  -- accepted at the branch that person is assigned to.
  add column if not exists allow_any_branch boolean not null default true;

-- The office now lives in office_locations. Leaving these columns behind would
-- give a location two homes and guarantee they disagree within a month.
alter table public.attendance_settings
  drop column if exists office_lat,
  drop column if exists office_lng,
  drop column if exists office_label,
  drop column if exists radius_meters;

-- ============================================ 6. which branch is a person at
--
-- One function, so punch_in and punch_out can never disagree about it. Returns
-- the branch a punch should be measured against and how far away it is: the
-- assigned one when they are inside it, otherwise the nearest branch they are
-- actually inside, otherwise the assigned one (so the refusal message can say
-- how far from their OWN office they are, which is the useful number).

create or replace function public.resolve_punch_office(
  p_employee uuid, p_lat numeric, p_lng numeric
) returns table (office_id uuid, office_name text, distance numeric, radius int, inside boolean)
language plpgsql stable set search_path = public as $$
declare
  allow_any boolean;
  assigned  uuid;
  r record;
begin
  select s.allow_any_branch into allow_any from public.attendance_settings s where s.id;
  select e.office_id into assigned from public.employees e where e.id = p_employee;

  -- 1. their own branch, if they are standing in it
  for r in
    select o.id, o.name, public.meters_between(p_lat, p_lng, o.lat, o.lng) as d, o.radius_meters
      from public.office_locations o
     where o.id = assigned and o.is_active
  loop
    if r.d <= r.radius_meters then
      return query select r.id, r.name, r.d, r.radius_meters, true; return;
    end if;
  end loop;

  -- 2. any other branch they are standing in, when that is allowed
  if coalesce(allow_any, true) then
    for r in
      select o.id, o.name, public.meters_between(p_lat, p_lng, o.lat, o.lng) as d, o.radius_meters
        from public.office_locations o
       where o.is_active
       order by 3 asc
       limit 1
    loop
      if r.d <= r.radius_meters then
        return query select r.id, r.name, r.d, r.radius_meters, true; return;
      end if;
    end loop;
  end if;

  -- 3. nowhere. Report against their own branch if they have one, else the
  --    nearest, so the message can name a distance that means something.
  return query
    select o.id, o.name, public.meters_between(p_lat, p_lng, o.lat, o.lng), o.radius_meters, false
      from public.office_locations o
     where o.is_active
     order by (o.id is distinct from assigned), public.meters_between(p_lat, p_lng, o.lat, o.lng)
     limit 1;
end;
$$;

-- ============================================ 7. punching in, branch-aware

create or replace function public.punch_in(
  p_lat numeric, p_lng numeric, p_accuracy numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s   record;
  emp record;
  loc record;
  today date;
  existing public.attendance;
  shift_start time;
  g record;
begin
  select * into s from public.attendance_settings where id;

  if not exists (select 1 from public.office_locations where is_active) then
    return jsonb_build_object('ok', false, 'reason', 'no_office',
      'message', 'HR has not added an office location yet.');
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
  if emp.status not in ('active', 'notice') then
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

  select * into loc from public.resolve_punch_office(emp.id, p_lat, p_lng);

  if not loc.inside then
    return jsonb_build_object('ok', false, 'reason', 'too_far',
      'distance', loc.distance, 'radius', loc.radius, 'office', loc.office_name,
      'message', format('You are about %s m from %s. You have to be within %s m of an office.',
                        round(loc.distance), loc.office_name, loc.radius));
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
    employee_id, work_date, shift_id, shift_start, office_id,
    punch_in_at, punch_in_lat, punch_in_lng, punch_in_accuracy, punch_in_distance_m,
    late_minutes, status, source
  ) values (
    emp.id, today, emp.shift_id, shift_start, loc.office_id,
    now(), p_lat, p_lng, p_accuracy, loc.distance,
    g.late_minutes, 'in_progress', 'self'
  )
  on conflict (employee_id, work_date) do update set
    punch_in_at = excluded.punch_in_at,
    punch_in_lat = excluded.punch_in_lat,
    punch_in_lng = excluded.punch_in_lng,
    punch_in_accuracy = excluded.punch_in_accuracy,
    punch_in_distance_m = excluded.punch_in_distance_m,
    office_id = excluded.office_id,
    shift_id = excluded.shift_id,
    shift_start = excluded.shift_start,
    late_minutes = excluded.late_minutes,
    status = 'in_progress',
    updated_at = now()
  returning * into existing;

  return jsonb_build_object(
    'ok', true, 'action', 'punch_in',
    'at', existing.punch_in_at, 'distance', loc.distance, 'office', loc.office_name,
    'late_minutes', existing.late_minutes,
    'message', case
      when emp.office_id is distinct from loc.office_id
        -- Said out loud rather than recorded quietly: somebody punching in at
        -- the other branch should know the day will show it.
        then format('Punched in at %s — not your usual branch. It is recorded that way.', loc.office_name)
      when existing.late_minutes > 0
        then format('Punched in at %s. %s minutes past the grace period.', loc.office_name, existing.late_minutes)
      else format('Punched in at %s. Have a good day.', loc.office_name) end
  );
end;
$$;

-- ============================================ 8. punching out, branch-aware

create or replace function public.punch_out(
  p_lat numeric, p_lng numeric, p_accuracy numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s   record;
  emp_id uuid;
  loc record;
  today date;
  row_a public.attendance;
  g record;
begin
  select * into s from public.attendance_settings where id;

  if not exists (select 1 from public.office_locations where is_active) then
    return jsonb_build_object('ok', false, 'reason', 'no_office',
      'message', 'HR has not added an office location yet.');
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

  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_location',
      'message', 'Location is switched off. Turn it on and try again.');
  end if;
  if p_accuracy is not null and p_accuracy > s.max_accuracy_meters then
    return jsonb_build_object('ok', false, 'reason', 'weak_fix', 'accuracy', p_accuracy,
      'message', format('Your location is only accurate to about %s m. Step outside or turn on precise location.', round(p_accuracy)));
  end if;

  select * into loc from public.resolve_punch_office(emp_id, p_lat, p_lng);

  if not loc.inside then
    return jsonb_build_object('ok', false, 'reason', 'too_far',
      'distance', loc.distance, 'radius', loc.radius, 'office', loc.office_name,
      'message', format('You are about %s m from %s. Punch out from inside the office.',
                        round(loc.distance), loc.office_name));
  end if;

  select * into g from public.grade_attendance(row_a.shift_start, row_a.punch_in_at, now());

  update public.attendance set
    punch_out_at = now(),
    punch_out_lat = p_lat,
    punch_out_lng = p_lng,
    punch_out_accuracy = p_accuracy,
    punch_out_distance_m = loc.distance,
    worked_minutes = g.worked_minutes,
    late_minutes = g.late_minutes,
    status = g.status,
    updated_at = now()
  where id = row_a.id
  returning * into row_a;

  return jsonb_build_object(
    'ok', true, 'action', 'punch_out',
    'at', row_a.punch_out_at, 'office', loc.office_name,
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

-- ============================================ 9. row-level security

alter table public.office_locations enable row level security;

-- READ — everybody. A person's punch screen names their branch, and the app
-- has to be able to say "you are 300 m from Sector 6". There is nothing
-- sensitive in an office address.
drop policy if exists office_locations_select on public.office_locations;
create policy office_locations_select on public.office_locations for select using ( true );

-- WRITE — HR and the owner. This is the same power as moving the fence, so it
-- is the same two people.
drop policy if exists office_locations_write on public.office_locations;
create policy office_locations_write on public.office_locations for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- A branch is never deleted once anybody has punched at it — the attendance
-- rows point here, and history must not lose where it happened. Closing one is
-- is_active = false.
revoke delete on public.office_locations from anon, authenticated;

revoke all on function public.resolve_punch_office(uuid, numeric, numeric) from public, anon;
grant execute on function public.resolve_punch_office(uuid, numeric, numeric) to authenticated;

-- ============================================ 10. proof

select 'office_locations exists' as check, count(*)::text as result
  from information_schema.tables where table_schema = 'public' and table_name = 'office_locations'
union all
select 'branches on record', count(*)::text from public.office_locations
union all
select 'rls on office_locations', relrowsecurity::text
  from pg_class where oid = 'public.office_locations'::regclass
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'office_locations' and cmd = 'DELETE'
union all
select 'employees.office_id column', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees' and column_name = 'office_id'
union all
select 'attendance.office_id column', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'attendance' and column_name = 'office_id'
union all
select 'old office columns removed (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'attendance_settings'
   and column_name in ('office_lat','office_lng','office_label','radius_meters')
union all
select 'employees with no branch yet', count(*)::text
  from public.employees where office_id is null and status <> 'resigned';

-- ############ PART 3 of 3 — QR and employee IDs ############

-- HR module — Phase 6c: the QR punch, and employee IDs that are not a sequence.
-- Run once, AFTER 0014.
--
-- TWO WAYS TO PUNCH, one record. HR prints a QR for each branch and sticks it
-- on the attendance desk; somebody opens the app, scans it, and the day opens.
-- Scanning again on the way out closes it. The button stays exactly as it is —
-- Adarsh's call is that both exist and HR decides which one the office uses,
-- and the row records which method it was either way.
--
-- THE QR IS NOT THE SECURITY. Anybody can photograph a printed code. What makes
-- it worth anything is that punch_by_qr() checks the phone's distance to THAT
-- branch exactly like the button does — a photographed code scanned from home
-- is refused for being 8 km away. The QR's job is to say WHICH office, quickly,
-- without the app guessing; the geofence still says whether you are in it.
--
-- If a printout does leak, HR rotates the token from the Branches screen and
-- every photocopy of the old one stops working.

-- ============================================ 1. a code per branch

alter table public.office_locations
  add column if not exists qr_token uuid not null default gen_random_uuid(),
  add column if not exists qr_rotated_at timestamptz not null default now();

create unique index if not exists office_locations_qr_token_idx on public.office_locations (qr_token);

-- ============================================ 2. how a punch was made

alter table public.attendance
  add column if not exists punch_in_method  text not null default 'button'
    check (punch_in_method  in ('button','qr','hr')),
  add column if not exists punch_out_method text not null default 'button'
    check (punch_out_method in ('button','qr','hr'));

-- ============================================ 3. scanning
--
-- One function for both directions, because that is how it is used: the same
-- poster, scanned twice a day. No row yet means arriving; an open row means
-- leaving. It never guesses a third meaning — a day already closed says so.

create or replace function public.punch_by_qr(
  p_token uuid, p_lat numeric, p_lng numeric, p_accuracy numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s    record;
  emp  record;
  off  record;
  dist numeric;
  today date;
  row_a public.attendance;
  g record;
begin
  select * into s from public.attendance_settings where id;

  select * into off from public.office_locations where qr_token = p_token and is_active;
  if off.id is null then
    -- Covers both a code for a branch that has been closed and an old printout
    -- whose token has since been rotated. Same advice either way.
    return jsonb_build_object('ok', false, 'reason', 'bad_code',
      'message', 'This QR code is not in use any more. Ask HR for the current one.');
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
  if emp.status not in ('active', 'notice') then
    return jsonb_build_object('ok', false, 'reason', 'not_active',
      'message', 'This employee record is not active.');
  end if;

  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'no_location',
      'message', 'Location is switched off. Turn it on and scan again.');
  end if;
  if p_accuracy is not null and p_accuracy > s.max_accuracy_meters then
    return jsonb_build_object('ok', false, 'reason', 'weak_fix', 'accuracy', p_accuracy,
      'message', format('Your location is only accurate to about %s m. Turn on precise location and scan again.', round(p_accuracy)));
  end if;

  -- The whole point: the code names the branch, the phone still has to be at it.
  dist := public.meters_between(p_lat, p_lng, off.lat, off.lng);
  if dist > off.radius_meters then
    return jsonb_build_object('ok', false, 'reason', 'too_far',
      'distance', dist, 'radius', off.radius_meters, 'office', off.name,
      'message', format('That code belongs to %s, and you are about %s m away. Scan it at the office.',
                        off.name, round(dist)));
  end if;

  -- Somebody assigned to Sector 6 scanning the Sector 10 poster is allowed only
  -- when the company setting allows it, exactly like the button.
  if not coalesce(s.allow_any_branch, true) and emp.office_id is distinct from off.id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_branch', 'office', off.name,
      'message', format('You are assigned to another branch, so %s cannot record your attendance.', off.name));
  end if;

  today := (now() at time zone s.timezone)::date;
  select * into row_a from public.attendance where employee_id = emp.id and work_date = today;

  ---------------------------------------------------------------- arriving
  if row_a.id is null or row_a.punch_in_at is null then
    select * into g from public.grade_attendance(emp.shift_starts_at, now(), null);

    insert into public.attendance as a (
      employee_id, work_date, shift_id, shift_start, office_id,
      punch_in_at, punch_in_lat, punch_in_lng, punch_in_accuracy, punch_in_distance_m,
      punch_in_method, late_minutes, status, source
    ) values (
      emp.id, today, emp.shift_id, emp.shift_starts_at, off.id,
      now(), p_lat, p_lng, p_accuracy, dist,
      'qr', g.late_minutes, 'in_progress', 'self'
    )
    on conflict (employee_id, work_date) do update set
      punch_in_at = excluded.punch_in_at,
      punch_in_lat = excluded.punch_in_lat,
      punch_in_lng = excluded.punch_in_lng,
      punch_in_accuracy = excluded.punch_in_accuracy,
      punch_in_distance_m = excluded.punch_in_distance_m,
      punch_in_method = 'qr',
      office_id = excluded.office_id,
      shift_id = excluded.shift_id,
      shift_start = excluded.shift_start,
      late_minutes = excluded.late_minutes,
      status = 'in_progress',
      updated_at = now()
    returning * into row_a;

    return jsonb_build_object(
      'ok', true, 'action', 'punch_in', 'at', row_a.punch_in_at,
      'office', off.name, 'distance', dist, 'late_minutes', row_a.late_minutes,
      'message', case when row_a.late_minutes > 0
        then format('Punched in at %s. %s minutes past the grace period.', off.name, row_a.late_minutes)
        else format('Punched in at %s. Have a good day.', off.name) end);
  end if;

  ---------------------------------------------------------------- already done
  if row_a.punch_out_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_out',
      'punched_out_at', row_a.punch_out_at,
      'message', 'Today is already closed. Ask HR if that was a mistake.');
  end if;

  ---------------------------------------------------------------- leaving
  --
  -- A scan seconds after arriving is somebody double-scanning the poster, not
  -- somebody whose working day lasted a minute. Refuse it rather than closing
  -- the day and making HR fix it.
  if now() - row_a.punch_in_at < interval '2 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'too_soon',
      'message', 'You just punched in. Scan again when you are leaving.');
  end if;

  select * into g from public.grade_attendance(row_a.shift_start, row_a.punch_in_at, now());

  update public.attendance set
    punch_out_at = now(),
    punch_out_lat = p_lat,
    punch_out_lng = p_lng,
    punch_out_accuracy = p_accuracy,
    punch_out_distance_m = dist,
    punch_out_method = 'qr',
    worked_minutes = g.worked_minutes,
    late_minutes = g.late_minutes,
    status = g.status,
    updated_at = now()
  where id = row_a.id
  returning * into row_a;

  return jsonb_build_object(
    'ok', true, 'action', 'punch_out', 'at', row_a.punch_out_at,
    'office', off.name, 'worked_minutes', row_a.worked_minutes,
    'late_minutes', row_a.late_minutes, 'status', row_a.status,
    'message', case row_a.status
      when 'present'  then 'Punched out. Full day recorded.'
      when 'late'     then 'Punched out. Full hours, but marked late.'
      when 'half_day' then format('Punched out after %s h %s m — short of a full day.',
                                  row_a.worked_minutes / 60, row_a.worked_minutes % 60)
      else 'Punched out.' end);
end;
$$;

-- ============================================ 4. a leaked printout

create or replace function public.rotate_office_qr(p_office uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare fresh uuid;
begin
  if not (public.is_owner() or public.is_hr()) then
    return jsonb_build_object('ok', false, 'message', 'Only HR can change a branch code.');
  end if;
  update public.office_locations
     set qr_token = gen_random_uuid(), qr_rotated_at = now()
   where id = p_office
  returning qr_token into fresh;
  if fresh is null then
    return jsonb_build_object('ok', false, 'message', 'No such branch.');
  end if;
  return jsonb_build_object('ok', true, 'qr_token', fresh,
    'message', 'New code made. Print it and replace the poster — the old one no longer works.');
end;
$$;

revoke all on function public.punch_by_qr(uuid, numeric, numeric, numeric) from public, anon;
revoke all on function public.rotate_office_qr(uuid) from public, anon;
grant execute on function public.punch_by_qr(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.rotate_office_qr(uuid) to authenticated;

-- ============================================ 5. employee IDs stop being a list
--
-- MM-001, MM-002 tells anybody holding two ID cards who joined first, how many
-- people work here, and what the next person's number will be. Adarsh asked for
-- four random digits instead. 9000 of them, and the loop retries on collision
-- rather than trusting luck; at Metrol's size a clash is rare and a retry is
-- cheap. The column is already unique, so the database is the backstop.

create or replace function public.random_employee_code()
returns text language plpgsql set search_path = public as $$
declare candidate text; tries int := 0;
begin
  loop
    -- 1000-9999: never starts with a zero, so nothing eats the leading digit
    -- when somebody types it into a spreadsheet.
    candidate := (1000 + floor(random() * 9000))::int::text;
    exit when not exists (select 1 from public.employees where employee_code = candidate);
    tries := tries + 1;
    if tries > 200 then
      -- Every four-digit code taken would mean 9000 employees. Say so honestly
      -- rather than looping for ever.
      raise exception 'could not find a free employee code';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.set_employee_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := public.random_employee_code();
  end if;
  return new;
end;
$$;

drop trigger if exists employees_set_code on public.employees;
create trigger employees_set_code
  before insert on public.employees
  for each row execute function public.set_employee_code();

-- Anybody already carrying a sequential MM-### code is given a random one, so
-- the company does not end up with two styles of ID. Nothing references
-- employee_code by value — it is displayed, never joined on — so this is safe.
do $$
declare r record;
begin
  for r in select id from public.employees where employee_code like 'MM-%' loop
    update public.employees set employee_code = public.random_employee_code() where id = r.id;
  end loop;
end $$;

drop sequence if exists public.employee_code_seq;

-- ============================================ 6. proof

select 'qr_token on every branch' as check, count(*)::text as result
  from public.office_locations where qr_token is not null
union all
select 'punch method columns', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'attendance'
   and column_name in ('punch_in_method','punch_out_method')
union all
select 'punch_by_qr exists', count(*)::text
  from pg_proc where proname = 'punch_by_qr'
union all
select 'employee codes still sequential (must be 0)', count(*)::text
  from public.employees where employee_code like 'MM-%'
union all
select 'employee codes that are 4 digits', count(*)::text
  from public.employees where employee_code ~ '^[1-9][0-9]{3}$'
union all
select 'sample of the new codes',
       coalesce(string_agg(employee_code, ', '), 'no employees yet')
  from (select employee_code from public.employees order by created_at limit 5) x;
