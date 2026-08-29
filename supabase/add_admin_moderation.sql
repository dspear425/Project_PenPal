-- Project PenPal: private admin/moderation system
-- Run this file once in the Supabase SQL Editor for an existing project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Moderator roles and account restriction state
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'moderator',
  created_at timestamptz not null default now(),
  constraint admin_users_role check (role in ('moderator', 'admin'))
);

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_until timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_status;

alter table public.profiles
  add constraint profiles_account_status
  check (account_status in ('active', 'suspended', 'banned'));

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  action_type text not null,
  reason text,
  suspension_until timestamptz,
  created_at timestamptz not null default now(),
  constraint moderation_actions_type check (action_type in ('warning', 'suspend', 'ban', 'restore', 'note')),
  constraint moderation_actions_reason_length check (reason is null or char_length(reason) <= 2000)
);

create index if not exists moderation_actions_target_idx
  on public.moderation_actions(target_user_id, created_at desc);
create index if not exists moderation_actions_report_idx
  on public.moderation_actions(report_id, created_at desc);

alter table public.reports
  add column if not exists moderator_notes text,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.admin_users enable row level security;
alter table public.moderation_actions enable row level security;

grant select on table public.admin_users to authenticated;
grant select on table public.moderation_actions to authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;
grant select, insert, update, delete on table public.moderation_actions to service_role;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_moderator(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = check_user
      and a.role in ('moderator', 'admin')
  );
$$;

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = check_user
      and a.role = 'admin'
  );
$$;

revoke all on function public.is_moderator(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_moderator(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists "Members can see their own moderator role" on public.admin_users;
create policy "Members can see their own moderator role"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Moderators can read moderation actions" on public.moderation_actions;
create policy "Moderators can read moderation actions"
on public.moderation_actions for select
to authenticated
using (public.is_moderator());

-- Moderators need to review all submitted reports. Reporters retain the existing
-- policy that lets them see reports they personally submitted.
drop policy if exists "Moderators can review reports" on public.reports;
create policy "Moderators can review reports"
on public.reports for select
to authenticated
using (public.is_moderator());

-- Moderators may inspect member profiles even when normal discovery rules hide
-- them. This is SELECT only; moderation writes go through guarded RPC functions.
drop policy if exists "Moderators can review profiles" on public.profiles;
create policy "Moderators can review profiles"
on public.profiles for select
to authenticated
using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Account interaction enforcement
-- ---------------------------------------------------------------------------

create or replace function public.account_can_interact(check_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.account_status = 'active' then true
      when p.account_status = 'suspended' and p.suspended_until is not null and p.suspended_until <= now() then true
      else false
    end
    from public.profiles p
    where p.id = check_user
  ), false);
$$;

revoke all on function public.account_can_interact(uuid) from public;
grant execute on function public.account_can_interact(uuid) to authenticated;

-- Automatically clear an expired temporary suspension when that member next
-- opens the app. A banned account is never changed by this function.
create or replace function public.refresh_my_account_status()
returns table(account_status text, suspended_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.profiles p
  set account_status = 'active', suspended_until = null
  where p.id = auth.uid()
    and p.account_status = 'suspended'
    and p.suspended_until is not null
    and p.suspended_until <= now();

  return query
  select p.account_status, p.suspended_until
  from public.profiles p
  where p.id = auth.uid();
end;
$$;

revoke all on function public.refresh_my_account_status() from public;
grant execute on function public.refresh_my_account_status() to authenticated;

create or replace function public.enforce_active_letter_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.account_can_interact(new.sender_id) then
    raise exception 'This account is temporarily unable to send letters.' using errcode = 'P0001';
  end if;

  if not public.account_can_interact(new.recipient_id) then
    raise exception 'This member is not currently available for correspondence.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists letters_active_accounts on public.letters;
create trigger letters_active_accounts
before insert on public.letters
for each row execute procedure public.enforce_active_letter_sender();

create or replace function public.enforce_active_connection_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'accepted') then
    if not public.account_can_interact(new.sender_id) then
      raise exception 'The sender account is not currently available for new connections.' using errcode = 'P0001';
    end if;

    if not public.account_can_interact(new.recipient_id) then
      raise exception 'This member is not currently available for new connections.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists penpal_requests_active_accounts on public.penpal_requests;
create trigger penpal_requests_active_accounts
before insert or update of status on public.penpal_requests
for each row execute procedure public.enforce_active_connection_accounts();

-- Normal discovery should never expose suspended or banned members. Existing
-- relationship history remains visible unless the pair is blocked.
drop policy if exists "Profiles are visible to their owner and discovery" on public.profiles;
create policy "Profiles are visible to their owner and discovery"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (
    not public.users_are_blocked(auth.uid(), id)
    and (
      (account_status = 'active' and discoverable = true and onboarding_complete = true)
      or exists (
        select 1
        from public.penpal_requests pr
        where pr.status in ('accepted', 'paused', 'ended')
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
        and (
          (p.account_status = 'active' and p.discoverable = true and p.onboarding_complete = true)
          or exists (
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
-- Moderation report context
-- ---------------------------------------------------------------------------

create or replace function public.moderation_report_context(target_report uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reports%rowtype;
  rel jsonb;
  letter_rows jsonb;
  action_rows jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  select * into r from public.reports where id = target_report;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0001';
  end if;

  if r.relationship_id is not null then
    select to_jsonb(pr) into rel
    from public.penpal_requests pr
    where pr.id = r.relationship_id;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
    into letter_rows
    from (
      select l.id, l.sender_id, l.recipient_id, l.subject, l.body, l.created_at, l.read_at
      from public.letters l
      where l.relationship_id = r.relationship_id
      order by l.created_at desc
      limit 20
    ) x;
  else
    rel := null;
    letter_rows := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into action_rows
  from (
    select ma.id, ma.moderator_id, ma.action_type, ma.reason, ma.suspension_until, ma.created_at
    from public.moderation_actions ma
    where ma.target_user_id = r.reported_id
    order by ma.created_at desc
    limit 30
  ) a;

  return jsonb_build_object(
    'report', to_jsonb(r),
    'relationship', rel,
    'letters', coalesce(letter_rows, '[]'::jsonb),
    'actions', coalesce(action_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.moderation_report_context(uuid) from public;
grant execute on function public.moderation_report_context(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderator actions
-- ---------------------------------------------------------------------------

create or replace function public.moderation_update_report(
  target_report uuid,
  new_status text,
  notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if new_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status.' using errcode = 'P0001';
  end if;

  if notes is not null and char_length(notes) > 4000 then
    raise exception 'Moderator notes must be 4000 characters or fewer.' using errcode = 'P0001';
  end if;

  update public.reports
  set status = new_status,
      moderator_notes = coalesce(notes, moderator_notes),
      assigned_to = case when new_status = 'open' then assigned_to else auth.uid() end,
      reviewed_at = case when new_status in ('resolved', 'dismissed') then now() else reviewed_at end
  where id = target_report;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0001';
  end if;
end;
$$;

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

revoke all on function public.moderation_update_report(uuid, text, text) from public;
revoke all on function public.moderation_take_action(uuid, uuid, text, text, integer) from public;
grant execute on function public.moderation_update_report(uuid, text, text) to authenticated;
grant execute on function public.moderation_take_action(uuid, uuid, text, text, integer) to authenticated;
