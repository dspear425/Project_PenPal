-- Project PenPal: moderator member case file enhancements
-- Run once in Supabase SQL Editor after add_admin_search_and_support.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Moderator-initiated support outreach
-- ---------------------------------------------------------------------------

alter table public.support_threads
  drop constraint if exists support_threads_category;

alter table public.support_threads
  add constraint support_threads_category
  check (category in (
    'account_help', 'safety', 'technical', 'privacy', 'feedback', 'appeal', 'other', 'moderator_outreach'
  ));

create or replace function public.moderator_start_support_thread(
  target_user uuid,
  ticket_subject text,
  first_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_thread uuid;
  clean_subject text := trim(ticket_subject);
  clean_message text := trim(first_message);
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  if char_length(clean_subject) < 3 or char_length(clean_subject) > 120 then
    raise exception 'Subject must be between 3 and 120 characters.' using errcode = 'P0001';
  end if;

  if char_length(clean_message) < 1 or char_length(clean_message) > 6000 then
    raise exception 'Message must be between 1 and 6000 characters.' using errcode = 'P0001';
  end if;

  insert into public.support_threads (
    user_id, category, subject, status, assigned_to, moderator_last_read_at
  ) values (
    target_user, 'moderator_outreach', clean_subject, 'reviewing', caller, now()
  )
  returning id into new_thread;

  insert into public.support_messages (thread_id, sender_id, sender_role, body)
  values (new_thread, caller, 'moderator', clean_message);

  return new_thread;
end;
$$;

revoke all on function public.moderator_start_support_thread(uuid, text, text) from public;
grant execute on function public.moderator_start_support_thread(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Member relationship history for moderators
-- ---------------------------------------------------------------------------

create or replace function public.moderator_user_relationships(target_user uuid)
returns table(
  relationship_id uuid,
  other_user_id uuid,
  other_display_name text,
  other_country text,
  relationship_status text,
  intro_message text,
  created_at timestamptz,
  responded_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  letter_count bigint,
  last_letter_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  return query
  select
    pr.id,
    case when pr.sender_id = target_user then pr.recipient_id else pr.sender_id end as other_id,
    op.display_name,
    op.country,
    pr.status,
    pr.intro_message,
    pr.created_at,
    pr.responded_at,
    pr.paused_at,
    pr.ended_at,
    count(l.id),
    max(l.created_at)
  from public.penpal_requests pr
  join public.profiles op
    on op.id = case when pr.sender_id = target_user then pr.recipient_id else pr.sender_id end
  left join public.letters l on l.relationship_id = pr.id
  where pr.sender_id = target_user or pr.recipient_id = target_user
  group by
    pr.id,
    other_id,
    op.display_name,
    op.country,
    pr.status,
    pr.intro_message,
    pr.created_at,
    pr.responded_at,
    pr.paused_at,
    pr.ended_at
  order by coalesce(max(l.created_at), pr.ended_at, pr.paused_at, pr.responded_at, pr.created_at) desc;
end;
$$;

revoke all on function public.moderator_user_relationships(uuid) from public;
grant execute on function public.moderator_user_relationships(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audited access to private correspondence
-- ---------------------------------------------------------------------------

create table if not exists public.moderator_access_log (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  relationship_id uuid references public.penpal_requests(id) on delete set null,
  access_type text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint moderator_access_log_type check (access_type in ('correspondence_view')),
  constraint moderator_access_log_reason_length check (char_length(reason) between 5 and 500)
);

create index if not exists moderator_access_log_target_idx
  on public.moderator_access_log(target_user_id, created_at desc);
create index if not exists moderator_access_log_relationship_idx
  on public.moderator_access_log(relationship_id, created_at desc);

alter table public.moderator_access_log enable row level security;

grant select on table public.moderator_access_log to authenticated;
grant select, insert, update, delete on table public.moderator_access_log to service_role;

drop policy if exists "Moderators can review correspondence access logs" on public.moderator_access_log;
create policy "Moderators can review correspondence access logs"
on public.moderator_access_log for select
to authenticated
using (public.is_moderator());

create or replace function public.moderator_relationship_correspondence(
  target_user uuid,
  target_relationship uuid,
  access_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := trim(access_reason);
  rel public.penpal_requests%rowtype;
  other_id uuid;
  relationship_json jsonb;
  letter_rows jsonb;
  total_letters bigint;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if char_length(clean_reason) < 5 or char_length(clean_reason) > 500 then
    raise exception 'Enter a brief reason between 5 and 500 characters before reviewing private correspondence.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
    and (sender_id = target_user or recipient_id = target_user);

  if not found then
    raise exception 'Relationship not found for this member.' using errcode = 'P0001';
  end if;

  other_id := case when rel.sender_id = target_user then rel.recipient_id else rel.sender_id end;

  insert into public.moderator_access_log (
    moderator_id, target_user_id, relationship_id, access_type, reason
  ) values (
    auth.uid(), target_user, target_relationship, 'correspondence_view', clean_reason
  );

  select jsonb_build_object(
    'id', rel.id,
    'status', rel.status,
    'created_at', rel.created_at,
    'responded_at', rel.responded_at,
    'paused_at', rel.paused_at,
    'ended_at', rel.ended_at,
    'other_user_id', other_id,
    'other_display_name', p.display_name,
    'other_country', p.country
  ) into relationship_json
  from public.profiles p
  where p.id = other_id;

  select count(*) into total_letters
  from public.letters l
  where l.relationship_id = target_relationship;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
  into letter_rows
  from (
    select l.id, l.sender_id, l.recipient_id, l.subject, l.body, l.created_at, l.read_at
    from public.letters l
    where l.relationship_id = target_relationship
    order by l.created_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'relationship', relationship_json,
    'letters', coalesce(letter_rows, '[]'::jsonb),
    'total_letters', total_letters,
    'returned_letters', jsonb_array_length(coalesce(letter_rows, '[]'::jsonb))
  );
end;
$$;

revoke all on function public.moderator_relationship_correspondence(uuid, uuid, text) from public;
grant execute on function public.moderator_relationship_correspondence(uuid, uuid, text) to authenticated;
