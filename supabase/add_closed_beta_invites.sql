-- Project PenPal: closed-beta invitation gating and admin invite management
-- Run once after the Owner/Admin Team and legal-policy migrations.
-- Existing accounts are unaffected. Every NEW auth user must redeem a valid invite.

create extension if not exists pgcrypto;

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  label text,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  expires_at timestamptz,
  disabled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint beta_invites_label_length check (label is null or char_length(label) <= 100),
  constraint beta_invites_max_uses check (max_uses between 1 and 100),
  constraint beta_invites_use_count check (use_count >= 0 and use_count <= max_uses)
);

create table if not exists public.beta_invite_redemptions (
  invite_id uuid not null references public.beta_invites(id) on delete restrict,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

create index if not exists beta_invites_created_idx
  on public.beta_invites(created_at desc);
create index if not exists beta_invite_redemptions_invite_idx
  on public.beta_invite_redemptions(invite_id, redeemed_at desc);

alter table public.beta_invites enable row level security;
alter table public.beta_invite_redemptions enable row level security;

-- Invite hashes and redemption records are never directly exposed to browser clients.
revoke all on public.beta_invites from anon, authenticated;
revoke all on public.beta_invite_redemptions from anon, authenticated;
grant select, insert, update, delete on public.beta_invites to service_role;
grant select, insert, update, delete on public.beta_invite_redemptions to service_role;

create or replace function public.normalize_beta_invite_code(input_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(input_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

revoke all on function public.normalize_beta_invite_code(text) from public;

-- Friendly preflight check for the signup UI. This is NOT the security boundary;
-- the auth.users BEFORE INSERT trigger below validates again under a row lock.
create or replace function public.check_beta_invite(invite_code text)
returns table(valid boolean, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := public.normalize_beta_invite_code(invite_code);
  invite_row public.beta_invites%rowtype;
begin
  if char_length(normalized) < 8 then
    return query select false, 'Enter the invitation code you received.'::text;
    return;
  end if;

  select * into invite_row
  from public.beta_invites bi
  where bi.code_hash = digest(normalized, 'sha256')
  limit 1;

  if not found
     or invite_row.disabled_at is not null
     or (invite_row.expires_at is not null and invite_row.expires_at <= now())
     or invite_row.use_count >= invite_row.max_uses then
    return query select false, 'This invitation is invalid or no longer available.'::text;
    return;
  end if;

  return query select true, 'Invitation accepted.'::text;
end;
$$;

revoke all on function public.check_beta_invite(text) from public;
grant execute on function public.check_beta_invite(text) to anon, authenticated;

-- Admin/Owner creates a code. Only the SHA-256 hash is persisted; the raw code is
-- returned once to the caller and cannot be recovered from the database later.
create or replace function public.create_beta_invite(
  invite_label text default null,
  allowed_uses integer default 1,
  expires_days integer default 14
)
returns table(
  invite_id uuid,
  invite_code text,
  label text,
  max_uses integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller uuid := auth.uid();
  clean_label text := nullif(trim(invite_label), '');
  token text;
  raw_code text;
  new_id uuid;
  expiry timestamptz;
begin
  if caller is null or not public.is_admin(caller) then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  if allowed_uses is null or allowed_uses < 1 or allowed_uses > 100 then
    raise exception 'Invite uses must be between 1 and 100.' using errcode = 'P0001';
  end if;

  if expires_days is not null and (expires_days < 1 or expires_days > 365) then
    raise exception 'Invite expiration must be between 1 and 365 days, or blank for no expiration.' using errcode = 'P0001';
  end if;

  if clean_label is not null and char_length(clean_label) > 100 then
    raise exception 'Invite label must be 100 characters or fewer.' using errcode = 'P0001';
  end if;

  expiry := case when expires_days is null then null else now() + make_interval(days => expires_days) end;

  loop
    token := upper(encode(gen_random_bytes(10), 'hex'));
    raw_code := 'PP-' || substr(token, 1, 4) || '-' || substr(token, 5, 4) || '-' || substr(token, 9, 4) || '-' || substr(token, 13, 4) || '-' || substr(token, 17, 4);

    begin
      insert into public.beta_invites (
        code_hash, label, max_uses, use_count, expires_at, created_by
      ) values (
        digest(public.normalize_beta_invite_code(raw_code), 'sha256'),
        clean_label,
        allowed_uses,
        0,
        expiry,
        caller
      ) returning id into new_id;
      exit;
    exception when unique_violation then
      -- Cryptographically improbable, but generate another code rather than fail.
    end;
  end loop;

  return query
  select new_id, raw_code, clean_label, allowed_uses, expiry;
end;
$$;

create or replace function public.list_beta_invites()
returns table(
  id uuid,
  label text,
  max_uses integer,
  use_count integer,
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  return query
  select
    bi.id,
    bi.label,
    bi.max_uses,
    bi.use_count,
    bi.expires_at,
    bi.disabled_at,
    bi.created_at,
    bi.created_by,
    p.display_name
  from public.beta_invites bi
  left join public.profiles p on p.id = bi.created_by
  order by bi.created_at desc;
end;
$$;

create or replace function public.disable_beta_invite(target_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = 'P0001';
  end if;

  update public.beta_invites
  set disabled_at = coalesce(disabled_at, now())
  where id = target_invite;

  if not found then
    raise exception 'Invitation not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.create_beta_invite(text, integer, integer) from public;
revoke all on function public.list_beta_invites() from public;
revoke all on function public.disable_beta_invite(uuid) from public;
grant execute on function public.create_beta_invite(text, integer, integer) to authenticated;
grant execute on function public.list_beta_invites() to authenticated;
grant execute on function public.disable_beta_invite(uuid) to authenticated;

-- Hard security boundary for public signup. The invite row is locked so two
-- simultaneous signups cannot both consume the last remaining use.
create or replace function public.enforce_beta_invite_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  raw_code text := new.raw_user_meta_data ->> 'beta_invite_code';
  normalized text := public.normalize_beta_invite_code(raw_code);
  invite_row public.beta_invites%rowtype;
begin
  if char_length(normalized) < 8 then
    raise exception 'A valid Project PenPal beta invitation is required.' using errcode = 'P0001';
  end if;

  select * into invite_row
  from public.beta_invites bi
  where bi.code_hash = digest(normalized, 'sha256')
  for update;

  if not found
     or invite_row.disabled_at is not null
     or (invite_row.expires_at is not null and invite_row.expires_at <= now())
     or invite_row.use_count >= invite_row.max_uses then
    raise exception 'A valid Project PenPal beta invitation is required.' using errcode = 'P0001';
  end if;

  update public.beta_invites
  set use_count = use_count + 1
  where id = invite_row.id;

  -- Remove the raw secret immediately. Keep only the non-secret invite id so the
  -- AFTER INSERT trigger can create an auditable redemption record.
  new.raw_user_meta_data :=
    (coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'beta_invite_code')
    || jsonb_build_object('beta_invite_id', invite_row.id::text);

  return new;
end;
$$;

create or replace function public.record_beta_invite_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  redeemed_invite uuid;
begin
  redeemed_invite := nullif(new.raw_user_meta_data ->> 'beta_invite_id', '')::uuid;

  if redeemed_invite is not null then
    insert into public.beta_invite_redemptions(invite_id, user_id, redeemed_at)
    values (redeemed_invite, new.id, now())
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_beta_invite_signup() from public;
revoke all on function public.record_beta_invite_redemption() from public;

drop trigger if exists on_auth_user_created_require_beta_invite on auth.users;
create trigger on_auth_user_created_require_beta_invite
before insert on auth.users
for each row execute function public.enforce_beta_invite_signup();

drop trigger if exists on_auth_user_created_record_beta_invite on auth.users;
create trigger on_auth_user_created_record_beta_invite
after insert on auth.users
for each row execute function public.record_beta_invite_redemption();
