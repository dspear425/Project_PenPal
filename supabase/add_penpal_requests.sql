-- Project PenPal: pen-pal requests and accepted relationships
-- Run this file once in the Supabase SQL Editor after the initial schema.

create table if not exists public.penpal_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  intro_message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint penpal_requests_different_users check (sender_id <> recipient_id),
  constraint penpal_requests_intro_length check (intro_message is null or char_length(intro_message) <= 500),
  constraint penpal_requests_status check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

-- At most one pending or accepted connection can exist between the same two people,
-- regardless of who initiated it. Declined/cancelled requests do not block a future request.
create unique index if not exists penpal_requests_one_open_pair
on public.penpal_requests (
  least(sender_id, recipient_id),
  greatest(sender_id, recipient_id)
)
where status in ('pending', 'accepted');

create index if not exists penpal_requests_sender_idx on public.penpal_requests(sender_id);
create index if not exists penpal_requests_recipient_idx on public.penpal_requests(recipient_id);
create index if not exists penpal_requests_status_idx on public.penpal_requests(status);

alter table public.penpal_requests enable row level security;

grant select on table public.penpal_requests to authenticated;
grant insert (sender_id, recipient_id, intro_message, status) on table public.penpal_requests to authenticated;
grant update (status, responded_at) on table public.penpal_requests to authenticated;
grant select, insert, update, delete on table public.penpal_requests to service_role;

-- Members can only see requests/connections that involve them.
drop policy if exists "Members can view their pen-pal requests" on public.penpal_requests;
create policy "Members can view their pen-pal requests"
on public.penpal_requests for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

-- A request can only be sent by the signed-in member to a completed, discoverable
-- member who is currently accepting new pen pals.
drop policy if exists "Members can send pen-pal requests" on public.penpal_requests;
create policy "Members can send pen-pal requests"
on public.penpal_requests for insert
to authenticated
with check (
  sender_id = auth.uid()
  and recipient_id <> auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.profiles p
    where p.id = recipient_id
      and p.onboarding_complete = true
      and p.discoverable = true
      and p.accepting_new_penpals = true
  )
);

-- Only the recipient may accept or decline a pending request.
drop policy if exists "Recipients can respond to requests" on public.penpal_requests;
create policy "Recipients can respond to requests"
on public.penpal_requests for update
to authenticated
using (recipient_id = auth.uid() and status = 'pending')
with check (recipient_id = auth.uid() and status in ('accepted', 'declined'));

-- Only the sender may cancel a pending request.
drop policy if exists "Senders can cancel pending requests" on public.penpal_requests;
create policy "Senders can cancel pending requests"
on public.penpal_requests for update
to authenticated
using (sender_id = auth.uid() and status = 'pending')
with check (sender_id = auth.uid() and status = 'cancelled');

-- Keep updated_at accurate without granting clients permission to write it directly.
drop trigger if exists penpal_requests_set_updated_at on public.penpal_requests;
create trigger penpal_requests_set_updated_at
before update on public.penpal_requests
for each row execute procedure public.set_updated_at();

-- Once two people are accepted pen pals, they should remain able to see each other's
-- profile even if one later hides from Discover.
drop policy if exists "Profiles are visible to their owner and discovery" on public.profiles;
create policy "Profiles are visible to their owner and discovery"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (discoverable = true and onboarding_complete = true)
  or exists (
    select 1
    from public.penpal_requests pr
    where pr.status = 'accepted'
      and (
        (pr.sender_id = auth.uid() and pr.recipient_id = profiles.id)
        or (pr.recipient_id = auth.uid() and pr.sender_id = profiles.id)
      )
  )
);
