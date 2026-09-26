-- Things made by hand on the LIVE database, outside any migration, so the
-- replay matches live. Loaded right after 0039.
-- site_settings: found by 0040's proof (2026-09-26); rule names as on live.
create table if not exists public.site_settings (id int primary key default 1, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
alter table public.site_settings enable row level security;
drop policy if exists "public can read settings" on public.site_settings;
create policy "public can read settings" on public.site_settings for select using ( true );
drop policy if exists "authenticated can update settings" on public.site_settings;
create policy "authenticated can update settings" on public.site_settings for update to authenticated using ( true ) with check ( true );
insert into public.site_settings (id) values (1) on conflict do nothing;
