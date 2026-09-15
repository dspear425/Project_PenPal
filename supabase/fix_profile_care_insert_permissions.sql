-- OutKin: apply once in the production Supabase SQL Editor.
--
-- The profile form's upsert includes care_offered and care_appreciated. An
-- INSERT ... ON CONFLICT DO UPDATE needs INSERT privilege on every provided
-- column even when the current member already has a profile row. The existing
-- chosen-family migration granted UPDATE, but not INSERT, on these two fields.
--
-- Keep the existing owner-only profile-write RLS policies in force. Do not grant
-- table-wide INSERT/UPDATE or service_role permissions to the web client.

grant insert (care_offered, care_appreciated)
  on table public.profiles to authenticated;

grant update (care_offered, care_appreciated)
  on table public.profiles to authenticated;

-- Confirm the signed-in role has both privileges after the repair.
select field,
       has_column_privilege('authenticated', 'public.profiles', field, 'INSERT') as can_insert,
       has_column_privilege('authenticated', 'public.profiles', field, 'UPDATE') as can_update
from (values ('care_offered'), ('care_appreciated')) as required(field);
