import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Zap, MessageSquare, CreditCard, CheckCircle2 } from 'lucide-react';
import { AllieIcon } from './AllieIcon';
import { subscribeToPro } from '../lib/api';

interface ProUpgradeModalProps {
  onClose: () => void;
  onUpgraded: () => void;
}

export function ProUpgradeModal({ onClose, onUpgraded }: ProUpgradeModalProps) {
  const [step, setStep] = useState<'pitch' | 'confirm' | 'processing' | 'success' | 'error'>('pitch');
  const [error, setError] = useState('');

  async function handleSubscribe() {
    setStep('processing');
    try {
      const result = await subscribeToPro();
      if (result.success) {
        setStep('success');
        setTimeout(() => { onUpgraded(); onClose(); }, 2000);
      } else {
        setError('Subscription failed. Please try again.');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed');
      setStep('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface-overlay)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}>

        {/* Gold gradient header */}
        <div className="relative px-6 pt-8 pb-6 text-center"
          style={{ background: 'linear-gradient(135deg, #2a2218 0%, #3d3020 50%, #2a2218 100%)' }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#a09880', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
          <div className="flex justify-center mb-3">
            <AllieIcon size={52} state="idle" />
          </div>
          <div className="text-xl font-bold mb-1" style={{ color: '#C4A265' }}>ONE Pro</div>
          <div className="text-sm" style={{ color: '#a09880' }}>Unlock the full power of ALLIE</div>
        </div>

        <div className="px-6 py-5">
          {(step === 'pitch' || step === 'confirm') && (
            <>
              {/* Features */}
              <div className="space-y-3 mb-6">
                {[
                  { icon: MessageSquare, text: 'Full AI-powered ALLIE responses', sub: 'Ask anything, get smart answers' },
                  { icon: Zap, text: 'ALLIE executes payments for you', sub: 'Just say "send 5 USDC to alice.one"' },
                  { icon: CreditCard, text: 'Priority support', sub: 'Faster responses, no rate limits' },
                ].map(({ icon: Icon, text, sub }) => (
                  <div key={text} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(196,162,101,0.12)' }}>
                      <Icon size={15} style={{ color: '#C4A265' }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{text}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price */}
              <div className="rounded-2xl p-4 mb-5 text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <span className="text-3xl font-bold" style={{ color: '#C4A265' }}>$5</span>
                <span className="text-sm ml-1" style={{ color: 'var(--muted)' }}>USDC / month</span>
                <div className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Charged from your ONE wallet · Cancel anytime</div>
              </div>

              {step === 'confirm' && (
                <div className="rounded-xl p-3 mb-4 text-sm text-center" style={{ background: 'rgba(196,162,101,0.08)', border: '1px solid rgba(196,162,101,0.2)', color: '#C4A265' }}>
                  5 USDC will be sent from your wallet to activate ONE Pro for 30 days.
                </div>
              )}

              <button
                onClick={() => step === 'pitch' ? setStep('confirm') : void handleSubscribe()}
                className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
                style={{ background: '#C4A265', color: '#1a1612', border: 'none', cursor: 'pointer' }}>
                {step === 'pitch' ? 'Upgrade to ONE Pro' : 'Confirm — Pay 5 USDC'}
              </button>
              {step === 'confirm' && (
                <button onClick={() => setStep('pitch')} className="w-full py-2 mt-2 text-sm bg-transparent border-0 cursor-pointer"
                  style={{ color: 'var(--muted)' }}>Back</button>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <AllieIcon size={44} state="thinking" />
              <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Processing your subscription…</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Charging 5 USDC from your wallet</div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <CheckCircle2 size={44} style={{ color: 'var(--success)' }} />
              <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Welcome to ONE Pro!</div>
              <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>ALLIE now has full AI capabilities available to you.</div>
            </div>
          )}

          {step === 'error' && (
            <div className="py-4 flex flex-col items-center gap-4">
              <div className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</div>
              <button onClick={() => setStep('confirm')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
