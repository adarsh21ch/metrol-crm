-- HR module — Phase 4: offer & joining, an onboarding checklist, and the
-- documents Phase 1 deliberately deferred here ("they need file storage and
-- stricter rules" — CLAUDE.md, Phase 1 decision #7).
--
-- Run once in the Supabase SQL editor, same as 0006/0009/0010.

-- ============================================ 1. offer dates on the employee
--
-- Not a candidate pipeline — Phase 1 already decided employees are directory
-- rows, not applicants, and rule 4 for this whole module says these phases
-- are sections on the SAME employee record, not new entities. Two optional
-- dates are enough to answer "was an offer made, and did they accept it."
alter table public.employees
  add column if not exists offer_extended_on date,
  add column if not exists offer_accepted_on date;

-- ============================================ 2. the onboarding checklist
--
-- One row per task per employee. HR toggles these — not the employee — same
-- reasoning as salary_records: confirming a document was collected or a
-- laptop was issued is HR verifying a fact, not the employee self-reporting
-- it. Unlike employees/leave_requests/salary_records, a checklist item CAN be
-- deleted: it is process tracking, not a record of what happened, and HR
-- should be able to remove a task that turns out not to apply.
create table if not exists public.onboarding_tasks (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  label        text not null,
  done         boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references public.profiles(id) on delete set null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists onboarding_tasks_employee_idx on public.onboarding_tasks (employee_id);

-- A sensible default checklist, seeded once per new employee so HR starts
-- from something rather than a blank list. HR can add more or remove any of
-- these per person — nothing here is enforced as required.
create or replace function public.seed_onboarding_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.onboarding_tasks (employee_id, label, sort_order) values
    (new.id, 'Offer letter signed',     1),
    (new.id, 'ID proof collected',      2),
    (new.id, 'Bank details collected',  3),
    (new.id, 'Equipment issued',        4),
    (new.id, 'Induction completed',     5);
  return new;
end;
$$;

drop trigger if exists employees_seed_onboarding on public.employees;
create trigger employees_seed_onboarding
  after insert on public.employees
  for each row execute function public.seed_onboarding_tasks();

-- Backfill: everybody Phase 1 already created gets the same starting list,
-- so the feature is not blank for the six people already in the directory.
insert into public.onboarding_tasks (employee_id, label, sort_order)
select e.id, t.label, t.sort_order
  from public.employees e
  cross join (values
    ('Offer letter signed',    1),
    ('ID proof collected',     2),
    ('Bank details collected', 3),
    ('Equipment issued',       4),
    ('Induction completed',    5)
  ) as t(label, sort_order)
 where not exists (select 1 from public.onboarding_tasks ot where ot.employee_id = e.id);

alter table public.onboarding_tasks enable row level security;

drop policy if exists onboarding_tasks_select on public.onboarding_tasks;
create policy onboarding_tasks_select on public.onboarding_tasks for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- CREATE / EDIT / DELETE — owner and HR only. An employee can see their own
-- checklist (so they know what is still expected of them) but never touches
-- it — ticking a box is HR confirming a fact, not the employee self-reporting.
drop policy if exists onboarding_tasks_insert on public.onboarding_tasks;
create policy onboarding_tasks_insert on public.onboarding_tasks for insert
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists onboarding_tasks_update on public.onboarding_tasks;
create policy onboarding_tasks_update on public.onboarding_tasks for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists onboarding_tasks_delete on public.onboarding_tasks;
create policy onboarding_tasks_delete on public.onboarding_tasks for delete
  using ( public.is_owner() or public.is_hr() );

-- ============================================ 3. documents

create table if not exists public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  doc_type     text not null default 'other'
                 check (doc_type in ('pan','aadhaar','bank_proof','photo','resume','other')),
  file_name    text not null,
  -- The path inside the 'employee-documents' storage bucket, always prefixed
  -- with the employee's own id (see the storage policies below) — that
  -- prefix is what lets a policy on storage.objects decide who may read it
  -- without a second lookup into this table.
  file_path    text not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  uploaded_at  timestamptz not null default now(),
  notes        text
);

create index if not exists employee_documents_employee_idx on public.employee_documents (employee_id);

alter table public.employee_documents enable row level security;

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents for select
  using ( public.is_owner() or public.is_hr() or employee_id = public.my_employee_id() );

-- CREATE / EDIT / DELETE — owner and HR only. "Documents collected" is HR's
-- job in the brief; an employee hands HR the physical document or the scan,
-- HR uploads it. Nobody manages their own identity documents unsupervised.
drop policy if exists employee_documents_insert on public.employee_documents;
create policy employee_documents_insert on public.employee_documents for insert
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists employee_documents_update on public.employee_documents;
create policy employee_documents_update on public.employee_documents for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

drop policy if exists employee_documents_delete on public.employee_documents;
create policy employee_documents_delete on public.employee_documents for delete
  using ( public.is_owner() or public.is_hr() );

-- ============================================ 4. the storage bucket
--
-- Private — never public. A signed URL (short-lived, generated per download)
-- is how anybody ever actually reads a file; there is no permanent public
-- link to a PAN card or an Aadhaar scan.
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

-- Every object's path starts with the employee's own id — e.g.
-- "3f2a.../1699999999-pan-card.pdf" — so a policy can check the first path
-- segment against my_employee_id() without a second table lookup.
drop policy if exists employee_documents_storage_select on storage.objects;
create policy employee_documents_storage_select on storage.objects for select
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_owner()
      or public.is_hr()
      or (storage.foldername(name))[1] = public.my_employee_id()::text
    )
  );

drop policy if exists employee_documents_storage_insert on storage.objects;
create policy employee_documents_storage_insert on storage.objects for insert
  with check ( bucket_id = 'employee-documents' and (public.is_owner() or public.is_hr()) );

drop policy if exists employee_documents_storage_update on storage.objects;
create policy employee_documents_storage_update on storage.objects for update
  using      ( bucket_id = 'employee-documents' and (public.is_owner() or public.is_hr()) )
  with check ( bucket_id = 'employee-documents' and (public.is_owner() or public.is_hr()) );

drop policy if exists employee_documents_storage_delete on storage.objects;
create policy employee_documents_storage_delete on storage.objects for delete
  using ( bucket_id = 'employee-documents' and (public.is_owner() or public.is_hr()) );

-- ============================================ 5. proof

select 'onboarding_tasks rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.onboarding_tasks'::regclass
union all
select 'employee_documents rls enabled', relrowsecurity::text
  from pg_class where oid = 'public.employee_documents'::regclass
union all
select 'onboarding_tasks policies', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'onboarding_tasks'
union all
select 'employee_documents policies', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'employee_documents'
union all
select 'storage policies on employee-documents', count(*)::text
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'employee_documents_storage_%'
union all
select 'employee-documents bucket exists', count(*)::text
  from storage.buckets where id = 'employee-documents'
union all
select 'backfilled onboarding tasks', count(*)::text
  from public.onboarding_tasks
union all
select 'offer date columns on employees', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'employees'
   and column_name in ('offer_extended_on','offer_accepted_on');
