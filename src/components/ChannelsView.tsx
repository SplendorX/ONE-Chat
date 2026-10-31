import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Heart, Gift, Share2, MessageCircle, Plus, X, Verified,
  TrendingUp, Loader2, ChevronDown, ChevronUp, Send, Image as ImageIcon,
  BarChart2, Lock, Crown, Sparkles, Zap,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { supabase } from '../lib/supabase';
import { GiftSheet } from './GiftSheet';
import { formatTime } from '../lib/utils';

interface ChannelsViewProps { user: User; session: Session }

interface ChannelRow {
  channel_id: string; channel_handle: string; channel_name: string;
  channel_avatar: string | null; channel_verified: boolean; channel_category: string;
  is_following: boolean; follower_count: number;
  post_id: string; post_type: string; post_content: string;
  post_image_url: string | null; post_poll_options: PollOption[] | null;
  post_is_premium: boolean; post_like_count: number;
  post_gift_total: number; post_created_at: string; user_liked: boolean;
}

interface PollOption { text: string; votes: number }

interface ChannelGroup {
  id: string; handle: string; name: string; avatar: string | null;
  verified: boolean; category: string; isFollowing: boolean; followerCount: number;
  posts: PostItem[];
}

interface PostItem {
  id: string; type: string; content: string; imageUrl: string | null;
  pollOptions: PollOption[] | null; isPremium: boolean;
  likeCount: number; giftTotal: number; createdAt: string; userLiked: boolean;
}

interface CommentRow {
  id: string; content: string; created_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

const CATEGORIES = ['All', 'Finance', 'Lifestyle', 'Tech', 'News', 'Art', 'General'];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Finance: TrendingUp, Tech: Zap, Art: Sparkles,
  Lifestyle: Heart, News: Radio, General: Radio,
};

export function ChannelsView({ user, session }: ChannelsViewProps) {
  const [activeTab, setActiveTab] = useState<'following' | 'discover' | 'create'>('following');
  const [category, setCategory] = useState('All');
  const [channels, setChannels] = useState<ChannelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [giftTarget, setGiftTarget] = useState<{ postId: string; channelHandle: string; channelName: string; excerpt: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [myChannel, setMyChannel] = useState<{ id: string; handle: string } | null>(null);
  const userId = session.user.id;

  // Load feed
  async function loadFeed(mode: 'following' | 'discover') {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_channel_feed', {
      p_user_id: userId, p_mode: mode,
    });
    if (error || !data) {
      // Fallback: load channels + follows directly
      const [chRes, followRes] = await Promise.all([
        supabase.from('channels').select('id, handle, name, avatar_url, is_verified, category, subscriber_count').order('subscriber_count', { ascending: false }).limit(50),
        supabase.from('channel_follows').select('channel_id').eq('user_id', userId),
      ]);
      const followedIds = new Set((followRes.data ?? []).map((f) => f.channel_id as string));
      const allChannels: ChannelGroup[] = (chRes.data ?? []).map((c) => ({
        id: c.id as string, handle: c.handle as string, name: c.name as string,
        avatar: c.avatar_url as string | null, verified: (c.is_verified as boolean) ?? false,
        category: (c.category as string) ?? 'General', isFollowing: followedIds.has(c.id as string),
        followerCount: (c.subscriber_count as number) ?? 0, posts: [],
      }));
      const filtered = mode === 'following'
        ? allChannels.filter((c) => c.isFollowing)
        : allChannels.filter((c) => !c.isFollowing);
      setChannels(filtered);
      setLoading(false);
      return;
    }
    const rows = data as ChannelRow[];
    // Group posts by channel
    const map = new Map<string, ChannelGroup>();
    for (const r of rows) {
      if (!map.has(r.channel_id)) {
        map.set(r.channel_id, {
          id: r.channel_id, handle: r.channel_handle, name: r.channel_name,
          avatar: r.channel_avatar, verified: r.channel_verified,
          category: r.channel_category, isFollowing: r.is_following,
          followerCount: r.follower_count, posts: [],
        });
      }
      map.get(r.channel_id)!.posts.push({
        id: r.post_id, type: r.post_type, content: r.post_content,
        imageUrl: r.post_image_url, pollOptions: r.post_poll_options,
        isPremium: r.post_is_premium, likeCount: r.post_like_count,
        giftTotal: r.post_gift_total, createdAt: r.post_created_at,
        userLiked: r.user_liked,
      });
    }
    // Also fetch channels that have NO posts so they still appear
    const seenIds = new Set(map.keys());
    const [extraRes, followRes] = await Promise.all([
      supabase.from('channels').select('id, handle, name, avatar_url, is_verified, category, subscriber_count').order('created_at', { ascending: false }).limit(50),
      supabase.from('channel_follows').select('channel_id').eq('user_id', userId),
    ]);
    const followedIds = new Set((followRes.data ?? []).map((f) => f.channel_id as string));
    for (const c of extraRes.data ?? []) {
      if (!seenIds.has(c.id as string)) {
        const isFollowing = followedIds.has(c.id as string);
        // Only add to this mode's list if it belongs here
        if ((mode === 'following' && isFollowing) || (mode === 'discover' && !isFollowing)) {
          map.set(c.id as string, {
            id: c.id as string, handle: c.handle as string, name: c.name as string,
            avatar: c.avatar_url as string | null, verified: (c.is_verified as boolean) ?? false,
            category: (c.category as string) ?? 'General', isFollowing,
            followerCount: (c.subscriber_count as number) ?? 0, posts: [],
          });
        }
      }
    }
    let result = Array.from(map.values());
    if (category !== 'All') result = result.filter((c) => c.category.toLowerCase() === category.toLowerCase());
    setChannels(result);
    setLoading(false);
  }

  // Check if user is a creator
  useEffect(() => {
    async function checkCreator() {
      const { data } = await supabase.from('channels').select('id, handle').eq('creator_id', userId).maybeSingle();
      if (data) setMyChannel({ id: data.id as string, handle: data.handle as string });
    }
    void checkCreator();
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'following' || activeTab === 'discover') void loadFeed(activeTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, category]);

  async function toggleFollow(channelId: string, isFollowing: boolean) {
    if (isFollowing) {
      await supabase.from('channel_follows').delete()
        .eq('user_id', userId).eq('channel_id', channelId);
    } else {
      await supabase.from('channel_follows').insert({ user_id: userId, channel_id: channelId });
    }
    setChannels((prev) => prev.map((c) =>
      c.id === channelId ? {
        ...c, isFollowing: !isFollowing,
        followerCount: c.followerCount + (isFollowing ? -1 : 1),
      } : c
    ));
  }

  async function toggleLike(postId: string, channelId: string, liked: boolean) {
    if (liked) {
      await supabase.from('channel_post_likes').delete().eq('user_id', userId).eq('post_id', postId);
    } else {
      await supabase.from('channel_post_likes').insert({ user_id: userId, post_id: postId });
    }
    setChannels((prev) => prev.map((c) => c.id === channelId ? {
      ...c, posts: c.posts.map((p) => p.id === postId
        ? { ...p, userLiked: !liked, likeCount: p.likeCount + (liked ? -1 : 1) }
        : p),
    } : c));
  }

  function handleGiftSent(postId: string, channelId: string, amount: number) {
    setChannels((prev) => prev.map((c) => c.id === channelId ? {
      ...c, posts: c.posts.map((p) => p.id === postId
        ? { ...p, giftTotal: p.giftTotal + amount } : p),
    } : c));
    setGiftTarget(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio size={18} style={{ color: 'var(--ink)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Channels</h1>
          </div>
          {!myChannel && (
            <button onClick={() => setActiveTab('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{ background: '#C4A265', color: '#1a1714' }}>
              <Plus size={12} /> Create
            </button>
          )}
          {myChannel && (
            <button onClick={() => setActiveTab('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
              <Crown size={12} /> My Channel
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: 'var(--surface-muted)' }}>
          {(['following', 'discover'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
              style={{
                background: activeTab === t ? 'var(--bg)' : 'transparent',
                color: activeTab === t ? 'var(--ink)' : 'var(--muted)',
                boxShadow: activeTab === t ? '0 1px 3px rgba(48,43,38,0.1)' : 'none',
              }}>{t}</button>
          ))}
        </div>

        {/* Category pills */}
        {activeTab !== 'create' && (
          <div className="flex gap-2 pb-3 overflow-x-auto hide-scrollbar">
            {CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
                  style={{
                    background: category === cat ? 'var(--ink)' : 'var(--surface-muted)',
                    color: category === cat ? 'var(--bg)' : 'var(--muted)',
                    border: `1px solid ${category === cat ? 'transparent' : 'var(--border)'}`,
                  }}>
                  {Icon && <Icon size={10} />} {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'create' ? (
            <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <CreateOrManageChannel
                userId={userId} session={session} user={user}
                myChannel={myChannel} onCreated={(ch) => { setMyChannel(ch); setActiveTab('discover'); }} />
            </motion.div>
          ) : loading ? (
            <motion.div key="loading" className="flex items-center justify-center py-20"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted)' }} />
            </motion.div>
          ) : channels.length === 0 ? (
            <motion.div key="empty" className="text-center py-16 px-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Radio size={40} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
              <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                {activeTab === 'following' ? 'No channels followed yet' : 'No channels to discover'}
              </p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {activeTab === 'following'
                  ? 'Switch to Discover to find channels to follow'
                  : 'Be the first — create a channel above'}
              </p>
            </motion.div>
          ) : (
            <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {channels.map((channel) => (
                <ChannelSection key={channel.id} channel={channel}
                  userId={userId}
                  onToggleFollow={() => { void toggleFollow(channel.id, channel.isFollowing); }}
                  onToggleLike={(postId, liked) => { void toggleLike(postId, channel.id, liked); }}
                  onGift={(postId, excerpt) => setGiftTarget({
                    postId, channelHandle: channel.handle,
                    channelName: channel.name, excerpt,
                  })}
                  expandedComments={expandedComments}
                  onToggleComments={(id) => setExpandedComments((prev) => prev === id ? null : id)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {giftTarget && (
        <GiftSheet
          creatorOneId={`${giftTarget.channelHandle}.one`}
          creatorName={giftTarget.channelName}
          postExcerpt={giftTarget.excerpt}
          session={session}
          onConfirm={(amount) => handleGiftSent(giftTarget.postId,
            channels.find((c) => c.handle === giftTarget.channelHandle)?.id ?? '', amount)}
          onClose={() => setGiftTarget(null)}
        />
      )}
    </div>
  );
}

// ── Channel section ──────────────────────────────────────────────────────────
function ChannelSection({ channel, userId, onToggleFollow, onToggleLike, onGift, expandedComments, onToggleComments }: {
  channel: ChannelGroup; userId: string;
  onToggleFollow: () => void;
  onToggleLike: (postId: string, liked: boolean) => void;
  onGift: (postId: string, excerpt: string) => void;
  expandedComments: string | null;
  onToggleComments: (postId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b" style={{ borderColor: 'var(--border)' }}>
      {/* Channel header */}
      <div className="px-4 py-4 flex items-center gap-3">
        {channel.avatar
          ? <img src={channel.avatar} alt={channel.name} className="w-11 h-11 rounded-2xl object-cover flex-shrink-0" />
          : <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#C4A265,#8B6F3E)', color: '#fff' }}>
              {channel.name[0]}
            </div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{channel.name}</span>
            {channel.verified && <Verified size={13} style={{ color: '#C4A265' }} />}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            @{channel.handle} · {channel.followerCount.toLocaleString()} followers
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggleFollow}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0"
            style={{
              background: channel.isFollowing ? 'var(--surface-muted)' : 'var(--ink)',
              color: channel.isFollowing ? 'var(--muted)' : 'var(--bg)',
              border: channel.isFollowing ? '1px solid var(--border)' : 'none',
            }}>
            {channel.isFollowing ? 'Following' : 'Follow'}
          </button>
          <button onClick={() => setCollapsed((v) => !v)} style={{ color: 'var(--muted)' }}>
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Posts */}
      <AnimatePresence>
        {!collapsed && channel.posts.map((post) => (
          <motion.div key={post.id}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <PostCard
              post={post} userId={userId}
              onLike={() => onToggleLike(post.id, post.userLiked)}
              onGift={() => onGift(post.id, post.content.slice(0, 100))}
              expandComments={expandedComments === post.id}
              onToggleComments={() => onToggleComments(post.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post, userId, onLike, onGift, expandComments, onToggleComments }: {
  post: PostItem; userId: string;
  onLike: () => void; onGift: () => void;
  expandComments: boolean; onToggleComments: () => void;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pollVotes, setPollVotes] = useState<PollOption[] | null>(post.pollOptions);
  const [userVoted, setUserVoted] = useState<number | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!expandComments) return;
    setCommentsLoading(true);
    void supabase.from('channel_post_comments')
      .select('id, content, created_at, profiles(display_name, avatar_url)')
      .eq('post_id', post.id).order('created_at', { ascending: true }).limit(20)
      .then(({ data }) => {
        setComments((data as unknown as CommentRow[]) ?? []);
        setCommentsLoading(false);
      });
  }, [expandComments, post.id]);

  async function submitComment() {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    await supabase.from('channel_post_comments').insert({ post_id: post.id, user_id: userId, content: newComment.trim() });
    await supabase.from('channel_posts').update({ comment_count: post.likeCount + 1 }).eq('id', post.id);
    const { data } = await supabase.from('channel_post_comments')
      .select('id, content, created_at, profiles(display_name, avatar_url)')
      .eq('post_id', post.id).order('created_at', { ascending: true }).limit(20);
    setComments((data as unknown as CommentRow[]) ?? []);
    setNewComment('');
    setSubmitting(false);
  }

  async function vote(optionIdx: number) {
    if (userVoted !== null || !pollVotes) return;
    setUserVoted(optionIdx);
    const updated = pollVotes.map((o, i) => i === optionIdx ? { ...o, votes: o.votes + 1 } : o);
    setPollVotes(updated);
    await supabase.from('channel_posts').update({ poll_options: updated }).eq('id', post.id);
  }

  function share() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  const totalVotes = pollVotes ? pollVotes.reduce((a, o) => a + o.votes, 0) : 0;

  return (
    <div className="px-4 pb-4">
      {/* Premium lock */}
      {post.isPremium && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: '#C4A265' }}>
          <Lock size={11} /> Subscriber exclusive
        </div>
      )}

      {/* Content */}
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink)' }}>
        {post.content}
      </p>

      {/* Image */}
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-full rounded-2xl mb-3 object-cover max-h-64" />
      )}

      {/* Poll */}
      {pollVotes && (
        <div className="mb-3 rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {pollVotes.map((opt, i) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const isWinner = userVoted !== null && opt.votes === Math.max(...pollVotes.map((o) => o.votes));
            return (
              <button key={i} onClick={() => { void vote(i); }}
                disabled={userVoted !== null}
                className="w-full relative flex items-center justify-between px-4 py-2.5 text-sm transition-all border-b last:border-0"
                style={{ borderColor: 'var(--border)', textAlign: 'left' }}>
                <div className="absolute inset-0 left-0 transition-all rounded-none"
                  style={{ width: userVoted !== null ? `${pct}%` : '0%', background: isWinner ? 'rgba(196,162,101,0.15)' : 'var(--surface-muted)', transition: 'width 0.5s ease' }} />
                <span className="relative font-medium" style={{ color: 'var(--ink)' }}>{opt.text}</span>
                {userVoted !== null && <span className="relative text-xs" style={{ color: 'var(--muted)' }}>{pct}%</span>}
              </button>
            );
          })}
          <div className="px-4 py-1.5 text-xs" style={{ color: 'var(--muted)', background: 'var(--surface-muted)' }}>
            {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onLike}
            className="flex items-center gap-1 text-xs transition-all"
            style={{ color: post.userLiked ? 'var(--danger)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <motion.div whileTap={{ scale: 1.4 }} transition={{ duration: 0.15 }}>
              <Heart size={15} fill={post.userLiked ? 'currentColor' : 'none'} />
            </motion.div>
            <span>{post.likeCount}</span>
          </button>
          <button onClick={onToggleComments}
            className="flex items-center gap-1 text-xs transition-all"
            style={{ color: expandComments ? 'var(--ink)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <MessageCircle size={15} fill={expandComments ? 'currentColor' : 'none'} />
          </button>
          <button onClick={share}
            className="flex items-center gap-1 text-xs"
            style={{ color: shared ? 'var(--success)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Share2 size={15} />
            {shared && <span className="text-xs" style={{ color: 'var(--success)' }}>Copied!</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {post.giftTotal > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(196,162,101,0.12)', color: '#C4A265' }}>
              ${Number(post.giftTotal).toFixed(2)} gifted
            </span>
          )}
          <button onClick={onGift}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{ background: '#C4A265', color: '#1a1714', border: 'none', cursor: 'pointer' }}>
            <Gift size={11} /> Gift
          </button>
        </div>
      </div>

      <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>{formatTime(new Date(post.createdAt))} ago</p>

      {/* Comments */}
      <AnimatePresence>
        {expandComments && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {commentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>No comments yet</p>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {comments.map((c) => (
                    <div key={c.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                          {c.profiles?.display_name ?? 'User'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--subtle)' }}>{formatTime(new Date(c.created_at))} ago</span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--ink)' }}>{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Comment input */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <input
                  value={newComment} onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitComment(); } }}
                  placeholder="Add a comment…"
                  className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--ink)' }} />
                <button onClick={() => { void submitComment(); }} disabled={!newComment.trim() || submitting}
                  style={{ color: newComment.trim() ? '#C4A265' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Create / Manage Channel ───────────────────────────────────────────────────
function CreateOrManageChannel({ userId, session, user, myChannel, onCreated }: {
  userId: string; session: Session; user: User;
  myChannel: { id: string; handle: string } | null;
  onCreated: (ch: { id: string; handle: string }) => void;
}) {
  const [step, setStep] = useState<'info' | 'post'>(myChannel ? 'post' : 'info');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [myPosts, setMyPosts] = useState<PostItem[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Post creation
  const [postType, setPostType] = useState<'text' | 'poll'>('text');
  const [postContent, setPostContent] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [isPremium, setIsPremium] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const channelId = myChannel?.id;

  useEffect(() => {
    if (!channelId) return;
    setLoadingPosts(true);
    void supabase.from('channel_posts').select('*').eq('channel_id', channelId)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        setMyPosts((data ?? []).map((p) => ({
          id: p.id as string, type: p.type as string, content: p.content as string,
          imageUrl: p.image_url as string | null, pollOptions: p.poll_options as PollOption[] | null,
          isPremium: p.is_premium as boolean, likeCount: p.like_count as number,
          giftTotal: p.gift_total as number, createdAt: p.created_at as string, userLiked: false,
        })));
        setLoadingPosts(false);
      });
  }, [channelId]);

  async function createChannel() {
    if (!name.trim() || !handle.trim()) { setError('Name and handle required'); return; }
    setCreating(true); setError('');
    const { data, error: err } = await supabase.from('channels').insert({
      creator_id: userId, name: name.trim(),
      handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
      description: description.trim(), category,
    }).select('id, handle').single();
    if (err) { setError(err.message); setCreating(false); return; }
    onCreated({ id: data.id as string, handle: data.handle as string });
    setStep('post');
    setCreating(false);
  }

  async function publishPost() {
    if (!postContent.trim() || !channelId || posting) return;
    setPosting(true);
    let imageUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/channel-${Date.now()}.${ext}`;
      await supabase.storage.from('avatars').upload(path, imageFile, { upsert: true, contentType: imageFile.type });
      const { data: urlD } = supabase.storage.from('avatars').getPublicUrl(path);
      imageUrl = urlD.publicUrl;
    }
    const pollData = postType === 'poll'
      ? pollOptions.filter((o) => o.trim()).map((text) => ({ text, votes: 0 }))
      : null;
    const { data } = await supabase.from('channel_posts').insert({
      channel_id: channelId, creator_id: userId,
      type: postType === 'poll' ? 'poll' : (imageUrl ? 'image' : 'text'),
      content: postContent.trim(), image_url: imageUrl,
      poll_options: pollData, is_premium: isPremium,
    }).select('*').single();
    if (data) {
      setMyPosts((prev) => [{
        id: data.id as string, type: data.type as string, content: data.content as string,
        imageUrl: data.image_url as string | null, pollOptions: data.poll_options as PollOption[] | null,
        isPremium: data.is_premium as boolean, likeCount: 0, giftTotal: 0,
        createdAt: data.created_at as string, userLiked: false,
      }, ...prev]);
    }
    setPostContent(''); setImageFile(null); setImagePreview(null);
    setPollOptions(['', '']); setIsPremium(false); setPosting(false);
  }

  async function deletePost(postId: string) {
    await supabase.from('channel_posts').delete().eq('id', postId);
    setMyPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  if (step === 'info' && !myChannel) {
    return (
      <div className="px-5 py-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Create your channel</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Share content, earn tips and build your audience.</p>
        </div>
        {error && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Channel name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alpha Trader"
              className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none border"
              style={{ background: 'var(--surface-input)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Handle</label>
            <div className="flex items-center border rounded-2xl px-4 py-2.5" style={{ background: 'var(--surface-input)', borderColor: 'var(--border)' }}>
              <span className="text-sm mr-1" style={{ color: 'var(--muted)' }}>@</span>
              <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="alphatrader" className="flex-1 text-sm outline-none bg-transparent" style={{ color: 'var(--ink)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Bio</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you post about?"
              rows={2}
              className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none border resize-none"
              style={{ background: 'var(--surface-input)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted)' }}>Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: category === cat ? 'var(--ink)' : 'var(--surface-muted)',
                    color: category === cat ? 'var(--bg)' : 'var(--muted)',
                  }}>{cat}</button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => { void createChannel(); }} disabled={creating || !name.trim() || !handle.trim()}
          className="w-full py-3 rounded-2xl font-semibold text-sm transition-all"
          style={{ background: name && handle ? '#C4A265' : 'var(--surface-muted)', color: name && handle ? '#1a1714' : 'var(--muted)' }}>
          {creating ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Creating…</span> : 'Create Channel'}
        </button>
      </div>
    );
  }

  // Creator dashboard
  return (
    <div className="px-4 py-4 space-y-4">
      <div className="rounded-2xl p-4 border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={14} style={{ color: '#C4A265' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>@{myChannel?.handle ?? handle}</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{user.displayName}'s channel · {myPosts.length} posts</p>
      </div>

      {/* New post composer */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-1 p-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          {(['text', 'poll'] as const).map((t) => (
            <button key={t} onClick={() => setPostType(t)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
              style={{ background: postType === t ? 'var(--bg)' : 'transparent', color: postType === t ? 'var(--ink)' : 'var(--muted)' }}>
              {t === 'poll' ? <BarChart2 size={11} /> : null} {t}
            </button>
          ))}
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ml-auto"
            style={{ color: imageFile ? '#C4A265' : 'var(--muted)' }}>
            <ImageIcon size={11} /> Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setImageFile(f);
              setImagePreview(f ? URL.createObjectURL(f) : null);
            }} />
        </div>
        <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)}
          placeholder="What's on your mind?"
          rows={3}
          className="w-full px-4 py-3 text-sm outline-none resize-none bg-transparent"
          style={{ color: 'var(--ink)' }} />
        {imagePreview && (
          <div className="relative px-4 pb-3">
            <img src={imagePreview} className="w-full rounded-xl max-h-40 object-cover" alt="" />
            <button onClick={() => { setImageFile(null); setImagePreview(null); }}
              className="absolute top-2 right-6 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              <X size={12} />
            </button>
          </div>
        )}
        {postType === 'poll' && (
          <div className="px-4 pb-3 space-y-2">
            {pollOptions.map((opt, i) => (
              <input key={i} value={opt}
                onChange={(e) => setPollOptions((prev) => prev.map((o, j) => j === i ? e.target.value : o))}
                placeholder={`Option ${i + 1}`}
                className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                style={{ background: 'var(--surface-input)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            ))}
            {pollOptions.length < 4 && (
              <button onClick={() => setPollOptions((p) => [...p, ''])}
                className="text-xs" style={{ color: '#C4A265', background: 'none', border: 'none', cursor: 'pointer' }}>
                + Add option
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          <button onClick={() => setIsPremium((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium transition-all"
            style={{ color: isPremium ? '#C4A265' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Lock size={11} /> {isPremium ? 'Premium' : 'Public'}
          </button>
          <button onClick={() => { void publishPost(); }}
            disabled={posting || !postContent.trim()}
            className="ml-auto px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{ background: postContent.trim() ? '#C4A265' : 'var(--surface-strong)', color: postContent.trim() ? '#1a1714' : 'var(--muted)' }}>
            {posting ? <Loader2 size={12} className="animate-spin" /> : 'Publish'}
          </button>
        </div>
      </div>

      {/* My posts list */}
      {loadingPosts
        ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} /></div>
        : myPosts.map((p) => (
          <div key={p.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            <p className="text-sm mb-2" style={{ color: 'var(--ink)' }}>{p.content}</p>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="flex items-center gap-1"><Heart size={11} /> {p.likeCount}</span>
              <span className="flex items-center gap-1"><Gift size={11} /> ${Number(p.giftTotal).toFixed(2)}</span>
              {p.isPremium && <span className="flex items-center gap-1" style={{ color: '#C4A265' }}><Lock size={11} /> Premium</span>}
              <span className="ml-auto">{formatTime(new Date(p.createdAt))} ago</span>
              <button onClick={() => { void deletePost(p.id); }}
                className="text-xs px-2 py-0.5 rounded-full border transition-all"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'none', cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        ))
      }
    </div>
  );
}
