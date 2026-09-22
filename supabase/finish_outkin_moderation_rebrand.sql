-- OutKin: finish database-generated moderation branding.
--
-- Run once in the Supabase SQL Editor after rebrand_outkin.sql. This migration
-- updates the active functions that create member-facing moderation notices.
-- It also corrects existing notice text without changing moderation history.

begin;

create or replace function public.create_member_notice_from_moderation_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_title text;
  notice_message text;
  notice_kind text;
begin
  if new.action_type = 'warning' then
    notice_kind := 'warning';
    notice_title := 'Account warning';
    notice_message := coalesce(
      nullif(trim(new.reason), ''),
      'An OutKin moderator issued a warning about activity on your account. Please review our community expectations before continuing.'
    );
  elsif new.action_type = 'suspend' then
    notice_kind := 'suspension';
    notice_title := 'Account temporarily suspended';
    notice_message := concat(
      coalesce(nullif(trim(new.reason), ''), 'Your account has been temporarily suspended by OutKin moderation.'),
      case
        when new.suspension_until is not null
          then ' The suspension is scheduled to end on ' || to_char(new.suspension_until at time zone 'UTC', 'Mon DD, YYYY at HH24:MI "UTC"') || '.'
        else ''
      end
    );
  elsif new.action_type = 'ban' then
    notice_kind := 'ban';
    notice_title := 'Account banned';
    notice_message := coalesce(
      nullif(trim(new.reason), ''),
      'Your OutKin account has been banned by moderation.'
    );
  elsif new.action_type = 'restore' then
    notice_kind := 'restored';
    notice_title := 'Account access restored';
    notice_message := coalesce(
      nullif(trim(new.reason), ''),
      'Your OutKin account has been restored and normal access is available again.'
    );
  else
    return new;
  end if;

  insert into public.member_notices (
    user_id,
    moderation_action_id,
    notice_type,
    title,
    message
  ) values (
    new.target_user_id,
    new.id,
    notice_kind,
    notice_title,
    notice_message
  )
  on conflict (moderation_action_id) do nothing;

  return new;
end;
$$;

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
      'Your profile photo was removed because it did not meet OutKin profile-photo guidelines. Reason: '
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

-- Existing moderation history remains intact; only member-facing brand wording
-- changes. replace() leaves custom moderator-written reasons untouched unless
-- they contain the exact former product name.
update public.member_notices
set message = replace(message, 'Project PenPal', 'OutKin')
where message like '%Project PenPal%';

commit;

select
  count(*) filter (where message like '%Project PenPal%') as remaining_old_brand_notices,
  count(*) filter (where message like '%OutKin%') as outkin_branded_notices
from public.member_notices;
