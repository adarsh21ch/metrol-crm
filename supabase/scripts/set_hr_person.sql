-- Make somebody HR (and optionally, somebody a team lead).
--
-- "Becoming HR" is not a role — it is sitting in the Human Resources
-- department. That is all this does. Run it in the Supabase SQL editor.
--
-- Change the two emails below and run the whole file.

-- ---------------------------------------------------------------- who
-- The person who should get the HR dashboard:
--     metrolhr@gmail.com
-- The person who should get the extra "Manage team" tab (optional —
-- leave it as it is if you do not want one yet):
--     CHANGE-ME@example.com

-- 1. A profile row normally appears by itself when an account is created.
--    This is only a safety net in case that trigger did not fire for a user
--    created from the dashboard rather than the app's sign-up form.
insert into public.profiles (id, name, email)
select u.id, split_part(u.email, '@', 1), u.email
  from auth.users u
 where u.email in ('metrolhr@gmail.com')
on conflict (id) do nothing;

-- 2. Move them into Human Resources.
update public.profiles
   set department_id = (select id from public.departments where name = 'Human Resources'),
       name          = case when coalesce(name, '') = '' then 'HR' else name end
 where id in (select id from auth.users where email = 'metrolhr@gmail.com');

-- 3. Optional: give somebody the "Manage team" tab. Put a real email in and
--    uncomment the two lines to use it.
-- update public.profiles set is_team_lead = true
--  where id in (select id from auth.users where email = 'CHANGE-ME@example.com');

-- ---------------------------------------------------------------- proof
-- Read this. Exactly one person should show Human Resources.
select p.email,
       p.role,
       coalesce(d.name, '—')      as department,
       p.is_team_lead             as team_lead
  from public.profiles p
  left join public.departments d on d.id = p.department_id
 order by d.sort_order nulls last, p.email;
