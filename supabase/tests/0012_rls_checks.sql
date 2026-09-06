-- Proof for Phase 5. Two different shapes on purpose:
--   exit_records  — owner/HR ONLY, no employee self-select at all (the
--                   privacy call recorded in 0012's header).
--   exit_tasks    — same shape as onboarding_tasks: HR/owner manage, the
--                   employee reads only their own, writes nothing.
-- Paste the WHOLE file into the Supabase SQL editor and run it — results
-- come back as rows (see 0006_rls_checks.sql for why).
--
-- Picks real people automatically, same as the earlier phase test files.
-- Anyone missing gives SKIPPED, never a quiet PASS. Uses a real member's
-- employee record and puts their status back to what it was afterward —
-- flipping status is what fires the seed trigger, so this cannot be tested
-- without it, and undoing it matters because status also decides who shows
-- up in 0006/0009/0010's own checks.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_member uuid;
  emp_hr uuid; emp_member uuid;
  dept_hr uuid;
  was_status text;
  rec_a uuid;
  task_a uuid;
  n int;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_member from public.profiles
    where role = 'member' and (department_id is distinct from dept_hr) limit 1;

  if id_hr is not null then select id into emp_hr from public.employees where profile_id = id_hr limit 1; end if;
  if id_member is not null then select id into emp_member from public.employees where profile_id = id_member limit 1; end if;

  -- Only flip a real member's status if they have no exit_tasks yet — i.e.
  -- they have never actually left before — so this test's cleanup can safely
  -- remove every exit_tasks row for them afterward without guessing which
  -- ones it created.
  if emp_member is not null and exists (select 1 from public.exit_tasks where employee_id = emp_member) then
    emp_member := null;
  end if;

  if emp_member is not null then
    select status into was_status from public.employees where id = emp_member;
    -- Flip to 'notice' and back — fires seed_exit_tasks, gives us a real
    -- checklist to test against, and restores the person's real status.
    update public.employees set status = 'notice' where id = emp_member;
    select id into task_a from public.exit_tasks where employee_id = emp_member limit 1;
    insert into public.exit_records (employee_id, reason, exit_interview_notes)
    values (emp_member, 'ZZ RLS test — reason', 'ZZ RLS test — confidential notes')
    returning id into rec_a;
  end if;

  -- 1. owner reads the exit record, reason included ---------------------------
  if id_owner is null or rec_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads the exit record', 'SKIPPED', 'no owner, or no test record to look at');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    perform 1 from public.exit_records where id = rec_a and reason = 'ZZ RLS test — reason';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads the exit record', case when found then 'PASS' else 'FAIL' end, 'reason field readable');
  end if;

  -- 2. HR reads the exit record too --------------------------------------------
  if id_hr is null or rec_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads the exit record', 'SKIPPED', 'nobody in Human Resources has an employee record yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    perform 1 from public.exit_records where id = rec_a;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads the exit record', case when found then 'PASS' else 'FAIL' end, 'visible to HR');
  end if;

  -- 3. THE ONE THAT MATTERS: the employee CANNOT read their own exit record ---
  if id_member is null or rec_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('An employee CANNOT read their own exit record', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.exit_records where employee_id = emp_member;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('An employee CANNOT read their own exit record',
            case when n = 0 then 'PASS' else 'FAIL' end,
            n || ' row(s) visible, expected 0 — the reason/notes are HR-only by design');
  end if;

  -- 4. the checklist was seeded by the status flip -----------------------------
  if emp_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('Exit checklist auto-seeded on leaving active', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    select count(*) into n from public.exit_tasks where employee_id = emp_member;
    insert into _rls_results(check_name, outcome, detail)
    values ('Exit checklist auto-seeded on leaving active',
            case when n >= 6 then 'PASS' else 'FAIL' end,
            n || ' task(s) present, expected at least 6');
  end if;

  -- 5. the employee CAN read their own exit checklist --------------------------
  if id_member is null or task_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('An employee CAN read their own exit checklist', 'SKIPPED', 'no seeded task to look at');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.exit_tasks where employee_id = emp_member;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('An employee CAN read their own exit checklist',
            case when n >= 6 then 'PASS' else 'FAIL' end,
            n || ' task(s) visible');
  end if;

  -- 6. the employee cannot tick their own exit task ----------------------------
  if id_member is not null and task_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.exit_tasks set done = true where id = task_a;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('An employee cannot tick their own exit task', 'FAIL', 'the update was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('An employee cannot tick their own exit task', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 7. HR can tick an exit task -------------------------------------------------
  if id_hr is not null and task_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      update public.exit_tasks set done = true, done_by = id_hr, done_at = now() where id = task_a;
      execute 'reset role';
      perform 1 from public.exit_tasks where id = task_a and done;
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can tick an exit task', case when found then 'PASS' else 'FAIL' end, 'ticked done');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can tick an exit task', 'FAIL', 'blocked, but this should have been allowed');
    end;
  end if;

  -- 8. nobody deletes an exit record --------------------------------------------
  if id_hr is not null and rec_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.exit_records where id = rec_a;
      execute 'reset role';
    exception when others then
      execute 'reset role';
    end;
    perform 1 from public.exit_records where id = rec_a;
    insert into _rls_results(check_name, outcome, detail)
    values ('Even HR cannot delete an exit record', case when found then 'PASS' else 'FAIL' end,
            case when found then 'the record survived' else 'the record was deleted' end);
  end if;

  -- cleanup, always -------------------------------------------------------------
  delete from public.exit_records where reason like 'ZZ RLS test%';
  if emp_member is not null and was_status is not null then
    update public.employees set status = was_status where id = emp_member;
    -- Safe because of the guard above: this member had no exit_tasks before
    -- this test ran, so every row for them now was seeded by this test.
    delete from public.exit_tasks where employee_id = emp_member;
  end if;
end;
$$;

-- Belt and braces.
delete from public.exit_records where reason like 'ZZ RLS test%';

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
       (select count(*)::text || ' test exit record(s) left behind (must be 0)'
          from public.exit_records where reason like 'ZZ RLS test%')
 order by 1;
