-- 0043 (Phase 2, Round 1): workflows, stages, task statuses, content formats.
-- Runs after rls_tests, whose t_try / t_val / pid helpers it reuses.
-- "(expect …)" lines are passes when they say what they expect.
\pset format unaligned
\pset tuples_only on

\echo '--- 0043: the seed'
select 'workflows: ' || string_agg(w.name || ' ' || (select count(*) from workflow_stages s where s.workflow_id = w.id), ', ' order by w.sort_order) from workflows w;
select 'main page reel: ' || string_agg(s.name || coalesce('/' || r.name, ''), ' → ' order by s.sort_order)
  from workflow_stages s join workflows w on w.id = s.workflow_id left join roles r on r.id = s.owner_role_id
 where w.name = 'Main page reel';
select 'fan page reel skips client review (expect 0): ' || count(*)
  from workflow_stages s join workflows w on w.id = s.workflow_id where w.name = 'Fan page reel' and s.name = 'Client review';
select 'statuses: ' || string_agg(name || case when is_done then '*' else '' end, ' → ' order by sort_order) from task_statuses;
select 'formats: ' || string_agg(name, ', ' order by sort_order) from content_formats;

\echo '--- 0043: an SMM reads every list, changes none'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'smm reads (expect 2 / 21 / 6 / 6): ' || t_val($$select (select count(*) from workflows) || ' / ' || (select count(*) from workflow_stages) || ' / ' || (select count(*) from task_statuses) || ' / ' || (select count(*) from content_formats)$$);
select 'smm adds a stage (expect denied): ' || t_try($$insert into workflow_stages (workflow_id, name, sort_order) select id, 'Sneaky', 99 from workflows where name = 'Main page reel'$$);
select 'smm renames a stage (expect 0 rows): ' || t_val($$with u as (update workflow_stages set name = 'Hacked' where name = 'Idea' returning 1) select count(*)::text from u$$);
select 'smm reorders (expect denied): ' || t_try($$select reorder_workflow_list('task_statuses', array(select id from task_statuses order by sort_order desc))$$);
select 'smm adds a format (expect denied): ' || t_try($$insert into content_formats (name) values ('Meme')$$);
reset role;

\echo '--- 0043: HR (no employee record) runs them'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'hr adds a stage: ' || t_try($$insert into workflow_stages (workflow_id, name, sort_order, owner_role_id) select w.id, 'Thumbnail', 12, (select id from roles where name = 'Editor') from workflows w where w.name = 'Main page reel'$$);
select 'hr renames it (expect 1): ' || t_val($$with u as (update workflow_stages set name = 'Cover image', sla_hours = 24 where name = 'Thumbnail' returning 1) select count(*)::text from u$$);
select 'hr moves it first (expect 12): ' || t_val($$select reorder_workflow_list('workflow_stages', array(select s.id from workflow_stages s join workflows w on w.id = s.workflow_id where w.name = 'Main page reel' order by (s.name = 'Cover image') desc, s.sort_order))::text$$);
select 'first stage now: ' || t_val($$select s.name from workflow_stages s join workflows w on w.id = s.workflow_id where w.name = 'Main page reel' order by s.sort_order limit 1$$);
select 'hr deletes that stage (unused): ' || t_try($$delete from workflow_stages where name = 'Cover image'$$);
select 'hr puts the order back (expect 11): ' || t_val($$select reorder_workflow_list('workflow_stages', array(select s.id from workflow_stages s join workflows w on w.id = s.workflow_id where w.name = 'Main page reel' order by s.sort_order))::text$$);
select 'hr adds a workflow: ' || t_try($$insert into workflows (name, page_type, sort_order) values ('Main page carousel', 'main', 3)$$);
select 'hr deletes a workflow (expect denied — retire instead): ' || t_try($$delete from workflows where name = 'Main page carousel'$$);
select 'hr retires it (expect 1): ' || t_val($$with u as (update workflows set is_active = false where name = 'Main page carousel' returning 1) select count(*)::text from u$$);
select 'hr adds a status: ' || t_try($$insert into task_statuses (name, tone, sort_order) values ('On hold', 'warn', 7)$$);
select 'hr deletes a status (expect denied): ' || t_try($$delete from task_statuses where name = 'On hold'$$);
select 'hr adds a format: ' || t_try($$insert into content_formats (name, sort_order) values ('Podcast clip', 7)$$);
select 'duplicate format name (expect denied): ' || t_try($$insert into content_formats (name, sort_order) values ('Reel', 8)$$);
select 'reorder a table that is not a list (expect denied): ' || t_try($$select reorder_workflow_list('employees', array[]::uuid[])$$);
reset role;

\echo '--- 0043: the owner'
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'owner renames a status (expect 1): ' || t_val($$with u as (update task_statuses set name = 'Paused' where name = 'On hold' returning 1) select count(*)::text from u$$);
reset role;

\echo '--- 0043: a company-wide role given "Workflows & lists" on Roles & access'
-- (A team-lead role like Department Head is held INSIDE its department
-- (0035), so it never unlocks a company-wide list — has_capability() is
-- company-wide only. The tick has to sit on a role held company-wide.)
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'SMM before (expect denied): ' || t_try($$insert into content_formats (name, sort_order) values ('Before', 9)$$);
reset role;
insert into role_capabilities (role_id, capability) select id, 'manage_workflows' from roles where name = 'Admin';
insert into employee_roles (employee_id, role_id) select eid('Deepanshu'), id from roles where name = 'Admin';
set role authenticated;
select 'SMM given Admin + the tick: ' || t_try($$insert into content_formats (name, sort_order) values ('After', 9)$$);
select 'and may reorder (expect 8: six seeded + two added above): ' || t_val($$select reorder_workflow_list('content_formats', array(select id from content_formats order by sort_order))::text$$);
reset role;
delete from employee_roles where employee_id = eid('Deepanshu') and role_id = (select id from roles where name = 'Admin');
delete from role_capabilities where capability = 'manage_workflows' and role_id = (select id from roles where name = 'Admin');
delete from content_formats where name in ('After', 'Podcast clip');
delete from task_statuses where name = 'Paused';
delete from workflows where name = 'Main page carousel';
