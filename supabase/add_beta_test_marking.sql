-- Project PenPal: explicitly mark a beta invitation as test data before cleanup.
-- Run after add_beta_operations.sql.

create or replace function public.mark_beta_invite_as_test(
  target_invite uuid,
  confirmation text
)
returns table(
  invite_id uuid,
  updated_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  invite_row public.beta_invites%rowtype;
  next_label text;
begin
  if caller is null or not exists (
    select 1
    from public.admin_users a
    where a.user_id = caller
      and a.role = 'owner'
  ) then
    raise exception 'Owner access required.' using errcode = 'P0001';
  end if;

  if confirmation <> 'MARK AS TEST' then
    raise exception 'Confirmation phrase does not match.' using errcode = 'P0001';
  end if;

  select * into invite_row
  from public.beta_invites
  where id = target_invite
  for update;

  if not found then
    raise exception 'Invitation not found.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.beta_invite_redemptions r
    join public.admin_users a on a.user_id = r.user_id
    where r.invite_id = target_invite
  ) then
    raise exception 'An invitation redeemed by a staff account cannot be marked as test data.' using errcode = 'P0001';
  end if;

  if coalesce(invite_row.label, '') ilike '%test%' then
    next_label := invite_row.label;
  else
    next_label := case
      when nullif(trim(invite_row.label), '') is null then 'Test invitation'
      else left(trim(invite_row.label), 91) || ' — test'
    end;

    update public.beta_invites
    set label = next_label
    where id = target_invite;
  end if;

  return query select target_invite, next_label;
end;
$$;

revoke all on function public.mark_beta_invite_as_test(uuid, text) from public;
grant execute on function public.mark_beta_invite_as_test(uuid, text) to authenticated;
