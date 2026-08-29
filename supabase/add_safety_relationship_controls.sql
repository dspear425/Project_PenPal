-- Project PenPal: safety, blocking, reporting, relationship controls, and capacity enforcement
-- Run this file once in the Supabase SQL Editor for an existing project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Relationship lifecycle
-- ---------------------------------------------------------------------------

alter table public.penpal_requests
  add column if not exists paused_by uuid references public.profiles(id) on delete set null,
  add column if not exists paused_at timestamptz,
  add column if not exists ended_by uuid references public.profiles(id) on delete set null,
  add column if not exists ended_at timestamptz;

alter table public.penpal_requests
  drop constraint if exists penpal_requests_status;

alter table public.penpal_requests
  add constraint penpal_requests_status
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'paused', 'ended'));

-- Ended relationships no longer prevent the same two people from reconnecting later.
drop index if exists public.penpal_requests_one_open_pair;
create unique index penpal_requests_one_open_pair
on public.penpal_requests (
  least(sender_id, recipient_id),
  greatest(sender_id, recipient_id)
)
where status in ('pending', 'accepted', 'paused');

-- ---------------------------------------------------------------------------
-- Blocks and reports
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_not_self check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks(blocker_id);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  relationship_id uuid references public.penpal_requests(id) on delete set null,
  category text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint reports_not_self check (reporter_id <> reported_id),
  constraint reports_category check (category in (
    'harassment',
    'scam',
    'sexual_content',
    'hate_abuse',
    'impersonation',
    'spam',
    'other'
  )),
  constraint reports_details_length check (details is null or char_length(details) <= 2000),
  constraint reports_status check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create index if not exists reports_reporter_idx on public.reports(reporter_id, created_at desc);
create index if not exists reports_reported_idx on public.reports(reported_id, created_at desc);
create index if not exists reports_status_idx on public.reports(status, created_at desc);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

grant select, insert, delete on table public.blocks to authenticated;
grant select, insert on table public.reports to authenticated;
grant select, insert, update, delete on table public.blocks to service_role;
grant select, insert, update, delete on table public.reports to service_role;

-- A member can manage only blocks they created. The blocked member cannot query
-- whether another person blocked them through this table.
drop policy if exists "Members can view their own blocks" on public.blocks;
create policy "Members can view their own blocks"
on public.blocks for select
to authenticated
using (blocker_id = auth.uid());

drop policy if exists "Members can create their own blocks" on public.blocks;
create policy "Members can create their own blocks"
on public.blocks for insert
to authenticated
with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists "Members can remove their own blocks" on public.blocks;
create policy "Members can remove their own blocks"
on public.blocks for delete
to authenticated
using (blocker_id = auth.uid());

-- Reports remain private to the reporter. Moderators will use service-role/admin
-- access in the future moderation dashboard.
drop policy if exists "Members can view reports they submitted" on public.reports;
create policy "Members can view reports they submitted"
on public.reports for select
to authenticated
using (reporter_id = auth.uid());

drop policy if exists "Members can submit reports" on public.reports;
create policy "Members can submit reports"
on public.reports for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and reported_id <> auth.uid()
  and (
    relationship_id is null
    or exists (
      select 1
      from public.penpal_requests pr
      where pr.id = relationship_id
        and (pr.sender_id = auth.uid() or pr.recipient_id = auth.uid())
        and (pr.sender_id = reported_id or pr.recipient_id = reported_id)
    )
  )
);

-- ---------------------------------------------------------------------------
-- Block-aware helper
-- ---------------------------------------------------------------------------

create or replace function public.users_are_blocked(user_a uuid, user_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Do not turn this helper into a way to inspect blocks between unrelated users.
  if auth.uid() is null or (auth.uid() <> user_a and auth.uid() <> user_b) then
    return false;
  end if;

  return exists (
    select 1
    from public.blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
end;
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Capacity and block enforcement
-- ---------------------------------------------------------------------------

create or replace function public.enforce_penpal_capacity_and_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_limit integer;
  recipient_limit integer;
  sender_count integer;
  recipient_count integer;
begin
  -- Check a new request, and check again at acceptance in case either person's
  -- active relationships changed while the request was waiting.
  if (tg_op = 'INSERT' and new.status = 'pending')
     or (tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted') then

    if public.users_are_blocked(new.sender_id, new.recipient_id) then
      raise exception 'This connection is not available.' using errcode = 'P0001';
    end if;

    select max_penpals into sender_limit
    from public.profiles
    where id = new.sender_id;

    select max_penpals into recipient_limit
    from public.profiles
    where id = new.recipient_id;

    select count(*)::integer into sender_count
    from public.penpal_requests pr
    where pr.status in ('accepted', 'paused')
      and (pr.sender_id = new.sender_id or pr.recipient_id = new.sender_id);

    select count(*)::integer into recipient_count
    from public.penpal_requests pr
    where pr.status in ('accepted', 'paused')
      and (pr.sender_id = new.recipient_id or pr.recipient_id = new.recipient_id);

    if sender_limit is not null and sender_count >= sender_limit then
      if auth.uid() = new.sender_id then
        raise exception 'You have reached your pen-pal capacity. End a relationship or increase your capacity before adding another pen pal.' using errcode = 'P0001';
      else
        raise exception 'This member has reached their pen-pal capacity.' using errcode = 'P0001';
      end if;
    end if;

    if recipient_limit is not null and recipient_count >= recipient_limit then
      if auth.uid() = new.recipient_id then
        raise exception 'You have reached your pen-pal capacity. End a relationship or increase your capacity before accepting another pen pal.' using errcode = 'P0001';
      else
        raise exception 'This member has reached their pen-pal capacity.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists penpal_requests_capacity_and_blocks on public.penpal_requests;
create trigger penpal_requests_capacity_and_blocks
before insert or update of status on public.penpal_requests
for each row execute procedure public.enforce_penpal_capacity_and_blocks();

-- ---------------------------------------------------------------------------
-- Relationship-control RPCs
-- ---------------------------------------------------------------------------

create or replace function public.pause_relationship(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
  for update;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Relationship not found.' using errcode = 'P0001';
  end if;

  if rel.status <> 'accepted' then
    raise exception 'Only an active relationship can be paused.' using errcode = 'P0001';
  end if;

  if public.users_are_blocked(rel.sender_id, rel.recipient_id) then
    raise exception 'This connection is not available.' using errcode = 'P0001';
  end if;

  update public.penpal_requests
  set status = 'paused', paused_by = caller, paused_at = now()
  where id = target_relationship;
end;
$$;

create or replace function public.resume_relationship(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
  for update;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Relationship not found.' using errcode = 'P0001';
  end if;

  if rel.status <> 'paused' then
    raise exception 'This relationship is not paused.' using errcode = 'P0001';
  end if;

  if rel.paused_by <> caller then
    raise exception 'Only the person who paused the relationship can resume it.' using errcode = 'P0001';
  end if;

  if public.users_are_blocked(rel.sender_id, rel.recipient_id) then
    raise exception 'This connection is not available.' using errcode = 'P0001';
  end if;

  update public.penpal_requests
  set status = 'accepted', paused_by = null, paused_at = null
  where id = target_relationship;
end;
$$;

create or replace function public.end_relationship(target_relationship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rel public.penpal_requests%rowtype;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  select * into rel
  from public.penpal_requests
  where id = target_relationship
  for update;

  if not found or (rel.sender_id <> caller and rel.recipient_id <> caller) then
    raise exception 'Relationship not found.' using errcode = 'P0001';
  end if;

  if rel.status not in ('accepted', 'paused') then
    raise exception 'This relationship is no longer active.' using errcode = 'P0001';
  end if;

  update public.penpal_requests
  set status = 'ended', ended_by = caller, ended_at = now()
  where id = target_relationship;
end;
$$;

create or replace function public.block_member(target_user uuid)
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

  if target_user is null or target_user = caller then
    raise exception 'You cannot block this account.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (caller, target_user)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Blocking immediately closes any open request or relationship between the two
  -- members. Historical rows remain for moderation/audit purposes.
  update public.penpal_requests
  set status = 'ended', ended_by = caller, ended_at = now()
  where ((sender_id = caller and recipient_id = target_user)
      or (sender_id = target_user and recipient_id = caller))
    and status in ('pending', 'accepted', 'paused');
end;
$$;

create or replace function public.unblock_member(target_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.blocks
  where blocker_id = auth.uid()
    and blocked_id = target_user;
$$;

revoke all on function public.pause_relationship(uuid) from public;
revoke all on function public.resume_relationship(uuid) from public;
revoke all on function public.end_relationship(uuid) from public;
revoke all on function public.block_member(uuid) from public;
revoke all on function public.unblock_member(uuid) from public;

grant execute on function public.pause_relationship(uuid) to authenticated;
grant execute on function public.resume_relationship(uuid) to authenticated;
grant execute on function public.end_relationship(uuid) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.unblock_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Make existing visibility and messaging rules block-aware
-- ---------------------------------------------------------------------------

-- Profiles: discovery/past-relationship visibility stops if either side blocked
-- the other. A member can always see their own profile.
drop policy if exists "Profiles are visible to their owner and discovery" on public.profiles;
create policy "Profiles are visible to their owner and discovery"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (
    not public.users_are_blocked(auth.uid(), id)
    and (
      (discoverable = true and onboarding_complete = true)
      or exists (
        select 1
        from public.penpal_requests pr
        where pr.status in ('accepted', 'paused', 'ended')
          and (
            (pr.sender_id = auth.uid() and pr.recipient_id = profiles.id)
            or (pr.recipient_id = auth.uid() and pr.sender_id = profiles.id)
          )
      )
    )
  )
);

-- Interest visibility follows profile visibility and block rules.
drop policy if exists "Profile interests follow profile visibility" on public.profile_interests;
create policy "Profile interests follow profile visibility"
on public.profile_interests for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    not public.users_are_blocked(auth.uid(), profile_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_id
        and (
          (p.discoverable = true and p.onboarding_complete = true)
          or exists (
            select 1
            from public.penpal_requests pr
            where pr.status in ('accepted', 'paused', 'ended')
              and (
                (pr.sender_id = auth.uid() and pr.recipient_id = p.id)
                or (pr.recipient_id = auth.uid() and pr.sender_id = p.id)
              )
          )
        )
    )
  )
);

-- Members see only their own request/relationship rows, and blocked pairs are
-- hidden from normal client queries.
drop policy if exists "Members can view their pen-pal requests" on public.penpal_requests;
create policy "Members can view their pen-pal requests"
on public.penpal_requests for select
to authenticated
using (
  (sender_id = auth.uid() or recipient_id = auth.uid())
  and not public.users_are_blocked(sender_id, recipient_id)
);

-- Requests cannot be sent through a block.
drop policy if exists "Members can send pen-pal requests" on public.penpal_requests;
create policy "Members can send pen-pal requests"
on public.penpal_requests for insert
to authenticated
with check (
  sender_id = auth.uid()
  and recipient_id <> auth.uid()
  and status = 'pending'
  and not public.users_are_blocked(sender_id, recipient_id)
  and exists (
    select 1
    from public.profiles p
    where p.id = recipient_id
      and p.onboarding_complete = true
      and p.discoverable = true
      and p.accepting_new_penpals = true
  )
);

-- Letters remain readable after a pause/end so people keep their correspondence
-- history, but blocking removes access to that history through the normal client.
drop policy if exists "Participants can read accepted correspondence" on public.letters;
create policy "Participants can read accepted correspondence"
on public.letters for select
to authenticated
using (
  (sender_id = auth.uid() or recipient_id = auth.uid())
  and not public.users_are_blocked(sender_id, recipient_id)
  and exists (
    select 1
    from public.penpal_requests r
    where r.id = relationship_id
      and r.status in ('accepted', 'paused', 'ended')
      and (
        (r.sender_id = sender_id and r.recipient_id = recipient_id)
        or (r.sender_id = recipient_id and r.recipient_id = sender_id)
      )
      and (r.sender_id = auth.uid() or r.recipient_id = auth.uid())
  )
);

-- New letters can only be sent while the relationship is actively accepted.
drop policy if exists "Pen pals can send letters" on public.letters;
create policy "Pen pals can send letters"
on public.letters for insert
to authenticated
with check (
  sender_id = auth.uid()
  and not public.users_are_blocked(sender_id, recipient_id)
  and exists (
    select 1
    from public.penpal_requests r
    where r.id = relationship_id
      and r.status = 'accepted'
      and (
        (r.sender_id = sender_id and r.recipient_id = recipient_id)
        or (r.sender_id = recipient_id and r.recipient_id = sender_id)
      )
  )
);

-- The recipient can mark an accessible letter read, including while a
-- relationship is paused or ended.
drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
on public.letters for update
to authenticated
using (
  recipient_id = auth.uid()
  and not public.users_are_blocked(sender_id, recipient_id)
  and exists (
    select 1
    from public.penpal_requests r
    where r.id = relationship_id
      and r.status in ('accepted', 'paused', 'ended')
  )
)
with check (recipient_id = auth.uid());
