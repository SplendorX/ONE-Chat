import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Users, Activity, Radio, UserCircle2, Sparkles } from 'lucide-react';
import type { AppTab, Theme, User } from '../types';
import { supabase } from '../lib/supabase';
import { InboxView } from './InboxView';
import { ContactsView } from './ContactsView';
import { ActivityView } from './ActivityView';
import { ChannelsView } from './ChannelsView';
import { ProfileView } from './ProfileView';
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
  const [tab, setTab] = useState<AppTab>('chats');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<User | null>(null);

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
    async function loadConversations() {
      const userId = session.user.id;
      // Get conversation IDs this user belongs to
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (!memberships?.length) return;

      const convIds = memberships.map((m) => m.conversation_id as string);
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, name, is_group, avatar_url, updated_at')
        .in('id', convIds)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (!convs) return;

      // For DM conversations, get the other participant's name
      const result: Conversation[] = [];
      for (const c of convs) {
        let name = c.name as string | null;
        let initials = '??';
        if (!c.is_group) {
          // Get the other member
          const { data: others } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', c.id)
            .neq('user_id', userId)
            .limit(1);
          const otherId = others?.[0]?.user_id as string | undefined;
          if (otherId) {
            const [otherProfile, otherIdentity] = await Promise.all([
              supabase.from('profiles').select('display_name').eq('id', otherId).maybeSingle(),
              supabase.from('one_identities').select('handle').eq('user_id', otherId).maybeSingle(),
            ]);
            name = otherProfile.data?.display_name as string | null ?? otherId;
            initials = (name ?? '??').slice(0, 2).toUpperCase();
            if (otherIdentity.data?.handle) {
              initials = (name ?? '??').slice(0, 2).toUpperCase();
            }
          }
        } else {
          initials = (name ?? 'GR').slice(0, 2).toUpperCase();
        }

        // Get last message
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, type, created_at')
          .eq('conversation_id', c.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        result.push({
          id: c.id as string,
          type: c.is_group ? 'group' : 'direct',
          name: name ?? 'Conversation',
          initials,
          lastMessage: lastMsg
            ? (lastMsg.type === 'payment' ? 'Sent USDC' : lastMsg.content as string ?? '')
            : '',
          lastMessageTime: new Date(c.updated_at as string),
        });
      }
      setConversations(result);
    }
    void loadConversations();
  }, [session]);

  // Subscribe to conversation list updates via Realtime
  useEffect(() => {
    const userId = session.user.id;
    const channel = supabase
      .channel(`user-convs-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
      }, () => {
        // Re-fetch conversation list when a new message arrives
        // (simplified: a production app would use a more targeted update)
        void (async () => {
          const { data: memberships } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', userId);
          if (!memberships?.length) return;
          const convIds = memberships.map((m) => m.conversation_id as string);
          const { data: convs } = await supabase
            .from('conversations')
            .select('id, updated_at')
            .in('id', convIds)
            .order('updated_at', { ascending: false });
          if (convs) {
            setConversations((prev) =>
              [...prev].sort((a, b) => {
                const ai = convs.findIndex((c) => c.id === a.id);
                const bi = convs.findIndex((c) => c.id === b.id);
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
              })
            );
          }
        })();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session]);

  if (!profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ink)' }} />
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
            <span className="display text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              ONE<span style={{ color: 'var(--muted)' }}> CHAT</span>
            </span>
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--ink)', color: 'white' }}
              title="New conversation">
              <span className="text-lg leading-none font-light">+</span>
            </button>
          </div>

          <nav className="py-3 px-3 space-y-0.5 flex-1">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => { setTab(id); setActiveConv(null); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: tab === id ? 'rgba(255,255,255,0.7)' : 'transparent', color: tab === id ? 'var(--ink)' : 'var(--muted)' }}>
                <Icon size={17} />
                {label}
              </button>
            ))}
            <button
              onClick={() => { setTab('chats'); setActiveConv(ALLIE_CONV); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ color: 'var(--muted)' }}>
              <Sparkles size={17} />
              ALLIE
            </button>
          </nav>

          <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.5)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--ink)', color: 'white' }}>
                {profile.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{profile.displayName}</div>
                <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{profile.oneId}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle pane */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {tab === 'chats' && <InboxView conversations={conversations} activeConvId={activeConv?.id} session={session} onSelect={setActiveConv} onConversationCreated={(conv) => { if (!conversations.find((c) => c.id === conv.id)) setConversations((p) => [conv, ...p]); setActiveConv(conv); }} />}
          {tab === 'contacts' && <ContactsView session={session} onStartChat={(conv) => { setTab('chats'); setActiveConv(conv); }} />}
          {tab === 'activity' && <ActivityView user={profile} session={session} />}
          {tab === 'channels' && <ChannelsView user={profile} session={session} />}
          {tab === 'you' && <ProfileView user={profile} session={session} theme={theme} onThemeToggle={onThemeToggle} onSignOut={onSignOut} />}
        </div>

        {/* Right pane */}
        <div className="flex-1 overflow-hidden">
          {activeConv ? (
            <ConversationView conversation={activeConv} user={profile} session={session} onBack={() => setActiveConv(null)} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
                <MessageCircle size={24} style={{ color: 'var(--muted)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Select a conversation to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex flex-col h-dvh">
        <div className="flex-1 overflow-hidden">
          {activeConv ? (
            <ConversationView conversation={activeConv} user={profile} session={session} onBack={() => setActiveConv(null)} />
          ) : (
            <>
              {tab === 'chats' && <InboxView conversations={conversations} activeConvId={undefined} session={session} onSelect={setActiveConv} onConversationCreated={(conv) => { if (!conversations.find((c) => c.id === conv.id)) setConversations((p) => [conv, ...p]); setActiveConv(conv); }} />}
              {tab === 'contacts' && <ContactsView session={session} onStartChat={(conv) => { setTab('chats'); setActiveConv(conv); }} />}
              {tab === 'activity' && <ActivityView user={profile} session={session} />}
              {tab === 'channels' && <ChannelsView user={profile} session={session} />}
              {tab === 'you' && <ProfileView user={profile} session={session} theme={theme} onThemeToggle={onThemeToggle} onSignOut={onSignOut} />}
            </>
          )}
        </div>

        {!activeConv && (
          <nav className="flex-shrink-0 flex items-center justify-around px-2 py-2 border-t"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderColor: 'var(--border)' }}>
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
