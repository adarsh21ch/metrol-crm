-- 0044 (Phase 2, Round 2): content items, the hand-off, tasks.
-- Runs after workflow_tests, reusing rls_tests' t_try / t_val / pid / eid.
-- The people and clients are rls_tests' by then: Subhash Goyal (c…01) has
-- two SMMs — Deepanshu holds the Healing Rahasya fan page, Samiksha holds
-- Herbal Life — and Lokesh as its one Editor. Lavbhushan (c…02) has nobody.
-- "(expect …)" lines are passes when they say what they expect.
\pset format unaligned
\pset tuples_only on

-- Read as the database, whoever is signed in: where an item is, and who
-- holds what is still open on it.
create or replace function public.item_state(p_code text) returns text language sql security definer as $$
  select i.code || ' @ ' || s.name
         || coalesce(' | open: ' || (select string_agg(t.code || ' ' || coalesce(e.full_name, 'NOBODY') || ' [' || ts.name || ']', ', ' order by t.created_at)
                                       from tasks t join task_statuses ts on ts.id = t.status_id left join employees e on e.id = t.assignee_id
                                      where t.content_item_id = i.id and not ts.is_done), '')
         || case when i.completed_at is not null then ' | finished' else '' end
    from content_items i join workflow_stages s on s.id = i.stage_id where i.code = p_code $$;
create or replace function public.stage_of(p_workflow text, p_stage text) returns uuid language sql security definer as $$
  select s.id from workflow_stages s join workflows w on w.id = s.workflow_id where w.name = p_workflow and s.name = p_stage $$;
create or replace function public.status_of(p_name text) returns uuid language sql security definer as $$
  select id from task_statuses where name = p_name $$;
create or replace function public.task_of(p_code text) returns uuid language sql security definer as $$
  select id from tasks where code = p_code $$;
create or replace function public.inbox(p_name text) returns text language sql security definer as $$
  select coalesce(string_agg(n.type || ' — ' || n.title, ' | ' order by n.created_at), 'nothing')
    from notifications n join employees e on e.id = n.recipient_employee_id
   where e.full_name = p_name and n.type like 'task_%' $$;
grant execute on function public.item_state(text), public.stage_of(text, text), public.status_of(text),
                          public.task_of(text), public.inbox(text) to authenticated;

\echo '--- 0044: an SMM adds a reel to the fan page they hold'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'create (expect C-00001 at Idea): ' || t_val($$select c.code || ' at ' || (select name from workflow_stages where id = c.stage_id)
  from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Diwali offer reel',
       (select id from content_formats where name = 'Reel'), 'Hook: 3 remedies', 'https://docs.google.com/document/d/x', '2026-10-20', '[]') c$$);
select 'state (expect Idea, T-00001 to Deepanshu, the page holder): ' || item_state('C-00001');
select 'insert an item directly (expect denied — create_content_item is the door): ' || t_try($$insert into content_items (client_id, workflow_id, title) values ('c0000000-0000-0000-0000-000000000001', (select id from workflows where name = 'Fan page reel'), 'x')$$);
select 'add content on Lavbhushan, not on its team (expect denied): ' || t_try($$select create_content_item('c0000000-0000-0000-0000-000000000002', null, (select id from workflows where name = 'Main page reel'), 'Nope')$$);
select 'finish Idea: ' || t_try($$update tasks set status_id = status_of('Completed') where code = 'T-00001'$$);
select 'state (expect Scripting, T-00002 to Deepanshu): ' || item_state('C-00001');
select 'move it to Editing by hand: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Editing') where code = 'C-00001'$$);
select 'state (expect Editing, T-00003 to Lokesh, the only editor): ' || item_state('C-00001');
select 'the skipped task closed itself: ' || t_val($$select string_agg(coalesce(note, '-'), ' / ') from task_events where kind = 'status' and task_id = task_of('T-00002')$$);
select 'move it to a stage of another workflow (expect denied): ' || t_try($$update content_items set stage_id = stage_of('Main page reel', 'Client review') where code = 'C-00001'$$);
select 'move it to another client (expect denied): ' || t_try($$update content_items set client_id = 'c0000000-0000-0000-0000-000000000002' where code = 'C-00001'$$);
select 'Deepanshu''s own actions told him nothing (expect nothing): ' || inbox('Deepanshu');
reset role;
select 'Lokesh was told: ' || inbox('Lokesh');

\echo '--- 0044: the editor finishes, the SMM gets the review'
select set_config('request.jwt.claim.sub', pid('editor@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'editor sees the client''s tasks: ' || t_val($$select string_agg(code, ',' order by code) from tasks$$);
select 'editor reads the item and its names: ' || t_val($$select count(*) || ' item, assignee name ' || (select assignee_name from v_tasks where code = 'T-00003') from content_items$$);
select 'editor finishes Editing: ' || t_try($$update tasks set status_id = status_of('Completed') where code = 'T-00003'$$);
select 'state (expect SMM review, T-00004 to Deepanshu): ' || item_state('C-00001');
reset role;
select 'Deepanshu was told: ' || inbox('Deepanshu');

\echo '--- 0044: two editors on a client — the item names one, or the task waits'
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'head adds Samiksha as a second Editor: ' || t_try($$insert into client_assignments (client_id, employee_id, role_id) values ('c0000000-0000-0000-0000-000000000001', eid('Samiksha'), (select id from roles where name = 'Editor'))$$);
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'create C-00002 naming Samiksha as its Editor: ' || t_val(format($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Navratri special', null, null, null, null,
       '[{"role_id": "%s", "employee_id": "%s"}]')$$, (select id from roles where name = 'Editor'), eid('Samiksha')));
select 'create C-00003 naming no editor: ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Morning routine')$$);
select 'C-00002 to Editing: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Editing') where code = 'C-00002'$$);
select 'state (expect Samiksha): ' || item_state('C-00002');
reset role;
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'the head moves C-00003 to Editing: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Editing') where code = 'C-00003'$$);
select 'state (expect NOBODY — two editors, none named): ' || item_state('C-00003');
reset role;
select 'the item''s creator was told: ' || inbox('Deepanshu');
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu names Lokesh on C-00003: ' || t_try(format($$insert into content_item_assignees (item_id, role_id, employee_id) values ((select id from content_items where code = 'C-00003'), '%s', '%s')$$, (select id from roles where name = 'Editor'), eid('Lokesh')));
select 'state (expect Lokesh now): ' || item_state('C-00003');
select 'a reel on Samiksha''s page goes to her (page holder): ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
       (select id from workflows where name = 'Fan page reel'), 'Herbal tea myths')$$) || ' — ' || item_state('C-00004');
reset role;
select 'Samiksha was told: ' || inbox('Samiksha');

\echo '--- 0044: a salesperson sees none of it'
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'sales reads items / tasks / v_tasks (expect 0/0/0): ' || t_val($$select (select count(*) from content_items) || '/' || (select count(*) from tasks) || '/' || (select count(*) from v_tasks)$$);
select 'sales reads a thread (expect 0 rows): ' || t_val($$select count(*)::text from task_thread(task_of('T-00003'))$$);
select 'sales comments on it (expect denied): ' || t_try($$insert into task_comments (task_id, body) values (task_of('T-00003'), 'hi')$$);
select 'sales moves an item (expect 0 rows): ' || t_val($$with u as (update content_items set stage_id = stage_of('Fan page reel', 'Posted') where code = 'C-00001' returning 1) select count(*)::text from u$$);
reset role;

\echo '--- 0044: a task on its own, and the assignee''s limits'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'HR gives Sales Rep a task, due yesterday: ' || t_try($$insert into tasks (title, assignee_id, due_at, priority) values ('Send your bank details', eid('Sales Rep'), now() - interval '1 day', 'high')$$);
select 'its code: ' || t_val($$select code from tasks where title = 'Send your bank details'$$);
select 'HR gives a task a stage (expect denied): ' || t_try($$insert into tasks (title, content_item_id, stage_id) select 'x', i.id, i.stage_id from content_items i where i.code = 'C-00001'$$);
reset role;
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'sales sees it (expect 1): ' || t_val($$select count(*)::text from v_tasks$$) || ', giver ' || t_val($$select creator_name from v_tasks$$);
select 'sales starts it: ' || t_try($$update tasks set status_id = status_of('In progress') where title = 'Send your bank details'$$);
select 'sales moves the due date (expect denied): ' || t_try($$update tasks set due_at = now() + interval '9 days' where title = 'Send your bank details'$$);
select 'sales hands it to the Sales Lead (expect denied): ' || t_try($$update tasks set assignee_id = eid('Sales Lead') where title = 'Send your bank details'$$);
select 'sales deletes it (expect 0 rows): ' || t_val($$with d as (delete from tasks where title = 'Send your bank details' returning 1) select count(*)::text from d$$);
select 'sales gives the Sales Lead a task (expect denied): ' || t_try($$insert into tasks (title, assignee_id) values ('Boss, do this', eid('Sales Lead'))$$);
select 'sales gives themself a task: ' || t_try($$insert into tasks (title, assignee_id) values ('Call back Mr Jain', eid('Sales Rep'))$$);
reset role;
select set_config('request.jwt.claim.sub', pid('saleslead@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Sales Lead sees Sales Rep''s tasks before any reporting line (expect 0): ' || t_val($$select count(*)::text from tasks$$);
reset role;
update employees set reporting_to = eid('Sales Lead') where full_name = 'Sales Rep';
select set_config('request.jwt.claim.sub', pid('saleslead@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'and after (expect 2): ' || t_val($$select count(*)::text from tasks$$);
select 'the manager may change its priority: ' || t_try($$update tasks set priority = 'urgent' where title = 'Send your bank details'$$);
reset role;
select 'overdue tick (expect 1, to the Sales Lead): ' || remind_overdue_tasks() || ', again (expect 0): ' || remind_overdue_tasks();
select 'the Sales Lead was told: ' || inbox('Sales Lead');

\echo '--- 0044: comments and the thread'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu comments on Lokesh''s task: ' || t_try($$insert into task_comments (task_id, body) values (task_of('T-00003'), 'Cut the intro at 0:14, please')$$);
reset role;
select 'Lokesh was told: ' || inbox('Lokesh');
select set_config('request.jwt.claim.sub', pid('editor@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Lokesh reads the thread: ' || t_val($$select string_agg(coalesce(event, 'comment') || ':' || coalesce(who, '?'), ' → ' order by at) from task_thread(task_of('T-00003'))$$);
select 'Lokesh edits the comment (expect denied): ' || t_try($$update task_comments set body = 'x'$$);
select 'Lokesh writes history (expect denied): ' || t_try($$insert into task_events (task_id, kind) values (task_of('T-00003'), 'status')$$);
reset role;

\echo '--- 0044: who may give tasks to whom'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu''s picker on Subhash (himself + the team): ' || t_val($$select string_agg(full_name, ', ' order by full_name) from task_people('c0000000-0000-0000-0000-000000000001')$$);
select 'and with no client (himself): ' || t_val($$select string_agg(full_name, ', ') from task_people(null)$$);
reset role;
select set_config('request.jwt.claim.sub', pid('cmlead@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'the C&M head''s picker (their department, via See all work): ' || t_val($$select string_agg(full_name, ', ' order by full_name) from task_people(null)$$);
reset role;

\echo '--- 0044: HR (no employee record), the owner, deletes'
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'HR sees every task: ' || t_val($$select count(*)::text from tasks$$);
select 'HR posts C-00001: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Posted') where code = 'C-00001'$$);
select 'state (expect Posted, nothing open, finished): ' || item_state('C-00001');
select 'HR deletes the Editing stage (expect denied — items and tasks point at it): ' || t_try($$delete from workflow_stages where id = stage_of('Fan page reel', 'Editing')$$);
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'SMM deletes an item (expect 0 rows): ' || t_val($$with d as (delete from content_items where code = 'C-00002' returning 1) select count(*)::text from d$$);
select 'SMM deletes a stage task (expect 0 rows): ' || t_val($$with d as (delete from tasks where code = 'T-00001' returning 1) select count(*)::text from d$$);
reset role;
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'owner deletes C-00002: ' || t_val($$with d as (delete from content_items where code = 'C-00002' returning 1) select count(*)::text from d$$)
       || ', its tasks left (expect 0): ' || t_val($$select count(*)::text from tasks t where t.title like '% — Navratri special'$$);
reset role;
select 'a notification about a deleted task keeps its text: ' || (select count(*) from notifications where type = 'task_assigned' and title like '%Navratri%' and task_id is null);

\echo '--- 0044: a stage deadline becomes the task''s due time; overdue with no manager goes to the giver'
update workflow_stages set sla_hours = 24 where id = stage_of('Fan page reel', 'Scripting');
select set_config('request.jwt.claim.sub', pid('smm2@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Samiksha finishes Idea on C-00004: ' || t_try($$update tasks set status_id = status_of('Completed') where code = 'T-00009'$$);
select 'Scripting is due in 24 hours (expect 24): ' || t_val($$select round(extract(epoch from (due_at - created_at)) / 3600)::text from tasks where content_item_id = (select id from content_items where code = 'C-00004') and completed_at is null$$);
select 'an SMM on the team may move the editor''s deadline: ' || t_try($$update tasks set due_at = now() - interval '2 hours' where code = 'T-00008'$$);
reset role;
update workflow_stages set sla_hours = null where id = stage_of('Fan page reel', 'Scripting');
select 'overdue tick (Lokesh has no manager — the task''s giver hears): ' || remind_overdue_tasks();
select 'CM Lead (who moved C-00003 into Editing) was told: ' || inbox('CM Lead');
