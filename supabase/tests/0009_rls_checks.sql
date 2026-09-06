-- Proof that leave requests are protected the same way employee records are.
-- Paste the WHOLE file into the Supabase SQL editor and run it — results come
-- back as rows (see 0006_rls_checks.sql for why: RAISE NOTICE does not show
-- up there, and that cost a whole round once already).
--
-- It picks real people automatically:
--   owner   — whoever has role = 'owner'
--   HR      — whoever sits in the Human Resources department, WITH an
--             employee record already linked to their login
--   member  — an ordinary team member, WITH an employee record already linked
-- Anyone missing gives SKIPPED, never a quiet PASS. It writes its own leave
-- request rows and deletes them again; not inside a transaction, for the same
-- reason 0006's checks are not — the editor only shows the last statement.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_member uuid;
  emp_hr uuid; emp_member uuid;
  dept_hr uuid;
  req_a uuid; req_b uuid;
  n int;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_member from public.profiles
    where role = 'member' and (department_id is distinct from dept_hr) limit 1;

  if id_hr is not null then select id into emp_hr from public.employees where profile_id = id_hr limit 1; end if;
  if id_member is not null then select id into emp_member from public.employees where profile_id = id_member limit 1; end if;

  -- Two requests to look at: one for the member, one for HR themselves.
  if emp_member is not null then
    insert into public.leave_requests (employee_id, start_date, end_date, reason)
    values (emp_member, current_date + 10, current_date + 11, 'ZZ RLS test — member request')
    returning id into req_a;
  end if;
  if emp_hr is not null then
    insert into public.leave_requests (employee_id, start_date, end_date, reason)
    values (emp_hr, current_date + 20, current_date + 20, 'ZZ RLS test — hr request')
    returning id into req_b;
  end if;

  -- 1. the owner sees every request ---------------------------------------
  if id_owner is null or (req_a is null and req_b is null) then
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every request', 'SKIPPED', 'no owner, or no test request to look at');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    select count(*) into n from public.leave_requests where reason like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every request',
            case when n = (case when req_a is not null then 1 else 0 end) + (case when req_b is not null then 1 else 0 end) then 'PASS' else 'FAIL' end,
            n || ' test request(s) visible');
  end if;

  -- 2. HR sees every request ------------------------------------------------
  if id_hr is null or (req_a is null and req_b is null) then
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every request', 'SKIPPED', 'nobody in Human Resources has an employee record yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select count(*) into n from public.leave_requests where reason like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every request',
            case when n = (case when req_a is not null then 1 else 0 end) + (case when req_b is not null then 1 else 0 end) then 'PASS' else 'FAIL' end,
            n || ' test request(s) visible');
  end if;

  -- 3. THE ONE THAT MATTERS: a member reads only their own ----------------
  if id_member is null or emp_member is null or req_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own requests', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.leave_requests where reason like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own requests',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' request(s) visible, expected exactly 1 (their own)');
  end if;

  -- 4. a member cannot log a request for somebody else ----------------------
  if id_member is not null and emp_hr is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.leave_requests (employee_id, start_date, end_date, reason)
      values (emp_hr, current_date, current_date, 'ZZ RLS test — should not exist');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot log a request for somebody else', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot log a request for somebody else', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 5. a member cannot create their own request pre-approved -----------------
  if id_member is not null and emp_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.leave_requests (employee_id, start_date, end_date, reason, status)
      values (emp_member, current_date, current_date, 'ZZ RLS test — should not exist', 'approved');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot self-approve on the way in', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot self-approve on the way in', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 6. a member cannot approve their own pending request ---------------------
  if id_member is not null and req_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.leave_requests set status = 'approved' where id = req_a;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot approve their own request', 'FAIL', 'the update was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot approve their own request', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 7. a member CAN cancel their own pending request --------------------------
  if id_member is not null and req_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.leave_requests set status = 'cancelled' where id = req_a;
      execute 'reset role';
      perform 1 from public.leave_requests where id = req_a and status = 'cancelled';
      if found then
        insert into _rls_results(check_name, outcome, detail)
        values ('A member can cancel their own pending request', 'PASS', 'the cancel went through');
      else
        insert into _rls_results(check_name, outcome, detail)
        values ('A member can cancel their own pending request', 'FAIL', 'the update did not take effect');
      end if;
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member can cancel their own pending request', 'FAIL', 'blocked, but this should have been allowed');
    end;
  end if;

  -- 8. HR can approve a request ------------------------------------------------
  if id_hr is not null and req_b is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      update public.leave_requests set status = 'approved', decided_by = id_hr, decided_at = now() where id = req_b;
      execute 'reset role';
      perform 1 from public.leave_requests where id = req_b and status = 'approved';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can approve a request',
              case when found then 'PASS' else 'FAIL' end,
              case when found then 'approved' else 'the update did not take effect' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can approve a request', 'FAIL', 'blocked, but this should have been allowed');
    end;
  end if;

  -- 9. nobody deletes a leave request ------------------------------------------
  if id_hr is not null and req_b is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.leave_requests where id = req_b;
      execute 'reset role';
    exception when others then
      execute 'reset role';
    end;
    perform 1 from public.leave_requests where id = req_b;
    insert into _rls_results(check_name, outcome, detail)
    values ('Even HR cannot delete a leave request',
            case when found then 'PASS' else 'FAIL' end,
            case when found then 'the record survived' else 'the record was deleted' end);
  end if;

  -- cleanup, always -------------------------------------------------------
  delete from public.leave_requests where reason like 'ZZ RLS test%';
end;
$$;

-- Belt and braces: nothing this file created is left behind.
delete from public.leave_requests where reason like 'ZZ RLS test%';

-- ---------------------------------------------------------------- read this
select seq        as "#",
       check_name  as "Check",
       outcome     as "Result",
       detail      as "Detail"
  from _rls_results
union all
select 99,
       'EVERYTHING',
       case when exists (select 1 from _rls_results where outcome = 'FAIL')
            then 'SOMETHING FAILED — do not build screens on this'
            else 'ALL CHECKS PASSED' end,
       (select count(*)::text || ' test record(s) left behind (must be 0)'
          from public.leave_requests where reason like 'ZZ RLS test%')
 order by 1;
