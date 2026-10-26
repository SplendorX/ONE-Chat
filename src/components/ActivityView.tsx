import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowDownLeft, ArrowUpRight, Gift, Clock, Loader2 } from 'lucide-react';
import type { User } from '../types';
import { supabase } from '../lib/supabase';
import { getWalletBalance } from '../lib/api';
import { formatTime, formatUSDC } from '../lib/utils';

interface ActivityViewProps {
  user: User;
  session: Session;
}

interface TxRow {
  id: string;
  circle_transaction_id: string | null;
  sender_id: string | null;
  recipient_id: string | null;
  amount: string;
  asset: string;
  state: string;
  tx_hash: string | null;
  created_at: string;
}

export function ActivityView({ user, session }: ActivityViewProps) {
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const userId = session.user.id;
      const [txRes, balRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, circle_transaction_id, sender_id, recipient_id, amount, asset, state, tx_hash, created_at')
          .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(50),
        getWalletBalance().catch(() => ({ balance: null, address: null })),
      ]);
      setTxs((txRes.data as TxRow[]) ?? []);
      setBalance(balRes.balance);
      setLoading(false);
    }
    void load();
  }, [session]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Activity</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Payments, requests, and transfers</p>
      </div>

      {/* Balance card */}
      <div className="mx-4 mt-4 mb-2 p-4 rounded-2xl border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-medium mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>USDC Balance</p>
        <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {loading
            ? <Loader2 size={20} className="animate-spin inline" style={{ color: 'var(--muted)' }} />
            : balance !== null ? `$${formatUSDC(parseFloat(balance))}` : '—'
          }
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{user.oneId} · Arc Testnet</p>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-y-auto pb-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        )}

        {!loading && txs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Clock size={24} style={{ color: 'var(--muted)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No transactions yet</p>
            <p className="text-xs text-center px-8" style={{ color: 'var(--subtle)' }}>
              Send USDC from a conversation to see your activity here.
            </p>
          </div>
        )}

        {txs.map((tx) => {
          const isSent = tx.sender_id === session.user.id;
          const stateColor = tx.state === 'COMPLETE' ? 'var(--success)'
            : tx.state === 'FAILED' || tx.state === 'DENIED' ? 'var(--danger)'
            : 'var(--muted)';
          return (
            <div key={tx.id} className="flex items-center gap-3 px-5 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: isSent ? 'rgba(201,75,69,0.1)' : 'rgba(39,132,91,0.1)' }}>
                {tx.asset === 'GIFT'
                  ? <Gift size={16} style={{ color: 'var(--muted)' }} />
                  : isSent
                  ? <ArrowUpRight size={16} style={{ color: 'var(--danger)' }} />
                  : <ArrowDownLeft size={16} style={{ color: 'var(--success)' }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {isSent ? 'Sent USDC' : 'Received USDC'}
                </div>
                <div className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: stateColor }} />
                  {tx.state === 'COMPLETE' ? 'Confirmed' : tx.state === 'FAILED' ? 'Failed' : 'Processing'}
                  {' · '}
                  {formatTime(new Date(tx.created_at))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold tabular-nums" style={{ color: isSent ? 'var(--danger)' : 'var(--success)' }}>
                  {isSent ? '-' : '+'}${formatUSDC(parseFloat(tx.amount))}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{tx.asset}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
