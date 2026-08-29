-- Project PenPal: member-facing moderation notices
-- Run this file once in the Supabase SQL Editor after add_admin_moderation.sql.

create extension if not exists pgcrypto;

create table if not exists public.member_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  moderation_action_id uuid unique references public.moderation_actions(id) on delete set null,
  notice_type text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint member_notices_type check (notice_type in ('warning', 'suspension', 'ban', 'restored')),
  constraint member_notices_title_length check (char_length(title) between 1 and 160),
  constraint member_notices_message_length check (char_length(message) between 1 and 2500)
);

create index if not exists member_notices_user_created_idx
  on public.member_notices(user_id, created_at desc);
create index if not exists member_notices_unread_idx
  on public.member_notices(user_id, acknowledged_at)
  where acknowledged_at is null;

alter table public.member_notices enable row level security;

grant select, update on table public.member_notices to authenticated;
grant select, insert, update, delete on table public.member_notices to service_role;

-- Members can read only their own notices.
drop policy if exists "Members can read their moderation notices" on public.member_notices;
create policy "Members can read their moderation notices"
on public.member_notices for select
to authenticated
using (user_id = auth.uid());

-- Members may only acknowledge their own notices. They cannot change the title,
-- message, type, recipient, or moderation action reference through this policy.
drop policy if exists "Members can acknowledge their moderation notices" on public.member_notices;
create policy "Members can acknowledge their moderation notices"
on public.member_notices for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Use a guarded RPC for acknowledgement so the browser never gets a generic
-- update path that could modify notice text.
revoke update on table public.member_notices from authenticated;

create or replace function public.acknowledge_member_notice(target_notice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.member_notices
  set acknowledged_at = coalesce(acknowledged_at, now())
  where id = target_notice
    and user_id = auth.uid();

  if not found then
    raise exception 'Notice not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.acknowledge_member_notice(uuid) from public;
grant execute on function public.acknowledge_member_notice(uuid) to authenticated;

-- Automatically convert moderation actions into member-facing notices. Internal
-- moderator notes intentionally do not generate notices.
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
      'A Project PenPal moderator issued a warning about activity on your account. Please review our community expectations before continuing.'
    );
  elsif new.action_type = 'suspend' then
    notice_kind := 'suspension';
    notice_title := 'Account temporarily suspended';
    notice_message := concat(
      coalesce(nullif(trim(new.reason), ''), 'Your account has been temporarily suspended by Project PenPal moderation.'),
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
      'Your Project PenPal account has been banned by moderation.'
    );
  elsif new.action_type = 'restore' then
    notice_kind := 'restored';
    notice_title := 'Account access restored';
    notice_message := coalesce(
      nullif(trim(new.reason), ''),
      'Your Project PenPal account has been restored and normal access is available again.'
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

drop trigger if exists moderation_action_member_notice on public.moderation_actions;
create trigger moderation_action_member_notice
after insert on public.moderation_actions
for each row execute procedure public.create_member_notice_from_moderation_action();

-- Backfill prior warning/suspend/ban/restore actions so existing test moderation
-- actions can be used immediately to verify the member-facing experience.
insert into public.member_notices (
  user_id,
  moderation_action_id,
  notice_type,
  title,
  message,
  created_at
)
select
  ma.target_user_id,
  ma.id,
  case ma.action_type
    when 'warning' then 'warning'
    when 'suspend' then 'suspension'
    when 'ban' then 'ban'
    when 'restore' then 'restored'
  end,
  case ma.action_type
    when 'warning' then 'Account warning'
    when 'suspend' then 'Account temporarily suspended'
    when 'ban' then 'Account banned'
    when 'restore' then 'Account access restored'
  end,
  case ma.action_type
    when 'warning' then coalesce(nullif(trim(ma.reason), ''), 'A Project PenPal moderator issued a warning about activity on your account. Please review our community expectations before continuing.')
    when 'suspend' then concat(
      coalesce(nullif(trim(ma.reason), ''), 'Your account has been temporarily suspended by Project PenPal moderation.'),
      case when ma.suspension_until is not null then ' The suspension is scheduled to end on ' || to_char(ma.suspension_until at time zone 'UTC', 'Mon DD, YYYY at HH24:MI "UTC"') || '.' else '' end
    )
    when 'ban' then coalesce(nullif(trim(ma.reason), ''), 'Your Project PenPal account has been banned by moderation.')
    when 'restore' then coalesce(nullif(trim(ma.reason), ''), 'Your Project PenPal account has been restored and normal access is available again.')
  end,
  ma.created_at
from public.moderation_actions ma
where ma.action_type in ('warning', 'suspend', 'ban', 'restore')
on conflict (moderation_action_id) do nothing;
