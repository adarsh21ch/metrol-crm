-- Proof for Phase 7 (migration 0016): the working-day rule, and that a leave
-- day count cannot be set by whoever is asking for the leave.
--
-- Paste the WHOLE file into the Supabase SQL editor and run it — results come
-- back as rows. Run 0016 first.
--
-- The two that matter:
--   • a member can send days_count = 99 with a one-day request and the stored
--     number is still 1. The count is the trigger's, not the client's — same
--     rule as the geofence: anything the browser asserts is recomputed.
--   • a member cannot turn their own pending request into an approved one.
--     0009 wrote that policy; this is the regression test it never had.
--
-- It borrows a real member, files requests in 2099 so nothing real is touched,
-- adds one throwaway holiday, and deletes all of it at the end. Anyone missing
-- gives SKIPPED, never a quiet PASS.

drop table if exists pg_temp._lv_results;
create temp table _lv_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_hr uuid; id_member uuid;
  emp_member uuid;
  dept_hr uuid;
  req_id uuid;
  n int;
  d int;
  had_holiday boolean;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;
  select id into id_hr from public.profiles where department_id = dept_hr limit 1;

  select p.id, e.id into id_member, emp_member
    from public.profiles p
    join public.employees e on e.profile_id = p.id
   where p.role = 'member' and (p.department_id is distinct from dept_hr)
   limit 1;

  -- ------------------------------------------------- 1. the arithmetic itself
  -- Mon 2099-01-05 … Fri 2099-01-09. (2099-01-04 is a Sunday.)
  insert into _lv_results(check_name, outcome, detail)
  select 'Mon → Fri is 5 working days',
         case when public.working_days_between(date '2099-01-05', date '2099-01-09') = 5 then 'PASS' else 'FAIL' end,
         public.working_days_between(date '2099-01-05', date '2099-01-09') || ' days';

  -- Fri 2099-01-09 … Mon 2099-01-12. Sunday the 11th drops out; SATURDAY THE
  -- 10TH DOES NOT — Sunday is Metrol's only week off.
  insert into _lv_results(check_name, outcome, detail)
  select 'Fri → Mon is 3 working days (Sunday out, Saturday in)',
         case when public.working_days_between(date '2099-01-09', date '2099-01-12') = 3 then 'PASS' else 'FAIL' end,
         public.working_days_between(date '2099-01-09', date '2099-01-12') || ' days';

  insert into _lv_results(check_name, outcome, detail)
  select 'A Sunday on its own is 0 working days',
         case when public.working_days_between(date '2099-01-11', date '2099-01-11') = 0 then 'PASS' else 'FAIL' end,
         public.working_days_between(date '2099-01-11', date '2099-01-11') || ' days';

  insert into _lv_results(check_name, outcome, detail)
  select 'One day that is a working day is 1, not 0',
         case when public.working_days_between(date '2099-01-06', date '2099-01-06') = 1 then 'PASS' else 'FAIL' end,
         public.working_days_between(date '2099-01-06', date '2099-01-06') || ' days';

  -- ------------------------------------------ 2. a holiday removes a day
  select exists (select 1 from public.holidays where holiday_date = date '2099-01-07') into had_holiday;
  insert into public.holidays (holiday_date, name) values (date '2099-01-07', 'ZZ RLS test holiday')
  on conflict (holiday_date) do nothing;

  d := public.working_days_between(date '2099-01-05', date '2099-01-09');
  insert into _lv_results(check_name, outcome, detail)
  values ('A holiday inside the range takes a day off the count',
          case when d = 4 then 'PASS' else 'FAIL' end,
          'Mon → Fri with one holiday in it = ' || d || ' days, expected 4');

  -- ------------------- 3. the day count is the trigger's, not the client's
  if id_member is null or emp_member is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member cannot inflate their own day count', 'SKIPPED', 'no member with a linked employee record found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.leave_requests (employee_id, start_date, end_date, days_count, reason, leave_type)
      values (emp_member, date '2099-01-06', date '2099-01-06', 99, 'ZZ RLS test', 'casual')
      returning id into req_id;
      execute 'reset role';

      select days_count into n from public.leave_requests where id = req_id;
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot inflate their own day count',
              case when n = 1 then 'PASS' else 'FAIL' end,
              'asked for 99 days on a one-day request, stored ' || n);
    exception when others then
      execute 'reset role';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot inflate their own day count', 'FAIL', 'the insert itself errored: ' || sqlerrm);
    end;
  end if;

  -- --------------------- 4. and the count skips Sundays on their own request
  if req_id is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member''s own request is counted in working days', 'SKIPPED', 'no test request');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      -- Owner/HR only may edit dates; a member's own update policy allows the
      -- row to land in 'cancelled' and nowhere else, so this is done as HR.
      execute 'reset role';
      update public.leave_requests
         set start_date = date '2099-01-09', end_date = date '2099-01-12'
       where id = req_id;
      select days_count into n from public.leave_requests where id = req_id;
      insert into _lv_results(check_name, outcome, detail)
      values ('A member''s own request is counted in working days',
              case when n = 3 then 'PASS' else 'FAIL' end,
              'Fri → Mon stored as ' || n || ' days, expected 3');
    exception when others then
      execute 'reset role';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member''s own request is counted in working days', 'FAIL', sqlerrm);
    end;
  end if;

  -- ------------------------------------------ 5. only the three real types
  begin
    insert into public.leave_requests (employee_id, start_date, end_date, reason, leave_type)
    values (coalesce(emp_member, (select id from public.employees limit 1)),
            date '2099-02-01', date '2099-02-01', 'ZZ RLS test', 'annual');
    insert into _lv_results(check_name, outcome, detail)
    values ('An invented leave type is refused', 'FAIL', 'leave_type = ''annual'' was accepted');
  exception when others then
    insert into _lv_results(check_name, outcome, detail)
    values ('An invented leave type is refused', 'PASS', 'the check constraint held');
  end;

  -- No RETURNING here on purpose: leave_type is text and every local in this
  -- block is an int, and a swallowed type error would have made the count
  -- below read 0 and report a FAIL that was really this file's own bug.
  insert into public.leave_requests (employee_id, start_date, end_date, reason)
  values (coalesce(emp_member, (select id from public.employees limit 1)),
          date '2099-02-02', date '2099-02-02', 'ZZ RLS test');

  select count(*) into n from public.leave_requests
   where reason = 'ZZ RLS test' and start_date = date '2099-02-02' and leave_type = 'casual';
  insert into _lv_results(check_name, outcome, detail)
  values ('A request with no type given defaults to casual',
          case when n = 1 then 'PASS' else 'FAIL' end, n || ' row(s) landed on casual');

  -- ---------------------------- 6. a member cannot approve their own request
  if req_id is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member cannot approve their own request', 'SKIPPED', 'no test request');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.leave_requests set status = 'approved' where id = req_id;
      execute 'reset role';
      select count(*) into n from public.leave_requests where id = req_id and status = 'approved';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot approve their own request',
              case when n = 0 then 'PASS' else 'FAIL' end,
              case when n = 0 then 'the update matched no rows' else 'THEY APPROVED THEIR OWN LEAVE — this is a hole' end);
    exception when others then
      execute 'reset role';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot approve their own request', 'PASS', 'blocked by policy');
    end;
  end if;

  -- ------------------------------- 7. but can cancel it while it is pending
  if req_id is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member can cancel their own pending request', 'SKIPPED', 'no test request');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    update public.leave_requests set status = 'cancelled' where id = req_id;
    execute 'reset role';
    select count(*) into n from public.leave_requests where id = req_id and status = 'cancelled';
    insert into _lv_results(check_name, outcome, detail)
    values ('A member can cancel their own pending request',
            case when n = 1 then 'PASS' else 'FAIL' end, n || ' row(s) cancelled, expected 1');
  end if;

  -- ------------------------- 8. a member cannot enter or remove a holiday
  if id_member is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member cannot enter a holiday', 'SKIPPED', 'no ordinary member found');
  else
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.holidays (holiday_date, name) values (date '2099-03-03', 'ZZ member holiday');
      execute 'reset role';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot enter a holiday', 'FAIL', 'the insert was allowed — anybody could shorten their own leave');
    exception when others then
      execute 'reset role';
      insert into _lv_results(check_name, outcome, detail)
      values ('A member cannot enter a holiday', 'PASS', 'blocked by policy — HR and the owner only');
    end;

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    delete from public.holidays where holiday_date = date '2099-01-07';
    execute 'reset role';
    select count(*) into n from public.holidays where holiday_date = date '2099-01-07';
    insert into _lv_results(check_name, outcome, detail)
    values ('A member cannot remove a holiday',
            case when n = 1 then 'PASS' else 'FAIL' end,
            case when n = 1 then 'the delete matched no rows' else 'the holiday was deleted — this is a hole' end);
  end if;

  -- ------------------------------------------------- 9. HR can decide it
  if id_hr is null or req_id is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('HR can approve a request', 'SKIPPED', 'no HR person, or no test request');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    update public.leave_requests
       set status = 'approved', decided_by = id_hr, decided_at = now()
     where id = req_id;
    execute 'reset role';
    select count(*) into n from public.leave_requests where id = req_id and status = 'approved';
    insert into _lv_results(check_name, outcome, detail)
    values ('HR can approve a request',
            case when n = 1 then 'PASS' else 'FAIL' end, n || ' row(s) approved, expected 1');
  end if;

  -- ----------------- 10. a member reads nobody else's leave, types included
  if id_member is null or emp_member is null then
    insert into _lv_results(check_name, outcome, detail)
    values ('A member reads only their own leave requests', 'SKIPPED', 'no ordinary member found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.leave_requests where employee_id <> emp_member;
    execute 'reset role';
    insert into _lv_results(check_name, outcome, detail)
    values ('A member reads only their own leave requests',
            case when n = 0 then 'PASS' else 'FAIL' end,
            n || ' other people''s request(s) visible, expected 0');
  end if;

  -- ------------------------------------------------------------ 11. clean up
  delete from public.leave_requests where reason = 'ZZ RLS test' or start_date >= date '2099-01-01';
  delete from public.holidays where name like 'ZZ %';
  if had_holiday then
    -- It was already there before this file ran; putting it back is not this
    -- file's business to invent a name for, so say so rather than guess.
    insert into _lv_results(check_name, outcome, detail)
    values ('Clean up', 'FAIL', '2099-01-07 already existed as a holiday before this ran and has now been removed — re-enter it');
  else
    select count(*) into n from public.leave_requests where start_date >= date '2099-01-01';
    insert into _lv_results(check_name, outcome, detail)
    values ('Clean up',
            case when n = 0 then 'PASS' else 'FAIL' end,
            case when n = 0 then 'test requests and the test holiday removed' else n || ' test request(s) left behind' end);
  end if;
end $$;

select seq, check_name, outcome, detail from _lv_results order by seq;
