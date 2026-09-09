-- Project PenPal: convert closed beta to public early access.
-- Run after add_closed_beta_invites.sql and add_beta_operations.sql.
-- This preserves historical beta invitation/redemption data, but removes the
-- requirement that every new auth user present a beta invitation code.

-- ---------------------------------------------------------------------------
-- Open public signup.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created_require_beta_invite on auth.users;

-- Keep the existing beta invite tables/functions in place for historical audit
-- and possible future referral use. The AFTER INSERT redemption trigger is safe
-- to keep because public signups no longer send beta_invite_id metadata.

-- ---------------------------------------------------------------------------
-- Launch Ops: recent public members.
-- ---------------------------------------------------------------------------
create or replace function public.list_public_launch_members(limit_count integer default 100)
returns table(
  user_id uuid,
  email text,
  display_name text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  onboarding_complete boolean,
  account_status text,
  discoverable boolean,
  accepting_new_penpals boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  if limit_count is null or limit_count < 1 or limit_count > 500 then
    raise exception 'Limit must be between 1 and 500.' using errcode = 'P0001';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    u.created_at,
    u.last_sign_in_at,
    coalesce(p.onboarding_complete, false),
    coalesce(p.account_status, 'active')::text,
    coalesce(p.discoverable, false),
    coalesce(p.accepting_new_penpals, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.admin_users a on a.user_id = u.id
  where a.user_id is null
    and coalesce(p.staff_only, false) = false
  order by u.created_at desc
  limit limit_count;
end;
$$;

revoke all on function public.list_public_launch_members(integer) from public;
grant execute on function public.list_public_launch_members(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Launch Ops: live readiness/growth summary.
-- ---------------------------------------------------------------------------
create or replace function public.public_launch_status()
returns table(
  open_signup_enabled boolean,
  owner_staff_only boolean,
  owner_hidden_from_discovery boolean,
  feedback_channel_installed boolean,
  required_policy_count integer,
  member_count bigint,
  completed_profile_count bigint,
  discoverable_member_count bigint,
  signups_last_7_days bigint,
  feedback_thread_count bigint
)
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  return query
  with public_members as (
    select u.id, u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.admin_users a on a.user_id = u.id
    where a.user_id is null
      and coalesce(p.staff_only, false) = false
  )
  select
    not exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth'
        and c.relname = 'users'
        and t.tgname = 'on_auth_user_created_require_beta_invite'
        and not t.tgisinternal
    ),
    coalesce((
      select p.staff_only
      from public.admin_users a
      join public.profiles p on p.id = a.user_id
      where a.role = 'owner'
      limit 1
    ), false),
    coalesce((
      select (p.discoverable = false and p.accepting_new_penpals = false)
      from public.admin_users a
      join public.profiles p on p.id = a.user_id
      where a.role = 'owner'
      limit 1
    ), false),
    (to_regprocedure('public.create_support_thread(text,text,text)') is not null),
    (select count(*)::integer from public.legal_policy_versions where acceptance_required = true),
    (select count(*) from public_members),
    (select count(*) from public.profiles p join public_members m on m.id = p.id where p.onboarding_complete = true),
    (select count(*) from public.profiles p join public_members m on m.id = p.id where p.onboarding_complete = true and p.discoverable = true and p.accepting_new_penpals = true),
    (select count(*) from public_members where created_at >= now() - interval '7 days'),
    (select count(*) from public.support_threads where category = 'feedback');
end;
$$;

revoke all on function public.public_launch_status() from public;
grant execute on function public.public_launch_status() to authenticated;
