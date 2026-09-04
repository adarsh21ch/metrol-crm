-- The history trail behind the lead drawer and the Recent activity feed.
-- Run this after 0001, in the Supabase SQL editor.

alter table public.projects
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.events (
  id       bigserial primary key,
  lead_id  uuid not null references public.leads(id) on delete cascade,
  what     text not null,
  from_val text not null default '',
  to_val   text not null default '',
  by_name  text not null default '—',
  at       timestamptz not null default now()
);

create index if not exists events_lead_idx on public.events (lead_id, at);

alter table public.events enable row level security;

-- An event is readable by whoever can read the lead it belongs to, and
-- writable by whoever can write that lead. Rather than restate the rules, the
-- policies defer to the lead's own — so the two can never disagree.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using ( exists (select 1 from public.leads l where l.id = lead_id) );

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert
  with check ( exists (select 1 from public.leads l where l.id = lead_id) );

-- History is a record. Nothing edits or deletes it from the app.
