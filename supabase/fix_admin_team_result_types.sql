-- Project PenPal: repair Admin Team RPC return types
-- Run once after add_owner_admin_team_fixed.sql if Admin Team shows
-- "structure of query does not match function result type".
--
-- PostgreSQL PL/pgSQL RETURNS TABLE functions require each RETURN QUERY column
-- to match the declared type exactly. auth.users.email can be varchar rather
-- than text, so these functions cast all text outputs explicitly.

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
    a.user_id::uuid,
    p.display_name::text,
    p.username::text,
    u.email::text,
    a.role::text,
    p.account_status::text,
    a.created_at::timestamptz,
    a.updated_at::timestamptz,
    a.added_by::uuid,
    adder.display_name::text
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
    sra.id::uuid,
    sra.actor_user_id::uuid,
    actor.display_name::text,
    sra.target_user_id::uuid,
    target.display_name::text,
    sra.previous_role::text,
    sra.new_role::text,
    sra.reason::text,
    sra.created_at::timestamptz
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
  "current_role" text,
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
    p.id::uuid,
    p.display_name::text,
    p.username::text,
    u.email::text,
    pai.member_code::text,
    p.country::text,
    a.role::text,
    p.account_status::text
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.private_account_info pai on pai.user_id = p.id
  left join public.admin_users a on a.user_id = p.id
  where lower(coalesce(p.display_name, '')) like '%' || q || '%'
     or lower(coalesce(p.username, '')) like '%' || ltrim(q, '@') || '%'
     or lower(coalesce(u.email::text, '')) like '%' || q || '%'
     or upper(coalesce(pai.member_code::text, '')) = upper(trim(search_term))
     or p.id::text = q
  order by case when lower(coalesce(u.email::text, '')) = q then 0 else 1 end,
           coalesce(p.display_name::text, p.username::text, u.email::text)
  limit 25;
end;
$$;

revoke all on function public.admin_team_directory() from public;
revoke all on function public.admin_team_audit(integer) from public;
revoke all on function public.admin_team_search(text) from public;

grant execute on function public.admin_team_directory() to authenticated;
grant execute on function public.admin_team_audit(integer) to authenticated;
grant execute on function public.admin_team_search(text) to authenticated;
