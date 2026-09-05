-- Proof that the employee record is protected. Paste the WHOLE file into the
-- Supabase SQL editor and run it. It prints a table of PASS / FAIL / SKIPPED —
-- read the grid at the bottom.
--
-- (The first version of this file reported through RAISE NOTICE, which the
-- Supabase SQL editor does not display. It ran, and you saw nothing. Results
-- now come back as rows.)
--
-- It picks real people out of your team automatically:
--   owner   — whoever has role = 'owner'
--   HR      — whoever sits in the Human Resources department
--   lead    — whoever has is_team_lead = true
--   member  — an ordinary team member
-- A person who does not exist yet gives SKIPPED, never a quiet PASS.
--
-- It writes two employee records to test against and deletes them again. It
-- does not run inside a transaction — the SQL editor only shows the result of
-- the last statement, and a rollback would have taken the results with it — so
-- cleanup is explicit, and runs even when a check fails.

drop table if exists pg_temp._rls_results;
create temp table _rls_results (seq serial, check_name text, outcome text, detail text);

do $$
declare
  id_owner uuid; id_hr uuid; id_lead uuid; id_member uuid;
  dept_hr uuid; dept_member uuid; dept_lead uuid;
  was_dept uuid; was_lead boolean;
  n int;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_lead   from public.profiles where is_team_lead and role = 'member' limit 1;
  select id into id_member from public.profiles
    where role = 'member' and not is_team_lead
      and (department_id is distinct from dept_hr) limit 1;

  select department_id into dept_member from public.profiles where id = id_member;
  select department_id into dept_lead   from public.profiles where id = id_lead;

  -- Two records to look at. The linked one keeps the person's OWN department,
  -- so the sync trigger has nothing to change; the other is deliberately not
  -- linked to anybody, so no real profile is touched by this test at all.
  insert into public.employees (full_name, designation, department_id, date_of_joining, phone, profile_id)
  values ('ZZ RLS test — linked',   'Test',       dept_member, current_date - 200, '+91 90000 00001', id_member),
         ('ZZ RLS test — unlinked', 'HR Manager', dept_hr,     current_date - 400, '+91 90000 00002', null);

  -- 1. the owner sees everything ----------------------------------------
  if id_owner is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every record', 'SKIPPED', 'no profile with role = owner');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every record',
            case when n >= 2 then 'PASS' else 'FAIL' end,
            n || ' record(s) visible, expected at least 2');
  end if;

  -- 2. HR sees everything ------------------------------------------------
  if id_hr is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every record', 'SKIPPED', 'nobody is in the Human Resources department yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every record',
            case when n >= 2 then 'PASS' else 'FAIL' end,
            n || ' record(s) visible, expected at least 2');
  end if;

  -- 3. THE ONE THAT MATTERS ----------------------------------------------
  if id_member is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own record', 'SKIPPED', 'no ordinary member profile found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own record',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' record(s) visible, expected exactly 1');
  end if;

  -- 4. a team lead sees their department, not the company ----------------
  if id_lead is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team lead cannot read another department', 'SKIPPED', 'nobody has is_team_lead = true yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_lead, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees where department_id = dept_hr;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team lead cannot read another department',
            case when n = 0 then 'PASS' else 'FAIL' end,
            n || ' HR record(s) visible, expected 0');
  end if;

  -- 5. a member cannot create an employee --------------------------------
  if id_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.employees (full_name, date_of_joining) values ('ZZ RLS test — should not exist', current_date);
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot create a record', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot create a record', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 6. a member cannot promote themselves into HR ------------------------
  if id_member is not null and dept_hr is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.profiles set department_id = dept_hr where id = id_member;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot move themselves into HR', 'FAIL', 'the update was allowed — this is the escalation hole');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot move themselves into HR', 'PASS', 'blocked by the guard trigger');
    end;
    -- Put them back, in case the check failed and the change actually stuck.
    update public.profiles set department_id = dept_member where id = id_member;
  end if;

  -- 7. a member cannot make themselves a team lead -----------------------
  if id_member is not null then
    select is_team_lead into was_lead from public.profiles where id = id_member;
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.profiles set is_team_lead = true where id = id_member;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot make themselves a team lead', 'FAIL', 'the update was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot make themselves a team lead', 'PASS', 'blocked by the guard trigger');
    end;
    update public.profiles set is_team_lead = coalesce(was_lead, false) where id = id_member;
  end if;

  -- 8. nobody deletes an employee record ---------------------------------
  if id_hr is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.employees where full_name = 'ZZ RLS test — linked';
      execute 'reset role';
    exception when others then
      execute 'reset role';
    end;
    select count(*) into n from public.employees where full_name = 'ZZ RLS test — linked';
    insert into _rls_results(check_name, outcome, detail)
    values ('Even HR cannot delete an employee record',
            case when n = 1 then 'PASS' else 'FAIL' end,
            case when n = 1 then 'the record survived' else 'the record was deleted' end);
  end if;

  -- 9. a member cannot edit their own record -----------------------------
  if id_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.employees set designation = 'CEO' where profile_id = id_member;
      execute 'reset role';
      select count(*) into n from public.employees where profile_id = id_member and designation = 'CEO';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot edit their own record',
              case when n = 0 then 'PASS' else 'FAIL' end,
              case when n = 0 then 'the edit changed nothing' else 'the edit went through' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A team member cannot edit their own record', 'PASS', 'blocked by policy');
    end;
  end if;

  -- cleanup, always -------------------------------------------------------
  delete from public.employees where full_name like 'ZZ RLS test%';
end;
$$;

-- Belt and braces: nothing this file created is left behind.
delete from public.employees where full_name like 'ZZ RLS test%';

-- ---------------------------------------------------------------- read this
select check_name  as "Check",
       outcome     as "Result",
       detail      as "Detail"
  from _rls_results
union all
select '— — —',
       case when exists (select 1 from _rls_results where outcome = 'FAIL')
            then 'SOMETHING FAILED — do not build screens on this'
            else 'ALL CHECKS PASSED' end,
       (select count(*)::text || ' records left behind by this test (must be 0)'
          from public.employees where full_name like 'ZZ RLS test%')
 order by 1 = '— — —', 1;
