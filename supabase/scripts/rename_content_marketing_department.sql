-- The rename Adarsh asked for, 2026-09-22: "Social Media" -> "Content and
-- Marketing". Nothing in the app code keys on the department NAME except the
-- new Content & Marketing dashboard (CONTENT-MARKETING-DASHBOARD-PLAN.md),
-- which was built to key on the new name directly — so this has to be run
-- before that dashboard will show for anybody in the department.
--
-- Safe to run more than once. If the department was already renamed (or
-- never existed as "Social Media" in this project), it changes nothing.
update public.departments set name = 'Content and Marketing' where name = 'Social Media';

select 'departments named "Content and Marketing" (must be 1)' as check, count(*)::text as result
  from public.departments where name = 'Content and Marketing'
union all
select 'departments still named "Social Media" (must be 0)', count(*)::text
  from public.departments where name = 'Social Media';
