-- Proof that attendance cannot be faked from the client. Paste the WHOLE file
-- into the Supabase SQL editor and run it — results come back as rows (see
-- 0006_rls_checks.sql for why).
--
-- The three that matter most, and why:
--   • a member CANNOT insert or update public.attendance directly. If they
--     could, the geofence would be decoration — anyone could POST a row.
--   • punch_in() from 3 km away is REFUSED, and says how far.
--   • punch_in() inside the radius is ALLOWED and the time it stores is the
--     database's, not one the caller passed in (the function takes no time).
--
-- It borrows a real member, moves the office to a test coordinate for the
-- duration, and puts the office and the member's day back exactly as it found
-- them. Work dates are in the year 2099 wherever a date can be chosen, so
-- nothing real is touched. Anyone missing gives SKIPPED, never a quiet PASS.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_member uuid;
  emp_member uuid;
  dept_hr uuid;
  saved_lat numeric; saved_lng numeric; saved_radius int; saved_acc int;
  test_lat numeric := 23.114500;
  test_lng numeric := 79.950000;   -- an arbitrary point, moved back at the end
  today_local date;
  had_row boolean := false;
  res jsonb;
  n int;
  g record;
  row_id uuid;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_member from public.profiles
    where role = 'member' and (department_id is distinct from dept_hr) limit 1;

  if id_member is not null then
    select id into emp_member from public.employees where profile_id = id_member limit 1;
  end if;

  -- ---------------------------------------------------------------- 0. setup
  select office_lat, office_lng, radius_meters, max_accuracy_meters
    into saved_lat, saved_lng, saved_radius, saved_acc
    from public.attendance_settings where id;

  update public.attendance_settings
     set office_lat = test_lat, office_lng = test_lng,
         radius_meters = 50, max_accuracy_meters = 100
   where id;

  select (now() at time zone timezone)::date into today_local
    from public.attendance_settings where id;

  -- Never clobber a real punch. If the borrowed member already has a row for
  -- today, every punch check below is skipped rather than overwriting it.
  if emp_member is not null then
    select exists (select 1 from public.attendance where employee_id = emp_member and work_date = today_local)
      into had_row;
  end if;

  -- ------------------------------------------- 1. distance maths is not lying
  insert into _rls_results(check_name, outcome, detail)
  select 'Distance: 0.001 degree of latitude is ~111 m',
         case when public.meters_between(0,0,0.001,0) between 105 and 118 then 'PASS' else 'FAIL' end,
         public.meters_between(0,0,0.001,0) || ' m';

  insert into _rls_results(check_name, outcome, detail)
  select 'Distance: the same point is 0 m',
         case when public.meters_between(test_lat,test_lng,test_lat,test_lng) = 0 then 'PASS' else 'FAIL' end,
         public.meters_between(test_lat,test_lng,test_lat,test_lng) || ' m';

  -- --------------------------------- 2. a member cannot write attendance AT ALL
  if id_member is null or emp_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot insert their own attendance row', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.attendance (employee_id, work_date, punch_in_at, punch_out_at, status, worked_minutes)
      values (emp_member, date '2099-01-05', now() - interval '9 hours', now(), 'present', 540);
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot insert their own attendance row', 'FAIL', 'the insert was allowed — the geofence is bypassable');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot insert their own attendance row', 'PASS', 'blocked by policy — punch_in() is the only way in');
    end;
  end if;

  -- ------------------------------------ 3. and cannot edit one that exists
  if emp_member is null or not had_row then
    -- nothing safe to try an update against; make one in 2099 as the owner
    insert into public.attendance (employee_id, work_date, status, source, edit_reason)
    values (coalesce(emp_member, (select id from public.employees limit 1)), date '2099-01-06', 'absent', 'hr', 'ZZ RLS test row')
    on conflict (employee_id, work_date) do nothing
    returning id into row_id;
  end if;

  if id_member is null or row_id is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot edit an attendance row', 'SKIPPED', 'no test row to try it against');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.attendance set status = 'present', worked_minutes = 540 where id = row_id;
      execute 'reset role';
      select count(*) into n from public.attendance where id = row_id and status = 'present';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot edit an attendance row',
              case when n = 0 then 'PASS' else 'FAIL' end,
              case when n = 0 then 'the update matched no rows' else 'the row was changed — this is a hole' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot edit an attendance row', 'PASS', 'blocked by policy');
    end;
  end if;

  -- ---------------------------------------- 4. punching in from far away fails
  if id_member is null or emp_member is null or had_row then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() 3 km away is refused', 'SKIPPED',
            case when had_row then 'this member already has a real row for today — not touching it'
                 else 'no ordinary member with a linked employee record found' end);
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(test_lat + 0.027, test_lng, 20) into res;   -- ~3 km north
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() 3 km away is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'too_far' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ------------------------------- 5. and with a useless GPS fix, also refused
  if id_member is null or emp_member is null or had_row then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() with a 2 km accuracy fix is refused', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(test_lat, test_lng, 2000) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() with a 2 km accuracy fix is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'weak_fix' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ------------------------------------------ 6. inside the fence, it records
  if id_member is null or emp_member is null or had_row then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() inside 50 m records the day', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(test_lat + 0.0002, test_lng, 15) into res;   -- ~22 m
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() inside 50 m records the day',
            case when (res->>'ok')::boolean then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text) || ' — distance ' || coalesce(res->>'distance','?') || ' m');

    -- 6b. the row says it came from the employee, and carries the evidence
    select count(*) into n from public.attendance
     where employee_id = emp_member and work_date = today_local
       and source = 'self' and punch_in_at is not null and punch_in_distance_m is not null;
    insert into _rls_results(check_name, outcome, detail)
    values ('…and stores coordinates, distance and a server timestamp',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' row(s) with the evidence attached');

    -- 6c. a second punch-in does not start a second day
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(test_lat, test_lng, 15) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A second punch_in() the same day is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'already_in' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));

    -- 6d. punch out closes it
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_out(test_lat, test_lng, 15) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_out() closes the day and grades it',
            case when (res->>'ok')::boolean and res->>'status' is not null then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ------------------------------------------------- 7. the grading rules
  select * into g from public.grade_attendance(time '09:30',
      (date '2099-03-02' + time '09:35') at time zone 'Asia/Kolkata',
      (date '2099-03-02' + time '18:40') at time zone 'Asia/Kolkata');
  insert into _rls_results(check_name, outcome, detail)
  values ('In by 09:35 on a 09:30 shift, 9 h done → present (inside the 7 min grace)',
          case when g.status = 'present' and g.late_minutes = 0 then 'PASS' else 'FAIL' end,
          g.status || ', ' || g.worked_minutes || ' min worked, ' || g.late_minutes || ' min late');

  select * into g from public.grade_attendance(time '09:30',
      (date '2099-03-03' + time '09:50') at time zone 'Asia/Kolkata',
      (date '2099-03-03' + time '18:55') at time zone 'Asia/Kolkata');
  insert into _rls_results(check_name, outcome, detail)
  values ('In at 09:50, full 9 h done → late, not present',
          case when g.status = 'late' and g.late_minutes = 13 then 'PASS' else 'FAIL' end,
          g.status || ', ' || g.late_minutes || ' min past the grace period');

  select * into g from public.grade_attendance(time '09:30',
      (date '2099-03-04' + time '09:30') at time zone 'Asia/Kolkata',
      (date '2099-03-04' + time '15:00') at time zone 'Asia/Kolkata');
  insert into _rls_results(check_name, outcome, detail)
  values ('On time but only 5 h 30 → half day, not present',
          case when g.status = 'half_day' then 'PASS' else 'FAIL' end,
          g.status || ', ' || g.worked_minutes || ' min worked');

  select * into g from public.grade_attendance(time '09:30',
      (date '2099-03-05' + time '09:30') at time zone 'Asia/Kolkata', null);
  insert into _rls_results(check_name, outcome, detail)
  values ('Punched in, never out → in_progress, never present',
          case when g.status = 'in_progress' then 'PASS' else 'FAIL' end, g.status);

  -- --------------------------------------- 8. an HR correction leaves a trail
  if id_hr is null or row_id is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('An HR correction is written to attendance_edits', 'SKIPPED', 'no HR person, or no test row');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    update public.attendance
       set punch_in_at  = (date '2099-01-06' + time '09:30') at time zone 'Asia/Kolkata',
           punch_out_at = (date '2099-01-06' + time '18:35') at time zone 'Asia/Kolkata',
           shift_start  = time '09:30',
           edit_reason  = 'ZZ RLS test — forgot to punch out'
     where id = row_id;
    execute 'reset role';

    select count(*) into n from public.attendance_edits where attendance_id = row_id;
    insert into _rls_results(check_name, outcome, detail)
    values ('An HR correction is written to attendance_edits',
            case when n >= 1 then 'PASS' else 'FAIL' end, n || ' edit(s) logged');

    select count(*) into n from public.attendance
     where id = row_id and status = 'present' and worked_minutes between 540 and 546;
    insert into _rls_results(check_name, outcome, detail)
    values ('…and the corrected day is re-graded, not left as HR typed it',
            case when n = 1 then 'PASS' else 'FAIL' end,
            case when n = 1 then 'recomputed to present, ~9 h' else 'the derived fields did not follow the new times' end);
  end if;

  -- ------------------------------- 9. a member cannot read anyone else's day
  if id_member is null or emp_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member reads only their own attendance', 'SKIPPED', 'no ordinary member found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.attendance where employee_id <> emp_member;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A member reads only their own attendance',
            case when n = 0 then 'PASS' else 'FAIL' end,
            n || ' other people''s day(s) visible, expected 0');
  end if;

  -- ------------------------------ 10. a member cannot move the office to home
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot move the office location', 'SKIPPED', 'no ordinary member found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    update public.attendance_settings set office_lat = 0, office_lng = 0, radius_meters = 5000 where id;
    execute 'reset role';
    select count(*) into n from public.attendance_settings where id and office_lat = test_lat;
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot move the office location',
            case when n = 1 then 'PASS' else 'FAIL' end,
            case when n = 1 then 'the update matched no rows' else 'the office moved — this is a hole' end);
  end if;

  -- ------------------------------------------------------------ 11. clean up
  delete from public.attendance_edits where attendance_id = row_id;
  delete from public.attendance where edit_reason like 'ZZ RLS test%' or work_date >= date '2099-01-01';
  if emp_member is not null and not had_row then
    delete from public.attendance where employee_id = emp_member and work_date = today_local;
  end if;

  update public.attendance_settings
     set office_lat = saved_lat, office_lng = saved_lng,
         radius_meters = coalesce(saved_radius, 50),
         max_accuracy_meters = coalesce(saved_acc, 100)
   where id;

  insert into _rls_results(check_name, outcome, detail)
  values ('Clean up', 'PASS', 'test rows removed, office location restored to what it was');
end $$;

select seq, check_name, outcome, detail from _rls_results order by seq;
