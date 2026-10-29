-- ONE Chat — Missing Columns Patch
-- Run in Supabase SQL Editor if you see 500 errors on messages or conversations queries.
-- Safe to run multiple times.

alter table public.messages
  add column if not exists deleted_at timestamptz default null;

alter table public.conversations
  add column if not exists deleted_at timestamptz default null;

-- Optional: index for filtering soft-deleted rows
create index if not exists messages_deleted_at_idx on public.messages(deleted_at) where deleted_at is null;
create index if not exists conversations_deleted_at_idx on public.conversations(deleted_at) where deleted_at is null;
