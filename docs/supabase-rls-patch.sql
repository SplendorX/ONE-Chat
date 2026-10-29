-- ONE Chat — RLS patch
-- Run in: Supabase Dashboard → SQL Editor → New query
-- This fixes two RLS gaps that block starting new conversations.

-- ── 1. profiles: allow any signed-in user to read any profile ────────────────
-- Without this, searching for another user's display name returns null
-- because the policy only allowed reading your own row.
drop policy if exists "profiles: anyone authenticated can read" on public.profiles;
drop policy if exists "profiles: owner can read" on public.profiles;
create policy "profiles: anyone authenticated can read"
  on public.profiles for select
  using (auth.uid() is not null);


-- ── 2. conversation_members: members can see co-members ──────────────────────
-- Without this, checking for an existing shared conversation fails:
-- the query reads the other person's membership rows, which RLS blocked.
drop policy if exists "conversation_members: members can read" on public.conversation_members;
create policy "conversation_members: members can read"
  on public.conversation_members for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.conversation_members me
      where me.conversation_id = conversation_members.conversation_id
        and me.user_id = auth.uid()
    )
  );


-- ── 3. find_or_create_dm: security-definer function ─────────────────────────
-- Runs as the DB owner so it bypasses RLS entirely.
-- Returns the conversation id (existing or newly created).
create or replace function public.find_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_caller  uuid := auth.uid();
begin
  -- Find existing 1-on-1 conversation between caller and other_user_id
  select cm1.conversation_id into v_conv_id
  from   conversation_members cm1
  join   conversation_members cm2
         on  cm2.conversation_id = cm1.conversation_id
         and cm2.user_id = other_user_id
  join   conversations c
         on  c.id = cm1.conversation_id
         and c.is_group = false
  where  cm1.user_id = v_caller
  limit  1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- Create new conversation
  insert into conversations (is_group) values (false)
  returning id into v_conv_id;

  -- Add both members
  insert into conversation_members (conversation_id, user_id)
  values (v_conv_id, v_caller), (v_conv_id, other_user_id);

  return v_conv_id;
end;
$$;


-- ── 4. create_group_conversation: security-definer function ──────────────────
create or replace function public.create_group_conversation(
  group_name   text,
  member_ids   uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_caller  uuid := auth.uid();
  v_member  uuid;
begin
  insert into conversations (is_group, name) values (true, group_name)
  returning id into v_conv_id;

  -- Add caller
  insert into conversation_members (conversation_id, user_id)
  values (v_conv_id, v_caller);

  -- Add other members
  foreach v_member in array member_ids loop
    if v_member <> v_caller then
      insert into conversation_members (conversation_id, user_id)
      values (v_conv_id, v_member);
    end if;
  end loop;

  return v_conv_id;
end;
$$;
