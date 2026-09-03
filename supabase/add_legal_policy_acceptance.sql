-- Project PenPal: legal-policy versions, immutable acceptance records, and export integration
-- Run after the existing Project PenPal migrations.

-- ---------------------------------------------------------------------------
-- Current policy metadata. Policy text lives in the app source; this table is the
-- authoritative server-side record of which version currently requires acceptance.
-- ---------------------------------------------------------------------------

create table if not exists public.legal_policy_versions (
  document_key text primary key,
  title text not null,
  current_version text not null,
  effective_date date not null,
  acceptance_required boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint legal_policy_document_key_check check (
    document_key in ('terms', 'privacy', 'community', 'safety', 'profile_photo', 'snail_mail')
  )
);

insert into public.legal_policy_versions (
  document_key, title, current_version, effective_date, acceptance_required, updated_at
) values
  ('terms', 'Terms of Service', '1.0', date '2026-09-02', true, now()),
  ('privacy', 'Privacy Policy', '1.0', date '2026-09-02', true, now()),
  ('community', 'Community Guidelines', '1.0', date '2026-09-02', true, now()),
  ('safety', 'Member Safety Guidelines', '1.0', date '2026-09-02', false, now()),
  ('profile_photo', 'Profile Photo Guidelines', '1.0', date '2026-09-02', false, now()),
  ('snail_mail', 'Snail Mail & Address-Sharing Guidelines', '1.0', date '2026-09-02', false, now())
on conflict (document_key) do update
set title = excluded.title,
    current_version = excluded.current_version,
    effective_date = excluded.effective_date,
    acceptance_required = excluded.acceptance_required,
    updated_at = now();

grant select on public.legal_policy_versions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Immutable member acceptance history. Old versions remain when a policy changes.
-- ---------------------------------------------------------------------------

create table if not exists public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null references public.legal_policy_versions(document_key),
  version text not null,
  accepted_at timestamptz not null default now(),
  accepted_source text not null,
  primary key (user_id, document_key, version),
  constraint legal_acceptance_source_check check (accepted_source in ('signup', 'in_app'))
);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own
on public.legal_acceptances
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;

-- ---------------------------------------------------------------------------
-- Record the required versions accepted during sign-up. Supabase sign-up metadata
-- carries only version strings. This trigger validates those strings against the
-- server's current policy table and supplies the trusted server timestamp itself.
-- ---------------------------------------------------------------------------

create or replace function public.record_signup_legal_acceptances()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  policy_row record;
  supplied_version text;
begin
  for policy_row in
    select document_key, current_version
    from public.legal_policy_versions
    where acceptance_required = true
  loop
    supplied_version := new.raw_user_meta_data ->> ('legal_' || policy_row.document_key || '_version');

    if supplied_version = policy_row.current_version then
      insert into public.legal_acceptances (
        user_id, document_key, version, accepted_at, accepted_source
      ) values (
        new.id, policy_row.document_key, policy_row.current_version, now(), 'signup'
      )
      on conflict (user_id, document_key, version) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.record_signup_legal_acceptances() from public;

drop trigger if exists on_auth_user_created_record_legal on auth.users;
create trigger on_auth_user_created_record_legal
after insert on auth.users
for each row execute function public.record_signup_legal_acceptances();

-- ---------------------------------------------------------------------------
-- Member-facing status and acceptance RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_legal_status()
returns table (
  document_key text,
  title text,
  current_version text,
  effective_date date,
  acceptance_required boolean,
  accepted_at timestamptz,
  needs_acceptance boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.document_key,
    p.title,
    p.current_version,
    p.effective_date,
    p.acceptance_required,
    a.accepted_at,
    (p.acceptance_required and a.accepted_at is null) as needs_acceptance
  from public.legal_policy_versions p
  left join public.legal_acceptances a
    on a.user_id = auth.uid()
   and a.document_key = p.document_key
   and a.version = p.current_version
  where auth.uid() is not null
  order by
    case p.document_key
      when 'terms' then 1
      when 'privacy' then 2
      when 'community' then 3
      when 'safety' then 4
      when 'profile_photo' then 5
      when 'snail_mail' then 6
      else 99
    end;
$$;

revoke all on function public.get_my_legal_status() from public;
grant execute on function public.get_my_legal_status() to authenticated;

create or replace function public.accept_current_required_policies()
returns void
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

  insert into public.legal_acceptances (
    user_id, document_key, version, accepted_at, accepted_source
  )
  select
    caller,
    p.document_key,
    p.current_version,
    now(),
    'in_app'
  from public.legal_policy_versions p
  where p.acceptance_required = true
  on conflict (user_id, document_key, version) do nothing;
end;
$$;

revoke all on function public.accept_current_required_policies() from public;
grant execute on function public.accept_current_required_policies() to authenticated;

-- ---------------------------------------------------------------------------
-- Extend Settings > Your data so members receive their own legal acceptance
-- history. No other member's policy records are included.
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
    'legal_acceptances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'document_key', la.document_key,
        'version', la.version,
        'accepted_at', la.accepted_at,
        'accepted_source', la.accepted_source
      ) order by la.accepted_at)
      from public.legal_acceptances la
      where la.user_id = caller
    ), '[]'::jsonb),
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
