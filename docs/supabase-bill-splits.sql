-- Bill splits: group expense sharing
create table if not exists public.bill_splits (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  total_amount numeric(18,6) not null,
  per_person_amount numeric(18,6) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bill_split_contributions (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.bill_splits(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(18,6) not null,
  state text not null default 'PENDING', -- PENDING | PAID
  circle_tx_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(split_id, user_id)
);

alter table public.bill_splits enable row level security;
alter table public.bill_split_contributions enable row level security;

-- Members of the conversation can see the split
create policy "Conversation members see splits"
  on public.bill_splits for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = bill_splits.conversation_id
      and user_id = auth.uid()
    )
  );

create policy "Conversation members create splits"
  on public.bill_splits for insert
  with check (created_by = auth.uid());

-- Users can see and update their own contributions
create policy "Users see own contributions"
  on public.bill_split_contributions for select
  using (user_id = auth.uid() or exists (
    select 1 from public.bill_splits bs
    join public.conversation_members cm on cm.conversation_id = bs.conversation_id
    where bs.id = bill_split_contributions.split_id and cm.user_id = auth.uid()
  ));

create policy "Users manage own contributions"
  on public.bill_split_contributions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Add Realtime
alter publication supabase_realtime add table public.bill_split_contributions;
