\pset format unaligned
\pset tuples_only on
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false); set role authenticated;
select 'SMM sees team of Subhash: ' || string_agg(full_name || ' (' || r.name || ')', ', ' order by full_name) from v_client_team t join roles r on r.id = t.role_id where client_id='c0000000-0000-0000-0000-000000000001' and ended_at is null;
select 'SMM sees Lavbhushan team rows (expect 0): ' || count(*) from v_client_team where client_id='c0000000-0000-0000-0000-000000000002';
select 'SMM assignable on Subhash (can add editors): ' || count(*) from assignable_staff('c0000000-0000-0000-0000-000000000001');
select 'SMM assignable on Lavbhushan (expect 0): ' || count(*) from assignable_staff('c0000000-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false); set role authenticated;
select 'Sales rep sees team rows (expect 0): ' || count(*) from v_client_team;
select 'Sales rep assignable (expect 0): ' || count(*) from assignable_staff('c0000000-0000-0000-0000-000000000001');
reset role;
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false); set role authenticated;
select 'CM lead sees all team rows: ' || count(*) || ', can list editors: ' || (select string_agg(full_name, ', ') from assignable_staff('c0000000-0000-0000-0000-000000000001') where full_name = 'Lokesh');
reset role;
