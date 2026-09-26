\pset format unaligned
\pset tuples_only on
create or replace function public.t_try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok';
exception when others then return 'DENIED: ' || sqlerrm; end $$;
create or replace function public.t_val(p_sql text) returns text language plpgsql as $$
declare r text; begin execute p_sql into r; return coalesce(r, 'null');
exception when others then return 'ERR: ' || sqlerrm; end $$;
grant execute on function public.t_try(text), public.t_val(text) to authenticated;
create or replace function public.pid(p_email text) returns uuid language sql security definer as $$ select id from profiles where email = p_email $$;
create or replace function public.eid(p_name text) returns uuid language sql security definer as $$ select id from employees where full_name = p_name $$;
create or replace function public.chan(p_page text, p_platform text default 'instagram') returns uuid language sql security definer as $$ select id from page_channels where page_id = p_page::uuid and platform = p_platform and is_active $$;
grant execute on function public.pid(text), public.eid(text), public.chan(text, text) to authenticated;

\echo '--- backfill'
select 'channels: ' || string_agg(handle || ' ' || url, ' | ' order by handle) from page_channels;

\echo '--- OWNER'
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false); set role authenticated;
select 'owner manage_settings=' || has_capability('manage_settings');
select 'owner add client: ' || t_try($$insert into clients (id, name) values ('c0000000-0000-0000-0000-000000000003','Dr Vinay')$$);
select 'owner money insert: ' || t_try($$insert into client_financials (client_id, monthly_value, payment_status) values ('c0000000-0000-0000-0000-000000000001', 150000, 'Paid')$$);
select 'owner reads money: ' || t_val($$select count(*)::text from client_financials$$);
select 'new client code: ' || t_val($$select code from clients where name='Dr Vinay'$$);
reset role;

\echo '--- HR (no employee row)'
select set_config('request.jwt.claim.sub', pid('metrolhr@gmail.com')::text, false); set role authenticated;
select 'hr is_hr()=' || is_hr() || ' manage_hr=' || has_capability('manage_hr') || ' manage_settings=' || has_capability('manage_settings');
select 'hr edit page label: ' || t_try($$update pages set label='HR edit' where id='d0000000-0000-0000-0000-000000000003'$$) || ' rows=' || t_val($$select count(*)::text from pages where label='HR edit'$$);
select 'hr assign LB page to Samiksha: ' || t_try($$insert into page_assignments (page_id, employee_id) values ('d0000000-0000-0000-0000-000000000004', eid('Samiksha'))$$);
select 'hr reads money rows (expect 0): ' || t_val($$select count(*)::text from client_financials$$);
select 'hr create target (expect denied): ' || t_try($$insert into view_targets (client_id, label, total_views, starts_on, ends_on) values ('c0000000-0000-0000-0000-000000000001','X',1,'2026-04-01','2027-03-31')$$);
reset role;
select 'Samiksha auto-joined Lavbhushan as: ' || coalesce((select r.name from client_assignments ca join roles r on r.id=ca.role_id where ca.client_id='c0000000-0000-0000-0000-000000000002' and ca.employee_id=eid('Samiksha') and ca.ended_at is null), 'NOT JOINED');

\echo '--- CM LEAD'
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false); set role authenticated;
select 'cm add client: ' || t_try($$insert into clients (id, name) values ('c0000000-0000-0000-0000-000000000004','Puneet Dhawan')$$);
select 'cm add page: ' || t_try($$insert into pages (id, client_id, page_type, label) values ('d0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000001','fan','Vedic Health')$$);
select 'cm add IG channel: ' || t_try($$insert into page_channels (page_id, platform, handle, url) values ('d0000000-0000-0000-0000-000000000005','instagram','@vedichealthpath','https://www.instagram.com/vedichealthpath/')$$);
select 'cm add YT channel: ' || t_try($$insert into page_channels (page_id, platform, handle, url) values ('d0000000-0000-0000-0000-000000000002','youtube','Healing Rahasya','https://youtube.com/channel/UCPoEDye')$$);
select 'mirror -> pages.instagram_handle: ' || t_val($$select instagram_handle from pages where id='d0000000-0000-0000-0000-000000000005'$$);
select 'cm create target: ' || t_try($$insert into view_targets (id, client_id, label, total_views, starts_on, ends_on) values ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','FY 2026-27',1000000000,'2026-01-01','2026-12-31')$$);
select 'cm add periods: ' || t_try($$insert into view_target_periods (target_id, label, starts_on, ends_on, share_pct, target_views, sort_order) values
  ('e0000000-0000-0000-0000-000000000001','Jan–Apr','2026-01-01','2026-04-30',30,null,1),
  ('e0000000-0000-0000-0000-000000000001','May–Aug','2026-05-01','2026-08-31',30,425296713,2),
  ('e0000000-0000-0000-0000-000000000001','Sep–Dec','2026-09-01','2026-12-31',40,null,3)$$);
select 'cm overlapping period (expect denied): ' || t_try($$insert into view_target_periods (target_id, label, starts_on, ends_on, share_pct) values ('e0000000-0000-0000-0000-000000000001','Bad','2026-08-15','2026-09-15',5)$$);
select 'cm reads money (expect 0): ' || t_val($$select count(*)::text from client_financials$$);
select 'cm enters views on any channel: ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000003'), '2026-09-14', 5000)$$);
select 'cm adds SMM to Subhash: ' || t_try($$insert into client_assignments (client_id, employee_id, role_id) values ('c0000000-0000-0000-0000-000000000001', eid('Samiksha'), (select id from roles where name='SMM'))$$);
select 'cm adds Management role (expect denied): ' || t_try($$insert into employee_roles (employee_id, role_id) values (eid('Deepanshu'), (select id from roles where name='Management'))$$);
reset role;

\echo '--- SMM Deepanshu (holds Healing Rahasya on Subhash)'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false); set role authenticated;
select 'smm reads Subhash targets / LB targets: ' || t_val($$select count(*) filter (where client_id='c0000000-0000-0000-0000-000000000001') || '/' || count(*) filter (where client_id='c0000000-0000-0000-0000-000000000002') from view_targets$$);
select 'smm enters own page IG: ' || t_try($$insert into weekly_views (channel_id, week_start, views, followers) values (chan('d0000000-0000-0000-0000-000000000002'), '2026-09-14', 70971, 2663)$$);
select 'smm enters own page YT: ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000002','youtube'), '2026-09-14', 11239)$$);
select 'smm enters someone else''s page (expect denied): ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000003'), '2026-09-07', 1)$$);
select 'smm enters a Tuesday (expect denied): ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000002'), '2026-09-15', 1)$$);
select 'smm enters a future week (expect denied): ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000002'), '2026-12-28', 1)$$);
select 'smm corrects own number: ' || t_try($$update weekly_views set views = 70972 where channel_id = chan('d0000000-0000-0000-0000-000000000002') and week_start='2026-09-14'$$);
select 'smm adds Editor on Subhash (chain): ' || t_try($$insert into client_assignments (client_id, employee_id, role_id) values ('c0000000-0000-0000-0000-000000000001', eid('Lokesh'), (select id from roles where name='Editor'))$$);
select 'smm adds SMM (expect denied): ' || t_try($$insert into client_assignments (client_id, employee_id, role_id) values ('c0000000-0000-0000-0000-000000000001', eid('Sales Rep'), (select id from roles where name='SMM'))$$);
select 'smm adds Editor on Lavbhushan (expect denied): ' || t_try($$insert into client_assignments (client_id, employee_id, role_id) values ('c0000000-0000-0000-0000-000000000002', eid('Lokesh'), (select id from roles where name='Editor'))$$);
select 'smm edits a client (expect denied): ' || t_try($$update clients set company='x' where id='c0000000-0000-0000-0000-000000000001'$$) || ' changed=' || t_val($$select count(*)::text from clients where company='x'$$);
select 'smm uploads proof own channel: ' || t_try(format($$insert into storage.objects (bucket_id, name) values ('view-proofs', '%s/2026-09-14-1.jpg')$$, chan('d0000000-0000-0000-0000-000000000002')));
select 'smm uploads proof other channel (expect denied): ' || t_try(format($$insert into storage.objects (bucket_id, name) values ('view-proofs', '%s/2026-09-14-1.jpg')$$, chan('d0000000-0000-0000-0000-000000000003')));
select 'smm reads links of Subhash? ' || t_val($$select can_see_client('c0000000-0000-0000-0000-000000000001')::text$$);
reset role;

\echo '--- Editor Lokesh'
select set_config('request.jwt.claim.sub', pid('editor@metrol.in')::text, false); set role authenticated;
select 'editor on Subhash=' || is_on_client('c0000000-0000-0000-0000-000000000001') || ' reads weekly rows=' || t_val($$select count(*)::text from weekly_views$$) || ' reads targets=' || t_val($$select count(*)::text from view_targets$$);
select 'editor enters views (expect denied): ' || t_try($$insert into weekly_views (channel_id, week_start, views) values (chan('d0000000-0000-0000-0000-000000000002'), '2026-09-07', 1)$$);
reset role;

\echo '--- Sales lead (a team lead, not C&M)'
select set_config('request.jwt.claim.sub', pid('saleslead@metrol.in')::text, false); set role authenticated;
select 'sales lead edits page (expect 0 rows): ' || t_try($$update pages set label='sales' where id='d0000000-0000-0000-0000-000000000001'$$) || ' changed=' || t_val($$select count(*)::text from pages where label='sales'$$);
select 'sales lead adds client in Sales dept (expect denied): ' || t_try($$insert into clients (name, department_id) values ('Sales client', (select id from departments where name='Sales'))$$);
select 'sales lead reads weekly rows (expect 0): ' || t_val($$select count(*)::text from weekly_views$$);
reset role;

\echo '--- chain ends'
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false); set role authenticated;
select 'cm ends Samiksha on Lavbhushan: ' || t_try($$update client_assignments set ended_at = now() where client_id='c0000000-0000-0000-0000-000000000002' and employee_id=eid('Samiksha') and ended_at is null$$);
select 'cm edits an assignment (expect denied): ' || t_try($$update client_assignments set role_id=(select id from roles where name='Editor') where employee_id=eid('Deepanshu')$$);
reset role;
select 'Samiksha LB pages after ending (expect 0): ' || (select count(*) from page_assignments pa join pages pg on pg.id=pa.page_id where pg.client_id='c0000000-0000-0000-0000-000000000002' and pa.employee_id=eid('Samiksha'));

\echo '--- old-bundle writes still land in channels'
update pages set instagram_handle='@renamed.main' where id='d0000000-0000-0000-0000-000000000001';
select 'channel after direct page write: ' || (select handle from page_channels where page_id='d0000000-0000-0000-0000-000000000001' and is_active);
insert into pages (id, client_id, page_type, instagram_handle) values ('d0000000-0000-0000-0000-000000000006','c0000000-0000-0000-0000-000000000002','main','@lavbhushanworld');
select 'channel created by old-style page insert: ' || (select handle from page_channels where page_id='d0000000-0000-0000-0000-000000000006');

\echo '--- audit + reminder'
select 'edits logged: ' || (select count(*) from weekly_view_edits);
select 'reminders created: ' || remind_weekly_views() || ', second call: ' || remind_weekly_views();
select 'reminder text: ' || (select body from notifications where type='views_reminder' limit 1);
