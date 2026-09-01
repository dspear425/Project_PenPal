-- Project PenPal: final snail-mail consent hardening + account-export integration
-- Run after add_snail_mail_exchange.sql.

-- ---------------------------------------------------------------------------
-- Preference validation hardening
-- ---------------------------------------------------------------------------

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

  if clean_preference is null or clean_preference not in ('digital', 'both', 'snail_mail') then
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
-- A decline cannot be repeatedly re-sent by the same requester. The person who
-- declined may later initiate a fresh request themselves if they change their mind.
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
  existing_requested_by uuid;
  existing_recipient uuid;
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

  select e.status, e.requested_by, e.recipient_id
  into existing_status, existing_requested_by, existing_recipient
  from public.snail_mail_exchanges e
  where e.relationship_id = target_relationship
  for update;

  if found then
    if existing_status = 'accepted' then
      raise exception 'This address exchange is already active.' using errcode = 'P0001';
    elsif existing_status = 'pending' then
      raise exception 'An address-exchange request is already pending.' using errcode = 'P0001';
    elsif existing_status = 'declined' and existing_requested_by = caller then
      raise exception 'Your previous address-exchange request was declined. If your pen pal changes their mind, they can initiate a new request.' using errcode = 'P0001';
    end if;
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

revoke all on function public.request_snail_mail_exchange(uuid) from public;
grant execute on function public.request_snail_mail_exchange(uuid) to authenticated;

-- Re-check current relationship/account/preferences at acceptance time because any
-- of them may have changed since the request was created.
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
  rel public.penpal_requests%rowtype;
  other_user uuid;
  clean_decision text := lower(trim(decision));
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

  select * into rel
  from public.penpal_requests
  where id = target_relationship;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Pen-pal relationship not found.' using errcode = 'P0001';
  end if;

  if clean_decision = 'accept' then
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

    if coalesce(my_pref, 'digital') = 'digital' or coalesce(other_pref, 'digital') = 'digital' then
      raise exception 'Both pen pals must currently be open to snail mail before accepting.' using errcode = 'P0001';
    end if;

    if lower(trim(coalesce(my_country, ''))) <> lower(trim(coalesce(other_country, '')))
       and (not coalesce(my_international, false) or not coalesce(other_international, false)) then
      raise exception 'Both pen pals must opt into international snail mail before exchanging addresses across countries.' using errcode = 'P0001';
    end if;
  end if;

  update public.snail_mail_exchanges
  set status = case when clean_decision = 'accept' then 'accepted' else 'declined' end,
      responded_at = now()
  where relationship_id = target_relationship;
end;
$$;

revoke all on function public.respond_snail_mail_exchange(uuid, text) from public;
grant execute on function public.respond_snail_mail_exchange(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the existing Settings > Your data export. The snail_mail object contains
-- only this member's own saved address and their own exchange/share metadata.
-- Another member's shared address is intentionally excluded.
-- ---------------------------------------------------------------------------

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at
    ),
    'profile', to_jsonb(p),
    'private_account_info', (
      select jsonb_build_object(
        'private_last_name', pai.private_last_name,
        'member_code', pai.member_code,
        'created_at', pai.created_at,
        'updated_at', pai.updated_at
      )
      from public.private_account_info pai
      where pai.user_id = caller
    ),
    'notification_preferences', (
      select jsonb_build_object(
        'email_penpal_requests', np.email_penpal_requests,
        'email_request_accepted', np.email_request_accepted,
        'email_new_letters', np.email_new_letters,
        'email_support_replies', np.email_support_replies,
        'product_updates', np.product_updates,
        'updated_at', np.updated_at
      )
      from public.notification_preferences np
      where np.user_id = caller
    ),
    'interests', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'slug', i.slug, 'name', i.name) order by i.name)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = caller
    ), '[]'::jsonb),
    'penpal_relationships', coalesce((
      select jsonb_agg(to_jsonb(pr) order by pr.created_at)
      from public.penpal_requests pr
      where pr.sender_id = caller or pr.recipient_id = caller
    ), '[]'::jsonb),
    'letters', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at)
      from public.letters l
      where l.sender_id = caller or l.recipient_id = caller
    ), '[]'::jsonb),
    'snail_mail', public.export_my_snail_mail_data(),
    'blocks_created_by_me', coalesce((
      select jsonb_agg(jsonb_build_object(
        'blocked_user_id', b.blocked_id,
        'created_at', b.created_at
      ) order by b.created_at)
      from public.blocks b
      where b.blocker_id = caller
    ), '[]'::jsonb),
    'reports_submitted_by_me', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reported_user_id', r.reported_id,
        'relationship_id', r.relationship_id,
        'category', r.category,
        'details', r.details,
        'status', r.status,
        'created_at', r.created_at,
        'reviewed_at', r.reviewed_at
      ) order by r.created_at)
      from public.reports r
      where r.reporter_id = caller
    ), '[]'::jsonb),
    'support_threads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'category', st.category,
        'subject', st.subject,
        'status', st.status,
        'created_at', st.created_at,
        'updated_at', st.updated_at,
        'member_last_read_at', st.member_last_read_at
      ) order by st.created_at)
      from public.support_threads st
      where st.user_id = caller
    ), '[]'::jsonb),
    'support_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sm.id,
        'thread_id', sm.thread_id,
        'sender_role', sm.sender_role,
        'body', sm.body,
        'created_at', sm.created_at
      ) order by sm.created_at)
      from public.support_messages sm
      where exists (
        select 1 from public.support_threads st
        where st.id = sm.thread_id and st.user_id = caller
      )
    ), '[]'::jsonb),
    'account_notices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mn.id,
        'notice_type', mn.notice_type,
        'title', mn.title,
        'message', mn.message,
        'created_at', mn.created_at,
        'acknowledged_at', mn.acknowledged_at
      ) order by mn.created_at)
      from public.member_notices mn
      where mn.user_id = caller
    ), '[]'::jsonb)
  ) into result
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.id = caller;

  if result is null then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;
