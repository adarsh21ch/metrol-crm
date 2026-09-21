-- Payroll, phase 1 of 2 — the foundation (2026-09-21 brief). The actual
-- payslip calculation, the premium slip and email are phase 2; this is just
-- what a person needs on record before any of that can run: a PAN, a work
-- location, a basic salary figure, and which TDS category they fall under.
--
-- Run once in the Supabase SQL editor, after 0028. Safe to re-run.

-- ============================================ 1. tds_categories

-- HR's own list, same shape as visit_purposes (0027): "Contract" and
-- "Professional" today, HR can rename, re-rate or retire any of them
-- without a deploy. Retiring (is_active=false) rather than deleting for the
-- same reason as always — an employee already assigned to a category must
-- keep reading it even after HR stops offering it to new hires.
--
-- Adarsh's own words on "disable the TDS": a category with no active row
-- assigned, or an employee with tds_category_id left null, simply has no
-- TDS applied — there is no separate on/off switch to build, this already
-- covers it.
create table if not exists public.tds_categories (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  rate_percent  numeric(5,2) not null default 0,
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.tds_categories enable row level security;

drop policy if exists tds_categories_select on public.tds_categories;
create policy tds_categories_select on public.tds_categories for select using ( true );

drop policy if exists tds_categories_write on public.tds_categories;
create policy tds_categories_write on public.tds_categories for all
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

insert into public.tds_categories (label, rate_percent, sort_order)
select v.label, v.rate, v.sort_order
  from (values ('Contract', 1.00, 1), ('Professional', 10.00, 2)) as v(label, rate, sort_order)
 where not exists (select 1 from public.tds_categories);

-- ============================================ 2. four new columns on employees

alter table public.employees
  add column if not exists pan_number     text,
  add column if not exists work_location  text,
  add column if not exists basic_salary   numeric(12,2),
  add column if not exists tds_category_id uuid references public.tds_categories(id) on delete set null;

-- ============================================ 3. pan_number on the joining form too

-- The form already collects a PAN CARD PHOTO (job_applications.pan_path,
-- 0017) — a document, not a usable value. This is the typed number itself,
-- what payroll actually needs. Nullable here even though the form makes it
-- required going forward, same reasoning 0026 used for gender: an
-- application already mid-flight when this ships must not suddenly fail to
-- save over a column it never knew about.
alter table public.job_applications
  add column if not exists pan_number text;

-- ============================================ 4. update_my_pan() — narrow self-service write

-- An existing employee who never went through the joining form (or joined
-- before this existed) has no other way to put their own PAN on record —
-- EmployeeModal is HR-only, and employees has no self-update policy at all
-- today, deliberately (salary sits on the same table). Rather than open a
-- column-scoped RLS policy on a table this sensitive, one function that can
-- only ever touch the caller's own pan_number: the same shape
-- set_push_subscription_employee() (0025) already uses to keep a
-- self-service write from reaching anything it should not.
create or replace function public.update_my_pan(p_pan text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  v_emp := public.my_employee_id();
  if v_emp is null then
    raise exception 'No employee record is linked to this login.';
  end if;
  update public.employees set pan_number = nullif(trim(p_pan), '') where id = v_emp;
end;
$$;

revoke all on function public.update_my_pan(text) from public, anon;
grant execute on function public.update_my_pan(text) to authenticated;

-- ============================================ 5. proof

select 'rls enabled: tds_categories' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.tds_categories'::regclass
union all
select 'seeded tds categories', count(*)::text from public.tds_categories
union all
select 'employees has the four new columns', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees'
   and column_name in ('pan_number','work_location','basic_salary','tds_category_id')
union all
select 'job_applications has pan_number', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'job_applications' and column_name = 'pan_number'
union all
select 'update_my_pan exists', count(*)::text from pg_proc where proname = 'update_my_pan';
