-- ONE Chat: messages RLS fix v2
-- Fixes recursive RLS deadlock: messages policy → conversation_members policy → conversation_members (loop)
-- Solution: security definer function that checks membership without triggering RLS

-- Step 1: helper function — runs as DB owner, no RLS
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

-- Step 2: rewrite messages policies to use the function (no recursive subquery)
DROP POLICY IF EXISTS "messages: member can read"   ON public.messages;
DROP POLICY IF EXISTS "messages: member can insert" ON public.messages;

CREATE POLICY "messages: member can read"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(conversation_id));

CREATE POLICY "messages: member can insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  );

-- Step 3: rewrite conversation_members policy (same fix)
DROP POLICY IF EXISTS "conversation_members: members can read" ON public.conversation_members;
DROP POLICY IF EXISTS "conversations: member can read membership" ON public.conversation_members;

CREATE POLICY "conversation_members: members can read"
  ON public.conversation_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_conversation_member(conversation_id)
  );

-- Step 4: rewrite conversations policy
DROP POLICY IF EXISTS "conversations: member can read" ON public.conversations;

CREATE POLICY "conversations: member can read"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_member(id));

-- Step 5: replica identity (skip if already done — safe to re-run)
ALTER TABLE public.messages REPLICA IDENTITY FULL;
