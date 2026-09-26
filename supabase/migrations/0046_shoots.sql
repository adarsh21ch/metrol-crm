-- 0046 — Phase 2, Round 4: shoots (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0045. Safe to re-run.
--
-- AGENCY-OS-PLAN.md §5 and §9. A shoot (S-0001) is a day with a camera: a
-- client, a date and call time, a place, a DOP, an SMM, a brief, the kit,
-- and — once it is shot — the raw-footage link. shoot_items says which reels
-- it covers.
--
-- The golden rule, carried through a shoot:
--   * planning it NAMES the shoot's DOP on each of its reels for the role that
--     acts at the reel's shoot stage ("DOP / Production"), so the reels'
--     "Shoot required" tasks are the DOP's — a reel that reaches that stage
--     later goes to them too (0044's "named on the item" rule);
--   * marking it done MOVES every reel it covers past its shoot stage (to
--     "Shoot done"), closing what was open with "Shot on S-0001", and the
--     next person's task says so;
--   * the people on a shoot hear about it ONCE — "New shoot", "Shoot
--     changed", "Shoot done: 3 reels are yours at Shoot done" — instead of a
--     notice per reel (task_after() stays quiet while a shoot acts).
--
-- Which stage is "the shoot" is data, not a name: a new tick on a stage,
-- "A shoot covers it" (Settings → Workflows & lists). Seeded on the
-- blueprint's "Shoot required" stages.
--
-- Who (THE ACCESS RULE — the owner and HR see and do everything):
--   * sees a shoot: whoever sees the client's work, and the shoot's DOP and SMM;
--   * plans one, and picks its reels: the client's team and whoever manages it;
--   * changes it, marks it done, cancels it: the same, plus its DOP and SMM;
--   * deletes it: the client's team and managers, only before it is done — a
--     done shoot moved reels and holds the footage link, so it stays.
-- Notices use the existing 'task_assigned' type, so push-notifications needs
-- no redeploy. Nothing already on the database changes except task_after()
-- (one condition) and a new column on workflow_stages.

-- ============================================ 0. stop before changing anything

do $$
begin
  if to_regclass('public.content_versions') is null
     or to_regprocedure('public.content_item_enter_stage(uuid)') is null
     or to_regprocedure('public.can_give_task(uuid, uuid)') is null then
    raise exception '0046 needs 0045 first — nothing was changed.';
  end if;
end $$;

-- ============================================ 1. the stage a shoot covers

alter table public.workflow_stages add column if not exists is_shoot boolean not null default false;

-- Seeded only while no stage carries the tick, so a re-run never undoes a
-- choice made on screen: the blueprint's "Shoot required", or any stage the
-- DOP role acts on.
do $$
declare dop uuid := (select id from public.roles where name = 'DOP / Production');
begin
  if not exists (select 1 from public.workflow_stages where is_shoot) then
    update public.workflow_stages set is_shoot = true
     where not is_done and not is_review
       and (name = 'Shoot required' or (dop is not null and owner_role_id = dop));
  end if;
end $$;

-- ============================================ 2. shoots and the reels they cover

create sequence if not exists public.shoot_code_seq;

create table if not exists public.shoots (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,
  client_id    uuid not null references public.clients(id) on delete cascade,
  shoot_on     date not null,
  -- The call time on the office clock; null = the day, no time set.
  starts_at    time,
  location     text check (location is null or length(location) <= 300),
  dop_id       uuid references public.employees(id) on delete set null,
  smm_id       uuid references public.employees(id) on delete set null,
  brief        text check (brief is null or length(brief) <= 4000),
  equipment    text check (equipment is null or length(equipment) <= 1000),
  -- Q14: footage stays where it is (Drive…); the app keeps the link.
  footage_url  text check (footage_url is null or (footage_url ~* '^https?://[^[:space:]]+$' and length(footage_url) <= 2000)),
  status       text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  completed_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shoots_client on public.shoots (client_id, shoot_on);
create index if not exists shoots_day    on public.shoots (shoot_on);

create table if not exists public.shoot_items (
  shoot_id   uuid not null references public.shoots(id) on delete cascade,
  item_id    uuid not null references public.content_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shoot_id, item_id)
);
create index if not exists shoot_items_item on public.shoot_items (item_id);

create or replace function public.shoot_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.code, '') = '' then
      n := nextval('public.shoot_code_seq');
      -- lpad cuts a longer number short, so S-10000 is written out whole.
      new.code := 'S-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    if new.code is distinct from old.code and auth.uid() is not null then
      raise exception 'A shoot ID never changes.';
    end if;
    if new.client_id is distinct from old.client_id then
      raise exception 'A shoot stays with its client — plan a new one for the other client.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.completed_at := case when new.status = 'done'
                           then coalesce(case when tg_op = 'UPDATE' then old.completed_at end, now()) end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shoots_before on public.shoots;
create trigger shoots_before
  before insert or update on public.shoots
  for each row execute function public.shoot_before();

-- ============================================ 3. who

create or replace function public.shoot_visible(p_client uuid, p_dop uuid, p_smm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_see_work(p_client)
      or (public.my_employee_id() is not null and public.my_employee_id() in (p_dop, p_smm))
$$;

-- Change it, mark it done, cancel it: the client's team and managers, and
-- the shoot's own DOP and SMM.
create or replace function public.can_run_shoot(p_shoot uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shoots s
     where s.id = p_shoot
       and (public.can_edit_work(s.client_id)
            or (public.my_employee_id() is not null and public.my_employee_id() in (s.dop_id, s.smm_id)))
  )
$$;

-- ============================================ 4. a reel's shoot stage

-- The first shoot stage of the reel's workflow it has not passed yet (the
-- stage it sits in counts). null: finished, past every shoot, or none.
create or replace function public.shoot_stage_for(p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select x.id
    from public.content_items i
    join public.workflow_stages cur on cur.id = i.stage_id and not cur.is_done
    join public.workflow_stages x on x.workflow_id = i.workflow_id and x.is_shoot and x.is_active
   where i.id = p_item
     and (x.sort_order > cur.sort_order or (x.sort_order = cur.sort_order and x.name >= cur.name))
   order by x.sort_order, x.name
   limit 1
$$;

-- Where a done shoot sends the reel: the active stage right after that one.
create or replace function public.shoot_next_stage(p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select n.id
    from public.workflow_stages sh
    join public.workflow_stages n on n.workflow_id = sh.workflow_id and n.is_active
                                 and (n.sort_order > sh.sort_order or (n.sort_order = sh.sort_order and n.name > sh.name))
   where sh.id = public.shoot_stage_for(p_item)
   order by n.sort_order, n.name
   limit 1
$$;

-- "Sat 28 Sep, 10:00 AM" — a shoot's day as the notices write it.
create or replace function public.shoot_day_label(p_on date, p_at time)
returns text language sql immutable set search_path = public as $$
  select to_char(p_on, 'Dy FMDD Mon') || coalesce(', ' || to_char(p_at, 'FMHH12:MI AM'), '')
$$;

-- ============================================ 5. the hand-off stays quiet while a shoot acts

-- 0045's task_after(), with one change: while metrol.quiet is on (a shoot
-- naming its DOP, or moving its reels on) a task handed on writes no notice
-- of its own — the shoot sends one, about the whole shoot, instead.
create or replace function public.task_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_note   text := nullif(current_setting('metrol.task_note', true), '');
  -- Why a hand-off happened, when it is more than "the item reached X" —
  -- a review's notes on the task it sent back (0045), a shoot (0046).
  v_handoff text := nullif(current_setting('metrol.handoff_note', true), '');
  v_quiet  boolean := coalesce(current_setting('metrol.quiet', true), '') = 'on';
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
    if not v_quiet then
      v_who := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = v_actor);
      insert into public.notifications (recipient_employee_id, type, title, body, task_id, created_by)
      values (new.assignee_id, 'task_assigned', 'New task: ' || new.title,
              concat_ws(' · ', case when tg_op = 'INSERT' then v_handoff end, v_client, new.code,
                        case when new.due_at is not null then 'due ' || public.office_time_label(new.due_at) end,
                        case when v_who is not null then 'from ' || v_who end),
              new.id, public.my_employee_id());
    end if;
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

-- ============================================ 6. what a shoot does to its reels

-- One notice per person (never the one acting), as 'task_assigned' so the
-- existing push-notifications function delivers it.
create or replace function public.shoot_tell(p_to uuid[], p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_employee_id, type, title, body, created_by)
  select distinct e.id, 'task_assigned', p_title, p_body, public.my_employee_id()
    from public.employees e
   where e.id = any(p_to) and e.status <> 'resigned'
     and e.profile_id is distinct from auth.uid()
$$;

-- The shoot's DOP, named on each of its reels for the role that acts at the
-- reel's shoot stage: the waiting "Shoot required" task is theirs now, and
-- one that comes later will be. Quietly — the shoot tells them once.
create or replace function public.shoot_name_dop(p_shoot uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  sh public.shoots;
  r  record;
  n  int := 0;
begin
  select * into sh from public.shoots where id = p_shoot;
  if sh.id is null or sh.dop_id is null or sh.status <> 'planned' then return 0; end if;
  perform set_config('metrol.quiet', 'on', true);
  for r in
    select si.item_id, st.owner_role_id
      from public.shoot_items si
      join public.workflow_stages st on st.id = public.shoot_stage_for(si.item_id)
     where si.shoot_id = sh.id and st.owner_role_id is not null
  loop
    insert into public.content_item_assignees (item_id, role_id, employee_id)
    values (r.item_id, r.owner_role_id, sh.dop_id)
    on conflict (item_id, role_id) do update set employee_id = excluded.employee_id
      where public.content_item_assignees.employee_id is distinct from excluded.employee_id;
    n := n + 1;
  end loop;
  perform set_config('metrol.quiet', '', true);
  return n;
end;
$$;

-- A done shoot's reels move past their shoot stage. Returns the reels it
-- moved; one already past the shoot, or finished, stays where it is.
create or replace function public.shoot_move_on(p_shoot uuid, p_items uuid[] default null)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  sh      public.shoots;
  r       record;
  v_to    uuid;
  v_moved uuid[] := '{}';
begin
  select * into sh from public.shoots where id = p_shoot;
  for r in
    select i.id from public.shoot_items si join public.content_items i on i.id = si.item_id
     where si.shoot_id = p_shoot and (p_items is null or i.id = any(p_items))
     order by i.code
  loop
    v_to := public.shoot_next_stage(r.id);
    continue when v_to is null;
    perform set_config('metrol.quiet', 'on', true);
    perform set_config('metrol.move_note', 'Shot on ' || sh.code || ' — moved to ' || (select name from public.workflow_stages where id = v_to), true);
    perform set_config('metrol.handoff_note', 'Shot on ' || sh.code
                       || case when sh.footage_url is not null then ' — the raw footage link is on the shoot' else '' end, true);
    update public.content_items set stage_id = v_to where id = r.id;
    perform set_config('metrol.move_note', '', true);
    perform set_config('metrol.handoff_note', '', true);
    perform set_config('metrol.quiet', '', true);
    v_moved := v_moved || r.id;
  end loop;
  return v_moved;
end;
$$;

-- After a shoot moved reels: whoever holds the next stage's task hears
-- "N reels are yours at Shoot done"; the shoot's SMM hears what moved.
create or replace function public.shoot_tell_done(p_shoot uuid, p_moved uuid[], p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare
  sh     public.shoots;
  r      record;
  v_title text;
  v_by   text := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = auth.uid());
  v_foot text;
  v_told uuid[] := '{}';
  v_stages text;
begin
  select * into sh from public.shoots where id = p_shoot;
  if sh.id is null or cardinality(p_moved) = 0 then return; end if;
  v_title := p_what || ': ' || sh.code || ' · ' || (select name from public.clients where id = sh.client_id);
  v_foot := case when sh.footage_url is not null then 'raw footage linked on the shoot' end;
  for r in
    select t.assignee_id, count(*) as n, min(st.name) as stage
      from public.content_items i
      join public.tasks t on t.content_item_id = i.id and t.stage_id = i.stage_id
      join public.task_statuses s on s.id = t.status_id and not s.is_done
      join public.workflow_stages st on st.id = i.stage_id
     where i.id = any(p_moved) and t.assignee_id is not null
     group by t.assignee_id
  loop
    perform public.shoot_tell(array[r.assignee_id], v_title,
      concat_ws(' · ', r.n || case when r.n = 1 then ' reel is' else ' reels are' end || ' yours at ' || r.stage,
                v_foot, case when v_by is not null then 'from ' || v_by end));
    v_told := v_told || r.assignee_id;
  end loop;
  if sh.smm_id is not null and not (sh.smm_id = any(v_told)) then
    v_stages := (select string_agg(distinct st.name, ', ') from public.content_items i
                   join public.workflow_stages st on st.id = i.stage_id where i.id = any(p_moved));
    perform public.shoot_tell(array[sh.smm_id], v_title,
      concat_ws(' · ', cardinality(p_moved) || case when cardinality(p_moved) = 1 then ' reel' else ' reels' end
                       || ' moved on to ' || v_stages,
                v_foot, case when v_by is not null then 'from ' || v_by end));
  end if;
end;
$$;

-- A reel may wait on one planned shoot at a time. Returns the clash, in words.
create or replace function public.shoot_clashes(p_shoot uuid, p_items uuid[])
returns text language sql stable security definer set search_path = public as $$
  select string_agg(i.code || ' (on ' || o.code || ', ' || public.shoot_day_label(o.shoot_on, o.starts_at) || ')', ', ' order by i.code)
    from public.shoot_items si
    join public.shoots o on o.id = si.shoot_id and o.status = 'planned' and o.id is distinct from p_shoot
    join public.content_items i on i.id = si.item_id
   where si.item_id = any(p_items)
$$;

-- ============================================ 7. the doors: save_shoot(), set_shoot_status()

-- Plan a shoot (p_id null) or change one. p_items is the whole reel list
-- (null leaves it as it is). Tells the DOP and the SMM once.
create or replace function public.save_shoot(
  p_id uuid, p_client uuid, p_shoot_on date, p_starts_at time default null,
  p_location text default null, p_dop uuid default null, p_smm uuid default null,
  p_brief text default null, p_equipment text default null, p_footage_url text default null,
  p_items uuid[] default null
) returns public.shoots
language plpgsql security definer set search_path = public as $$
declare
  sh        public.shoots;
  prev       public.shoots;
  v_new     boolean := p_id is null;
  v_client  uuid;
  v_url     text := nullif(btrim(coalesce(p_footage_url, '')), '');
  v_added   uuid[] := '{}';
  v_removed uuid[] := '{}';
  v_bad     text;
  v_moved   uuid[];
  v_by      text := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = auth.uid());
  v_body    text;
  v_head    text;
  v_moved_day boolean;
begin
  if not public.is_staff() then raise exception 'Only staff can plan shoots.'; end if;
  if p_shoot_on is null then raise exception 'Pick the day of the shoot.'; end if;
  if v_url is not null and v_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Paste the whole footage link — it starts with https://';
  end if;

  if v_new then
    v_client := p_client;
    if v_client is null or not public.can_edit_work(v_client) then
      raise exception 'Only this client''s team, whoever manages it, the owner or HR can plan a shoot here.';
    end if;
  else
    select * into prev from public.shoots where id = p_id for update;
    if not found then raise exception 'That shoot no longer exists.'; end if;
    v_client := prev.client_id;
    if p_client is not null and p_client <> prev.client_id then
      raise exception 'A shoot stays with its client — plan a new one for the other client.';
    end if;
    if not public.can_run_shoot(prev.id) then
      raise exception 'Only the client''s team, the shoot''s DOP or SMM, the owner or HR can change this shoot.';
    end if;
  end if;

  -- Naming somebody hands them work: the caller must be able to give it.
  if p_dop is not null and (v_new or p_dop is distinct from prev.dop_id) and not public.can_give_task(v_client, p_dop) then
    raise exception 'You cannot give this shoot to that DOP — add them to the client''s Team tab first.';
  end if;
  if p_smm is not null and (v_new or p_smm is distinct from prev.smm_id) and not public.can_give_task(v_client, p_smm) then
    raise exception 'You cannot name that SMM on this shoot.';
  end if;

  -- ------------------------------------------------ the reel list, checked
  -- before anything is written, so a refused shoot never uses up a code
  if p_items is not null then
    select coalesce(array_agg(x), '{}') into v_added
      from (select distinct unnest(p_items) as x) a
     where not exists (select 1 from public.shoot_items si where si.shoot_id = p_id and si.item_id = a.x);
    select coalesce(array_agg(si.item_id), '{}') into v_removed
      from public.shoot_items si where si.shoot_id = p_id and not (si.item_id = any(p_items));

    if (cardinality(v_added) > 0 or cardinality(v_removed) > 0) and not public.can_edit_work(v_client) then
      raise exception 'Only the client''s team (or whoever manages it) picks which reels a shoot covers.';
    end if;
    if cardinality(v_removed) > 0 and prev.status = 'done' then
      raise exception '% is done — the reels it shot stay on it.', prev.code;
    end if;
    if cardinality(v_added) > 0 and prev.status = 'cancelled' then
      raise exception '% is cancelled — put it back on before adding reels.', prev.code;
    end if;
    if exists (select 1 from unnest(v_added) x where not exists (select 1 from public.content_items i where i.id = x)) then
      raise exception 'A reel on the list no longer exists — reload and try again.';
    end if;
    v_bad := (select string_agg(i.code, ', ' order by i.code) from public.content_items i
               where i.id = any(v_added) and i.client_id <> v_client);
    if v_bad is not null then raise exception 'Another client''s reel: %.', v_bad; end if;
    v_bad := (select string_agg(i.code, ', ' order by i.code) from public.content_items i
                join public.workflow_stages s on s.id = i.stage_id and s.is_done
               where i.id = any(v_added));
    if v_bad is not null then raise exception 'Already finished: %.', v_bad; end if;
    v_bad := public.shoot_clashes(p_id, v_added);
    if v_bad is not null then raise exception 'Already on another shoot: % — take it off that one first.', v_bad; end if;
  end if;

  if v_new then
    insert into public.shoots (client_id, shoot_on, starts_at, location, dop_id, smm_id, brief, equipment, footage_url)
    values (v_client, p_shoot_on, p_starts_at, nullif(btrim(coalesce(p_location, '')), ''), p_dop, p_smm,
            nullif(btrim(coalesce(p_brief, '')), ''), nullif(btrim(coalesce(p_equipment, '')), ''), v_url)
    returning * into sh;
  else
    update public.shoots
       set shoot_on = p_shoot_on, starts_at = p_starts_at, location = nullif(btrim(coalesce(p_location, '')), ''),
           dop_id = p_dop, smm_id = p_smm, brief = nullif(btrim(coalesce(p_brief, '')), ''),
           equipment = nullif(btrim(coalesce(p_equipment, '')), ''), footage_url = v_url
     where id = prev.id
    returning * into sh;
  end if;

  -- ------------------------------------------------ the reel list, written
  if p_items is not null then
    delete from public.shoot_items where shoot_id = sh.id and item_id = any(v_removed);
    insert into public.shoot_items (shoot_id, item_id) select sh.id, x from unnest(v_added) x;
  end if;

  -- ------------------------------------------------ what it does to the reels
  if sh.status = 'planned' and sh.dop_id is not null
     and (v_new or sh.dop_id is distinct from prev.dop_id or cardinality(v_added) > 0) then
    perform public.shoot_name_dop(sh.id);
  end if;
  if sh.status = 'done' and cardinality(v_added) > 0 then
    -- A reel added to a shoot that already happened was shot on it.
    v_moved := public.shoot_move_on(sh.id, v_added);
    perform public.shoot_tell_done(sh.id, v_moved, 'Shoot done');
  end if;

  -- ------------------------------------------------ who hears about it
  v_body := concat_ws(' · ', public.shoot_day_label(sh.shoot_on, sh.starts_at), sh.location,
                      (select count(*) from public.shoot_items si where si.shoot_id = sh.id)::text
                        || case when (select count(*) from public.shoot_items si where si.shoot_id = sh.id) = 1 then ' reel' else ' reels' end,
                      case when v_by is not null then 'from ' || v_by end);
  v_head := sh.code || ' · ' || (select name from public.clients where id = sh.client_id);
  if sh.status = 'planned' then
    if v_new then
      perform public.shoot_tell(array[sh.dop_id, sh.smm_id], 'New shoot: ' || v_head, v_body);
    else
      v_moved_day := (sh.shoot_on, sh.starts_at, sh.location) is distinct from (prev.shoot_on, prev.starts_at, prev.location);
      perform public.shoot_tell(array[case when sh.dop_id is distinct from prev.dop_id then sh.dop_id end,
                                      case when sh.smm_id is distinct from prev.smm_id then sh.smm_id end],
                                'New shoot: ' || v_head, v_body);
      if v_moved_day or cardinality(v_added) > 0 or cardinality(v_removed) > 0 then
        perform public.shoot_tell(array[case when sh.dop_id is not distinct from prev.dop_id then sh.dop_id end,
                                        case when sh.smm_id is not distinct from prev.smm_id then sh.smm_id end],
                                  'Shoot changed: ' || v_head, v_body);
      end if;
    end if;
  elsif sh.status = 'done' and not v_new and v_url is not null and prev.footage_url is null then
    perform public.shoot_tell(array[sh.smm_id], 'Raw footage linked: ' || v_head,
                              concat_ws(' · ', 'on the shoot', case when v_by is not null then 'from ' || v_by end));
  end if;
  return sh;
end;
$$;

-- Mark it done (its reels move on), cancel it, or put a cancelled one back on.
create or replace function public.set_shoot_status(p_shoot uuid, p_status text, p_footage_url text default null)
returns public.shoots
language plpgsql security definer set search_path = public as $$
declare
  sh      public.shoots;
  v_url   text := nullif(btrim(coalesce(p_footage_url, '')), '');
  v_moved uuid[];
  v_bad   text;
  v_items uuid[];
  v_head  text;
  v_by    text := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = auth.uid());
begin
  if not public.is_staff() then raise exception 'Only staff can change a shoot.'; end if;
  -- One at a time: a second quick click waits, then finds it already done.
  select * into sh from public.shoots where id = p_shoot for update;
  if not found then raise exception 'That shoot no longer exists.'; end if;
  if not public.can_run_shoot(sh.id) then
    raise exception 'Only the client''s team, the shoot''s DOP or SMM, the owner or HR can change this shoot.';
  end if;
  if p_status is null or p_status not in ('planned', 'done', 'cancelled') then
    raise exception 'Mark it done, cancel it, or put it back on.';
  end if;
  if v_url is not null and v_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Paste the whole footage link — it starts with https://';
  end if;
  if p_status = sh.status then return sh; end if;
  if sh.status = 'done' then raise exception '% is done — its reels have moved on.', sh.code; end if;
  v_head := sh.code || ' · ' || (select name from public.clients where id = sh.client_id);

  if p_status = 'done' then
    if sh.status = 'cancelled' then raise exception '% is cancelled — put it back on first.', sh.code; end if;
    update public.shoots set status = 'done', footage_url = coalesce(v_url, footage_url) where id = sh.id returning * into sh;
    v_moved := public.shoot_move_on(sh.id, null);
    perform public.shoot_tell_done(sh.id, v_moved, 'Shoot done');
  elsif p_status = 'cancelled' then
    update public.shoots set status = 'cancelled' where id = sh.id returning * into sh;
    perform public.shoot_tell(array[sh.dop_id, sh.smm_id], 'Shoot cancelled: ' || v_head,
      concat_ws(' · ', 'was ' || public.shoot_day_label(sh.shoot_on, sh.starts_at), case when v_by is not null then 'from ' || v_by end));
  else
    v_items := (select coalesce(array_agg(item_id), '{}') from public.shoot_items where shoot_id = sh.id);
    v_bad := public.shoot_clashes(sh.id, v_items);
    if v_bad is not null then raise exception 'Already on another shoot: % — take it off that one first.', v_bad; end if;
    update public.shoots set status = 'planned' where id = sh.id returning * into sh;
    perform public.shoot_name_dop(sh.id);
    perform public.shoot_tell(array[sh.dop_id, sh.smm_id], 'Shoot back on: ' || v_head,
      concat_ws(' · ', public.shoot_day_label(sh.shoot_on, sh.starts_at), sh.location, case when v_by is not null then 'from ' || v_by end));
  end if;
  return sh;
end;
$$;

-- ============================================ 8. reading with names

-- With names: employees' own rules hand most people one record, their own
-- (the reason v_tasks exists). shoot_visible() is the lock.
create or replace view public.v_shoots as
select s.*,
       c.name as client_name,
       d.full_name as dop_name,
       m.full_name as smm_name,
       coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) as creator_name,
       (select count(*) from public.shoot_items si where si.shoot_id = s.id)::int as item_count
  from public.shoots s
  join public.clients c on c.id = s.client_id
  left join public.employees d on d.id = s.dop_id
  left join public.employees m on m.id = s.smm_id
  left join public.profiles p on p.id = s.created_by
 where public.shoot_visible(s.client_id, s.dop_id, s.smm_id);

-- A shoot's reels, as its people see them: code, title, the stage it is in.
create or replace view public.v_shoot_items as
select si.shoot_id, si.item_id, si.created_at,
       i.code as item_code, i.title as item_title, i.client_id,
       st.name as stage_name, st.is_done as stage_done,
       s.shoot_on, s.status as shoot_status
  from public.shoot_items si
  join public.shoots s on s.id = si.shoot_id
  join public.content_items i on i.id = si.item_id
  join public.workflow_stages st on st.id = i.stage_id
 where public.shoot_visible(s.client_id, s.dop_id, s.smm_id);

revoke all on public.v_shoots, public.v_shoot_items from anon;
grant select on public.v_shoots, public.v_shoot_items to authenticated;

revoke all on function public.save_shoot(uuid, uuid, date, time, text, uuid, uuid, text, text, text, uuid[]),
                       public.set_shoot_status(uuid, text, text),
                       public.shoot_visible(uuid, uuid, uuid), public.can_run_shoot(uuid)
  from public, anon;
grant execute on function public.save_shoot(uuid, uuid, date, time, text, uuid, uuid, text, text, text, uuid[]),
                          public.set_shoot_status(uuid, text, text),
                          public.shoot_visible(uuid, uuid, uuid), public.can_run_shoot(uuid)
  to authenticated;
revoke all on function public.shoot_stage_for(uuid), public.shoot_next_stage(uuid), public.shoot_day_label(date, time),
                       public.shoot_tell(uuid[], text, text), public.shoot_name_dop(uuid),
                       public.shoot_move_on(uuid, uuid[]), public.shoot_tell_done(uuid, uuid[], text),
                       public.shoot_clashes(uuid, uuid[])
  from public, anon, authenticated;

-- ============================================ 9. row-level security

alter table public.shoots      enable row level security;
alter table public.shoot_items enable row level security;

drop policy if exists shoots_select on public.shoots;
create policy shoots_select on public.shoots for select
  using ( public.shoot_visible(client_id, dop_id, smm_id) );
-- Written only through save_shoot() / set_shoot_status().
drop policy if exists shoots_delete on public.shoots;
create policy shoots_delete on public.shoots for delete
  using ( status <> 'done' and public.can_edit_work(client_id) );
revoke insert, update on public.shoots from authenticated;

drop policy if exists shoot_items_select on public.shoot_items;
create policy shoot_items_select on public.shoot_items for select
  using ( shoot_id in (select s.id from public.shoots s) );
revoke insert, update, delete on public.shoot_items from authenticated;

revoke all on public.shoots, public.shoot_items from anon;
revoke all on sequence public.shoot_code_seq from anon;

-- ---------------------------------------------------------------- proof
-- Expect: 2 of 2 / Main page reel: Shoot required · Fan page reel: Shoot
-- required / yes / 2 of 2 / yes / S-0001 on a first run / the DOPs on
-- client teams so far (none is fine — pick one on each shoot) / 1.

select '0046 tables on the database (expect 2 of 2)' as check,
       (select count(*) from unnest(array['shoots', 'shoot_items']) t
         where to_regclass('public.' || t) is not null)::text || ' of 2' as result
union all
select 'the stage a shoot covers, per workflow (expect Shoot required on each)',
       coalesce((select string_agg(w.name || ': ' || s.name, ' · ' order by w.sort_order, s.sort_order)
                   from public.workflow_stages s join public.workflows w on w.id = s.workflow_id and w.is_active
                  where s.is_shoot and s.is_active), 'NONE — tick "A shoot covers it" on a stage')
union all
select 'a shoot is written only through save_shoot() / set_shoot_status() (expect yes)',
       case when not has_table_privilege('authenticated', 'public.shoots', 'insert')
             and not has_table_privilege('authenticated', 'public.shoots', 'update')
             and not has_table_privilege('authenticated', 'public.shoot_items', 'insert')
             and has_function_privilege('authenticated', 'public.set_shoot_status(uuid, text, text)', 'execute')
            then 'yes' else 'NO' end
union all
select 'the two new tables have row-level security (expect 2 of 2)',
       (select count(*) from pg_class
         where relname in ('shoots', 'shoot_items') and relnamespace = 'public'::regnamespace and relrowsecurity)::text || ' of 2'
union all
select 'a shoot tells its people once, not per reel (expect yes)',
       case when pg_get_functiondef('public.task_after()'::regprocedure) like '%metrol.quiet%' then 'yes' else 'NO' end
union all
select 'the next shoot code (expect S-0001 on a first run)',
       'S-' || lpad((case when (select is_called from public.shoot_code_seq) then (select last_value from public.shoot_code_seq) + 1 else 1 end)::text, 4, '0')
union all
select 'DOPs on client teams so far',
       coalesce((select string_agg(distinct e.full_name, ', ')
                   from public.client_assignments ca
                   join public.roles r on r.id = ca.role_id and r.name = 'DOP / Production'
                   join public.employees e on e.id = ca.employee_id
                  where ca.ended_at is null), 'none yet — pick the DOP on each shoot, or add one on a client''s Team tab')
union all
select 'read rules open to anyone (expect 1 = site_settings, public on purpose)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
