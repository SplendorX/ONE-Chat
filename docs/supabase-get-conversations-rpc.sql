-- ONE Chat — get_my_conversations RPC
-- Run in Supabase SQL Editor.
-- Returns all conversations the calling user is a member of,
-- with the other participant's name/handle for DMs.
-- Runs as security definer so it bypasses RLS timing issues on page load.

create or replace function public.get_my_conversations()
returns table (
  id            uuid,
  type          text,
  name          text,
  is_group      boolean,
  avatar_url    text,
  updated_at    timestamptz,
  other_user_id uuid,
  other_name    text,
  other_handle  text,
  last_content  text,
  last_type     text,
  last_at       timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  return query
  select
    c.id,
    case when c.is_group then 'group' else 'direct' end as type,
    c.name,
    c.is_group,
    c.avatar_url,
    c.updated_at,
    -- other participant for DMs
    (select cm2.user_id
       from conversation_members cm2
      where cm2.conversation_id = c.id
        and cm2.user_id <> me
      limit 1) as other_user_id,
    -- other participant display name
    (select p.display_name
       from conversation_members cm2
       join profiles p on p.id = cm2.user_id
      where cm2.conversation_id = c.id
        and cm2.user_id <> me
      limit 1) as other_name,
    -- other participant handle
    (select oi.handle
       from conversation_members cm2
       join one_identities oi on oi.user_id = cm2.user_id
      where cm2.conversation_id = c.id
        and cm2.user_id <> me
      limit 1) as other_handle,
    -- last message
    (select m.content
       from messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1) as last_content,
    (select m.type
       from messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1) as last_type,
    (select m.created_at
       from messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1) as last_at
  from conversations c
  join conversation_members cm on cm.conversation_id = c.id
  where cm.user_id = me
  order by coalesce(
    (select m2.created_at from messages m2 where m2.conversation_id = c.id order by m2.created_at desc limit 1),
    c.updated_at
  ) desc
  limit 50;
end;
$$;

grant execute on function public.get_my_conversations() to authenticated;
