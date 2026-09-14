-- OutKin rebrand migration
-- Run once in Supabase SQL Editor before deploying the OutKin legal-policy UI.
--
-- This migration intentionally preserves historical Project PenPal legal
-- acceptances. It advances the current policy versions so members explicitly
-- acknowledge the renamed service rather than silently rewriting v1.0.

begin;

-- ---------------------------------------------------------------------------
-- Legal policy versioning
-- ---------------------------------------------------------------------------

update public.legal_policy_versions
set current_version = '1.1',
    effective_date = date '2026-09-13',
    updated_at = now()
where document_key in (
  'terms',
  'privacy',
  'community',
  'safety',
  'profile_photo',
  'snail_mail'
);

-- ---------------------------------------------------------------------------
-- OutKin member codes
-- Keep the same deterministic body so support can correlate a legacy PP code
-- with the new OK code when necessary; only the brand prefix changes.
-- ---------------------------------------------------------------------------

alter table public.private_account_info
  drop constraint if exists member_code_format;

create or replace function public.member_code_for(user_id uuid)
returns text
language sql
immutable
as $$
  select 'OK-'
    || upper(substr(md5(user_id::text), 1, 6)) || '-'
    || upper(substr(md5(user_id::text), 7, 6)) || '-'
    || upper(substr(md5(user_id::text), 13, 4));
$$;

revoke all on function public.member_code_for(uuid) from public;

update public.private_account_info
set member_code = public.member_code_for(user_id),
    updated_at = now()
where member_code is distinct from public.member_code_for(user_id);

alter table public.private_account_info
  add constraint member_code_format
  check (member_code ~ '^OK-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{4}$');

-- ---------------------------------------------------------------------------
-- Protect the public brand and staff-looking usernames at the database layer.
-- The existing save_my_identity function already reserves staff/legacy names;
-- this guard extends protection to the OutKin brand regardless of write path.
-- ---------------------------------------------------------------------------

create or replace function public.guard_reserved_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is not null and lower(new.username) in (
    'admin',
    'administrator',
    'moderator',
    'support',
    'staff',
    'projectpenpal',
    'project_penpal',
    'penpal',
    'outkin',
    'out_kin',
    'out-kin',
    'joinoutkin'
  ) then
    raise exception 'That username is reserved. Please choose another.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_reserved_profile_username() from public;

drop trigger if exists profiles_reserved_username_guard on public.profiles;
create trigger profiles_reserved_username_guard
before insert or update of username on public.profiles
for each row execute function public.guard_reserved_profile_username();

commit;
