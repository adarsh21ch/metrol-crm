-- Metrol CRM — HR/owner can delete a job application outright.
--
-- 0017 gave job_applications insert (anon + auth), select and update
-- policies, but no delete. Adarsh entered a few real test applications on the
-- live /apply form to prove Phase 8 worked, and there was no way to remove
-- them. Unlike an employee (see delete-employee/index.ts for why THAT stays
-- owner-only and server-side), an application that has not been approved is
-- low-stakes: no login, no payroll row, nothing else in the database points
-- at it. HR removing a duplicate or a test submission is an ordinary
-- housekeeping action, not one that needs a harder door.
--
-- Storage cleanup for an application's own documents runs from the client
-- (useJobApplications.remove), reusing the delete policy 0017 already put on
-- storage.objects for the same bucket — nothing new needed there.

drop policy if exists job_applications_delete on public.job_applications;
create policy job_applications_delete on public.job_applications for delete
  to authenticated
  using ( public.is_owner() or public.is_hr() );

-- ============================================ proof

select 'delete policy installed' as check,
  (count(*) = 1)::text as result
  from pg_policies
  where schemaname = 'public' and tablename = 'job_applications'
    and policyname = 'job_applications_delete';
