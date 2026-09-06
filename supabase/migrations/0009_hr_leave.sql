-- HR module — Phase 2: leave requests, approvals, and balance.
-- Run once in the Supabase SQL editor, same as 0006 — schema and RLS ship in
-- one file so the table is never briefly readable by everyone.

-- ============================================ 1. balance lives on the employee
--
-- One number, not a ledger table: how many days a person is entitled to this
-- year. Remaining balance is entitlement minus their own approved days in the
-- current year, computed by the app rather than stored, so there is nothing
-- to keep in sync when a request is approved, edited or cancelled.
alter table public.employees
  add column if not exists annual_leave_days numeric(5,1) not null default 18;

-- ============================================ 2. who is asking, answered once
--
-- security definer for the same reason is_hr() is: a policy on leave_requests
-- that queried employees directly would still need employees_select to allow
-- it, and the requester is not always allowed to read every employees row.
create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.employees where profile_id = auth.uid() limit 1 $$;

-- ============================================ 3. the leave request

create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,

  start_date    date not null,
  end_date      date not null,
  -- Inclusive day count, set by the trigger below — never trusted from the
  -- client, so a mismatched request cannot inflate or shrink a balance.
  days_count    int  not null default 0,
  reason        text not null default '',

  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','cancelled')),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (end_date >= start_date)
);

create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id);
create index if not exists leave_requests_status_idx   on public.leave_requests (status);

create or replace function public.set_leave_days_count()
returns trigger language plpgsql set search_path = public as $$
begin
  new.days_count := (new.end_date - new.start_date) + 1;
  return new;
end;
$$;

drop trigger if exists leave_requests_set_days on public.leave_requests;
create trigger leave_requests_set_days
  before insert or update of start_date, end_date on public.leave_requests
  for each row execute function public.set_leave_days_count();

drop trigger if exists leave_requests_touch on public.leave_requests;
create trigger leave_requests_touch
  before update on public.leave_requests
  for each row execute function public.touch_updated_at();

-- ============================================ 4. row-level security

alter table public.leave_requests enable row level security;

-- READ — owner and HR see every request. Everyone else sees only their own.
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select
  using (
    public.is_owner()
    or public.is_hr()
    or employee_id = public.my_employee_id()
  );

-- CREATE — owner and HR can log a request for anybody, in any state (an
-- offline paper request, already decided). Everyone else can only ever create
-- one for THEMSELVES, and it must start pending: nobody approves their own
-- leave on the way in.
drop policy if exists leave_requests_insert on public.leave_requests;
create policy leave_requests_insert on public.leave_requests for insert
  with check (
    public.is_owner()
    or public.is_hr()
    or (
      employee_id = public.my_employee_id()
      and status = 'pending'
      and decided_by is null
      and decided_at is null
    )
  );

-- EDIT — two separate policies, deliberately not one. Owner and HR can change
-- anything (approve, reject, edit dates). An ordinary employee can act on
-- their OWN request only while it is still pending, and only to cancel it —
-- the check clause allows the row to land in 'cancelled' and nowhere else, so
-- there is no path from a same-shaped update to self-approval.
drop policy if exists leave_requests_update_hr on public.leave_requests;
create policy leave_requests_update_hr on public.leave_requests for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists leave_requests_update_self_cancel on public.leave_requests;
create policy leave_requests_update_self_cancel on public.leave_requests for update
  using (
    employee_id = public.my_employee_id()
    and status = 'pending'
  )
  with check (
    employee_id = public.my_employee_id()
    and status = 'cancelled'
    and decided_by is null
    and decided_at is null
  );

-- DELETE — deliberately absent, same reasoning as employees: a mistaken
-- request is cancelled, not erased, so the history stays true.
revoke delete on public.leave_requests from anon, authenticated;

-- ============================================ 5. realtime

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.leave_requests'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 6. proof

select 'rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.leave_requests'::regclass
union all
select 'policies on leave_requests', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'leave_requests'
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'leave_requests' and cmd = 'DELETE'
union all
select 'annual_leave_days column', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees' and column_name = 'annual_leave_days';
