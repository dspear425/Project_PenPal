-- Project PenPal: private staff/admin profile photo
-- Run once after pre_beta_cleanup_and_staff_only.sql.
-- Staff photos are separate from member profile photos and never participate in
-- Discover, pen-pal connections, or member-facing avatar visibility.

alter table public.profiles
  add column if not exists staff_avatar_path text,
  add column if not exists staff_avatar_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_staff_avatar_path_length;

alter table public.profiles
  add constraint profiles_staff_avatar_path_length
  check (staff_avatar_path is null or char_length(staff_avatar_path) <= 240);

-- If pre-beta cleanup cleared the old member avatar metadata but the underlying
-- private Storage object still exists, reuse the newest avatar object as the
-- staff identity photo. This does not make that object member-visible because
-- staff_only profiles are excluded by the profile-photo visibility policy.
update public.profiles p
set staff_avatar_path = candidate.name,
    staff_avatar_updated_at = now()
from lateral (
  select o.name
  from storage.objects o
  where o.bucket_id = 'profile-photos'
    and o.name like p.id::text || '/avatar-%'
  order by coalesce(o.updated_at, o.created_at) desc, o.name desc
  limit 1
) candidate
where p.staff_only = true
  and p.staff_avatar_path is null
  and exists (
    select 1 from public.admin_users a
    where a.user_id = p.id
  );

create or replace function public.save_my_staff_photo(photo_path text)
returns table(
  staff_avatar_path text,
  staff_avatar_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  caller uuid := auth.uid();
  clean_path text := nullif(trim(photo_path), '');
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;

  if not public.is_moderator(caller) then
    raise exception 'Staff access required.' using errcode = 'P0001';
  end if;

  if clean_path is null
     or clean_path !~ ('^' || caller::text || '/staff-avatar-[A-Za-z0-9._-]+\.jpg$')
     or char_length(clean_path) > 240 then
    raise exception 'Staff-photo path is invalid.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'profile-photos'
      and o.name = clean_path
  ) then
    raise exception 'Upload the staff photo before saving it.' using errcode = 'P0001';
  end if;

  update public.profiles p
  set staff_avatar_path = clean_path,
      staff_avatar_updated_at = now()
  where p.id = caller;

  if not found then
    raise exception 'Staff profile not found.' using errcode = 'P0001';
  end if;

  return query
  select p.staff_avatar_path, p.staff_avatar_updated_at
  from public.profiles p
  where p.id = caller;
end;
$$;

create or replace function public.remove_my_staff_photo()
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

  if not public.is_moderator(caller) then
    raise exception 'Staff access required.' using errcode = 'P0001';
  end if;

  update public.profiles
  set staff_avatar_path = null,
      staff_avatar_updated_at = now()
  where id = caller;
end;
$$;

revoke all on function public.save_my_staff_photo(text) from public;
revoke all on function public.remove_my_staff_photo() from public;
grant execute on function public.save_my_staff_photo(text) to authenticated;
grant execute on function public.remove_my_staff_photo() to authenticated;

-- Members cannot directly write these fields. Staff changes go only through the
-- guarded functions above. Existing moderator profile SELECT access allows staff
-- tools to display staff photos, while staff_only profile visibility prevents
-- ordinary members from seeing the profile row or obtaining signed URLs.
revoke update (staff_avatar_path, staff_avatar_updated_at) on public.profiles from authenticated;
