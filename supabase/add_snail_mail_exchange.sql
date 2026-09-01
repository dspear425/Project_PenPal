-- Project PenPal: snail-mail preferences + private mutual address exchange
-- Run once in Supabase SQL Editor after the relationship/safety migrations.
-- Mailing addresses are deliberately kept out of public.profiles and are available
-- only through guarded SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Public, non-sensitive snail-mail preferences
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists correspondence_method text not null default 'digital',
  add column if not exists international_snail_mail boolean not null default false;

alter table public.profiles drop constraint if exists profiles_correspondence_method;
alter table public.profiles add constraint profiles_correspondence_method
  check (correspondence_method in ('digital', 'both', 'snail_mail'));

-- Existing members who already selected the snail-mail friendship goal are
-- treated as open to both formats instead of silently defaulting to digital-only.
update public.profiles
set correspondence_method = 'both'
where correspondence_method = 'digital'
  and 'snail-mail' = any(coalesce(friendship_goals, '{}'::text[]));

create or replace function public.save_snail_mail_preferences(
  preference text,
  international_ok boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean_preference text := lower(trim(preference));
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_preference not in ('digital', 'both', 'snail_mail') then
    raise exception 'Choose a valid correspondence preference.' using errcode = 'P0001';
  end if;

  update public.profiles
  set correspondence_method = clean_preference,
      international_snail_mail = case when clean_preference = 'digital' then false else coalesce(international_ok, false) end,
      updated_at = now()
  where id = caller;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.save_snail_mail_preferences(text, boolean) from public;
grant execute on function public.save_snail_mail_preferences(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Private address vault and per-relationship sharing
-- ---------------------------------------------------------------------------

create table if not exists public.mailing_addresses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recipient_name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  region text,
  postal_code text,
  country text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailing_addresses_recipient_name_length check (char_length(recipient_name) between 1 and 120),
  constraint mailing_addresses_line1_length check (char_length(address_line1) between 1 and 160),
  constraint mailing_addresses_line2_length check (address_line2 is null or char_length(address_line2) <= 160),
  constraint mailing_addresses_city_length check (char_length(city) between 1 and 120),
  constraint mailing_addresses_region_length check (region is null or char_length(region) <= 120),
  constraint mailing_addresses_postal_length check (postal_code is null or char_length(postal_code) <= 32),
  constraint mailing_addresses_country_length check (char_length(country) between 1 and 80)
);

create table if not exists public.snail_mail_exchanges (
  relationship_id uuid primary key references public.penpal_requests(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint snail_mail_exchange_people_different check (requested_by <> recipient_id),
  constraint snail_mail_exchange_status check (status in ('pending', 'accepted', 'declined', 'cancelled', 'revoked'))
);

create table if not exists public.snail_mail_address_shares (
  relationship_id uuid not null references public.penpal_requests(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles(id) on delete cascade,
  address_snapshot jsonb,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (relationship_id, owner_id),
  constraint snail_mail_share_people_different check (owner_id <> shared_with_user_id)
);

create index if not exists snail_mail_exchanges_recipient_idx
  on public.snail_mail_exchanges(recipient_id, status, requested_at desc);
create index if not exists snail_mail_shares_recipient_idx
  on public.snail_mail_address_shares(shared_with_user_id, relationship_id)
  where revoked_at is null;

alter table public.mailing_addresses enable row level security;
alter table public.snail_mail_exchanges enable row level security;
alter table public.snail_mail_address_shares enable row level security;

-- No direct authenticated-table access. Every read/write goes through guarded RPCs.
revoke all on table public.mailing_addresses from authenticated;
revoke all on table public.snail_mail_exchanges from authenticated;
revoke all on table public.snail_mail_address_shares from authenticated;

grant select, insert, update, delete on table public.mailing_addresses to service_role;
grant select, insert, update, delete on table public.snail_mail_exchanges to service_role;
grant select, insert, update, delete on table public.snail_mail_address_shares to service_role;

-- ---------------------------------------------------------------------------
-- Private address-vault management
-- Existing shares are snapshots: editing the vault does not silently change what
-- a previously-authorized pen pal can see.
-- ---------------------------------------------------------------------------

create or replace function public.save_my_mailing_address(
  mailing_name text,
  mailing_line1 text,
  mailing_line2 text default null,
  mailing_city text default null,
  mailing_region text default null,
  mailing_postal_code text default null,
  mailing_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean_name text := nullif(trim(mailing_name), '');
  clean_line1 text := nullif(trim(mailing_line1), '');
  clean_line2 text := nullif(trim(mailing_line2), '');
  clean_city text := nullif(trim(mailing_city), '');
  clean_region text := nullif(trim(mailing_region), '');
  clean_postal text := nullif(trim(mailing_postal_code), '');
  clean_country text := nullif(trim(mailing_country), '');
  result jsonb;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_name is null or char_length(clean_name) > 120 then
    raise exception 'Add the recipient name exactly as it should appear on an envelope.' using errcode = 'P0001';
  end if;
  if clean_line1 is null or char_length(clean_line1) > 160 then
    raise exception 'Add a valid first mailing-address line.' using errcode = 'P0001';
  end if;
  if clean_line2 is not null and char_length(clean_line2) > 160 then
    raise exception 'Address line 2 is too long.' using errcode = 'P0001';
  end if;
  if clean_city is null or char_length(clean_city) > 120 then
    raise exception 'Add a city or locality.' using errcode = 'P0001';
  end if;
  if clean_region is not null and char_length(clean_region) > 120 then
    raise exception 'State, province, or region is too long.' using errcode = 'P0001';
  end if;
  if clean_postal is not null and char_length(clean_postal) > 32 then
    raise exception 'Postal code is too long.' using errcode = 'P0001';
  end if;
  if clean_country is null or char_length(clean_country) > 80 then
    raise exception 'Add the mailing country.' using errcode = 'P0001';
  end if;

  insert into public.mailing_addresses (
    user_id, recipient_name, address_line1, address_line2, city, region, postal_code, country, updated_at
  ) values (
    caller, clean_name, clean_line1, clean_line2, clean_city, clean_region, clean_postal, clean_country, now()
  )
  on conflict (user_id) do update
    set recipient_name = excluded.recipient_name,
        address_line1 = excluded.address_line1,
        address_line2 = excluded.address_line2,
        city = excluded.city,
        region = excluded.region,
        postal_code = excluded.postal_code,
        country = excluded.country,
        updated_at = now();

  select to_jsonb(a) - 'user_id'
  into result
  from public.mailing_addresses a
  where a.user_id = caller;

  return result;
end;
$$;

create or replace function public.delete_my_mailing_address()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.snail_mail_address_shares
  set address_snapshot = null,
      revoked_at = coalesce(revoked_at, now())
  where owner_id = auth.uid()
    and revoked_at is null;

  delete from public.mailing_addresses where user_id = auth.uid();
end;
$$;

revoke all on function public.save_my_mailing_address(text, text, text, text, text, text, text) from public;
revoke all on function public.delete_my_mailing_address() from public;
grant execute on function public.save_my_mailing_address(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_my_mailing_address() to authenticated;

-- ---------------------------------------------------------------------------
-- Exchange state. Only relationship participants can call this function.
-- It never returns the other member's address unless that exact relationship has
-- mutual exchange consent plus an active per-person address share.
-- ---------------------------------------------------------------------------

create or replace function public.get_snail_mail_state(target_relationship uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
  other_user uuid;
  blocked boolean := false;
  exchange_status text;
  exchange_requested_by uuid;
  my_address jsonb;
  other_address jsonb;
  my_shared boolean := false;
  other_shared boolean := false;
  my_preference text;
  other_preference text;
  my_international boolean := false;
  other_international boolean := false;
  my_country text;
  other_country text;
  other_account_status text;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Pen-pal relationship not found.' using errcode = 'P0001';
  end if;

  other_user := case when rel.sender_id = caller then rel.recipient_id else rel.sender_id end;

  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = caller and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = caller)
  ) into blocked;

  select p.correspondence_method, p.international_snail_mail, p.country
  into my_preference, my_international, my_country
  from public.profiles p where p.id = caller;

  select p.correspondence_method, p.international_snail_mail, p.country, p.account_status
  into other_preference, other_international, other_country, other_account_status
  from public.profiles p where p.id = other_user;

  select to_jsonb(a) - 'user_id'
  into my_address
  from public.mailing_addresses a
  where a.user_id = caller;

  select e.status, e.requested_by
  into exchange_status, exchange_requested_by
  from public.snail_mail_exchanges e
  where e.relationship_id = target_relationship;

  select exists (
    select 1 from public.snail_mail_address_shares s
    where s.relationship_id = target_relationship
      and s.owner_id = caller
      and s.shared_with_user_id = other_user
      and s.revoked_at is null
      and s.address_snapshot is not null
  ) into my_shared;

  if not blocked
     and rel.status in ('accepted', 'paused')
     and other_account_status = 'active'
     and exchange_status = 'accepted' then
    select s.address_snapshot
    into other_address
    from public.snail_mail_address_shares s
    where s.relationship_id = target_relationship
      and s.owner_id = other_user
      and s.shared_with_user_id = caller
      and s.revoked_at is null
      and s.address_snapshot is not null;

    other_shared := other_address is not null;
  end if;

  if blocked or rel.status = 'ended' then
    my_shared := false;
    other_shared := false;
    other_address := null;
  end if;

  return jsonb_build_object(
    'relationship_status', rel.status,
    'blocked', blocked,
    'my_preference', coalesce(my_preference, 'digital'),
    'other_preference', coalesce(other_preference, 'digital'),
    'my_international', coalesce(my_international, false),
    'other_international', coalesce(other_international, false),
    'my_country', my_country,
    'other_country', other_country,
    'exchange_status', exchange_status,
    'exchange_requested_by', exchange_requested_by,
    'my_address', my_address,
    'my_shared', my_shared,
    'other_shared', other_shared,
    'other_address', other_address
  );
end;
$$;

revoke all on function public.get_snail_mail_state(uuid) from public;
grant execute on function public.get_snail_mail_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mutual exchange request. Accepting an exchange still shares zero addresses;
-- each person separately chooses when/if to share their own saved address.
-- ---------------------------------------------------------------------------

create or replace function public.request_snail_mail_exchange(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
  other_user uuid;
  existing_status text;
  my_pref text;
  other_pref text;
  my_international boolean;
  other_international boolean;
  my_country text;
  other_country text;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
  for update;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Pen-pal relationship not found.' using errcode = 'P0001';
  end if;

  if rel.status <> 'accepted' then
    raise exception 'Address exchange is available only for active pen pals.' using errcode = 'P0001';
  end if;

  other_user := case when rel.sender_id = caller then rel.recipient_id else rel.sender_id end;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = caller and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = caller)
  ) then
    raise exception 'Address exchange is unavailable for this connection.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id in (caller, other_user) and p.account_status <> 'active'
  ) then
    raise exception 'Both accounts must be active before exchanging mailing addresses.' using errcode = 'P0001';
  end if;

  select p.correspondence_method, p.international_snail_mail, p.country
  into my_pref, my_international, my_country
  from public.profiles p where p.id = caller;

  select p.correspondence_method, p.international_snail_mail, p.country
  into other_pref, other_international, other_country
  from public.profiles p where p.id = other_user;

  if coalesce(my_pref, 'digital') = 'digital' then
    raise exception 'Change your correspondence preference to include snail mail before requesting an address exchange.' using errcode = 'P0001';
  end if;

  if coalesce(other_pref, 'digital') = 'digital' then
    raise exception 'This pen pal is not currently open to snail mail.' using errcode = 'P0001';
  end if;

  if lower(trim(coalesce(my_country, ''))) <> lower(trim(coalesce(other_country, '')))
     and (not coalesce(my_international, false) or not coalesce(other_international, false)) then
    raise exception 'Both pen pals must opt into international snail mail before exchanging addresses across countries.' using errcode = 'P0001';
  end if;

  select e.status into existing_status
  from public.snail_mail_exchanges e
  where e.relationship_id = target_relationship
  for update;

  if found and existing_status = 'accepted' then
    raise exception 'This address exchange is already active.' using errcode = 'P0001';
  elsif found and existing_status = 'pending' then
    raise exception 'An address-exchange request is already pending.' using errcode = 'P0001';
  end if;

  insert into public.snail_mail_exchanges (
    relationship_id, requested_by, recipient_id, status, requested_at, responded_at
  ) values (
    target_relationship, caller, other_user, 'pending', now(), null
  )
  on conflict (relationship_id) do update
    set requested_by = excluded.requested_by,
        recipient_id = excluded.recipient_id,
        status = 'pending',
        requested_at = now(),
        responded_at = null;
end;
$$;

create or replace function public.respond_snail_mail_exchange(
  target_relationship uuid,
  decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  exchange_row public.snail_mail_exchanges%rowtype;
  rel_status text;
  clean_decision text := lower(trim(decision));
  caller_pref text;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_decision not in ('accept', 'decline') then
    raise exception 'Choose accept or decline.' using errcode = 'P0001';
  end if;

  select * into exchange_row
  from public.snail_mail_exchanges
  where relationship_id = target_relationship
  for update;

  if not found or exchange_row.recipient_id <> caller or exchange_row.status <> 'pending' then
    raise exception 'Pending address-exchange request not found.' using errcode = 'P0001';
  end if;

  select pr.status into rel_status
  from public.penpal_requests pr
  where pr.id = target_relationship
    and (pr.sender_id = caller or pr.recipient_id = caller);

  if rel_status <> 'accepted' then
    raise exception 'Address exchange is available only for active pen pals.' using errcode = 'P0001';
  end if;

  if clean_decision = 'accept' then
    select correspondence_method into caller_pref from public.profiles where id = caller;
    if coalesce(caller_pref, 'digital') = 'digital' then
      raise exception 'Change your correspondence preference to include snail mail before accepting.' using errcode = 'P0001';
    end if;
  end if;

  update public.snail_mail_exchanges
  set status = case when clean_decision = 'accept' then 'accepted' else 'declined' end,
      responded_at = now()
  where relationship_id = target_relationship;
end;
$$;

create or replace function public.cancel_snail_mail_exchange(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.snail_mail_exchanges
  set status = 'cancelled', responded_at = now()
  where relationship_id = target_relationship
    and requested_by = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Pending address-exchange request not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.request_snail_mail_exchange(uuid) from public;
revoke all on function public.respond_snail_mail_exchange(uuid, text) from public;
revoke all on function public.cancel_snail_mail_exchange(uuid) from public;
grant execute on function public.request_snail_mail_exchange(uuid) to authenticated;
grant execute on function public.respond_snail_mail_exchange(uuid, text) to authenticated;
grant execute on function public.cancel_snail_mail_exchange(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-person sharing after mutual consent
-- ---------------------------------------------------------------------------

create or replace function public.share_my_mailing_address(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
  other_user uuid;
  exchange_status text;
  addr public.mailing_addresses%rowtype;
  snapshot jsonb;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
  for update;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Pen-pal relationship not found.' using errcode = 'P0001';
  end if;

  if rel.status <> 'accepted' then
    raise exception 'You can share a mailing address only with an active pen pal.' using errcode = 'P0001';
  end if;

  other_user := case when rel.sender_id = caller then rel.recipient_id else rel.sender_id end;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = caller and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = caller)
  ) then
    raise exception 'Address sharing is unavailable for this connection.' using errcode = 'P0001';
  end if;

  select e.status into exchange_status
  from public.snail_mail_exchanges e
  where e.relationship_id = target_relationship;

  if exchange_status <> 'accepted' then
    raise exception 'Both pen pals must accept the address exchange first.' using errcode = 'P0001';
  end if;

  select * into addr from public.mailing_addresses where user_id = caller;
  if not found then
    raise exception 'Save a private mailing address before sharing it.' using errcode = 'P0001';
  end if;

  snapshot := jsonb_build_object(
    'recipient_name', addr.recipient_name,
    'address_line1', addr.address_line1,
    'address_line2', addr.address_line2,
    'city', addr.city,
    'region', addr.region,
    'postal_code', addr.postal_code,
    'country', addr.country,
    'shared_from_address_updated_at', addr.updated_at
  );

  insert into public.snail_mail_address_shares (
    relationship_id, owner_id, shared_with_user_id, address_snapshot, shared_at, revoked_at
  ) values (
    target_relationship, caller, other_user, snapshot, now(), null
  )
  on conflict (relationship_id, owner_id) do update
    set shared_with_user_id = excluded.shared_with_user_id,
        address_snapshot = excluded.address_snapshot,
        shared_at = now(),
        revoked_at = null;
end;
$$;

create or replace function public.revoke_my_mailing_address_share(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.snail_mail_address_shares
  set address_snapshot = null,
      revoked_at = now()
  where relationship_id = target_relationship
    and owner_id = auth.uid()
    and revoked_at is null;

  if not found then
    raise exception 'No active mailing-address share was found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.share_my_mailing_address(uuid) from public;
revoke all on function public.revoke_my_mailing_address_share(uuid) from public;
grant execute on function public.share_my_mailing_address(uuid) to authenticated;
grant execute on function public.revoke_my_mailing_address_share(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Safety cleanup: ending a relationship or blocking a member permanently closes
-- that relationship's in-app address exchange and clears all stored share snapshots.
-- ---------------------------------------------------------------------------

create or replace function public.revoke_snail_mail_on_relationship_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then
    update public.snail_mail_exchanges
    set status = 'revoked', responded_at = coalesce(responded_at, now())
    where relationship_id = new.id
      and status in ('pending', 'accepted');

    update public.snail_mail_address_shares
    set address_snapshot = null,
        revoked_at = coalesce(revoked_at, now())
    where relationship_id = new.id
      and revoked_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists penpal_requests_revoke_snail_mail on public.penpal_requests;
create trigger penpal_requests_revoke_snail_mail
after update of status on public.penpal_requests
for each row execute procedure public.revoke_snail_mail_on_relationship_end();

create or replace function public.revoke_snail_mail_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.snail_mail_exchanges e
  set status = 'revoked', responded_at = coalesce(e.responded_at, now())
  where e.relationship_id in (
    select pr.id
    from public.penpal_requests pr
    where (pr.sender_id = new.blocker_id and pr.recipient_id = new.blocked_id)
       or (pr.sender_id = new.blocked_id and pr.recipient_id = new.blocker_id)
  )
    and e.status in ('pending', 'accepted');

  update public.snail_mail_address_shares s
  set address_snapshot = null,
      revoked_at = coalesce(s.revoked_at, now())
  where s.relationship_id in (
    select pr.id
    from public.penpal_requests pr
    where (pr.sender_id = new.blocker_id and pr.recipient_id = new.blocked_id)
       or (pr.sender_id = new.blocked_id and pr.recipient_id = new.blocker_id)
  )
    and s.revoked_at is null;

  return new;
end;
$$;

drop trigger if exists blocks_revoke_snail_mail on public.blocks;
create trigger blocks_revoke_snail_mail
after insert on public.blocks
for each row execute procedure public.revoke_snail_mail_on_block();

-- ---------------------------------------------------------------------------
-- Member data export supplement. This deliberately includes only the member's
-- own saved address and their own sharing metadata, never another member's address.
-- ---------------------------------------------------------------------------

create or replace function public.export_my_snail_mail_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'mailing_address', (
      select to_jsonb(a) - 'user_id'
      from public.mailing_addresses a
      where a.user_id = caller
    ),
    'exchanges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationship_id', e.relationship_id,
        'requested_by_me', e.requested_by = caller,
        'status', e.status,
        'requested_at', e.requested_at,
        'responded_at', e.responded_at
      ) order by e.requested_at)
      from public.snail_mail_exchanges e
      where e.requested_by = caller or e.recipient_id = caller
    ), '[]'::jsonb),
    'address_shares_created_by_me', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationship_id', s.relationship_id,
        'shared_with_user_id', s.shared_with_user_id,
        'shared_at', s.shared_at,
        'revoked_at', s.revoked_at
      ) order by s.shared_at)
      from public.snail_mail_address_shares s
      where s.owner_id = caller
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_snail_mail_data() from public;
grant execute on function public.export_my_snail_mail_data() to authenticated;
