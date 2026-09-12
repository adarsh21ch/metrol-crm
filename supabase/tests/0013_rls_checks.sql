-- Proof that attendance cannot be faked from the client. Paste the WHOLE file
-- into the Supabase SQL editor and run it — results come back as rows (see
-- 0006_rls_checks.sql for why RAISE NOTICE is no use there).
--
-- Rewritten for 0014/0015. The old version saved and restored
-- attendance_settings.office_lat / office_lng / radius_meters, which 0014
-- DROPPED — it errored on its first statement and so proved nothing. The
-- office is now a row in public.office_locations, per branch.
--
-- The ones that matter, and why:
--   • a member CANNOT insert or update public.attendance directly. If they
--     could, the geofence would be decoration — anyone could POST a row.
--   • a member CANNOT insert or update public.office_locations. Moving a
--     branch to your own house is the same attack as faking the punch.
--   • punch_in() and punch_by_qr() from 3 km away are both REFUSED.
--   • a QR token that has been rotated away is REFUSED.
--   • a second scan within 2 minutes is refused as a double-scan, not treated
--     as somebody whose working day lasted a minute.
--   • allow_any_branch = false refuses another branch's code; = true accepts
--     it AND records the visited branch on the row, not the assigned one.
--   • the time always comes from now() inside the function. No caller passes
--     one in, so a phone's clock is irrelevant.
--
-- It creates two throwaway branches ("ZZ Test Branch A/B") at a coordinate
-- nowhere near Noida, borrows a real active member, assigns them to A for the
-- duration, and puts everything back: branches deleted, the member's branch
-- and the company settings restored, every test row removed. Work dates are
-- in 2099 wherever a date can be chosen. Anyone missing gives SKIPPED, never
-- a quiet PASS.
--
-- The whole DO block is one statement, so an uncaught error rolls all of it
-- back — including the test branches. It cannot leave the fence half-moved.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_member uuid;
  emp_member uuid;
  dept_hr uuid;

  -- saved state, put back at the end
  saved_office   uuid;
  saved_acc      int;
  saved_allowany boolean;

  off_a uuid; off_b uuid;
  tok_a uuid; tok_b uuid; tok_a_old uuid; tok_b_old uuid;

  -- Jabalpur-ish. Deliberately ~800 km from the real Noida branches so no real
  -- branch can ever be the one a test punch resolves to.
  a_lat numeric := 23.114500;  a_lng numeric := 79.950000;
  b_lat numeric := 23.200000;  b_lng numeric := 80.100000;

  today_local date;
  had_row boolean := false;
  can_punch boolean := false;
  res jsonb;
  n int;
  g record;
  row_id uuid;
  txt text;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;

  -- An ordinary member with a linked, punchable employee record. status has to
  -- be active or notice, or every punch below returns not_active and the run
  -- would report a wall of FAILs that are really SKIPs.
  select p.id, e.id into id_member, emp_member
    from public.profiles p
    join public.employees e on e.profile_id = p.id
   where p.role = 'member'
     and (p.department_id is distinct from dept_hr)
     and e.status in ('active','notice')
   limit 1;

  -- ---------------------------------------------------------------- 0. setup
  select max_accuracy_meters, allow_any_branch
    into saved_acc, saved_allowany
    from public.attendance_settings where id;

  update public.attendance_settings
     set max_accuracy_meters = 100, allow_any_branch = true
   where id;

  insert into public.office_locations (name, address, lat, lng, radius_meters, is_active, sort_order)
  values ('ZZ Test Branch A', 'RLS test only', a_lat, a_lng, 50, true, 900)
  returning id, qr_token into off_a, tok_a;

  insert into public.office_locations (name, address, lat, lng, radius_meters, is_active, sort_order)
  values ('ZZ Test Branch B', 'RLS test only', b_lat, b_lng, 50, true, 901)
  returning id, qr_token into off_b, tok_b;

  if emp_member is not null then
    select office_id into saved_office from public.employees where id = emp_member;
    update public.employees set office_id = off_a where id = emp_member;
  end if;

  select (now() at time zone timezone)::date into today_local
    from public.attendance_settings where id;

  -- Never clobber a real punch. If the borrowed member already has a row for
  -- today, every punch check is skipped rather than overwriting their day.
  if emp_member is not null then
    select exists (select 1 from public.attendance where employee_id = emp_member and work_date = today_local)
      into had_row;
  end if;
  can_punch := (id_member is not null and emp_member is not null and not had_row);

  -- ---------------------------------------------- 1. distance maths, sanity
  insert into _rls_results(check_name, outcome, detail)
  select 'Distance: 0.001 degree of latitude is ~111 m',
         case when public.meters_between(0,0,0.001,0) between 105 and 118 then 'PASS' else 'FAIL' end,
         public.meters_between(0,0,0.001,0) || ' m';

  insert into _rls_results(check_name, outcome, detail)
  select 'Distance: the same point is 0 m',
         case when public.meters_between(a_lat,a_lng,a_lat,a_lng) = 0 then 'PASS' else 'FAIL' end,
         public.meters_between(a_lat,a_lng,a_lat,a_lng) || ' m';

  -- ------------------- 1b. the app's own role can actually call the functions
  --
  -- Cheap, and it is the check that stops this whole file failing silently: a
  -- missing grant makes every punch call below raise, which would abort the
  -- DO block and print no results at all — the exact way the previous version
  -- of this file was useless for six days.
  insert into _rls_results(check_name, outcome, detail)
  select 'The authenticated role can execute the three punch functions',
         case when bool_and(ok) then 'PASS' else 'FAIL' end,
         string_agg(fn || ': ' || case when ok then 'yes' else 'NO GRANT' end, ', ')
  from (
    select 'punch_in'     as fn, has_function_privilege('authenticated', 'public.punch_in(numeric,numeric,numeric)', 'execute') as ok
    union all select 'punch_out',   has_function_privilege('authenticated', 'public.punch_out(numeric,numeric,numeric)', 'execute')
    union all select 'punch_by_qr', has_function_privilege('authenticated', 'public.punch_by_qr(uuid,numeric,numeric,numeric)', 'execute')
  ) t;

  -- --------------------------------- 2. a member cannot write attendance AT ALL
  if id_member is null or emp_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot insert their own attendance row', 'SKIPPED', 'no active member with a linked employee record found');
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
      values ('A member cannot insert their own attendance row', 'PASS', 'blocked by policy — the punch functions are the only way in');
    end;
  end if;

  -- ------------------------------------ 3. and cannot edit one that exists
  insert into public.attendance (employee_id, work_date, status, source, edit_reason, office_id)
  values (coalesce(emp_member, (select id from public.employees limit 1)),
          date '2099-01-06', 'absent', 'hr', 'ZZ RLS test row', off_a)
  on conflict (employee_id, work_date) do nothing
  returning id into row_id;

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

  -- ------------------------ 4. a member cannot invent a branch at their house
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot create an office location', 'SKIPPED', 'no ordinary member found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.office_locations (name, lat, lng, radius_meters)
      values ('ZZ Members House', 0, 0, 5000);
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot create an office location', 'FAIL', 'the insert was allowed — they can put a branch anywhere');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot create an office location', 'PASS', 'blocked by policy — HR and the owner only');
    end;
  end if;

  -- ------------------------- 5. nor move an existing one, nor widen its fence
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot move a branch or widen its radius', 'SKIPPED', 'no ordinary member found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.office_locations set lat = 0, lng = 0, radius_meters = 5000 where id = off_a;
      execute 'reset role';
      select count(*) into n from public.office_locations where id = off_a and lat = a_lat and radius_meters = 50;
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot move a branch or widen its radius',
              case when n = 1 then 'PASS' else 'FAIL' end,
              case when n = 1 then 'the update matched no rows' else 'the branch moved — this is a hole' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot move a branch or widen its radius', 'PASS', 'blocked by policy');
    end;
  end if;

  -- ------------------------- 6. nor loosen the company-wide punch settings
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot loosen the punch settings', 'SKIPPED', 'no ordinary member found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.attendance_settings set max_accuracy_meters = 2000, grace_minutes = 120 where id;
      execute 'reset role';
      select count(*) into n from public.attendance_settings where id and max_accuracy_meters = 100;
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot loosen the punch settings',
              case when n = 1 then 'PASS' else 'FAIL' end,
              case when n = 1 then 'the update matched no rows' else 'the accuracy ceiling moved — this is a hole' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot loosen the punch settings', 'PASS', 'blocked by policy');
    end;
  end if;

  -- ----------------------------- 7. nor rotate a branch code out from under HR
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A member cannot rotate a branch QR code', 'SKIPPED', 'no ordinary member found');
  else
    tok_a_old := tok_a;
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      select public.rotate_office_qr(off_a) into res;
      execute 'reset role';
      select qr_token into tok_a from public.office_locations where id = off_a;
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot rotate a branch QR code',
              case when (res->>'ok')::boolean is not true and tok_a = tok_a_old then 'PASS' else 'FAIL' end,
              case when tok_a is distinct from tok_a_old
                     then 'THE CODE CHANGED — a member rotated it'
                     else coalesce(res->>'message', res::text) end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot rotate a branch QR code', 'PASS', 'the call itself was refused: ' || sqlerrm);
    end;
  end if;

  -- ---------------------------------------- 8. punching in from far away fails
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() 3 km away is refused', 'SKIPPED',
            case when had_row then 'this member already has a real row for today — not touching it'
                 else 'no active member with a linked employee record found' end);
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(a_lat + 0.027, a_lng, 20) into res;   -- ~3 km north of A
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() 3 km away is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'too_far' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ------------------------------- 9. and with a useless GPS fix, also refused
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() with a 2 km accuracy fix is refused', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(a_lat, a_lng, 2000) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() with a 2 km accuracy fix is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'weak_fix' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ----------------------------------------- 10. inside the fence, it records
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() inside 50 m records the day', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(a_lat + 0.0002, a_lng, 15) into res;   -- ~22 m
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_in() inside 50 m records the day',
            case when (res->>'ok')::boolean then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text) || ' — distance ' || coalesce(res->>'distance','?') || ' m');

    -- 10b. the row says it came from the employee, by the button, at branch A
    select count(*) into n from public.attendance
     where employee_id = emp_member and work_date = today_local
       and source = 'self' and punch_in_method = 'button'
       and office_id = off_a
       and punch_in_at is not null and punch_in_distance_m is not null;
    insert into _rls_results(check_name, outcome, detail)
    values ('…and stores the branch, the coordinates, the distance and a server timestamp',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' row(s) with the evidence attached');

    -- 10c. a second punch-in does not start a second day
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_in(a_lat, a_lng, 15) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A second punch_in() the same day is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'already_in' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));

    -- 10d. punch out closes it
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_out(a_lat, a_lng, 15) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_out() closes the day and grades it',
            case when (res->>'ok')::boolean and res->>'status' is not null then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));

    -- The QR checks below need a clean slate for the same person, same day.
    delete from public.attendance where employee_id = emp_member and work_date = today_local;
  end if;

  -- ------------------------------- 11. the QR code does not replace the fence
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_by_qr() with a valid code 3 km away is refused', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_by_qr(tok_a, a_lat + 0.027, a_lng, 20) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_by_qr() with a valid code 3 km away is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'too_far' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- --------------------------------- 12. a photocopied, rotated-away printout
  tok_b_old := tok_b;
  if id_hr is not null then
    -- Rotate through the RPC, as HR would, so this proves the rotation path too.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select public.rotate_office_qr(off_b) into res;
    execute 'reset role';
    txt := 'rotated by HR through rotate_office_qr()';
  else
    update public.office_locations set qr_token = gen_random_uuid(), qr_rotated_at = now() where id = off_b;
    txt := 'rotated directly — no HR person exists to run the RPC as';
  end if;
  select qr_token into tok_b from public.office_locations where id = off_b;

  insert into _rls_results(check_name, outcome, detail)
  values ('Rotating a branch code actually changes it',
          case when tok_b is distinct from tok_b_old then 'PASS' else 'FAIL' end, txt);

  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_by_qr() with a rotated-away code is refused', 'SKIPPED', 'see above');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_by_qr(tok_b_old, b_lat, b_lng, 15) into res;   -- standing AT B, old code
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('punch_by_qr() with a rotated-away code is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'bad_code' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));
  end if;

  -- ------------------- 13. allow_any_branch = false: the other branch refuses
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('allow_any_branch = false: another branch''s code is refused', 'SKIPPED', 'see above');
  else
    update public.attendance_settings set allow_any_branch = false where id;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_by_qr(tok_b, b_lat, b_lng, 15) into res;   -- assigned to A, standing at B
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('allow_any_branch = false: another branch''s code is refused',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'wrong_branch' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));

    select count(*) into n from public.attendance where employee_id = emp_member and work_date = today_local;
    insert into _rls_results(check_name, outcome, detail)
    values ('…and no row was written by the refusal',
            case when n = 0 then 'PASS' else 'FAIL' end, n || ' row(s), expected 0');
  end if;

  -- -------------------- 14. allow_any_branch = true: it lands, marked visiting
  if not can_punch then
    insert into _rls_results(check_name, outcome, detail)
    values ('allow_any_branch = true: the visited branch is recorded, not the assigned one', 'SKIPPED', 'see above');
  else
    update public.attendance_settings set allow_any_branch = true where id;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_by_qr(tok_b, b_lat + 0.0002, b_lng, 15) into res;
    execute 'reset role';

    select count(*) into n from public.attendance
     where employee_id = emp_member and work_date = today_local
       and office_id = off_b and punch_in_method = 'qr' and source = 'self';
    insert into _rls_results(check_name, outcome, detail)
    values ('allow_any_branch = true: the visited branch is recorded, not the assigned one',
            case when (res->>'ok')::boolean and n = 1 then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text) || ' — office_id = Branch B on ' || n || ' row(s)');

    -- 14b. the double-scan guard: a second scan seconds later is not a punch out
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select public.punch_by_qr(tok_b, b_lat, b_lng, 15) into res;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A second scan within 2 minutes is refused as a double-scan',
            case when (res->>'ok')::boolean = false and res->>'reason' = 'too_soon' then 'PASS' else 'FAIL' end,
            coalesce(res->>'message', res::text));

    select count(*) into n from public.attendance
     where employee_id = emp_member and work_date = today_local and punch_out_at is null;
    insert into _rls_results(check_name, outcome, detail)
    values ('…and the day is still open, not closed by the second scan',
            case when n = 1 then 'PASS' else 'FAIL' end,
            case when n = 1 then 'punch_out_at is still null' else 'the day was closed — HR would have to fix it' end);
  end if;

  -- ------------------------------------------------- 15. the grading rules
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

  -- -------------------------------------- 16. an HR correction leaves a trail
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

  -- ------------------------------ 17. a member cannot read anyone else's day
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

  -- ------------------------------------------------------------ 18. clean up
  delete from public.attendance_edits where attendance_id = row_id;
  delete from public.attendance where edit_reason like 'ZZ RLS test%' or work_date >= date '2099-01-01';
  if emp_member is not null and not had_row then
    delete from public.attendance where employee_id = emp_member and work_date = today_local;
  end if;
  delete from public.attendance where office_id in (off_a, off_b);

  if emp_member is not null then
    update public.employees set office_id = saved_office where id = emp_member;
  end if;

  delete from public.office_locations where id in (off_a, off_b) or name = 'ZZ Members House';

  update public.attendance_settings
     set max_accuracy_meters = coalesce(saved_acc, 100),
         allow_any_branch    = coalesce(saved_allowany, true)
   where id;

  select count(*) into n from public.office_locations where name like 'ZZ %';
  insert into _rls_results(check_name, outcome, detail)
  values ('Clean up',
          case when n = 0 then 'PASS' else 'FAIL' end,
          case when n = 0
            then 'test branches removed, test rows removed, the borrowed member''s branch and the company settings put back'
            else n || ' test branch(es) left behind — delete them from the Branches screen' end);
end $$;

select seq, check_name, outcome, detail from _rls_results order by seq;
