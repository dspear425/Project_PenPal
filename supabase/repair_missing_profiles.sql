-- Project PenPal: repair missing profile rows
-- Safe to run more than once.
-- Creates an empty public.profiles row for any existing Supabase Auth user
-- that does not already have one. Existing profile data is not changed.

insert into public.profiles (id)
select id
from auth.users
on conflict (id) do nothing;

-- Quick verification: every auth user should now have a profile row.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profile_rows;
