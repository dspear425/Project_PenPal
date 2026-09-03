-- Project PenPal: closed-beta operations, attribution, safe test cleanup, and readiness
-- Run after add_closed_beta_invites.sql.

-- ---------------------------------------------------------------------------
-- Admin view: which member redeemed which invitation.
-- ---------------------------------------------------------------------------
create or replace function public.list_beta_invite_redemptions(target_invite uuid default null)
returns table(
  invite_id uuid,
  invite_label text,
  user_id uuid,
  email text,
  display_name text,
  redeemed_at timestamptz,
  joined_at timestamptz,
  onboarding_complete boolean,
  account_status text,
  staff_only boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  return query
  select
    r.invite_id,
    i.label,
    r.user_id,
    u.email::text,
    p.display_name,
    r.redeemed_at,
    u.created_at,
    coalesce(p.onboarding_complete, false),
    coalesce(p.account_status, 'active')::text,
    coalesce(p.staff_only, false)
  from public.beta_invite_redemptions r
  join public.beta_invites i on i.id = r.invite_id
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where target_invite is null or r.invite_id = target_invite
  order by r.redeemed_at desc;
end;
$$;

revoke all on function public.list_beta_invite_redemptions(uuid) from public;
grant execute on function public.list_beta_invite_redemptions(uuid) to authenticated;

-- A signed-in member can tell whether this account came through the beta gate.
-- Only non-secret attribution is returned.
create or replace function public.get_my_beta_membership()
returns table(
  is_beta_member boolean,
  invite_label text,
  redeemed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    exists(select 1 from public.beta_invite_redemptions r where r.user_id = auth.uid()),
    i.label,
    r.redeemed_at
  from (select auth.uid() as user_id) me
  left join public.beta_invite_redemptions r on r.user_id = me.user_id
  left join public.beta_invites i on i.id = r.invite_id
  where me.user_id is not null;
$$;

revoke all on function public.get_my_beta_membership() from public;
grant execute on function public.get_my_beta_membership() to authenticated;

-- ---------------------------------------------------------------------------
-- Readiness checks for the Owner/Admin beta console.
-- ---------------------------------------------------------------------------
create or replace function public.beta_readiness_status()
returns table(
  beta_gate_installed boolean,
  owner_staff_only boolean,
  owner_hidden_from_discovery boolean,
  feedback_channel_installed boolean,
  required_policy_count integer,
  active_invite_count bigint,
  test_invite_count bigint,
  beta_member_count bigint,
  feedback_thread_count bigint
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  return query
  select
    exists(
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
    (select count(*) from public.beta_invites i
      where i.disabled_at is null
        and (i.expires_at is null or i.expires_at > now())
        and i.use_count < i.max_uses),
    (select count(*) from public.beta_invites i where coalesce(i.label, '') ilike '%test%'),
    (select count(*) from public.beta_invite_redemptions),
    (select count(*) from public.support_threads where category = 'feedback');
end;
$$;

revoke all on function public.beta_readiness_status() from public;
grant execute on function public.beta_readiness_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only cleanup for invitations deliberately labelled as tests.
-- The browser removes Storage objects first via the narrowly-scoped policy below.
-- Then this function removes redeemed test auth accounts and the test invite.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_beta_test_invite(
  target_invite uuid,
  confirmation text
)
returns table(deleted_accounts integer, deleted_invite uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  invite_row public.beta_invites%rowtype;
  account_count integer;
begin
  if caller is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = caller and a.role = 'owner'
  ) then
    raise exception 'Owner access required.' using errcode = 'P0001';
  end if;

  if confirmation <> 'DELETE TEST BETA DATA' then
    raise exception 'Confirmation phrase does not match.' using errcode = 'P0001';
  end if;

  select * into invite_row
  from public.beta_invites
  where id = target_invite
  for update;

  if not found then
    raise exception 'Invitation not found.' using errcode = 'P0001';
  end if;

  if coalesce(invite_row.label, '') not ilike '%test%' then
    raise exception 'Only invitations whose label contains "test" can use this cleanup.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.beta_invite_redemptions r
    join public.admin_users a on a.user_id = r.user_id
    where r.invite_id = target_invite
  ) then
    raise exception 'This invitation was redeemed by a staff account and cannot be cleaned up here.' using errcode = 'P0001';
  end if;

  select count(*)::integer into account_count
  from public.beta_invite_redemptions
  where invite_id = target_invite;

  delete from auth.users u
  where u.id in (
    select r.user_id
    from public.beta_invite_redemptions r
    where r.invite_id = target_invite
  );

  -- Redemptions cascade with auth-user deletion, so the invite can now be removed.
  delete from public.beta_invites where id = target_invite;

  return query select account_count, target_invite;
end;
$$;

revoke all on function public.cleanup_beta_test_invite(uuid, text) from public;
grant execute on function public.cleanup_beta_test_invite(uuid, text) to authenticated;

-- Allow ONLY the protected Owner to remove profile-photo Storage objects belonging
-- to users who redeemed an invitation explicitly labelled as a test. The frontend
-- uses Supabase Storage's remove API; this policy does not delete storage.objects
-- directly in SQL.
drop policy if exists "Owner removes beta test profile photos" on storage.objects;
create policy "Owner removes beta test profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.admin_users owner_role
    where owner_role.user_id = auth.uid()
      and owner_role.role = 'owner'
  )
  and exists (
    select 1
    from public.beta_invite_redemptions r
    join public.beta_invites i on i.id = r.invite_id
    where r.user_id::text = (storage.foldername(name))[1]
      and coalesce(i.label, '') ilike '%test%'
  )
);
