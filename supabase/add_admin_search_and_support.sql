-- Project PenPal: moderator user search + direct member support threads
-- Run once in Supabase SQL Editor after the admin/moderation migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Direct member-to-moderator support threads
-- ---------------------------------------------------------------------------

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  subject text not null,
  status text not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  member_last_read_at timestamptz,
  moderator_last_read_at timestamptz,
  constraint support_threads_category check (category in ('account_help', 'safety', 'technical', 'privacy', 'feedback', 'appeal', 'other')),
  constraint support_threads_status check (status in ('open', 'reviewing', 'resolved')),
  constraint support_threads_subject_length check (char_length(subject) between 3 and 120)
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_messages_role check (sender_role in ('member', 'moderator')),
  constraint support_messages_body_length check (char_length(body) between 1 and 6000)
);

create index if not exists support_threads_user_idx on public.support_threads(user_id, updated_at desc);
create index if not exists support_threads_status_idx on public.support_threads(status, updated_at desc);
create index if not exists support_messages_thread_idx on public.support_messages(thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

grant select on table public.support_threads to authenticated;
grant select on table public.support_messages to authenticated;
grant select, insert, update, delete on table public.support_threads to service_role;
grant select, insert, update, delete on table public.support_messages to service_role;

-- Members can see only their own support threads; moderators can see all.
drop policy if exists "Members and moderators can read support threads" on public.support_threads;
create policy "Members and moderators can read support threads"
on public.support_threads for select
to authenticated
using (user_id = auth.uid() or public.is_moderator());

-- Messages follow the thread visibility rule.
drop policy if exists "Members and moderators can read support messages" on public.support_messages;
create policy "Members and moderators can read support messages"
on public.support_messages for select
to authenticated
using (
  public.is_moderator()
  or exists (
    select 1 from public.support_threads st
    where st.id = thread_id and st.user_id = auth.uid()
  )
);

-- All writes go through guarded RPCs.

create or replace function public.create_support_thread(
  ticket_category text,
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
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if ticket_category not in ('account_help', 'safety', 'technical', 'privacy', 'feedback', 'appeal', 'other') then
    raise exception 'Choose a valid support category.' using errcode = 'P0001';
  end if;

  if char_length(clean_subject) < 3 or char_length(clean_subject) > 120 then
    raise exception 'Subject must be between 3 and 120 characters.' using errcode = 'P0001';
  end if;

  if char_length(clean_message) < 1 or char_length(clean_message) > 6000 then
    raise exception 'Message must be between 1 and 6000 characters.' using errcode = 'P0001';
  end if;

  insert into public.support_threads (user_id, category, subject, member_last_read_at)
  values (caller, ticket_category, clean_subject, now())
  returning id into new_thread;

  insert into public.support_messages (thread_id, sender_id, sender_role, body)
  values (new_thread, caller, 'member', clean_message);

  return new_thread;
end;
$$;

create or replace function public.reply_support_thread(target_thread uuid, message_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  thread_row public.support_threads%rowtype;
  role_value text;
  clean_message text := trim(message_body);
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if char_length(clean_message) < 1 or char_length(clean_message) > 6000 then
    raise exception 'Message must be between 1 and 6000 characters.' using errcode = 'P0001';
  end if;

  select * into thread_row
  from public.support_threads
  where id = target_thread
  for update;

  if not found then
    raise exception 'Support thread not found.' using errcode = 'P0001';
  end if;

  if caller = thread_row.user_id then
    role_value := 'member';
  elsif public.is_moderator() then
    role_value := 'moderator';
  else
    raise exception 'You do not have access to this support thread.' using errcode = 'P0001';
  end if;

  insert into public.support_messages (thread_id, sender_id, sender_role, body)
  values (target_thread, caller, role_value, clean_message);

  update public.support_threads
  set updated_at = now(),
      status = case
        when role_value = 'member' and status = 'resolved' then 'open'
        when role_value = 'moderator' and status = 'open' then 'reviewing'
        else status
      end,
      assigned_to = case when role_value = 'moderator' then caller else assigned_to end,
      member_last_read_at = case when role_value = 'member' then now() else member_last_read_at end,
      moderator_last_read_at = case when role_value = 'moderator' then now() else moderator_last_read_at end
  where id = target_thread;
end;
$$;

create or replace function public.mark_support_thread_read(target_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select user_id into owner_id from public.support_threads where id = target_thread;
  if not found then
    raise exception 'Support thread not found.' using errcode = 'P0001';
  end if;

  if caller = owner_id then
    update public.support_threads set member_last_read_at = now() where id = target_thread;
  elsif public.is_moderator() then
    update public.support_threads set moderator_last_read_at = now(), assigned_to = coalesce(assigned_to, caller) where id = target_thread;
  else
    raise exception 'You do not have access to this support thread.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.moderator_set_support_status(target_thread uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if new_status not in ('open', 'reviewing', 'resolved') then
    raise exception 'Invalid support status.' using errcode = 'P0001';
  end if;

  update public.support_threads
  set status = new_status, assigned_to = auth.uid(), updated_at = now(), moderator_last_read_at = now()
  where id = target_thread;

  if not found then
    raise exception 'Support thread not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.create_support_thread(text, text, text) from public;
revoke all on function public.reply_support_thread(uuid, text) from public;
revoke all on function public.mark_support_thread_read(uuid) from public;
revoke all on function public.moderator_set_support_status(uuid, text) from public;

grant execute on function public.create_support_thread(text, text, text) to authenticated;
grant execute on function public.reply_support_thread(uuid, text) to authenticated;
grant execute on function public.mark_support_thread_read(uuid) to authenticated;
grant execute on function public.moderator_set_support_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Secure moderator user lookup
-- ---------------------------------------------------------------------------

create or replace function public.moderator_search_users(search_term text)
returns table(
  user_id uuid,
  display_name text,
  email text,
  country text,
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
  q text := trim(search_term);
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if char_length(q) < 2 then
    raise exception 'Enter at least 2 characters to search.' using errcode = 'P0001';
  end if;

  if char_length(q) > 160 then
    raise exception 'Search is too long.' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.display_name,
    u.email::text,
    p.country,
    p.account_status,
    p.suspended_until,
    p.created_at,
    (select count(*) from public.reports r where r.reported_id = p.id),
    (select count(*) from public.moderation_actions ma where ma.target_user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where
    coalesce(p.display_name, '') ilike '%' || q || '%'
    or coalesce(u.email::text, '') ilike '%' || q || '%'
    or p.id::text ilike '%' || q || '%'
  order by
    case when lower(coalesce(p.display_name, '')) = lower(q) then 0 else 1 end,
    p.display_name nulls last,
    p.created_at desc
  limit 25;
end;
$$;

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
    'email', u.email,
    'country', p.country,
    'region', p.region,
    'created_at', p.created_at,
    'account_status', p.account_status,
    'suspended_until', p.suspended_until,
    'onboarding_complete', p.onboarding_complete,
    'discoverable', p.discoverable
  ) into profile_row
  from public.profiles p
  join auth.users u on u.id = p.id
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
    limit 20
  ) x;

  return jsonb_build_object(
    'profile', profile_row,
    'reports', report_rows,
    'actions', action_rows,
    'support_threads', support_rows
  );
end;
$$;

revoke all on function public.moderator_search_users(text) from public;
revoke all on function public.moderator_user_context(uuid) from public;
grant execute on function public.moderator_search_users(text) to authenticated;
grant execute on function public.moderator_user_context(uuid) to authenticated;
