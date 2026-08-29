-- Project PenPal: optional private profile photos with visibility controls
-- Run once in Supabase SQL Editor after the Owner/Admin Team migrations.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists avatar_visibility text not null default 'discover',
  add column if not exists avatar_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_avatar_visibility;
alter table public.profiles
  add constraint profiles_avatar_visibility
  check (avatar_visibility in ('discover', 'connections', 'hidden'));

alter table public.profiles
  drop constraint if exists profiles_avatar_path_length;
alter table public.profiles
  add constraint profiles_avatar_path_length
  check (avatar_path is null or char_length(avatar_path) <= 240);

-- Private bucket. Browser processing normally reduces uploads far below this,
-- but the bucket also rejects anything larger than 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Members write only inside their own user-id folder.
drop policy if exists "Members upload their own profile photo" on storage.objects;
create policy "Members upload their own profile photo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members replace their own profile photo" on storage.objects;
create policy "Members replace their own profile photo"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members delete their own profile photo" on storage.objects;
create policy "Members delete their own profile photo"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Signed URLs still require SELECT permission. This policy is the privacy gate:
-- owner/moderators can read, Discover photos follow normal discovery eligibility,
-- and Connections-only photos require an established relationship.
drop policy if exists "Profile photo visibility follows member privacy" on storage.objects;
create policy "Profile photo visibility follows member privacy"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
      and p.avatar_path = name
      and (
        p.id = auth.uid()
        or public.is_moderator()
        or (
          p.avatar_visibility = 'discover'
          and p.account_status = 'active'
          and p.onboarding_complete = true
          and p.discoverable = true
          and not public.users_are_blocked(auth.uid(), p.id)
        )
        or (
          p.avatar_visibility = 'connections'
          and not public.users_are_blocked(auth.uid(), p.id)
          and exists (
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

-- Avatar metadata is changed through a guarded RPC rather than ordinary profile
-- UPDATE privileges, preserving the tightened profile-write permissions.
create or replace function public.save_my_profile_photo(
  photo_path text,
  visibility text
)
returns table(
  avatar_path text,
  avatar_visibility text,
  avatar_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean_path text := nullif(trim(photo_path), '');
  clean_visibility text := lower(trim(visibility));
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if clean_visibility not in ('discover', 'connections', 'hidden') then
    raise exception 'Invalid profile-photo visibility.' using errcode = 'P0001';
  end if;

  if clean_path is not null then
    if clean_path <> caller::text || '/avatar.jpg' then
      raise exception 'Profile-photo path is invalid.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'profile-photos'
        and o.name = clean_path
    ) then
      raise exception 'Upload the profile photo before saving it.' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles p
  set avatar_path = clean_path,
      avatar_visibility = clean_visibility,
      avatar_updated_at = case when p.avatar_path is distinct from clean_path then now() else coalesce(p.avatar_updated_at, now()) end
  where p.id = caller;

  return query
  select p.avatar_path, p.avatar_visibility, p.avatar_updated_at
  from public.profiles p
  where p.id = caller;
end;
$$;

create or replace function public.remove_my_profile_photo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  update public.profiles
  set avatar_path = null,
      avatar_updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.save_my_profile_photo(text, text) from public;
revoke all on function public.remove_my_profile_photo() from public;
grant execute on function public.save_my_profile_photo(text, text) to authenticated;
grant execute on function public.remove_my_profile_photo() to authenticated;
