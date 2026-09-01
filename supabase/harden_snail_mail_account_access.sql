-- Project PenPal: sensitive snail-mail account-status hardening
-- Run after finalize_snail_mail_privacy.sql.
-- Restricted accounts may still revoke/delete their own address data, but they
-- cannot receive another member's address or create a new address share.

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
  my_account_status text;
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

  select p.correspondence_method, p.international_snail_mail, p.country, p.account_status
  into my_preference, my_international, my_country, my_account_status
  from public.profiles p where p.id = caller;

  select p.correspondence_method, p.international_snail_mail, p.country, p.account_status
  into other_preference, other_international, other_country, other_account_status
  from public.profiles p where p.id = other_user;

  -- A member is always allowed to retrieve their own saved address so they can
  -- understand/delete their private data. This does not expose anyone else.
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

  -- Another member's address is the sensitive boundary. Both accounts must still
  -- be active, the pair must be unblocked, the relationship must remain accepted
  -- or paused, mutual exchange consent must still be active, and the owner must
  -- have an unrevoked address share for this exact relationship.
  if not blocked
     and my_account_status = 'active'
     and other_account_status = 'active'
     and rel.status in ('accepted', 'paused')
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

  if blocked or rel.status = 'ended' or my_account_status <> 'active' then
    other_shared := false;
    other_address := null;
  end if;

  if blocked or rel.status = 'ended' then
    my_shared := false;
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

  if exists (
    select 1 from public.profiles p
    where p.id in (caller, other_user)
      and p.account_status <> 'active'
  ) then
    raise exception 'Both accounts must be active before a mailing address can be shared.' using errcode = 'P0001';
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

revoke all on function public.share_my_mailing_address(uuid) from public;
grant execute on function public.share_my_mailing_address(uuid) to authenticated;
