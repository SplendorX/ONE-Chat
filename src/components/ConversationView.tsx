import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Phone, MoreHorizontal, Send, Paperclip, DollarSign, Check, CheckCheck, Loader2, BellOff, Trash2, Share } from 'lucide-react';
import { AllieIcon } from './AllieIcon';
import type { Conversation, Message, User } from '../types';
import { supabase } from '../lib/supabase';
import { formatDate, formatTimestamp } from '../lib/utils';
import { chatAllie } from '../lib/api';
import { PaymentSheet } from './PaymentSheet';
import { ProUpgradeModal } from './ProUpgradeModal';

interface ConversationViewProps {
  conversation: Conversation;
  user: User;
  session: Session;
  onBack: () => void;
}

function groupByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const d = formatDate(msg.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.messages.push(msg);
    else groups.push({ date: d, messages: [msg] });
  }
  return groups;
}



export function ConversationView({ conversation, user, session, onBack }: ConversationViewProps) {
  const isAllie = conversation.id === 'allie';
  const ALLIE_WELCOME_DATE = useRef(new Date()).current; // stable, current time
  const allieWelcome: Message[] = isAllie ? [{
    id: 'allie-welcome',
    conversationId: 'allie',
    senderId: 'allie',
    senderName: 'ALLIE',
    type: 'text' as const,
    content: `Hi ${user.displayName.split(' ')[0]}! I'm ALLIE — I can help you send USDC, check your balance, split bills, and more. What would you like to do?`,
    createdAt: ALLIE_WELCOME_DATE,
    isOwn: false,
    deliveryState: 'read' as const,
  }] : [];

  const [messages, setMessages] = useState<Message[]>(allieWelcome);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(!isAllie);
  const [sending, setSending] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showProUpgrade, setShowProUpgrade] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [allieHistory, setAllieHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [muted, setMuted] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load message history (skipped for ALLIE — initial state already set)
  useEffect(() => {
    if (isAllie) return;

    async function loadMessages() {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from('messages')
        .select('id, sender_id, type, content, metadata, created_at, edited_at')
        .eq('conversation_id', conversation.id)

        .order('created_at', { ascending: true })
        .limit(100);
      if (fetchErr) console.error('[ConversationView] load error', fetchErr);

      if (data) {
        // eslint-disable-next-line no-console
        console.log('[ConversationView] loaded', data.length, 'messages for', conversation.id);
        setMessages(data.map((m) => ({
          id: m.id as string,
          conversationId: conversation.id,
          senderId: m.sender_id as string,
          senderName: '',
          type: (m.type as Message['type']) ?? 'text',
          content: m.content as string ?? '',
          metadata: m.metadata as Record<string, unknown> ?? undefined,
          createdAt: new Date(m.created_at as string),
          isOwn: m.sender_id === session.user.id,
          deliveryState: 'read',
          editedAt: m.edited_at ? new Date(m.edited_at as string) : undefined,
        })));
      }
      setLoading(false);
    }
    void loadMessages();
  }, [conversation.id, session.user.id, isAllie]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (isAllie) return;
    const channelName = `conv-${conversation.id}`;
    // Remove any stale channel with the same name before subscribing (handles StrictMode double-mount)
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) void supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => {
        const m = payload.new as {
          id: string; sender_id: string; type: string;
          content: string | null; metadata: Record<string, unknown> | null;
          created_at: string; edited_at: string | null;
        };
        setMessages((prev) => {
          if (prev.some((p) => p.id === m.id)) return prev;
          return [...prev, {
            id: m.id,
            conversationId: conversation.id,
            senderId: m.sender_id,
            senderName: '',
            type: (m.type as Message['type']) ?? 'text',
            content: m.content ?? '',
            metadata: m.metadata ?? undefined,
            createdAt: new Date(m.created_at),
            isOwn: m.sender_id === session.user.id,
            deliveryState: 'delivered' as const,
          }];
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversation.id, session.user.id, isAllie]);

  const sendMessage = useCallback(async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText('');
    setSending(true);

    // ALLIE: call real AI endpoint
    if (isAllie) {
      const ts = Date.now();
      const userMsg: Message = {
        id: `local-${ts}`,
        conversationId: 'allie',
        senderId: session.user.id,
        senderName: user.displayName,
        type: 'text',
        content,
        createdAt: new Date(ts),
        isOwn: true,
        deliveryState: 'sent',
      };
      setMessages((prev) => [...prev, userMsg]);
      setOtherTyping(true);
      const newHistory: { role: 'user' | 'assistant'; content: string }[] = [...allieHistory, { role: 'user', content }];
      try {
        const { reply, requiresPro } = await chatAllie(content, allieHistory, user.isPro);
        setAllieHistory([...newHistory, { role: 'assistant', content: reply }]);
        setOtherTyping(false);
        setMessages((prev) => [...prev, {
          id: `allie-${Date.now()}`,
          conversationId: 'allie',
          senderId: 'allie',
          senderName: 'ALLIE',
          type: 'text',
          content: reply,
          createdAt: new Date(Date.now()),
          isOwn: false,
          deliveryState: 'read',
          metadata: requiresPro ? { requiresPro: true } : undefined,
        }]);
      } catch {
        setOtherTyping(false);
        setMessages((prev) => [...prev, {
          id: `allie-err-${Date.now()}`,
          conversationId: 'allie',
          senderId: 'allie',
          senderName: 'ALLIE',
          type: 'text',
          content: "I'm having trouble connecting right now. Please try again in a moment.",
          createdAt: new Date(Date.now()),
          isOwn: false,
          deliveryState: 'read',
        }]);
      }
      setSending(false);
      return;
    }

    // @ALLIE tag: route to ALLIE in any conversation
    const allieTagMatch = content.match(/^@ALLIE\s+(.+)/i);
    if (allieTagMatch) {
      const allieQuery = allieTagMatch[1].trim();
      // Post the user's message first
      const userTagMsg: Message = {
        id: `local-${Date.now()}`,
        conversationId: conversation.id,
        senderId: session.user.id,
        senderName: user.displayName,
        type: 'text',
        content,
        createdAt: new Date(),
        isOwn: true,
        deliveryState: 'sent',
      };
      setMessages((prev) => [...prev, userTagMsg]);
      await supabase.from('messages').insert({ conversation_id: conversation.id, sender_id: session.user.id, type: 'text', content });
      setOtherTyping(true);
      try {
        const { reply } = await chatAllie(allieQuery, [], user.isPro);
        setOtherTyping(false);
        // Post ALLIE's reply as a special message in this conversation
        const allieReply: Message = {
          id: `allie-tag-${Date.now()}`,
          conversationId: conversation.id,
          senderId: 'allie',
          senderName: 'ALLIE',
          type: 'text',
          content: `@${user.displayName.split(' ')[0]} ${reply}`,
          createdAt: new Date(),
          isOwn: false,
          deliveryState: 'read',
        };
        setMessages((prev) => [...prev, allieReply]);
        // Also persist ALLIE's reply to the conversation
        await supabase.from('messages').insert({ conversation_id: conversation.id, sender_id: session.user.id, type: 'text', content: `🤖 ALLIE: ${reply}` });
      } catch {
        setOtherTyping(false);
      }
      setSending(false);
      return;
    }

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId: conversation.id,
      senderId: session.user.id,
      senderName: user.displayName,
      type: 'text',
      content,
      createdAt: new Date(),
      isOwn: true,
      deliveryState: 'sent',
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: session.user.id,
        type: 'text',
        content,
      }).select('id').single();

      if (error) throw error;

      // Replace temp with real ID
      setMessages((prev) => prev.map((m) =>
        m.id === tempId ? { ...m, id: data.id as string, deliveryState: 'delivered' } : m
      ));

      // Touch conversation updated_at
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
    } catch (err) {
      console.error('[ConversationView] send error', err);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, deliveryState: 'failed' as const } : m));
    } finally {
      setSending(false);
      if (typingTimeout) clearTimeout(typingTimeout);
    }
  }, [text, sending, conversation.id, session.user.id, user.displayName, user.isPro, isAllie, typingTimeout, allieHistory]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleTextChange(val: string) {
    setText(val);
    // Typing indicator (debounced)
    if (typingTimeout) clearTimeout(typingTimeout);
    const t = setTimeout(() => setTypingTimeout(null), 2000);
    setTypingTimeout(t);
  }

  const groups = groupByDate(messages);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--border)' }}>
        <button onClick={onBack} className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={18} />
        </button>

        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: isAllie ? 'transparent' : 'var(--ink)', color: 'var(--bg)', padding: 0 }}>
          {isAllie ? <AllieIcon size={36} state={otherTyping ? 'thinking' : 'idle'} /> : conversation.initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{conversation.name}</div>
          {isAllie
            ? <div className="text-xs flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                {user.isPro
                  ? <><span style={{ color: '#C4A265', fontWeight: 600 }}>PRO</span> · Full AI access</>
                  : <>Free commands · <button onClick={() => setShowProUpgrade(true)} className="underline bg-transparent border-0 p-0 cursor-pointer text-xs" style={{ color: '#C4A265' }}>Upgrade $5/mo</button></>
                }
              </div>
            : <div className="text-xs" style={{ color: 'var(--success)' }}>Online</div>
          }
        </div>

        <div className="flex items-center gap-1 relative">
          {!isAllie && (
            <button
              onClick={() => { window.location.href = `tel:`; }}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer transition-all"
              style={{ color: 'var(--muted)' }} title="Call">
              <Phone size={16} />
            </button>
          )}
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer transition-all"
            style={{ color: 'var(--muted)' }} title="More options">
            <MoreHorizontal size={16} />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-10 z-50 rounded-2xl overflow-hidden border shadow-lg"
                style={{ background: 'var(--surface-card)', borderColor: 'var(--border)', minWidth: 180 }}
                onMouseLeave={() => setShowMenu(false)}>
                <button onClick={() => { setMuted((v) => !v); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-[var(--surface-muted)] text-left"
                  style={{ color: 'var(--ink)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <BellOff size={14} style={{ color: 'var(--muted)' }} />
                  {muted ? 'Unmute notifications' : 'Mute notifications'}
                </button>
                <button onClick={() => {
                  const url = `${window.location.origin}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                  setShowMenu(false);
                }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-[var(--surface-muted)] text-left border-t"
                  style={{ color: 'var(--ink)', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Share size={14} style={{ color: 'var(--muted)' }} />
                  Copy link
                </button>
                <button onClick={() => {
                  if (window.confirm('Clear this conversation? Messages will remain in the database.')) {
                    setMessages([]);
                  }
                  setShowMenu(false);
                }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all text-left border-t"
                  style={{ color: 'var(--danger)', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                  Clear chat
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="text-sm" style={{ color: 'var(--muted)' }}>No messages yet</div>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>Send a message to start the conversation</div>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs font-medium px-2" style={{ color: 'var(--muted)' }}>{group.date}</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
            {group.messages.map((msg) => (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}>
                <MessageBubble msg={msg} isAllie={isAllie} />
                {Boolean((msg.metadata as Record<string, unknown> | null | undefined)?.requiresPro) && (
                  <div className="flex justify-start pl-10 mt-1 mb-2">
                    <button onClick={() => setShowProUpgrade(true)}
                      className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
                      style={{ background: '#C4A265', color: '#1a1612', border: 'none', cursor: 'pointer' }}>
                      ✦ Upgrade to ONE Pro — $5/mo
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
        {otherTyping && (
          <motion.div className="flex items-end gap-2"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}>
            <AllieIcon size={28} state="thinking" />
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center"
              style={{ background: 'var(--surface-bubble-in)', border: '1px solid var(--border)' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--muted)', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 px-4 py-3 border-t"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowPayment(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-transparent border-0 cursor-pointer transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            title="Send USDC">
            <DollarSign size={15} />
          </button>

          <button
            onClick={() => attachRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            title="Attach image">
            <Paperclip size={15} />
          </button>
          <input ref={attachRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || isAllie) return;
              const ext = file.name.split('.').pop() ?? 'jpg';
              const path = `${user.id}/msg-${Date.now()}.${ext}`;
              const { error: upErr } = await supabase.storage.from('avatars')
                .upload(path, file, { upsert: true, contentType: file.type });
              if (upErr) return;
              const { data: urlD } = supabase.storage.from('avatars').getPublicUrl(path);
              await supabase.from('messages').insert({
                conversation_id: conversation.id, sender_id: user.id,
                type: 'image', content: urlD.publicUrl,
              });
              if (attachRef.current) attachRef.current.value = '';
            }} />

          <div className="flex-1 rounded-2xl overflow-hidden flex items-end"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAllie ? 'Ask ALLIE anything…' : 'Message… (type @ALLIE to tag AI)'}
              rows={1}
              className="flex-1 px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
              style={{ color: 'var(--ink)', maxHeight: '120px' }}
            />
          </div>

          <button
            onClick={() => void sendMessage()}
            disabled={!text.trim() || sending}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
            style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', cursor: text.trim() ? 'pointer' : 'default' }}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Payment sheet */}
      {showPayment && (
        <PaymentSheet
          conversation={conversation}
          session={session}
          onClose={() => setShowPayment(false)}
          onPaymentSent={(msg) => {
            setMessages((prev) => [...prev, msg]);
            setShowPayment(false);
          }}
        />
      )}

      {/* Pro upgrade modal */}
      {showProUpgrade && (
        <ProUpgradeModal
          onClose={() => setShowProUpgrade(false)}
          onUpgraded={() => {
            // Refresh will pick up is_pro from DB on next load
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function MessageBubble({ msg, isAllie }: { msg: Message; isAllie: boolean }) {
  const isPayment = msg.type === 'payment' || msg.type === 'payment_request';

  if (isPayment) {
    const meta = msg.metadata as { amount?: string; recipientHandle?: string; state?: string } | undefined;
    const state = meta?.state ?? 'INITIATED';
    const stateColor = state === 'COMPLETE' ? 'var(--success)' : state === 'FAILED' ? 'var(--danger)' : 'var(--muted)';
    return (
      <div className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'} my-2`}>
        <div className="rounded-2xl p-4 max-w-xs w-full"
          style={{ background: msg.isOwn ? 'var(--ink)' : 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-medium mb-1" style={{ color: msg.isOwn ? 'var(--subtle)' : 'var(--muted)' }}>
            {msg.type === 'payment' ? 'Sent USDC' : 'Payment request'}
          </div>
          <div className="display text-2xl font-bold tabular-nums" style={{ color: msg.isOwn ? 'var(--bg)' : 'var(--ink)' }}>
            ${meta?.amount ?? '0'} <span className="text-sm font-medium">USDC</span>
          </div>
          {meta?.recipientHandle && (
            <div className="text-xs mt-1" style={{ color: msg.isOwn ? 'var(--subtle)' : 'var(--muted)' }}>
              to {meta.recipientHandle}
            </div>
          )}
          <div className="flex items-center gap-1 mt-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: stateColor }} />
            <span className="text-xs" style={{ color: msg.isOwn ? 'var(--subtle)' : 'var(--muted)' }}>
              {state === 'COMPLETE' ? 'Confirmed' : state === 'FAILED' ? 'Failed' : 'Processing…'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 my-0.5 ${msg.isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {!msg.isOwn && !isAllie && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mb-1"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
          {(msg.senderName || '?').slice(0, 1)}
        </div>
      )}
      {!msg.isOwn && isAllie && (
        <AllieIcon size={26} state="idle" className="mb-1 flex-shrink-0" />
      )}
      <div className="max-w-xs lg:max-w-sm">
        {msg.type === 'image' && msg.content ? (
          <img src={msg.content} alt="attachment"
            className={`max-w-xs rounded-2xl ${msg.isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} object-cover cursor-pointer`}
            style={{ maxHeight: 240 }}
            onClick={() => window.open(msg.content ?? undefined, '_blank')} />
        ) : (
          <div className={`px-4 py-2.5 text-sm leading-relaxed ${msg.isOwn ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm'}`}
            style={{
              background: msg.isOwn ? 'var(--ink)' : 'var(--surface-bubble-in)',
              color: msg.isOwn ? 'var(--bg)' : 'var(--ink)',
              border: msg.isOwn ? 'none' : '1px solid var(--border)',
            }}>
            {msg.content}
          </div>
        )}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>{formatTimestamp(msg.createdAt)}</span>
          {msg.isOwn && (
            msg.deliveryState === 'read'
              ? <CheckCheck size={12} style={{ color: 'var(--success)' }} />
              : msg.deliveryState === 'delivered'
              ? <CheckCheck size={12} style={{ color: 'var(--muted)' }} />
              : <Check size={12} style={{ color: 'var(--muted)' }} />
          )}
        </div>
      </div>
    </div>
  );
}
