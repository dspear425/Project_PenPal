-- Project PenPal: profile-photo moderation, immutable report evidence, and staff controls
-- Run once in Supabase SQL Editor after add_profile_photos.sql and the Owner/Admin Team migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Reports can point at the exact immutable profile-photo object that was visible
-- when the report was submitted. New photo uploads use unique object names so a
-- later replacement cannot silently change old moderation evidence.
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists photo_evidence_path text,
  add column if not exists photo_visibility_at_report text,
  add column if not exists photo_violation_category text;

alter table public.reports drop constraint if exists reports_category;
alter table public.reports add constraint reports_category check (category in (
  'harassment',
  'scam',
  'sexual_content',
  'hate_abuse',
  'impersonation',
  'spam',
  'profile_photo',
  'other'
));

alter table public.reports drop constraint if exists reports_photo_visibility;
alter table public.reports add constraint reports_photo_visibility
  check (photo_visibility_at_report is null or photo_visibility_at_report in ('discover', 'connections', 'hidden'));

alter table public.reports drop constraint if exists reports_photo_violation_category;
alter table public.reports add constraint reports_photo_violation_category
  check (photo_violation_category is null or photo_violation_category in (
    'nudity_sexual',
    'hate_extremism',
    'graphic_content',
    'impersonation',
    'spam_advertising',
    'privacy_concern',
    'other'
  ));

alter table public.reports drop constraint if exists reports_photo_evidence_path_length;
alter table public.reports add constraint reports_photo_evidence_path_length
  check (photo_evidence_path is null or char_length(photo_evidence_path) <= 240);

create index if not exists reports_photo_evidence_idx
  on public.reports(photo_evidence_path)
  where photo_evidence_path is not null;

-- Ordinary member inserts cannot forge photo evidence. Profile-photo reports go
-- through submit_profile_photo_report(), which captures and validates the exact
-- current object path server-side.
drop policy if exists "Members can submit reports" on public.reports;
create policy "Members can submit reports"
on public.reports for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and reported_id <> auth.uid()
  and category <> 'profile_photo'
  and photo_evidence_path is null
  and photo_visibility_at_report is null
  and photo_violation_category is null
  and (
    relationship_id is null
    or exists (
      select 1
      from public.penpal_requests pr
      where pr.id = relationship_id
        and (pr.sender_id = auth.uid() or pr.recipient_id = auth.uid())
        and (pr.sender_id = reported_id or pr.recipient_id = reported_id)
    )
  )
);

-- ---------------------------------------------------------------------------
-- Storage objects become immutable to members after upload. Replacing a photo
-- creates a new path rather than updating the old object. That preserves exact
-- report evidence. A later retention/cleanup job can purge unreferenced versions.
-- ---------------------------------------------------------------------------

drop policy if exists "Members replace their own profile photo" on storage.objects;
drop policy if exists "Members delete their own profile photo" on storage.objects;

-- Rebuild SELECT policy so established pen pals can still see a Discover photo
-- even if the owner later turns off discoverability, while Hidden remains hidden.
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
          p.avatar_path = name
          and not public.users_are_blocked(auth.uid(), p.id)
          and (
            (
              p.avatar_visibility = 'discover'
              and p.account_status = 'active'
              and p.onboarding_complete = true
              and p.discoverable = true
            )
            or (
              p.avatar_visibility in ('discover', 'connections')
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
      )
  )
);

-- Accept legacy user/avatar.jpg paths plus new versioned avatar-*.jpg paths.
create or replace function public.save_my_profile_photo(
  photo_path text,
  visibility text
)
returns table(
  avatar_path text,
  avatar_visibility text,
  avatar_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean_path text := nullif(trim(photo_path), '');
  clean_visibility text := lower(trim(visibility));
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_visibility not in ('discover', 'connections', 'hidden') then
    raise exception 'Invalid profile-photo visibility.' using errcode = 'P0001';
  end if;

  if clean_path is not null then
    if split_part(clean_path, '/', 1) <> caller::text
       or clean_path like '%/%/%'
       or split_part(clean_path, '/', 2) !~ '^avatar(-[A-Za-z0-9-]+)?\.jpg$' then
      raise exception 'Profile-photo path is invalid.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'profile-photos'
        and o.name = clean_path
    ) then
      raise exception 'Upload the profile photo before saving it.' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles p
  set avatar_path = clean_path,
      avatar_visibility = clean_visibility,
      avatar_updated_at = case
        when p.avatar_path is distinct from clean_path then now()
        else coalesce(p.avatar_updated_at, now())
      end
  where p.id = caller;

  return query
  select p.avatar_path, p.avatar_visibility, p.avatar_updated_at
  from public.profiles p
  where p.id = caller;
end;
$$;

-- Removing a photo removes it from the profile immediately. The immutable object
-- is retained so a report that already references it cannot lose evidence.
create or replace function public.remove_my_profile_photo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.profiles
  set avatar_path = null,
      avatar_updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.save_my_profile_photo(text, text) from public;
revoke all on function public.remove_my_profile_photo() from public;
grant execute on function public.save_my_profile_photo(text, text) to authenticated;
grant execute on function public.remove_my_profile_photo() to authenticated;

-- ---------------------------------------------------------------------------
-- Member profile-photo reporting. The browser supplies the exact object path it
-- displayed. The server verifies it is still current before creating the report,
-- preventing a replacement race from attaching the wrong image.
-- ---------------------------------------------------------------------------

-- Remove the earlier draft signature if this migration is rerun after a partial
-- development execution.
drop function if exists public.submit_profile_photo_report(uuid, uuid, text, text);

create or replace function public.submit_profile_photo_report(
  target_user uuid,
  expected_photo_path text,
  target_relationship uuid default null,
  violation_category text default 'other',
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_profile public.profiles%rowtype;
  clean_expected_path text := nullif(trim(expected_photo_path), '');
  clean_category text := lower(trim(violation_category));
  clean_details text := nullif(trim(report_details), '');
  relationship_access boolean := false;
  discover_access boolean := false;
  new_report uuid;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if target_user is null or target_user = caller then
    raise exception 'You cannot report your own profile photo.' using errcode = 'P0001';
  end if;

  if clean_expected_path is null then
    raise exception 'The profile photo could not be identified. Reopen Safety and try again.' using errcode = 'P0001';
  end if;

  if clean_category is null or clean_category not in (
    'nudity_sexual', 'hate_extremism', 'graphic_content', 'impersonation',
    'spam_advertising', 'privacy_concern', 'other'
  ) then
    raise exception 'Choose a valid profile-photo report reason.' using errcode = 'P0001';
  end if;

  if clean_details is not null and char_length(clean_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer.' using errcode = 'P0001';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_user;

  if not found then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if target_profile.avatar_path is null or target_profile.avatar_visibility = 'hidden' then
    raise exception 'There is no visible profile photo to report.' using errcode = 'P0001';
  end if;

  if target_profile.avatar_path <> clean_expected_path then
    raise exception 'This member changed their profile photo before the report was submitted. Reopen Safety to review the current photo.' using errcode = 'P0001';
  end if;

  if public.users_are_blocked(caller, target_user) then
    raise exception 'This profile photo is not available.' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.penpal_requests pr
    where pr.status in ('accepted', 'paused', 'ended')
      and (
        (pr.sender_id = caller and pr.recipient_id = target_user)
        or (pr.recipient_id = caller and pr.sender_id = target_user)
      )
  ) into relationship_access;

  discover_access := target_profile.avatar_visibility = 'discover'
    and target_profile.account_status = 'active'
    and target_profile.onboarding_complete = true
    and target_profile.discoverable = true;

  if not discover_access
     and not (relationship_access and target_profile.avatar_visibility in ('discover', 'connections')) then
    raise exception 'You do not currently have access to this profile photo.' using errcode = 'P0001';
  end if;

  if target_relationship is not null and not exists (
    select 1
    from public.penpal_requests pr
    where pr.id = target_relationship
      and (
        (pr.sender_id = caller and pr.recipient_id = target_user)
        or (pr.recipient_id = caller and pr.sender_id = target_user)
      )
  ) then
    raise exception 'Relationship context is invalid.' using errcode = 'P0001';
  end if;

  insert into public.reports (
    reporter_id,
    reported_id,
    relationship_id,
    category,
    details,
    photo_evidence_path,
    photo_visibility_at_report,
    photo_violation_category
  ) values (
    caller,
    target_user,
    target_relationship,
    'profile_photo',
    clean_details,
    target_profile.avatar_path,
    target_profile.avatar_visibility,
    clean_category
  ) returning id into new_report;

  return new_report;
end;
$$;

revoke all on function public.submit_profile_photo_report(uuid, text, uuid, text, text) from public;
grant execute on function public.submit_profile_photo_report(uuid, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff photo context and moderation action.
-- ---------------------------------------------------------------------------

create or replace function public.moderator_profile_photo_context(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'avatar_path', p.avatar_path,
    'avatar_visibility', p.avatar_visibility,
    'avatar_updated_at', p.avatar_updated_at,
    'photo_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reporter_id', r.reporter_id,
        'status', r.status,
        'details', r.details,
        'photo_evidence_path', r.photo_evidence_path,
        'photo_visibility_at_report', r.photo_visibility_at_report,
        'photo_violation_category', r.photo_violation_category,
        'created_at', r.created_at,
        'reviewed_at', r.reviewed_at
      ) order by r.created_at desc)
      from public.reports r
      where r.reported_id = target_user
        and r.category = 'profile_photo'
    ), '[]'::jsonb)
  ) into result
  from public.profiles p
  where p.id = target_user;

  return result;
end;
$$;

revoke all on function public.moderator_profile_photo_context(uuid) from public;
grant execute on function public.moderator_profile_photo_context(uuid) to authenticated;

-- Add a dedicated audit type. The existing member-notice trigger ignores this
-- action unless the RPC explicitly creates a photo-removal warning below.
alter table public.moderation_actions drop constraint if exists moderation_actions_type;
alter table public.moderation_actions add constraint moderation_actions_type
  check (action_type in ('warning', 'suspend', 'ban', 'restore', 'note', 'photo_remove'));

create or replace function public.moderator_remove_profile_photo(
  target_user uuid,
  expected_photo_path text,
  violation_category text,
  action_reason text,
  notify_member boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.staff_role(auth.uid());
  target_role text;
  current_path text;
  clean_expected_path text := nullif(trim(expected_photo_path), '');
  clean_category text := lower(trim(violation_category));
  clean_reason text := nullif(trim(action_reason), '');
  action_id uuid;
begin
  if actor_role not in ('moderator', 'admin', 'owner') then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if clean_expected_path is null then
    raise exception 'The current profile photo could not be identified. Refresh the member before taking action.' using errcode = 'P0001';
  end if;

  if clean_category is null or clean_category not in (
    'nudity_sexual', 'hate_extremism', 'graphic_content', 'impersonation',
    'spam_advertising', 'privacy_concern', 'other'
  ) then
    raise exception 'Choose a valid profile-photo violation category.' using errcode = 'P0001';
  end if;

  if clean_reason is null or char_length(clean_reason) < 3 then
    raise exception 'A reason is required for profile-photo removal.' using errcode = 'P0001';
  end if;

  if char_length(clean_reason) > 2000 then
    raise exception 'Reason must be 2000 characters or fewer.' using errcode = 'P0001';
  end if;

  if target_user = auth.uid() then
    raise exception 'Use your own Profile photo settings to change your staff profile photo.' using errcode = 'P0001';
  end if;

  select a.role into target_role
  from public.admin_users a
  where a.user_id = target_user;

  if target_role is not null then
    if actor_role = 'moderator' then
      raise exception 'Moderators cannot remove profile photos from staff accounts.' using errcode = 'P0001';
    elsif actor_role = 'admin' and target_role in ('admin', 'owner') then
      raise exception 'Only the Owner can moderate another administrator profile.' using errcode = 'P0001';
    elsif target_role = 'owner' then
      raise exception 'The protected Owner profile cannot be moderated by another staff account.' using errcode = 'P0001';
    end if;
  end if;

  select p.avatar_path into current_path
  from public.profiles p
  where p.id = target_user
  for update;

  if not found then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if current_path is null then
    raise exception 'This member does not currently have a profile photo.' using errcode = 'P0001';
  end if;

  if current_path <> clean_expected_path then
    raise exception 'The member has changed their profile photo since this view was loaded. Refresh before taking action.' using errcode = 'P0001';
  end if;

  update public.profiles
  set avatar_path = null,
      avatar_updated_at = now()
  where id = target_user;

  insert into public.moderation_actions (
    moderator_id,
    target_user_id,
    action_type,
    reason
  ) values (
    auth.uid(),
    target_user,
    'photo_remove',
    left('[' || clean_category || '] ' || clean_reason, 2000)
  ) returning id into action_id;

  if notify_member then
    insert into public.member_notices (
      user_id,
      moderation_action_id,
      notice_type,
      title,
      message
    ) values (
      target_user,
      action_id,
      'warning',
      'Profile photo removed',
      'Your profile photo was removed because it did not meet Project PenPal profile-photo guidelines. Reason: '
        || clean_reason
        || ' You may upload another appropriate photo. If you believe this was a mistake, contact moderation through Help.'
    )
    on conflict (moderation_action_id) do nothing;
  end if;

  update public.reports
  set status = 'resolved',
      assigned_to = auth.uid(),
      reviewed_at = now()
  where reported_id = target_user
    and category = 'profile_photo'
    and photo_evidence_path = current_path
    and status in ('open', 'reviewing');
end;
$$;

revoke all on function public.moderator_remove_profile_photo(uuid, text, text, text, boolean) from public;
grant execute on function public.moderator_remove_profile_photo(uuid, text, text, text, boolean) to authenticated;
