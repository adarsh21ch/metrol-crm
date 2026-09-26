-- 0046 (Phase 2, Round 4): shoots, and 0047 (Round 5): posting, one claim
-- per reel, reel view snapshots. Runs after review_tests, reusing its
-- helpers (item_state, stage_of, status_of, inbox, last_notice).
-- Subhash Goyal (c…01): Healing Rahasya (d…02) is Deepanshu's fan page.
-- "(expect …)" lines are passes when they say what they expect.
\pset format unaligned
\pset tuples_only on

create or replace function public.code_of(p_title text) returns text language sql security definer as $$
  select code from content_items where title = p_title $$;
create or replace function public.id_of(p_title text) returns uuid language sql security definer as $$
  select id from content_items where title = p_title $$;
create or replace function public.shoot_id(p_code text) returns uuid language sql security definer as $$
  select id from shoots where code = p_code $$;
create or replace function public.notices_since(p_name text, p_since timestamptz) returns text language sql security definer as $$
  select coalesce(string_agg(n.title || ' — ' || n.body, ' | ' order by n.created_at), 'nothing')
    from notifications n join employees e on e.id = n.recipient_employee_id
   where e.full_name = p_name and n.created_at >= p_since $$;
grant execute on function public.code_of(text), public.id_of(text), public.shoot_id(text), public.notices_since(text, timestamptz) to authenticated;

\echo '--- setup: two DOPs on Subhash Goyal''s team (one with a login), a DOP elsewhere'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000021', 'dop@metrol.in');
update public.profiles set department_id = (select id from departments where name = 'Production'), name = 'Rahul' where email = 'dop@metrol.in';
insert into employees (profile_id, full_name, department_id, date_of_joining)
select id, 'Rahul', department_id, '2025-01-01' from profiles where email = 'dop@metrol.in';
insert into employees (full_name, department_id, date_of_joining)
values ('Amit', (select id from departments where name = 'Production'), '2025-01-01'),
       ('Kiran', (select id from departments where name = 'Production'), '2025-01-01');
insert into client_assignments (client_id, employee_id, role_id)
select 'c0000000-0000-0000-0000-000000000001', eid(n), (select id from roles where name = 'DOP / Production')
  from unnest(array['Rahul', 'Amit']) n;
select 'the fan workflow''s shoot stage (expect Shoot required): ' || (select string_agg(s.name, ',') from workflow_stages s
       join workflows w on w.id = s.workflow_id where w.name = 'Fan page reel' and s.is_shoot);

\echo '--- 0046: two reels, one waiting at Shoot required with nobody (two DOPs), one still an idea'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'add "Shoot test A": ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Shoot test A')$$);
select 'add "Shoot test B": ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Shoot test B')$$);
select 'A to Shoot required: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Shoot required') where title = 'Shoot test A'$$);
select 'A (expect Shoot required, NOBODY — two DOPs): ' || item_state(code_of('Shoot test A'));
reset role;

\echo '--- 0046: who may not plan a shoot'
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a salesperson plans one (expect denied): ' || t_try($$select save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 2)$$);
select 'a salesperson reads shoots (expect 0): ' || t_val($$select count(*) from v_shoots$$);
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'writing the table directly (expect denied): ' || t_try($$insert into shoots (client_id, shoot_on) values ('c0000000-0000-0000-0000-000000000001', current_date)$$);
select 'naming a DOP off the team (expect denied): ' || t_try($$select save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 2, '10:00', 'Studio', eid('Kiran'))$$);
select 'with another client''s reel (expect denied): ' || t_try($$select save_shoot(null, 'c0000000-0000-0000-0000-000000000002', current_date + 2, null, null, null, null, null, null, null, array[id_of('Shoot test A')])$$);

\echo '--- 0046: Deepanshu plans S-0001 with Rahul — A''s waiting task goes to Rahul, quietly; Rahul hears once'
select set_config('t.since', now()::text, false) \g /dev/null
select 'plan it: ' || t_val($$select code || ' ' || status || ' on ' || shoot_on::text || ' ' || coalesce(starts_at::text, '-') from save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 2, '10:00',
       'Studio, Metrol HQ', eid('Rahul'), eid('Deepanshu'), 'Two reels, one outfit change', 'FX3, 2 lights', null,
       array[id_of('Shoot test A'), id_of('Shoot test B')])$$);
select 'A (expect Shoot required, Rahul): ' || item_state(code_of('Shoot test A'));
select 'B (expect still Idea, Deepanshu): ' || item_state(code_of('Shoot test B'));
select 'Rahul is named on both reels for the DOP role (expect 2): ' || t_val($$select count(*) from content_item_assignees where employee_id = eid('Rahul')$$);
select 'the same reel on a second shoot (expect denied — already on S-0001): ' || t_try($$select save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 5, null, null, null, null, null, null, null, array[id_of('Shoot test A')])$$);
select 'Deepanshu reads it (expect S-0001, Rahul, Deepanshu, 2 reels): ' || t_val($$select code || ', ' || dop_name || ', ' || smm_name || ', ' || item_count || ' reels' from v_shoots where code = 'S-0001'$$);
select 'its reels (expect both, with their stages): ' || t_val($$select string_agg(item_title || ' @ ' || stage_name, ', ' order by item_title) from v_shoot_items where shoot_id = shoot_id('S-0001')$$);
reset role;
select 'Rahul''s notices (expect ONE: New shoot: S-0001 · Subhash Goyal): ' || notices_since('Rahul', current_setting('t.since')::timestamptz);

\echo '--- 0046: Rahul (the DOP) moves the day; Deepanshu hears "Shoot changed"'
select set_config('t.since', now()::text, false) \g /dev/null
select set_config('request.jwt.claim.sub', pid('dop@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Rahul sees his shoot (expect 1): ' || t_val($$select count(*) from v_shoots$$);
select 'Rahul moves it a day later: ' || t_try($$select save_shoot(shoot_id('S-0001'), null, current_date + 3, '09:30', 'Studio, Metrol HQ', eid('Rahul'), eid('Deepanshu'), 'Two reels, one outfit change', 'FX3, 2 lights', null, null)$$);
reset role;
select 'Deepanshu''s notices (expect Shoot changed: S-0001): ' || notices_since('Deepanshu', current_setting('t.since')::timestamptz);

\echo '--- 0046: Rahul marks it done — both reels move past the shoot; Deepanshu hears once'
select set_config('t.since', now()::text, false) \g /dev/null
select set_config('request.jwt.claim.sub', pid('dop@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a footage link without https:// (expect denied): ' || t_try($$select set_shoot_status(shoot_id('S-0001'), 'done', 'drive.google.com/x')$$);
select 'done, with the footage link: ' || t_val($$select status || ' ' || footage_url from set_shoot_status(shoot_id('S-0001'), 'done', 'https://drive.google.com/drive/folders/raw1')$$);
select 'again (expect done — a second click changes nothing): ' || t_val($$select status from set_shoot_status(shoot_id('S-0001'), 'done')$$);
reset role;
select 'A (expect Shoot done, Deepanshu): ' || item_state(code_of('Shoot test A'));
select 'B (expect Shoot done, Deepanshu — it was shot too): ' || item_state(code_of('Shoot test B'));
select 'A''s shoot task closed with (expect Shot on S-0001 — moved to Shoot done): ' || stage_task_note(code_of('Shoot test A'), 'Fan page reel', 'Shoot required', 'status');
select 'A''s new task begins (expect Shot on S-0001 — the raw footage link is on the shoot): ' || stage_task_note(code_of('Shoot test A'), 'Fan page reel', 'Shoot done', 'created');
select 'Deepanshu''s notices (expect ONE: Shoot done … 2 reels are yours at Shoot done): ' || notices_since('Deepanshu', current_setting('t.since')::timestamptz);
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'take a reel off the done shoot (expect denied): ' || t_try($$select save_shoot(shoot_id('S-0001'), null, current_date + 3, null, null, eid('Rahul'), eid('Deepanshu'), null, null, 'https://drive.google.com/drive/folders/raw1', array[id_of('Shoot test A')])$$);
select 'cancel the done shoot (expect denied): ' || t_try($$select set_shoot_status(shoot_id('S-0001'), 'cancelled')$$);
select 'delete the done shoot (expect 0 rows): ' || t_val($$with d as (delete from shoots where code = 'S-0001' returning 1) select count(*) from d$$);

\echo '--- 0046: cancel, clash, put back on, delete'
select 'add "Shoot test C": ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Shoot test C')$$);
select 'S-0002 with C: ' || t_val($$select code from save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 7, null, null, eid('Amit'), null, null, null, null, array[id_of('Shoot test C')])$$);
select 'cancel S-0002 (expect cancelled): ' || t_val($$select status from set_shoot_status(shoot_id('S-0002'), 'cancelled')$$);
select 'C (expect Idea — a cancelled shoot moves nothing): ' || item_state(code_of('Shoot test C'));
select 'S-0003 takes C (expect S-0003 — C is free again): ' || t_val($$select code from save_shoot(null, 'c0000000-0000-0000-0000-000000000001', current_date + 8, null, null, null, null, null, null, null, array[id_of('Shoot test C')])$$);
select 'put S-0002 back on (expect denied — C is on S-0003): ' || t_try($$select set_shoot_status(shoot_id('S-0002'), 'planned')$$);
select 'delete the cancelled S-0002 (expect 1): ' || t_val($$with d as (delete from shoots where code = 'S-0002' returning 1) select count(*) from d$$);
reset role;

\echo '--- 0047: posting finishes the reel and ties it to its code'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a share link (expect denied): ' || t_try($$select post_content_item(id_of('Shoot test A'), 'https://www.instagram.com/share/reel/abc')$$);
select 'post A: ' || t_val($$select coalesce(post_short_code, '-') || ' ' || (posted_at is not null)::text from post_content_item(id_of('Shoot test A'), 'https://www.instagram.com/reel/TESTCODE1/?igsh=x')$$);
select 'A (expect Posted, finished, no open task): ' || item_state(code_of('Shoot test A'));
select 'the same reel on B (expect denied — already posted as A): ' || t_try($$select post_content_item(id_of('Shoot test B'), 'https://instagram.com/reel/TESTCODE1')$$);
reset role;
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a salesperson posts (expect denied): ' || t_try($$select post_content_item(id_of('Shoot test B'), 'https://instagram.com/reel/OTHER1')$$);
reset role;

\echo '--- 0047: a second claim on the same reel is flagged, the first wins'
insert into incentive_claims (employee_id, department_id, page_id, reel_url, watch_until, created_at)
values (eid('Deepanshu'), (select department_id from employees where full_name = 'Deepanshu'), 'd0000000-0000-0000-0000-000000000002', 'https://www.instagram.com/reel/TESTCODE1/', current_date + 30, now() - interval '1 hour'),
       (eid('Samiksha'), (select department_id from employees where full_name = 'Samiksha'), 'd0000000-0000-0000-0000-000000000002', 'https://instagram.com/healingrahasya/reel/TESTCODE1', current_date + 30, now());
select 'codes and flags (expect TESTCODE1 twice, Samiksha''s flagged as Deepanshu''s duplicate): ' || (select string_agg(e.full_name || ' ' || c.short_code || coalesce(' dup of ' || (select e2.full_name from incentive_claims c2 join employees e2 on e2.id = c2.employee_id where c2.id = c.duplicate_of), ''), ', ' order by c.created_at)
  from incentive_claims c join employees e on e.id = c.employee_id where c.short_code = 'TESTCODE1');

\echo '--- 0047: reel views kept per day; the week''s gain worked out from them'
insert into page_reels (id, page_id, short_code, reel_url, views, posted_at)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'TESTCODE1', 'https://www.instagram.com/reel/TESTCODE1/', 100, now() - interval '20 days');
select 'first reading kept (expect 100): ' || (select views from page_reel_snapshots where page_reel_id = 'e0000000-0000-0000-0000-000000000001' and taken_on = office_today());
update page_reels set views = 150 where id = 'e0000000-0000-0000-0000-000000000001';
update page_reels set views = 120 where id = 'e0000000-0000-0000-0000-000000000001';
select 'the day keeps its highest (expect 150, one row): ' || (select string_agg(views::text, ',') from page_reel_snapshots where page_reel_id = 'e0000000-0000-0000-0000-000000000001');
select 'only today''s reading (expect 0 gained, 0 unmeasured, 1 reel): ' || (select views_gained || ' gained, ' || reels_unmeasured || ' unmeasured, ' || reels || ' reel' from v_page_week_views where page_id = 'd0000000-0000-0000-0000-000000000002' and week_start = date_trunc('week', office_today())::date);
insert into page_reel_snapshots (page_reel_id, page_id, taken_on, views)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', date_trunc('week', office_today())::date - 7, 40),
       ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', date_trunc('week', office_today())::date, 90)
on conflict (page_reel_id, taken_on) do nothing;
select 'Monday readings of 40 and 90 (expect last week 50 = Monday to Monday; this week 60 so far): ' || (select string_agg(to_char(week_start, 'DD Mon') || ': ' || views_gained || ' gained, ' || reels_unmeasured || ' unmeasured', ' / ' order by week_start desc) from v_page_week_views where page_id = 'd0000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a salesperson writes a snapshot (expect denied): ' || t_try($$insert into page_reel_snapshots (page_reel_id, page_id, taken_on, views) values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', current_date - 1, 1)$$);
reset role;
set role anon;
select 'signed out (expect denied): ' || t_try($$select count(*) from shoots$$);
select 'signed out, the week view (expect denied): ' || t_try($$select count(*) from v_page_week_views$$);
reset role;
