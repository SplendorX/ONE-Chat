import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from './ErrorBoundary';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Users, Activity, Radio, PiggyBank, UserCircle2 } from 'lucide-react';
import { AllieIcon } from './AllieIcon';
import { OneChatWordmark, OneChatLogo } from './Brand';
import type { AppTab, Theme, User } from '../types';
import { supabase } from '../lib/supabase';
import { InboxView } from './InboxView';
import { ContactsView } from './ContactsView';
import { ActivityView } from './ActivityView';
import { ChannelsView } from './ChannelsView';
import { ProfileView } from './ProfileView';
import { SavingsView } from './SavingsView';
import { ConversationView } from './ConversationView';
import type { Conversation } from '../types';

interface AppShellProps {
  session: Session;
  theme: Theme;
  onThemeToggle: () => void;
  onSignOut: () => void;
}

const TABS: { id: AppTab; label: string; Icon: React.ElementType }[] = [
  { id: 'chats', label: 'Chats', Icon: MessageCircle },
  { id: 'contacts', label: 'Contacts', Icon: Users },
  { id: 'activity', label: 'Activity', Icon: Activity },
  { id: 'channels', label: 'Channels', Icon: Radio },
  { id: 'savings', label: 'Savings', Icon: PiggyBank },
  { id: 'you', label: 'You', Icon: UserCircle2 },
];

const ALLIE_CONV: Conversation = {
  id: 'allie',
  type: 'direct',
  name: 'ALLIE',
  initials: 'AI',
  lastMessage: 'How can I help?',
  lastMessageTime: new Date(),
};

export function AppShell({ session, theme, onThemeToggle, onSignOut }: AppShellProps) {
  // localStorage keys scoped per user — survive hard refresh, defined as stable strings
  const uid = session.user.id;
  // These are stable for the lifetime of the component (uid never changes)
  const TAB_KEY = `one-tab-${uid}` as const;
  const CONV_KEY = `one-conv-${uid}` as const;

  const [tab, setTabRaw] = useState<AppTab>(() => {
    try { return (localStorage.getItem(TAB_KEY) as AppTab) ?? 'chats'; } catch { return 'chats'; }
  });
  const [activeConv, setActiveConvRaw] = useState<Conversation | null>(() => {
    try {
      const saved = localStorage.getItem(CONV_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as Conversation & { lastMessageTime?: string | Date };
      if (parsed.lastMessageTime && typeof parsed.lastMessageTime === 'string') {
        parsed.lastMessageTime = new Date(parsed.lastMessageTime);
      }
      return parsed;
    } catch { return null; }
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<User | null>(null);

  function setTab(t: AppTab) {
    setTabRaw(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  }

  function setActiveConv(conv: Conversation | null) {
    setActiveConvRaw(conv);
    try {
      if (conv) localStorage.setItem(CONV_KEY, JSON.stringify(conv));
      else localStorage.removeItem(CONV_KEY);
    } catch { /* ignore */ }
  }

  // Load real profile + ONE identity from Supabase
  useEffect(() => {
    async function loadProfile() {
      const userId = session.user.id;
      const [profileRes, identityRes] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url, is_pro').eq('id', userId).maybeSingle(),
        supabase.from('one_identities').select('handle').eq('user_id', userId).maybeSingle(),
      ]);
      const displayName: string = (profileRes.data?.display_name as string | null | undefined)
        ?? (session.user.user_metadata?.full_name as string | undefined)
        ?? session.user.email?.split('@')[0]
        ?? 'You';
      const handle = identityRes.data?.handle as string | null | undefined;
      const oneId = handle ? `${handle}.one` : '';
      const avatarUrl = profileRes.data?.avatar_url as string | null | undefined;
      const isPro = (profileRes.data?.is_pro as boolean | null | undefined) ?? false;
      setProfile({
        id: userId,
        displayName,
        oneId,
        initials: displayName.slice(0, 2).toUpperCase(),
        avatarUrl: avatarUrl ?? undefined,
        isOnline: true,
        isPro,
        walletBalance: 0,
      });
    }
    void loadProfile();
  }, [session]);

  // Load real conversations from Supabase
  useEffect(() => {
    let cancelled = false;

    async function applyResult(result: Conversation[]) {
      if (cancelled) return;
      // Only update if we got real data — never wipe conversations on an empty result
      if (result.length > 0) setConversations(result);
      setActiveConvRaw((prev) => {
        if (!prev || prev.id === 'allie') return prev;
        const fresh = result.find((c) => c.id === prev.id);
        if (!fresh) return prev; // keep localStorage value — conv exists, just not in list yet
        const merged = { ...prev, ...fresh };
        try { localStorage.setItem(CONV_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        return merged;
      });
    }

    async function loadViaFallback() {
      const userId = session.user.id;
      const { data: memberships } = await supabase
        .from('conversation_members').select('conversation_id').eq('user_id', userId);
      // If memberships empty — don't wipe; auth may not be ready yet
      if (cancelled || !memberships?.length) return;
      const convIds = memberships.map((m) => m.conversation_id as string);
      const { data: convs } = await supabase
        .from('conversations').select('id, name, is_group, updated_at').in('id', convIds)
        .order('updated_at', { ascending: false }).limit(50);
      if (cancelled || !convs?.length) return;
      const result: Conversation[] = convs.map((c) => ({
        id: c.id as string,
        type: c.is_group ? ('group' as const) : ('direct' as const),
        name: (c.name as string | null) ?? 'Conversation',
        initials: ((c.name as string | null) ?? 'CO').slice(0, 2).toUpperCase(),
        lastMessage: '',
        lastMessageTime: new Date(c.updated_at as string),
      }));
      await applyResult(result);
    }

    async function loadConversations() {
      const { data, error } = await supabase.rpc('get_my_conversations');
      if (cancelled) return;
      // Only fall back if RPC fails with an actual error (function not found etc)
      // If it returns empty array that's valid — new user with no convs
      if (error) {
        await loadViaFallback();
        return;
      }
      if (!data) return;

      type Row = {
        id: string; name: string | null; is_group: boolean;
        updated_at: string; other_name: string | null; other_handle: string | null;
        last_content: string | null; last_type: string | null; last_at: string | null;
      };
      const result: Conversation[] = (data as Row[]).map((c) => {
        const rawName = c.is_group ? c.name : c.other_name;
        const name = rawName ?? 'Conversation';
        return {
          id: c.id,
          type: c.is_group ? ('group' as const) : ('direct' as const),
          name,
          oneId: c.other_handle ? `${c.other_handle}.one` : undefined,
          initials: name.slice(0, 2).toUpperCase(),
          lastMessage: c.last_type === 'payment' ? 'Sent USDC' : (c.last_content ?? ''),
          lastMessageTime: new Date(c.last_at ?? c.updated_at),
        };
      });
      await applyResult(result);
    }

    // Run immediately, then retry once after 2s in case auth wasn't ready
    void loadConversations().then(() => {
      if (!cancelled) setTimeout(() => { void loadConversations(); }, 2000);
    });

    return () => { cancelled = true; };
  }, [session, CONV_KEY]);

  // Subscribe to conversation list updates via Realtime
  useEffect(() => {
    const userId = session.user.id;
    const channelName = `user-convs-${userId}`;
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) void supabase.removeChannel(stale);
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const m = payload.new as { conversation_id: string; content: string | null; type: string; created_at: string };
        // Update the matching conversation's lastMessage + bubble it to top, no full reload
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === m.conversation_id);
          if (idx === -1) return prev; // message for a conv not yet loaded — ignore
          const updated = {
            ...prev[idx],
            lastMessage: m.type === 'payment' ? 'Sent USDC' : (m.content ?? ''),
            lastMessageTime: new Date(m.created_at),
          };
          const next = [...prev];
          next.splice(idx, 1);
          next.unshift(updated);
          return next;
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session]);

  if (!profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <OneChatLogo size={56} />
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ink)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Desktop: 3-column layout */}
      <div className="hidden lg:flex h-dvh overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 xl:w-72 flex flex-col border-r flex-shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <OneChatWordmark height={22} />
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}
              title="New conversation">
              <span className="text-lg leading-none font-light">+</span>
            </button>
          </div>

          <nav className="py-3 px-3 space-y-0.5 flex-1">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => { setTab(id); setActiveConv(null); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: tab === id ? 'var(--surface-strong)' : 'transparent', color: tab === id ? 'var(--ink)' : 'var(--muted)' }}>
                <Icon size={17} />
                {label}
              </button>
            ))}
            <button
              onClick={() => { setTab('chats'); setActiveConv(ALLIE_CONV); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ color: 'var(--muted)' }}>
              <AllieIcon size={18} state="idle" />
              <span className="flex-1 text-left">ALLIE</span>
              {profile.isPro
                ? <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#C4A265', color: '#1a1612', fontSize: 9 }}>PRO</span>
                : <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-strong)', color: 'var(--muted)', fontSize: 9 }}>FREE</span>
              }
            </button>
          </nav>

          <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-strong)' }}>
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{profile.initials}</div>
              }
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{profile.displayName}</div>
                <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{profile.oneId}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle pane */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="flex flex-col overflow-hidden" style={{ height: '100%', minHeight: 0 }}
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}>
              {tab === 'chats' && <InboxView conversations={conversations} activeConvId={activeConv?.id} session={session} onSelect={setActiveConv} onConversationCreated={(conv) => { if (!conversations.find((c) => c.id === conv.id)) setConversations((p) => [conv, ...p]); setActiveConv(conv); }} />}
              {tab === 'contacts' && <ContactsView session={session} onStartChat={(conv) => { setTab('chats'); setActiveConv(conv); }} />}
              {tab === 'activity' && <ActivityView user={profile} session={session} />}
              {tab === 'channels' && <ChannelsView user={profile} session={session} />}
              {tab === 'savings' && <SavingsView user={profile} session={session} />}
              {tab === 'you' && <ProfileView user={profile} session={session} theme={theme} onThemeToggle={onThemeToggle} onSignOut={onSignOut} onAvatarUpdate={(url) => setProfile((p) => p ? { ...p, avatarUrl: url } : p)} onProUpgrade={() => setProfile((p) => p ? { ...p, isPro: true } : p)} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right pane */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeConv ? (
              <motion.div key={activeConv.id} className="h-full flex flex-col overflow-hidden"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}>
                <ErrorBoundary key={activeConv.id}>
                  <ConversationView conversation={activeConv} user={profile} session={session} onBack={() => setActiveConv(null)} />
                </ErrorBoundary>
              </motion.div>
            ) : (
              <motion.div key="empty" className="h-full flex flex-col items-center justify-center gap-3"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} style={{ background: 'var(--bg)' }}>
                <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
                  <MessageCircle size={24} style={{ color: 'var(--muted)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Select a conversation to begin</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex flex-col h-dvh">
        <div className="flex-1 overflow-hidden">
          {activeConv ? (
            <ErrorBoundary key={activeConv.id}>
              <ConversationView conversation={activeConv} user={profile} session={session} onBack={() => setActiveConv(null)} />
            </ErrorBoundary>
          ) : (
            <>
              {tab === 'chats' && <InboxView conversations={conversations} activeConvId={undefined} session={session} onSelect={setActiveConv} onConversationCreated={(conv) => { if (!conversations.find((c) => c.id === conv.id)) setConversations((p) => [conv, ...p]); setActiveConv(conv); }} />}
              {tab === 'contacts' && <ContactsView session={session} onStartChat={(conv) => { setTab('chats'); setActiveConv(conv); }} />}
              {tab === 'activity' && <ActivityView user={profile} session={session} />}
              {tab === 'channels' && <ChannelsView user={profile} session={session} />}
              {tab === 'savings' && <SavingsView user={profile} session={session} />}
              {tab === 'you' && <ProfileView user={profile} session={session} theme={theme} onThemeToggle={onThemeToggle} onSignOut={onSignOut} onAvatarUpdate={(url) => setProfile((p) => p ? { ...p, avatarUrl: url } : p)} onProUpgrade={() => setProfile((p) => p ? { ...p, isPro: true } : p)} />}
            </>
          )}
        </div>

        {!activeConv && (
          <nav className="flex-shrink-0 flex items-center justify-around px-2 py-2 border-t"
            style={{ background: 'var(--surface-card)', borderColor: 'var(--border)' }}>
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all min-w-0"
                style={{ color: tab === id ? 'var(--ink)' : 'var(--muted)' }}>
                <Icon size={22} strokeWidth={tab === id ? 2.2 : 1.8} />
                <span className="text-xs font-medium" style={{ fontSize: '10px' }}>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
