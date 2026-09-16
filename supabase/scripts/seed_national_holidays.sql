-- Seed the fixed-date national and corporate holidays HR asked to start from.
-- Run any time — safe to run more than once (upsert on the date, the PK).
--
-- WHAT THIS ADDS, and why only these:
--
-- These five are fixed on the Gregorian calendar — same date every year,
-- gazetted nationally (Republic Day, Independence Day, Gandhi Jayanti),
-- Christmas, and New Year's Day, which nearly every Indian company observes
-- as a paid holiday. There is no year-to-year uncertainty about when they
-- fall, so seeding them is safe.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD:
--
-- Diwali, Holi, Dussehra, Eid-ul-Fitr, Eid-ul-Adha, Raksha Bandhan,
-- Janmashtami, Ganesh Chaturthi and every other festival that follows the
-- lunar or lunisolar calendar shift date every year. Putting a WRONG date on
-- one of these into a table that actually governs real leave-day counting
-- and payroll is worse than leaving it blank — it would silently short or
-- overpay somebody's leave balance, or count a working day as a holiday when
-- it wasn't. Confirm the exact 2026/2027 dates from an official calendar (a
-- bank holiday list or the Government of India gazette) and add those from
-- HR → Leave → Holidays, the screen that already lets HR add, see, and
-- remove any entry — this script is only a starting point, not a lock.
--
-- Only forward-looking rows are inserted (today is 2026-09-16) — a holiday
-- already in the past changes nothing for anybody, so there is no reason to
-- backfill 2026-01-01 or 2026-01-26.

insert into public.holidays (holiday_date, name) values
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-12-25', 'Christmas'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-26', 'Republic Day'),
  ('2027-08-15', 'Independence Day'),
  ('2027-10-02', 'Gandhi Jayanti'),
  ('2027-12-25', 'Christmas')
on conflict (holiday_date) do nothing;

-- proof: what is on the list now, in date order
select holiday_date, name from public.holidays order by holiday_date;
