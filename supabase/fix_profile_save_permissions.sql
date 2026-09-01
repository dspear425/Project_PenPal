-- Project PenPal: repair member profile-save column privileges
-- Run after the snail-mail migrations.
--
-- Settings & Privacy intentionally removed broad UPDATE/INSERT privileges from
-- public.profiles and replaced them with column-level grants. The profile editor
-- uses INSERT ... ON CONFLICT (UPSERT), so PostgREST/PostgreSQL may require UPDATE
-- permission on the conflict key as well as every safe field present in the write.
-- This migration restores only member-editable columns. Moderation, private
-- identity, and profile-photo metadata remain protected.

revoke insert, update on table public.profiles from authenticated;

-- Safe fields a signed-in member may provide when their profile row is created.
grant insert (
  id,
  display_name,
  birth_year,
  country,
  region,
  about_me,
  languages,
  friendship_goals,
  communication_style,
  correspondence_frequency,
  correspondence_method,
  international_snail_mail,
  accepting_new_penpals,
  max_penpals,
  onboarding_complete,
  discoverable
) on public.profiles to authenticated;

-- Include id because the profile editor currently saves with UPSERT. RLS still
-- requires the resulting row id to equal auth.uid(), so a member cannot move or
-- edit another member's profile row.
grant update (
  id,
  display_name,
  birth_year,
  country,
  region,
  about_me,
  languages,
  friendship_goals,
  communication_style,
  correspondence_frequency,
  correspondence_method,
  international_snail_mail,
  accepting_new_penpals,
  max_penpals,
  onboarding_complete,
  discoverable
) on public.profiles to authenticated;

-- Deliberately NOT granted here:
-- account_status, suspended_until                     (moderation)
-- username, username_customized, nearest_city         (guarded identity RPC)
-- avatar_path, avatar_visibility, avatar_updated_at    (guarded photo RPC)
-- created_at, updated_at                               (system-managed)
