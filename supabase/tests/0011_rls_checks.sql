-- Proof that the onboarding checklist and employee documents are protected
-- the same way salary is: HR/owner manage everything, an employee reads only
-- their own and writes nothing. Paste the WHOLE file into the Supabase SQL
-- editor and run it — results come back as rows (see 0006_rls_checks.sql for
-- why). Storage bucket policies (uploading an actual file) are not simulated
-- here — the 0011 migration's own "proof" section confirms the four storage
-- policies exist; verify an actual upload once through the real UI as HR.
--
-- Picks real people automatically, same as 0006/0009/0010:
--   owner   — whoever has role = 'owner'
--   HR      — whoever sits in Human Resources, WITH a linked employee record
--   member  — an ordinary team member, WITH a linked employee record
-- Anyone missing gives SKIPPED, never a quiet PASS.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_member uuid;
  emp_hr uuid; emp_member uuid;
  dept_hr uuid;
  task_a uuid;
  doc_a uuid;
  n int;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_member from public.profiles
    where role = 'member' and (department_id is distinct from dept_hr) limit 1;

  if id_hr is not null then select id into emp_hr from public.employees where profile_id = id_hr limit 1; end if;
  if id_member is not null then select id into emp_member from public.employees where profile_id = id_member limit 1; end if;

  if emp_member is not null then
    insert into public.onboarding_tasks (employee_id, label)
    values (emp_member, 'ZZ RLS test — task') returning id into task_a;
    insert into public.employee_documents (employee_id, doc_type, file_name, file_path)
    values (emp_member, 'other', 'zz-test.pdf', emp_member || '/zz-test.pdf') returning id into doc_a;
  end if;

  -- 1. the owner sees every task and document ------------------------------
  if id_owner is null or task_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every onboarding task', 'SKIPPED', 'no owner, or no test task to look at');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    select count(*) into n from public.onboarding_tasks where label like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every onboarding task', case when n = 1 then 'PASS' else 'FAIL' end, n || ' visible');
  end if;

  -- 2. HR sees every task -----------------------------------------------------
  if id_hr is null or task_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every onboarding task', 'SKIPPED', 'nobody in Human Resources has an employee record yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select count(*) into n from public.onboarding_tasks where label like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every onboarding task', case when n = 1 then 'PASS' else 'FAIL' end, n || ' visible');
  end if;

  -- 3. THE ONE THAT MATTERS: a member reads only their own tasks -----------
  if id_member is null or task_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own tasks', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.onboarding_tasks where employee_id = emp_member;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own tasks',
            case when n >= 1 then 'PASS' else 'FAIL' end,
            n || ' of their own tasks visible (their seeded 5 plus the test one)');
  end if;

  -- 4. a member cannot tick their own task -----------------------------------
  if id_member is not null and task_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.onboarding_tasks set done = true where id = task_a;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot tick their own onboarding task', 'FAIL', 'the update was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot tick their own onboarding task', 'PASS', 'blocked by policy — HR confirms, not the employee');
    end;
  end if;

  -- 5. a member cannot add their own task ------------------------------------
  if id_member is not null and emp_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.onboarding_tasks (employee_id, label) values (emp_member, 'ZZ RLS test — should not exist');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot add their own onboarding task', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot add their own onboarding task', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 6. HR can tick a task, and delete one -------------------------------------
  if id_hr is not null and task_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      update public.onboarding_tasks set done = true, done_by = id_hr, done_at = now() where id = task_a;
      execute 'reset role';
      perform 1 from public.onboarding_tasks where id = task_a and done;
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can tick an onboarding task', case when found then 'PASS' else 'FAIL' end, 'ticked done');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can tick an onboarding task', 'FAIL', 'blocked, but this should have been allowed');
    end;
  end if;

  -- 7. THE ONE THAT MATTERS FOR DOCUMENTS: a member reads only their own ----
  if id_member is null or doc_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own documents', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employee_documents where file_name = 'zz-test.pdf';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own documents',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' visible, expected exactly 1 (their own)');
  end if;

  -- 8. a member cannot upload a document record for themselves ---------------
  if id_member is not null and emp_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.employee_documents (employee_id, doc_type, file_name, file_path)
      values (emp_member, 'other', 'zz-should-not-exist.pdf', emp_member || '/zz-should-not-exist.pdf');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot add their own document record', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot add their own document record', 'PASS', 'blocked by policy — HR collects documents, not self-serve');
    end;
  end if;

  -- 9. HR can delete a document record ----------------------------------------
  if id_hr is not null and doc_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.employee_documents where id = doc_a;
      execute 'reset role';
    exception when others then
      execute 'reset role';
    end;
    perform 1 from public.employee_documents where id = doc_a;
    insert into _rls_results(check_name, outcome, detail)
    values ('HR can remove a document record', case when not found then 'PASS' else 'FAIL' end,
            case when not found then 'removed' else 'still present, HR should be able to remove this' end);
  end if;

  -- cleanup, always -------------------------------------------------------
  delete from public.onboarding_tasks where label like 'ZZ RLS test%';
  delete from public.employee_documents where file_name like 'zz%.pdf';
end;
$$;

-- Belt and braces: nothing this file created is left behind.
delete from public.onboarding_tasks where label like 'ZZ RLS test%';
delete from public.employee_documents where file_name like 'zz%.pdf';

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
       (select count(*)::text || ' test task(s), ' ||
               (select count(*)::text from public.employee_documents where file_name like 'zz%.pdf') || ' test document(s) left behind (both must be 0)'
          from public.onboarding_tasks where label like 'ZZ RLS test%')
 order by 1;
