import { useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { getPushState, enablePush, disablePush, type PushState } from '../lib/push';

/** Turns browser push notifications on or off for this device. */
export function PushToggle() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getPushState().then((s) => { if (active) setState(s); });
    return () => { active = false; };
  }, []);

  async function toggle() {
    setBusy(true); setError('');
    try {
      if (state === 'enabled') {
        await disablePush();
        setState('disabled');
      } else {
        await enablePush();
        setState('enabled');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change notification setting');
      setState(await getPushState());
    } finally { setBusy(false); }
  }

  const on = state === 'enabled';
  const unavailable = state === 'unsupported' || state === 'denied';
  const hint = state === 'unsupported'
    ? 'Not supported in this browser'
    : state === 'denied'
      ? 'Blocked. Allow notifications for this site in your browser settings.'
      : on ? 'You will get alerts even when the app is closed' : 'Get alerts for payments, requests and messages';

  return (
    <div className="pb-3 mb-1 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BellRing size={14} style={{ color: 'var(--gold)' }} />
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Push notifications</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</div>
          </div>
        </div>
        <button onClick={() => void toggle()} disabled={busy || unavailable || state === 'loading'}
          aria-label="Toggle push notifications"
          className="relative w-10 h-5 rounded-full transition-all flex-shrink-0 disabled:opacity-40"
          style={{ background: on ? '#C4A265' : 'var(--border)', border: 'none', cursor: unavailable ? 'not-allowed' : 'pointer' }}>
          {busy
            ? <Loader2 size={12} className="animate-spin absolute top-1 left-4" style={{ color: 'var(--ink)' }} />
            : <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm" style={{ left: on ? '1.25rem' : '0.125rem' }} />}
        </button>
      </div>
      {error && <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}
