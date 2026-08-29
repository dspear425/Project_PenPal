-- Project PenPal: scalable member identity + moderator directory search
-- Run once in Supabase SQL Editor after the moderation/support migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Public/broad profile identifiers
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_customized boolean not null default false,
  add column if not exists nearest_city text;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

alter table public.profiles drop constraint if exists profiles_nearest_city_length;
alter table public.profiles add constraint profiles_nearest_city_length
  check (nearest_city is null or char_length(nearest_city) <= 80);

create unique index if not exists profiles_username_unique_ci
  on public.profiles (lower(username))
  where username is not null;

-- Existing users receive a collision-resistant temporary username. They will be
-- prompted in the app to choose a custom username before dismissing identity setup.
update public.profiles
set username = 'member_' || lower(substr(replace(id::text, '-', ''), 1, 12))
where username is null;

-- ---------------------------------------------------------------------------
-- Private account identifiers
-- Never put private surname/member code in public.profiles: discoverable profile
-- rows are intentionally readable by other authenticated members.
-- ---------------------------------------------------------------------------

create table if not exists public.private_account_info (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  private_last_name text,
  member_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_last_name_length check (private_last_name is null or char_length(private_last_name) <= 80),
  constraint member_code_format check (member_code ~ '^PP-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{4}$')
);

alter table public.private_account_info enable row level security;

grant select on table public.private_account_info to authenticated;
grant select, insert, update, delete on table public.private_account_info to service_role;

drop policy if exists "Members can read their own private account info" on public.private_account_info;
create policy "Members can read their own private account info"
on public.private_account_info for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Moderators can read private account info" on public.private_account_info;
create policy "Moderators can read private account info"
on public.private_account_info for select
to authenticated
using (public.is_moderator());

-- Deterministic from the UUID, readable, and sufficiently long to avoid practical
-- collisions while remaining much easier to communicate than a UUID.
create or replace function public.member_code_for(user_id uuid)
returns text
language sql
immutable
as $$
  select 'PP-'
    || upper(substr(md5(user_id::text), 1, 6)) || '-'
    || upper(substr(md5(user_id::text), 7, 6)) || '-'
    || upper(substr(md5(user_id::text), 13, 4));
$$;

insert into public.private_account_info (user_id, member_code)
select p.id, public.member_code_for(p.id)
from public.profiles p
on conflict (user_id) do nothing;

-- Ensure future auth users receive both records automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_username text := 'member_' || lower(substr(replace(new.id::text, '-', ''), 1, 12));
begin
  insert into public.profiles (id, username, username_customized)
  values (new.id, generated_username, false)
  on conflict (id) do update
    set username = coalesce(public.profiles.username, excluded.username);

  insert into public.private_account_info (user_id, member_code)
  values (new.id, public.member_code_for(new.id))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member identity RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_identity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  insert into public.private_account_info (user_id, member_code)
  values (auth.uid(), public.member_code_for(auth.uid()))
  on conflict (user_id) do nothing;

  select jsonb_build_object(
    'username', p.username,
    'username_customized', p.username_customized,
    'nearest_city', p.nearest_city,
    'member_code', pai.member_code,
    'private_last_name', pai.private_last_name
  ) into result
  from public.profiles p
  join public.private_account_info pai on pai.user_id = p.id
  where p.id = auth.uid();

  return result;
end;
$$;

create or replace function public.save_my_identity(
  requested_username text,
  requested_last_name text default null,
  requested_nearest_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text := lower(trim(requested_username));
  clean_last text := nullif(trim(requested_last_name), '');
  clean_city text := nullif(trim(requested_nearest_city), '');
  code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_username !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Username must be 3-30 characters and use only lowercase letters, numbers, periods, underscores, or hyphens.' using errcode = 'P0001';
  end if;

  if clean_username in ('admin', 'administrator', 'moderator', 'support', 'projectpenpal', 'project_penpal', 'penpal', 'staff') then
    raise exception 'That username is reserved. Please choose another.' using errcode = 'P0001';
  end if;

  if clean_last is not null and char_length(clean_last) > 80 then
    raise exception 'Last name must be 80 characters or fewer.' using errcode = 'P0001';
  end if;

  if clean_city is not null and char_length(clean_city) > 80 then
    raise exception 'Nearest city or metro must be 80 characters or fewer.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = clean_username and id <> auth.uid()
  ) then
    raise exception 'That username is already taken.' using errcode = 'P0001';
  end if;

  update public.profiles
  set username = clean_username,
      username_customized = true,
      nearest_city = clean_city,
      updated_at = now()
  where id = auth.uid();

  insert into public.private_account_info (user_id, private_last_name, member_code, updated_at)
  values (auth.uid(), clean_last, public.member_code_for(auth.uid()), now())
  on conflict (user_id) do update
    set private_last_name = excluded.private_last_name,
        updated_at = now();

  select member_code into code from public.private_account_info where user_id = auth.uid();

  return jsonb_build_object(
    'username', clean_username,
    'private_last_name', clean_last,
    'nearest_city', clean_city,
    'member_code', code,
    'username_customized', true
  );
end;
$$;

revoke all on function public.get_my_identity() from public;
revoke all on function public.save_my_identity(text, text, text) from public;
grant execute on function public.get_my_identity() to authenticated;
grant execute on function public.save_my_identity(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enhanced moderator directory search
-- ---------------------------------------------------------------------------

create or replace function public.moderator_search_users_v2(
  search_term text default null,
  filter_country text default null,
  filter_region text default null,
  filter_city text default null,
  filter_birth_year integer default null,
  filter_status text default null
)
returns table(
  user_id uuid,
  display_name text,
  username text,
  email text,
  private_last_name text,
  member_code text,
  country text,
  region text,
  nearest_city text,
  birth_year integer,
  account_status text,
  suspended_until timestamptz,
  joined_at timestamptz,
  report_count bigint,
  moderation_action_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := nullif(trim(search_term), '');
  country_q text := nullif(trim(filter_country), '');
  region_q text := nullif(trim(filter_region), '');
  city_q text := nullif(trim(filter_city), '');
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if q is not null and char_length(q) > 160 then
    raise exception 'Search is too long.' using errcode = 'P0001';
  end if;

  if filter_status is not null and trim(filter_status) <> '' and filter_status not in ('active', 'suspended', 'banned') then
    raise exception 'Invalid account status filter.' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.username,
    u.email::text,
    pai.private_last_name,
    pai.member_code,
    p.country,
    p.region,
    p.nearest_city,
    p.birth_year,
    p.account_status,
    p.suspended_until,
    p.created_at,
    (select count(*) from public.reports r where r.reported_id = p.id),
    (select count(*) from public.moderation_actions ma where ma.target_user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.private_account_info pai on pai.user_id = p.id
  where
    (
      q is null
      or coalesce(p.display_name, '') ilike '%' || q || '%'
      or coalesce(p.username, '') ilike '%' || lower(q) || '%'
      or coalesce(u.email::text, '') ilike '%' || q || '%'
      or coalesce(pai.private_last_name, '') ilike '%' || q || '%'
      or coalesce(pai.member_code, '') ilike '%' || upper(q) || '%'
      or p.id::text ilike '%' || q || '%'
    )
    and (country_q is null or coalesce(p.country, '') ilike '%' || country_q || '%')
    and (region_q is null or coalesce(p.region, '') ilike '%' || region_q || '%')
    and (city_q is null or coalesce(p.nearest_city, '') ilike '%' || city_q || '%')
    and (filter_birth_year is null or p.birth_year = filter_birth_year)
    and (filter_status is null or trim(filter_status) = '' or p.account_status = filter_status)
  order by
    case
      when q is not null and lower(coalesce(p.username, '')) = lower(q) then 0
      when q is not null and upper(coalesce(pai.member_code, '')) = upper(q) then 0
      when q is not null and lower(coalesce(u.email::text, '')) = lower(q) then 0
      when q is not null and lower(coalesce(p.display_name, '')) = lower(q) then 1
      else 2
    end,
    p.display_name nulls last,
    p.created_at desc
  limit 100;
end;
$$;

revoke all on function public.moderator_search_users_v2(text, text, text, text, integer, text) from public;
grant execute on function public.moderator_search_users_v2(text, text, text, text, integer, text) to authenticated;

-- Enrich the existing case-file context with private identifiers for moderators.
create or replace function public.moderator_user_context(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_row jsonb;
  report_rows jsonb;
  action_rows jsonb;
  support_rows jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'username', p.username,
    'email', u.email,
    'private_last_name', pai.private_last_name,
    'member_code', pai.member_code,
    'birth_year', p.birth_year,
    'country', p.country,
    'region', p.region,
    'nearest_city', p.nearest_city,
    'created_at', p.created_at,
    'account_status', p.account_status,
    'suspended_until', p.suspended_until,
    'onboarding_complete', p.onboarding_complete,
    'discoverable', p.discoverable
  ) into profile_row
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.private_account_info pai on pai.user_id = p.id
  where p.id = target_user;

  if profile_row is null then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into report_rows
  from (
    select id, reporter_id, category, details, status, created_at, reviewed_at
    from public.reports
    where reported_id = target_user
    order by created_at desc
    limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into action_rows
  from (
    select id, moderator_id, report_id, action_type, reason, suspension_until, created_at
    from public.moderation_actions
    where target_user_id = target_user
    order by created_at desc
    limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
  into support_rows
  from (
    select id, category, subject, status, assigned_to, created_at, updated_at
    from public.support_threads
    where user_id = target_user
    order by updated_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'profile', profile_row,
    'reports', report_rows,
    'actions', action_rows,
    'support_threads', support_rows
  );
end;
$$;

revoke all on function public.moderator_user_context(uuid) from public;
grant execute on function public.moderator_user_context(uuid) to authenticated;
