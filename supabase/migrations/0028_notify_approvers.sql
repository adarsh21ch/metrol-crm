-- Round 7 follow-up (2026-09-21): "pop up / push notification is important."
--
-- Every push this app has sent until now goes ONE way — HR/owner broadcasting
-- down to employees (create_broadcast, 0025). A visit entry or WFH request is
-- the opposite direction: an ORDINARY employee's action has to reach HR. That
-- is a different authorization shape (send-push's own gate is "only HR/owner
-- may call this"), so it gets its own function and its own Edge Function
-- rather than a bypass bolted onto send-push's existing privileged path.
--
-- Run once in the Supabase SQL editor, after 0027. Safe to re-run.

-- ============================================ 1. two more notification types

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('broadcast','birthday','shift_reminder','visit_request','wfh_request'));

-- ============================================ 2. notify_approvers()

-- Callable by ANY signed-in employee — the opposite gate from
-- create_broadcast(), which only HR/owner may call. What makes this safe
-- despite that: the recipient list is hard-coded to HR + owner, never
-- caller-supplied, so the most a mischievous call can do is put an
-- unwanted row in HR's own feed — never reach an employee it should not.
create or replace function public.notify_approvers(p_type text, p_title text, p_body text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_by uuid;
begin
  if p_type not in ('visit_request','wfh_request') then
    raise exception 'Unknown notification type.';
  end if;
  v_by := public.my_employee_id();
  if v_by is null then
    raise exception 'No employee record is linked to this login.';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'A notification needs a title.'; end if;

  insert into public.notifications (recipient_employee_id, type, title, body, created_by)
  select e.id, p_type, p_title, p_body, v_by
    from public.employees e
    join public.profiles p on p.id = e.profile_id
   where e.status = 'active'
     and e.id <> v_by
     and (
       p.role = 'owner'
       or exists (select 1 from public.departments d where d.id = p.department_id and d.name = 'Human Resources')
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.notify_approvers(text, text, text) from public, anon;
grant execute on function public.notify_approvers(text, text, text) to authenticated;

-- ============================================ 3. proof

select 'notifications accepts the two new types' as check,
       (pg_get_constraintdef(oid) like '%visit_request%' and pg_get_constraintdef(oid) like '%wfh_request%')::text as result
  from pg_constraint where conname = 'notifications_type_check'
union all
select 'notify_approvers exists', count(*)::text from pg_proc where proname = 'notify_approvers';
