-- 0018 — Phase 9: sign in with an employee ID as well as an email.
--
-- Supabase Auth is keyed on email. "6068" is not an email, so it has to be
-- resolved to one BEFORE signInWithPassword is called — and the person doing
-- the resolving is not signed in yet, so it has to be reachable by `anon`.
--
-- What this function will and will not hand out:
--   * it returns ONE thing, the work email, and nothing else. Not the name,
--     not the department, not whether they are on notice.
--   * it returns nothing for a resigned employee. Their login is gone; their
--     ID should not be a way to find their address.
--   * it is the ONLY new thing `anon` can call. `employees` itself stays
--     unreadable to anon, exactly as 0006 left it.
--
-- The honest limitation, stated rather than hidden: a four-digit code is a
-- 9,000-wide space, so anybody who can call this can walk it and collect the
-- work emails of everyone employed here. That is a small leak — work emails
-- are semi-public and a password is still required — but it is a real one, so
-- there is a throttle below. It cannot be per-IP: Postgres does not see the
-- caller's address through PostgREST. It is a GLOBAL ceiling instead, which is
-- what actually stops a script: a human signing in a few times a minute never
-- reaches it, and a machine walking 9,000 codes hits it immediately. During an
-- attack a real person is told to use their email address, which still works.

-- ---------------------------------------------------------------- throttle
create table if not exists public.employee_code_lookups (
  id           bigserial primary key,
  looked_up_at timestamptz not null default now()
);

create index if not exists employee_code_lookups_at
  on public.employee_code_lookups (looked_up_at desc);

-- RLS on, and deliberately NO policies. Nobody selects, inserts, updates or
-- deletes this table through the API — the security-definer function below is
-- the only thing that ever touches it.
alter table public.employee_code_lookups enable row level security;
revoke all on public.employee_code_lookups from anon, authenticated;

-- ---------------------------------------------------------------- resolver
create or replace function public.email_for_employee_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := btrim(coalesce(p_code, ''));
  v_recent integer;
  v_email  text;
begin
  if v_code = '' then
    return null;
  end if;

  -- keep the throttle table small; nothing here needs history
  delete from public.employee_code_lookups
   where looked_up_at < now() - interval '10 minutes';

  select count(*) into v_recent
    from public.employee_code_lookups
   where looked_up_at > now() - interval '1 minute';

  if v_recent >= 30 then
    -- a distinct message so the sign-in screen can say something true
    raise exception 'rate_limited';
  end if;

  insert into public.employee_code_lookups default values;

  -- The profile's email is the one Auth actually holds; work_email is what HR
  -- typed and is the fallback for an employee whose login was made by hand.
  select coalesce(pr.email, e.work_email)
    into v_email
    from public.employees e
    left join public.profiles pr on pr.id = e.profile_id
   where e.employee_code = v_code
     and e.status <> 'resigned'
   limit 1;

  return nullif(btrim(coalesce(v_email, '')), '');
end;
$$;

revoke all on function public.email_for_employee_code(text) from public;
grant execute on function public.email_for_employee_code(text) to anon, authenticated;

-- ---------------------------------------------------------------- proof
-- Read the rows this returns. A missing grant is the failure that makes every
-- later call raise, so it is the thing worth seeing.
select 'function exists' as check,
       (to_regprocedure('public.email_for_employee_code(text)') is not null)::text as result
union all
select 'anon can execute',
       has_function_privilege('anon', 'public.email_for_employee_code(text)', 'execute')::text
union all
select 'anon cannot read the throttle table',
       (not has_table_privilege('anon', 'public.employee_code_lookups', 'select'))::text
union all
select 'anon still cannot read employees',
       (not has_table_privilege('anon', 'public.employees', 'select'))::text;
