-- 0038 (HR sees targets) and 0039 (security lockdown). Runs after rls_tests,
-- whose t_try / t_val / pid / eid helpers it reuses. "(expect …)" lines are
-- passes when they say what they expect.
\pset format unaligned
\pset tuples_only on
grant execute on function public.t_try(text), public.t_val(text) to anon;

-- data the checks need: a branch, a staff photo, a password for the sales rep
insert into office_locations (name, lat, lng) values ('Test branch', 23.83, 79.44) on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000011/me.jpg');
update auth.users set encrypted_password = extensions.crypt('Right#Pass1', extensions.gen_salt('bf', 4)) where email = 'sales@metrol.in';
select employee_code as code from employees where full_name = 'Sales Rep' \gset
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ff', 'stranger@example.com');

\echo '--- 0038: HR (no employee record) and client targets'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'hr view_targets=' || has_capability('view_targets') || ' manage_targets=' || has_capability('manage_targets');
select 'hr sets a target: ' || t_try($$insert into view_targets (client_id, label, total_views, starts_on, ends_on) values ('c0000000-0000-0000-0000-000000000001','HR set',1000,'2027-04-01','2028-03-31')$$);
select 'hr enters a week on any page: ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000003'), '2026-09-07', 1234)$$);
select 'hr reads client money (0040: expect 1): ' || t_val($$select count(*)::text from client_financials$$);
select 'hr is staff: ' || is_staff();
reset role;

\echo '--- 0039: a signed-out visitor'
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role anon;
select 'tables with rows a signed-out visitor can read (expect none): ' || coalesce(string_agg(c.relname, ', ' order by c.relname), 'none')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not like '\_%'
   and public.t_val(format('select count(*)::text from public.%I', c.relname)) !~ '^(0|ERR.*)$';
select 'signed-out lists employee photos (expect 0): ' || t_val($$select count(*)::text from storage.objects where bucket_id = 'avatars'$$);
select 'candidate uploads into an application folder: ' || t_try($$insert into storage.objects (bucket_id, name) values ('job-applications', '3f2a4b5c-1d2e-4f3a-8b9c-0d1e2f3a4b5c/photo-1727300000-me.jpg')$$);
select 'upload outside an application folder (expect denied): ' || t_try($$insert into storage.objects (bucket_id, name) values ('job-applications', 'junk/movie.mp4')$$);
select 'candidate still sends an application: ' || t_try($$insert into job_applications (full_name, email, photo_path, pan_path, aadhaar_path, bank_proof_path, no_previous_employment, declaration_accepted_at, terms_accepted_at) values ('Test Candidate', 'cand@example.com', 'a/p.jpg', 'a/pan.jpg', 'a/aadhaar.jpg', 'a/bank.jpg', true, now(), now())$$);
select 'ID + right password: ' || coalesce(email_for_employee_code(:'code', 'Right#Pass1'), 'null');
select 'ID + wrong password (expect null): ' || coalesce(email_for_employee_code(:'code', 'wrong'), 'null');
select 'unknown ID (expect null): ' || coalesce(email_for_employee_code('0000', 'Right#Pass1'), 'null');
select 'old one-argument lookup (expect gone): ' || t_try(format($$select email_for_employee_code(%L)$$, :'code'));
reset role;

\echo '--- 0039: a stranger who signed up (no department, no employee record)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false) \g /dev/null
set role authenticated;
select 'tables with rows a stranger can read (expect profiles only): ' || coalesce(string_agg(c.relname, ', ' order by c.relname), 'none')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not like '\_%'
   and public.t_val(format('select count(*)::text from public.%I', c.relname)) !~ '^(0|ERR.*)$';
select 'stranger is staff (expect false): ' || is_staff();
reset role;

\echo '--- 0039: a code sign-up in Sales by default, no employee record (expect nothing either)'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000fe', 'newsales@example.com');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fe', false) \g /dev/null
set role authenticated;
select 'new account is staff (expect false): ' || is_staff() || ', clients it reads (expect 0): ' || t_val($$select count(*)::text from clients$$);
reset role;

\echo '--- 0039: staff — a sales rep with an employee record and no department'
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'reads clients / pages / branches: ' || t_val($$select count(*)::text from clients$$) || ' / ' || t_val($$select count(*)::text from pages$$) || ' / ' || t_val($$select count(*)::text from office_locations$$);
select 'reads a branch by its listed columns: ' || t_try($$select id, name, address, lat, lng, radius_meters, is_active, sort_order, created_at, updated_at, created_by, qr_rotated_at from office_locations$$);
select 'reads the QR secret (expect denied): ' || t_try($$select qr_token from office_locations$$);
select 'select * on branches (expect denied — the app lists columns): ' || t_try($$select * from office_locations$$);
select 'office_qr_tokens() rows (expect 0): ' || t_val($$select count(*)::text from office_qr_tokens()$$);
select 'lists employee photos: ' || t_val($$select count(*)::text from storage.objects where bucket_id = 'avatars'$$);
reset role;

\echo '--- 0039: HR and the owner keep the poster'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'hr office_qr_tokens() rows: ' || t_val($$select count(*)::text from office_qr_tokens()$$);
select 'hr edits a branch, reading back listed columns: ' || t_try($$update office_locations set radius_meters = 60 where name = 'Test branch' returning id, name, radius_meters, qr_rotated_at$$);
select 'hr adds a branch: ' || t_try($$insert into office_locations (name, lat, lng) values ('Second branch', 23.84, 79.45) returning id, name$$);
reset role;
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'owner office_qr_tokens() rows: ' || t_val($$select count(*)::text from office_qr_tokens()$$);
reset role;

\echo '--- 0039: the attendance functions still see the secret'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
select 'punch_by_qr resolves a live code (expect no_employee for a login with none): '
       || (select (public.punch_by_qr((select qr_token from office_locations where name = 'Test branch'), 23.83, 79.44, 5))->>'reason');

\echo '--- 0040: HR has everything the owner has'
insert into projects (id, name, owner_id) values ('f0000000-0000-0000-0000-000000000001', 'Owner project', pid('owner@metrol.in'));
insert into leads (project_id, name) values ('f0000000-0000-0000-0000-000000000001', 'A lead');
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'hr capabilities: money=' || has_capability('see_client_money') || ' settings=' || has_capability('manage_settings') || ' workflows=' || has_capability('manage_workflows');
select 'hr sees the owner''s project / its leads: ' || t_val($$select count(*)::text from projects$$) || ' / ' || t_val($$select count(*)::text from leads$$);
select 'hr creates a project: ' || t_try($$insert into projects (name, owner_id) values ('HR project', auth.uid())$$);
select 'hr edits the owner''s lead: ' || t_try($$update leads set name = 'Edited by HR' where name = 'A lead'$$) || ' rows=' || t_val($$select count(*)::text from leads where name = 'Edited by HR'$$);
select 'hr reads company settings: ' || t_val($$select count(*)::text from company_settings$$);
select 'hr renames a department: ' || t_try($$update departments set name = name where name = 'Sales'$$);
select 'hr edits someone else''s phone: ' || t_try($$update profiles set phone = '+91 90000 00000' where email = 'sales@metrol.in'$$);
select 'hr changes someone''s role (expect denied): ' || t_try($$update profiles set role = 'owner' where email = 'sales@metrol.in'$$);
reset role;
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'owner sees the HR project too: ' || t_val($$select count(*)::text from projects where name = 'HR project'$$);
reset role;
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'sales rep reads company settings (expect 0): ' || t_val($$select count(*)::text from company_settings$$);
select 'sales rep creates a project (expect denied): ' || t_try($$insert into projects (name, owner_id) values ('Rep project', auth.uid())$$);
select 'sales rep sees projects (expect 0): ' || t_val($$select count(*)::text from projects$$);
reset role;

\echo '--- 0041: the hand-made site_settings table'
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'staff (not owner-level) changes site_settings: ' || t_try($$update site_settings set data = '{"by":"rep"}'$$);
reset role;
select 'did the rep''s change land (expect no): ' || case when (select data->>'by' from site_settings) = 'rep' then 'YES' else 'no' end;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false) \g /dev/null
set role authenticated;
select 'stranger reads / changes site_settings (expect 0 / 0 rows): ' || t_val($$select count(*)::text from site_settings$$) || ' / ' || t_try($$update site_settings set data = '{"by":"stranger"}'$$);
reset role;
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'hr changes site_settings: ' || t_try($$update site_settings set data = '{"by":"hr"}'$$);
reset role;
select 'did HR''s change land (expect yes): ' || case when (select data->>'by' from site_settings) = 'hr' then 'yes' else 'NO' end;
