-- Project PenPal: blocked-member management
-- Run this once in the Supabase SQL Editor for an existing project.

-- A blocker needs a safe way to manage their own block list without making
-- blocked profiles visible through normal discovery/profile queries.
create or replace function public.list_my_blocks()
returns table (
  blocked_id uuid,
  display_name text,
  country text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.blocked_id,
    coalesce(p.display_name, 'Member') as display_name,
    p.country,
    b.created_at as blocked_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.list_my_blocks() from public;
grant execute on function public.list_my_blocks() to authenticated;
