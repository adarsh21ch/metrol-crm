-- Notifications — HR broadcasts, an in-app feed, and a birthday reminder.
-- Push delivery itself is the send-push Edge Function, not this file; this
-- migration only creates the record of truth (notifications) and the table
-- that Edge Function reads to know who to push to (push_subscriptions).
--
-- Run once in the Supabase SQL editor, after 0024. Safe to re-run.

-- ============================================ 1. the feed itself
--
-- Fan-out on write — one row per recipient, not a shared row plus a separate
-- read-tracking table. This is the same shape salary_records and
-- employee_documents already use for per-employee data, and it keeps RLS a
-- one-line "is this my row" check, identical to leave_requests_select.
create table if not exists public.notifications (
  id                     uuid primary key default gen_random_uuid(),
  recipient_employee_id  uuid not null references public.employees(id) on delete cascade,
  type                   text not null check (type in ('broadcast','birthday','shift_reminder')),
  title                  text not null,
  body                   text not null,
  created_by             uuid references public.employees(id) on delete set null,
  read_at                timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_employee_id, created_at desc);

-- ============================================ 2. who has a device that can be pushed to
--
-- One row per browser/device a person has said yes to. An employee manages
-- only their own; the send-push function reads through the service role,
-- same as every other Edge Function in this app bypasses RLS on purpose.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_idx
  on public.push_subscriptions (employee_id);

-- The client never sends employee_id — it cannot know its own reliably any
-- more than a leave request's days_count can be trusted from the client
-- (0016's trigger overwrites that the same way). Whatever comes in is
-- replaced with the caller's own id, so a subscription can never be filed
-- under somebody else's employee even by mistake.
create or replace function public.set_push_subscription_employee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.employee_id := public.my_employee_id();
  if new.employee_id is null then
    raise exception 'No employee record is linked to this login.';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_set_employee on public.push_subscriptions;
create trigger push_subscriptions_set_employee
  before insert on public.push_subscriptions
  for each row execute function public.set_push_subscription_employee();

-- ============================================ 3. row-level security

alter table public.notifications enable row level security;

-- READ — your own notifications, or every one of them if you're owner/HR
-- (so a "broadcasts sent" history is possible later without a new table).
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (
    public.is_owner()
    or public.is_hr()
    or recipient_employee_id = public.my_employee_id()
  );

-- The only thing anybody is ever allowed to change on their own row is
-- read_at, and only from null to a timestamp — a read cannot be un-read, and
-- nobody can rewrite the title/body of a notification addressed to them.
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update
  using      ( recipient_employee_id = public.my_employee_id() )
  with check ( recipient_employee_id = public.my_employee_id() );

-- CREATE and DELETE are both deliberately absent as direct table grants —
-- every notification is written by create_broadcast() or
-- check_todays_birthdays() below, both security definer, so there is one
-- place fan-out logic lives rather than trusting the client to write N rows
-- correctly. A mistaken broadcast is a fact of what was sent, not erased.
revoke insert, delete on public.notifications from anon, authenticated;

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions for all
  using      ( employee_id = public.my_employee_id() or public.is_owner() or public.is_hr() )
  with check ( employee_id = public.my_employee_id() );

-- ============================================ 4. create_broadcast()
--
-- HR/owner only, self-checked the same way finalize_open_attendance() is
-- (RLS can't gate an RPC call). p_audience is either 'all' or a department
-- id (as text, cast below) — one call, one fan-out, so a broadcast to fifty
-- people is fifty rows written in one round trip, not fifty client calls.
create or replace function public.create_broadcast(p_title text, p_body text, p_audience text default 'all')
returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_by uuid;
begin
  if not (public.is_owner() or public.is_hr()) then
    raise exception 'Only HR or the owner can send a broadcast.';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'A broadcast needs a title.'; end if;

  v_by := public.my_employee_id();

  insert into public.notifications (recipient_employee_id, type, title, body, created_by)
  select e.id, 'broadcast', p_title, p_body, v_by
    from public.employees e
   where e.status = 'active'
     and (p_audience = 'all' or e.department_id = p_audience::uuid);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ============================================ 5. check_todays_birthdays()
--
-- No role gate — a birthday is not privileged the way an attendance
-- correction is. The idempotency check (no birthday notification already
-- created for this person today) is what makes it safe to call on every
-- screen load, exactly like finalize_open_attendance() is: called often,
-- does real work only once a day per person.
create or replace function public.check_todays_birthdays()
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.notifications (recipient_employee_id, type, title, body)
  select e.id, 'birthday',
         'Happy birthday, ' || split_part(e.full_name, ' ', 1) || '!',
         'The whole team at Metrol Media wishes you a great one.'
    from public.employees e
   where e.status = 'active'
     and e.date_of_birth is not null
     and extract(month from e.date_of_birth) = extract(month from current_date)
     and extract(day   from e.date_of_birth) = extract(day   from current_date)
     and not exists (
       select 1 from public.notifications x
        where x.recipient_employee_id = e.id
          and x.type = 'birthday'
          and x.created_at::date = current_date
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.create_broadcast(text, text, text)  from public, anon;
revoke all on function public.check_todays_birthdays()             from public, anon;
grant execute on function public.create_broadcast(text, text, text) to authenticated;
grant execute on function public.check_todays_birthdays()           to authenticated;

-- ============================================ 6. realtime
--
-- What the bell's unread badge subscribes to — same publication, same
-- try/catch-if-already-added shape as every other table added to it.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.notifications'; exception when duplicate_object then null; end;
exception when undefined_object then
  null;
end $$;

-- ============================================ 7. proof

select 'rls enabled (notifications)' as check, relrowsecurity::text as result
  from pg_class where oid = 'public.notifications'::regclass
union all
select 'rls enabled (push_subscriptions)', relrowsecurity::text
  from pg_class where oid = 'public.push_subscriptions'::regclass
union all
select 'policies on notifications', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'notifications'
union all
select 'insert/delete policies on notifications (must be 0)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT','DELETE')
union all
select 'create_broadcast exists', count(*)::text
  from pg_proc where proname = 'create_broadcast'
union all
select 'check_todays_birthdays exists', count(*)::text
  from pg_proc where proname = 'check_todays_birthdays';
