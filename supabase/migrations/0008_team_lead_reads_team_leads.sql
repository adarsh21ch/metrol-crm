-- The "Manage team" tab is one extra tab showing a team lead their own team's
-- numbers. Those numbers are leads, and leads_select has been "a project you
-- own, or a lead assigned to you" since 0001 — so without this the tab renders
-- a row per team member with a zero in every column, which is worse than not
-- shipping it.
--
-- Read-only, and only their own department. A team lead still cannot reassign
-- a lead, edit one that is not theirs, or verify a payment: leads_update is
-- untouched below, and that is what says who may write.

-- Their department's people, answered by a function rather than a subquery on
-- profiles inside the policy: a policy that reads another RLS-protected table
-- can silently filter itself down to nothing, and this must not depend on
-- profiles_select's shape to be correct.
create or replace function public.my_team_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select p.id from public.profiles p
   where p.department_id is not null
     and p.department_id = public.my_department()
$$;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (
    public.owns_project(project_id)
    or owner_id = auth.uid()
    or ( public.leads_a_team() and owner_id in (select public.my_team_ids()) )
  );

-- ---------------------------------------------------------------- proof
-- Expect three clauses on select, and leads_update unchanged at two.
select polname as policy,
       case polcmd when 'r' then 'select' when 'w' then 'update' else polcmd::text end as command,
       pg_get_expr(polqual, polrelid) as applies_when
  from pg_policy
 where polrelid = 'public.leads'::regclass and polcmd in ('r', 'w')
 order by polcmd;
