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
