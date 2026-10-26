import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import type { Conversation } from '../types';
import { formatTime } from '../lib/utils';

interface InboxViewProps {
  conversations: Conversation[];
  activeConvId?: string | null;
  onSelect: (conv: Conversation) => void;
}

export function InboxView({ conversations, activeConvId, onSelect }: InboxViewProps) {
  const [search, setSearch] = useState('');
  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.oneId || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-xl font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Chats
        </h1>
        <button className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{ background: 'var(--surface-muted)' }}>
          <Plus size={16} style={{ color: 'var(--ink)' }} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <Search size={15} style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>No conversations found</div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((conv) => (
              <ConvRow key={conv.id} conv={conv} isActive={activeConvId === conv.id} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConvRow({ conv, isActive, onSelect }: { conv: Conversation; isActive: boolean; onSelect: (c: Conversation) => void }) {
  return (
    <button
      onClick={() => onSelect(conv)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left"
      style={{ background: isActive ? 'var(--surface-muted, #EDE5D8)' : 'transparent' }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--surface-muted, #EDE5D8)', color: 'var(--ink)' }}>
          {conv.initials}
        </div>
        {conv.isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
            style={{ background: 'var(--success)', borderColor: 'var(--bg)' }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
            {conv.name}
            {conv.isPinned && <span className="ml-1.5 text-xs" style={{ color: 'var(--muted)' }}>📌</span>}
          </span>
          <span className="text-xs flex-shrink-0 ml-2 tabular-nums" style={{ color: 'var(--muted)' }}>
            {conv.lastMessageTime ? formatTime(conv.lastMessageTime) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{conv.lastMessage}</p>
          {conv.unreadCount && conv.unreadCount > 0 ? (
            <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--bg)', fontSize: '10px' }}>
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
