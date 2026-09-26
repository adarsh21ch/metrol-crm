-- 0045 (Phase 2, Round 3): versions and reviews.
-- Runs after work_tests, reusing its helpers (item_state, stage_of,
-- status_of, inbox) and its state: Subhash Goyal (c…01) has two SMMs
-- (Deepanshu holds Healing Rahasya, Samiksha holds Herbal Life) and, since
-- work_tests, two Editors (Lokesh, and Samiksha added by the head) — so an
-- Editing task with nobody named on the reel waits "Nobody yet", unless the
-- reel has been in Editing before (0045's hand-back rule).
-- "(expect …)" lines are passes when they say what they expect.
\pset format unaligned
\pset tuples_only on

-- Read as the database, whoever is signed in.
create or replace function public.item_of(p_code text) returns uuid language sql security definer as $$
  select id from content_items where code = p_code $$;
create or replace function public.ver_of(p_code text, p_n int) returns uuid language sql security definer as $$
  select v.id from content_versions v join content_items i on i.id = v.item_id where i.code = p_code and v.number = p_n $$;
create or replace function public.last_notice(p_name text) returns text language sql security definer as $$
  select n.type || ' — ' || n.title || ' — ' || n.body
    from notifications n join employees e on e.id = n.recipient_employee_id
   where e.full_name = p_name order by n.created_at desc limit 1 $$;
create or replace function public.stage_task_note(p_code text, p_workflow text, p_stage text, p_kind text) returns text language sql security definer as $$
  select string_agg(coalesce(ev.note, '-'), ' / ' order by ev.created_at)
    from task_events ev join tasks t on t.id = ev.task_id
   where t.content_item_id = item_of(p_code) and t.stage_id = stage_of(p_workflow, p_stage) and ev.kind = p_kind $$;
grant execute on function public.item_of(text), public.ver_of(text, int), public.last_notice(text),
                          public.stage_task_note(text, text, text, text) to authenticated;

\echo '--- 0045: a reel reaches Editing; the SMM gives the task to Lokesh without naming him on the reel'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'create C-00005 on Healing Rahasya: ' || t_val($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
       (select id from workflows where name = 'Fan page reel'), 'Tulsi for the monsoon')$$);
select 'to Editing by hand: ' || t_try($$update content_items set stage_id = stage_of('Fan page reel', 'Editing') where code = 'C-00005'$$);
select 'state (expect NOBODY — two editors, none named): ' || item_state('C-00005');
select 'Deepanshu hands the Editing task to Lokesh: ' || t_try($$update tasks set assignee_id = eid('Lokesh') where content_item_id = item_of('C-00005') and stage_id = stage_of('Fan page reel', 'Editing')$$);
select 'state (expect Lokesh): ' || item_state('C-00005');
reset role;

\echo '--- 0045: the editor adds V1'
select set_config('request.jwt.claim.sub', pid('editor@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a link without https:// (expect denied): ' || t_try($$insert into content_versions (item_id, url) values (item_of('C-00005'), 'drive.google.com/file/d/x')$$);
select 'a javascript: link (expect denied): ' || t_try($$insert into content_versions (item_id, url) values (item_of('C-00005'), 'javascript:alert(1)')$$);
select 'Lokesh adds V1, asking for number 99 (expect V1, trimmed, made at Editing): ' || t_val($$with v as (insert into content_versions (item_id, url, note, number)
       values (item_of('C-00005'), ' https://drive.google.com/file/d/wrong ', '  first cut  ', 99) returning number, url, note, stage_id)
       select 'V' || number || ' "' || note || '" ' || url || ' made at ' || (select name from workflow_stages where id = stage_id) from v$$);
select 'and V1 on C-00003 (his other reel): ' || t_val($$with v as (insert into content_versions (item_id, url) values (item_of('C-00003'), 'https://frame.io/r/abc') returning number) select 'V' || number from v$$);
select 'he corrects the C-00005 link (not reviewed yet): ' || t_try($$update content_versions set url = 'https://drive.google.com/file/d/v1' where id = ver_of('C-00005', 1)$$);
select 'he renumbers it (expect still V1): ' || t_val($$with u as (update content_versions set number = 7 where id = ver_of('C-00005', 1) returning number) select 'V' || number from u$$);
select 'he deletes it (expect denied — a version is never deleted): ' || t_try($$delete from content_versions where id = ver_of('C-00005', 1)$$);
select 'he reviews it at Editing (expect denied — not a review stage): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'approved')$$);
select 'he finishes Editing: ' || t_try($$update tasks set status_id = status_of('Completed') where content_item_id = item_of('C-00005') and stage_id = stage_of('Fan page reel', 'Editing')$$);
select 'state (expect SMM review, Deepanshu — the page holder): ' || item_state('C-00005');
reset role;

\echo '--- 0045: who may not review'
select set_config('request.jwt.claim.sub', pid('sales@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a salesperson reads versions / reviews (expect 0/0): ' || t_val($$select (select count(*) from v_content_versions) || '/' || (select count(*) from v_content_reviews)$$);
select 'a salesperson adds a version (expect denied): ' || t_try($$insert into content_versions (item_id, url) values (item_of('C-00005'), 'https://x.com/y')$$);
select 'a salesperson reviews it (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'approved')$$);
reset role;
set role anon;
select 'signed out (expect denied): ' || t_try($$select count(*) from content_versions$$);
reset role;

\echo '--- 0045: the SMM asks for changes — back to the editor who cut V1, with the notes'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu reads V1 with its author: ' || t_val($$select string_agg('V' || number || ' by ' || author_name || ' — ' || url, ', ') from v_content_versions where item_id = item_of('C-00005')$$);
select 'changes with no notes (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes')$$);
select 'a note with no words (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes', '[{"at": 3, "text": "  "}]')$$);
select 'a note past 24 hours (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes', '[{"at": 90000, "text": "x"}]')$$);
select 'a note at 1.5 seconds (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes', '[{"at": 1.5, "text": "x"}]')$$);
select 'back to a later stage (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes', '[{"text": "x"}]', stage_of('Fan page reel', 'Posted'))$$);
select 'back to another workflow''s stage (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes', '[{"text": "x"}]', stage_of('Main page reel', 'Editing'))$$);
select 'another reel''s version (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00003', 1), 'approved')$$);
select 'a decision that is neither (expect denied): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'maybe')$$);
select 'Deepanshu asks for changes on V1 (expect changes, back to Editing): ' || t_val($$select decision || ', back to ' || (select name from workflow_stages where id = back_to_stage_id)
       from review_content_item(item_of('C-00005'), ver_of('C-00005', 1), 'changes',
            '[{"at": 14, "text": "Cut the pause before tulsi"}, {"at": null, "text": "Music is too loud"}]')$$);
select 'state (expect Editing, LOKESH — he cut V1; two editors, none named): ' || item_state('C-00005');
reset role;
select 'the review task closed with the review''s words: ' || stage_task_note('C-00005', 'Fan page reel', 'SMM review', 'status');
select 'the new task''s history says why: ' || (select ev.note from task_events ev join tasks t on t.id = ev.task_id
         where ev.kind = 'created' and t.content_item_id = item_of('C-00005') order by ev.created_at desc limit 1);
select 'Lokesh was told (expect the first note, +1 more): ' || last_notice('Lokesh');

\echo '--- 0045: V2, then approval moves it on (a fan page skips Client review)'
select set_config('request.jwt.claim.sub', pid('editor@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Lokesh corrects V1 now (expect denied — reviewed): ' || t_try($$update content_versions set note = 'x' where id = ver_of('C-00005', 1)$$);
select 'Lokesh reads the notes: ' || t_val($$select string_agg(r.reviewer_name || ' @' || coalesce(n->>'at', '—') || ': ' || (n->>'text'), '; ')
       from v_content_reviews r, jsonb_array_elements(r.notes) n where r.item_id = item_of('C-00005')$$);
select 'Lokesh adds V2: ' || t_val($$with v as (insert into content_versions (item_id, url) values (item_of('C-00005'), 'https://drive.google.com/file/d/v2') returning number) select 'V' || number from v$$);
select 'Lokesh finishes Editing again: ' || t_try($$update tasks set status_id = status_of('Completed') where content_item_id = item_of('C-00005') and stage_id = stage_of('Fan page reel', 'Editing') and completed_at is null$$);
select 'state (expect SMM review, Deepanshu again): ' || item_state('C-00005');
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu approves V2: ' || t_val($$select decision || ' / for the client: ' || for_client from review_content_item(item_of('C-00005'), ver_of('C-00005', 2), 'approved', '[{"text": "Lovely"}]')$$);
select 'state (expect Approved — the fan workflow has no Client review — Deepanshu): ' || item_state('C-00005');
select 'approve it again (expect denied — it has moved on): ' || t_try($$select review_content_item(item_of('C-00005'), ver_of('C-00005', 2), 'approved')$$);
reset role;
select 'the approval is on the SMM review task''s history: ' || stage_task_note('C-00005', 'Fan page reel', 'SMM review', 'status');
select 'V1 and V2, never deleted: ' || (select string_agg('V' || number, ', ' order by number) from content_versions where item_id = item_of('C-00005'));

\echo '--- 0045: Client review — the SMM records the client''s answer'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'create C-00006 on the main page, naming Deepanshu its SMM: ' || t_val(format($$select code from create_content_item('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
       (select id from workflows where name = 'Main page reel'), 'Subhash ji on sleep', null, null, null, null,
       '[{"role_id": "%s", "employee_id": "%s"}]')$$, (select id from roles where name = 'SMM'), eid('Deepanshu')));
reset role;
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'HR (no employee record) moves it to Client review: ' || t_try($$update content_items set stage_id = stage_of('Main page reel', 'Client review') where code = 'C-00006'$$);
select 'state (expect Client review, Deepanshu): ' || item_state('C-00006');
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'the client wants changes, no version on file (expect for the client, back to Editing — past the SMM''s own review): '
       || t_val($$select decision || ' / for the client: ' || for_client || ' / back to ' || (select name from workflow_stages where id = back_to_stage_id)
       from review_content_item(item_of('C-00006'), null, 'changes', '[{"at": 3725, "text": "Say the product name twice"}]')$$);
select 'state (expect Editing, NOBODY — never edited before, two editors): ' || item_state('C-00006');
reset role;
select 'the Client review task says: ' || stage_task_note('C-00006', 'Main page reel', 'Client review', 'status');
select 'the waiting Editing task says (expect 1:02:05): ' || stage_task_note('C-00006', 'Main page reel', 'Editing', 'created');
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'HR names Samiksha as its editor: ' || t_try(format($$insert into content_item_assignees (item_id, role_id, employee_id) values (item_of('C-00006'), '%s', '%s')$$, (select id from roles where name = 'Editor'), eid('Samiksha')));
select 'state (expect Samiksha): ' || item_state('C-00006');
reset role;
select set_config('request.jwt.claim.sub', pid('smm2@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Samiksha adds V1 and finishes: ' || t_try($$insert into content_versions (item_id, url) values (item_of('C-00006'), 'https://drive.google.com/file/d/s1')$$)
       || ' / ' || t_try($$update tasks set status_id = status_of('Completed') where content_item_id = item_of('C-00006') and stage_id = stage_of('Main page reel', 'Editing') and completed_at is null$$);
select 'state (expect SMM review, Deepanshu — named): ' || item_state('C-00006');
reset role;
select set_config('request.jwt.claim.sub', pid('hr@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'HR approves V1 at SMM review: ' || t_val($$select decision from review_content_item(item_of('C-00006'), ver_of('C-00006', 1), 'approved')$$);
select 'state (expect Client review, Deepanshu — named, and he held it last time): ' || item_state('C-00006');
reset role;
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'Deepanshu: the client wants a reshoot, back to Shoot required: ' || t_val($$select 'back to ' || (select name from workflow_stages where id = back_to_stage_id)
       from review_content_item(item_of('C-00006'), ver_of('C-00006', 1), 'changes', '[{"text": "Reshoot outdoors"}]', stage_of('Main page reel', 'Shoot required'))$$);
select 'state (expect Shoot required, NOBODY — no DOP on the team): ' || item_state('C-00006');
select 'Deepanshu moves it on to Client review by hand: ' || t_try($$update content_items set stage_id = stage_of('Main page reel', 'Client review') where code = 'C-00006'$$);
select 'the client approves V1 (expect for the client): ' || t_val($$select decision || ' / for the client: ' || for_client from review_content_item(item_of('C-00006'), ver_of('C-00006', 1), 'approved')$$);
select 'state (expect Approved, Deepanshu): ' || item_state('C-00006');
select 'the reviews, as the app reads them: ' || t_val($$select string_agg(reviewer_name || ' ' || decision || case when for_client then ' (client)' else '' end, ' → ' order by created_at) from v_content_reviews where item_id = item_of('C-00006')$$);
reset role;

\echo '--- 0045: the door, and deletes'
select set_config('request.jwt.claim.sub', pid('smm1@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'a review written straight into the table (expect denied): ' || t_try($$insert into content_reviews (item_id, stage_id, decision) values (item_of('C-00006'), stage_of('Main page reel', 'SMM review'), 'approved')$$);
select 'an SMM deletes the reel (expect 0 rows): ' || t_val($$with d as (delete from content_items where code = 'C-00006' returning 1) select count(*)::text from d$$);
reset role;
select item_of('C-00006') as c6 \gset
select set_config('request.jwt.claim.sub', pid('owner@metrol.in')::text, false) \g /dev/null
set role authenticated;
select 'the owner deletes C-00006: ' || t_val($$with d as (delete from content_items where code = 'C-00006' returning 1) select count(*)::text from d$$);
reset role;
select 'its versions and reviews went with it (expect 0 / 0): ' || (select count(*) from content_versions where item_id = :'c6')
       || ' / ' || (select count(*) from content_reviews where item_id = :'c6');
