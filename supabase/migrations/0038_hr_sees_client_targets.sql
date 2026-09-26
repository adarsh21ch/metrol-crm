-- 0038 — HR sees and sets client view targets (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0037. Safe to re-run.
--
-- Adarsh runs Clients from the HR login. 0035's seed gave HR every client
-- capability EXCEPT the two about view targets, so a client's page never
-- showed HR its dashboard — the Client Master / LavBhusan sheet on screen,
-- with the target, the weekly numbers and the running LEFT. The tab was
-- simply not there, and nothing said why.
--
-- Two ticks on the HR role — "See view targets" and "Set targets" — and
-- nothing else. The owner can untick either on Roles & access to undo it.
-- Client money stays where it was (owner / Management / Super Admin).

insert into public.role_capabilities (role_id, capability)
select r.id, c.capability
  from public.roles r
 cross join (values ('view_targets'), ('manage_targets')) as c(capability)
 where r.name = 'HR'
on conflict (role_id, capability) do nothing;

-- ---------------------------------------------------------------- proof
-- Expect: "manage_targets, view_targets", then the HR login's name among
-- the logins that can now see targets.

select 'HR role — target ticks' as check,
       coalesce((select string_agg(rc.capability, ', ' order by rc.capability)
                   from public.role_capabilities rc
                   join public.roles r on r.id = rc.role_id
                  where r.name = 'HR' and rc.capability in ('view_targets', 'manage_targets')),
                'NONE — is the HR role renamed? Tick them on Roles & access instead') as result
union all
select 'logins that can see client targets now',
       coalesce((select string_agg(coalesce(nullif(p.name, ''), p.email), ', ' order by coalesce(nullif(p.name, ''), p.email))
                   from public.profiles p
                  where public.has_capability_as(p.id, 'view_targets')), 'none');
