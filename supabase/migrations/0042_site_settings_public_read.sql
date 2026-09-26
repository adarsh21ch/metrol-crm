-- 0042 — site_settings: anyone may READ it again (2026-09-26)
--
-- Run once in the Supabase SQL editor, after 0041. Safe to re-run.
--
-- 0041's proof showed what the hand-made table holds: logo_url,
-- discount_percent, coupon_code, offer_end_date, redirect_url, a headline…
-- — a landing page's live offer, made to be read by a public page with no
-- login ("public can read settings"). 0040's sweep made every such read rule
-- staff-only, which would blank that page's offer. Reading goes back to
-- anyone, on purpose; CHANGING it stays owner and HR only (0041) — that was
-- the real hole.

do $$
begin
  if to_regclass('public.site_settings') is null then
    raise notice 'No site_settings table here — nothing to change.';
    return;
  end if;
  execute 'alter policy "public can read settings" on public.site_settings using ( true )';
end $$;

-- ---------------------------------------------------------------- proof
-- Expect: yes / owner and HR can update settings (UPDATE) / 0.

select 'site_settings readable with no login, as its page needs (expect yes)' as check,
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings'
                          and cmd = 'SELECT' and regexp_replace(coalesce(qual, ''), '\s', '', 'g') = 'true')
            then 'yes' else 'NO' end as result
union all
select 'who may change site_settings (expect owner and HR only)',
       coalesce((select string_agg(policyname || ' (' || cmd || ')', ', ')
                   from pg_policies where schemaname = 'public' and tablename = 'site_settings' and cmd <> 'SELECT'), 'nobody')
union all
select 'any OTHER read rule open to anyone (expect 0)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and cmd in ('SELECT', 'ALL') and tablename <> 'site_settings'
   and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(auth.uid()ISNOTNULL)');
