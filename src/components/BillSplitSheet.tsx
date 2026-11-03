import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Receipt, Loader2, Check, UserPlus, Search } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Conversation } from '../types';
import { post } from '../lib/api';
import { supabase } from '../lib/supabase';

interface Member { userId: string; handle: string; displayName: string; }
interface BillSplitSheetProps {
  conversation: Conversation;
  session: Session;
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
}

export function BillSplitSheet({ conversation, session, members: baseMembers, onClose, onCreated }: BillSplitSheetProps) {
  const [added, setAdded] = useState<Member[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const members: Member[] = [...baseMembers, ...added.filter((a) => !baseMembers.some((b) => b.userId === a.userId))];

  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [includeMyself, setIncludeMyself] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const myId = session.user.id;
  const selected = { has: (id: string) => !excluded.has(id) };
  const others = members.filter((m) => m.userId !== myId && selected.has(m.userId)).map((m) => m.userId);
  const participants = includeMyself ? [myId, ...others] : others;
  const totalNum = parseFloat(total) || 0;
  const perPerson = participants.length > 0 ? totalNum / participants.length : 0;

  useEffect(() => {
    const q = query.trim().replace(/\.one$/, '');
    if (!q) return;
    const t = setTimeout(() => {
      setSearching(true);
      void supabase.from('one_identities').select('user_id, handle').ilike('handle', `%${q}%`).limit(6).then(async ({ data }) => {
        const rows = (data ?? []).filter((r) => (r.user_id as string) !== myId && !members.some((m) => m.userId === r.user_id));
        const ids = rows.map((r) => r.user_id as string);
        const { data: profs } = ids.length ? await supabase.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
        const names = new Map((profs ?? []).map((p) => [p.id as string, p.display_name as string]));
        setResults(rows.map((r) => ({ userId: r.user_id as string, handle: r.handle as string, displayName: names.get(r.user_id as string) ?? (r.handle as string) })));
        setSearching(false);
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function addPerson(m: Member) {
    setError('');
    try {
      await post('/group/add-member', { conversationId: conversation.id, userId: m.userId });
      setAdded((prev) => [...prev, m]);
      setResults([]); setQuery(''); setShowAdd(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add member'); }
  }

  const handleCreate = useCallback(async () => {
    if (!title.trim() || totalNum <= 0 || participants.length < 2) {
      setError('Add a title, total amount, and at least 2 participants.'); return;
    }
    setLoading(true); setError('');
    try {
      await post('/payment/bill-split', {
        conversationId: conversation.id,
        title: title.trim(),
        totalAmount: totalNum.toFixed(6),
        perPersonAmount: perPerson.toFixed(6),
        memberIds: participants,
      });
      setDone(true);
      setTimeout(() => { onCreated(); onClose(); }, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create split'); }
    finally { setLoading(false); }
  }, [title, totalNum, participants, perPerson, conversation.id, onCreated, onClose]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          style={{ width: '100%', maxWidth: 520, margin: '0 auto', background: 'var(--surface-overlay)', borderRadius: '20px 20px 0 0', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={18} color="var(--bg)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Split bill</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{conversation.name}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
          </div>

          {done ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Check size={28} color="var(--success)" />
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 16 }}>Bill split created!</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Members will see it in the chat</div>
            </motion.div>
          ) : (
            <>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 8 }}>{error}</div>}

              {/* Title */}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's this for? (e.g. Dinner at Nobu)"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

              {/* Total */}
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total amount" type="number" min="0"
                  style={{ width: '100%', padding: '13px 14px 13px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 15, fontWeight: 600, boxSizing: 'border-box' }} />
              </div>

              {/* Members */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--muted)', fontSize: 13 }}>
                  <Users size={14} />Participants ({participants.length})
                </div>
                {/* Include myself toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface-muted)', borderRadius: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>Include myself</span>
                  <button onClick={() => setIncludeMyself((v) => !v)}
                    style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: includeMyself ? 'var(--gold)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 3, left: includeMyself ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </button>
                </div>
                {members.filter((m) => m.userId !== myId).map((m) => (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface-muted)', borderRadius: 10, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--bg)' }}>
                        {m.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{m.displayName}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.handle}.one</div>
                      </div>
                    </div>
                    <button onClick={() => setExcluded((prev) => { const n = new Set(prev); if (n.has(m.userId)) n.delete(m.userId); else n.add(m.userId); return n; })}
                      style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid', borderColor: selected.has(m.userId) ? 'var(--gold)' : 'var(--border)', background: selected.has(m.userId) ? 'var(--gold)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selected.has(m.userId) && <Check size={12} color="var(--bg)" />}
                    </button>
                  </div>
                ))}
                {/* Add someone */}
                <button onClick={() => setShowAdd((v) => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <UserPlus size={14} />Add someone to this split
                </button>
                {showAdd && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                      <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); }} placeholder="Search by .one handle"
                        style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    {searching && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 8, textAlign: 'center' }}>Searching…</div>}
                    {results.map((r) => (
                      <button key={r.userId} onClick={() => void addPerson(r)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginTop: 4, borderRadius: 10, border: 'none', background: 'var(--surface-muted)', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ink)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{r.displayName.slice(0, 1).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{r.displayName}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.handle}.one</div>
                        </div>
                        <UserPlus size={14} color="var(--gold)" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-person preview */}
              {totalNum > 0 && participants.length > 0 && (
                <div style={{ padding: '12px 16px', background: 'var(--surface-card)', borderRadius: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Each person pays</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>${perPerson.toFixed(2)} USDC</span>
                </div>
              )}

              <motion.button whileTap={{ scale: 0.97 }} onClick={() => void handleCreate()} disabled={loading}
                style={{ width: '100%', padding: 14, background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Creating…</> : `Create split — $${perPerson.toFixed(2)} each`}
              </motion.button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
