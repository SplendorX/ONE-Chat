import {
  Sun, Moon, LogOut, Copy, Shield, Bell, CreditCard, ChevronRight, Check,
  Loader2, RefreshCw, AlertTriangle, Camera, Crown, Lock, Eye, EyeOff,
  BellOff, Smartphone, X, ExternalLink,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { User, Theme } from '../types';
import { formatUSDC } from '../lib/utils';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWalletBalance, provisionWallet, subscribeToPro } from '../lib/api';
import { supabase } from '../lib/supabase';

interface ProfileViewProps {
  user: User; session: Session; theme: Theme;
  onThemeToggle: () => void; onSignOut: () => void;
  onAvatarUpdate?: (url: string) => void;
  onProUpgrade?: () => void;
}

type Panel = null | 'notifications' | 'privacy' | 'subscription';

export function ProfileView({
  user, session, theme, onThemeToggle, onSignOut, onAvatarUpdate, onProUpgrade,
}: ProfileViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [walletProvisioning, setWalletProvisioning] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification prefs (stored in Supabase profiles)
  const [notifPayments, setNotifPayments] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifChannels, setNotifChannels] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // Pro subscription
  const [proUpgrading, setProUpgrading] = useState(false);
  const [proError, setProError] = useState('');
  const [proSuccess, setProSuccess] = useState(false);

  useEffect(() => {
    getWalletBalance()
      .then(({ balance: b, address }) => { setBalance(b); setWalletAddress(address); })
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false));
    // Load notification prefs
    void supabase.from('profiles').select('notification_prefs').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        const prefs = data?.notification_prefs as Record<string, boolean> | null;
        if (prefs) {
          setNotifPayments(prefs.payments ?? true);
          setNotifMessages(prefs.messages ?? true);
          setNotifChannels(prefs.channels ?? true);
        }
      });
  }, [session]);

  async function retryWallet() {
    setWalletProvisioning(true); setWalletError(null);
    try {
      await provisionWallet();
      const { balance: b, address } = await getWalletBalance();
      setBalance(b); setWalletAddress(address);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet setup failed');
    } finally { setWalletProvisioning(false); }
  }

  async function saveNotifications() {
    setNotifSaving(true);
    await supabase.from('profiles').upsert({
      id: session.user.id,
      notification_prefs: { payments: notifPayments, messages: notifMessages, channels: notifChannels },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    setNotifSaving(false);
    setActivePanel(null);
  }

  async function handleProUpgrade() {
    setProUpgrading(true); setProError('');
    try {
      await subscribeToPro();
      setProSuccess(true);
      onProUpgrade?.();
      setTimeout(() => setActivePanel(null), 2000);
    } catch (err) {
      setProError(err instanceof Error ? err.message : 'Upgrade failed');
    } finally { setProUpgrading(false); }
  }

  function copyOneId() {
    navigator.clipboard.writeText(user.oneId).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).catch(() => {});
    setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 2000);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB'); return; }
    setAvatarUploading(true); setAvatarError('');
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${session.user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').upsert({
        id: session.user.id, avatar_url: publicUrl, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      setAvatarUrl(publicUrl);
      onAvatarUpdate?.(publicUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>You</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
        {/* Profile card */}
        <div className="rounded-3xl p-5 text-center border"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
          <div className="relative w-20 h-20 mx-auto mb-3">
            {avatarUrl
              ? <img src={avatarUrl} alt={user.displayName} className="w-20 h-20 rounded-full object-cover" />
              : <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{user.initials}</div>
            }
            <button onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.45)' }} title="Change photo">
              {avatarUploading
                ? <Loader2 size={18} className="animate-spin" style={{ color: 'white' }} />
                : <Camera size={18} style={{ color: 'white' }} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { void handleAvatarChange(e); }} />
          </div>
          {avatarError && <p className="text-xs mb-1" style={{ color: 'var(--danger)' }}>{avatarError}</p>}
          <div className="text-xl font-bold mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {user.displayName}
          </div>
          <button onClick={copyOneId}
            className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-full text-sm transition-all"
            style={{ color: 'var(--muted)', background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            {user.oneId}
            {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
          </button>
          {user.isPro && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <Crown size={13} style={{ color: '#C4A265' }} />
              <span className="text-xs font-semibold" style={{ color: '#C4A265' }}>ONE Pro</span>
            </div>
          )}
        </div>

        {/* Wallet card */}
        <div className="rounded-2xl p-4 border" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>USDC BALANCE</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Arc Network</span>
          </div>
          <div className="text-3xl font-bold tabular-nums mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            {balanceLoading
              ? <Loader2 size={20} className="animate-spin inline" style={{ color: 'var(--muted)' }} />
              : balance !== null ? `$${formatUSDC(parseFloat(balance))}` : '—'}
            {!balanceLoading && balance !== null && <span className="text-base font-normal ml-1" style={{ color: 'var(--muted)' }}>USDC</span>}
          </div>
          {!walletAddress && !balanceLoading && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--warning, #b45309)' }}>
                <AlertTriangle size={12} /> Wallet not set up
              </div>
              {walletError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{walletError}</p>}
              <button onClick={() => { void retryWallet(); }} disabled={walletProvisioning}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
                style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                {walletProvisioning
                  ? <><Loader2 size={11} className="animate-spin" /> Setting up…</>
                  : <><RefreshCw size={11} /> Set up wallet</>}
              </button>
            </div>
          )}
          {walletAddress && (
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-xs font-mono truncate flex-1" style={{ color: 'var(--muted)' }}>{walletAddress}</p>
              <button onClick={copyAddress} className="flex-shrink-0 p-1 rounded-lg"
                style={{ color: copiedAddress ? 'var(--success)' : 'var(--muted)', background: 'var(--surface-muted)' }}>
                {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <a href={`https://explorer.arc.io/address/${walletAddress}`} target="_blank" rel="noreferrer"
                className="flex-shrink-0 p-1 rounded-lg" style={{ color: 'var(--muted)', background: 'var(--surface-muted)' }}>
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        {/* Pro upgrade CTA */}
        {!user.isPro && (
          <button onClick={() => setActivePanel('subscription')}
            className="w-full rounded-2xl p-4 text-left transition-all"
            style={{ background: 'linear-gradient(135deg,#302B26,#4a4238)', border: '1px solid rgba(196,162,101,0.3)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(196,162,101,0.2)' }}>
                <Crown size={18} style={{ color: '#C4A265' }} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: 'white' }}>Upgrade to ONE Pro</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Full ALLIE AI · Advanced features · $5/month
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </button>
        )}

        {/* Settings list */}
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => setActivePanel(activePanel === 'notifications' ? null : 'notifications')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all"
            style={{ background: 'var(--surface-strong)', color: 'var(--ink)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-muted)' }}>
              <Bell size={15} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Notifications</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {[notifPayments && 'payments', notifMessages && 'messages', notifChannels && 'channels'].filter(Boolean).join(', ') || 'All muted'}
              </div>
            </div>
            <ChevronRight size={15} className={`transition-transform ${activePanel === 'notifications' ? 'rotate-90' : ''}`} style={{ color: 'var(--muted)' }} />
          </button>

          <AnimatePresence>
            {activePanel === 'notifications' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="px-4 py-3 space-y-3" style={{ background: 'var(--surface-muted)' }}>
                  {[
                    { label: 'Payment received', icon: CreditCard, value: notifPayments, set: setNotifPayments },
                    { label: 'New messages', icon: Smartphone, value: notifMessages, set: setNotifMessages },
                    { label: 'Channel posts', icon: Bell, value: notifChannels, set: setNotifChannels },
                  ].map(({ label, icon: Icon, value, set }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={13} style={{ color: 'var(--muted)' }} />
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>{label}</span>
                      </div>
                      <button onClick={() => set((v) => !v)}
                        className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
                        style={{ background: value ? '#C4A265' : 'var(--border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                          style={{ left: value ? '1.25rem' : '0.125rem' }} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => { void saveNotifications(); }} disabled={notifSaving}
                    className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                    {notifSaving ? 'Saving…' : 'Save preferences'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => setActivePanel(activePanel === 'privacy' ? null : 'privacy')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-t"
            style={{ background: 'var(--surface-strong)', color: 'var(--ink)', borderColor: 'var(--border)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-muted)' }}>
              <Shield size={15} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Privacy & Security</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Encryption, sessions</div>
            </div>
            <ChevronRight size={15} className={`transition-transform ${activePanel === 'privacy' ? 'rotate-90' : ''}`} style={{ color: 'var(--muted)' }} />
          </button>

          <AnimatePresence>
            {activePanel === 'privacy' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="px-4 py-3 space-y-3" style={{ background: 'var(--surface-muted)' }}>
                  {[
                    { icon: Lock, label: 'End-to-end encryption', sub: 'Planned for v2', active: false },
                    { icon: Eye, label: 'Online status visible', sub: 'Others can see when you\'re active', active: true },
                    { icon: EyeOff, label: 'Read receipts', sub: 'Show when you\'ve read messages', active: true },
                    { icon: BellOff, label: 'Blocked users', sub: 'Manage blocked accounts', active: false },
                  ].map(({ icon: Icon, label, sub, active }) => (
                    <div key={label} className="flex items-start gap-3 py-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: active ? 'var(--success-bg)' : 'var(--surface-strong)' }}>
                        <Icon size={13} style={{ color: active ? 'var(--success)' : 'var(--muted)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => {
                    void supabase.auth.signOut().then(() => {
                      supabase.auth.getSession().catch(() => {});
                    });
                  }}
                    className="w-full py-2 rounded-xl text-xs font-semibold border transition-all"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}>
                    Sign out all devices
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => setActivePanel(activePanel === 'subscription' ? null : 'subscription')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-t"
            style={{ background: 'var(--surface-strong)', color: 'var(--ink)', borderColor: 'var(--border)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-muted)' }}>
              <CreditCard size={15} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Subscription</div>
              <div className="text-xs" style={{ color: user.isPro ? '#C4A265' : 'var(--muted)' }}>
                {user.isPro ? '✦ ONE Pro — active' : 'Free plan'}
              </div>
            </div>
            <ChevronRight size={15} className={`transition-transform ${activePanel === 'subscription' ? 'rotate-90' : ''}`} style={{ color: 'var(--muted)' }} />
          </button>

          <AnimatePresence>
            {activePanel === 'subscription' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="px-4 py-4" style={{ background: 'var(--surface-muted)' }}>
                  {user.isPro ? (
                    <div className="text-center py-2">
                      <Crown size={28} className="mx-auto mb-2" style={{ color: '#C4A265' }} />
                      <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>You're on ONE Pro</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>Full ALLIE AI access · Advanced features</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {proSuccess ? (
                        <div className="text-center py-2">
                          <Check size={28} className="mx-auto mb-2" style={{ color: 'var(--success)' }} />
                          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Welcome to ONE Pro!</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {[
                              'Full ALLIE AI responses',
                              'Priority message delivery',
                              'Advanced payment analytics',
                              'Premium channel content',
                            ].map((feature) => (
                              <div key={feature} className="flex items-center gap-2 text-sm">
                                <Check size={13} style={{ color: '#C4A265', flexShrink: 0 }} />
                                <span style={{ color: 'var(--ink)' }}>{feature}</span>
                              </div>
                            ))}
                          </div>
                          {proError && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{proError}</p>}
                          <button onClick={() => { void handleProUpgrade(); }} disabled={proUpgrading}
                            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
                            style={{ background: 'linear-gradient(135deg,#C4A265,#8B6F3E)', color: '#fff' }}>
                            {proUpgrading
                              ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Processing…</span>
                              : 'Upgrade for $5 USDC/month'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme toggle */}
        <button onClick={onThemeToggle}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
          style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-muted)' }}>
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
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--danger-bg)' }}>
            <LogOut size={15} style={{ color: 'var(--danger)' }} />
          </div>
          <span className="flex-1 text-sm font-medium text-left">Sign out</span>
        </button>
      </div>
    </div>
  );
}
