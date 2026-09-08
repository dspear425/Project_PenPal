-- Project PenPal: chosen-family and supportive-friendship profile preferences
-- Run after the existing profile/matching migrations.
-- These are neutral friendship preferences. Do not store trauma history, crisis status,
-- financial need, housing need, or family-role labels in these fields.

alter table public.profiles
  add column if not exists care_offered text[] not null default '{}',
  add column if not exists care_appreciated text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_care_offered_allowed,
  add constraint profiles_care_offered_allowed check (
    care_offered <@ array[
      'regular-check-ins',
      'encouragement',
      'listening',
      'birthday-holiday-cards',
      'celebrate-milestones',
      'share-traditions',
      'long-letters',
      'consistent-presence'
    ]::text[]
    and cardinality(care_offered) <= 8
  ),
  drop constraint if exists profiles_care_appreciated_allowed,
  add constraint profiles_care_appreciated_allowed check (
    care_appreciated <@ array[
      'regular-check-ins',
      'encouragement',
      'listening',
      'birthday-holiday-cards',
      'celebrate-milestones',
      'share-traditions',
      'long-letters',
      'consistent-presence'
    ]::text[]
    and cardinality(care_appreciated) <= 8
  );

comment on column public.profiles.care_offered is
  'Neutral ways this member likes to show care in adult platonic friendship. Never use for trauma/crisis/financial-need classification.';
comment on column public.profiles.care_appreciated is
  'Neutral ways this member appreciates care in adult platonic friendship. Never use for trauma/crisis/financial-need classification.';

-- Existing table privileges/RLS already limit profile updates to the owner and
-- profile reads to the same member visibility rules used by Discover/connections.
-- Re-grant update in case this project uses explicit Data API privileges.
grant update (care_offered, care_appreciated) on table public.profiles to authenticated;
