import { Sun, Moon, LogOut, Copy, Shield, Bell, CreditCard, ChevronRight, Check, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { User, Theme } from '../types';
import { formatUSDC } from '../lib/utils';
import { useState, useEffect } from 'react';
import { getWalletBalance, provisionWallet } from '../lib/api';

interface ProfileViewProps {
  user: User;
  session: Session;
  theme: Theme;
  onThemeToggle: () => void;
  onSignOut: () => void;
}

export function ProfileView({ user, session: _session, theme, onThemeToggle, onSignOut }: ProfileViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [walletProvisioning, setWalletProvisioning] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    getWalletBalance()
      .then(({ balance: b, address }) => { setBalance(b); setWalletAddress(address); })
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false));
  }, []);

  async function retryWallet() {
    setWalletProvisioning(true);
    setWalletError(null);
    try {
      await provisionWallet();
      const { balance: b, address } = await getWalletBalance();
      setBalance(b);
      setWalletAddress(address);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Wallet setup failed');
      setWalletError(msg);
    } finally {
      setWalletProvisioning(false);
    }
  }

  function copyOneId() {
    navigator.clipboard.writeText(user.oneId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).catch(() => {});
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-xl font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>You</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8">
        {/* Profile card */}
        <div className="rounded-3xl p-5 text-center border"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
            {user.initials}
          </div>
          <div className="display text-xl font-700 mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {user.displayName}
          </div>
          <button onClick={copyOneId} className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-full text-sm transition-all"
            style={{ color: 'var(--muted)', background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            {user.oneId}
            {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
          </button>
          {user.isPro && (
            <span className="mt-2 inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
              Pro
            </span>
          )}
        </div>

        {/* Wallet */}
        <div className="rounded-2xl p-4 border" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>USDC BALANCE</span>
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(39,132,91,0.10)', color: 'var(--success)' }}>Arc Network</span>
          </div>
          <div className="display text-3xl font-700 tabular-nums mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            {balanceLoading
              ? <Loader2 size={20} className="animate-spin inline" style={{ color: 'var(--muted)' }} />
              : balance !== null ? `$${formatUSDC(parseFloat(balance))}` : '—'
            }
          </div>
          {!walletAddress && !balanceLoading && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--warning, #b45309)' }}>
                  <AlertTriangle size={12} /> Wallet not set up
                </div>
                {walletError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{walletError}</p>}
                <button onClick={() => { void retryWallet(); }}
                  disabled={walletProvisioning}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
                  style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                  {walletProvisioning
                    ? <><Loader2 size={11} className="animate-spin" /> Setting up…</>
                    : <><RefreshCw size={11} /> Set up wallet</>}
                </button>
              </div>
          )}
          {!walletAddress && balanceLoading && null}
          {walletAddress && (
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-xs font-mono truncate flex-1" style={{ color: 'var(--muted)' }}>
                {walletAddress}
              </p>
              <button onClick={copyAddress} className="flex-shrink-0 p-1 rounded-lg transition-all"
                style={{ color: copiedAddress ? 'var(--success)' : 'var(--muted)', background: 'var(--surface-muted)' }}
                title="Copy address">
                {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        {/* Pro upgrade */}
        {!user.isPro && (
          <div className="rounded-2xl p-4 border"
            style={{ background: 'linear-gradient(135deg, #302B26 0%, #4a4238 100%)', borderColor: 'transparent' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <span style={{ color: 'white', fontSize: 18 }}>✦</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-0.5" style={{ color: 'white' }}>Upgrade to Pro</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  ALLIE natural language · Advanced search · Desktop workspace
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {[
            { icon: Bell, label: 'Notifications', sub: 'Manage alerts' },
            { icon: Shield, label: 'Privacy & Security', sub: 'Encryption, sessions' },
            { icon: CreditCard, label: 'Subscription', sub: user.isPro ? 'Pro plan' : 'Free plan' },
          ].map(({ icon: Icon, label, sub }, i) => (
            <button key={label}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${i > 0 ? 'border-t' : ''}`}
              style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--surface-muted)' }}>
                <Icon size={15} style={{ color: 'var(--ink)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</div>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button onClick={onThemeToggle}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
          style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--surface-muted)' }}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </div>
          <span className="flex-1 text-sm font-medium text-left">
            {theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          </span>
          <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
        </button>

        {/* Sign out */}
        <button onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
          style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--danger)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(201,75,69,0.1)' }}>
            <LogOut size={15} style={{ color: 'var(--danger)' }} />
          </div>
          <span className="flex-1 text-sm font-medium text-left">Sign out</span>
        </button>
      </div>
    </div>
  );
}
