-- Savings goals table
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(18,6) not null default 0,
  current_amount numeric(18,6) not null default 0,
  deadline date,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;

create policy "Users manage own goals"
  on public.savings_goals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists savings_goals_user_id_idx on public.savings_goals(user_id);
