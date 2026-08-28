-- Project PenPal: repair Data API table privileges for newer Supabase projects.
-- Supabase projects created with automatic table exposure disabled require
-- explicit GRANTs in addition to Row Level Security policies.

-- The web app only talks to these tables after a user is authenticated.
grant usage on schema public to authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.interests to authenticated;
grant select, insert, delete on table public.profile_interests to authenticated;

-- Keep server-side/admin access available for future trusted backend work.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.interests to service_role;
grant select, insert, update, delete on table public.profile_interests to service_role;

-- Optional diagnostic output: confirm the authenticated role now has privileges.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('profiles', 'interests', 'profile_interests')
order by table_name, privilege_type;
