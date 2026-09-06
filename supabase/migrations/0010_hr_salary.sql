-- HR module — Phase 3: salary records and payslip history.
-- Run once in the Supabase SQL editor, same as 0006 and 0009.
--
-- Adarsh's answer, 2026-09-06: HR sees the amounts, not just the process —
-- "under HR the company finance department also comes, so it will help."
-- Restricting it later (if he ever wants HR to manage payroll blind) is a
-- policy change here, not a schema change.
--
-- This is the strictest table in the app so far: unlike leave_requests, an
-- employee gets NO write path at all — not even to cancel a mistaken row.
-- Only the owner and HR ever create, edit, or mark one paid.

create table if not exists public.salary_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  -- Always the first of the month, e.g. 2026-09-01 — one row per employee per
  -- calendar month, enforced below rather than left to whoever is entering it.
  period       date not null,
  gross_amount numeric(12,2) not null,
  net_amount   numeric(12,2) not null,

  status       text not null default 'pending' check (status in ('pending','paid')),
  paid_at      timestamptz,
  paid_by      uuid references public.profiles(id) on delete set null,
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id)
);

create unique index if not exists salary_records_employee_period_unique
  on public.salary_records (employee_id, period);

create index if not exists salary_records_employee_idx on public.salary_records (employee_id);
create index if not exists salary_records_status_idx   on public.salary_records (status);

drop trigger if exists salary_records_touch on public.salary_records;
create trigger salary_records_touch
  before update on public.salary_records
  for each row execute function public.touch_updated_at();

-- ============================================ row-level security

alter table public.salary_records enable row level security;

-- READ — owner and HR see every payslip. Everyone else sees only their own —
-- and my_employee_id() (0009) is what "their own" means here too.
drop policy if exists salary_records_select on public.salary_records;
create policy salary_records_select on public.salary_records for select
  using (
    public.is_owner()
    or public.is_hr()
    or employee_id = public.my_employee_id()
  );

-- CREATE — owner and HR only. Nobody generates their own payslip.
drop policy if exists salary_records_insert on public.salary_records;
create policy salary_records_insert on public.salary_records for insert
  with check ( public.is_owner() or public.is_hr() );

-- EDIT — owner and HR only, full stop. Unlike leave_requests there is no
-- second policy for the employee: they cannot even cancel a wrong entry, let
-- alone approve one. Correcting a mistake is HR's job, same as the amount was.
drop policy if exists salary_records_update on public.salary_records;
create policy salary_records_update on public.salary_records for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- DELETE — deliberately absent, same as employees and leave_requests: a
-- payslip is a financial record and stays, even if it was entered wrong —
-- correct it in place, on the record, rather than erasing it.
revoke delete on public.salary_records from anon, authenticated;

-- ============================================ realtime

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.salary_records'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ proof

select 'rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.salary_records'::regclass
union all
select 'policies on salary_records', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'salary_records'
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'salary_records' and cmd = 'DELETE'
union all
select 'update policies (must be 1 — HR/owner only)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'salary_records' and cmd = 'UPDATE';
