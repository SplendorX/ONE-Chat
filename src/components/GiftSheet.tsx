import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { X, Gift, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react';
import { formatUSDC } from '../lib/utils';
import { sendUsdc } from '../lib/api';

interface GiftSheetProps {
  creatorOneId: string;
  creatorName: string;
  postExcerpt: string;
  session: Session;
  conversationId?: string;
  onConfirm: (amount: number, message: string) => void;
  onClose: () => void;
}

const GIFT_AMOUNTS = [1, 2, 5, 10];
type Step = 'pick' | 'review' | 'processing' | 'done' | 'error';

export function GiftSheet({ creatorOneId, creatorName, postExcerpt, session: _session, conversationId, onConfirm, onClose }: GiftSheetProps) {
  const [amount, setAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [errorMsg, setErrorMsg] = useState('');

  const finalAmount = customAmount ? parseFloat(customAmount) || 0 : amount;

  async function proceed() {
    if (step === 'pick') { setStep('review'); return; }
    if (step === 'review') {
      setStep('processing');
      try {
        // Use a synthetic conversation ID for gift payments if none provided
        const convId = conversationId ?? `gift-${creatorOneId}-${Date.now()}`;
        await sendUsdc({
          recipientHandle: creatorOneId,
          amount: finalAmount.toFixed(2),
          conversationId: convId,
          note: message || `Gift to ${creatorOneId}`,
        });
        setStep('done');
        setTimeout(() => onConfirm(finalAmount, message), 1500);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Payment failed');
        setStep('error');
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(48,43,38,0.35)', backdropFilter: 'blur(4px)' }}
        onClick={onClose} />

      <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 border animate-slide-up"
        style={{
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderColor: 'var(--border)',
          boxShadow: '0 -8px 40px rgba(48,43,38,0.10)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5 sm:hidden" style={{ background: 'var(--border-strong)' }} />

        {step === 'pick' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--oat-beige, #EDE5D8)' }}>
                  <Gift size={15} style={{ color: 'var(--ink)' }} />
                </div>
                <h2 className="display text-lg font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Gift USDC</h2>
              </div>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ background: 'var(--surface-muted)' }}>
                <X size={14} style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="rounded-2xl p-3 mb-5 border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)' }}>
                  {creatorName[0]}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{creatorOneId}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>"{postExcerpt}"</p>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {GIFT_AMOUNTS.map((a) => (
                <button key={a} onClick={() => { setAmount(a); setCustomAmount(''); }}
                  className="py-3 rounded-2xl text-sm font-semibold transition-all"
                  style={{
                    background: amount === a && !customAmount ? 'var(--ink)' : 'var(--surface-muted)',
                    color: amount === a && !customAmount ? 'var(--bg)' : 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}>
                  ${a}
                </button>
              ))}
            </div>

            <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Custom amount" className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-4"
              style={{ background: 'var(--surface-muted)', border: `1px solid ${customAmount ? 'var(--border-strong)' : 'var(--border)'}`, color: 'var(--ink)' }} />

            <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)" maxLength={120}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />

            <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
              <div onClick={() => setIsPublic((v) => !v)}
                className="w-9 h-5 rounded-full relative transition-all"
                style={{ background: isPublic ? 'var(--ink)' : 'var(--border-strong)' }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{ background: 'white', left: isPublic ? '20px' : '2px' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--ink)' }}>Share my identity publicly</span>
            </label>

            <button onClick={() => { void proceed(); }} disabled={finalAmount <= 0}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              Send ${formatUSDC(finalAmount)} gift <ArrowRight size={14} />
            </button>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="display text-lg font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Review gift</h2>
              <button onClick={() => setStep('pick')} className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ background: 'var(--surface-muted)' }}>
                <X size={14} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="rounded-2xl p-5 mb-4 space-y-3" style={{ background: 'var(--surface-muted)' }}>
              {[
                ['Recipient', creatorOneId],
                ['Amount', `$${formatUSDC(finalAmount)} USDC`],
                ['Message', message || '—'],
                ['Attribution', isPublic ? 'Public (shows your .one identity)' : 'Private'],
                ['Network', 'Arc Network'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--subtle)' }}>
              Gifts are voluntary payments and cannot be reversed once confirmed.
            </p>
            <button onClick={() => { void proceed(); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              Confirm gift <ArrowRight size={14} />
            </button>
          </>
        )}

        {step === 'processing' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'var(--surface-muted)' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ink)' }} />
            </div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sending gift…</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Processing on Arc Network</p>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'rgba(39,132,91,0.12)' }}>
              <Check size={28} style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Gift sent!</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                ${formatUSDC(finalAmount)} USDC to {creatorOneId}
              </p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'rgba(201,75,69,0.1)' }}>
              <AlertCircle size={28} style={{ color: 'var(--danger)' }} />
            </div>
            <div>
              <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Gift failed</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{errorMsg}</p>
            </div>
            <button onClick={() => setStep('pick')}
              className="px-6 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
