-- Project PenPal: protected Owner role, staff management, and role-based moderation
-- Run once in Supabase SQL Editor after protect_admin_self_lockout.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Staff roles
-- ---------------------------------------------------------------------------

alter table public.admin_users
  drop constraint if exists admin_users_role;

alter table public.admin_users
  add column if not exists added_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- The existing installation has one administrator. Promote the oldest admin to
-- the protected Owner role if an Owner does not exist yet. This is duplicate-safe.
update public.admin_users
set role = 'owner', updated_at = now()
where user_id = (
  select a.user_id
  from public.admin_users a
  where a.role = 'admin'
  order by a.created_at, a.user_id
  limit 1
)
and not exists (select 1 from public.admin_users where role = 'owner');

alter table public.admin_users
  add constraint admin_users_role
  check (role in ('moderator', 'admin', 'owner'));

-- Exactly one protected Owner account is supported for now.
create unique index if not exists admin_users_single_owner
  on public.admin_users ((role))
  where role = 'owner';

create table if not exists public.staff_role_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  previous_role text,
  new_role text,
  reason text,
  created_at timestamptz not null default now(),
  constraint staff_role_actions_previous check (previous_role is null or previous_role in ('moderator', 'admin', 'owner')),
  constraint staff_role_actions_new check (new_role is null or new_role in ('moderator', 'admin', 'owner')),
  constraint staff_role_actions_reason_length check (reason is null or char_length(reason) <= 1000)
);

create index if not exists staff_role_actions_target_idx
  on public.staff_role_actions(target_user_id, created_at desc);
create index if not exists staff_role_actions_created_idx
  on public.staff_role_actions(created_at desc);

alter table public.staff_role_actions enable row level security;
revoke all on table public.staff_role_actions from anon, authenticated;
grant select, insert, update, delete on table public.staff_role_actions to service_role;

-- ---------------------------------------------------------------------------
-- Role helpers. A restricted staff account does not retain moderation powers.
-- ---------------------------------------------------------------------------

create or replace function public.staff_role(check_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.role
  from public.admin_users a
  join public.profiles p on p.id = a.user_id
  where a.user_id = check_user
    and (
      p.account_status = 'active'
      or (p.account_status = 'suspended' and p.suspended_until is not null and p.suspended_until <= now())
    )
  limit 1;
$$;

create or replace function public.is_moderator(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role(check_user) in ('moderator', 'admin', 'owner'), false);
$$;

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role(check_user) in ('admin', 'owner'), false);
$$;

create or replace function public.is_owner(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role(check_user) = 'owner', false);
$$;

revoke all on function public.staff_role(uuid) from public;
revoke all on function public.is_moderator(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_owner(uuid) from public;
grant execute on function public.staff_role(uuid) to authenticated;
grant execute on function public.is_moderator(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;

-- Keep the direct table read private to each staff member. Team information is
-- intentionally returned through guarded RPCs below.
drop policy if exists "Members can see their own moderator role" on public.admin_users;
create policy "Members can see their own moderator role"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin Team directory and audit log
-- ---------------------------------------------------------------------------

create or replace function public.admin_team_directory()
returns table(
  user_id uuid,
  display_name text,
  username text,
  email text,
  role text,
  account_status text,
  created_at timestamptz,
  updated_at timestamptz,
  added_by uuid,
  added_by_name text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_moderator() then
    raise exception 'Staff access required.' using errcode = 'P0001';
  end if;

  return query
  select
    a.user_id,
    p.display_name,
    p.username,
    u.email,
    a.role,
    p.account_status,
    a.created_at,
    a.updated_at,
    a.added_by,
    adder.display_name
  from public.admin_users a
  join public.profiles p on p.id = a.user_id
  join auth.users u on u.id = a.user_id
  left join public.profiles adder on adder.id = a.added_by
  order by case a.role when 'owner' then 1 when 'admin' then 2 else 3 end, a.created_at;
end;
$$;

create or replace function public.admin_team_audit(limit_rows integer default 50)
returns table(
  id uuid,
  actor_user_id uuid,
  actor_name text,
  target_user_id uuid,
  target_name text,
  previous_role text,
  new_role text,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  return query
  select
    sra.id,
    sra.actor_user_id,
    actor.display_name,
    sra.target_user_id,
    target.display_name,
    sra.previous_role,
    sra.new_role,
    sra.reason,
    sra.created_at
  from public.staff_role_actions sra
  left join public.profiles actor on actor.id = sra.actor_user_id
  join public.profiles target on target.id = sra.target_user_id
  order by sra.created_at desc
  limit greatest(1, least(coalesce(limit_rows, 50), 200));
end;
$$;

create or replace function public.admin_team_search(search_term text)
returns table(
  user_id uuid,
  display_name text,
  username text,
  email text,
  member_code text,
  country text,
  current_role text,
  account_status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := lower(trim(search_term));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  if char_length(q) < 2 then
    raise exception 'Enter at least 2 characters.' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.username,
    u.email,
    pai.member_code,
    p.country,
    a.role,
    p.account_status
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.private_account_info pai on pai.user_id = p.id
  left join public.admin_users a on a.user_id = p.id
  where lower(coalesce(p.display_name, '')) like '%' || q || '%'
     or lower(coalesce(p.username, '')) like '%' || ltrim(q, '@') || '%'
     or lower(coalesce(u.email, '')) like '%' || q || '%'
     or lower(coalesce(pai.member_code, '')) = upper(q)
     or p.id::text = q
  order by case when lower(coalesce(u.email, '')) = q then 0 else 1 end,
           coalesce(p.display_name, p.username, u.email)
  limit 25;
end;
$$;

create or replace function public.manage_staff_role(
  target_user uuid,
  requested_role text,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_role text := public.staff_role(caller);
  old_role text;
  new_role text := nullif(lower(trim(requested_role)), '');
  clean_reason text := nullif(trim(change_reason), '');
  target_status text;
begin
  if caller_role not in ('admin', 'owner') then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if clean_reason is null or char_length(clean_reason) < 3 then
    raise exception 'Add a short reason for the staff-role change.' using errcode = 'P0001';
  end if;

  if char_length(clean_reason) > 1000 then
    raise exception 'Reason must be 1000 characters or fewer.' using errcode = 'P0001';
  end if;

  if new_role is not null and new_role not in ('moderator', 'admin') then
    raise exception 'Staff role must be moderator or admin.' using errcode = 'P0001';
  end if;

  select a.role into old_role from public.admin_users a where a.user_id = target_user;
  select p.account_status into target_status from public.profiles p where p.id = target_user;

  -- The Owner role is deliberately immutable through ordinary administration.
  if old_role = 'owner' then
    raise exception 'The protected Owner account cannot be changed from Admin Team.' using errcode = 'P0001';
  end if;

  if target_user = caller then
    raise exception 'You cannot change your own staff role.' using errcode = 'P0001';
  end if;

  if target_status <> 'active' and new_role is not null then
    raise exception 'Restore the member account before assigning a staff role.' using errcode = 'P0001';
  end if;

  if caller_role = 'admin' then
    if old_role = 'admin' then
      raise exception 'Only the Owner can change another administrator.' using errcode = 'P0001';
    end if;
    if new_role = 'admin' then
      raise exception 'Only the Owner can appoint administrators.' using errcode = 'P0001';
    end if;
  end if;

  if old_role is not distinct from new_role then
    raise exception 'That member already has this staff role.' using errcode = 'P0001';
  end if;

  if new_role is null then
    delete from public.admin_users where user_id = target_user;
  else
    insert into public.admin_users (user_id, role, added_by, created_at, updated_at)
    values (target_user, new_role, caller, now(), now())
    on conflict (user_id) do update
      set role = excluded.role,
          added_by = caller,
          updated_at = now();
  end if;

  insert into public.staff_role_actions (
    actor_user_id, target_user_id, previous_role, new_role, reason
  ) values (
    caller, target_user, old_role, new_role, clean_reason
  );
end;
$$;

revoke all on function public.admin_team_directory() from public;
revoke all on function public.admin_team_audit(integer) from public;
revoke all on function public.admin_team_search(text) from public;
revoke all on function public.manage_staff_role(uuid, text, text) from public;
grant execute on function public.admin_team_directory() to authenticated;
grant execute on function public.admin_team_audit(integer) to authenticated;
grant execute on function public.admin_team_search(text) to authenticated;
grant execute on function public.manage_staff_role(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Role-based moderation enforcement
-- Moderator: warning, temporary suspension, internal note.
-- Admin/Owner: all of the above plus ban and restore.
-- Owner cannot be restricted by normal moderation actions.
-- ---------------------------------------------------------------------------

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
  actor_role text := public.staff_role(auth.uid());
  target_role text;
  clean_reason text := nullif(trim(reason), '');
begin
  if actor_role not in ('moderator', 'admin', 'owner') then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if action not in ('warning', 'suspend', 'ban', 'restore', 'note') then
    raise exception 'Invalid moderation action.' using errcode = 'P0001';
  end if;

  if action in ('warning', 'suspend', 'ban') and clean_reason is null then
    raise exception 'A reason is required for this moderation action.' using errcode = 'P0001';
  end if;

  if reason is not null and char_length(reason) > 2000 then
    raise exception 'Reason must be 2000 characters or fewer.' using errcode = 'P0001';
  end if;

  if actor_role = 'moderator' and action in ('ban', 'restore') then
    raise exception 'Moderators cannot ban or restore accounts. An administrator is required.' using errcode = 'P0001';
  end if;

  select a.role into target_role from public.admin_users a where a.user_id = target_user;

  if target_role = 'owner' and action in ('suspend', 'ban') then
    raise exception 'The protected Owner account cannot be suspended or banned.' using errcode = 'P0001';
  end if;

  if action in ('suspend', 'ban') and target_user = auth.uid() then
    raise exception 'You cannot suspend or ban your own staff account.' using errcode = 'P0001';
  end if;

  -- Moderators cannot police other staff accounts. Admins cannot take account
  -- action against peer administrators or the Owner; the Owner manages staff.
  if target_role is not null then
    if actor_role = 'moderator' then
      raise exception 'Moderators cannot take account actions against staff accounts.' using errcode = 'P0001';
    elsif actor_role = 'admin' and target_role in ('admin', 'owner') then
      raise exception 'Only the Owner can take account action involving administrators.' using errcode = 'P0001';
    end if;
  end if;

  if action = 'suspend' then
    if suspension_hours is null or suspension_hours < 1 or suspension_hours > 2160 then
      raise exception 'Suspension must be between 1 hour and 90 days.' using errcode = 'P0001';
    end if;
    until_time := now() + make_interval(hours => suspension_hours);
    update public.profiles set account_status = 'suspended', suspended_until = until_time where id = target_user;
  elsif action = 'ban' then
    update public.profiles set account_status = 'banned', suspended_until = null where id = target_user;
  elsif action = 'restore' then
    update public.profiles set account_status = 'active', suspended_until = null where id = target_user;
  end if;

  insert into public.moderation_actions (
    moderator_id, target_user_id, report_id, action_type, reason, suspension_until
  ) values (
    auth.uid(), target_user, target_report, action, clean_reason, until_time
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
