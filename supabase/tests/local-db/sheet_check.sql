\pset format aligned
-- LavBhushan's May–Aug tab, typed in exactly as the sheet shows it
insert into view_targets (id, client_id, label, total_views, starts_on, ends_on, week_counts_in)
values ('e0000000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002','2026',1000000000,'2026-01-01','2026-12-31','end');
insert into view_target_periods (id, target_id, label, starts_on, ends_on, share_pct, target_views, sort_order) values
 ('f0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000aa','Jan–Apr','2026-01-01','2026-04-30',30,null,1),
 ('f0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-0000000000aa','May–Aug','2026-05-01','2026-08-31',30,425296713,2),
 ('f0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-0000000000aa','Sep–Dec','2026-09-01','2026-12-31',40,null,3);
insert into pages (id, client_id, page_type, label) values ('d0000000-0000-0000-0000-0000000000f1','c0000000-0000-0000-0000-000000000002','fan','LB fans all');
insert into pages (id, client_id, page_type, label) values ('d0000000-0000-0000-0000-0000000000f2','c0000000-0000-0000-0000-000000000002','main','LB main');
insert into page_channels (id, page_id, platform, handle) values
 ('a0000000-0000-0000-0000-0000000000f1','d0000000-0000-0000-0000-0000000000f1','instagram','@lbfans'),
 ('a0000000-0000-0000-0000-0000000000f2','d0000000-0000-0000-0000-0000000000f2','instagram','@lbmain');
insert into weekly_views (channel_id, week_start, views, followers) values
 ('a0000000-0000-0000-0000-0000000000f1','2026-04-27', 6968874, 2663), ('a0000000-0000-0000-0000-0000000000f2','2026-04-27', 323773, null),
 ('a0000000-0000-0000-0000-0000000000f1','2026-05-04',20763930, 5965), ('a0000000-0000-0000-0000-0000000000f2','2026-05-04', 654064, null),
 ('a0000000-0000-0000-0000-0000000000f1','2026-05-11',28873010, 7992), ('a0000000-0000-0000-0000-0000000000f2','2026-05-11', 519951, null),
 ('a0000000-0000-0000-0000-0000000000f1','2026-05-18',37262242, 7249), ('a0000000-0000-0000-0000-0000000000f2','2026-05-18', 831573, null),
 ('a0000000-0000-0000-0000-0000000000f1','2026-05-25',24602639, null), ('a0000000-0000-0000-0000-0000000000f2','2026-05-25', 954910, null);
insert into view_adjustments (target_id, week_start, type_id, views, note) values
 ('e0000000-0000-0000-0000-0000000000aa','2026-05-18',(select id from view_adjustment_types where name like 'Difference%'), -13301000, null),
 ('e0000000-0000-0000-0000-0000000000aa','2026-05-18',(select id from view_adjustment_types where name like 'Collab%'), -287520, null),
 ('e0000000-0000-0000-0000-0000000000aa','2026-05-18',(select id from view_adjustment_types where name like 'Susp%'), -46424811, null);
select week_start, views_fan, views_main, views_fan+views_main as weekly_total, adjustments, running_left,
       case week_start when '2026-04-27' then 418004066 when '2026-05-04' then 396586072 when '2026-05-11' then 367193111
                       when '2026-05-18' then 389112627 when '2026-05-25' then 363555078 end as sheet_left
  from v_target_progress where grain='week' and period_id='f0000000-0000-0000-0000-000000000002' and week_start <= '2026-06-01' order by week_start;
select grain, coalesce(p.label,'(target)') as period, goal, achieved, left_views, round(elapsed_share,3) elapsed, round(achieved_share,4) achieved_share
  from v_target_progress v left join view_target_periods p on p.id = v.period_id
 where v.target_id='e0000000-0000-0000-0000-0000000000aa' and grain in ('target','period') order by grain desc, p.sort_order;
select 'weeks generated for May–Aug (first, last, count): ' || min(week_start) || ', ' || max(week_start) || ', ' || count(*)
  from v_target_progress where grain='week' and period_id='f0000000-0000-0000-0000-000000000002';
select 'weeks for Sep–Dec (first, last): ' || min(week_start) || ', ' || max(week_start) from v_target_progress where grain='week' and period_id='f0000000-0000-0000-0000-000000000003';
select 'Jan–Apr last week (expect 2026-04-20 under end rule): ' || max(week_start) from v_target_progress where grain='week' and period_id='f0000000-0000-0000-0000-000000000001';
