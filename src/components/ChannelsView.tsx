import { useState } from 'react';
import { Radio, Heart, Gift, Share2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { User, Channel, ChannelPost } from '../types';
import { CHANNELS } from '../lib/mockData';
import { formatTime, formatUSDC } from '../lib/utils';
import { GiftSheet } from './GiftSheet';

interface ChannelsViewProps {
  user: User;
  session: Session;
}

export function ChannelsView({ user: _user, session }: ChannelsViewProps) {
  const [channels, setChannels] = useState<Channel[]>(CHANNELS);
  const [giftTarget, setGiftTarget] = useState<{ post: ChannelPost; channel: Channel } | null>(null);
  const [activeTab, setActiveTab] = useState<'following' | 'discover'>('following');

  const displayed = activeTab === 'following'
    ? channels.filter((c) => c.isFollowing)
    : channels.filter((c) => !c.isFollowing);

  function toggleFollow(channelId: string) {
    setChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, isFollowing: !c.isFollowing } : c));
  }

  function handleGiftSent(amount: number, message: string, channelId: string, postId: string) {
    setChannels((prev) => prev.map((ch) =>
      ch.id === channelId
        ? { ...ch, posts: ch.posts.map((p) => p.id === postId ? { ...p, giftTotal: p.giftTotal + amount } : p) }
        : ch
    ));
    setGiftTarget(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={18} style={{ color: 'var(--ink)' }} />
          <h1 className="display text-xl font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Channels</h1>
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
          {(['following', 'discover'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
              style={{
                background: activeTab === t ? 'var(--bg)' : 'transparent',
                color: activeTab === t ? 'var(--ink)' : 'var(--muted)',
                boxShadow: activeTab === t ? '0 1px 3px rgba(48,43,38,0.08)' : 'none',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {displayed.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Radio size={32} style={{ color: 'var(--muted)', margin: '0 auto' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {activeTab === 'following' ? 'Follow channels to see posts here' : 'No channels to discover'}
            </p>
          </div>
        ) : (
          displayed.map((channel) => (
            <ChannelCard key={channel.id} channel={channel}
              onToggleFollow={() => toggleFollow(channel.id)}
              onGift={(post) => setGiftTarget({ post, channel })} />
          ))
        )}
      </div>

      {giftTarget && (
        <GiftSheet
          creatorOneId={giftTarget.channel.creatorOneId}
          creatorName={giftTarget.channel.name}
          postExcerpt={giftTarget.post.content.slice(0, 80) + '...'}
          session={session}
          onConfirm={(amount, message) => handleGiftSent(amount, message, giftTarget.channel.id, giftTarget.post.id)}
          onClose={() => setGiftTarget(null)}
        />
      )}
    </div>
  );
}

function ChannelCard({ channel, onToggleFollow, onGift }: {
  channel: Channel;
  onToggleFollow: () => void;
  onGift: (post: ChannelPost) => void;
}) {
  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      {/* Channel header */}
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)' }}>
          {channel.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{channel.name}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            Created by {channel.creatorOneId} · {(channel.followerCount / 1000).toFixed(1)}k followers
          </div>
        </div>
        <button onClick={onToggleFollow}
          className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all"
          style={{
            background: channel.isFollowing ? 'var(--surface-muted)' : 'var(--ink)',
            color: channel.isFollowing ? 'var(--muted)' : 'var(--bg)',
            border: channel.isFollowing ? '1px solid var(--border)' : 'none',
          }}>
          {channel.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      {/* Posts */}
      {channel.posts.map((post) => (
        <PostCard key={post.id} post={post} onGift={() => onGift(post)} />
      ))}
    </div>
  );
}

function PostCard({ post, onGift }: { post: ChannelPost; onGift: () => void }) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="px-5 pb-4">
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink)' }}>{post.content}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLiked((v) => !v)}
            className="flex items-center gap-1 text-xs transition-all"
            style={{ color: liked ? 'var(--danger)' : 'var(--muted)' }}>
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            <span>{Object.values(post.reactions).reduce((a, b) => a + b, 0) + (liked ? 1 : 0)}</span>
          </button>
          <button className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            <Share2 size={14} />
            <span>Share</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {post.giftTotal > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              ${formatUSDC(post.giftTotal)} gifted
            </span>
          )}
          <button
            onClick={onGift}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)', border: '1px solid var(--sand, #DCCFBD)' }}>
            <Gift size={12} />
            Gift USDC
          </button>
        </div>
      </div>

      <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>{formatTime(post.publishedAt)} ago</p>
    </div>
  );
}
