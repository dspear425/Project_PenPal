-- Project PenPal: one-time helper to promote your own account to admin.
-- Replace YOUR_ADMIN_EMAIL@example.com with the email address of the account
-- you want to use for Project PenPal administration, then run this in the
-- Supabase SQL Editor after add_admin_moderation.sql.

insert into public.admin_users (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do update set role = excluded.role;

select
  au.email,
  ad.role,
  ad.created_at
from public.admin_users ad
join auth.users au on au.id = ad.user_id
order by ad.created_at;
