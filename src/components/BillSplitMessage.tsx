import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Check, Loader2, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { post, get } from '../lib/api';

interface Contribution { user_id: string; state: string; amount: string; }
interface SplitData {
  id: string; title: string; total_amount: string; per_person_amount: string;
  created_by: string; bill_split_contributions: Contribution[];
}

interface BillSplitMessageProps {
  splitId: string;
  title: string;
  totalAmount: string;
  perPersonAmount: string;
  memberCount: number;
  session: Session;
}

export function BillSplitMessage({ splitId, title, totalAmount, perPersonAmount, memberCount, session }: BillSplitMessageProps) {
  const [split, setSplit] = useState<SplitData | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState('');

  const myId = session.user.id;
  const myContrib = split?.bill_split_contributions.find((c) => c.user_id === myId);
  const paidCount = split?.bill_split_contributions.filter((c) => c.state === 'PAID').length ?? 0;
  const totalContribs = split?.bill_split_contributions.length ?? (memberCount - 1);

  useEffect(() => {
    void get<{ split: SplitData }>(`/payment/bill-split/${splitId}`)
      .then(({ split: s }) => {
        setSplit(s);
        if (s.bill_split_contributions.find((c) => c.user_id === myId)?.state === 'PAID') setPaid(true);
      })
      .catch(() => { /* ignore */ });
  }, [splitId, myId]);

  async function handlePay() {
    setPaying(true); setError('');
    try {
      await post(`/payment/bill-split/${splitId}/pay`, {});
      setPaid(true);
      // Refresh
      const { split: s } = await get<{ split: SplitData }>(`/payment/bill-split/${splitId}`);
      setSplit(s);
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment failed'); }
    finally { setPaying(false); }
  }

  const isCreator = split?.created_by === myId;
  const alreadyPaid = paid || myContrib?.state === 'PAID';

  return (
    <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      style={{ background: 'var(--surface-card)', border: '1.5px solid var(--gold)', borderRadius: 16, padding: 16, maxWidth: 280, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Receipt size={15} color="var(--bg)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bill split</div>
        </div>
      </div>

      {/* Amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '10px 12px', background: 'var(--surface-muted)', borderRadius: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 1 }}>Your share</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>${parseFloat(perPersonAmount).toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 1 }}>Total</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>${parseFloat(totalAmount).toFixed(2)}</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
        <Users size={12} />
        <span>{paidCount}/{totalContribs} paid</span>
        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginLeft: 4 }}>
          <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 99, width: totalContribs > 0 ? `${(paidCount / totalContribs) * 100}%` : '0%', transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Error */}
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: 'var(--danger-bg)', borderRadius: 8 }}>{error}</div>}

      {/* Action */}
      {isCreator ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '6px 0' }}>You created this split</div>
      ) : alreadyPaid ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>
          <Check size={16} />Paid
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => void handlePay()} disabled={paying}
          style={{ width: '100%', padding: '11px 0', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: paying ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {paying ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Sending…</> : `Pay $${parseFloat(perPersonAmount).toFixed(2)} USDC`}
        </motion.button>
      )}
    </motion.div>
  );
}
