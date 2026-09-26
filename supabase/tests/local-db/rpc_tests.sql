\pset format unaligned
\pset tuples_only on
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false); set role authenticated;
select 'create via rpc: ' || t_val($$select save_view_target('{"client_id":"c0000000-0000-0000-0000-000000000001","label":"FY","total_views":750000000,"starts_on":"2026-04-01","ends_on":"2026-12-31","count_main":true,"count_fan":true,"platforms":["instagram","youtube"],"week_counts_in":"start"}'::jsonb,
  '[{"label":"Apr–Jun","starts_on":"2026-04-01","ends_on":"2026-06-30","share_pct":20,"sort_order":1},{"label":"Jul–Sep","starts_on":"2026-07-01","ends_on":"2026-09-30","share_pct":30,"sort_order":2},{"label":"Oct–Dec","starts_on":"2026-10-01","ends_on":"2026-12-31","share_pct":50,"sort_order":3}]'::jsonb)::text$$);
select 'periods now: ' || string_agg(label || ' ' || starts_on || '..' || ends_on, ' | ' order by starts_on) from view_target_periods where target_id = (select id from view_targets where label='FY');
-- shift boundaries in one save (Apr–Jul, Aug–Sep): passes through an overlap mid-save
select 'shift via rpc: ' || t_val(format($$select save_view_target('{"id":"%s","client_id":"c0000000-0000-0000-0000-000000000001","label":"FY","total_views":750000000,"starts_on":"2026-04-01","ends_on":"2026-12-31","count_main":true,"count_fan":true,"platforms":["instagram"],"week_counts_in":"end"}'::jsonb,
  '[{"id":"%s","label":"Apr–Jul","starts_on":"2026-04-01","ends_on":"2026-07-31","share_pct":25,"sort_order":1},{"id":"%s","label":"Aug–Sep","starts_on":"2026-08-01","ends_on":"2026-09-30","share_pct":25,"sort_order":2}]'::jsonb)::text$$,
  (select id from view_targets where label='FY'),
  (select id from view_target_periods where label='Apr–Jun'),
  (select id from view_target_periods where label='Jul–Sep')));
select 'periods after shift: ' || string_agg(label || ' ' || starts_on || '..' || ends_on, ' | ' order by starts_on) from view_target_periods where target_id = (select id from view_targets where label='FY');
select 'overlap in one save (expect denied): ' || t_val(format($$select save_view_target('{"id":"%s","client_id":"c0000000-0000-0000-0000-000000000001","label":"FY","total_views":750000000,"starts_on":"2026-04-01","ends_on":"2026-12-31","count_main":true,"count_fan":true,"platforms":["instagram"],"week_counts_in":"end"}'::jsonb,
  '[{"label":"A","starts_on":"2026-04-01","ends_on":"2026-08-31","share_pct":50},{"label":"B","starts_on":"2026-08-01","ends_on":"2026-09-30","share_pct":50}]'::jsonb)::text$$, (select id from view_targets where label='FY')));
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false); set role authenticated;
select 'SMM edits target via rpc (expect denied): ' || t_val(format($$select save_view_target('{"id":"%s","client_id":"c0000000-0000-0000-0000-000000000001","label":"hacked","total_views":1,"starts_on":"2026-04-01","ends_on":"2026-12-31","count_main":true,"count_fan":true,"platforms":["instagram"]}'::jsonb, '[]'::jsonb)::text$$, (select id from view_targets where label='FY')));
reset role;
select 'label still FY: ' || (select count(*) from view_targets where label='FY');
