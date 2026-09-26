-- 0044 — Phase 2, Round 2: content items, the hand-off, tasks (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0043. Safe to re-run.
--
-- AGENCY-OS-PLAN.md §5 and §9. The blueprint's golden rule — each
-- department's finished work is the next one's starting point — as rows and
-- two triggers, nothing about the order of work in code:
--
--   content_items           one reel / post (C-00001): client, page, workflow,
--                           the stage it is in, title, format, script, post date
--   content_item_assignees  who does each role on THIS item (the SMM, the
--                           editor…) when the client's team has more than one
--   tasks                   T-00001. A stage's task, or one on its own
--   task_comments           the conversation on a task (internal by default —
--                           a client portal, Phase 3, never shows those)
--   task_events             what happened to a task, written by the database
--
-- THE HAND-OFF. When an item enters a stage, the database gives that stage's
-- task to whoever holds the stage's role on the item: the person named on
-- the item for that role; else, for the role pages are held in (SMM), the
-- page's holder; else the only person in that role on the client's team.
-- Nobody found → the task waits unassigned and the item's creator is told.
-- The assignee is notified (in the app now, on their phone once the
-- push-notifications Edge Function is deployed). Finishing the task moves
-- the item to the next stage, which makes the next person's task. Moving an
-- item by hand closes whatever was open on it.
--
-- Deadlines: a stage's "due within N hours" (Settings → Workflows & lists)
-- becomes its task's due time. A task past due tells the assignee's
-- reporting manager — or, with no manager on file, whoever gave the task —
-- once, on the next screen load (no scheduler here, the birthday trick).
--
-- Who (THE ACCESS RULE: the owner and HR see and do everything):
--   * a client's content and tasks: its team, whoever may see every client
--     (the department head, management), and anyone with "See all work";
--   * adding and changing content: the client's team, and whoever manages
--     the client;
--   * a task on its own: anyone reads their own, the tasks they gave, their
--     direct reports', and — with "See all work" — their department's.
-- Nothing already on the database changes, except that notifications gains
-- four types and two columns (task_id, pushed_at).

-- ============================================ 0. stop before changing anything

do $$
begin
  if to_regclass('public.workflow_stages') is null
     or to_regclass('public.client_assignments') is null
     or to_regprocedure('public.is_owner_level()') is null
     or to_regprocedure('public.can_see_client(uuid)') is null then
    raise exception '0044 needs 0036, 0040 and 0043 first — nothing was changed.';
  end if;
end $$;

create sequence if not exists public.content_item_code_seq;
create sequence if not exists public.task_code_seq;

-- ============================================ 1. content items

create table if not exists public.content_items (
  id               uuid primary key default gen_random_uuid(),
  code             text unique,
  client_id        uuid not null references public.clients(id) on delete cascade,
  page_id          uuid references public.pages(id) on delete set null,
  workflow_id      uuid not null references public.workflows(id) on delete restrict,
  -- restrict: a stage an item sits in cannot be deleted — the app retires it.
  stage_id         uuid not null references public.workflow_stages(id) on delete restrict,
  title            text not null check (length(btrim(title)) > 0),
  format_id        uuid references public.content_formats(id) on delete set null,
  script           text,
  script_url       text,
  planned_post_on  date,
  stage_entered_at timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists content_items_client on public.content_items (client_id);
create index if not exists content_items_stage  on public.content_items (stage_id);

create table if not exists public.content_item_assignees (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.content_items(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (item_id, role_id)
);

-- ============================================ 2. tasks

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  title           text not null check (length(btrim(title)) > 0),
  description     text,
  -- All three optional: not every task is a reel's.
  client_id       uuid references public.clients(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  -- restrict, like content_items: a stage with history is retired, not deleted.
  stage_id        uuid references public.workflow_stages(id) on delete restrict,
  -- The role a stage's task was made for — still known while it waits unassigned.
  role_id         uuid references public.roles(id) on delete set null,
  assignee_id     uuid references public.employees(id) on delete set null,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at          timestamptz,
  status_id       uuid not null references public.task_statuses(id) on delete restrict,
  completed_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_assignee on public.tasks (assignee_id);
create index if not exists tasks_item     on public.tasks (content_item_id);
create index if not exists tasks_client   on public.tasks (client_id);
create index if not exists tasks_due      on public.tasks (due_at) where due_at is not null;

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (length(btrim(body)) > 0),
  -- Staff-only unless somebody says otherwise; the client portal (Phase 3)
  -- shows only the ones marked false.
  internal   boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task on public.task_comments (task_id, created_at);

create table if not exists public.task_events (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null check (kind in ('created', 'status', 'assigned', 'due', 'priority')),
  from_value text,
  to_value   text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists task_events_task on public.task_events (task_id, created_at);

-- ============================================ 3. notifications learn about tasks

alter table public.notifications add column if not exists task_id uuid references public.tasks(id) on delete set null;
-- Stamped by the push-notifications Edge Function, so a row is pushed once.
alter table public.notifications add column if not exists pushed_at timestamptz;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('broadcast','birthday','shift_reminder','visit_request','wfh_request','incentive_claim','views_reminder',
                  'task_assigned','task_unassigned','task_overdue','task_comment'));

-- ============================================ 4. who may see and do what

-- The client's work: its team, whoever sees every client, anyone given
-- "See all work" for it, the owner and HR.
create or replace function public.can_see_work(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner_level()
      or public.has_capability_for_client(p_client, 'view_all_work')
      or public.can_see_client(p_client)
$$;

-- Adding and changing content on a client: its team and whoever manages it.
create or replace function public.can_edit_work(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner_level()
      or public.has_capability_for_client(p_client, 'manage_clients')
      or public.is_on_client(p_client)
$$;

-- Per query, not per row: every client whose work the caller sees.
create or replace function public.my_work_clients()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.clients c where public.can_see_work(c.id)
$$;

-- Named on an item, or holding a task on it — seen even from off the team.
create or replace function public.works_on_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.content_item_assignees a
                  where a.item_id = p_item and a.employee_id = public.my_employee_id())
      or exists (select 1 from public.tasks t
                  where t.content_item_id = p_item and t.assignee_id = public.my_employee_id())
$$;

-- ONE definition of who sees a task: the policy on tasks and the view with
-- names below both ask this, so they cannot drift apart.
create or replace function public.task_visible(p_assignee uuid, p_created_by uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner_level()
      or (p_assignee is not null and p_assignee = public.my_employee_id())
      or (p_created_by is not null and p_created_by = auth.uid())
      or (p_client is not null and public.can_see_work(p_client))
      or exists (select 1 from public.employees e
                  where e.id = p_assignee
                    and (e.reporting_to = public.my_employee_id()
                         or public.has_capability_in_department(e.department_id, 'view_all_work')))
$$;

-- Changing a task beyond its status: whoever gave it, whoever edits the
-- client's work, the assignee's manager, a "See all work" holder for the
-- assignee's department, the owner and HR. The assignee alone may only move
-- its status (the guard trigger below).
create or replace function public.can_manage_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
      left join public.employees e on e.id = t.assignee_id
     where t.id = p_task
       and (public.is_owner_level()
            or t.created_by = auth.uid()
            or (t.client_id is not null and public.can_edit_work(t.client_id))
            or (e.id is not null and (e.reporting_to = public.my_employee_id()
                                      or public.has_capability_in_department(e.department_id, 'view_all_work'))))
  )
$$;

-- Giving a task to somebody: yourself; your direct report; anyone in a
-- department where you hold "See all work"; on a client whose work you
-- edit, anyone on its team. The owner and HR: anybody. A task nobody holds
-- yet may only sit on a client you edit, or be your own note.
create or replace function public.can_give_task(p_client uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner_level()
      or (p_assignee is null and (p_client is null or public.can_edit_work(p_client)))
      or (p_assignee is not null and p_assignee = public.my_employee_id())
      or exists (
        select 1 from public.employees e
         where e.id = p_assignee and e.status <> 'resigned'
           and (e.reporting_to = public.my_employee_id()
                or public.has_capability_in_department(e.department_id, 'view_all_work')
                or (p_client is not null and public.can_edit_work(p_client)
                    and exists (select 1 from public.client_assignments ca
                                 where ca.client_id = p_client and ca.employee_id = e.id and ca.ended_at is null)))
      )
$$;

-- The same rule as a list of names, for the "give it to" picker — names and
-- designations only, never anything else off an employee record.
create or replace function public.task_people(p_client uuid default null)
returns table (id uuid, full_name text, designation text, department_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, e.full_name, e.designation, e.department_id
    from public.employees e
   where e.status <> 'resigned' and public.is_staff()
     and public.can_give_task(p_client, e.id)
   order by e.full_name
$$;

-- ============================================ 5. who does a role on an item

create or replace function public.content_item_person(p_item uuid, p_role uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    -- 1. named on the item for this role
    (select a.employee_id from public.content_item_assignees a
       join public.employees e on e.id = a.employee_id
      where a.item_id = p_item and a.role_id = p_role and e.status <> 'resigned'),
    -- 2. the role pages are held in (SMM): the page's holder
    (select pa.employee_id from public.content_items i
       join public.page_assignments pa on pa.page_id = i.page_id
       join public.employees e on e.id = pa.employee_id
       join public.roles r on r.id = p_role and r.page_holder
      where i.id = p_item and e.status <> 'resigned'
      order by pa.assigned_at limit 1),
    -- 3. the only person in the role on the client's team
    (select (array_agg(distinct ca.employee_id))[1]
       from public.content_items i
       join public.client_assignments ca on ca.client_id = i.client_id and ca.role_id = p_role and ca.ended_at is null
       join public.employees e on e.id = ca.employee_id and e.status <> 'resigned'
      where i.id = p_item
     having count(distinct ca.employee_id) = 1),
    -- 4. a company-wide role (not held per client): its only holder
    (select (array_agg(e.id))[1]
       from public.employees e
       join public.roles r on r.id = p_role and not r.client_scoped
      where e.status <> 'resigned' and e.profile_id is not null
        and exists (select 1 from public.role_holdings_for(e.profile_id) h
                     where h.role_id = p_role
                       and (h.scope_department is null
                            or h.scope_department = (select c.department_id from public.content_items i
                                                       join public.clients c on c.id = i.client_id where i.id = p_item)))
     having count(*) = 1)
  )
$$;

-- ============================================ 6. content items: codes, checks, the hand-off

create or replace function public.content_item_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.code, '') = '' then
      new.code := 'C-' || lpad(nextval('public.content_item_code_seq')::text, 5, '0');
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    if new.stage_id is null then
      new.stage_id := (select s.id from public.workflow_stages s
                        where s.workflow_id = new.workflow_id and s.is_active
                        order by s.sort_order, s.name limit 1);
    end if;
  else
    if new.code is distinct from old.code and auth.uid() is not null then
      raise exception 'A content ID never changes.';
    end if;
    if new.client_id is distinct from old.client_id then
      raise exception 'An item stays with its client — add a new one for the other client.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.stage_id is null then
    raise exception 'That workflow has no stages in use — add one in Settings → Workflows & lists.';
  end if;
  if not exists (select 1 from public.workflow_stages s where s.id = new.stage_id and s.workflow_id = new.workflow_id) then
    raise exception 'That stage is not part of this item''s workflow.';
  end if;
  if new.page_id is not null and not exists (select 1 from public.pages p where p.id = new.page_id and p.client_id = new.client_id) then
    raise exception 'That page belongs to another client.';
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    if not (select s.is_active from public.workflow_stages s where s.id = new.stage_id) then
      raise exception 'That stage is retired — it takes no new items.';
    end if;
    new.stage_entered_at := now();
    new.completed_at := case when (select s.is_done from public.workflow_stages s where s.id = new.stage_id) then now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_items_before on public.content_items;
create trigger content_items_before
  before insert or update on public.content_items
  for each row execute function public.content_item_before();

-- An item entering a stage: close what was open on it, make the stage's
-- task. Runs as the database, not the caller — handing a task to a
-- colleague is the rule working, not the caller writing somebody else's row.
create or replace function public.content_item_enter_stage(p_item uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  it     public.content_items;
  st     public.workflow_stages;
  v_done uuid := (select id from public.task_statuses where is_done and is_active order by sort_order, name limit 1);
  v_new  uuid := (select id from public.task_statuses where is_active and not is_done order by sort_order, name limit 1);
  v_task uuid;
begin
  select * into it from public.content_items where id = p_item;
  if not found then return null; end if;
  select * into st from public.workflow_stages where id = it.stage_id;

  -- 1. whatever is still open on an earlier (or later) stage is behind it now
  --    (metrol.by_rule tells the task guard this is the rule, not a person)
  if v_done is not null then
    perform set_config('metrol.by_rule', 'on', true);
    perform set_config('metrol.task_note', 'Closed: the item moved to ' || st.name, true);
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
          case when st.owner_role_id is not null then public.content_item_person(it.id, st.owner_role_id) end,
          v_new,
          case when st.sla_hours is not null then now() + make_interval(hours => st.sla_hours) end,
          auth.uid())
  returning id into v_task;
  return v_task;
end;
$$;
revoke all on function public.content_item_enter_stage(uuid) from public, anon, authenticated;

create or replace function public.content_item_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then return null; end if;
  perform public.content_item_enter_stage(new.id);
  return null;
end;
$$;

-- On a stage change only. A new item gets its first task from
-- create_content_item(), after the item's people are saved — a trigger on
-- the insert would run before they exist.
drop trigger if exists content_items_after on public.content_items;
create trigger content_items_after
  after update of stage_id on public.content_items
  for each row execute function public.content_item_after();

-- Naming somebody for a role hands them the open task for it, if one waits.
create or replace function public.content_item_person_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('metrol.by_rule', 'on', true);
  update public.tasks t set assignee_id = new.employee_id
    from public.content_items i
   where i.id = new.item_id and t.content_item_id = i.id and t.stage_id = i.stage_id
     and t.role_id = new.role_id and t.assignee_id is distinct from new.employee_id
     and not exists (select 1 from public.task_statuses s where s.id = t.status_id and s.is_done);
  perform set_config('metrol.by_rule', '', true);
  return null;
end;
$$;

drop trigger if exists content_item_assignees_after on public.content_item_assignees;
create trigger content_item_assignees_after
  after insert or update of employee_id on public.content_item_assignees
  for each row execute function public.content_item_person_changed();

-- The one door for a new item: the item and its people in one go, then its
-- first task. p_people is [{ "role_id": …, "employee_id": … }, …].
create or replace function public.create_content_item(
  p_client uuid, p_page uuid, p_workflow uuid, p_title text,
  p_format uuid default null, p_script text default null, p_script_url text default null,
  p_planned_post_on date default null, p_people jsonb default '[]'::jsonb
) returns public.content_items
language plpgsql security definer set search_path = public as $$
declare it public.content_items;
begin
  if not public.is_staff() or not public.can_edit_work(p_client) then
    raise exception 'Only this client''s team, whoever manages it, the owner or HR can add content here.';
  end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give it a title.'; end if;
  if not exists (select 1 from public.workflows w where w.id = p_workflow and w.is_active) then
    raise exception 'Pick a workflow that is in use.';
  end if;

  insert into public.content_items (client_id, page_id, workflow_id, title, format_id, script, script_url, planned_post_on)
  values (p_client, p_page, p_workflow, btrim(p_title), p_format,
          nullif(btrim(coalesce(p_script, '')), ''), nullif(btrim(coalesce(p_script_url, '')), ''), p_planned_post_on)
  returning * into it;

  insert into public.content_item_assignees (item_id, role_id, employee_id)
  select it.id, (x->>'role_id')::uuid, (x->>'employee_id')::uuid
    from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) x
   where nullif(x->>'role_id', '') is not null and nullif(x->>'employee_id', '') is not null
  on conflict (item_id, role_id) do update set employee_id = excluded.employee_id;

  perform public.content_item_enter_stage(it.id);
  return it;
end;
$$;
revoke all on function public.create_content_item(uuid, uuid, uuid, text, uuid, text, text, date, jsonb) from public, anon;
grant execute on function public.create_content_item(uuid, uuid, uuid, text, uuid, text, text, date, jsonb) to authenticated;

-- ============================================ 7. tasks: codes, the guard, history, notices, the advance

create or replace function public.task_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_done boolean;
  -- A person's own write, not the rule (a hand-off, a named person) and not
  -- a foreign key tidying up after a delete (those run one trigger deeper).
  v_person boolean := auth.uid() is not null and pg_trigger_depth() = 1
                      and coalesce(current_setting('metrol.by_rule', true), '') <> 'on';
begin
  if tg_op = 'INSERT' then
    if coalesce(new.code, '') = '' then
      new.code := 'T-' || lpad(nextval('public.task_code_seq')::text, 5, '0');
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    if new.status_id is null then
      new.status_id := (select id from public.task_statuses where is_active and not is_done order by sort_order, name limit 1);
    end if;
    if new.content_item_id is not null then
      new.client_id := (select client_id from public.content_items where id = new.content_item_id);
    end if;
  else
    if new.code is distinct from old.code and auth.uid() is not null then
      raise exception 'A task ID never changes.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if v_person then
      if new.content_item_id is distinct from old.content_item_id or new.stage_id is distinct from old.stage_id
         or new.role_id is distinct from old.role_id then
        raise exception 'A task stays with the stage it was made for.';
      end if;
      -- The assignee alone moves only the status.
      if not public.can_manage_task(old.id)
         and (new.title is distinct from old.title or new.description is distinct from old.description
              or new.client_id is distinct from old.client_id or new.assignee_id is distinct from old.assignee_id
              or new.priority is distinct from old.priority or new.due_at is distinct from old.due_at) then
        raise exception 'Only whoever gave this task (or manages it) can change that — you can change its status.';
      end if;
      -- Handing it to somebody else: somebody the caller may give work to.
      if new.assignee_id is distinct from old.assignee_id and not public.can_give_task(new.client_id, new.assignee_id) then
        raise exception 'You cannot give a task to that person.';
      end if;
    end if;
  end if;

  v_done := coalesce((select is_done from public.task_statuses where id = new.status_id), false);
  if not v_done then
    new.completed_at := null;
  elsif tg_op = 'INSERT' then
    new.completed_at := now();
  else
    new.completed_at := coalesce(old.completed_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_before on public.tasks;
create trigger tasks_before
  before insert or update on public.tasks
  for each row execute function public.task_before();

-- The office's clock, for the times a notification spells out.
create or replace function public.office_time_label(p_at timestamptz)
returns text language sql stable security definer set search_path = public as $$
  select to_char(p_at at time zone coalesce((select timezone from public.attendance_settings limit 1), 'Asia/Kolkata'),
                 'FMDD Mon, FMHH12:MI AM')
$$;
revoke all on function public.office_time_label(timestamptz) from public, anon, authenticated;

create or replace function public.task_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_note   text := nullif(current_setting('metrol.task_note', true), '');
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
            case when v_stage is not null then 'Hand-off: the item reached ' || v_stage end);
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
            concat_ws(' · ', v_client, new.code,
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

drop trigger if exists tasks_after on public.tasks;
create trigger tasks_after
  after insert or update on public.tasks
  for each row execute function public.task_after();

-- A comment reaches the assignee and whoever gave the task (not its writer).
create or replace function public.task_comment_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists task_comments_before on public.task_comments;
create trigger task_comments_before
  before insert on public.task_comments
  for each row execute function public.task_comment_before();

create or replace function public.task_comment_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tasks; v_who text;
begin
  select * into t from public.tasks where id = new.task_id;
  v_who := (select coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = new.author_id);
  insert into public.notifications (recipient_employee_id, type, title, body, task_id, created_by)
  select distinct e.id, 'task_comment', 'Comment on ' || t.code || ': ' || t.title,
         coalesce(v_who, 'Someone') || ': ' || left(new.body, 140), t.id, public.my_employee_id()
    from public.employees e
   where e.status <> 'resigned' and e.profile_id is distinct from new.author_id
     and (e.id = t.assignee_id or (e.profile_id = t.created_by and t.created_by is not null));
  return null;
end;
$$;

drop trigger if exists task_comments_after on public.task_comments;
create trigger task_comments_after
  after insert on public.task_comments
  for each row execute function public.task_comment_after();

-- ============================================ 8. overdue → the reporting manager

-- Called on every screen load (the birthday trick, 0025): does real work
-- once per task per deadline. Idempotent by the notification itself — one
-- that was already sent after the task fell due stops a second; moving the
-- deadline later lets it fire again when the new one passes.
create or replace function public.remind_overdue_tasks()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.notifications (recipient_employee_id, type, title, body, task_id)
  select x.recipient, 'task_overdue', 'Overdue: ' || x.title,
         concat_ws(' · ', x.full_name || '''s task ' || x.code, 'was due ' || public.office_time_label(x.due_at), x.client),
         x.id
    from (
      select t.id, t.code, t.title, t.due_at, e.full_name, c.name as client,
             coalesce(
               (select m.id from public.employees m where m.id = e.reporting_to and m.status <> 'resigned'),
               (select g.id from public.employees g where g.profile_id = t.created_by and g.status <> 'resigned')
             ) as recipient,
             e.id as assignee
        from public.tasks t
        join public.employees e on e.id = t.assignee_id
        join public.task_statuses s on s.id = t.status_id and not s.is_done
        left join public.clients c on c.id = t.client_id
       where t.due_at < now()
         and not exists (select 1 from public.notifications n
                          where n.task_id = t.id and n.type = 'task_overdue' and n.created_at >= t.due_at)
    ) x
   where x.recipient is not null and x.recipient <> x.assignee;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.remind_overdue_tasks() from public, anon;
grant execute on function public.remind_overdue_tasks() to authenticated;

-- ============================================ 9. reading with names

-- Tasks with the assignee's and the giver's names — the reason for a view:
-- employees' own rules (0006) hand most people exactly one record, their
-- own. It runs with its owner's rights on purpose (as v_client_team does);
-- task_visible() is the lock, the same function the table's policy asks.
create or replace view public.v_tasks as
select t.*,
       e.full_name  as assignee_name,
       e.profile_id as assignee_profile_id,
       coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)) as creator_name
  from public.tasks t
  left join public.employees e on e.id = t.assignee_id
  left join public.profiles p on p.id = t.created_by
 where public.task_visible(t.assignee_id, t.created_by, t.client_id);

revoke all on public.v_tasks from anon;
grant select on public.v_tasks to authenticated;

-- A task's comments and history as one timeline, with names.
create or replace function public.task_thread(p_task uuid)
returns table (kind text, id uuid, at timestamptz, who text, body text,
               event text, from_value text, to_value text, internal boolean)
language sql stable security definer set search_path = public as $$
  with t as (
    select x.id from public.tasks x
     where x.id = p_task and public.task_visible(x.assignee_id, x.created_by, x.client_id)
  )
  select 'comment', c.id, c.created_at,
         coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), c.body,
         null, null, null, c.internal
    from public.task_comments c join t on t.id = c.task_id
    left join public.profiles p on p.id = c.author_id
  union all
  select 'event', ev.id, ev.created_at,
         coalesce(nullif(p.name, ''), split_part(p.email, '@', 1)), ev.note,
         ev.kind, ev.from_value, ev.to_value, null
    from public.task_events ev join t on t.id = ev.task_id
    left join public.profiles p on p.id = ev.actor_id
  order by 3
$$;
revoke all on function public.task_thread(uuid) from public, anon;
grant execute on function public.task_thread(uuid) to authenticated;

revoke all on function public.can_see_work(uuid), public.can_edit_work(uuid), public.my_work_clients(),
                       public.works_on_item(uuid), public.task_visible(uuid, uuid, uuid),
                       public.can_manage_task(uuid), public.can_give_task(uuid, uuid),
                       public.task_people(uuid), public.content_item_person(uuid, uuid)
  from public, anon;
grant execute on function public.can_see_work(uuid), public.can_edit_work(uuid), public.my_work_clients(),
                          public.works_on_item(uuid), public.task_visible(uuid, uuid, uuid),
                          public.can_manage_task(uuid), public.can_give_task(uuid, uuid),
                          public.task_people(uuid)
  to authenticated;
revoke all on function public.content_item_person(uuid, uuid) from authenticated;

-- ============================================ 10. row-level security

alter table public.content_items          enable row level security;
alter table public.content_item_assignees enable row level security;
alter table public.tasks                  enable row level security;
alter table public.task_comments          enable row level security;
alter table public.task_events            enable row level security;

drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items for select
  using ( client_id in (select public.my_work_clients()) or public.works_on_item(id) );
-- No insert rule: create_content_item() is the only door (it runs the first hand-off).
drop policy if exists content_items_update on public.content_items;
create policy content_items_update on public.content_items for update
  using      ( public.can_edit_work(client_id) )
  with check ( public.can_edit_work(client_id) );
drop policy if exists content_items_delete on public.content_items;
create policy content_items_delete on public.content_items for delete
  using ( (select public.is_owner_level()) or public.has_capability_for_client(client_id, 'manage_clients') );
revoke insert on public.content_items from authenticated;

drop policy if exists content_item_assignees_select on public.content_item_assignees;
create policy content_item_assignees_select on public.content_item_assignees for select
  using ( item_id in (select i.id from public.content_items i) );
drop policy if exists content_item_assignees_write on public.content_item_assignees;
create policy content_item_assignees_write on public.content_item_assignees for all
  using      ( exists (select 1 from public.content_items i where i.id = item_id and public.can_edit_work(i.client_id)) )
  with check ( exists (select 1 from public.content_items i where i.id = item_id and public.can_edit_work(i.client_id)) );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using ( public.task_visible(assignee_id, created_by, client_id) );
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert
  with check ( (select public.is_staff()) and content_item_id is null and stage_id is null
               and public.can_give_task(client_id, assignee_id)
               and (client_id is null or public.can_see_work(client_id)) );
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using      ( public.can_manage_task(id) or assignee_id = (select public.my_employee_id()) )
  -- Who the new assignee may be is task_before()'s check: it sees the old
  -- row, which a policy cannot.
  with check ( (select public.is_staff()) );
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using ( content_item_id is null and (created_by = (select auth.uid()) or (select public.is_owner_level())) );

drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments for select
  using ( task_id in (select t.id from public.tasks t) );
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert
  with check ( (select public.is_staff()) and task_id in (select t.id from public.tasks t) );
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments for delete
  using ( author_id = (select auth.uid()) or (select public.is_owner_level()) );

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events for select
  using ( task_id in (select t.id from public.tasks t) );
-- Written only by the database (task_after()), never by a person.
revoke insert, update, delete on public.task_events from authenticated;
revoke update on public.task_comments from authenticated;

revoke all on public.content_items, public.content_item_assignees, public.tasks,
              public.task_comments, public.task_events from anon;
revoke all on sequence public.content_item_code_seq, public.task_code_seq from anon;

-- ---------------------------------------------------------------- proof
-- Expect: 5 of 5 / yes / yes / C-00001 and T-00001 come next / the stage
-- roles nobody holds on any client yet (DOP / Production is likely — add a
-- DOP on a client's Team tab, or those tasks wait unassigned) / 5 of 5 /
-- the owner and HR (+ the C&M head) / 1 (site_settings, public on purpose).

select '0044 tables on the database (expect 5 of 5)' as check,
       (select count(*) from unnest(array['content_items', 'content_item_assignees', 'tasks', 'task_comments', 'task_events']) t
         where to_regclass('public.' || t) is not null)::text || ' of 5' as result
union all
select 'the hand-off triggers are in place (expect yes)',
       case when (select count(*) from pg_trigger
                   where tgname in ('content_items_after', 'tasks_after', 'content_item_assignees_after')
                     and not tgisinternal) = 3 then 'yes' else 'NO' end
union all
select 'notifications accepts the four task types (expect yes)',
       (select case when pg_get_constraintdef(oid) like '%task_overdue%' and pg_get_constraintdef(oid) like '%task_comment%'
                    then 'yes' else 'NO' end from pg_constraint where conname = 'notifications_type_check')
union all
select 'the next codes (expect C-00001 and T-00001 on a first run)',
       'C-' || lpad((case when (select is_called from public.content_item_code_seq) then (select last_value from public.content_item_code_seq) + 1 else 1 end)::text, 5, '0')
       || ' and T-' || lpad((case when (select is_called from public.task_code_seq) then (select last_value from public.task_code_seq) + 1 else 1 end)::text, 5, '0')
union all
select 'stage roles nobody holds on any client yet (their tasks wait unassigned)',
       coalesce((select string_agg(distinct r.name || ' (' || s.name || ')', ', ')
                   from public.workflow_stages s
                   join public.workflows w on w.id = s.workflow_id and w.is_active
                   join public.roles r on r.id = s.owner_role_id and r.client_scoped
                  where s.is_active and not s.is_done
                    and not exists (select 1 from public.client_assignments ca where ca.role_id = r.id and ca.ended_at is null)), 'none')
union all
select 'the five new tables have row-level security (expect 5 of 5)',
       (select count(*) from pg_class
         where relname in ('content_items', 'content_item_assignees', 'tasks', 'task_comments', 'task_events')
           and relnamespace = 'public'::regnamespace and relrowsecurity)::text || ' of 5'
union all
select 'logins who see every task (expect the owner and HR)',
       coalesce((select string_agg(coalesce(nullif(split_part(p.email, '@', 1), ''), p.id::text), ', ' order by p.email)
                   from public.profiles p
                  where p.role = 'owner'
                     or exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources')), 'nobody')
union all
select 'read rules open to anyone (expect 1 = site_settings, public on purpose)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
