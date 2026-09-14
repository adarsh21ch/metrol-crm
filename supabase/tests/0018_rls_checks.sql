-- 0018 RLS checks — Phase 9, sign in with an employee ID.
--
-- Run AFTER 0018. Results come back as rows (the SQL editor does not show
-- RAISE NOTICE — that lesson cost this project a silent test file once).
-- Everything runs inside one transaction that ROLLS BACK, so nothing here
-- can leave a row behind even if a check raises.
--
-- It borrows a real employee rather than inventing one, and reports SKIPPED
-- instead of a quiet PASS when there is nobody to borrow.

begin;

create temporary table results (n int generated always as identity, check_name text, result text) on commit drop;

do $$
declare
  v_emp        public.employees%rowtype;
  v_expected   text;
  v_got        text;
  v_raised     text;
  i            integer;
begin
  ------------------------------------------------------------------ grants
  insert into results (check_name, result) values (
    '01 function exists',
    case when to_regprocedure('public.email_for_employee_code(text)') is not null
         then 'PASS' else 'FAIL' end);

  insert into results (check_name, result) values (
    '02 anon may execute it',
    case when has_function_privilege('anon', 'public.email_for_employee_code(text)', 'execute')
         then 'PASS' else 'FAIL — every later check will raise' end);

  -- Ask the question as anon, and count the rows. The earlier version of this
  -- check asked has_table_privilege() instead, which is TRUE for every table in
  -- a Supabase project by default and so reported a leak that did not exist —
  -- RLS, not the grant, is what returns nothing to an unauthenticated caller.
  begin
    execute 'set local role anon';
    perform set_config('request.jwt.claims', null, true);
    execute 'select count(*) from public.employees' into i;
    execute 'reset role';
    insert into results (check_name, result) values (
      '03 anon reads zero employee rows',
      case when i = 0 then 'PASS' else 'FAIL — anon read ' || i || ' rows' end);
  exception when insufficient_privilege then
    execute 'reset role';
    insert into results (check_name, result) values (
      '03 anon reads zero employee rows', 'PASS — refused at the grant, before RLS');
  when others then
    execute 'reset role';
    insert into results (check_name, result) values (
      '03 anon reads zero employee rows', 'FAIL — ' || sqlerrm);
  end;

  insert into results (check_name, result) values (
    '04 anon cannot read the throttle table',
    case when not has_table_privilege('anon', 'public.employee_code_lookups', 'select')
         then 'PASS' else 'FAIL' end);

  ------------------------------------------------- borrow a real employee
  select * into v_emp
    from public.employees
   where status <> 'resigned'
     and coalesce(employee_code, '') <> ''
   order by created_at
   limit 1;

  if v_emp.id is null then
    insert into results (check_name, result) values
      ('05 a real code resolves to an email', 'SKIPPED — no active employee with a code on record'),
      ('06 the email is the right one',       'SKIPPED — same'),
      ('07 a resigned code resolves to null', 'SKIPPED — same');
  else
    select coalesce(pr.email, v_emp.work_email)
      into v_expected
      from public.employees e
      left join public.profiles pr on pr.id = e.profile_id
     where e.id = v_emp.id;

    v_got := public.email_for_employee_code(v_emp.employee_code);

    insert into results (check_name, result) values (
      '05 a real code resolves to an email',
      case when v_got is not null then 'PASS — ' || v_got else 'FAIL — got null for ' || v_emp.employee_code end);

    insert into results (check_name, result) values (
      '06 the email is the right one',
      case when v_got is not distinct from nullif(btrim(coalesce(v_expected, '')), '')
           then 'PASS' else 'FAIL — expected ' || coalesce(v_expected, 'null') || ', got ' || coalesce(v_got, 'null') end);

    -- resign them inside the transaction; the rollback puts it back
    update public.employees set status = 'resigned' where id = v_emp.id;
    v_got := public.email_for_employee_code(v_emp.employee_code);
    insert into results (check_name, result) values (
      '07 a resigned code resolves to null',
      case when v_got is null then 'PASS' else 'FAIL — leaked ' || v_got || ' for a resigned employee' end);
    update public.employees set status = v_emp.status where id = v_emp.id;
  end if;

  ------------------------------------------------------------ unknown code
  insert into results (check_name, result) values (
    '08 an unknown code resolves to null',
    case when public.email_for_employee_code('0000') is null
         then 'PASS' else 'FAIL' end);

  insert into results (check_name, result) values (
    '09 an empty code resolves to null',
    case when public.email_for_employee_code('') is null
         then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------- throttle
  -- 30 lookups in a minute is the ceiling. Fire enough to cross it and
  -- confirm the 31st raises rather than answering.
  delete from public.employee_code_lookups;
  for i in 1..30 loop
    perform public.email_for_employee_code('0000');
  end loop;

  begin
    perform public.email_for_employee_code('0000');
    insert into results (check_name, result) values (
      '10 the 31st lookup in a minute is refused', 'FAIL — it answered');
  exception when others then
    insert into results (check_name, result) values (
      '10 the 31st lookup in a minute is refused',
      case when sqlerrm = 'rate_limited' then 'PASS' else 'FAIL — raised ' || sqlerrm end);
  end;

  -- and it recovers: age the rows past the window and it answers again
  update public.employee_code_lookups set looked_up_at = now() - interval '5 minutes';
  begin
    perform public.email_for_employee_code('0000');
    insert into results (check_name, result) values ('11 it recovers after the minute', 'PASS');
  exception when others then
    insert into results (check_name, result) values ('11 it recovers after the minute', 'FAIL — still ' || sqlerrm);
  end;

  delete from public.employee_code_lookups;
  insert into results (check_name, result) values ('12 clean up', 'PASS');

exception when others then
  insert into results (check_name, result) values ('!! aborted', sqlerrm);
end;
$$;

select check_name, result from results order by n;

rollback;
