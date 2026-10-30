-- ONE Chat — Channels schema
-- Run this in Supabase SQL Editor

-- Channels table
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete cascade not null,
  handle text unique not null,           -- e.g. "alphatrader"
  name text not null,
  description text,
  avatar_url text,
  banner_url text,
  category text default 'general',       -- finance, lifestyle, tech, news, art, general
  is_verified boolean default false,
  is_paid boolean default false,         -- paid subscriber channel
  subscriber_price numeric(10,2) default 0,  -- USDC/month if is_paid
  subscriber_count integer default 0,
  post_count integer default 0,
  total_gifted numeric(14,6) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Channel follows
create table if not exists public.channel_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  channel_id uuid references public.channels(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, channel_id)
);

-- Channel posts
create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  type text default 'text',              -- text, image, poll, milestone, tip_request
  content text not null,
  image_url text,
  poll_options jsonb,                    -- [{"text":"Yes","votes":12},{"text":"No","votes":4}]
  is_premium boolean default false,      -- only paid subscribers can see full post
  like_count integer default 0,
  comment_count integer default 0,
  gift_total numeric(14,6) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Post likes
create table if not exists public.channel_post_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.channel_posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

-- Post comments
create table if not exists public.channel_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.channel_posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- Channel subscriptions (paid)
create table if not exists public.channel_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  channel_id uuid references public.channels(id) on delete cascade not null,
  circle_tx_id text,
  amount numeric(10,2),
  expires_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, channel_id)
);

-- RLS
alter table public.channels enable row level security;
alter table public.channel_follows enable row level security;
alter table public.channel_posts enable row level security;
alter table public.channel_post_likes enable row level security;
alter table public.channel_post_comments enable row level security;
alter table public.channel_subscriptions enable row level security;

-- Channels: anyone can read, creator can insert/update
create policy "channels_read" on public.channels for select using (true);
create policy "channels_insert" on public.channels for insert with check (creator_id = auth.uid());
create policy "channels_update" on public.channels for update using (creator_id = auth.uid());

-- Follows: user manages own follows
create policy "follows_read" on public.channel_follows for select using (true);
create policy "follows_insert" on public.channel_follows for insert with check (user_id = auth.uid());
create policy "follows_delete" on public.channel_follows for delete using (user_id = auth.uid());

-- Posts: anyone reads, creator inserts/updates
create policy "posts_read" on public.channel_posts for select using (true);
create policy "posts_insert" on public.channel_posts for insert with check (creator_id = auth.uid());
create policy "posts_update" on public.channel_posts for update using (creator_id = auth.uid());
create policy "posts_delete" on public.channel_posts for delete using (creator_id = auth.uid());

-- Likes
create policy "likes_read" on public.channel_post_likes for select using (true);
create policy "likes_insert" on public.channel_post_likes for insert with check (user_id = auth.uid());
create policy "likes_delete" on public.channel_post_likes for delete using (user_id = auth.uid());

-- Comments
create policy "comments_read" on public.channel_post_comments for select using (true);
create policy "comments_insert" on public.channel_post_comments for insert with check (user_id = auth.uid());
create policy "comments_delete" on public.channel_post_comments for delete using (user_id = auth.uid());

-- Subscriptions
create policy "subs_read" on public.channel_subscriptions for select using (user_id = auth.uid() or channel_id in (select id from public.channels where creator_id = auth.uid()));
create policy "subs_insert" on public.channel_subscriptions for insert with check (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.channel_posts;
alter publication supabase_realtime add table public.channel_post_likes;
alter publication supabase_realtime add table public.channel_post_comments;
alter publication supabase_realtime add table public.channel_follows;

-- Indexes
create index if not exists channel_posts_channel_id_idx on public.channel_posts(channel_id, created_at desc);
create index if not exists channel_follows_user_id_idx on public.channel_follows(user_id);
create index if not exists channel_follows_channel_id_idx on public.channel_follows(channel_id);

-- Function: get channel feed for user (followed + discover)
create or replace function get_channel_feed(p_user_id uuid, p_mode text default 'following')
returns table (
  channel_id uuid, channel_handle text, channel_name text,
  channel_avatar text, channel_verified boolean, channel_category text,
  is_following boolean, follower_count bigint,
  post_id uuid, post_type text, post_content text, post_image_url text,
  post_poll_options jsonb, post_is_premium boolean,
  post_like_count bigint, post_gift_total numeric,
  post_created_at timestamptz, user_liked boolean
)
language plpgsql security definer as $$
begin
  return query
  select
    c.id, c.handle, c.name, c.avatar_url, c.is_verified, c.category,
    exists(select 1 from public.channel_follows cf where cf.channel_id = c.id and cf.user_id = p_user_id) as is_following,
    (select count(*) from public.channel_follows cf2 where cf2.channel_id = c.id)::bigint,
    p.id, p.type, p.content, p.image_url, p.poll_options, p.is_premium,
    p.like_count::bigint, p.gift_total,
    p.created_at,
    exists(select 1 from public.channel_post_likes lk where lk.post_id = p.id and lk.user_id = p_user_id) as user_liked
  from public.channel_posts p
  join public.channels c on c.id = p.channel_id
  where
    case when p_mode = 'following'
      then exists(select 1 from public.channel_follows cf where cf.channel_id = c.id and cf.user_id = p_user_id)
      else not exists(select 1 from public.channel_follows cf where cf.channel_id = c.id and cf.user_id = p_user_id)
    end
  order by p.created_at desc
  limit 50;
end;
$$;
