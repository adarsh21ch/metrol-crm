-- Widens who can manage Clients, Pages and page assignments (2026-09-22,
-- Adarsh's follow-up on the same brief): the Content & Marketing department
-- head should be able to create pages and assign them to their own
-- employees themselves, not route every one through HR. This REPLACES the
-- "reassign stays HR-only" answer 0032 was built on — a later, more detailed
-- instruction from Adarsh, not a guess.
--
-- Run once in the Supabase SQL editor, after 0032 AND after
-- rename_content_marketing_department.sql (this function keys on the
-- department's NEW name — see lib/hr.ts's CONTENT_MARKETING_DEPARTMENT for
-- why the name and not a hardcoded id). Safe to re-run.

-- Scoped to Content & Marketing's own team lead specifically — not "any team
-- lead" system-wide. A Sales lead has no button anywhere that calls this, but
-- the database should not trust one more than the UI does.
create or replace function public.leads_content_marketing()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles p
    join public.departments d on d.id = p.department_id
   where p.id = auth.uid() and p.is_team_lead and d.name = 'Content and Marketing'
) $$;

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all
  using      ( public.is_owner() or public.is_hr() or public.leads_content_marketing() )
  with check ( public.is_owner() or public.is_hr() or public.leads_content_marketing() );

drop policy if exists pages_write on public.pages;
create policy pages_write on public.pages for all
  using      ( public.is_owner() or public.is_hr() or public.leads_content_marketing() )
  with check ( public.is_owner() or public.is_hr() or public.leads_content_marketing() );

drop policy if exists page_assignments_write on public.page_assignments;
create policy page_assignments_write on public.page_assignments for all
  using      ( public.is_owner() or public.is_hr() or public.leads_content_marketing() )
  with check ( public.is_owner() or public.is_hr() or public.leads_content_marketing() );

-- ============================================ proof

select 'leads_content_marketing() exists' as check, count(*)::text as result
  from pg_proc where proname = 'leads_content_marketing'
union all
select 'clients_write mentions leads_content_marketing',
       (pg_get_expr(polqual, polrelid) like '%leads_content_marketing%')::text
  from pg_policy where polname = 'clients_write' and polrelid = 'public.clients'::regclass
union all
select 'pages_write mentions leads_content_marketing',
       (pg_get_expr(polqual, polrelid) like '%leads_content_marketing%')::text
  from pg_policy where polname = 'pages_write' and polrelid = 'public.pages'::regclass
union all
select 'page_assignments_write mentions leads_content_marketing',
       (pg_get_expr(polqual, polrelid) like '%leads_content_marketing%')::text
  from pg_policy where polname = 'page_assignments_write' and polrelid = 'public.page_assignments'::regclass;
