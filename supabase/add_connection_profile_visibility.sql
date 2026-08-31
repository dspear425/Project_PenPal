-- Project PenPal: allow request participants to review one another's safe profile details
-- Run once after the relationship, moderation, identity, and profile-photo migrations.
-- Private account information remains in private_account_info and is not exposed here.

-- A pending request creates a legitimate need to inspect the other member's
-- profile even if that member later turns off general Discover visibility.
drop policy if exists "Profiles are visible to their owner and discovery" on public.profiles;
create policy "Profiles are visible to their owner and discovery"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (
    not public.users_are_blocked(auth.uid(), id)
    and (
      (account_status = 'active' and discoverable = true and onboarding_complete = true)
      or exists (
        select 1
        from public.penpal_requests pr
        where pr.status in ('pending', 'accepted', 'paused', 'ended')
          and (
            (pr.sender_id = auth.uid() and pr.recipient_id = profiles.id)
            or (pr.recipient_id = auth.uid() and pr.sender_id = profiles.id)
          )
      )
    )
  )
);

-- Interests follow the same profile-visibility rule so an incoming or outgoing
-- request can be evaluated using the information the member chose for matching.
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
          (p.account_status = 'active' and p.discoverable = true and p.onboarding_complete = true)
          or exists (
            select 1
            from public.penpal_requests pr
            where pr.status in ('pending', 'accepted', 'paused', 'ended')
              and (
                (pr.sender_id = auth.uid() and pr.recipient_id = p.id)
                or (pr.recipient_id = auth.uid() and pr.sender_id = p.id)
              )
          )
        )
    )
  )
);
