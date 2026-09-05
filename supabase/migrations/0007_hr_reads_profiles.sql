-- Found while building the HR directory, not guessed at.
--
-- profiles_select has been `id = auth.uid() or is_owner()` since 0001. That was
-- right when only the owner had a screen listing people. It leaves two of the
-- three access rules from 0006 unable to function:
--
--   * HR opens the directory and sees employee records, but cannot read the
--     profiles behind them — so it cannot link a record to a login, cannot
--     offer "who has an account but no employee record yet", and shows blanks
--     where a name should be.
--   * A team lead's "Manage team" tab is a list of their teammates. Without
--     this, the list is empty for everyone.
--
-- The widening is deliberately narrow: HR reads every profile (that is the job
-- — see 0006), and a team lead reads only profiles sharing their own
-- department. An ordinary member still reads exactly one row: their own.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_owner()
    or public.is_hr()
    or (
      public.leads_a_team()
      and department_id is not null
      and department_id = public.my_department()
    )
  );

-- profiles_update is deliberately NOT widened. HR changes somebody's
-- department through the employee record, which syncs the profile with a
-- definer trigger (0006 section 7). There is no second path, so there is
-- nothing to keep in step.

-- ---------------------------------------------------------------- proof
select polname as policy, pg_get_expr(polqual, polrelid) as reads_when
  from pg_policy
 where polrelid = 'public.profiles'::regclass and polcmd = 'r';
