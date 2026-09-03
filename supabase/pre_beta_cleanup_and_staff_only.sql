-- Project PenPal: staff-only account mode + one-time pre-beta test-data cleanup
-- Run once after all existing migrations and after production smoke testing.
--
-- SAFETY:
-- * The script requires exactly one protected Owner account.
-- * On the first run, it requires exactly one NON-STAFF profile whose display
--   name is "Alex" before any destructive cleanup is committed.
-- * Once the Owner is already marked staff_only, rerunning this file skips the
--   destructive account cleanup so a future real member named Alex cannot be
--   removed accidentally.

begin;

-- ---------------------------------------------------------------------------
-- Staff-only member boundary
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists staff_only boolean not null default false;

-- A staff-only account can never advertise itself as a member or accept requests,
-- even if an older client tries to save those fields as true.
create or replace function public.enforce_staff_only_profile_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.staff_only, false) then
    new.discoverable := false;
    new.accepting_new_penpals := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_staff_only_visibility on public.profiles;
create trigger profiles_enforce_staff_only_visibility
before insert or update on public.profiles
for each row execute function public.enforce_staff_only_profile_visibility();

-- Staff-only profiles remain visible to themselves and authorized moderators, but
-- never through ordinary Discover/request/relationship visibility.
drop policy if exists "Profiles are visible to their owner and discovery" on public.profiles;
create policy "Profiles are visible to their owner and discovery"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (
    staff_only = false
    and not public.users_are_blocked(auth.uid(), id)
    and (
      (account_status = 'active' and discoverable = true and onboarding_complete = true)
      or exists (
        select 1
        from public.penpal_requests pr
        where pr.status in ('pending', 'accepted', 'paused', 'ended')
          and (
            (pr.sender_id = auth.uid() and pr.recipient_id = profiles.id)
            or (pr.recipient_id = auth.uid() and pr.sender_id = profiles.id)
          )
      )
    )
  )
);

drop policy if exists "Profile interests follow profile visibility" on public.profile_interests;
create policy "Profile interests follow profile visibility"
on public.profile_interests for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    not public.users_are_blocked(auth.uid(), profile_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_id
        and p.staff_only = false
        and (
          (p.account_status = 'active' and p.discoverable = true and p.onboarding_complete = true)
          or exists (
            select 1
            from public.penpal_requests pr
            where pr.status in ('pending', 'accepted', 'paused', 'ended')
              and (
                (pr.sender_id = auth.uid() and pr.recipient_id = p.id)
                or (pr.recipient_id = auth.uid() and pr.sender_id = p.id)
              )
          )
        )
    )
  )
);

-- A staff-only account cannot initiate a member request, and no member can send
-- a new request to a staff-only account.
drop policy if exists "Members can send pen-pal requests" on public.penpal_requests;
create policy "Members can send pen-pal requests"
on public.penpal_requests for insert
to authenticated
with check (
  sender_id = auth.uid()
  and recipient_id <> auth.uid()
  and status = 'pending'
  and exists (
    select 1 from public.profiles sender
    where sender.id = auth.uid()
      and sender.staff_only = false
      and sender.account_status = 'active'
  )
  and exists (
    select 1
    from public.profiles recipient
    where recipient.id = recipient_id
      and recipient.staff_only = false
      and recipient.account_status = 'active'
      and recipient.onboarding_complete = true
      and recipient.discoverable = true
      and recipient.accepting_new_penpals = true
  )
);

-- Defense in depth for privileged/RPC paths and for accepting an old pending
-- request after one participant becomes staff-only.
create or replace function public.prevent_staff_only_penpal_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'accepted', 'paused')
     and exists (
       select 1 from public.profiles p
       where p.id in (new.sender_id, new.recipient_id)
         and p.staff_only = true
     ) then
    raise exception 'Staff-only accounts cannot participate in pen-pal relationships.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_staff_only_penpal_relationships() from public;

drop trigger if exists penpal_requests_staff_only_guard on public.penpal_requests;
create trigger penpal_requests_staff_only_guard
before insert or update on public.penpal_requests
for each row execute function public.prevent_staff_only_penpal_relationships();

-- Profile-photo visibility also follows the staff-only boundary.
drop policy if exists "Profile photo visibility follows member privacy" on storage.objects;
create policy "Profile photo visibility follows member privacy"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
      and (
        p.id = auth.uid()
        or public.is_moderator()
        or (
          p.staff_only = false
          and p.avatar_path = name
          and p.avatar_visibility = 'discover'
          and p.account_status = 'active'
          and p.onboarding_complete = true
          and p.discoverable = true
          and not public.users_are_blocked(auth.uid(), p.id)
        )
        or (
          p.staff_only = false
          and p.avatar_path = name
          and p.avatar_visibility = 'connections'
          and not public.users_are_blocked(auth.uid(), p.id)
          and exists (
            select 1
            from public.penpal_requests pr
            where pr.status in ('accepted', 'paused', 'ended')
              and (
                (pr.sender_id = auth.uid() and pr.recipient_id = p.id)
                or (pr.recipient_id = auth.uid() and pr.sender_id = p.id)
              )
          )
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- One-time cleanup targets/results
-- ---------------------------------------------------------------------------

create temporary table if not exists pg_temp.project_penpal_pre_beta_targets (
  account_type text primary key,
  user_id uuid not null,
  display_name text,
  note text
) on commit preserve rows;

truncate table pg_temp.project_penpal_pre_beta_targets;

do $$
declare
  owner_id uuid;
  owner_count integer;
  owner_already_staff_only boolean;
  alex_id uuid;
  alex_count integer;
begin
  select count(*)::integer into owner_count
  from public.admin_users
  where role = 'owner';

  if owner_count <> 1 then
    raise exception 'Pre-beta cleanup requires exactly one Owner account; found %.', owner_count using errcode = 'P0001';
  end if;

  select a.user_id, p.staff_only
    into owner_id, owner_already_staff_only
  from public.admin_users a
  join public.profiles p on p.id = a.user_id
  where a.role = 'owner';

  insert into pg_temp.project_penpal_pre_beta_targets(account_type, user_id, display_name, note)
  select 'owner', p.id, p.display_name,
         case when owner_already_staff_only then 'Already staff-only; destructive cleanup skipped.' else 'Converted to staff-only.' end
  from public.profiles p where p.id = owner_id;

  -- The first successful cleanup marks the Owner staff-only. That becomes the
  -- durable guard against ever deleting a future real member named Alex on rerun.
  if owner_already_staff_only then
    return;
  end if;

  select count(*)::integer into alex_count
  from public.profiles p
  where lower(trim(coalesce(p.display_name, ''))) = 'alex'
    and p.id <> owner_id
    and not exists (select 1 from public.admin_users a where a.user_id = p.id);

  if alex_count <> 1 then
    raise exception 'Expected exactly one non-staff test account named Alex; found %. Nothing was cleaned.', alex_count using errcode = 'P0001';
  end if;

  select p.id into alex_id
  from public.profiles p
  where lower(trim(coalesce(p.display_name, ''))) = 'alex'
    and p.id <> owner_id
    and not exists (select 1 from public.admin_users a where a.user_id = p.id)
  limit 1;

  insert into pg_temp.project_penpal_pre_beta_targets(account_type, user_id, display_name, note)
  values ('alex_test_account', alex_id, 'Alex', 'Deleted from auth.users; dependent database rows cascade. Remove this UUID folder from Storage > profile-photos if present.');

  -- Remove the Owner account's member/test activity while preserving the auth
  -- account, Owner role, staff-role audit trail, identity, and legal acceptances.
  delete from public.mailing_addresses where user_id = owner_id;
  delete from public.support_threads where user_id = owner_id;
  delete from public.reports where reporter_id = owner_id or reported_id = owner_id;
  delete from public.moderation_actions where target_user_id = owner_id;
  delete from public.blocks where blocker_id = owner_id or blocked_id = owner_id;
  delete from public.member_notices where user_id = owner_id;
  delete from public.member_activity_events where user_id = owner_id or target_user_id = owner_id;
  delete from public.penpal_requests where sender_id = owner_id or recipient_id = owner_id;
  delete from public.profile_interests where profile_id = owner_id;

  update public.profiles
  set staff_only = true,
      discoverable = false,
      accepting_new_penpals = false,
      max_penpals = 1,
      about_me = null,
      languages = '{}'::text[],
      friendship_goals = '{}'::text[],
      communication_style = null,
      correspondence_frequency = null,
      correspondence_method = 'digital',
      international_snail_mail = false,
      avatar_path = null,
      avatar_visibility = 'hidden',
      avatar_updated_at = now()
  where id = owner_id;

  -- Deleting the auth user removes the profile and all profile-owned dependent
  -- database rows through the schema's ON DELETE CASCADE relationships.
  delete from auth.users where id = alex_id;

  if not found then
    raise exception 'Alex auth account was not found; cleanup rolled back.' using errcode = 'P0001';
  end if;
end;
$$;

commit;

-- The final result gives the exact UUID folders to inspect under
-- Storage > profile-photos. Database metadata is cleaned above; storage objects
-- should be removed through Supabase Storage rather than direct SQL deletion.
select account_type, user_id, display_name, note
from pg_temp.project_penpal_pre_beta_targets
order by case account_type when 'owner' then 1 else 2 end;
