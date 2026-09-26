-- 0045 — Phase 2, Round 3: versions and reviews (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0044. Safe to re-run.
--
-- AGENCY-OS-PLAN.md §5 and §9. Two new tables:
--
--   content_versions   V1, V2 … of a reel. A LINK (Drive, Frame.io — Q14:
--                      footage and edits stay where they are), who added it,
--                      when, the stage it was made in, a note. Never deleted;
--                      its link may be corrected until somebody reviews it.
--   content_reviews    a decision on a version at a review stage: approved,
--                      or changes asked, with notes — each one may be at a
--                      moment of the video ("0:14 cut this pause"). At a
--                      review stage the client sees (Client review) the
--                      decision is the CLIENT's, recorded by whoever acts
--                      there (Q13: no client portal yet).
--
-- The golden rule, carried through a review (review_content_item(), the one
-- door for a review):
--   * approved        → the review stage's task is finished, so the item
--                       moves on exactly as it did in Round 2;
--   * changes asked   → the item goes BACK — by default to the stage the
--                       version was made in (Editing), changeable per review —
--                       and the task there goes to whoever did it last time,
--                       with the first note in its notice.
--
-- Two Round 2 functions are extended, nothing else of 0044 changes:
--   content_item_enter_stage()  a stage an item comes BACK to goes to whoever
--                               held it last time, unless somebody is named
--                               for that role on the item (a rework lands
--                               with the editor who cut V1, not in "Nobody
--                               yet"); a review's own words close the task
--                               it sent back.
--   task_after()                a review's notes lead the new task's history
--                               line and its notification.
--
-- Who (THE ACCESS RULE — the owner and HR see and do everything):
--   * versions and reviews: whoever sees the reel;
--   * adding a version: the client's team, whoever manages the client, and
--     anyone named on the reel or holding a task on it;
--   * recording a review: whoever holds the review task, the client's team,
--     whoever manages the client.

-- ============================================ 0. stop before changing anything

do $$
begin
  if to_regclass('public.content_items') is null
     or to_regprocedure('public.content_item_enter_stage(uuid)') is null
     or to_regprocedure('public.can_manage_task(uuid)') is null then
    raise exception '0045 needs 0044 first — nothing was changed.';
  end if;
end $$;

-- ============================================ 1. versions

create table if not exists public.content_versions (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.content_items(id) on delete cascade,
  number     int  not null check (number > 0),
  url        text not null check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2000),
  note       text check (note is null or length(note) <= 2000),
  -- The stage the reel was in when it was added (Editing, usually) — where
  -- "changes asked" sends it back to by default.
  stage_id   uuid references public.workflow_stages(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, number)
);

-- ============================================ 2. reviews

-- A review's notes: [{ "at": 14, "text": "cut this pause" }, { "at": null,
-- "text": "music too loud" }] — "at" is seconds into the video, or null
-- for a note about the whole thing. At most 50, each 1–1000 characters.
create or replace function public.review_notes_ok(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 50
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(jsonb_typeof(e->'text'), 'null') <> 'string'
           or length(btrim(e->>'text')) = 0 or length(e->>'text') > 1000
           or case coalesce(jsonb_typeof(e->'at'), 'null')
                when 'null' then false
                when 'number' then (e->>'at')::numeric <> floor((e->>'at')::numeric)
                                   or (e->>'at')::numeric < 0 or (e->>'at')::numeric > 86400
                else true
              end)
$$;

create table if not exists public.content_reviews (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.content_items(id) on delete cascade,
  -- null: reviewed as it stood, with no version on file
  version_id       uuid references public.content_versions(id) on delete cascade,
  -- the review stage it was given at — restrict, like tasks: a stage with
  -- history is retired, not deleted
  stage_id         uuid not null references public.workflow_stages(id) on delete restrict,
  decision         text not null check (decision in ('approved', 'changes')),
  notes            jsonb not null default '[]'::jsonb check (public.review_notes_ok(notes)),
  -- the client's answer, recorded by the team (a review stage the client sees)
  for_client       boolean not null default false,
  -- where "changes asked" sent the reel
  back_to_stage_id uuid references public.workflow_stages(id) on delete set null,
  reviewer_id      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (decision = 'approved' or jsonb_array_length(notes) > 0)
);

create index if not exists content_reviews_item    on public.content_reviews (item_id, created_at);
create index if not exists content_reviews_version on public.content_reviews (version_id);

-- ============================================ 3. a version's number, stage, and the link rule

create or replace function public.content_version_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.url := btrim(coalesce(new.url, ''));
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if new.url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Paste the whole link — it starts with https://';
  end if;
  if tg_op = 'INSERT' then
    -- One at a time per reel, so two people adding at once get V2 and V3.
    perform 1 from public.content_items where id = new.item_id for update;
    new.number := coalesce((select max(v.number) from public.content_versions v where v.item_id = new.item_id), 0) + 1;
    new.stage_id := (select i.stage_id from public.content_items i where i.id = new.item_id);
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    if exists (select 1 from public.content_reviews r where r.version_id = old.id) then
      raise exception 'V% has been reviewed — add a new version instead.', old.number;
    end if;
    -- Only the link and the note are ever corrected.
    new.item_id := old.item_id;
    new.number := old.number;
    new.stage_id := old.stage_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_versions_before on public.content_versions;
create trigger content_versions_before
  before insert or update on public.content_versions
  for each row execute function public.content_version_before();

-- ============================================ 4. where "changes asked" sends a reel

-- A stage's default, with no version to go by: the nearest earlier stage
-- that somebody OTHER than this stage's role acts on (a client's changes
-- skip the SMM's own review and land with the editor), else simply the
-- stage before. Only an active, unfinished, earlier stage of the same
-- workflow qualifies. The app restates this (lib/work.ts, backStage()).
create or replace function public.stage_send_back(p_stage uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with cur as (select * from public.workflow_stages where id = p_stage),
  earlier as (
    select e.* from public.workflow_stages e, cur
     where e.workflow_id = cur.workflow_id and e.is_active and not e.is_done
       and (e.sort_order < cur.sort_order or (e.sort_order = cur.sort_order and e.name < cur.name))
  )
  select coalesce(
    (select e.id from earlier e, cur
      where e.owner_role_id is not null and e.owner_role_id is distinct from cur.owner_role_id
      order by e.sort_order desc, e.name desc limit 1),
    (select e.id from earlier e order by e.sort_order desc, e.name desc limit 1))
$$;

-- A reel's default: the stage the reviewed version was made in; else the
-- stage its latest version made at an earlier stage was; else the stage's
-- own default above.
create or replace function public.review_back_stage(p_item uuid, p_version uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  with it as (
    select i.id, i.workflow_id, i.stage_id, s.sort_order, s.name
      from public.content_items i join public.workflow_stages s on s.id = i.stage_id
     where i.id = p_item
  ),
  earlier as (
    select e.* from public.workflow_stages e, it
     where e.workflow_id = it.workflow_id and e.is_active and not e.is_done
       and (e.sort_order < it.sort_order or (e.sort_order = it.sort_order and e.name < it.name))
  )
  select coalesce(
    (select e.id from earlier e join public.content_versions v on v.stage_id = e.id
      where v.id = p_version and v.item_id = p_item),
    (select e.id from earlier e join public.content_versions v on v.stage_id = e.id
      where v.item_id = p_item order by v.number desc limit 1),
    (select public.stage_send_back(it.stage_id) from it))
$$;

-- "0:14", "1:02:03" — a moment of a video, as a person writes it.
create or replace function public.fmt_moment(p_seconds int)
returns text language sql immutable set search_path = public as $$
  select case when p_seconds >= 3600
              then (p_seconds / 3600)::text || ':' || lpad(((p_seconds % 3600) / 60)::text, 2, '0')
                   || ':' || lpad((p_seconds % 60)::text, 2, '0')
              else (p_seconds / 60)::text || ':' || lpad((p_seconds % 60)::text, 2, '0') end
$$;

-- ============================================ 5. the Round 2 hand-off, extended

create or replace function public.content_item_enter_stage(p_item uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  it     public.content_items;
  st     public.workflow_stages;
  v_done uuid := (select id from public.task_statuses where is_done and is_active order by sort_order, name limit 1);
  v_new  uuid := (select id from public.task_statuses where is_active and not is_done order by sort_order, name limit 1);
  v_task uuid;
  -- A review that sent the item back says so on the task it closes (0045).
  v_move text := nullif(current_setting('metrol.move_note', true), '');
begin
  select * into it from public.content_items where id = p_item;
  if not found then return null; end if;
  select * into st from public.workflow_stages where id = it.stage_id;

  -- 1. whatever is still open on an earlier (or later) stage is behind it now
  --    (metrol.by_rule tells the task guard this is the rule, not a person)
  if v_done is not null then
    perform set_config('metrol.by_rule', 'on', true);
    perform set_config('metrol.task_note', coalesce(v_move, 'Closed: the item moved to ' || st.name), true);
    update public.tasks t set status_id = v_done
     where t.content_item_id = it.id and t.stage_id is distinct from it.stage_id
       and not exists (select 1 from public.task_statuses s where s.id = t.status_id and s.is_done);
    perform set_config('metrol.task_note', '', true);
    perform set_config('metrol.by_rule', '', true);
  end if;

  -- 2. a finished item has nothing more to do; a stage already holding an
  --    open task keeps it (moving back and forth never doubles up)
  if st.is_done or v_new is null then return null; end if;
  select t.id into v_task from public.tasks t
    join public.task_statuses s on s.id = t.status_id and not s.is_done
   where t.content_item_id = it.id and t.stage_id = it.stage_id limit 1;
  if v_task is not null then return v_task; end if;

  insert into public.tasks (title, client_id, content_item_id, stage_id, role_id, assignee_id, status_id, due_at, created_by)
  values (st.name || ' — ' || it.title, it.client_id, it.id, st.id, st.owner_role_id,
          case when st.owner_role_id is not null then coalesce(
            -- 1. named on the item for this role
            (select a.employee_id from public.content_item_assignees a
               join public.employees e on e.id = a.employee_id and e.status <> 'resigned'
              where a.item_id = it.id and a.role_id = st.owner_role_id),
            -- 2. back in a stage it has been in (a review sent it back):
            --    whoever held that stage's task last time — the editor who
            --    cut V1 cuts V2, even on a team with three editors (0045)
            (select t.assignee_id from public.tasks t
               join public.employees e on e.id = t.assignee_id and e.status <> 'resigned'
              where t.content_item_id = it.id and t.stage_id = st.id
                and t.role_id is not distinct from st.owner_role_id
              order by t.created_at desc limit 1),
            -- 3. the rest of content_item_person()'s order
            public.content_item_person(it.id, st.owner_role_id)) end,
          v_new,
          case when st.sla_hours is not null then now() + make_interval(hours => st.sla_hours) end,
          auth.uid())
  returning id into v_task;
  return v_task;
end;
$$;
revoke all on function public.content_item_enter_stage(uuid) from public, anon, authenticated;

create or replace function public.task_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_note   text := nullif(current_setting('metrol.task_note', true), '');
  -- Why a hand-off happened, when it is more than "the item reached X" —
  -- a review's notes on the task it sent back (0045).
  v_handoff text := nullif(current_setting('metrol.handoff_note', true), '');
  v_client text := (select name from public.clients where id = new.client_id);
  v_who    text;
  v_to     uuid;
  v_next   uuid;
  v_item   public.content_items;
  v_stage  text;
begin
  if new.content_item_id is not null then
    select * into v_item from public.content_items where id = new.content_item_id;
  end if;
  v_stage := (select name from public.workflow_stages where id = new.stage_id);

  -- ---------------------------------------------------------- history
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, actor_id, kind, to_value, note)
    values (new.id, v_actor, 'created', (select full_name from public.employees where id = new.assignee_id),
            coalesce(v_handoff, case when v_stage is not null then 'Hand-off: the item reached ' || v_stage end));
  else
    if new.status_id is distinct from old.status_id then
      insert into public.task_events (task_id, actor_id, kind, from_value, to_value, note)
      values (new.id, v_actor, 'status',
              (select name from public.task_statuses where id = old.status_id),
              (select name from public.task_statuses where id = new.status_id), v_note);
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into public.task_events (task_id, actor_id, kind, from_value, to_value)
      values (new.id, v_actor, 'assigned',
              (select full_name from public.employees where id = old.assignee_id),
              (select full_name from public.employees where id = new.assignee_id));
    end if;
    if new.due_at is distinct from old.due_at then
      insert into public.task_events (task_id, actor_id, kind, from_value, to_value)
      values (new.id, v_actor, 'due',
              case when old.due_at is not null then public.office_time_label(old.due_at) end,
              case when new.due_at is not null then public.office_time_label(new.due_at) end);
    end if;
    if new.priority is distinct from old.priority then
      insert into public.task_events (task_id, actor_id, kind, from_value, to_value)
      values (new.id, v_actor, 'priority', old.priority, new.priority);
    end if;
  end if;

  -- ---------------------------------------------------------- the notice
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.task_statuses s where s.id = new.status_id and s.is_done)
     and not exists (select 1 from public.employees e where e.id = new.assignee_id and e.profile_id = v_actor) then
    v_who := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = v_actor);
    insert into public.notifications (recipient_employee_id, type, title, body, task_id, created_by)
    values (new.assignee_id, 'task_assigned', 'New task: ' || new.title,
            concat_ws(' · ', case when tg_op = 'INSERT' then v_handoff end, v_client, new.code,
                      case when new.due_at is not null then 'due ' || public.office_time_label(new.due_at) end,
                      case when v_who is not null then 'from ' || v_who end),
            new.id, public.my_employee_id());
  elsif tg_op = 'INSERT' and new.assignee_id is null and v_item.id is not null then
    -- Nobody holds the stage's role here: tell whoever set the item up.
    select e.id into v_to from public.employees e
     where e.profile_id = v_item.created_by and e.status <> 'resigned' and e.profile_id is distinct from v_actor;
    if v_to is not null then
      insert into public.notifications (recipient_employee_id, type, title, body, task_id, created_by)
      values (v_to, 'task_unassigned', 'Nobody to hand on to: ' || new.title,
              concat_ws(' · ', v_client, v_item.code,
                        'no ' || coalesce((select name from public.roles where id = new.role_id), 'one') || ' on the team — pick who does it'),
              new.id, public.my_employee_id());
    end if;
  end if;

  -- ---------------------------------------------------------- the advance
  -- The item's current stage task, just finished, and no other task still
  -- open on that stage: the item moves to the next active stage.
  if tg_op = 'UPDATE' and v_item.id is not null and new.stage_id is not null
     and new.stage_id = v_item.stage_id
     and new.status_id is distinct from old.status_id
     and exists (select 1 from public.task_statuses s where s.id = new.status_id and s.is_done)
     and not exists (select 1 from public.task_statuses s where s.id = old.status_id and s.is_done)
     and not exists (select 1 from public.tasks o join public.task_statuses s on s.id = o.status_id and not s.is_done
                      where o.content_item_id = new.content_item_id and o.stage_id = new.stage_id and o.id <> new.id) then
    select s2.id into v_next
      from public.workflow_stages s1
      join public.workflow_stages s2 on s2.workflow_id = s1.workflow_id and s2.is_active
     where s1.id = new.stage_id
       and (s2.sort_order > s1.sort_order or (s2.sort_order = s1.sort_order and s2.name > s1.name))
     order by s2.sort_order, s2.name limit 1;
    if v_next is not null then
      update public.content_items set stage_id = v_next where id = v_item.id and stage_id = new.stage_id;
    end if;
  end if;
  return null;
end;
$$;

-- ============================================ 6. the one door for a review

create or replace function public.review_content_item(
  p_item uuid, p_version uuid, p_decision text,
  p_notes jsonb default '[]'::jsonb, p_back_to uuid default null
) returns public.content_reviews
language plpgsql security definer set search_path = public as $$
declare
  it      public.content_items;
  st      public.workflow_stages;
  back    public.workflow_stages;
  v_task  public.tasks;
  v_num   int;
  v_rev   public.content_reviews;
  v_done  uuid := (select id from public.task_statuses where is_done and is_active order by sort_order, name limit 1);
  v_next  uuid;
  v_what  text;
  v_first text;
  v_notes jsonb := coalesce(p_notes, '[]'::jsonb);
begin
  if not public.is_staff() then raise exception 'Only staff can review.'; end if;
  -- One review at a time per reel: the second of two quick clicks waits,
  -- then finds the reel has already moved on.
  select * into it from public.content_items where id = p_item for update;
  if not found then raise exception 'That item no longer exists.'; end if;
  select * into st from public.workflow_stages where id = it.stage_id;
  if not st.is_review then
    raise exception 'It is not waiting for a review any more — it is at %.', st.name;
  end if;

  select t.* into v_task from public.tasks t
    join public.task_statuses s on s.id = t.status_id and not s.is_done
   where t.content_item_id = it.id and t.stage_id = it.stage_id
   order by t.created_at limit 1;
  if not (public.can_edit_work(it.client_id)
          or (v_task.id is not null and (v_task.assignee_id = public.my_employee_id()
                                         or public.can_manage_task(v_task.id)))) then
    raise exception 'Only whoever holds this review, or the client''s team, can record it.';
  end if;

  if p_version is not null then
    select v.number into v_num from public.content_versions v where v.id = p_version and v.item_id = it.id;
    if v_num is null then raise exception 'That version is not this item''s.'; end if;
  end if;
  if p_decision is null or p_decision not in ('approved', 'changes') then
    raise exception 'Approve it, or ask for changes.';
  end if;
  if not public.review_notes_ok(v_notes) then
    raise exception 'Each note needs some words, and a time (if any) inside the video.';
  end if;
  if p_decision = 'changes' and jsonb_array_length(v_notes) = 0 then
    raise exception 'Say what to change.';
  end if;

  if p_decision = 'changes' then
    select * into back from public.workflow_stages where id = coalesce(p_back_to, public.review_back_stage(it.id, p_version));
    if back.id is null or back.workflow_id <> it.workflow_id or not back.is_active or back.is_done
       or not (back.sort_order < st.sort_order or (back.sort_order = st.sort_order and back.name < st.name)) then
      raise exception 'Changes go back to an earlier stage of this workflow that is in use.';
    end if;
  end if;

  insert into public.content_reviews (item_id, version_id, stage_id, decision, notes, for_client, back_to_stage_id, reviewer_id)
  values (it.id, p_version, st.id, p_decision, v_notes, st.client_visible, back.id, auth.uid())
  returning * into v_rev;

  v_what := case
    when p_decision = 'approved' then (case when st.client_visible then 'The client approved' else 'Approved' end)
                                      || coalesce(' V' || v_num, '')
    else (case when st.client_visible then 'The client asked for changes' else 'Changes asked' end)
         || coalesce(' on V' || v_num, '')
  end;

  if p_decision = 'approved' then
    -- Finish the review's task: task_after() moves the reel on, the Round 2 way.
    if v_done is not null then
      perform set_config('metrol.by_rule', 'on', true);
      perform set_config('metrol.task_note', v_what, true);
      update public.tasks t set status_id = v_done
       where t.content_item_id = it.id and t.stage_id = it.stage_id
         and not exists (select 1 from public.task_statuses s where s.id = t.status_id and s.is_done);
      perform set_config('metrol.task_note', '', true);
      perform set_config('metrol.by_rule', '', true);
    end if;
    -- Nothing was open to finish: move it on here.
    if (select i.stage_id from public.content_items i where i.id = it.id) = it.stage_id then
      select s2.id into v_next from public.workflow_stages s2
       where s2.workflow_id = it.workflow_id and s2.is_active
         and (s2.sort_order > st.sort_order or (s2.sort_order = st.sort_order and s2.name > st.name))
       order by s2.sort_order, s2.name limit 1;
      if v_next is not null then
        update public.content_items set stage_id = v_next where id = it.id;
      end if;
    end if;
  else
    -- Back it goes. The task it leaves says why; the task it lands on
    -- carries the first note (content_item_enter_stage(), task_after()).
    select case when jsonb_typeof(x.e->'at') = 'number' then public.fmt_moment((x.e->>'at')::int) || ' ' else '' end
           || btrim(x.e->>'text')
      into v_first
      from jsonb_array_elements(v_notes) with ordinality x(e, n) order by x.n limit 1;
    v_first := left(v_first, 90) || case when length(v_first) > 90 then '…' else '' end
               || case when jsonb_array_length(v_notes) > 1 then ' (+' || (jsonb_array_length(v_notes) - 1) || ' more)' else '' end;
    perform set_config('metrol.move_note', v_what || ' — back to ' || back.name, true);
    perform set_config('metrol.handoff_note', v_what || ': ' || v_first, true);
    update public.content_items set stage_id = back.id where id = it.id;
    perform set_config('metrol.move_note', '', true);
    perform set_config('metrol.handoff_note', '', true);
  end if;
  return v_rev;
end;
$$;

-- ============================================ 7. reading with names

-- Whoever sees the reel sees its versions and reviews: content_items' own
-- read rule (0044), asked of each row — one function, so the two views
-- below cannot drift from it.
create or replace function public.content_item_visible(p_client uuid, p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_see_work(p_client) or public.works_on_item(p_item)
$$;

-- With the author's / reviewer's name (the reason for a view, as v_tasks)
-- and the reel's finish time, so the app loads only what it shows.
create or replace view public.v_content_versions as
select v.*,
       coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) as author_name,
       i.completed_at as item_completed_at
  from public.content_versions v
  join public.content_items i on i.id = v.item_id
  left join public.profiles p on p.id = v.created_by
 where public.content_item_visible(i.client_id, i.id);

create or replace view public.v_content_reviews as
select r.*,
       coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) as reviewer_name,
       i.completed_at as item_completed_at
  from public.content_reviews r
  join public.content_items i on i.id = r.item_id
  left join public.profiles p on p.id = r.reviewer_id
 where public.content_item_visible(i.client_id, i.id);

revoke all on public.v_content_versions, public.v_content_reviews from anon;
grant select on public.v_content_versions, public.v_content_reviews to authenticated;

revoke all on function public.review_content_item(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.review_content_item(uuid, uuid, text, jsonb, uuid) to authenticated;
revoke all on function public.content_item_visible(uuid, uuid) from public, anon;
grant execute on function public.content_item_visible(uuid, uuid) to authenticated;
revoke all on function public.review_back_stage(uuid, uuid), public.stage_send_back(uuid),
                       public.fmt_moment(int), public.review_notes_ok(jsonb)
  from public, anon, authenticated;

-- ============================================ 8. row-level security

alter table public.content_versions enable row level security;
alter table public.content_reviews  enable row level security;

drop policy if exists content_versions_select on public.content_versions;
create policy content_versions_select on public.content_versions for select
  using ( item_id in (select i.id from public.content_items i) );
drop policy if exists content_versions_insert on public.content_versions;
create policy content_versions_insert on public.content_versions for insert
  with check ( (select public.is_staff())
               and exists (select 1 from public.content_items i
                            where i.id = item_id
                              and (public.can_edit_work(i.client_id) or public.works_on_item(i.id))) );
-- Correcting a link: whoever added it (the trigger refuses once it is reviewed).
drop policy if exists content_versions_update on public.content_versions;
create policy content_versions_update on public.content_versions for update
  using      ( created_by = (select auth.uid()) or (select public.is_owner_level()) )
  with check ( created_by = (select auth.uid()) or (select public.is_owner_level()) );
-- Never deleted — only with the reel itself.
revoke delete on public.content_versions from authenticated;

drop policy if exists content_reviews_select on public.content_reviews;
create policy content_reviews_select on public.content_reviews for select
  using ( item_id in (select i.id from public.content_items i) );
-- Written only by review_content_item(); never changed, never deleted.
revoke insert, update, delete on public.content_reviews from authenticated;

revoke all on public.content_versions, public.content_reviews from anon;

-- ---------------------------------------------------------------- proof
-- Expect: 2 of 2 / yes / yes / 2 of 2 / Editing for every review stage /
-- yes / how much content there is so far (nobody had used it on 26 Sep) /
-- 1 (site_settings, public on purpose — 0042).

select '0045 tables on the database (expect 2 of 2)' as check,
       (select count(*) from unnest(array['content_versions', 'content_reviews']) t
         where to_regclass('public.' || t) is not null)::text || ' of 2' as result
union all
select 'a review is recorded only through review_content_item() (expect yes)',
       case when not has_table_privilege('authenticated', 'public.content_reviews', 'insert')
             and has_function_privilege('authenticated', 'public.review_content_item(uuid, uuid, text, jsonb, uuid)', 'execute')
            then 'yes' else 'NO' end
union all
select 'versions are never deleted (expect yes)',
       case when not has_table_privilege('authenticated', 'public.content_versions', 'delete') then 'yes' else 'NO' end
union all
select 'the two new tables have row-level security (expect 2 of 2)',
       (select count(*) from pg_class
         where relname in ('content_versions', 'content_reviews')
           and relnamespace = 'public'::regnamespace and relrowsecurity)::text || ' of 2'
union all
select 'where "changes asked" sends a reel by default (expect → Editing for each review stage)',
       coalesce((select string_agg(w.name || ': ' || s.name || ' → ' || coalesce(b.name, 'NOWHERE'), ' · ' order by w.sort_order, s.sort_order)
                   from public.workflow_stages s
                   join public.workflows w on w.id = s.workflow_id and w.is_active
                   left join public.workflow_stages b on b.id = public.stage_send_back(s.id)
                  where s.is_review and s.is_active), 'no review stages')
union all
select 'the hand-off carries a review''s notes (expect yes)',
       case when pg_get_functiondef('public.task_after()'::regprocedure) like '%metrol.handoff_note%'
             and pg_get_functiondef('public.content_item_enter_stage(uuid)'::regprocedure) like '%metrol.move_note%'
            then 'yes' else 'NO' end
union all
select 'content on the database so far',
       (select count(*) from public.content_items)::text || ' items, ' || (select count(*) from public.tasks)::text || ' tasks, '
       || (select count(*) from public.content_versions)::text || ' versions'
union all
select 'read rules open to anyone (expect 1 = site_settings, public on purpose)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
