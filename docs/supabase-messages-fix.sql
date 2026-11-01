-- ONE Chat — Messages RLS definitive fix
-- Run this in Supabase SQL Editor.
-- The problem: messages RLS checks conversation_members,
-- which itself has RLS that checks conversation_members again → 
-- recursive policy evaluation → Supabase silently returns 0 rows.
-- Fix: use a SECURITY DEFINER function that bypasses RLS for the membership check.

-- Step 1: Create a helper that checks membership without triggering RLS recursion
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

-- Step 2: Rewrite messages SELECT policy to use the helper
DROP POLICY IF EXISTS "messages: member can read" ON public.messages;
CREATE POLICY "messages: member can read"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(conversation_id));

-- Step 3: Rewrite messages INSERT policy to use the helper
DROP POLICY IF EXISTS "messages: member can insert" ON public.messages;
CREATE POLICY "messages: member can insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  );

-- Step 4: Simplify conversation_members SELECT policy (remove self-referencing subquery)
DROP POLICY IF EXISTS "conversation_members: members can read" ON public.conversation_members;
DROP POLICY IF EXISTS "conversations: member can read membership" ON public.conversation_members;
CREATE POLICY "conversation_members: member can read"
  ON public.conversation_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_conversation_member(conversation_id)
  );

-- Step 5: Simplify conversations SELECT policy too
DROP POLICY IF EXISTS "conversations: member can read" ON public.conversations;
CREATE POLICY "conversations: member can read"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_member(id));

-- Step 6: Ensure Realtime publication includes messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
