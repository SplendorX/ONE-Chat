import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MessageCircle, Radio, User, ArrowRight, Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Conversation } from '../types';
import { supabase } from '../lib/supabase';

interface SearchResult {
  type: 'conversation' | 'channel' | 'user';
  id: string;
  title: string;
  subtitle: string;
  avatar?: string | null;
  initials: string;
  meta?: string;
}

interface GlobalSearchProps {
  session: Session;
  conversations: Conversation[];
  onSelectConversation: (conv: Conversation) => void;
  onSelectChannel: () => void;
  onClose: () => void;
}

export function GlobalSearch({ session, conversations, onSelectConversation, onSelectChannel, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      if (e.key === 'ArrowUp') setActiveIdx((i) => Math.max(i - 1, 0));
      if (e.key === 'Enter' && results[activeIdx]) handleSelect(results[activeIdx]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, activeIdx]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);

    const userId = session.user.id;
    const lq = q.toLowerCase();

    // 1. Conversations (local — already loaded)
    const convResults: SearchResult[] = conversations
      .filter((c) =>
        c.name.toLowerCase().includes(lq) ||
        (c.oneId ?? '').toLowerCase().includes(lq) ||
        (c.lastMessage ?? '').toLowerCase().includes(lq)
      )
      .slice(0, 5)
      .map((c) => ({
        type: 'conversation' as const,
        id: c.id,
        title: c.name,
        subtitle: c.lastMessage ?? 'No messages yet',
        initials: c.initials ?? c.name.slice(0, 2).toUpperCase(),
        meta: c.type === 'group' ? 'Group' : c.oneId ?? '',
      }));

    // 2. Users from Supabase (one_identities + profiles)
    const [identRes, profileRes] = await Promise.all([
      supabase.from('one_identities').select('handle, user_id').ilike('handle', `%${q}%`).neq('user_id', userId).limit(6),
      supabase.from('profiles').select('id, display_name, avatar_url').ilike('display_name', `%${q}%`).neq('id', userId).limit(6),
    ]);

    const userMap = new Map<string, SearchResult>();
    for (const row of identRes.data ?? []) {
      userMap.set(row.user_id as string, {
        type: 'user',
        id: row.user_id as string,
        title: row.handle as string,
        subtitle: `${row.handle as string}.one`,
        initials: (row.handle as string).slice(0, 2).toUpperCase(),
        meta: '.one',
      });
    }
    for (const row of profileRes.data ?? []) {
      if (!userMap.has(row.id as string)) {
        const name = (row.display_name as string) ?? 'User';
        userMap.set(row.id as string, {
          type: 'user',
          id: row.id as string,
          title: name,
          subtitle: '',
          avatar: row.avatar_url as string | null,
          initials: name.slice(0, 2).toUpperCase(),
        });
      } else {
        // Merge display name into existing identity result
        const existing = userMap.get(row.id as string)!;
        existing.title = (row.display_name as string) ?? existing.title;
        existing.avatar = row.avatar_url as string | null;
      }
    }
    const userResults = Array.from(userMap.values()).slice(0, 5);

    // 3. Channels from Supabase
    const { data: chanData } = await supabase
      .from('channels')
      .select('id, name, handle, avatar_url, category, subscriber_count')
      .or(`name.ilike.%${q}%,handle.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(5);

    const chanResults: SearchResult[] = (chanData ?? []).map((c) => ({
      type: 'channel' as const,
      id: c.id as string,
      title: c.name as string,
      subtitle: `@${c.handle as string} · ${c.category as string}`,
      avatar: c.avatar_url as string | null,
      initials: (c.name as string).slice(0, 2).toUpperCase(),
      meta: `${c.subscriber_count as number ?? 0} followers`,
    }));

    setResults([...convResults, ...userResults, ...chanResults]);
    setActiveIdx(0);
    setLoading(false);
  }, [session.user.id, conversations]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => { void doSearch(query); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  function handleSelect(r: SearchResult) {
    if (r.type === 'conversation') {
      const conv = conversations.find((c) => c.id === r.id);
      if (conv) { onSelectConversation(conv); onClose(); }
    } else if (r.type === 'channel') {
      onSelectChannel();
      onClose();
    } else if (r.type === 'user') {
      // Find existing DM or signal to open new conversation modal
      const existing = conversations.find((c) =>
        c.type === 'direct' && (c.oneId?.replace('.one', '') === r.title || c.name === r.title)
      );
      if (existing) { onSelectConversation(existing); onClose(); }
      else {
        // Pre-fill new conversation with this user's handle
        onSelectConversation({
          id: `search-dm-${r.id}`,
          name: r.title,
          oneId: r.subtitle.includes('.one') ? r.subtitle : undefined,
          initials: r.initials,
          type: 'direct',
          isOnline: false,
          unreadCount: 0,
          lastMessage: '',
          lastMessageTime: new Date(),
        });
        onClose();
      }
    }
  }

  const typeIcon = (type: SearchResult['type']) => {
    if (type === 'conversation') return <MessageCircle size={13} />;
    if (type === 'channel') return <Radio size={13} />;
    return <User size={13} />;
  };

  const typeLabel = (type: SearchResult['type']) => {
    if (type === 'conversation') return 'Chat';
    if (type === 'channel') return 'Channel';
    return 'User';
  };

  const typeColor = (type: SearchResult['type']) => {
    if (type === 'conversation') return '#C4A265';
    if (type === 'channel') return '#7c6cf0';
    return '#4ade80';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>

          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <Search size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats, channels, people..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)', fontSize: 15 }}
            />
            {loading && <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted)' }} />}
            <button onClick={onClose} className="flex-shrink-0 p-1 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {!query.trim() && (
              <div className="py-10 text-center">
                <Search size={28} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--ink)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Search across chats, channels, and people</p>
              </div>
            )}

            {query.trim() && !loading && results.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No results for "{query}"</p>
                <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Try a different name or handle</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="py-2">
                {/* Group by type */}
                {(['conversation', 'user', 'channel'] as const).map((type) => {
                  const group = results.filter((r) => r.type === type);
                  if (!group.length) return null;
                  return (
                    <div key={type}>
                      <div className="px-4 py-1.5 flex items-center gap-1.5"
                        style={{ color: typeColor(type), fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {typeIcon(type)} {typeLabel(type)}s
                      </div>
                      {group.map((r, gi) => {
                        const globalIdx = results.indexOf(r);
                        return (
                          <motion.button
                            key={r.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: gi * 0.03 }}
                            onClick={() => handleSelect(r)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                            style={{ background: globalIdx === activeIdx ? 'var(--surface-muted)' : 'transparent' }}
                            onMouseEnter={() => setActiveIdx(globalIdx)}>
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold overflow-hidden"
                              style={{ background: r.avatar ? undefined : 'var(--surface-strong)', color: 'var(--ink)' }}>
                              {r.avatar
                                ? <img src={r.avatar} alt="" className="w-full h-full object-cover" />
                                : r.initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</div>
                              {r.subtitle && (
                                <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{r.subtitle}</div>
                              )}
                            </div>
                            {r.meta && (
                              <div className="text-xs flex-shrink-0" style={{ color: 'var(--subtle)' }}>{r.meta}</div>
                            )}
                            <ArrowRight size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>↑↓ navigate</span>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>↵ select</span>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>Esc close</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
