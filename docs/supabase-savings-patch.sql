-- Savings patch: add missing columns only (run if savings_goals table already exists)
alter table public.wallets add column if not exists wallet_type text default 'main';
alter table public.savings_goals add column if not exists savings_wallet_id text;
