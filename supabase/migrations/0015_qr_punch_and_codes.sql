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
