import { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, MessageCircle, Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Conversation } from '../types';
import { supabase } from '../lib/supabase';
import { NewConversationModal } from './NewConversationModal';

interface Contact {
  userId: string;
  displayName: string;
  handle: string;
  initials: string;
  avatarUrl?: string | null;
}

interface ContactsViewProps {
  session: Session;
  onStartChat: (conv: Conversation) => void;
}

export function ContactsView({ session, onStartChat }: ContactsViewProps) {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, load people you've already chatted with
  useEffect(() => {
    async function loadKnownContacts() {
      const userId = session.user.id;
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (!memberships?.length) return;

      const convIds = memberships.map((m) => m.conversation_id as string);
      const { data: others } = await supabase
        .from('conversation_members')
        .select('user_id')
        .neq('user_id', userId)
        .in('conversation_id', convIds);

      if (!others?.length) return;
      const otherIds = [...new Set(others.map((m) => m.user_id as string))];

      const { data: identities } = await supabase
        .from('one_identities')
        .select('user_id, handle, profiles(display_name, avatar_url)')
        .in('user_id', otherIds);

      setContacts((identities ?? []).map((row) => {
        const profile = row.profiles as { display_name?: string | null; avatar_url?: string | null } | null;
        const displayName = profile?.display_name ?? (row.handle as string);
        return {
          userId: row.user_id as string,
          displayName,
          handle: `${row.handle as string}.one`,
          initials: displayName.slice(0, 2).toUpperCase(),
          avatarUrl: profile?.avatar_url,
        };
      }));
    }
    void loadKnownContacts();
  }, [session.user.id]);

  // Search Supabase when query is long enough
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim().toLowerCase().replace(/\.one$/, '').replace(/[^a-z0-9]/g, '');
    if (q.length < 2) return;

    debounceRef.current = setTimeout(() => { void (async () => {
      setSearching(true);
      const { data } = await supabase
        .from('one_identities')
        .select('handle, user_id, profiles(display_name, avatar_url)')
        .ilike('handle', `${q}%`)
        .neq('user_id', session.user.id)
        .limit(20);

      setContacts((data ?? []).map((row) => {
        const profile = row.profiles as { display_name?: string | null; avatar_url?: string | null } | null;
        const displayName = profile?.display_name ?? (row.handle as string);
        return {
          userId: row.user_id as string,
          displayName,
          handle: `${row.handle as string}.one`,
          initials: displayName.slice(0, 2).toUpperCase(),
          avatarUrl: profile?.avatar_url,
        };
      }));
      setSearching(false);
    })(); }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, session.user.id]);

  const displayed = search.length >= 2
    ? contacts
    : contacts.filter((c) =>
        c.displayName.toLowerCase().includes(search.toLowerCase()) ||
        c.handle.toLowerCase().includes(search.toLowerCase())
      );

  const [newTarget, setNewTarget] = useState<string | null>(null);

  function handleStartChat(contact: Contact) {
    setNewTarget(contact.handle);
    setShowNew(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-xl font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Contacts</h1>
        <button
          onClick={() => setShowNew(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          title="Find someone">
          <UserPlus size={15} />
        </button>
      </div>

      <div className="px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {searching
            ? <Loader2 size={15} className="animate-spin" style={{ color: 'var(--muted)' }} />
            : <Search size={15} style={{ color: 'var(--muted)' }} />}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or .one identity..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {displayed.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {search.length >= 2 ? `No results for "${search}"` : 'No contacts yet'}
            </p>
            {search.length < 2 && (
              <button
                onClick={() => setShowNew(true)}
                className="text-xs px-4 py-2 rounded-full transition-all"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                Find someone by .one handle
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold pb-2 pt-1" style={{ color: 'var(--muted)' }}>
              ON ONE CHAT — {displayed.length}
            </p>
            <div className="space-y-1">
              {displayed.map((contact) => (
                <div key={contact.userId}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl"
                  style={{ border: '1px solid transparent' }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                    {contact.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{contact.displayName}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{contact.handle}</div>
                  </div>
                  <button
                    onClick={() => handleStartChat(contact)}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ background: 'var(--surface-muted)' }}
                    title="Start chat">
                    <MessageCircle size={15} style={{ color: 'var(--ink)' }} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showNew && (
        <NewConversationModal
          session={session}
          initialQuery={newTarget ?? undefined}
          onClose={() => { setShowNew(false); setNewTarget(null); }}
          onCreated={(conv) => { setShowNew(false); setNewTarget(null); onStartChat(conv); }}
        />
      )}
    </div>
  );
}
