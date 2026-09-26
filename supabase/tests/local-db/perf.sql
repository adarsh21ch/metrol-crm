\timing off
-- 7 clients × 13 fan pages × 2 platforms × 52 weeks
insert into clients (id, name) select ('c1000000-0000-0000-0000-00000000000' || g)::uuid, 'Perf client ' || g from generate_series(1,7) g;
insert into pages (id, client_id, page_type, label)
select gen_random_uuid(), c.id, 'fan', 'p' || g from clients c cross join generate_series(1,13) g where c.name like 'Perf%';
insert into page_channels (page_id, platform, handle)
select p.id, pl, '@' || p.label from pages p join clients c on c.id = p.client_id cross join unnest(array['instagram','youtube']) pl where c.name like 'Perf%';
insert into weekly_views (channel_id, week_start, views)
select pc.id, d::date, (random()*1000000)::bigint
  from page_channels pc join pages p on p.id = pc.page_id join clients c on c.id = p.client_id
  cross join generate_series('2025-09-22'::date, '2026-09-14'::date, interval '7 days') d
 where c.name like 'Perf%';
insert into view_targets (client_id, label, total_views, starts_on, ends_on)
select id, 'FY', 750000000, '2026-04-01', '2027-03-31' from clients where name like 'Perf%';
insert into view_target_periods (target_id, label, starts_on, ends_on, share_pct, sort_order)
select t.id, v.l, v.s::date, v.e::date, v.p, v.o from view_targets t cross join (values ('Q1','2026-04-01','2026-06-30',20,1),('Q2','2026-07-01','2026-09-30',30,2),('Q3','2026-10-01','2026-12-31',50,3)) v(l,s,e,p,o)
 where t.label='FY';
-- a department-head style reader: put the CM lead's view to the test
update profiles set is_team_lead = true where email = 'cmlead@metrol.in';
select 'rows: ' || count(*) from weekly_views;
select set_config('request.jwt.claim.sub', (select id from profiles where email='cmlead@metrol.in')::text, false);
set role authenticated;
\timing on
select count(*) from weekly_views;
select count(*) from v_target_progress where grain = 'target';
select count(*) from v_target_progress where client_id = (select id from clients where name = 'Perf client 3');
reset role;
select set_config('request.jwt.claim.sub', (select id from profiles where email='smm1@metrol.in')::text, false);
set role authenticated;
select count(*) from weekly_views;
reset role;
