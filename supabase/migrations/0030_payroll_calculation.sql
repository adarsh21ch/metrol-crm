-- Payroll, phase 2 of 2 — the actual calculation. 0029 put PAN, work
-- location, basic salary and a TDS category on the employee record; this is
-- what a payslip does with them, matching Adarsh's own working sheet
-- (2026-09-21): perDay × (paid days + leave encashment), plus incentive,
-- minus other deduction, minus TDS.
--
-- Run once in the Supabase SQL editor, after 0029. Safe to re-run.
--
-- One column at a time rather than a JSON blob: each of these is a real
-- number somebody may want to query or total later (this month's TDS
-- collected, this month's incentives paid) — the same reasoning every other
-- itemized table in this app already follows.
alter table public.salary_records
  add column if not exists paid_days              numeric(5,1),
  add column if not exists leave_encashment_days   numeric(5,1) not null default 0,
  add column if not exists leave_encashment_amount numeric(12,2) not null default 0,
  add column if not exists incentive               numeric(12,2) not null default 0,
  add column if not exists other_deduction         numeric(12,2) not null default 0,
  -- Null, not 0 — "no TDS category was assigned" and "a 0% category was
  -- assigned" are different facts, and only one of them is a rate.
  add column if not exists tds_rate_percent        numeric(5,2),
  add column if not exists tds_amount              numeric(12,2) not null default 0;

-- No RLS change: salary_records' existing policies (0010) already say
-- exactly what Adarsh confirmed he wants — HR/owner full reach, an employee
-- reads only their own row, nobody else's.

select 'salary_records has the seven new columns' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salary_records'
   and column_name in ('paid_days','leave_encashment_days','leave_encashment_amount',
                        'incentive','other_deduction','tds_rate_percent','tds_amount');
