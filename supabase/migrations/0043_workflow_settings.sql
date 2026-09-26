-- 0043 — Phase 2, Round 1: workflows and the lists they pick from (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0042. Safe to re-run.
--
-- AGENCY-OS-PLAN.md §5 and §9. The blueprint's golden rule — each
-- department's finished work is the next one's starting point — becomes
-- rows, not code: a WORKFLOW is an ordered list of STAGES, and each stage
-- names the role that acts on it. Round 2 hangs content items and the
-- hand-off (a task for whoever holds that role on the client's team) on
-- these rows; nothing about "Editing comes after Shoot done" lives in code.
--
-- Four editable lists, all seeded from the blueprint (§7–9, §17, §26):
--   workflows        "Main page reel", "Fan page reel" (tied to a page type)
--   workflow_stages  Idea → Scripting → Script ready → Shoot required →
--                    Shoot done → Editing → SMM review → Client review →
--                    Approved → Scheduled → Posted. Fan pages skip Client
--                    review (Q15's default — a row, changeable on screen).
--   task_statuses    Not started → In progress → Pending review → Revision
--                    → Approved → Completed
--   content_formats  Reel, Carousel, Post, Story, YouTube Short, YouTube video
--
-- Who: every staff member reads them (is_staff(), 0039). The owner and HR
-- change them (THE ACCESS RULE, is_owner_level(), 0040), and so does anyone
-- whose role is given "Workflows & lists" on Roles & access.
-- Nothing already on the database changes.

-- ============================================ 0. stop before changing anything

do $$
begin
  if to_regprocedure('public.is_staff()') is null
     or to_regprocedure('public.is_owner_level()') is null
     or to_regclass('public.roles') is null then
    raise exception '0043 needs 0035, 0039 and 0040 first — nothing was changed.';
  end if;
end $$;

-- ============================================ 1. workflows

create table if not exists public.workflows (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  -- Which kind of page it is for: a new item on a fan page starts on the
  -- first active fan workflow (Round 2). null = any page.
  page_type  text check (page_type in ('main', 'fan')),
  sort_order int not null default 0,
  -- Retire, never delete: content items (Round 2) keep naming theirs.
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================ 2. workflow stages

create table if not exists public.workflow_stages (
  id             uuid primary key default gen_random_uuid(),
  workflow_id    uuid not null references public.workflows(id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  sort_order     int not null default 0,
  -- Who acts while an item is in this stage — whoever holds this role on
  -- the item's client team gets the task (Round 2). null on a done stage.
  owner_role_id  uuid references public.roles(id) on delete set null,
  -- A stage where somebody approves or sends it back (SMM review, Client review).
  is_review      boolean not null default false,
  -- What a client would see in a portal (Phase 3, Q13). Recorded now so the
  -- portal needs no second pass over every workflow.
  client_visible boolean not null default false,
  -- An item here is finished: no task is created for it.
  is_done        boolean not null default false,
  tone           text not null default 'mute' check (tone in ('good', 'warn', 'bad', 'accent', 'mute')),
  -- Optional deadline for the stage, in hours. Round 2 turns it into a due time.
  sla_hours      int check (sla_hours is null or sla_hours between 1 and 8760),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (workflow_id, name)
);

create index if not exists workflow_stages_workflow on public.workflow_stages (workflow_id, sort_order);

-- ============================================ 3. task statuses

create table if not exists public.task_statuses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  tone       text not null default 'mute' check (tone in ('good', 'warn', 'bad', 'accent', 'mute')),
  -- The first active status (by sort_order) is where a new task starts.
  sort_order int not null default 0,
  -- A task in this status is finished — finishing a stage's task moves its
  -- content item on (Round 2).
  is_done    boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================ 4. content formats

create table if not exists public.content_formats (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================ 5. the seed (only into empty tables)

do $$
declare
  smm    uuid := (select id from public.roles where name = 'SMM');
  editor uuid := (select id from public.roles where name = 'Editor');
  dop    uuid := (select id from public.roles where name = 'DOP / Production');
  wf     uuid;
begin
  if not exists (select 1 from public.workflows) then
    insert into public.workflows (name, page_type, sort_order) values ('Main page reel', 'main', 1) returning id into wf;
    insert into public.workflow_stages (workflow_id, name, sort_order, owner_role_id, is_review, client_visible, is_done, tone)
    values
      (wf, 'Idea',           1,  smm,    false, false, false, 'mute'),
      (wf, 'Scripting',      2,  smm,    false, false, false, 'mute'),
      (wf, 'Script ready',   3,  smm,    false, false, false, 'accent'),
      (wf, 'Shoot required', 4,  dop,    false, false, false, 'accent'),
      (wf, 'Shoot done',     5,  smm,    false, false, false, 'accent'),
      (wf, 'Editing',        6,  editor, false, false, false, 'accent'),
      (wf, 'SMM review',     7,  smm,    true,  false, false, 'warn'),
      (wf, 'Client review',  8,  smm,    true,  true,  false, 'warn'),
      (wf, 'Approved',       9,  smm,    false, true,  false, 'good'),
      (wf, 'Scheduled',      10, smm,    false, true,  false, 'good'),
      (wf, 'Posted',         11, null,   false, true,  true,  'good');

    insert into public.workflows (name, page_type, sort_order) values ('Fan page reel', 'fan', 2) returning id into wf;
    insert into public.workflow_stages (workflow_id, name, sort_order, owner_role_id, is_review, client_visible, is_done, tone)
    values
      (wf, 'Idea',           1,  smm,    false, false, false, 'mute'),
      (wf, 'Scripting',      2,  smm,    false, false, false, 'mute'),
      (wf, 'Script ready',   3,  smm,    false, false, false, 'accent'),
      (wf, 'Shoot required', 4,  dop,    false, false, false, 'accent'),
      (wf, 'Shoot done',     5,  smm,    false, false, false, 'accent'),
      (wf, 'Editing',        6,  editor, false, false, false, 'accent'),
      (wf, 'SMM review',     7,  smm,    true,  false, false, 'warn'),
      (wf, 'Approved',       8,  smm,    false, true,  false, 'good'),
      (wf, 'Scheduled',      9,  smm,    false, true,  false, 'good'),
      (wf, 'Posted',         10, null,   false, true,  true,  'good');
  end if;

  if not exists (select 1 from public.task_statuses) then
    insert into public.task_statuses (name, tone, sort_order, is_done) values
      ('Not started',    'mute',   1, false),
      ('In progress',    'accent', 2, false),
      ('Pending review', 'warn',   3, false),
      ('Revision',       'bad',    4, false),
      ('Approved',       'good',   5, false),
      ('Completed',      'good',   6, true);
  end if;

  if not exists (select 1 from public.content_formats) then
    insert into public.content_formats (name, sort_order) values
      ('Reel', 1), ('Carousel', 2), ('Post', 3), ('Story', 4), ('YouTube Short', 5), ('YouTube video', 6);
  end if;
end $$;

-- ============================================ 6. one call to reorder a list

-- Dragging a row sends the whole new order at once, so the list is never
-- half-saved. Runs as the caller: the write rules below still decide.
create or replace function public.reorder_workflow_list(p_table text, p_ids uuid[])
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_table not in ('workflows', 'workflow_stages', 'task_statuses', 'content_formats') then
    raise exception 'not a list that can be reordered: %', p_table;
  end if;
  if not (public.is_owner_level() or public.has_capability('manage_workflows')) then
    raise exception 'Only the owner, HR, or a role with "Workflows & lists" can reorder this.';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord from unnest($1) with ordinality as o(id, ord) where t.id = o.id',
    p_table) using p_ids;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reorder_workflow_list(text, uuid[]) from public, anon;
grant execute on function public.reorder_workflow_list(text, uuid[]) to authenticated;

-- ============================================ 7. row-level security

alter table public.workflows       enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.task_statuses   enable row level security;
alter table public.content_formats enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workflows', 'workflow_stages', 'task_statuses', 'content_formats'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ( (select public.is_staff()) )', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($p$create policy %I on public.%I for all
                      using      ( (select public.is_owner_level()) or (select public.has_capability('manage_workflows')) )
                      with check ( (select public.is_owner_level()) or (select public.has_capability('manage_workflows')) )$p$,
                   t || '_write', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Retire, never delete — except a stage, which may be deleted while nothing
-- points at it (Round 2's content items will refuse the delete of a stage
-- they sit in; the app then retires it instead).
revoke delete on public.workflows, public.task_statuses, public.content_formats from authenticated;

-- ---------------------------------------------------------------- proof
-- Expect: 4 of 4 / the two workflows with 11 and 10 stages / none /
-- the six statuses, Completed = done / the six formats / the owner and HR /
-- yes / 1 (site_settings, public on purpose — 0042).

select '0043 tables on the database (expect 4 of 4)' as check,
       (select count(*) from unnest(array['workflows', 'workflow_stages', 'task_statuses', 'content_formats']) t
         where to_regclass('public.' || t) is not null)::text || ' of 4' as result
union all
select 'workflows and their stages (expect Main page reel 11, Fan page reel 10)',
       coalesce((select string_agg(w.name || ' (' || coalesce(w.page_type, 'any page') || '): '
                                   || (select count(*) from public.workflow_stages s where s.workflow_id = w.id and s.is_active)
                                   || ' stages', ' · ' order by w.sort_order)
                   from public.workflows w where w.is_active), 'none')
union all
select 'stages nobody acts on, other than a done one (expect none)',
       coalesce((select string_agg(w.name || ' → ' || s.name, ', ' order by w.sort_order, s.sort_order)
                   from public.workflow_stages s join public.workflows w on w.id = s.workflow_id
                  where s.owner_role_id is null and not s.is_done and s.is_active), 'none')
union all
select 'task statuses, in order (expect 6, Completed = done)',
       (select string_agg(name || case when is_done then ' (done)' else '' end, ' → ' order by sort_order)
          from public.task_statuses where is_active)
union all
select 'content formats (expect 6)',
       (select string_agg(name, ', ' order by sort_order) from public.content_formats where is_active)
union all
select 'logins that may change workflows (expect the owner and HR)',
       coalesce((select string_agg(coalesce(nullif(split_part(p.email, '@', 1), ''), p.id::text), ', ' order by p.email)
                   from public.profiles p
                  where public.has_capability_as(p.id, 'manage_workflows')), 'nobody')
union all
select 'the four new tables are staff-only to read (expect yes)',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and cmd = 'SELECT'
                     and tablename in ('workflows', 'workflow_stages', 'task_statuses', 'content_formats')
                     and qual like '%is_staff%') = 4 then 'yes' else 'NO' end
union all
select 'read rules open to anyone (expect 1 = site_settings, public on purpose)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
