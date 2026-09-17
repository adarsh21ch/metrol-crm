-- Round 4 of the attendance/payroll brief — a persisted salary to compute
-- payroll FROM. Reuse leave_month_summary() (0022) for every deduction and
-- payout number; this migration adds no math of its own, only the two things
-- the frontend needs a place to store: what somebody is paid, and whether
-- their payslip has been emailed.
--
-- Run once in the Supabase SQL editor, after 0023. Safe to re-run.

-- ============================================ 1. one salary per employee
--
-- HR currently retypes gross/net by hand on every payslip (salary_records,
-- 0010) — there has never been a base number to compute FROM. Adarsh's
-- answer, 2026-09-17: add it, HR sets it once, editable on a raise. Nullable
-- on purpose — nobody has priced anybody yet (see the open item at the
-- bottom of ATTENDANCE-PAYROLL-PLAN.md), and Round 4's payslip generator
-- must refuse to guess a number nobody entered rather than compute from 0.

alter table public.employees
  add column if not exists monthly_salary numeric(12,2)
    check (monthly_salary is null or monthly_salary >= 0);

comment on column public.employees.monthly_salary is
  'Gross monthly salary HR set for this person. Null = not priced yet — the payslip generator refuses to run until it is.';

-- No RLS change needed: employees_update (0006) already restricts every
-- column on this table, this one included, to the owner or HR — the same
-- policy that already guards designation and date of joining. An employee
-- reads their own row today (employees_select, 0006), which means they can
-- already see their own monthly_salary once HR fills it in; that is no new
-- exposure — they already see the same number on every payslip in
-- salary_records (0010).

-- ============================================ 2. payslip email tracking
--
-- Same shape as job_applications.invite_sent_count / invite_sent_at (0017):
-- a payslip can be re-emailed (a bounce, a corrected address), and whether
-- it was ever sent at all is worth keeping next to the record it describes.

alter table public.salary_records
  add column if not exists payslip_sent_count int not null default 0,
  add column if not exists payslip_sent_at   timestamptz;

-- No RLS change needed: salary_records_update (0010) already restricts every
-- column, these two included, to the owner or HR — nobody else can mark a
-- payslip sent, same as nobody else can mark one paid.

-- ============================================ 3. proof

select 'employees.monthly_salary column (must be 1)' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees' and column_name = 'monthly_salary'
union all
select 'salary_records payslip-email columns (must be 2)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salary_records'
   and column_name in ('payslip_sent_count', 'payslip_sent_at')
union all
select 'employees priced so far', count(*)::text
  from public.employees where monthly_salary is not null
union all
select 'employees total', count(*)::text
  from public.employees;
