-- Per-reel analytics (PAGE-ANALYTICS-DASHBOARD-PLAN.md, 2026-09-22 brief).
-- One row per reel Apify has fetched for a page — a cache, not a ledger:
-- re-fetching overwrites the numbers for a reel already on file rather than
-- duplicating it (unique on page_id, short_code).
--
-- Run once in the Supabase SQL editor, after 0033. Safe to re-run.

create table if not exists public.page_reels (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,
  short_code    text not null,
  reel_url      text not null,
  caption       text,
  views         bigint,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  thumbnail_url text,
  posted_at     timestamptz,
  fetched_at    timestamptz not null default now(),
  unique (page_id, short_code)
);

create index if not exists page_reels_page_idx on public.page_reels (page_id);
create index if not exists page_reels_views_idx on public.page_reels (views desc);

alter table public.page_reels enable row level security;

drop policy if exists page_reels_select on public.page_reels;
create policy page_reels_select on public.page_reels for select using ( true );

-- In practice only fetch-page-reels (service role) ever writes this table —
-- RLS still names who WOULD be allowed to, same three people as pages_write
-- (0033), so a policy exists rather than being silently absent.
drop policy if exists page_reels_write on public.page_reels;
create policy page_reels_write on public.page_reels for all
  using      ( public.is_owner() or public.is_hr() or public.leads_content_marketing() )
  with check ( public.is_owner() or public.is_hr() or public.leads_content_marketing() );

revoke delete on public.page_reels from anon, authenticated;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.page_reels'; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ============================================ proof

select 'page_reels table' as check, (select count(*) from pg_class where relname = 'page_reels')::text as result
union all
select 'page_reels_write mentions leads_content_marketing',
       (pg_get_expr(polqual, polrelid) like '%leads_content_marketing%')::text
  from pg_policy where polname = 'page_reels_write' and polrelid = 'public.page_reels'::regclass;
