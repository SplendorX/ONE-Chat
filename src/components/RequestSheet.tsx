import { useState } from 'react';
import { X, HandCoins, Loader2, Check } from 'lucide-react';
import type { Conversation } from '../types';
import { requestPayment } from '../lib/api';

interface RequestSheetProps {
  conversation: Conversation;
  onClose: () => void;
}

const QUICK = ['5', '10', '25', '50'];

export function RequestSheet({ conversation, onClose }: RequestSheetProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handle = (conversation.oneId ?? conversation.name).replace(/\.one$/, '').toLowerCase().replace(/\s+/g, '');
  const amt = parseFloat(amount);
  const valid = !isNaN(amt) && amt > 0 && amt <= 10000;

  async function submit() {
    if (!valid) return;
    setLoading(true); setError('');
    try {
      await requestPayment({ toHandle: handle, amount: amt.toFixed(2), note: note.trim() || undefined, conversationId: conversation.id });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up"
        style={{ background: 'var(--surface-overlay)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(48,43,38,0.2)' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--gold)' }}>
              <HandCoins size={17} color="var(--bg)" />
            </div>
            <div>
              <h3 className="display text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Request USDC</h3>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>from {conversation.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--success)' }}>
              <Check size={26} color="white" strokeWidth={2.5} />
            </div>
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>Request sent</div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="text-sm px-3 py-2 rounded-xl" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}>{error}</div>}
            <div className="flex items-baseline justify-center gap-2">
              <span className="display text-2xl font-bold" style={{ color: 'var(--muted)' }}>$</span>
              <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus
                className="display text-5xl font-bold tabular-nums bg-transparent border-0 outline-0 text-center w-48" style={{ color: 'var(--ink)' }} />
              <span className="display text-lg font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
            <div className="flex gap-2 justify-center">
              {QUICK.map((q) => (
                <button key={q} onClick={() => setAmount(q)} className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: amount === q ? 'var(--ink)' : 'var(--surface-muted)', color: amount === q ? 'var(--bg)' : 'var(--muted)', border: `1px solid ${amount === q ? 'var(--ink)' : 'var(--border)'}`, cursor: 'pointer' }}>
                  ${q}
                </button>
              ))}
            </div>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for? (optional)" maxLength={100}
              className="w-full px-4 py-3 rounded-2xl text-sm bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--ink)' }} />
            <button onClick={() => void submit()} disabled={!valid || loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40"
              style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', cursor: 'pointer' }}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading ? 'Sending…' : `Request $${valid ? amt.toFixed(2) : '0.00'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
