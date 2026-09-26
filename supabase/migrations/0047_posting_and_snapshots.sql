-- 0047 — Phase 2, Round 5: posting closes the loop; reel views on their own (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0046. Safe to re-run.
--
-- AGENCY-OS-PLAN.md §5 and §9 (Round 5), plus what Adarsh asked for on
-- 26 Sep ("nothing typed by hand that the system can work out"):
--
--   1. POSTING. The SMM pastes the post link on the reel (post_content_item()):
--      the reel is finished (it moves to its workflow's finish, "Posted"),
--      and the link's short code ties it to everything else that knows the
--      reel — the page's fetched reels (views), incentive claims (who claimed
--      it), the by-link view lookup. A posted reel shows its views without
--      anyone typing a number.
--   2. ONE REEL, ONE CLAIM (Q16's default). A claim learns its reel's short
--      code; a second claim on a reel somebody already claimed is FLAGGED for
--      HR (duplicate_of), not refused — the first claim wins, HR decides.
--   3. REEL VIEW SNAPSHOTS. Every time a reel's views are read (the page
--      refresh, the claim check) the day's figure is kept — one row per reel
--      per day. The weekly view below is worked out from those rows: a reel's
--      views at the next Monday's reading minus at this Monday's, added up
--      per page. Public numbers only: Instagram's own "account views"
--      (Insights) is visible to the account holder alone, so the sheet's
--      weekly number still comes from the SMM until Meta access is set up —
--      the app shows this figure beside it, one tap to use it.
--
-- Nothing already on the database changes except three new columns on
-- content_items, two on incentive_claims, and one trigger on each of
-- page_reels and incentive_claims.

-- ============================================ 0. stop before changing anything

do $$
begin
  if to_regclass('public.shoots') is null or to_regclass('public.page_reels') is null
     or to_regclass('public.incentive_claims') is null then
    raise exception '0047 needs 0046 (and 0031, 0034) first — nothing was changed.';
  end if;
end $$;

-- ============================================ 1. a link's short code

-- lib/hr.ts reelShortCode(), restated: instagram.com/reel/ABC, /p/ABC,
-- /tv/ABC, /<handle>/reel/ABC → ABC. A /share/ link hides it → null.
create or replace function public.ig_short_code(p_url text)
returns text language sql immutable set search_path = public as $$
  select case when p_url is null or p_url ~* '/share/' then null
              else (regexp_match(p_url, 'instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]+)', 'i'))[1] end
$$;

-- ============================================ 2. a posted reel

alter table public.content_items add column if not exists posted_url text
  check (posted_url is null or (posted_url ~* '^https?://[^[:space:]]+$' and length(posted_url) <= 2000));
alter table public.content_items add column if not exists post_short_code text;
alter table public.content_items add column if not exists posted_at timestamptz;
create index if not exists content_items_post_code on public.content_items (post_short_code) where post_short_code is not null;

-- The code and the time follow the link, however it was written.
create or replace function public.content_item_post_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.posted_url is distinct from old.posted_url then
    new.posted_url := nullif(btrim(coalesce(new.posted_url, '')), '');
    new.post_short_code := public.ig_short_code(new.posted_url);
    new.posted_at := case when new.posted_url is null then null
                          else coalesce(case when tg_op = 'UPDATE' and old.posted_url is not null then old.posted_at end, now()) end;
  else
    new.post_short_code := old.post_short_code;
    new.posted_at := old.posted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_post_before on public.content_items;
create trigger content_items_post_before
  before insert or update on public.content_items
  for each row execute function public.content_item_post_before();

-- The one door for posting: the link, and the reel is finished. An empty
-- link takes the post back off (the reel stays where it is).
create or replace function public.post_content_item(p_item uuid, p_url text)
returns public.content_items
language plpgsql security definer set search_path = public as $$
declare
  it     public.content_items;
  v_url  text := nullif(btrim(coalesce(p_url, '')), '');
  v_code text;
  v_fin  uuid;
  v_dup  text;
begin
  if not public.is_staff() then raise exception 'Only staff can post.'; end if;
  select * into it from public.content_items where id = p_item for update;
  if not found then raise exception 'That item no longer exists.'; end if;
  if not (public.can_edit_work(it.client_id) or public.works_on_item(it.id)) then
    raise exception 'Only the client''s team, or whoever works on this reel, can post it.';
  end if;
  if v_url is null then
    update public.content_items set posted_url = null where id = it.id returning * into it;
    return it;
  end if;
  if v_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Paste the whole post link — it starts with https://';
  end if;
  v_code := public.ig_short_code(v_url);
  if v_url ~* 'instagram\.com' and v_code is null then
    raise exception 'That Instagram link hides the reel — open the reel and copy its link (instagram.com/reel/…), not a share link.';
  end if;
  v_dup := (select o.code from public.content_items o where o.post_short_code = v_code and o.id <> it.id limit 1);
  if v_code is not null and v_dup is not null then
    raise exception 'That reel is already posted as %.', v_dup;
  end if;

  update public.content_items set posted_url = v_url where id = it.id;
  if not (select s.is_done from public.workflow_stages s where s.id = it.stage_id) then
    v_fin := (select s.id from public.workflow_stages s
               where s.workflow_id = it.workflow_id and s.is_active and s.is_done
               order by s.sort_order, s.name limit 1);
    if v_fin is not null then
      perform set_config('metrol.move_note', 'Posted', true);
      update public.content_items set stage_id = v_fin where id = it.id;
      perform set_config('metrol.move_note', '', true);
    end if;
  end if;
  select * into it from public.content_items where id = p_item;
  return it;
end;
$$;
revoke all on function public.post_content_item(uuid, text) from public, anon;
grant execute on function public.post_content_item(uuid, text) to authenticated;

-- ============================================ 3. one reel, one claim

alter table public.incentive_claims add column if not exists short_code text;
alter table public.incentive_claims add column if not exists duplicate_of uuid references public.incentive_claims(id) on delete set null;
create index if not exists incentive_claims_code on public.incentive_claims (short_code) where short_code is not null;

-- The earliest other claim on the same reel that HR has not rejected.
create or replace function public.claim_first_on(p_code text, p_id uuid, p_at timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.incentive_claims c
   where p_code is not null and c.short_code = p_code and c.id <> p_id and not c.rejected
     and (c.created_at < p_at or (c.created_at = p_at and c.id < p_id))
   order by c.created_at, c.id limit 1
$$;

create or replace function public.incentive_claim_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.reel_url is distinct from old.reel_url then
    new.short_code := public.ig_short_code(new.reel_url);
    new.duplicate_of := public.claim_first_on(new.short_code, new.id, new.created_at);
  end if;
  return new;
end;
$$;

drop trigger if exists incentive_claims_code on public.incentive_claims;
create trigger incentive_claims_code
  before insert or update of reel_url on public.incentive_claims
  for each row execute function public.incentive_claim_code();

-- The claims already on file learn their reel (only where not yet known).
update public.incentive_claims set short_code = public.ig_short_code(reel_url)
 where short_code is null and public.ig_short_code(reel_url) is not null;
update public.incentive_claims c set duplicate_of = public.claim_first_on(c.short_code, c.id, c.created_at)
 where c.short_code is not null and c.duplicate_of is null
   and public.claim_first_on(c.short_code, c.id, c.created_at) is not null;

-- ============================================ 4. reel view snapshots

create table if not exists public.page_reel_snapshots (
  page_reel_id uuid not null references public.page_reels(id) on delete cascade,
  page_id      uuid not null references public.pages(id) on delete cascade,
  -- the office's calendar day
  taken_on     date not null,
  views        bigint not null check (views >= 0),
  taken_at     timestamptz not null default now(),
  primary key (page_reel_id, taken_on)
);
create index if not exists page_reel_snapshots_page on public.page_reel_snapshots (page_id, taken_on);

create or replace function public.office_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.attendance_settings limit 1), 'Asia/Kolkata'))::date
$$;

-- Whenever a reel's views are written, the day keeps its highest reading.
create or replace function public.page_reel_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.views is null or new.views < 0 then return null; end if;
  insert into public.page_reel_snapshots (page_reel_id, page_id, taken_on, views, taken_at)
  values (new.id, new.page_id, public.office_today(), new.views, now())
  on conflict (page_reel_id, taken_on) do update
    set views = greatest(public.page_reel_snapshots.views, excluded.views), taken_at = excluded.taken_at;
  return null;
end;
$$;

drop trigger if exists page_reels_snapshot on public.page_reels;
create trigger page_reels_snapshot
  after insert or update of views on public.page_reels
  for each row execute function public.page_reel_snapshot();

-- What is on file today is the first snapshot.
insert into public.page_reel_snapshots (page_reel_id, page_id, taken_on, views, taken_at)
select r.id, r.page_id,
       (coalesce(r.fetched_at, now()) at time zone coalesce((select timezone from public.attendance_settings limit 1), 'Asia/Kolkata'))::date,
       r.views, coalesce(r.fetched_at, now())
  from public.page_reels r
 where r.views is not null and r.views >= 0
on conflict (page_reel_id, taken_on) do nothing;

-- Views gained per page per week (Monday–Sunday), measured Monday to Monday:
-- for each reel, its first reading AFTER the week (the next Monday's, when
-- somebody opens "This week") minus its first reading IN the week (this
-- Monday's). Readings come whenever a page's reels are read — mostly Mondays
-- — so a week is measured between the two boundary readings, never from a
-- mid-week one that would put last week's views into this week. Also:
--   * no reading in the week yet: the latest one from the weekend before it;
--   * no reading after the week yet (the week still running): its last one;
--   * a reel posted in the week counts whole;
--   * a reel with no start or no end is counted as unmeasured, never guessed;
--   * reels no longer read (fallen off the page's newest 25) drop out.
-- Runs as the caller (page rules apply).
create or replace view public.v_page_week_views with (security_invoker = true) as
with weeks as (
  select distinct s.page_id, date_trunc('week', s.taken_on)::date as week_start
    from public.page_reel_snapshots s
),
per_reel as (
  select w.page_id, w.week_start,
         coalesce((r.posted_at at time zone 'Asia/Kolkata')::date >= w.week_start, false) as posted_in_week,
         coalesce(
           (select s.views from public.page_reel_snapshots s
             where s.page_reel_id = r.id and s.taken_on >= w.week_start and s.taken_on < w.week_start + 7
             order by s.taken_on limit 1),
           (select s.views from public.page_reel_snapshots s
             where s.page_reel_id = r.id and s.taken_on >= w.week_start - 2 and s.taken_on < w.week_start
             order by s.taken_on desc limit 1)) as start_views,
         coalesce(
           (select s.views from public.page_reel_snapshots s
             where s.page_reel_id = r.id and s.taken_on >= w.week_start + 7
             order by s.taken_on limit 1),
           (select s.views from public.page_reel_snapshots s
             where s.page_reel_id = r.id and s.taken_on >= w.week_start and s.taken_on < w.week_start + 7
             order by s.taken_on desc limit 1)) as end_views
    from weeks w
    join public.page_reels r on r.page_id = w.page_id
   where (r.posted_at is null or (r.posted_at at time zone 'Asia/Kolkata')::date < w.week_start + 7)
     and exists (select 1 from public.page_reel_snapshots s where s.page_reel_id = r.id and s.taken_on >= w.week_start - 2)
)
select page_id, week_start,
       coalesce(sum(case when end_views is null then null
                         when posted_in_week then end_views
                         when start_views is not null then greatest(end_views - start_views, 0) end), 0)::bigint as views_gained,
       (count(*) filter (where end_views is null or (not posted_in_week and start_views is null)))::int as reels_unmeasured,
       count(*)::int as reels
  from per_reel
 group by page_id, week_start;

alter table public.page_reel_snapshots enable row level security;
drop policy if exists page_reel_snapshots_select on public.page_reel_snapshots;
create policy page_reel_snapshots_select on public.page_reel_snapshots for select
  using ( (select public.is_staff()) );
-- Written only by the trigger above.
revoke insert, update, delete on public.page_reel_snapshots from authenticated;
revoke all on public.page_reel_snapshots, public.v_page_week_views from anon;
grant select on public.page_reel_snapshots, public.v_page_week_views to authenticated;

revoke all on function public.ig_short_code(text), public.claim_first_on(text, uuid, timestamptz), public.office_today()
  from public, anon;
grant execute on function public.ig_short_code(text), public.office_today() to authenticated;
revoke all on function public.claim_first_on(text, uuid, timestamptz) from authenticated;

-- ---------------------------------------------------------------- proof
-- Expect: yes / yes / how many claims share a reel (0 is good news) / the
-- reels on file with a first snapshot / yes / 1.

select 'posting a reel finishes it and ties it to its views (expect yes)' as check,
       case when to_regprocedure('public.post_content_item(uuid, text)') is not null
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                          and table_name = 'content_items' and column_name = 'post_short_code')
            then 'yes' else 'NO' end as result
union all
select 'the short code reads Instagram links like the app does (expect yes)',
       case when public.ig_short_code('https://www.instagram.com/reel/C8xYz_1-a/?igsh=abc') = 'C8xYz_1-a'
             and public.ig_short_code('https://instagram.com/somepage/p/Abc123/') = 'Abc123'
             and public.ig_short_code('https://www.instagram.com/share/reel/xyz') is null
            then 'yes' else 'NO' end
union all
select 'claims that share a reel with an earlier claim (flagged for HR)',
       (select count(*) from public.incentive_claims where duplicate_of is not null)::text
       || ' of ' || (select count(*) from public.incentive_claims)::text || ' claims'
union all
select 'reels with a first view snapshot',
       (select count(distinct page_reel_id) from public.page_reel_snapshots)::text
       || ' of ' || (select count(*) from public.page_reels where views is not null)::text
union all
select 'a reel''s views are kept every time they are read (expect yes)',
       case when exists (select 1 from pg_trigger where tgname = 'page_reels_snapshot' and not tgisinternal) then 'yes' else 'NO' end
union all
select 'read rules open to anyone (expect 1 = site_settings, public on purpose)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL')
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
