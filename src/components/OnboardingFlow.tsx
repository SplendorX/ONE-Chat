import { useState, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, Check, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkIdentityAvailable, claimIdentity, provisionWallet } from '../lib/api';

interface OnboardingFlowProps {
  session: Session;
  onComplete: () => void;
}

type Step = 'welcome' | 'identity' | 'wallet' | 'allie' | 'done';

function suggestHandle(email: string): string {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

export function OnboardingFlow({ session, onComplete }: OnboardingFlowProps) {
  const email = session.user.email ?? '';
  const initialHandle = suggestHandle(email);

  const [step, setStep] = useState<Step>('welcome');
  const [oneHandle, setOneHandle] = useState(initialHandle);
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [claimError, setClaimError] = useState('');
  const [walletState, setWalletState] = useState<'idle' | 'provisioning' | 'done' | 'error'>('idle');
  const [walletAddress, setWalletAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHandleChange = useCallback((value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
    setOneHandle(clean);
    setCheckState('idle');
    setClaimError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clean.length < 3) return;
    setCheckState('checking');
    debounceRef.current = setTimeout(() => void (async () => {
      try {
        const { available } = await checkIdentityAvailable(clean);
        setCheckState(available ? 'available' : 'taken');
      } catch {
        // API unreachable — allow optimistic proceed; server will reject duplicates
        setCheckState('available');
      }
    })(), 500);
  }, []);

  async function handleClaimIdentity() {
    if (checkState !== 'available' || oneHandle.length < 3) return;
    setSaving(true);
    setClaimError('');
    try {
      await claimIdentity(oneHandle);
      // Also upsert display name in profiles
      await supabase.from('profiles').upsert({
        id: session.user.id,
        display_name: session.user.user_metadata?.full_name ?? email.split('@')[0],
        updated_at: new Date().toISOString(),
      });
      setStep('wallet');
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim identity');
    } finally {
      setSaving(false);
    }
  }

  async function handleProvisionWallet() {
    setWalletState('provisioning');
    try {
      const { wallet } = await provisionWallet();
      setWalletAddress(wallet.address);
      setWalletState('done');
    } catch (err) {
      console.error('[OnboardingFlow] wallet provision error', err);
      setWalletState('error');
    }
  }

  const steps: Step[] = ['welcome', 'identity', 'wallet', 'allie', 'done'];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div style={{ position: 'absolute', top: '8%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '8%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,207,189,0.35) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Progress dots */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-1.5 mb-8">
            {steps.slice(0, -1).map((_, i) => (
              <div key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: i === stepIdx ? 20 : 6,
                  height: 6,
                  background: i <= stepIdx ? 'var(--ink)' : 'var(--border-strong)',
                }} />
            ))}
          </div>
        )}

        <div className="rounded-3xl p-7"
          style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(48,43,38,0.07)' }}>

          {/* ── Welcome ── */}
          {step === 'welcome' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <span className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>1</span>
              </div>
              <div>
                <h2 className="display text-2xl font-bold mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  Let's make this yours.
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Welcome{session.user.user_metadata?.full_name ? `, ${session.user.user_metadata.full_name as string}` : ''}. Takes about 2 minutes.
                </p>
              </div>
              <button onClick={() => { setStep('identity'); handleHandleChange(initialHandle); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
                style={{ background: 'var(--ink)', color: 'white' }}>
                Get started <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* ── Identity ── */}
          {step === 'identity' && (
            <div className="space-y-5">
              <div>
                <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  Choose your ONE identity
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  This is how people find you and send you USDC.
                </p>
              </div>

              <div className="flex items-center rounded-2xl overflow-hidden border"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: checkState === 'taken' ? 'var(--danger)' : checkState === 'available' ? 'var(--success)' : 'var(--border)',
                }}>
                <input
                  type="text"
                  value={oneHandle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  placeholder="yourname"
                  autoFocus
                  className="flex-1 px-4 py-3.5 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--ink)' }}
                  maxLength={24}
                />
                <div className="pr-3 flex items-center gap-1">
                  {checkState === 'checking' && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)' }} />}
                  {checkState === 'available' && <Check size={14} style={{ color: 'var(--success)' }} />}
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>.one</span>
                </div>
              </div>

              {checkState === 'taken' && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  That identity is taken. Try adding your initial or a number.
                </p>
              )}
              {checkState === 'available' && (
                <p className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                  {oneHandle}.one is available!
                </p>
              )}
              {claimError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{claimError}</p>}

              <button
                onClick={() => { void handleClaimIdentity(); }}
                disabled={checkState !== 'available' || saving}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40"
                style={{ background: 'var(--ink)', color: 'white' }}>
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Claiming...</>
                  : <>Claim {checkState === 'available' ? `${oneHandle}.one` : 'your identity'} <ArrowRight size={14} /></>}
              </button>
            </div>
          )}

          {/* ── Wallet ── */}
          {step === 'wallet' && (
            <div className="space-y-5">
              <div>
                <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  Set up your wallet
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                  One Chat creates a USDC wallet on Arc Network linked to{' '}
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{oneHandle}.one</span>.
                  Your wallet is managed securely — no seed phrases.
                </p>
              </div>

              {walletState === 'idle' && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  {[
                    ['Instant', 'Sub-second USDC transfers on Arc Network'],
                    ['No seed phrases', 'Your wallet is secured by Circle\'s infrastructure'],
                    ['ONE identity', 'Send and receive using names, not addresses'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0"
                        style={{ background: 'var(--ink)' }}>
                        <Check size={10} color="white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{title}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {walletState === 'provisioning' && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ink)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Creating your wallet on Arc Network…</p>
                </div>
              )}

              {walletState === 'done' && (
                <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--success)' }}>
                      <Check size={10} color="white" />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Wallet ready</span>
                  </div>
                  <p className="text-xs font-mono truncate pl-7" style={{ color: 'var(--muted)' }}>{walletAddress}</p>
                </div>
              )}

              {walletState === 'error' && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  Wallet creation failed. You can retry from your profile settings.
                </p>
              )}

              {walletState === 'idle' && (
                <button onClick={() => { void handleProvisionWallet(); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
                  style={{ background: 'var(--ink)', color: 'white' }}>
                  Create my wallet <ArrowRight size={14} />
                </button>
              )}

              {(walletState === 'done' || walletState === 'error') && (
                <button onClick={() => setStep('allie')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
                  style={{ background: 'var(--ink)', color: 'white' }}>
                  Continue <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          {/* ── ALLIE intro ── */}
          {step === 'allie' && (
            <div className="space-y-5">
              <div>
                <h2 className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  Meet ALLIE
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Your AI financial assistant — built right into your conversations.
                </p>
              </div>

              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-muted)' }}>
                {[
                  { msg: `Send 25 USDC to ${oneHandle || 'friend'}.one`, isUser: true },
                  { msg: 'Ready to send 25 USDC. Tap to confirm.', isUser: false },
                  { msg: 'Split dinner equally for 4 people', isUser: true },
                  { msg: 'Bill split created: $23.75 each. Sent requests to all 3.', isUser: false },
                ].map((item, i) => (
                  <div key={i} className={`flex gap-2 ${item.isUser ? 'justify-end' : 'justify-start items-start'}`}>
                    {!item.isUser && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #302B26 0%, #857D73 100%)' }}>
                        <Sparkles size={12} color="white" />
                      </div>
                    )}
                    <div className="px-3 py-2 rounded-xl text-xs max-w-xs"
                      style={{
                        background: item.isUser ? 'var(--ink)' : 'rgba(255,255,255,0.72)',
                        color: item.isUser ? 'white' : 'var(--ink)',
                        border: item.isUser ? 'none' : '1px solid var(--border)',
                      }}>
                      {item.msg}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Free commands work without AI.{' '}
                <span className="font-medium" style={{ color: 'var(--ink)' }}>Pro</span> unlocks natural-language conversations.
              </p>

              <button onClick={() => setStep('done')}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
                style={{ background: 'var(--ink)', color: 'white' }}>
                Enter One Chat <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="text-center space-y-5 py-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'var(--success)' }}>
                <Check size={28} color="white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="display text-2xl font-bold mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  You're all set.
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Your identity is <span className="font-semibold" style={{ color: 'var(--ink)' }}>{oneHandle}.one</span>.
                  Start a conversation or send your first USDC.
                </p>
              </div>
              <button onClick={onComplete}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm"
                style={{ background: 'var(--ink)', color: 'white' }}>
                Open One Chat <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
