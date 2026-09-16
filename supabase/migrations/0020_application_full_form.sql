-- 0020 — the joining form collects what the paper form collects.
--
-- Adarsh sent photographs of Metrol Media's actual printed APPLICATION FORM.
-- Everything below is a field that form asks for and the online one did not.
-- Nothing here was invented: if a column exists in this file, it is because
-- it is a line on that paper.
--
-- Safe to re-run: every add is `if not exists`, every constraint is dropped
-- first — the lesson 0017 taught the hard way.
--
-- WHY JSONB FOR FOUR OF THEM: education, employment history, languages and
-- references are TABLES on the paper form with room for several rows each,
-- and a candidate may have one line or five. Separate child tables would be
-- the textbook answer, but nothing ever queries "every applicant who passed
-- 12th in 2022" — HR reads these as a block, on one screen, for one person.
-- A jsonb array keeps that block together, keeps an unapproved stranger's
-- data out of the tables real employees live in, and means approving
-- somebody does not have to fan rows out across four more tables. If a
-- report over this data is ever wanted, that is the moment to normalise it.

-- ------------------------------------------------- personal data (page 1)
alter table public.job_applications
  add column if not exists first_name        text not null default '',
  add column if not exists last_name         text not null default '',
  add column if not exists father_or_husband text not null default '',
  add column if not exists gender            text not null default '',
  add column if not exists date_of_birth     date,
  add column if not exists place_of_birth    text not null default '',
  add column if not exists nationality       text not null default '',
  add column if not exists religion          text not null default '',
  add column if not exists marital_status    text not null default '',
  add column if not exists dependents        text not null default '',
  add column if not exists aadhaar_number    text not null default '',

  -- addresses
  add column if not exists present_address   text not null default '',
  add column if not exists permanent_address text not null default '',
  add column if not exists pincode           text not null default '',

  -- ------------------------------------------ qualifications (page 2)
  -- [{ examination, year, institution, marks, subjects }]
  add column if not exists education         jsonb not null default '[]'::jsonb,
  add column if not exists technical_qualification text not null default '',

  -- [{ from, to, total_years, company, designation, gross_salary, reason }]
  add column if not exists employment_history jsonb not null default '[]'::jsonb,

  -- bank details
  add column if not exists bank_name         text not null default '',
  add column if not exists bank_account_name text not null default '',
  add column if not exists bank_account_no   text not null default '',
  add column if not exists bank_ifsc         text not null default '',

  -- [{ language, understand, speak, read, write, remarks }]
  add column if not exists languages         jsonb not null default '[]'::jsonb,

  -- ---------------------------------------------- reference (page 3)
  add column if not exists reference_name       text not null default '',
  add column if not exists reference_department text not null default '',

  -- ------------------------------------- declaration and the T&C gate
  -- Two separate acceptances because they are two separate statements on
  -- the paper: the declaration is the applicant swearing their answers are
  -- true, the T&C is them accepting the terms of employment. Recording the
  -- moment each was accepted is the point — a bare boolean cannot answer
  -- "when did they agree to this", which is the only question that matters
  -- if it is ever disputed.
  add column if not exists declaration_accepted_at timestamptz,
  add column if not exists terms_accepted_at       timestamptz;

-- The two acceptances are required. Written as a check rather than NOT NULL
-- so the message names what is missing, and so rows that predate this
-- migration (there are none in production, but a staging copy may have some)
-- are not rewritten by it.
alter table public.job_applications
  drop constraint if exists job_applications_accepted_check;

alter table public.job_applications
  add constraint job_applications_accepted_check
  check (declaration_accepted_at is not null and terms_accepted_at is not null)
  not valid;   -- `not valid` = applies to new rows, leaves any existing row alone

-- The quarantine trigger from 0017 clamps status/decided_by/employee_id and
-- the invite fields on any client insert. It does not need to know about the
-- columns above — a candidate is *supposed* to fill those in — but the two
-- timestamps are a claim about when they agreed, so the server stamps them
-- rather than trusting a clock the client controls.
create or replace function public.quarantine_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- an application always arrives undecided, whatever the client sent
  new.status            := 'pending';
  new.decided_by        := null;
  new.decided_at        := null;
  new.decision_note     := null;
  new.employee_id       := null;
  new.invite_sent_count := 0;
  new.invite_sent_at    := null;

  -- they either accepted or they did not; WHEN is the server's to say
  if new.declaration_accepted_at is not null then
    new.declaration_accepted_at := now();
  end if;
  if new.terms_accepted_at is not null then
    new.terms_accepted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists job_applications_quarantine on public.job_applications;
create trigger job_applications_quarantine
  before insert on public.job_applications
  for each row execute function public.quarantine_job_application();

-- -------------------------------------------------------------------- proof
select 'new columns present' as check,
       (count(*) = 26)::text || ' (' || count(*)::text || ' of 26)' as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'job_applications'
   and column_name in (
     'first_name','last_name','father_or_husband','gender','date_of_birth',
     'place_of_birth','nationality','religion','marital_status','dependents',
     'aadhaar_number','present_address','permanent_address','pincode',
     'education','technical_qualification','employment_history',
     'bank_name','bank_account_name','bank_account_no','bank_ifsc','languages',
     'reference_name','reference_department',
     'declaration_accepted_at','terms_accepted_at')
union all
select 'acceptance constraint installed',
       (count(*) = 1)::text
  from pg_constraint
 where conname = 'job_applications_accepted_check'
union all
select 'quarantine trigger still installed',
       (count(*) = 1)::text
  from pg_trigger where tgname = 'job_applications_quarantine';
