-- Project PenPal: prevent administrator/moderator lockout
-- Run once in Supabase SQL Editor after add_admin_moderation.sql.
--
-- Protections:
-- 1) A moderator can never suspend or ban their own account.
-- 2) The last currently usable administrator can never be suspended or banned,
--    even if another moderator attempts the action.

create or replace function public.moderation_take_action(
  target_user uuid,
  target_report uuid,
  action text,
  reason text default null,
  suspension_hours integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  until_time timestamptz;
  target_is_admin boolean := false;
  another_usable_admin_exists boolean := false;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if action not in ('warning', 'suspend', 'ban', 'restore', 'note') then
    raise exception 'Invalid moderation action.' using errcode = 'P0001';
  end if;

  if reason is not null and char_length(reason) > 2000 then
    raise exception 'Reason must be 2000 characters or fewer.' using errcode = 'P0001';
  end if;

  -- Never allow a signed-in moderator to lock themselves out.
  if action in ('suspend', 'ban') and target_user = auth.uid() then
    raise exception 'You cannot suspend or ban your own moderator account.' using errcode = 'P0001';
  end if;

  -- If the target is an administrator, make sure another usable administrator
  -- would remain after a suspension/ban. This protects the only super-admin
  -- account from being locked out by another moderator as well.
  if action in ('suspend', 'ban') then
    select exists (
      select 1
      from public.admin_users a
      where a.user_id = target_user
        and a.role = 'admin'
    ) into target_is_admin;

    if target_is_admin then
      select exists (
        select 1
        from public.admin_users a
        where a.role = 'admin'
          and a.user_id <> target_user
          and public.account_can_interact(a.user_id)
      ) into another_usable_admin_exists;

      if not another_usable_admin_exists then
        raise exception 'This is the last usable administrator account and cannot be suspended or banned.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if action = 'suspend' then
    if suspension_hours is null or suspension_hours < 1 or suspension_hours > 2160 then
      raise exception 'Suspension must be between 1 hour and 90 days.' using errcode = 'P0001';
    end if;
    until_time := now() + make_interval(hours => suspension_hours);
    update public.profiles
    set account_status = 'suspended', suspended_until = until_time
    where id = target_user;
  elsif action = 'ban' then
    update public.profiles
    set account_status = 'banned', suspended_until = null
    where id = target_user;
  elsif action = 'restore' then
    update public.profiles
    set account_status = 'active', suspended_until = null
    where id = target_user;
  end if;

  insert into public.moderation_actions (
    moderator_id, target_user_id, report_id, action_type, reason, suspension_until
  ) values (
    auth.uid(), target_user, target_report, action, nullif(trim(reason), ''), until_time
  );

  if target_report is not null and action in ('warning', 'suspend', 'ban') then
    update public.reports
    set status = 'resolved', assigned_to = auth.uid(), reviewed_at = now()
    where id = target_report;
  end if;
end;
$$;

revoke all on function public.moderation_take_action(uuid, uuid, text, text, integer) from public;
grant execute on function public.moderation_take_action(uuid, uuid, text, text, integer) to authenticated;
