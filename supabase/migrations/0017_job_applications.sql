-- HR module — Phase 8: the public joining form.
-- Run once in the Supabase SQL editor, same as 0006/0009/0011/etc.
--
-- The design Adarsh settled on 2026-09-12 (see CLAUDE.md ANSWERS section):
-- nothing is created — no auth account, no profile, no employee row — until
-- HR approves. Only this table exists in between, and it is deliberately a
-- QUARANTINE: the public can write to it, so it must never be readable by the
-- public, and its documents must never sit in the same bucket as a real
-- employee's PAN card.
--
-- Approval itself (creating the auth user, the employee row, moving the
-- documents, sending the email) is NOT done here — it needs the Supabase
-- Admin API to create a login, which only runs with the service role key, so
-- it lives in the Edge Function `approve-job-application`, never in the
-- browser. This migration only prepares the table and storage it reads from
-- and writes back to.

-- ============================================ 1. the application itself

create table if not exists public.job_applications (
  id                     uuid primary key default gen_random_uuid(),

  full_name              text not null,
  phone                  text not null default '',
  email                  text not null,
  position_interest      text not null default '',

  -- Adarsh's decision: a fresher has no relieving letter, so this one
  -- checkbox is the only way to submit without it. It does not touch the
  -- other four uploads.
  no_previous_employment boolean not null default false,

  -- Paths inside the QUARANTINED 'job-applications' bucket, not
  -- 'employee-documents' — see section 3. All five are filled by the client
  -- before this row is inserted; relieving_letter_path is the only one that
  -- may be null, and only when no_previous_employment is true (checked below).
  photo_path             text not null,
  pan_path               text not null,
  aadhaar_path           text not null,
  bank_proof_path        text not null,
  relieving_letter_path  text,

  status                 text not null default 'pending'
                           check (status in ('pending','approved','rejected')),
  decided_by             uuid references public.profiles(id) on delete set null,
  decided_at             timestamptz,
  decision_note          text,

  -- Filled by the Edge Function on approval — the employee record that came
  -- out of this application, so "who did this become" is one join away.
  employee_id            uuid references public.employees(id) on delete set null,

  -- How many times the set-password email has been sent — the resend button
  -- increments this rather than creating a second application. HR can see at
  -- a glance whether "resend" has already been tried.
  invite_sent_count      int not null default 0,
  invite_sent_at         timestamptz,

  created_at             timestamptz not null default now()
);

alter table public.job_applications
  add constraint job_applications_relieving_letter_check
  check (no_previous_employment or relieving_letter_path is not null);

create index if not exists job_applications_status_idx on public.job_applications (status);

-- ============================================ 2. the quarantine trigger
--
-- Anon can INSERT (that is the whole point of a public form) but must not be
-- able to hand itself an approval. A WITH CHECK clause on the insert policy
-- could try to pin these columns, but a default combined with a check is
-- easier to read as one rule: whatever the client sent for these five
-- columns, overwrite it before the row lands.
create or replace function public.quarantine_job_application()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    -- A privileged connection (SQL editor, the Edge Function's service role)
    -- is trusted to set these directly — the Edge Function is what moves an
    -- application to 'approved' in the first place.
    return new;
  end if;
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  new.employee_id := null;
  new.invite_sent_count := 0;
  new.invite_sent_at := null;
  return new;
end;
$$;

drop trigger if exists job_applications_quarantine on public.job_applications;
create trigger job_applications_quarantine
  before insert on public.job_applications
  for each row execute function public.quarantine_job_application();

-- ============================================ 3. row-level security
--
-- Anon may create and read nothing back — a public-write table is a spam
-- surface, and a candidate must not be able to browse anyone else's PAN
-- number by guessing an id. HR/owner may read and decide; nobody but the
-- Edge Function's service role connection (which bypasses RLS entirely) ever
-- creates the employee this becomes.

alter table public.job_applications enable row level security;

drop policy if exists job_applications_insert_anon on public.job_applications;
create policy job_applications_insert_anon on public.job_applications for insert
  to anon
  with check ( true );

drop policy if exists job_applications_insert_auth on public.job_applications;
create policy job_applications_insert_auth on public.job_applications for insert
  to authenticated
  with check ( true );

drop policy if exists job_applications_select on public.job_applications;
create policy job_applications_select on public.job_applications for select
  using ( public.is_owner() or public.is_hr() );

-- Rejecting is a plain status change HR can do from the browser; approving
-- is not (it needs an auth user created), so it always goes through the Edge
-- Function even though this policy would technically allow the update too.
drop policy if exists job_applications_update on public.job_applications;
create policy job_applications_update on public.job_applications for update
  using      ( public.is_owner() or public.is_hr() )
  with check ( public.is_owner() or public.is_hr() );

-- DELETE — deliberately absent, same reasoning as employees: a rejected
-- application is a record HR made a decision on, not something to erase.
revoke delete on public.job_applications from anon, authenticated;

-- ============================================ 4. the quarantine bucket
--
-- Private, and NOT the 'employee-documents' bucket from 0011. A stranger's
-- upload must never sit next to a real employee's identity documents until
-- HR has actually approved them — the Edge Function copies the files across
-- on approval and deletes them from here.
insert into storage.buckets (id, name, public)
values ('job-applications', 'job-applications', false)
on conflict (id) do nothing;

-- Every object's path starts with the application's own id (the client
-- generates the id before it inserts the row, uploads under that id, then
-- inserts the row with that same id) — e.g.
-- "3f2a.../photo-1699999999.jpg". Nobody can read it back except HR/owner
-- and the service role; the candidate who just uploaded it cannot even list
-- their own folder, matching "the public can write, never read" above.
drop policy if exists job_applications_storage_insert on storage.objects;
create policy job_applications_storage_insert on storage.objects for insert
  to anon, authenticated
  with check ( bucket_id = 'job-applications' );

drop policy if exists job_applications_storage_select on storage.objects;
create policy job_applications_storage_select on storage.objects for select
  using ( bucket_id = 'job-applications' and (public.is_owner() or public.is_hr()) );

drop policy if exists job_applications_storage_delete on storage.objects;
create policy job_applications_storage_delete on storage.objects for delete
  using ( bucket_id = 'job-applications' and (public.is_owner() or public.is_hr()) );

-- ============================================ 5. realtime
--
-- So the Applications tab in HR updates the moment a candidate submits,
-- exactly like the leads board already does for a new lead.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.job_applications'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 6. proof

select 'rls enabled' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.job_applications'::regclass
union all
select 'policies on job_applications', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'job_applications'
union all
select 'delete policies (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'job_applications' and cmd = 'DELETE'
union all
select 'job-applications bucket exists', count(*)::text
  from storage.buckets where id = 'job-applications'
union all
select 'storage policies on job-applications', count(*)::text
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'job_applications_storage_%'
union all
select 'quarantine trigger installed', count(*)::text
  from pg_trigger where tgname = 'job_applications_quarantine';
