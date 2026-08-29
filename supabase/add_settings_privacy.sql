-- Project PenPal: Settings, Privacy, notification preferences, data export,
-- account deletion, and profile-write hardening.
-- Run once in Supabase SQL Editor after the identity/moderation migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_penpal_requests boolean not null default true,
  email_request_accepted boolean not null default true,
  email_new_letters boolean not null default true,
  email_support_replies boolean not null default true,
  product_updates boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

grant select, insert, update on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.notification_preferences to service_role;

drop policy if exists "Members can read their notification preferences" on public.notification_preferences;
create policy "Members can read their notification preferences"
on public.notification_preferences for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Members can create their notification preferences" on public.notification_preferences;
create policy "Members can create their notification preferences"
on public.notification_preferences for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Members can update their notification preferences" on public.notification_preferences;
create policy "Members can update their notification preferences"
on public.notification_preferences for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Harden profile writes.
-- Moderation-only fields such as account_status and suspended_until must never
-- be writable by a normal authenticated client.
-- ---------------------------------------------------------------------------

revoke insert, update on table public.profiles from authenticated;

grant insert (
  id,
  display_name,
  birth_year,
  country,
  region,
  nearest_city,
  about_me,
  languages,
  friendship_goals,
  communication_style,
  correspondence_frequency,
  accepting_new_penpals,
  max_penpals,
  onboarding_complete,
  discoverable,
  username,
  username_customized
) on public.profiles to authenticated;

grant update (
  display_name,
  birth_year,
  country,
  region,
  nearest_city,
  about_me,
  languages,
  friendship_goals,
  communication_style,
  correspondence_frequency,
  accepting_new_penpals,
  max_penpals,
  onboarding_complete,
  discoverable,
  username,
  username_customized
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Data export
-- Returns only data the member is entitled to see about their own account.
-- It intentionally does not reveal who has blocked or reported the member.
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
      select to_jsonb(pai)
      from public.private_account_info pai
      where pai.user_id = caller
    ),
    'notification_preferences', (
      select to_jsonb(np)
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
    'blocks_created_by_me', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at)
      from public.blocks b
      where b.blocker_id = caller
    ), '[]'::jsonb),
    'reports_submitted_by_me', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.reports r
      where r.reporter_id = caller
    ), '[]'::jsonb),
    'support_threads', coalesce((
      select jsonb_agg(to_jsonb(st) order by st.created_at)
      from public.support_threads st
      where st.user_id = caller
    ), '[]'::jsonb),
    'support_messages', coalesce((
      select jsonb_agg(to_jsonb(sm) order by sm.created_at)
      from public.support_messages sm
      where exists (
        select 1 from public.support_threads st
        where st.id = sm.thread_id and st.user_id = caller
      )
    ), '[]'::jsonb),
    'account_notices', coalesce((
      select jsonb_agg(to_jsonb(mn) order by mn.created_at)
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

-- ---------------------------------------------------------------------------
-- Self-service account deletion
-- Moderator/admin accounts cannot self-delete through the member UI because
-- doing so could destroy the moderation access path or audit integrity.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account(confirmation text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if confirmation <> 'DELETE MY ACCOUNT' then
    raise exception 'Type DELETE MY ACCOUNT exactly to confirm.' using errcode = 'P0001';
  end if;

  if public.is_moderator(caller) then
    raise exception 'Moderator and administrator accounts cannot be self-deleted. Transfer/remove the moderation role first.' using errcode = 'P0001';
  end if;

  delete from auth.users where id = caller;

  if not found then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.delete_my_account(text) from public;
grant execute on function public.delete_my_account(text) to authenticated;
