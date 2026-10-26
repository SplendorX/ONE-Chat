-- One Chat — Supabase Database Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- ── 0. Extensions ────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ── 1. Profiles ──────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  bio          text,
  is_pro       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- Trigger: auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. ONE Identities ─────────────────────────────────
create table if not exists public.one_identities (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null unique references public.profiles(id) on delete cascade,
  handle     text not null unique,
  claimed_at timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9]{3,24}$')
);

alter table public.one_identities enable row level security;

create policy "one_identities: anyone can read"
  on public.one_identities for select using (true);

create policy "one_identities: owner can insert"
  on public.one_identities for insert with check (auth.uid() = user_id);


-- ── 3. Wallets ────────────────────────────────────────
create table if not exists public.wallets (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null unique references public.profiles(id) on delete cascade,
  circle_wallet_id      text not null unique,
  circle_wallet_set_id  text not null,
  address               text not null,
  blockchain            text not null default 'ARC-TESTNET',
  status                text not null default 'LIVE',
  created_at            timestamptz not null default now()
);

alter table public.wallets enable row level security;

create policy "wallets: owner can read"
  on public.wallets for select using (auth.uid() = user_id);

-- Backend (service role) inserts wallets — no user INSERT policy needed.


-- ── 4. Conversations ──────────────────────────────────
-- Table only first; policies that reference conversation_members come after §5.
create table if not exists public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  name        text,
  is_group    boolean not null default false,
  avatar_url  text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "conversations: authenticated users can create"
  on public.conversations for insert with check (auth.uid() is not null);


-- ── 5. Conversation members ───────────────────────────
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;

create policy "conversation_members: members can read"
  on public.conversation_members for select using (auth.uid() = user_id);

create policy "conversation_members: members can insert"
  on public.conversation_members for insert with check (auth.uid() is not null);


-- ── 4b. Conversation policies (require conversation_members to exist) ─────────
create policy "conversations: members can read"
  on public.conversations for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );

create policy "conversations: members can update"
  on public.conversations for update using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );


-- ── 6. Messages ───────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  type            text not null default 'text'
                  check (type in ('text','payment','payment_request','gift','bill_split','savings_goal','system')),
  content         text,
  metadata        jsonb,
  reply_to_id     uuid references public.messages(id),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages: conversation members can read"
  on public.messages for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "messages: conversation members can insert"
  on public.messages for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "messages: sender can update own"
  on public.messages for update using (auth.uid() = sender_id);

create index if not exists messages_conversation_created
  on public.messages (conversation_id, created_at);


-- ── 7. Transactions ───────────────────────────────────
create table if not exists public.transactions (
  id                    uuid primary key default uuid_generate_v4(),
  circle_transaction_id text unique,
  sender_id             uuid references public.profiles(id),
  recipient_id          uuid references public.profiles(id),
  conversation_id       uuid references public.conversations(id),
  message_id            uuid references public.messages(id),
  amount                numeric(20, 6) not null,
  asset                 text not null default 'USDC',
  blockchain            text not null default 'ARC-TESTNET',
  state                 text not null default 'INITIATED',
  tx_hash               text,
  note                  text,
  idempotency_key       text unique,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions: participants can read"
  on public.transactions for select using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

-- Backend (service role) inserts and updates transactions — no user INSERT policy.

create index if not exists transactions_sender_created
  on public.transactions (sender_id, created_at desc);

create index if not exists transactions_recipient_created
  on public.transactions (recipient_id, created_at desc);


-- ── 8. Realtime ───────────────────────────────────────
-- Enable Realtime publications so the frontend can subscribe.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.transactions;
