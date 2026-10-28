import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Loader2, MessageCircle, AlertCircle, Users, Plus, Check } from 'lucide-react';
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

type ModalTab = 'dm' | 'group';

export function NewConversationModal({ session, initialQuery, onClose, onCreated }: NewConversationModalProps) {
  const [tab, setTab] = useState<ModalTab>('dm');
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group state
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Result[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
      } catch { setError('Search failed. Try again.'); }
      finally { setSearching(false); }
    })(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, session.user.id]);

  async function startDm(result: Result) {
    setCreating(result.userId);
    setError(null);
    try {
      const userId = session.user.id;
      const { data: myMemberships } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId);
      const myConvIds = (myMemberships ?? []).map((m) => m.conversation_id as string);
      let existingConvId: string | null = null;
      if (myConvIds.length > 0) {
        const { data: shared } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', result.userId).in('conversation_id', myConvIds);
        if (shared && shared.length > 0) {
          const sharedIds = shared.map((m) => m.conversation_id as string);
          const { data: convCheck } = await supabase.from('conversations').select('id').in('id', sharedIds).eq('is_group', false).limit(1).maybeSingle();
          if (convCheck) existingConvId = convCheck.id as string;
        }
      }
      if (existingConvId) { onCreated({ id: existingConvId, type: 'direct', name: result.displayName, oneId: result.handle, initials: result.initials, isOnline: false }); return; }
      const { data: conv, error: convErr } = await supabase.from('conversations').insert({ is_group: false }).select('id').single();
      if (convErr) throw convErr;
      const convId = conv.id as string;
      const { error: membersErr } = await supabase.from('conversation_members').insert([
        { conversation_id: convId, user_id: userId },
        { conversation_id: convId, user_id: result.userId },
      ]);
      if (membersErr) throw membersErr;
      onCreated({ id: convId, type: 'direct', name: result.displayName, oneId: result.handle, initials: result.initials, isOnline: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
      setCreating(null);
    }
  }

  async function createGroup() {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setCreatingGroup(true);
    setError(null);
    try {
      const userId = session.user.id;
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ is_group: true, name: groupName.trim() })
        .select('id')
        .single();
      if (convErr) throw convErr;
      const convId = conv.id as string;
      const members = [
        { conversation_id: convId, user_id: userId },
        ...selectedMembers.map((m) => ({ conversation_id: convId, user_id: m.userId })),
      ];
      const { error: membersErr } = await supabase.from('conversation_members').insert(members);
      if (membersErr) throw membersErr;
      onCreated({
        id: convId,
        type: 'group',
        name: groupName.trim(),
        initials: groupName.trim().slice(0, 2).toUpperCase(),
        isOnline: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
      setCreatingGroup(false);
    }
  }

  function toggleMember(r: Result) {
    setSelectedMembers((prev) =>
      prev.some((m) => m.userId === r.userId)
        ? prev.filter((m) => m.userId !== r.userId)
        : [...prev, r]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>New Conversation</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          {([['dm', 'Direct Message', MessageCircle], ['group', 'Group Chat', Users]] as const).map(([t, label, Icon]) => (
            <button key={t} onClick={() => { setTab(t); setQuery(''); setResults([]); setError(null); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: tab === t ? 'var(--ink)' : 'var(--surface-muted)', color: tab === t ? 'var(--bg)' : 'var(--muted)' }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              {searching
                ? <Loader2 size={15} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted)' }} />
                : <Search size={15} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />}
              <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by .one handle…"
                className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--ink)' }} />
            </div>
          </div>

          {/* Group name + selected members */}
          {tab === 'group' && (
            <div className="px-4 pb-3 space-y-2">
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMembers.map((m) => (
                    <div key={m.userId} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                      {m.displayName}
                      <button onClick={() => toggleMember(m)} className="ml-0.5 opacity-60 hover:opacity-100">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(201,75,69,0.08)', color: 'var(--danger)' }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {/* Results */}
          <div className="px-4 pb-4 min-h-[100px]">
            {query.length >= 2 && !searching && results.length === 0 && (
              <p className="text-center text-sm py-6" style={{ color: 'var(--muted)' }}>No users found for "{query.replace(/\.one$/, '')}.one"</p>
            )}
            {query.length < 2 && (
              <p className="text-center text-sm py-6" style={{ color: 'var(--muted)' }}>Type a handle to find someone</p>
            )}
            <div className="space-y-1 mt-1">
              {results.map((r) => {
                const isSelected = selectedMembers.some((m) => m.userId === r.userId);
                return (
                  <button
                    key={r.userId}
                    onClick={() => { if (tab === 'dm') { void startDm(r); } else { toggleMember(r); } }}
                    disabled={tab === 'dm' && creating === r.userId}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all disabled:opacity-60"
                    style={{ background: isSelected ? 'rgba(48,43,38,0.06)' : 'var(--surface-muted)', border: isSelected ? '1px solid var(--border-strong)' : '1px solid transparent' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                      style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                      {r.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.displayName}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{r.handle}</div>
                    </div>
                    {tab === 'dm'
                      ? (creating === r.userId
                        ? <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted)' }} />
                        : <MessageCircle size={16} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />)
                      : (isSelected
                        ? <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ink)' }}><Check size={12} color="white" /></div>
                        : <div className="w-6 h-6 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--border-strong)' }}><Plus size={10} style={{ color: 'var(--muted)', margin: '4px' }} /></div>)
                    }
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Create group CTA */}
        {tab === 'group' && (
          <div className="px-4 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { void createGroup(); }}
              disabled={!groupName.trim() || selectedMembers.length === 0 || creatingGroup}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              {creatingGroup
                ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                : <><Users size={14} /> Create group ({selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''})</>}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
