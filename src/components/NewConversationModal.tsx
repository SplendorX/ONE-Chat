import { useState, useRef, useEffect } from 'react';
import { X, Search, Loader2, MessageCircle, AlertCircle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Conversation } from '../types';

interface Result {
  handle: string;
  userId: string;
  displayName: string;
  initials: string;
}

interface NewConversationModalProps {
  session: Session;
  initialQuery?: string;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}

export function NewConversationModal({ session, initialQuery, onClose, onCreated }: NewConversationModalProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim().toLowerCase().replace(/\.one$/, '').replace(/[^a-z0-9]/g, '');
    if (q.length < 2) {
      debounceRef.current = setTimeout(() => setResults([]), 0);
      return;
    }

    debounceRef.current = setTimeout(() => { void (async () => {
      setSearching(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('one_identities')
          .select('handle, user_id, profiles(display_name)')
          .ilike('handle', `${q}%`)
          .neq('user_id', session.user.id)
          .limit(10);

        if (err) throw err;
        setResults((data ?? []).map((row) => {
          const profile = (row.profiles as { display_name?: string | null } | null);
          const displayName = profile?.display_name ?? (row.handle as string);
          return {
            handle: `${row.handle as string}.one`,
            userId: row.user_id as string,
            displayName,
            initials: displayName.slice(0, 2).toUpperCase(),
          };
        }));
      } catch {
        setError('Search failed. Try again.');
      } finally {
        setSearching(false);
      }
    })(); }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, session.user.id]);

  async function startChat(result: Result) {
    setCreating(result.userId);
    setError(null);
    try {
      const userId = session.user.id;

      // Check if a DM already exists between these two users
      const { data: myMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      const myConvIds = (myMemberships ?? []).map((m) => m.conversation_id as string);

      let existingConvId: string | null = null;
      if (myConvIds.length > 0) {
        const { data: sharedMemberships } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', result.userId)
          .in('conversation_id', myConvIds);

        if (sharedMemberships && sharedMemberships.length > 0) {
          // Verify it's a DM (not a group)
          const sharedIds = sharedMemberships.map((m) => m.conversation_id as string);
          const { data: convCheck } = await supabase
            .from('conversations')
            .select('id')
            .in('id', sharedIds)
            .eq('is_group', false)
            .limit(1)
            .maybeSingle();
          if (convCheck) existingConvId = convCheck.id as string;
        }
      }

      if (existingConvId) {
        // Return existing conversation
        onCreated({
          id: existingConvId,
          type: 'direct',
          name: result.displayName,
          oneId: result.handle,
          initials: result.initials,
          isOnline: false,
        });
        return;
      }

      // Create new conversation
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ is_group: false })
        .select('id')
        .single();
      if (convErr) throw convErr;

      const convId = conv.id as string;

      // Add both members
      const { error: membersErr } = await supabase.from('conversation_members').insert([
        { conversation_id: convId, user_id: userId },
        { conversation_id: convId, user_id: result.userId },
      ]);
      if (membersErr) throw membersErr;

      onCreated({
        id: convId,
        type: 'direct',
        name: result.displayName,
        oneId: result.handle,
        initials: result.initials,
        isOnline: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
      setCreating(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>New Conversation</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            {searching
              ? <Loader2 size={15} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted)' }} />
              : <Search size={15} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by .one handle (e.g. satoshi)"
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(201,75,69,0.08)', color: 'var(--danger)' }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* Results */}
        <div className="px-4 pb-6 min-h-[120px]">
          {query.length >= 2 && !searching && results.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: 'var(--muted)' }}>
              No users found for "{query.replace(/\.one$/, '')}.one"
            </p>
          )}
          {query.length < 2 && (
            <p className="text-center text-sm py-8" style={{ color: 'var(--muted)' }}>
              Type a handle to find someone
            </p>
          )}
          <div className="space-y-1 mt-1">
            {results.map((r) => (
              <button
                key={r.userId}
                onClick={() => { void startChat(r); }}
                disabled={creating === r.userId}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all disabled:opacity-60"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: 'var(--ink)', color: 'white' }}>
                  {r.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.displayName}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{r.handle}</div>
                </div>
                {creating === r.userId
                  ? <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  : <MessageCircle size={16} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
