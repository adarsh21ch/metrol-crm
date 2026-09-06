-- HR module — Phase 5: resignation record, notice period, exit checklist.
-- Run once in the Supabase SQL editor, same as 0006/0009/0010/0011.
--
-- Marking somebody inactive already exists from Phase 1 (employees.status =
-- 'resigned', the record kept forever). This phase adds the deeper record
-- around that moment: when notice started, how long it was, why they left,
-- and what still needs doing before they walk out.
--
-- One privacy call, made here rather than asked, because it only tightens
-- access beyond what anybody requested: the REASON someone left and any exit
-- interview notes can carry HR's frank, possibly unflattering assessment —
-- so exit_records has NO self-select policy at all, unlike every other table
-- in this module. The procedural facts (resignation date, notice period,
-- last working day) stay on `employees` itself, which an employee already
-- reads about themselves — they are not being told anything they don't
-- already know by living through it.

-- ============================================ 1. procedural facts, on the employee

alter table public.employees
  add column if not exists resignation_date date,
  add column if not exists notice_period_days int;

-- ============================================ 2. the HR-only resignation record

create table if not exists public.exit_records (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id) on delete cascade,
  reason               text,
  exit_interview_notes text,
  rehire_eligible      boolean not null default true,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists exit_records_employee_idx on public.exit_records (employee_id);

drop trigger if exists exit_records_touch on public.exit_records;
create trigger exit_records_touch
  before update on public.exit_records
  for each row execute function public.touch_updated_at();

alter table public.exit_records enable row level security;

-- READ/WRITE — owner and HR only. Deliberately no employee_id = my_employee_id()
-- branch here, unlike every other table in this module — see the header.
drop policy if exists exit_records_select on public.exit_records;
create policy exit_records_select on public.exit_records for select
  using ( public.is_owner() or public.is_hr() );

drop policy if exists exit_records_insert on public.exit_records;
create policy exit_records_insert on public.exit_records for insert
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists exit_records_update on public.exit_records;
create policy exit_records_update on public.exit_records for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- DELETE — deliberately absent, same as salary_records: a record of why
-- somebody left is corrected in place, never erased.
revoke delete on public.exit_records from anon, authenticated;

-- ============================================ 3. the exit checklist
--
-- Same shape as onboarding_tasks (0011), keyed to the employee directly
-- rather than to exit_records — so an employee CAN read their own checklist
-- (what still needs handing back) even though they can never read the
-- separate, HR-only record of why they are leaving.
create table if not exists public.exit_tasks (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  label        text not null,
  done         boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references public.profiles(id) on delete set null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists exit_tasks_employee_idx on public.exit_tasks (employee_id);

alter table public.exit_tasks enable row level security;

drop policy if exists exit_tasks_select on public.exit_tasks;
create policy exit_tasks_select on public.exit_tasks for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- CREATE / EDIT / DELETE — owner and HR only, same reasoning as onboarding:
-- HR confirms a laptop came back, the employee does not self-report it.
drop policy if exists exit_tasks_insert on public.exit_tasks;
create policy exit_tasks_insert on public.exit_tasks for insert
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists exit_tasks_update on public.exit_tasks;
create policy exit_tasks_update on public.exit_tasks for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists exit_tasks_delete on public.exit_tasks;
create policy exit_tasks_delete on public.exit_tasks for delete
  using ( public.is_owner() or public.is_hr() );

-- ============================================ 4. seeding the checklist
--
-- Fires the first time someone leaves 'active' — whether they land on
-- 'notice' or go straight to 'resigned' — so the checklist is relevant
-- during the notice period, not only sprung on the final day.
create or replace function public.seed_exit_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' and old.status = 'active'
     and not exists (select 1 from public.exit_tasks where employee_id = new.id) then
    insert into public.exit_tasks (employee_id, label, sort_order) values
      (new.id, 'Resignation letter received',        1),
      (new.id, 'Assets returned (laptop, ID card)',   2),
      (new.id, 'Access revoked',                      3),
      (new.id, 'Full and final settlement',           4),
      (new.id, 'Exit interview completed',            5),
      (new.id, 'Experience letter issued',            6);
  end if;
  return new;
end;
$$;

drop trigger if exists employees_seed_exit on public.employees;
create trigger employees_seed_exit
  after update of status on public.employees
  for each row execute function public.seed_exit_tasks();

-- Backfill: anybody already 'resigned' or 'notice' when this migration runs
-- gets the same starting checklist, same reasoning as 0011's backfill.
insert into public.exit_tasks (employee_id, label, sort_order)
select e.id, t.label, t.sort_order
  from public.employees e
  cross join (values
    ('Resignation letter received',      1),
    ('Assets returned (laptop, ID card)',2),
    ('Access revoked',                   3),
    ('Full and final settlement',        4),
    ('Exit interview completed',         5),
    ('Experience letter issued',         6)
  ) as t(label, sort_order)
 where e.status <> 'active'
   and not exists (select 1 from public.exit_tasks ot where ot.employee_id = e.id);

-- ============================================ 5. realtime

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.exit_records'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.exit_tasks';   exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 6. proof

select 'exit_records rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.exit_records'::regclass
union all
select 'exit_tasks rls enabled', relrowsecurity::text
  from pg_class where oid = 'public.exit_tasks'::regclass
union all
select 'exit_records select policies (must be 1, owner/HR only)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'exit_records' and cmd = 'SELECT'
union all
select 'exit_records delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'exit_records' and cmd = 'DELETE'
union all
select 'exit_tasks policies', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'exit_tasks'
union all
select 'resignation_date/notice_period_days columns', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees'
   and column_name in ('resignation_date','notice_period_days')
union all
select 'backfilled exit tasks (for anybody already on notice/resigned)', count(*)::text
  from public.exit_tasks;
