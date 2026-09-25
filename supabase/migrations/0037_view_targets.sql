-- Agency OS, Phase 1, step 3 (AGENCY-OS-PLAN.md §3.2): view targets, their
-- periods, weekly views per channel with a screenshot, adjustments, and one
-- progress view everything reads.
--
-- Run once in the Supabase SQL editor, after 0036. Safe to re-run.
--
-- Built to match both sheets column for column:
--   * Client Master Sheet — TARGET block: a total (750 M) split into periods
--     (April–June 20%, July–Sep 30%, Oct–Dec 50%), with Achieved and Left.
--     Below it, per page and per week: Insta Views, Yt Views, and an SS
--     (screenshot) column.
--   * LavBhusan Target — per week: Followers/Subs, Views (fan pages), Views
--     (main pages), Weekly total, and a running LEFT; with adjustment rows in
--     between ("difference views due to technical issue", "collabrative
--     views", "suspended accounts view") that carry a signed number and a note.

-- ============================================ 1. targets and their periods

create table if not exists public.view_targets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  label       text not null,
  total_views bigint not null check (total_views > 0),
  starts_on   date not null,
  ends_on     date not null,
  -- What counts toward it (Q2). LavBhushan's sheet counts main AND fan pages;
  -- the platforms are the ones whose channels are added up.
  count_main  boolean not null default true,
  count_fan   boolean not null default true,
  platforms   text[] not null default array['instagram','youtube'],
  -- Q4: a week that crosses from one period into the next counts in the
  -- period it STARTS in (the plan's default) or the one it ENDS in.
  -- LavBhushan's sheet does the second — "27 april - 3 may" is the first row
  -- of his May–Aug tab — so it is a setting per target, not a rule in code.
  week_counts_in text not null default 'start' check (week_counts_in in ('start','end')),
  -- Retire, never delete: the weekly numbers that counted toward it stay.
  is_active   boolean not null default true,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint view_targets_dates check (ends_on >= starts_on),
  constraint view_targets_counts_something check (count_main or count_fan),
  constraint view_targets_platforms check (
    cardinality(platforms) > 0 and platforms <@ array['instagram','youtube','facebook']
  )
);

create index if not exists view_targets_client_idx on public.view_targets (client_id);

-- A period's target is its own number if it has one, otherwise total × share.
-- BOTH are kept on purpose: LavBhushan's sheet reads "30% = 400M" of a 1000M
-- target, and 30% of 1000M is 300M (Q3). Keeping both makes either reading
-- visible instead of one silently winning.
create table if not exists public.view_target_periods (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.view_targets(id) on delete cascade,
  label        text not null,
  starts_on    date not null,
  ends_on      date not null,
  share_pct    numeric(5,2) check (share_pct is null or (share_pct > 0 and share_pct <= 100)),
  target_views bigint check (target_views is null or target_views > 0),
  sort_order   int not null default 0,
  constraint view_target_periods_dates check (ends_on >= starts_on),
  constraint view_target_periods_has_goal check (share_pct is not null or target_views is not null)
);

create index if not exists view_target_periods_target_idx on public.view_target_periods (target_id);

-- A week counts in exactly one period (see week_counts_in), so two periods
-- of one target must not overlap — a week would count twice.
--
-- Checked when the save COMMITS, not row by row: moving April–June to
-- April–July and July–Sep to Aug–Sep in one save passes through a moment
-- where they overlap, and that moment is not a mistake.
create or replace function public.guard_target_period()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.view_target_periods where id = new.id)
     and exists (
       select 1 from public.view_target_periods p
        where p.target_id = new.target_id and p.id <> new.id
          and daterange(p.starts_on, p.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
     ) then
    raise exception 'Two periods on this target overlap — a week would count twice.';
  end if;
  return null;
end;
$$;

drop trigger if exists view_target_periods_guard on public.view_target_periods;
create constraint trigger view_target_periods_guard
  after insert or update on public.view_target_periods
  deferrable initially deferred
  for each row execute function public.guard_target_period();

drop trigger if exists view_targets_touch on public.view_targets;
create trigger view_targets_touch
  before update on public.view_targets
  for each row execute function public.touch_updated_at();

create or replace function public.stamp_view_target()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

drop trigger if exists view_targets_stamp on public.view_targets;
create trigger view_targets_stamp
  before insert on public.view_targets
  for each row execute function public.stamp_view_target();

-- ============================================ 2. weekly views — one number per channel per week

-- week_start is a Monday: the sheet's weeks run Monday–Sunday (27 Apr – 3
-- May 2026 starts on a Monday). followers is optional — LavBhushan's sheet
-- tracks followers/subs for some weeks. proof_path is the SS column: a
-- screenshot in the private view-proofs bucket.
create table if not exists public.weekly_views (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.page_channels(id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  views       bigint not null check (views >= 0),
  followers   bigint check (followers is null or followers >= 0),
  proof_path  text,
  entered_by  uuid references public.profiles(id) on delete set null,
  entered_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz,
  unique (channel_id, week_start)
);

create index if not exists weekly_views_week_idx on public.weekly_views (week_start);

create or replace function public.stamp_weekly_views()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.week_start > current_date then
    raise exception 'That week has not started yet.';
  end if;
  if tg_op = 'INSERT' then
    new.entered_by := coalesce(auth.uid(), new.entered_by);
    new.entered_at := now();
    new.updated_by := null;
    new.updated_at := null;
  else
    new.entered_by := old.entered_by;
    new.entered_at := old.entered_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists weekly_views_stamp on public.weekly_views;
create trigger weekly_views_stamp
  before insert or update on public.weekly_views
  for each row execute function public.stamp_weekly_views();

-- Every change to a number that has been entered, kept — the same idea as
-- attendance_edits (0013). No foreign key to the row: a deleted entry's
-- history is exactly what needs to survive it.
create table if not exists public.weekly_view_edits (
  id             uuid primary key default gen_random_uuid(),
  weekly_view_id uuid not null,
  channel_id     uuid not null,
  week_start     date not null,
  action         text not null check (action in ('update','delete')),
  edited_by      uuid references public.profiles(id) on delete set null,
  edited_at      timestamptz not null default now(),
  before_row     jsonb not null,
  after_row      jsonb
);

create index if not exists weekly_view_edits_row_idx on public.weekly_view_edits (weekly_view_id, edited_at desc);

create or replace function public.log_weekly_view_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.views is not distinct from old.views and new.followers is not distinct from old.followers
       and new.proof_path is not distinct from old.proof_path then
      return null;
    end if;
    insert into public.weekly_view_edits (weekly_view_id, channel_id, week_start, action, edited_by, before_row, after_row)
    values (old.id, old.channel_id, old.week_start, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
  else
    insert into public.weekly_view_edits (weekly_view_id, channel_id, week_start, action, edited_by, before_row, after_row)
    values (old.id, old.channel_id, old.week_start, 'delete', auth.uid(), to_jsonb(old), null);
  end if;
  return null;
end;
$$;

drop trigger if exists weekly_views_log_edit on public.weekly_views;
create trigger weekly_views_log_edit
  after update or delete on public.weekly_views
  for each row execute function public.log_weekly_view_edit();

-- ============================================ 3. adjustments

-- The sheet's three, as an editable list (Q5 may add more).
create table if not exists public.view_adjustment_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.view_adjustment_types (name, sort_order)
select v.name, v.sort_order
  from (values ('Difference due to technical issue', 1), ('Collaboration views', 2), ('Suspended account views', 3))
       as v(name, sort_order)
 where not exists (select 1 from public.view_adjustment_types);

-- Signed: suspended-account views go NEGATIVE, exactly as the sheet writes
-- them (-46,424,811). The note carries "jyotidrishti views, zone,
-- Lavbhushanworld views". A week places it in the weekly list; without one it
-- belongs to its period as a whole.
create table if not exists public.view_adjustments (
  id         uuid primary key default gen_random_uuid(),
  target_id  uuid not null references public.view_targets(id) on delete cascade,
  period_id  uuid references public.view_target_periods(id) on delete set null,
  week_start date check (week_start is null or extract(isodow from week_start) = 1),
  type_id    uuid not null references public.view_adjustment_types(id) on delete restrict,
  views      bigint not null check (views <> 0),
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists view_adjustments_target_idx on public.view_adjustments (target_id);

create or replace function public.guard_view_adjustment()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.period_id is not null and not exists (
    select 1 from public.view_target_periods where id = new.period_id and target_id = new.target_id
  ) then
    raise exception 'That period belongs to a different target.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists view_adjustments_guard on public.view_adjustments;
create trigger view_adjustments_guard
  before insert or update on public.view_adjustments
  for each row execute function public.guard_view_adjustment();

-- ============================================ 4. who may read and enter

create or replace function public.target_client(p_target uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select client_id from public.view_targets where id = p_target $$;

create or replace function public.channel_client(p_channel uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select pg.client_id from public.page_channels pc join public.pages pg on pg.id = pc.page_id where pc.id = p_channel
$$;

-- Weekly views are read by the client's own team (an editor on the client
-- reads them), by whoever may see its targets, and by whoever enters them.
create or replace function public.can_read_views(p_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_capability_for_client(p_client, 'view_targets')
      or public.has_capability_for_client(p_client, 'enter_views')
      or public.is_on_client(p_client)
$$;

-- Asked ONCE per query, not once per row: weekly_views grows by a row per
-- channel per week, and a per-row capability check is what would make the
-- grid slow a year from now.
create or replace function public.my_view_clients()
returns setof uuid language sql stable security definer set search_path = public
as $$ select c.id from public.clients c where public.can_read_views(c.id) $$;

-- Entering a number: the department head / management for any channel
-- (enter_views held company-wide or for the client's department), whoever
-- manages the client's targets, or — holding enter_views through a
-- per-client role (SMM) — for the pages they themselves hold. "Enter for
-- their own pages", the plan's §4 table.
create or replace function public.can_enter_views(p_channel uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.has_capability_for_client(pg.client_id, 'manage_targets')
        or public.has_capability_in_department(cl.department_id, 'enter_views')
        or (public.has_capability_for_client(pg.client_id, 'enter_views')
            and exists (select 1 from public.page_assignments pa
                         where pa.page_id = pg.id and pa.employee_id = public.my_employee_id()))
      from public.page_channels pc
      join public.pages pg on pg.id = pc.page_id
      join public.clients cl on cl.id = pg.client_id
     where pc.id = p_channel
  ), false)
$$;

grant execute on function public.can_read_views(uuid)   to authenticated;
grant execute on function public.can_enter_views(uuid)  to authenticated;
grant execute on function public.my_view_clients()      to authenticated;

-- ============================================ 5. row-level security

alter table public.view_targets          enable row level security;
alter table public.view_target_periods   enable row level security;
alter table public.weekly_views          enable row level security;
alter table public.weekly_view_edits     enable row level security;
alter table public.view_adjustment_types enable row level security;
alter table public.view_adjustments      enable row level security;

drop policy if exists view_targets_select on public.view_targets;
create policy view_targets_select on public.view_targets for select
  using ( public.has_capability_for_client(client_id, 'view_targets') );
drop policy if exists view_targets_insert on public.view_targets;
create policy view_targets_insert on public.view_targets for insert
  with check ( public.has_capability_for_client(client_id, 'manage_targets') );
drop policy if exists view_targets_update on public.view_targets;
create policy view_targets_update on public.view_targets for update
  using      ( public.has_capability_for_client(client_id, 'manage_targets') )
  with check ( public.has_capability_for_client(client_id, 'manage_targets') );
revoke delete on public.view_targets from anon, authenticated;

drop policy if exists view_target_periods_select on public.view_target_periods;
create policy view_target_periods_select on public.view_target_periods for select
  using ( public.has_capability_for_client(public.target_client(target_id), 'view_targets') );
drop policy if exists view_target_periods_write on public.view_target_periods;
create policy view_target_periods_write on public.view_target_periods for all
  using      ( public.has_capability_for_client(public.target_client(target_id), 'manage_targets') )
  with check ( public.has_capability_for_client(public.target_client(target_id), 'manage_targets') );

drop policy if exists weekly_views_select on public.weekly_views;
create policy weekly_views_select on public.weekly_views for select
  using ( channel_id in (
    select pc.id from public.page_channels pc
      join public.pages pg on pg.id = pc.page_id
     where pg.client_id in (select public.my_view_clients())
  ) );
drop policy if exists weekly_views_insert on public.weekly_views;
create policy weekly_views_insert on public.weekly_views for insert
  with check ( public.can_enter_views(channel_id) );
drop policy if exists weekly_views_update on public.weekly_views;
create policy weekly_views_update on public.weekly_views for update
  using      ( public.can_enter_views(channel_id) )
  with check ( public.can_enter_views(channel_id) );
-- A wrong number is corrected, not deleted; removing one outright is for
-- whoever manages the client's targets.
drop policy if exists weekly_views_delete on public.weekly_views;
create policy weekly_views_delete on public.weekly_views for delete
  using ( public.has_capability_for_client(public.channel_client(channel_id), 'manage_targets') );

drop policy if exists weekly_view_edits_select on public.weekly_view_edits;
create policy weekly_view_edits_select on public.weekly_view_edits for select
  using ( public.can_read_views(public.channel_client(channel_id)) );
revoke insert, update, delete on public.weekly_view_edits from anon, authenticated;

drop policy if exists view_adjustment_types_select on public.view_adjustment_types;
create policy view_adjustment_types_select on public.view_adjustment_types for select using ( auth.uid() is not null );
drop policy if exists view_adjustment_types_write on public.view_adjustment_types;
create policy view_adjustment_types_write on public.view_adjustment_types for all
  using      ( public.has_capability('manage_settings') )
  with check ( public.has_capability('manage_settings') );
revoke delete on public.view_adjustment_types from anon, authenticated;

-- Q5 asks who may add one; the default is whoever manages the client's
-- targets — the department head and management.
drop policy if exists view_adjustments_select on public.view_adjustments;
create policy view_adjustments_select on public.view_adjustments for select
  using ( public.has_capability_for_client(public.target_client(target_id), 'view_targets') );
drop policy if exists view_adjustments_write on public.view_adjustments;
create policy view_adjustments_write on public.view_adjustments for all
  using      ( public.has_capability_for_client(public.target_client(target_id), 'manage_targets') )
  with check ( public.has_capability_for_client(public.target_client(target_id), 'manage_targets') );

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.weekly_views'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- A target and all its periods in one save — one transaction, so the
-- overlap check above sees only the finished list. security invoker: every
-- statement inside still goes through the caller's own RLS.
create or replace function public.save_view_target(p_target jsonb, p_periods jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id   uuid := public.try_uuid(nullif(p_target->>'id', ''));
  v_keep uuid[] := '{}';
  p      jsonb;
begin
  if v_id is null then
    insert into public.view_targets
      (client_id, label, total_views, starts_on, ends_on, count_main, count_fan, platforms, week_counts_in, notes)
    values (
      (p_target->>'client_id')::uuid, p_target->>'label', (p_target->>'total_views')::bigint,
      (p_target->>'starts_on')::date, (p_target->>'ends_on')::date,
      (p_target->>'count_main')::boolean, (p_target->>'count_fan')::boolean,
      array(select jsonb_array_elements_text(p_target->'platforms')),
      coalesce(p_target->>'week_counts_in', 'start'), nullif(p_target->>'notes', '')
    )
    returning id into v_id;
  else
    update public.view_targets set
      label = p_target->>'label',
      total_views = (p_target->>'total_views')::bigint,
      starts_on = (p_target->>'starts_on')::date,
      ends_on = (p_target->>'ends_on')::date,
      count_main = (p_target->>'count_main')::boolean,
      count_fan = (p_target->>'count_fan')::boolean,
      platforms = array(select jsonb_array_elements_text(p_target->'platforms')),
      week_counts_in = coalesce(p_target->>'week_counts_in', 'start'),
      notes = nullif(p_target->>'notes', '')
     where id = v_id;
    if not found then
      raise exception 'You do not have permission to change this target.';
    end if;
  end if;

  for p in select * from jsonb_array_elements(coalesce(p_periods, '[]'::jsonb)) loop
    if public.try_uuid(nullif(p->>'id', '')) is not null then
      v_keep := v_keep || public.try_uuid(p->>'id');
    end if;
  end loop;
  delete from public.view_target_periods where target_id = v_id and not (id = any (v_keep));

  for p in select * from jsonb_array_elements(coalesce(p_periods, '[]'::jsonb)) loop
    if public.try_uuid(nullif(p->>'id', '')) is null then
      insert into public.view_target_periods (target_id, label, starts_on, ends_on, share_pct, target_views, sort_order)
      values (v_id, p->>'label', (p->>'starts_on')::date, (p->>'ends_on')::date,
              nullif(p->>'share_pct', '')::numeric, nullif(p->>'target_views', '')::bigint, coalesce((p->>'sort_order')::int, 0));
    else
      update public.view_target_periods set
        label = p->>'label', starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date,
        share_pct = nullif(p->>'share_pct', '')::numeric, target_views = nullif(p->>'target_views', '')::bigint,
        sort_order = coalesce((p->>'sort_order')::int, 0)
       where id = public.try_uuid(p->>'id') and target_id = v_id;
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_view_target(jsonb, jsonb) from public, anon;
grant execute on function public.save_view_target(jsonb, jsonb) to authenticated;

-- ============================================ 6. the screenshots — a private bucket

-- Private, never public, like employee-documents (0011). Path:
-- "<channel id>/<week start>-<time>.jpg", so a policy reads the channel off
-- the first folder and asks the same questions the table does.
insert into storage.buckets (id, name, public)
values ('view-proofs', 'view-proofs', false)
on conflict (id) do nothing;

drop policy if exists view_proofs_select on storage.objects;
create policy view_proofs_select on storage.objects for select
  using ( bucket_id = 'view-proofs'
          and public.can_read_views(public.channel_client(public.try_uuid((storage.foldername(name))[1]))) );

drop policy if exists view_proofs_insert on storage.objects;
create policy view_proofs_insert on storage.objects for insert
  with check ( bucket_id = 'view-proofs'
               and public.can_enter_views(public.try_uuid((storage.foldername(name))[1])) );

drop policy if exists view_proofs_delete on storage.objects;
create policy view_proofs_delete on storage.objects for delete
  using ( bucket_id = 'view-proofs'
          and public.can_enter_views(public.try_uuid((storage.foldername(name))[1])) );

-- ============================================ 7. v_target_progress — the one set of numbers

-- security_invoker: it reads through the caller's own RLS, so nobody sees a
-- total built from numbers they could not read one by one. Nothing is stored
-- twice: the grid, every dashboard and the sheet check all read this.
-- src/react/lib/targets.ts computes the same rules for the app's demo mode
-- (there is no database there) — keep the two in step.
--
-- One row per target (grain 'target'), per period ('period') and per week
-- of every period ('week', empty weeks included, so the grid has no holes):
--   goal            the target (a period's override, else total × share)
--   views_fan/main  the main/fan split; views_instagram/youtube/facebook the
--                   platform split — only what counts toward this target
--   adjustments     signed, as entered
--   achieved        views + adjustments
--   left_views      goal − achieved (negative once it is beaten)
--   running_left    week grain only: the period's LEFT column after this week
--   elapsed_share   how much of the time has gone, 0–1
--   achieved_share  how much of the goal is done, 0–1+

create or replace view public.v_target_progress
with (security_invoker = true) as
with
counted as (
  select t.id as target_id, wv.week_start, wv.views, pg.page_type, pc.platform
    from public.view_targets t
    join public.pages pg on pg.client_id = t.client_id
    join public.page_channels pc on pc.page_id = pg.id
    join public.weekly_views wv on wv.channel_id = pc.id
   where wv.week_start + case t.week_counts_in when 'end' then 6 else 0 end between t.starts_on and t.ends_on
     and pc.platform = any (t.platforms)
     and case pg.page_type when 'main' then t.count_main else t.count_fan end
),
per_week as (
  select target_id, week_start,
         coalesce(sum(views) filter (where page_type = 'fan'), 0)          as views_fan,
         coalesce(sum(views) filter (where page_type = 'main'), 0)         as views_main,
         coalesce(sum(views) filter (where platform = 'instagram'), 0)     as views_instagram,
         coalesce(sum(views) filter (where platform = 'youtube'), 0)       as views_youtube,
         coalesce(sum(views) filter (where platform = 'facebook'), 0)      as views_facebook,
         sum(views)                                                         as views
    from counted
   group by target_id, week_start
),
periods as (
  select p.id, p.target_id, p.starts_on, p.ends_on,
         coalesce(p.target_views, round(t.total_views * p.share_pct / 100.0)::bigint) as goal,
         case t.week_counts_in when 'end' then 6 else 0 end as anchor
    from public.view_target_periods p
    join public.view_targets t on t.id = p.target_id
),
-- An adjustment belongs to its own period, else the period its week counts in.
adj as (
  select a.target_id, a.week_start, a.views,
         coalesce(a.period_id, (
           select pr.id from periods pr
            where pr.target_id = a.target_id
              and a.week_start + pr.anchor between pr.starts_on and pr.ends_on
            order by pr.starts_on limit 1
         )) as period_id
    from public.view_adjustments a
),
-- Every Monday whose week counts in the period: the first one on or after
-- (start − anchor), up to (end − anchor).
weeks as (
  select pr.target_id, pr.id as period_id, pr.goal, gs::date as week_start
    from periods pr
    cross join lateral generate_series(
      ((pr.starts_on - pr.anchor) + ((8 - extract(isodow from pr.starts_on - pr.anchor)::int) % 7))::timestamp,
      (pr.ends_on - pr.anchor)::timestamp, interval '7 days') gs
),
week_rows as (
  select w.target_id, w.period_id, w.week_start, w.goal,
         coalesce(pw.views_fan, 0) as views_fan, coalesce(pw.views_main, 0) as views_main,
         coalesce(pw.views_instagram, 0) as views_instagram, coalesce(pw.views_youtube, 0) as views_youtube,
         coalesce(pw.views_facebook, 0) as views_facebook, coalesce(pw.views, 0) as views,
         coalesce((select sum(a.views) from adj a
                    where a.target_id = w.target_id and a.period_id = w.period_id and a.week_start = w.week_start), 0) as adjustments
    from weeks w
    left join per_week pw on pw.target_id = w.target_id and pw.week_start = w.week_start
)
select 'target'::text as grain, t.id as target_id, t.client_id, null::uuid as period_id, null::date as week_start,
       t.total_views as goal,
       coalesce(s.views_fan, 0) as views_fan, coalesce(s.views_main, 0) as views_main,
       coalesce(s.views_instagram, 0) as views_instagram, coalesce(s.views_youtube, 0) as views_youtube,
       coalesce(s.views_facebook, 0) as views_facebook,
       coalesce((select sum(a.views) from adj a where a.target_id = t.id), 0) as adjustments,
       coalesce(s.views, 0) + coalesce((select sum(a.views) from adj a where a.target_id = t.id), 0) as achieved,
       t.total_views - coalesce(s.views, 0) - coalesce((select sum(a.views) from adj a where a.target_id = t.id), 0) as left_views,
       null::bigint as running_left,
       greatest(0, least(1, (current_date - t.starts_on + 1)::numeric / (t.ends_on - t.starts_on + 1))) as elapsed_share,
       (coalesce(s.views, 0) + coalesce((select sum(a.views) from adj a where a.target_id = t.id), 0))::numeric / t.total_views as achieved_share
  from public.view_targets t
  left join (
    select target_id, sum(views_fan) as views_fan, sum(views_main) as views_main,
           sum(views_instagram) as views_instagram, sum(views_youtube) as views_youtube,
           sum(views_facebook) as views_facebook, sum(views) as views
      from per_week group by target_id
  ) s on s.target_id = t.id
union all
select 'period', pr.target_id, t.client_id, pr.id, null::date, pr.goal,
       coalesce(sum(wr.views_fan), 0), coalesce(sum(wr.views_main), 0),
       coalesce(sum(wr.views_instagram), 0), coalesce(sum(wr.views_youtube), 0), coalesce(sum(wr.views_facebook), 0),
       coalesce((select sum(a.views) from adj a where a.period_id = pr.id), 0),
       coalesce(sum(wr.views), 0) + coalesce((select sum(a.views) from adj a where a.period_id = pr.id), 0),
       pr.goal - coalesce(sum(wr.views), 0) - coalesce((select sum(a.views) from adj a where a.period_id = pr.id), 0),
       null::bigint,
       greatest(0, least(1, (current_date - pr.starts_on + 1)::numeric / (pr.ends_on - pr.starts_on + 1))),
       case when pr.goal > 0 then
         (coalesce(sum(wr.views), 0) + coalesce((select sum(a.views) from adj a where a.period_id = pr.id), 0))::numeric / pr.goal
       end
  from periods pr
  join public.view_targets t on t.id = pr.target_id
  left join week_rows wr on wr.period_id = pr.id
 group by pr.target_id, t.client_id, pr.id, pr.goal, pr.starts_on, pr.ends_on
union all
select 'week', wr.target_id, t.client_id, wr.period_id, wr.week_start, wr.goal,
       wr.views_fan, wr.views_main, wr.views_instagram, wr.views_youtube, wr.views_facebook,
       wr.adjustments, wr.views + wr.adjustments,
       null::bigint,
       wr.goal - sum(wr.views + wr.adjustments) over (partition by wr.period_id order by wr.week_start),
       null::numeric, null::numeric
  from week_rows wr
  join public.view_targets t on t.id = wr.target_id;

grant select on public.v_target_progress to authenticated;

-- ============================================ 8. the Monday reminder

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('broadcast','birthday','shift_reminder','visit_request','wfh_request','incentive_claim','views_reminder'));

-- No scheduler on this plan (INCENTIVE-AUTOMATION-PLAN.md), so this is the
-- same "screen load is the cron tick" trick check_todays_birthdays() uses
-- (0025): the app calls it on open, and it does real work at most once a
-- week per person. It asks for the week that most recently ENDED (last
-- Monday to last Sunday), and only of people who hold a page with a live
-- channel that has no number for that week yet.
create or replace function public.remind_weekly_views()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone coalesce((select timezone from public.attendance_settings limit 1), 'Asia/Kolkata'))::date;
  v_week  date := (date_trunc('week', v_today)::date) - 7;
  n int;
begin
  insert into public.notifications (recipient_employee_id, type, title, body)
  select e.id, 'views_reminder',
         'Weekly views are due',
         'Enter views for ' || to_char(v_week, 'FMDD Mon') || ' – ' || to_char(v_week + 6, 'FMDD Mon')
           || ' on ' || count(distinct pc.id) || case when count(distinct pc.id) = 1 then ' channel.' else ' channels.' end
    from public.employees e
    join public.page_assignments pa on pa.employee_id = e.id
    join public.pages pg on pg.id = pa.page_id and pg.is_active
    join public.clients cl on cl.id = pg.client_id and cl.is_active
    join public.page_channels pc on pc.page_id = pg.id and pc.is_active
   where e.status = 'active'
     and not exists (select 1 from public.weekly_views wv where wv.channel_id = pc.id and wv.week_start = v_week)
     and not exists (select 1 from public.notifications x
                      where x.recipient_employee_id = e.id and x.type = 'views_reminder'
                        and x.created_at >= (v_week + 7)::timestamp)
   group by e.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.remind_weekly_views() from public, anon;
grant execute on function public.remind_weekly_views() to authenticated;

-- ============================================ 9. proof

select 'target tables' as check,
       (select count(*) from pg_class where relname in ('view_targets','view_target_periods','weekly_views','weekly_view_edits','view_adjustment_types','view_adjustments'))::text || ' of 6' as result
union all
select 'adjustment types seeded', (select count(*) from public.view_adjustment_types)::text
union all
select 'progress view reads through RLS',
       (select case when coalesce(reloptions::text, '') like '%security_invoker=true%' then 'yes' else 'NO' end
          from pg_class where relname = 'v_target_progress')
union all
select 'view-proofs bucket (private)',
       coalesce((select case when public then 'PUBLIC — should not be' else 'private' end from storage.buckets where id = 'view-proofs'), 'missing')
union all
select 'weekly views policies', (select count(*) from pg_policies where tablename = 'weekly_views')::text
union all
select 'notifications accepts views_reminder',
       (select (pg_get_constraintdef(oid) like '%views_reminder%')::text from pg_constraint where conname = 'notifications_type_check');
