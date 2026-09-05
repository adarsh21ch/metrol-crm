-- Proof that the employee record is protected. Paste the WHOLE file into the
-- Supabase SQL editor and run it. It writes nothing permanent: everything
-- happens inside a transaction that rolls back at the end.
--
-- It picks real people out of your team automatically:
--   owner   — whoever has role = 'owner'
--   HR      — whoever sits in the Human Resources department
--   lead    — whoever has is_team_lead = true
--   member  — an ordinary salesperson
-- If one of them does not exist yet, that check says SKIPPED instead of
-- pretending to pass. Read the NOTICE lines at the bottom of the output.

begin;

do $$
declare
  id_owner  uuid;
  id_hr     uuid;
  id_lead   uuid;
  id_member uuid;
  dept_hr   uuid;
  dept_sales uuid;
  n int;
  fails int := 0;

begin
  select id into dept_hr    from public.departments where name = 'Human Resources' limit 1;
  select id into dept_sales from public.departments where name = 'Sales' limit 1;

  select id into id_owner  from public.profiles where role = 'owner' limit 1;
  select p.id into id_hr    from public.profiles p where p.department_id = dept_hr limit 1;
  select id into id_lead   from public.profiles where is_team_lead and role = 'member' limit 1;
  select id into id_member from public.profiles
    where role = 'member' and not is_team_lead
      and (department_id is distinct from dept_hr) limit 1;

  -- Two records to look at: one in Sales, one in HR.
  insert into public.employees (full_name, designation, department_id, date_of_joining, phone, profile_id)
  values ('Test Sales Person', 'Sales Executive', dept_sales, current_date - 200, '+91 90000 00001', id_member),
         ('Test HR Person',    'HR Manager',      dept_hr,    current_date - 400, '+91 90000 00002', id_hr);

  raise notice '--------------------------------------------------';

  -- 1. the owner sees everything -----------------------------------------
  if id_owner is null then
    raise notice 'SKIPPED  owner — no profile with role = owner';
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_owner, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    if n >= 2 then raise notice 'PASS     owner reads every record (% visible)', n;
    else fails := fails + 1; raise notice 'FAIL     owner should read every record, saw %', n; end if;
  end if;

  -- 2. HR sees everything -------------------------------------------------
  if id_hr is null then
    raise notice 'SKIPPED  HR — nobody is in the Human Resources department yet';
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    if n >= 2 then raise notice 'PASS     HR reads every record (% visible)', n;
    else fails := fails + 1; raise notice 'FAIL     HR should read every record, saw %', n; end if;
  end if;

  -- 3. THE ONE THAT MATTERS: a salesperson sees only themselves -----------
  if id_member is null then
    raise notice 'SKIPPED  member — no ordinary member profile found';
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees;
    execute 'reset role';
    if n = 1 then raise notice 'PASS     salesperson reads only their own record';
    else fails := fails + 1; raise notice 'FAIL     salesperson saw % records, expected exactly 1', n; end if;
  end if;

  -- 4. a team lead sees their own department, not the whole company -------
  if id_lead is null then
    raise notice 'SKIPPED  team lead — nobody has is_team_lead = true yet';
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', id_lead, 'role', 'authenticated')::text, true);
    select count(*) into n from public.employees where department_id = dept_hr;
    execute 'reset role';
    if n = 0 then raise notice 'PASS     team lead cannot read another department';
    else fails := fails + 1; raise notice 'FAIL     team lead read % HR record(s)', n; end if;
  end if;

  -- 5. a salesperson cannot create an employee ---------------------------
  if id_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      insert into public.employees (full_name, date_of_joining) values ('Should Not Exist', current_date);
      execute 'reset role';
      fails := fails + 1;
      raise notice 'FAIL     a salesperson was able to create an employee record';
    exception when others then
      execute 'reset role';
      raise notice 'PASS     a salesperson cannot create an employee record';
    end;
  end if;

  -- 6. a salesperson cannot promote themselves into HR -------------------
  if id_member is not null and dept_hr is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.profiles set department_id = dept_hr where id = id_member;
      execute 'reset role';
      fails := fails + 1;
      raise notice 'FAIL     a salesperson moved themselves into Human Resources';
    exception when others then
      execute 'reset role';
      raise notice 'PASS     a salesperson cannot move themselves into Human Resources';
    end;
  end if;

  -- 7. a salesperson cannot make themselves a team lead ------------------
  if id_member is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_member, 'role', 'authenticated')::text, true);
      update public.profiles set is_team_lead = true where id = id_member;
      execute 'reset role';
      fails := fails + 1;
      raise notice 'FAIL     a salesperson made themselves a team lead';
    exception when others then
      execute 'reset role';
      raise notice 'PASS     a salesperson cannot make themselves a team lead';
    end;
  end if;

  -- 8. nobody can delete an employee record ------------------------------
  if id_hr is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', id_hr, 'role', 'authenticated')::text, true);
      delete from public.employees where full_name = 'Test Sales Person';
      execute 'reset role';
      -- A revoked DELETE raises; RLS with no policy silently deletes nothing.
      select count(*) into n from public.employees where full_name = 'Test Sales Person';
      if n = 1 then raise notice 'PASS     even HR cannot delete an employee record';
      else fails := fails + 1; raise notice 'FAIL     an employee record was deleted'; end if;
    exception when others then
      execute 'reset role';
      raise notice 'PASS     even HR cannot delete an employee record';
    end;
  end if;

  raise notice '--------------------------------------------------';
  if fails = 0 then raise notice 'ALL CHECKS PASSED — nothing above said FAIL';
  else raise notice '% CHECK(S) FAILED — do not build screens on this', fails; end if;
  raise notice 'Nothing was saved. This all rolls back.';
end;
$$;

rollback;
