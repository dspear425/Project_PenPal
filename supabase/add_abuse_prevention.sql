-- Project PenPal: anti-spam, rate limiting, and moderator activity monitoring
-- Run once in Supabase SQL Editor after the Settings/Privacy migration.
--
-- The enforcement lives in PostgreSQL so browser/API clients cannot bypass it.
-- Activity events store metadata and content hashes only, never duplicate letter,
-- report, or support-message bodies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Configurable limits
-- ---------------------------------------------------------------------------

create table if not exists public.abuse_rate_limits (
  limit_key text primary key,
  event_type text not null,
  scope text not null default 'user',
  window_minutes integer not null,
  max_actions integer not null,
  new_account_max_actions integer,
  new_account_age_hours integer,
  enabled boolean not null default true,
  user_message text not null,
  updated_at timestamptz not null default now(),
  constraint abuse_rate_limits_scope check (scope in ('user', 'target')),
  constraint abuse_rate_limits_window check (window_minutes between 1 and 43200),
  constraint abuse_rate_limits_max check (max_actions >= 1),
  constraint abuse_rate_limits_new_max check (new_account_max_actions is null or new_account_max_actions >= 1),
  constraint abuse_rate_limits_new_age check (new_account_age_hours is null or new_account_age_hours >= 1)
);

insert into public.abuse_rate_limits
  (limit_key, event_type, scope, window_minutes, max_actions, new_account_max_actions, new_account_age_hours, user_message)
values
  ('penpal_request_hourly', 'penpal_request', 'user', 60, 5, 3, 24,
   'You have sent several pen-pal requests recently. Please wait a while before sending another.'),
  ('penpal_request_daily', 'penpal_request', 'user', 1440, 20, 5, 24,
   'You have reached today''s pen-pal request limit. Please try again later.'),
  ('letter_hourly', 'letter', 'user', 60, 20, null, null,
   'You are sending letters unusually quickly. Please wait a while before sending another.'),
  ('letter_daily', 'letter', 'user', 1440, 100, null, null,
   'You have reached the temporary daily letter limit. Please try again later.'),
  ('report_daily', 'report', 'user', 1440, 10, null, null,
   'You have submitted several reports today. Please contact moderators through Help if you still need assistance.'),
  ('report_same_target_daily', 'report', 'target', 1440, 3, null, null,
   'You have already submitted several reports about this member today. Please use Help if you need to provide more information.'),
  ('support_thread_daily', 'support_thread', 'user', 1440, 5, null, null,
   'You have opened several support conversations today. Please continue an existing conversation or try again later.'),
  ('support_message_hourly', 'support_message', 'user', 60, 30, null, null,
   'You are sending support messages unusually quickly. Please wait a while before replying again.'),
  ('support_message_daily', 'support_message', 'user', 1440, 100, null, null,
   'You have reached the temporary daily support-message limit. Please try again later.')
on conflict (limit_key) do nothing;

alter table public.abuse_rate_limits enable row level security;
revoke all on table public.abuse_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.abuse_rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- Minimal activity ledger
-- ---------------------------------------------------------------------------

create table if not exists public.member_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  source_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint member_activity_event_type check (event_type in (
    'penpal_request', 'letter', 'report', 'support_thread', 'support_message'
  )),
  constraint member_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists member_activity_user_type_created_idx
  on public.member_activity_events(user_id, event_type, created_at desc);
create index if not exists member_activity_target_type_created_idx
  on public.member_activity_events(target_user_id, event_type, created_at desc)
  where target_user_id is not null;
create index if not exists member_activity_created_idx
  on public.member_activity_events(created_at desc);

alter table public.member_activity_events enable row level security;
revoke all on table public.member_activity_events from anon, authenticated;
grant select, insert, update, delete on table public.member_activity_events to service_role;

-- ---------------------------------------------------------------------------
-- Guard function
-- Advisory locking serializes a member's concurrent actions so parallel browser
-- requests cannot race past the threshold.
-- ---------------------------------------------------------------------------

create or replace function public.check_member_rate_limit(
  actor_user uuid,
  action_type text,
  target_user uuid,
  action_source_key text,
  action_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  joined_at timestamptz;
  rule record;
  action_count integer;
  allowed_actions integer;
begin
  if actor_user is null then
    raise exception 'Member account is required.' using errcode = 'P0001';
  end if;

  if action_type not in ('penpal_request', 'letter', 'report', 'support_thread', 'support_message') then
    raise exception 'Unknown activity type.' using errcode = 'P0001';
  end if;

  -- Trusted server-side/service-role maintenance may have no authenticated user.
  -- Normal browser actions always have auth.uid() and must match actor_user.
  if auth.uid() is not null and auth.uid() <> actor_user then
    raise exception 'Activity actor does not match the signed-in member.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user::text, 0));

  select p.created_at into joined_at
  from public.profiles p
  where p.id = actor_user;

  if joined_at is null then
    raise exception 'Member account not found.' using errcode = 'P0001';
  end if;

  for rule in
    select *
    from public.abuse_rate_limits arl
    where arl.event_type = action_type
      and arl.enabled = true
    order by arl.window_minutes
  loop
    allowed_actions := rule.max_actions;

    if rule.new_account_max_actions is not null
       and rule.new_account_age_hours is not null
       and joined_at > now() - make_interval(hours => rule.new_account_age_hours) then
      allowed_actions := rule.new_account_max_actions;
    end if;

    select count(*)::integer into action_count
    from public.member_activity_events e
    where e.user_id = actor_user
      and e.event_type = action_type
      and e.created_at >= now() - make_interval(mins => rule.window_minutes)
      and (rule.scope = 'user' or e.target_user_id is not distinct from target_user);

    if action_count >= allowed_actions then
      raise exception '%', rule.user_message using errcode = 'P0001';
    end if;
  end loop;

  insert into public.member_activity_events (
    user_id, event_type, target_user_id, source_key, metadata
  ) values (
    actor_user,
    action_type,
    target_user,
    action_source_key,
    coalesce(action_metadata, '{}'::jsonb)
  )
  on conflict (source_key) do nothing;
end;
$$;

revoke all on function public.check_member_rate_limit(uuid, text, uuid, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- One-time 24-hour activity backfill so the moderator dashboard is useful
-- immediately after this migration. source_key makes reruns duplicate-safe.
-- ---------------------------------------------------------------------------

insert into public.member_activity_events (user_id, event_type, target_user_id, source_key, metadata, created_at)
select pr.sender_id, 'penpal_request', pr.recipient_id, 'penpal_request:' || pr.id::text,
       jsonb_build_object('content_hash', md5(coalesce(nullif(trim(pr.intro_message), ''), ''))), pr.created_at
from public.penpal_requests pr
where pr.created_at >= now() - interval '24 hours'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, event_type, target_user_id, source_key, metadata, created_at)
select l.sender_id, 'letter', l.recipient_id, 'letter:' || l.id::text,
       jsonb_build_object('content_hash', md5(l.body)), l.created_at
from public.letters l
where l.created_at >= now() - interval '24 hours'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, event_type, target_user_id, source_key, metadata, created_at)
select r.reporter_id, 'report', r.reported_id, 'report:' || r.id::text,
       '{}'::jsonb, r.created_at
from public.reports r
where r.created_at >= now() - interval '24 hours'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, event_type, target_user_id, source_key, metadata, created_at)
select st.user_id, 'support_thread', null, 'support_thread:' || st.id::text,
       '{}'::jsonb, st.created_at
from public.support_threads st
where st.created_at >= now() - interval '24 hours'
  and exists (
    select 1 from public.support_messages sm
    where sm.thread_id = st.id
      and sm.sender_role = 'member'
    order by sm.created_at
    limit 1
  )
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, event_type, target_user_id, source_key, metadata, created_at)
select sm.sender_id, 'support_message', null, 'support_message:' || sm.id::text,
       jsonb_build_object('content_hash', md5(sm.body)), sm.created_at
from public.support_messages sm
where sm.sender_role = 'member'
  and sm.created_at >= now() - interval '24 hours'
on conflict (source_key) do nothing;

-- ---------------------------------------------------------------------------
-- Enforcement triggers
-- ---------------------------------------------------------------------------

create or replace function public.rate_limit_penpal_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'pending' and auth.uid() = new.sender_id then
    perform public.check_member_rate_limit(
      new.sender_id,
      'penpal_request',
      new.recipient_id,
      'penpal_request:' || new.id::text,
      jsonb_build_object('content_hash', md5(coalesce(nullif(trim(new.intro_message), ''), '')))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists penpal_requests_rate_limit on public.penpal_requests;
create trigger penpal_requests_rate_limit
before insert on public.penpal_requests
for each row execute procedure public.rate_limit_penpal_request();

create or replace function public.rate_limit_letter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() = new.sender_id then
    perform public.check_member_rate_limit(
      new.sender_id,
      'letter',
      new.recipient_id,
      'letter:' || new.id::text,
      jsonb_build_object('content_hash', md5(new.body))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists letters_rate_limit on public.letters;
create trigger letters_rate_limit
before insert on public.letters
for each row execute procedure public.rate_limit_letter();

create or replace function public.rate_limit_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() = new.reporter_id then
    perform public.check_member_rate_limit(
      new.reporter_id,
      'report',
      new.reported_id,
      'report:' || new.id::text,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
before insert on public.reports
for each row execute procedure public.rate_limit_report();

create or replace function public.rate_limit_support_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Moderator-initiated outreach creates a thread for another user; do not count
  -- that against the member. Member-created threads always have auth.uid() = user_id.
  if auth.uid() = new.user_id then
    perform public.check_member_rate_limit(
      new.user_id,
      'support_thread',
      null,
      'support_thread:' || new.id::text,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_threads_rate_limit on public.support_threads;
create trigger support_threads_rate_limit
before insert on public.support_threads
for each row execute procedure public.rate_limit_support_thread();

create or replace function public.rate_limit_support_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.sender_role = 'member' and auth.uid() = new.sender_id then
    perform public.check_member_rate_limit(
      new.sender_id,
      'support_message',
      null,
      'support_message:' || new.id::text,
      jsonb_build_object('content_hash', md5(new.body))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_rate_limit on public.support_messages;
create trigger support_messages_rate_limit
before insert on public.support_messages
for each row execute procedure public.rate_limit_support_message();

-- ---------------------------------------------------------------------------
-- Moderator activity dashboard
-- The score is an attention heuristic, not a finding of wrongdoing.
-- ---------------------------------------------------------------------------

create or replace function public.moderator_activity_overview(window_hours integer default 24)
returns table(
  user_id uuid,
  display_name text,
  username text,
  country text,
  account_status text,
  joined_at timestamptz,
  last_activity_at timestamptz,
  requests_1h bigint,
  requests_24h bigint,
  letters_1h bigint,
  letters_24h bigint,
  reports_24h bigint,
  support_threads_24h bigint,
  support_messages_1h bigint,
  support_messages_24h bigint,
  repeated_request_template_count bigint,
  attention_score integer,
  signals text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  if window_hours < 1 or window_hours > 168 then
    raise exception 'Activity window must be between 1 and 168 hours.' using errcode = 'P0001';
  end if;

  return query
  with recent_users as (
    select distinct e.user_id
    from public.member_activity_events e
    where e.created_at >= now() - make_interval(hours => window_hours)
  ),
  counts as (
    select
      ru.user_id,
      max(e.created_at) as last_activity_at,
      count(*) filter (where e.event_type = 'penpal_request' and e.created_at >= now() - interval '1 hour') as requests_1h,
      count(*) filter (where e.event_type = 'penpal_request' and e.created_at >= now() - interval '24 hours') as requests_24h,
      count(*) filter (where e.event_type = 'letter' and e.created_at >= now() - interval '1 hour') as letters_1h,
      count(*) filter (where e.event_type = 'letter' and e.created_at >= now() - interval '24 hours') as letters_24h,
      count(*) filter (where e.event_type = 'report' and e.created_at >= now() - interval '24 hours') as reports_24h,
      count(*) filter (where e.event_type = 'support_thread' and e.created_at >= now() - interval '24 hours') as support_threads_24h,
      count(*) filter (where e.event_type = 'support_message' and e.created_at >= now() - interval '1 hour') as support_messages_1h,
      count(*) filter (where e.event_type = 'support_message' and e.created_at >= now() - interval '24 hours') as support_messages_24h
    from recent_users ru
    join public.member_activity_events e on e.user_id = ru.user_id
      and e.created_at >= now() - make_interval(hours => window_hours)
    group by ru.user_id
  ),
  duplicate_templates as (
    select x.user_id, coalesce(max(x.template_count), 0)::bigint as repeated_request_template_count
    from (
      select e.user_id, e.metadata->>'content_hash' as content_hash,
             count(distinct e.target_user_id) as template_count
      from public.member_activity_events e
      where e.event_type = 'penpal_request'
        and e.created_at >= now() - interval '24 hours'
        and coalesce(e.metadata->>'content_hash', '') <> md5('')
      group by e.user_id, e.metadata->>'content_hash'
    ) x
    group by x.user_id
  ),
  scored as (
    select
      p.id as user_id,
      p.display_name,
      p.username,
      p.country,
      p.account_status,
      p.created_at as joined_at,
      c.last_activity_at,
      c.requests_1h,
      c.requests_24h,
      c.letters_1h,
      c.letters_24h,
      c.reports_24h,
      c.support_threads_24h,
      c.support_messages_1h,
      c.support_messages_24h,
      coalesce(dt.repeated_request_template_count, 0) as repeated_request_template_count,
      (
        case when p.created_at >= now() - interval '24 hours' and c.requests_24h >= 4 then 4
             when c.requests_24h >= 15 then 3
             when c.requests_24h >= 8 then 1 else 0 end
        + case when c.requests_1h >= 4 then 2 else 0 end
        + case when c.letters_1h >= 15 then 2 when c.letters_1h >= 10 then 1 else 0 end
        + case when c.reports_24h >= 7 then 3 when c.reports_24h >= 4 then 1 else 0 end
        + case when c.support_threads_24h >= 4 then 2 else 0 end
        + case when c.support_messages_1h >= 20 then 2 when c.support_messages_1h >= 12 then 1 else 0 end
        + case when coalesce(dt.repeated_request_template_count, 0) >= 5 then 4
               when coalesce(dt.repeated_request_template_count, 0) >= 3 then 2 else 0 end
      )::integer as attention_score
    from counts c
    join public.profiles p on p.id = c.user_id
    left join duplicate_templates dt on dt.user_id = c.user_id
  )
  select
    s.user_id,
    s.display_name,
    s.username,
    s.country,
    s.account_status,
    s.joined_at,
    s.last_activity_at,
    s.requests_1h,
    s.requests_24h,
    s.letters_1h,
    s.letters_24h,
    s.reports_24h,
    s.support_threads_24h,
    s.support_messages_1h,
    s.support_messages_24h,
    s.repeated_request_template_count,
    s.attention_score,
    array_remove(array[
      case when s.joined_at >= now() - interval '24 hours' and s.requests_24h >= 4 then 'New account sending many requests' end,
      case when s.requests_1h >= 4 then 'Rapid pen-pal requests' end,
      case when s.requests_24h >= 15 then 'High daily pen-pal request volume' end,
      case when s.letters_1h >= 15 then 'Rapid letter sending' end,
      case when s.reports_24h >= 7 then 'High report volume' end,
      case when s.support_threads_24h >= 4 then 'Many new support threads' end,
      case when s.support_messages_1h >= 20 then 'Rapid support messaging' end,
      case when s.repeated_request_template_count >= 5 then 'Same introduction sent to many members'
           when s.repeated_request_template_count >= 3 then 'Repeated introduction template' end
    ]::text[], null) as signals
  from scored s
  order by s.attention_score desc, s.last_activity_at desc
  limit 100;
end;
$$;

create or replace function public.moderator_rate_limit_rules()
returns table(
  limit_key text,
  event_type text,
  scope text,
  window_minutes integer,
  max_actions integer,
  new_account_max_actions integer,
  new_account_age_hours integer,
  enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.' using errcode = 'P0001';
  end if;

  return query
  select arl.limit_key, arl.event_type, arl.scope, arl.window_minutes,
         arl.max_actions, arl.new_account_max_actions,
         arl.new_account_age_hours, arl.enabled
  from public.abuse_rate_limits arl
  order by arl.event_type, arl.window_minutes, arl.scope;
end;
$$;

revoke all on function public.moderator_activity_overview(integer) from public;
revoke all on function public.moderator_rate_limit_rules() from public;
grant execute on function public.moderator_activity_overview(integer) to authenticated;
grant execute on function public.moderator_rate_limit_rules() to authenticated;
