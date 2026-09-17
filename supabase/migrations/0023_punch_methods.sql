-- Attendance — which WAY people are allowed to punch. Run once, after 0022.
--
-- Adarsh: the owner and HR should be able to switch one method off entirely —
-- "if they want to disable punch-in/punch-out and only keep QR, it works".
--
-- THE POINT OF DOING THIS IN THE DATABASE: hiding a button stops nobody. A
-- hand-made REST call to punch_in() would still open a day at an office that
-- has decided its staff scan the poster. The setting is therefore enforced on
-- the row itself, so every path — the app, a stale tab, curl — gets the same
-- answer.
--
-- It is done with a TRIGGER rather than by rewriting punch_in / punch_out /
-- punch_by_qr. Those three are proven live (31 of 31 on 2026-09-16) and
-- re-typing their bodies to add one check at the top is the kind of edit that
-- quietly loses a line. The trade is the shape of the refusal: this raises,
-- so the client shows the sentence rather than a jsonb {ok:false}. The
-- sentence is written to be read by the person at the door, not by a
-- developer.

-- ============================================ 1. the setting

alter table public.attendance_settings
  add column if not exists punch_methods text not null default 'both';

do $$
begin
  alter table public.attendance_settings drop constraint if exists attendance_settings_punch_methods_ck;
  alter table public.attendance_settings
    add constraint attendance_settings_punch_methods_ck
    check (punch_methods in ('both', 'button', 'qr'));
end $$;

comment on column public.attendance_settings.punch_methods is
  'both = button and QR; button = QR poster refused; qr = the buttons refused. HR entries are never affected.';

-- ============================================ 2. the guard

create or replace function public.punch_method_allowed(p_method text)
returns boolean
language sql stable set search_path = public as $$
  select case (select s.punch_methods from public.attendance_settings s where s.id)
    when 'button' then p_method <> 'qr'
    when 'qr'     then p_method <> 'button'
    else true                                    -- 'both', or no settings row
  end;
$$;

revoke all on function public.punch_method_allowed(text) from public, anon;
grant execute on function public.punch_method_allowed(text) to authenticated;

-- ============================================ 3. enforced on the row

create or replace function public.enforce_punch_method()
returns trigger language plpgsql set search_path = public as $$
declare
  mode text;
begin
  -- HR typing a day in from the register is never a "method" in this sense,
  -- and must keep working whatever the office has chosen.
  if new.source = 'hr' then return new; end if;

  select s.punch_methods into mode from public.attendance_settings s where s.id;
  if coalesce(mode, 'both') = 'both' then return new; end if;

  -- Arriving: only the method that actually opened the day is checked.
  if (tg_op = 'INSERT' or old.punch_in_at is null)
     and new.punch_in_at is not null
     and not public.punch_method_allowed(new.punch_in_method) then
    raise exception '%', case new.punch_in_method
      when 'qr' then 'Scanning is switched off here. Use the Punch in button instead.'
      else 'The punch buttons are switched off here. Scan the office QR code instead.' end
      using errcode = 'check_violation';
  end if;

  -- Leaving: likewise, and only when this update is what closed the day.
  if tg_op = 'UPDATE'
     and old.punch_out_at is null and new.punch_out_at is not null
     and not public.punch_method_allowed(new.punch_out_method) then
    raise exception '%', case new.punch_out_method
      when 'qr' then 'Scanning is switched off here. Use the Punch out button instead.'
      else 'The punch buttons are switched off here. Scan the office QR code instead.' end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- BEFORE the regrade trigger has anything to do: a refused punch should never
-- reach the point of being graded.
drop trigger if exists attendance_enforce_method on public.attendance;
create trigger attendance_enforce_method
  before insert or update on public.attendance
  for each row execute function public.enforce_punch_method();

-- ============================================ 4. proof

select 'punch_methods column' as check, count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'attendance_settings' and column_name = 'punch_methods'
union all
select 'current mode', coalesce((select punch_methods from public.attendance_settings where id), 'no settings row')
union all
select 'guard function exists', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'punch_method_allowed'
union all
select 'trigger installed', count(*)::text
  from pg_trigger where tgname = 'attendance_enforce_method' and not tgisinternal
union all
select 'both methods allowed right now (must be t/t)',
       public.punch_method_allowed('button')::text || '/' || public.punch_method_allowed('qr')::text;
