-- One Chat — Migration Addendum
-- Run this ONLY if you already ran supabase-migration.sql.
-- It adds the columns that were missing from the first run.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).
-- =====================================================

-- Add circle_wallet_set_id to wallets
alter table public.wallets
  add column if not exists circle_wallet_set_id text not null default '';

-- Add message_id + idempotency_key to transactions
alter table public.transactions
  add column if not exists message_id      uuid references public.messages(id),
  add column if not exists idempotency_key text unique;
