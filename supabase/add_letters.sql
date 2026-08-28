-- Project PenPal: letters and correspondence
-- Run this file once in the Supabase SQL Editor for an existing project.

create extension if not exists pgcrypto;

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.penpal_requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint letters_not_to_self check (sender_id <> recipient_id),
  constraint letters_subject_length check (subject is null or char_length(subject) between 1 and 120),
  constraint letters_body_length check (char_length(body) between 1 and 12000)
);

create index if not exists letters_relationship_created_idx
  on public.letters (relationship_id, created_at);

create index if not exists letters_recipient_unread_idx
  on public.letters (recipient_id, read_at, created_at desc);

alter table public.letters enable row level security;

grant select, insert on table public.letters to authenticated;
grant update (read_at) on table public.letters to authenticated;
grant select, insert, update, delete on table public.letters to service_role;

-- Participants may read letters only inside an accepted pen-pal relationship.
drop policy if exists "Participants can read accepted correspondence" on public.letters;
create policy "Participants can read accepted correspondence"
on public.letters for select
to authenticated
using (
  (sender_id = auth.uid() or recipient_id = auth.uid())
  and exists (
    select 1
    from public.penpal_requests r
    where r.id = relationship_id
      and r.status = 'accepted'
      and (
        (r.sender_id = sender_id and r.recipient_id = recipient_id)
        or
        (r.sender_id = recipient_id and r.recipient_id = sender_id)
      )
      and (r.sender_id = auth.uid() or r.recipient_id = auth.uid())
  )
);

-- A sender can create a letter only to the other participant in an accepted relationship.
drop policy if exists "Pen pals can send letters" on public.letters;
create policy "Pen pals can send letters"
on public.letters for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.penpal_requests r
    where r.id = relationship_id
      and r.status = 'accepted'
      and (
        (r.sender_id = sender_id and r.recipient_id = recipient_id)
        or
        (r.sender_id = recipient_id and r.recipient_id = sender_id)
      )
  )
);

-- Only the recipient may mark a letter as read. Column-level grants prevent
-- authenticated clients from editing the letter body, sender, recipient, or subject.
drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
on public.letters for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());
