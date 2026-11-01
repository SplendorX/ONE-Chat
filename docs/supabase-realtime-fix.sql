-- ONE Chat — Realtime fix
-- Run in: Supabase Dashboard → SQL Editor → New query
-- This fixes messages not appearing in real-time between users.

-- ── 1. REPLICA IDENTITY FULL on messages ─────────────────────────────────────
-- Supabase Realtime needs REPLICA IDENTITY FULL to deliver the full row
-- in postgres_changes events (especially for UPDATE/DELETE, but also helps INSERT).
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;

-- ── 2. Ensure tables are in the realtime publication ─────────────────────────
-- These may already be added — the IF NOT EXISTS equivalent is to drop+re-add safely.
-- Supabase Dashboard: Database → Replication → supabase_realtime should list these.
DO $$
BEGIN
  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  -- conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  -- conversation_members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
  END IF;
END $$;

-- ── 3. Fix messages RLS — the subquery join pattern blocks Realtime delivery ──
-- Supabase Realtime evaluates RLS for each subscriber using their JWT.
-- A policy that joins another table (conversation_members) via a subquery
-- can silently return no rows for the realtime check, blocking delivery.
-- Fix: rewrite as a direct EXISTS with auth.uid() — simpler, faster, RT-safe.

DROP POLICY IF EXISTS "messages: member can read" ON public.messages;
CREATE POLICY "messages: member can read"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages: member can insert" ON public.messages;
CREATE POLICY "messages: member can insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 4. conversation_members RLS — ensure simple direct check ─────────────────
DROP POLICY IF EXISTS "conversation_members: members can read" ON public.conversation_members;
CREATE POLICY "conversation_members: members can read"
  ON public.conversation_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members me
      WHERE me.conversation_id = conversation_members.conversation_id
        AND me.user_id = auth.uid()
    )
  );

-- ── 5. conversations RLS — members can read their conversations ───────────────
DROP POLICY IF EXISTS "conversations: member can read" ON public.conversations;
CREATE POLICY "conversations: member can read"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
    )
  );
