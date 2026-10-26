-- ============================================================
-- ONE CHAT — Supabase / Postgres Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension (already on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- PROFILES  (extends Supabase auth.users)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  is_pro        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles: owner read/write" ON public.profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: all authenticated can read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────
-- ONE IDENTITIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.one_identities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle      TEXT NOT NULL UNIQUE,  -- stored lowercase, without .one suffix
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.one_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "one_identities: owner write" ON public.one_identities
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "one_identities: all authenticated can read" ON public.one_identities
  FOR SELECT USING (auth.role() = 'authenticated');

-- Enforce lowercase + valid chars
ALTER TABLE public.one_identities
  ADD CONSTRAINT handle_format CHECK (handle ~ '^[a-z0-9]{3,24}$');

-- ─────────────────────────────────────────
-- CIRCLE WALLETS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  circle_wallet_id    TEXT NOT NULL UNIQUE,
  circle_wallet_set_id TEXT NOT NULL,
  address             TEXT NOT NULL,
  blockchain          TEXT NOT NULL DEFAULT 'ARC-TESTNET',
  status              TEXT NOT NULL DEFAULT 'LIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets: owner read" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE policy — only the backend service role can write

-- ─────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,           -- NULL for DMs (name is derived from the other user)
  is_group    BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url  TEXT,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member'
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

-- Members can read conversations they belong to
CREATE POLICY "conversations: member can read" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "conversations: member can read membership" ON public.conversation_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm2
      WHERE cm2.conversation_id = conversation_id AND cm2.user_id = auth.uid()
    )
  );
CREATE POLICY "conversations: can insert own membership" ON public.conversation_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────
CREATE TYPE public.message_type AS ENUM ('text', 'payment', 'payment_request', 'bill_split', 'savings_goal', 'gift', 'system');

CREATE TABLE IF NOT EXISTS public.messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id         UUID REFERENCES public.profiles(id),  -- NULL for system messages
  type              public.message_type NOT NULL DEFAULT 'text',
  content           TEXT,           -- plaintext for now (E2E encryption in Phase 7)
  metadata          JSONB,          -- payment cards, split details, etc.
  reply_to_id       UUID REFERENCES public.messages(id),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,    -- soft delete
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages: member can read" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "messages: member can insert" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "messages: owner can update" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- Index for fast conversation fetch
CREATE INDEX IF NOT EXISTS messages_conversation_created ON public.messages (conversation_id, created_at DESC);

-- ─────────────────────────────────────────
-- TRANSACTIONS  (Circle payment records)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_transaction_id TEXT UNIQUE,
  sender_id             UUID REFERENCES public.profiles(id),
  recipient_id          UUID REFERENCES public.profiles(id),
  amount                NUMERIC(18,6) NOT NULL,
  asset                 TEXT NOT NULL DEFAULT 'USDC',
  blockchain            TEXT NOT NULL DEFAULT 'ARC-TESTNET',
  state                 TEXT NOT NULL DEFAULT 'INITIATED',
  tx_hash               TEXT,
  message_id            UUID REFERENCES public.messages(id),
  conversation_id       UUID REFERENCES public.conversations(id),
  idempotency_key       TEXT UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions: participant can read" ON public.transactions
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
-- Only backend service role can insert/update transactions

-- ─────────────────────────────────────────
-- REALTIME: enable on tables we need live
-- ─────────────────────────────────────────
-- Run in Supabase Dashboard: Realtime → enable for:
--   public.messages
--   public.conversations
--   public.transactions
-- Or use the SQL below:
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ─────────────────────────────────────────
-- HELPER VIEWS
-- ─────────────────────────────────────────

-- Conversation list with last message + unread count
CREATE OR REPLACE VIEW public.conversation_list AS
SELECT
  c.id,
  c.name,
  c.is_group,
  c.updated_at,
  m.content      AS last_message,
  m.created_at   AS last_message_at,
  p.display_name AS last_sender_name,
  cm.last_read_at
FROM public.conversations c
JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = auth.uid()
LEFT JOIN LATERAL (
  SELECT msg.content, msg.created_at, msg.sender_id
  FROM public.messages msg
  WHERE msg.conversation_id = c.id AND msg.deleted_at IS NULL
  ORDER BY msg.created_at DESC LIMIT 1
) m ON TRUE
LEFT JOIN public.profiles p ON p.id = m.sender_id;
