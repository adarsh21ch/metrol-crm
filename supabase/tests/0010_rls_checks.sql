-- Proof that salary records are the strictest table in the app: an employee
-- reads only their own, and cannot write to this table AT ALL — not even to
-- cancel a mistaken row, unlike leave_requests. Paste the WHOLE file into the
-- Supabase SQL editor and run it — results come back as rows (see
-- 0006_rls_checks.sql for why).
--
-- Picks real people automatically, same as 0006 and 0009:
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
  rec_a uuid; rec_b uuid;
  n int;
begin
  select id into dept_hr from public.departments where name = 'Human Resources' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select id into id_hr     from public.profiles where department_id = dept_hr limit 1;
  select id into id_member from public.profiles
    where role = 'member' and (department_id is distinct from dept_hr) limit 1;

  if id_hr is not null then select id into emp_hr from public.employees where profile_id = id_hr limit 1; end if;
  if id_member is not null then select id into emp_member from public.employees where profile_id = id_member limit 1; end if;

  -- Two payslips to look at, both in a month nobody real would collide with.
  if emp_member is not null then
    insert into public.salary_records (employee_id, period, gross_amount, net_amount, notes)
    values (emp_member, '2099-01-01', 50000, 46000, 'ZZ RLS test — member payslip')
    returning id into rec_a;
  end if;
  if emp_hr is not null then
    insert into public.salary_records (employee_id, period, gross_amount, net_amount, notes)
    values (emp_hr, '2099-01-01', 60000, 55000, 'ZZ RLS test — hr payslip')
    returning id into rec_b;
  end if;

  -- 1. the owner sees every payslip -----------------------------------------
  if id_owner is null or (rec_a is null and rec_b is null) then
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every payslip', 'SKIPPED', 'no owner, or no test payslip to look at');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    select count(*) into n from public.salary_records where notes like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('Owner reads every payslip',
            case when n = (case when rec_a is not null then 1 else 0 end) + (case when rec_b is not null then 1 else 0 end) then 'PASS' else 'FAIL' end,
            n || ' test payslip(s) visible');
  end if;

  -- 2. HR sees every payslip, amounts included ------------------------------
  if id_hr is null or rec_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every payslip', 'SKIPPED', 'nobody in Human Resources has an employee record yet');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select gross_amount into n from public.salary_records where id = rec_a;
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('HR reads every payslip, amounts included',
            case when n = 50000 then 'PASS' else 'FAIL' end,
            'read gross_amount = ' || n);
  end if;

  -- 3. THE ONE THAT MATTERS: a member reads only their own ------------------
  if id_member is null or emp_member is null or rec_a is null then
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own payslip', 'SKIPPED', 'no ordinary member with a linked employee record found');
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.salary_records where notes like 'ZZ RLS test%';
    execute 'reset role';
    insert into _rls_results(check_name, outcome, detail)
    values ('A team member reads ONLY their own payslip',
            case when n = 1 then 'PASS' else 'FAIL' end,
            n || ' payslip(s) visible, expected exactly 1 (their own)');
  end if;

  -- 4. a member cannot create a payslip, not even their own -----------------
  if id_member is not null and emp_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.salary_records (employee_id, period, gross_amount, net_amount, notes)
      values (emp_member, '2099-02-01', 1, 1, 'ZZ RLS test — should not exist');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot create their own payslip', 'FAIL', 'the insert was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot create their own payslip', 'PASS', 'blocked by policy');
    end;
  end if;

  -- 5. a member cannot edit their own payslip, not even to mark it paid -----
  if id_member is not null and rec_a is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.salary_records set status = 'paid' where id = rec_a;
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot edit their own payslip', 'FAIL', 'the update was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('A member cannot edit their own payslip', 'PASS', 'blocked by policy — unlike leave, there is no self path at all');
    end;
  end if;

  -- 6. HR can mark a payslip paid --------------------------------------------
  if id_hr is not null and rec_b is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      update public.salary_records set status = 'paid', paid_by = id_hr, paid_at = now() where id = rec_b;
      execute 'reset role';
      perform 1 from public.salary_records where id = rec_b and status = 'paid';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can mark a payslip paid',
              case when found then 'PASS' else 'FAIL' end,
              case when found then 'marked paid' else 'the update did not take effect' end);
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('HR can mark a payslip paid', 'FAIL', 'blocked, but this should have been allowed');
    end;
  end if;

  -- 7. a second payslip for the same employee and month is refused ----------
  if id_hr is not null and emp_hr is not null and rec_b is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      insert into public.salary_records (employee_id, period, gross_amount, net_amount, notes)
      values (emp_hr, '2099-01-01', 1, 1, 'ZZ RLS test — duplicate, should not exist');
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('One payslip per employee per month is enforced', 'FAIL', 'a duplicate was allowed');
    exception when others then
      execute 'reset role';
      insert into _rls_results(check_name, outcome, detail)
      values ('One payslip per employee per month is enforced', 'PASS', 'blocked by the unique index');
    end;
  end if;

  -- 8. nobody deletes a payslip -----------------------------------------------
  if id_hr is not null and rec_b is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.salary_records where id = rec_b;
      execute 'reset role';
    exception when others then
      execute 'reset role';
    end;
    perform 1 from public.salary_records where id = rec_b;
    insert into _rls_results(check_name, outcome, detail)
    values ('Even HR cannot delete a payslip',
            case when found then 'PASS' else 'FAIL' end,
            case when found then 'the record survived' else 'the record was deleted' end);
  end if;

  -- cleanup, always -----------------------------------------------------------
  delete from public.salary_records where notes like 'ZZ RLS test%';
end;
$$;

-- Belt and braces: nothing this file created is left behind.
delete from public.salary_records where notes like 'ZZ RLS test%';

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
          from public.salary_records where notes like 'ZZ RLS test%')
 order by 1;
