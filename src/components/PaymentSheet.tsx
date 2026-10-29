import { useState, useCallback, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { X, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react';
import type { Conversation, Message } from '../types';
import { sendUsdc, getPaymentStatus } from '../lib/api';
import { formatUSDC } from '../lib/utils';

interface PaymentSheetProps {
  conversation: Conversation;
  session: Session;
  onClose: () => void;
  onPaymentSent: (msg: Message) => void;
}

type Step = 'amount' | 'review' | 'pending' | 'success' | 'failed';

const QUICK_AMOUNTS = ['5', '10', '25', '50'];

export function PaymentSheet({ conversation, session, onClose, onPaymentSent }: PaymentSheetProps) {
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // Prefer the stored .one handle; fall back to the display name (server will reject if it doesn't match)
  const [resolvedHandle] = useState(
    conversation.oneId ? conversation.oneId.replace(/\.one$/, '') : conversation.name
  );
  const [txId, setTxId] = useState('');
  const [txState, setTxState] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [pollStart] = useState(() => Date.now());

  const amountNum = parseFloat(amount);
  const isValidAmount = !isNaN(amountNum) && amountNum > 0 && amountNum <= 10000;

  // Circle terminal success states on Arc Testnet
  const SUCCESS_STATES = ['CONFIRMED', 'COMPLETE', 'SENT'];
  const FAILED_STATES = ['FAILED', 'DENIED', 'CANCELLED'];
  const MAX_POLL_MS = 90_000; // give up after 90s

  // Poll transaction status after submission
  useEffect(() => {
    if (step !== 'pending' || !txId) return;
    let stopped = false;

    // Hard timeout — stop polling and show success anyway (tx was accepted by Circle)
    const timeout = setTimeout(() => {
      if (!stopped) { stopped = true; setStep('success'); }
    }, MAX_POLL_MS);

    async function poll() {
      // Also bail out if we've been polling too long
      if (Date.now() - pollStart > MAX_POLL_MS) {
        if (!stopped) { stopped = true; setStep('success'); }
        return;
      }
      try {
        const { transaction } = await getPaymentStatus(txId);
        setTxState(transaction.state);
        if (SUCCESS_STATES.includes(transaction.state)) {
          if (!stopped) { stopped = true; setStep('success'); }
        } else if (FAILED_STATES.includes(transaction.state)) {
          if (!stopped) { stopped = true; setStep('failed'); }
        } else {
          // Still INITIATED / QUEUED / PENDING_RISK_SCREENING etc — keep polling
          if (!stopped) setTimeout(() => setPollCount((c) => c + 1), 3000);
        }
      } catch {
        if (!stopped) setTimeout(() => setPollCount((c) => c + 1), 4000);
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timeout); };
  }, [step, txId, pollCount, pollStart]);

  const handleSend = useCallback(async () => {
    if (!isValidAmount) return;
    setError('');
    setStep('pending');
    try {
      const handle = resolvedHandle.toLowerCase().replace(/\.one$/, '').replace(/\s+/g, '');

      const result = await sendUsdc({
        recipientHandle: handle,
        amount,
        conversationId: conversation.id,
        note: note.trim() || undefined,
      });
      setTxId(result.transactionId);
      setTxState(result.state);

      // Immediately deliver the payment card message to UI
      const paymentMsg: Message = {
        id: result.transactionId,
        conversationId: conversation.id,
        senderId: session.user.id,
        senderName: 'You',
        type: 'payment',
        content: note.trim() || null,
        metadata: {
          transactionId: result.transactionId,
          circleTxId: result.circleTxId,
          amount,
          asset: 'USDC',
          recipientHandle: handle,
          state: result.state,
        },
        createdAt: new Date(),
        isOwn: true,
        deliveryState: 'sent',
      };
      onPaymentSent(paymentMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      setStep('failed');
    }
  }, [isValidAmount, amount, note, conversation.id, session.user.id, resolvedHandle, onPaymentSent]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up"
        style={{ background: 'var(--surface-overlay)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(48,43,38,0.2)' }}>

        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5 sm:hidden" style={{ background: 'var(--border-strong)' }} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="display text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {step === 'success' ? 'Sent!' : step === 'failed' ? 'Payment failed' : step === 'pending' ? 'Sending…' : 'Send USDC'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Amount entry ── */}
        {step === 'amount' && (
          <div className="space-y-5">
            {/* Big amount input */}
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="display text-2xl font-bold" style={{ color: 'var(--muted)' }}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="display text-5xl font-bold tabular-nums bg-transparent border-0 outline-0 text-center w-48"
                  style={{ color: 'var(--ink)' }}
                />
                <span className="display text-lg font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
              </div>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 justify-center">
              {QUICK_AMOUNTS.map((q) => (
                <button key={q} onClick={() => setAmount(q)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={{
                    background: amount === q ? 'var(--ink)' : 'var(--surface-muted)',
                    color: amount === q ? 'var(--bg)' : 'var(--muted)',
                    border: `1px solid ${amount === q ? 'var(--ink)' : 'var(--border)'}`,
                  }}>
                  ${q}
                </button>
              ))}
            </div>

            {/* Recipient */}
            <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                {conversation.initials}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{conversation.name}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>Via ONE identity</div>
              </div>
            </div>

            {/* Note */}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full px-4 py-3 rounded-2xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid var(--border)', color: 'var(--ink)' }}
              maxLength={100}
            />

            <button
              onClick={() => setStep('review')}
              disabled={!isValidAmount}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              Review payment <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* ── Review ── */}
        {step === 'review' && (
          <div className="space-y-5">
            <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="text-sm mb-1" style={{ color: 'var(--muted)' }}>You are sending</div>
              <div className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                ${formatUSDC(amountNum)}
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>USDC on Arc Testnet</div>
            </div>

            <div className="space-y-2">
              {[
                ['To', conversation.name],
                ['Network', 'Arc Testnet'],
                ['Asset', 'USDC'],
                ['Network fee', 'Minimal (USDC)'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{val}</span>
                </div>
              ))}
            </div>

            {note && <p className="text-sm italic px-1" style={{ color: 'var(--muted)' }}>"{note}"</p>}

            <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
              Blockchain transfers are final once confirmed. Verify the recipient before sending.
            </p>

            <div className="flex gap-3">
              <button onClick={() => setStep('amount')}
                className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button onClick={() => void handleSend()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                Confirm & send <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Pending ── */}
        {step === 'pending' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <Loader2 size={36} className="animate-spin" style={{ color: 'var(--ink)' }} />
            <div className="text-center">
              <div className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>Processing payment…</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                ${formatUSDC(amountNum)} USDC · Arc Testnet
              </div>
              <div className="text-xs mt-2 tabular-nums" style={{ color: 'var(--subtle)' }}>
                Status: {txState || 'INITIATED'}
              </div>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--success)' }}>
              <Check size={28} color="white" strokeWidth={2.5} />
            </div>
            <div className="text-center">
              <div className="display text-3xl font-bold tabular-nums mb-1" style={{ color: 'var(--ink)' }}>
                ${formatUSDC(amountNum)}
              </div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                Sent to {conversation.name}
              </div>
            </div>
            <button onClick={onClose}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              Done
            </button>
          </div>
        )}

        {/* ── Failed ── */}
        {step === 'failed' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--danger)' }}>
              <AlertCircle size={28} color="white" />
            </div>
            <div className="text-center">
              <div className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>Payment failed</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{error || 'The transaction could not be completed.'}</div>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setStep('amount')}
                className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                Try again
              </button>
              <button onClick={onClose}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
