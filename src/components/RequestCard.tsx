import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HandCoins, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendUsdc, respondToRequest } from '../lib/api';

interface RequestCardProps {
  messageId: string;
  conversationId: string;
  isOwn: boolean;
  amount: string;
  note?: string;
  requesterHandle: string;
  createdAt: Date;
  initialStatus?: string;
}

export function RequestCard({ messageId, conversationId, isOwn, amount, note, requesterHandle, createdAt, initialStatus }: RequestCardProps) {
  const [status, setStatus] = useState(initialStatus ?? 'pending');
  const [busy, setBusy] = useState<'pay' | 'decline' | 'cancel' | null>(null);
  const [error, setError] = useState('');

  // Keep status fresh while the request is open (the other person may act on it)
  useEffect(() => {
    if (status !== 'pending') return;
    let active = true;
    async function refresh() {
      const { data } = await supabase.from('messages').select('metadata').eq('id', messageId).maybeSingle();
      const s = (data?.metadata as { status?: string } | null)?.status;
      if (active && s && s !== 'pending') setStatus(s);
    }
    void refresh();
    const t = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(t); };
  }, [messageId, status]);

  const amt = parseFloat(amount || '0');

  async function pay() {
    setBusy('pay'); setError('');
    try {
      await sendUsdc({ recipientHandle: requesterHandle, amount: amt.toFixed(2), conversationId, note: note || 'Payment request' });
      await respondToRequest(messageId, 'paid');
      setStatus('paid');
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment failed'); }
    finally { setBusy(null); }
  }

  async function respond(action: 'declined' | 'cancelled') {
    setBusy(action === 'declined' ? 'decline' : 'cancel'); setError('');
    try {
      const r = await respondToRequest(messageId, action);
      setStatus(r.status);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(null); }
  }

  const closed = status !== 'pending';
  const label = status === 'paid' ? 'Paid' : status === 'declined' ? 'Declined' : status === 'cancelled' ? 'Cancelled' : 'Awaiting payment';
  const labelColor = status === 'paid' ? '#22c55e' : closed ? 'var(--muted)' : '#f59e0b';

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} my-2 w-full`}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
        style={{ maxWidth: 300, width: '100%', borderRadius: 20, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #C4A265, #e8c87a, #C4A265)' }} />
        <div style={{ padding: '16px 18px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(196,162,101,0.18)' }}>
                <HandCoins size={14} color="#C4A265" />
              </div>
              <span className="text-xs font-semibold uppercase" style={{ color: 'var(--muted)', letterSpacing: '0.06em' }}>
                {isOwn ? 'You requested' : `${requesterHandle}.one requested`}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-muted)' }}>
              {status === 'paid' ? <CheckCircle2 size={11} color={labelColor} /> : closed ? <XCircle size={11} color={labelColor} /> : null}
              <span className="text-xs font-semibold" style={{ color: labelColor }}>{label}</span>
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 mb-2">
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>${amt.toFixed(2)}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>

          {note && (
            <div className="px-3 py-2 rounded-xl mb-3" style={{ background: 'var(--surface-muted)' }}>
              <span className="text-xs italic" style={{ color: 'var(--muted)' }}>"{note}"</span>
            </div>
          )}

          {error && <div className="text-xs mb-2" style={{ color: 'var(--danger)' }}>{error}</div>}

          {!closed && !isOwn && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => void respond('declined')} disabled={busy !== null}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy === 'decline' ? '…' : 'Decline'}
              </button>
              <button onClick={() => void pay()} disabled={busy !== null}
                className="flex-[1.6] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'var(--gold)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy === 'pay' ? <><Loader2 size={14} className="animate-spin" />Paying…</> : `Pay $${amt.toFixed(2)}`}
              </button>
            </div>
          )}
          {!closed && isOwn && (
            <button onClick={() => void respond('cancelled')} disabled={busy !== null}
              className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy === 'cancel' ? '…' : 'Cancel request'}
            </button>
          )}

          <div className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>
            {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
