import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { OneChatWordmark } from './Brand';

interface AuthScreenProps {
  onAuthSuccess: (session: Session) => void;
  onBack: () => void;
}

type Step = 'method' | 'email' | 'otp';

export function AuthScreen({ onAuthSuccess, onBack }: AuthScreenProps) {
  const [step, setStep] = useState<Step>('method');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Google OAuth ─────────────────────────────────────────────────────
  async function handleGoogle() {
    setLoading(true);
    setError('');
    // Always use the current origin — works correctly on every host
    const redirectTo = window.location.origin;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
    // On success, browser navigates away; onAuthStateChange in App.tsx handles the callback
  }

  // ── Email OTP: send ───────────────────────────────────────────────────
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setStep('otp');
    }
  }

  // ── Email OTP: verify ─────────────────────────────────────────────────
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < 6) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: 'email',
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else if (data.session) {
      onAuthSuccess(data.session);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div style={{ position: 'absolute', top: '5%', right: '10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, var(--surface-muted) 0%, transparent 70%)', filter: 'blur(64px)', opacity: 0.5 }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, var(--surface-muted) 0%, transparent 70%)', filter: 'blur(56px)', opacity: 0.4 }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <button onClick={onBack} className="mb-3 inline-flex bg-transparent border-0 cursor-pointer mx-auto">
            <OneChatWordmark height={30} />
          </button>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {step === 'method' && 'Sign in or create your account'}
            {step === 'email' && 'Enter your email address'}
            {step === 'otp' && `Check your inbox for ${email}`}
          </p>
        </div>

        <div className="rounded-3xl p-7"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(48,43,38,0.10)' }}>

          {/* Back button inside card (for sub-steps) */}
          {step !== 'method' && (
            <button
              onClick={() => { setStep(step === 'otp' ? 'email' : 'method'); setError(''); }}
              className="flex items-center gap-1.5 mb-5 text-sm font-medium bg-transparent border-0 cursor-pointer p-0"
              style={{ color: 'var(--muted)' }}>
              <ArrowLeft size={14} /> Back
            </button>
          )}

          {/* ── Step: choose method ── */}
          {step === 'method' && (
            <div className="space-y-3">
              <button
                onClick={() => { void handleGoogle(); }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-medium text-sm transition-all disabled:opacity-60"
                style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-strong)', color: 'var(--ink)' }}>
                {loading
                  ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                Continue with Google
              </button>

              <div className="relative flex items-center gap-3 py-1">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              <button
                onClick={() => setStep('email')}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-medium text-sm transition-all"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                <Mail size={16} />
                Continue with email
              </button>
            </div>
          )}

          {/* ── Step: enter email ── */}
          {step === 'email' && (
            <form onSubmit={(e) => { void handleEmailSubmit(e); }} className="space-y-4">
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full px-4 py-3.5 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
                style={{ background: 'var(--ink)', color: 'white' }}>
                {loading
                  ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <>Send code <ArrowRight size={14} /></>}
              </button>
            </form>
          )}

          {/* ── Step: enter OTP ── */}
          {step === 'otp' && (
            <form onSubmit={(e) => { void handleOtpSubmit(e); }} className="space-y-4">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                We emailed a 6-digit code to <span className="font-semibold" style={{ color: 'var(--ink)' }}>{email}</span>. Enter it below to sign in.
              </p>
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="w-full px-4 py-3.5 text-xl font-mono tracking-widest text-center bg-transparent outline-none"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
                style={{ background: 'var(--ink)', color: 'white' }}>
                {loading
                  ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <>Verify and continue <ArrowRight size={14} /></>}
              </button>
              <button
                type="button"
                onClick={() => { void handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent); }}
                className="w-full text-xs text-center bg-transparent border-0 cursor-pointer py-1"
                style={{ color: 'var(--muted)' }}>
                Resend code
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--subtle)' }}>
          By continuing, you agree to our{' '}
          <a href="#" className="underline" style={{ color: 'var(--muted)' }}>Terms</a> and{' '}
          <a href="#" className="underline" style={{ color: 'var(--muted)' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
