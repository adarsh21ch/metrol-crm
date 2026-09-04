-- Adds the fields a self-service signup and a profile photo need, and the
-- storage bucket the photo lives in. Run once in the SQL editor.

alter table public.profiles add column if not exists phone       text;
alter table public.profiles add column if not exists avatar_url  text;

-- Store the new fields from signup metadata too, not just name and email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------- avatars

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone signed in can read any avatar (they are shown across the whole
-- team). A user may only write into their own folder — avatars/<their-uid>/… —
-- so nobody can overwrite a colleague's photo.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
