import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, ArrowUpRight, Copy, Check } from 'lucide-react';

interface PaymentReceiptProps {
  isOwn: boolean;
  amount: string;
  asset: string;
  recipientHandle: string;
  state: string;
  note?: string;
  transactionId?: string;
  circleTxId?: string;
  createdAt: Date;
  senderName: string;
  senderAvatar?: string;
}

function shortId(id: string) {
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '';
}

export function PaymentReceipt({
  isOwn, amount, asset, recipientHandle, state, note,
  transactionId, circleTxId, createdAt, senderName, senderAvatar,
}: PaymentReceiptProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSuccess = ['CONFIRMED', 'COMPLETE', 'SENT'].includes(state);
  const isFailed  = ['FAILED', 'DENIED', 'CANCELLED'].includes(state);
  const isPending = !isSuccess && !isFailed;

  function copy(val: string) {
    navigator.clipboard.writeText(val).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  const statusColor  = isSuccess ? '#22c55e' : isFailed ? 'var(--danger)' : '#f59e0b';
  const statusBg     = isSuccess ? 'rgba(34,197,94,0.08)' : isFailed ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
  const statusLabel  = isSuccess ? 'Confirmed' : isFailed ? 'Failed' : 'Pending';
  const StatusIcon   = isSuccess ? CheckCircle2 : isFailed ? XCircle : Clock;

  // Gold gradient for confirmed own payments
  const cardBg = isOwn && isSuccess
    ? 'linear-gradient(145deg, #1e1a15 0%, #2a2318 100%)'
    : isOwn
    ? 'var(--ink)'
    : 'var(--surface-card)';

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} my-2 w-full`}>
      <div style={{ maxWidth: 300, width: '100%' }}>
        {/* Sender label for incoming */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1 pl-1">
            {senderAvatar
              ? <img src={senderAvatar} alt={senderName} className="w-4 h-4 rounded-full object-cover" />
              : <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--ink)', color: 'var(--bg)', fontSize: 9 }}>
                  {(senderName || '?').slice(0, 1).toUpperCase()}
                </div>
            }
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{senderName}</span>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            background: cardBg,
            border: `1px solid ${isOwn && isSuccess ? 'rgba(196,162,101,0.25)' : 'var(--border)'}`,
            borderRadius: 20,
            overflow: 'hidden',
          }}>

          {/* Top stripe — gold accent for confirmed */}
          {isOwn && isSuccess && (
            <div style={{ height: 3, background: 'linear-gradient(90deg, #C4A265, #e8c87a, #C4A265)' }} />
          )}

          <div style={{ padding: '16px 18px' }}>
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: isOwn ? 'rgba(196,162,101,0.15)' : 'var(--surface-muted)' }}>
                  {/* USDC coin icon */}
                  <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#2775CA"/>
                    <path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.233-2.193-.7-2.193-1.518 0-.817.607-1.352 1.828-1.352 1.1 0 1.708.366 2.008 1.284a.39.39 0 0 0 .366.245h.853a.37.37 0 0 0 .368-.37v-.054a3.072 3.072 0 0 0-2.736-2.537v-1.4a.37.37 0 0 0-.37-.368h-.852a.37.37 0 0 0-.368.369v1.358c-1.648.244-2.684 1.328-2.684 2.74 0 2.002 1.22 2.79 3.78 3.095 1.708.245 2.253.673 2.253 1.582 0 .908-.79 1.543-1.89 1.543-1.463 0-1.95-.613-2.13-1.43a.38.38 0 0 0-.367-.305h-.9a.368.368 0 0 0-.366.368v.054c.244 1.46 1.22 2.52 3.23 2.818v1.4c0 .2.168.368.368.368h.852a.37.37 0 0 0 .37-.368v-1.4c1.648-.244 2.744-1.4 2.744-2.867z" fill="white"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: isOwn ? 'rgba(196,162,101,0.8)' : 'var(--muted)', letterSpacing: '0.06em' }}>
                  {isOwn ? 'You sent' : 'Payment received'}
                </span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: statusBg, border: `1px solid ${statusColor}22` }}>
                <StatusIcon size={11} color={statusColor} />
                <span className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-3">
              <div className="flex items-baseline gap-1.5">
                <span style={{ fontSize: 32, fontWeight: 800, color: isOwn ? '#C4A265' : 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  ${parseFloat(amount).toFixed(2)}
                </span>
                <span className="text-sm font-semibold" style={{ color: isOwn ? 'rgba(196,162,101,0.6)' : 'var(--muted)' }}>
                  {asset}
                </span>
              </div>
              {recipientHandle && (
                <div className="text-xs mt-1" style={{ color: isOwn ? 'rgba(255,255,255,0.4)' : 'var(--muted)' }}>
                  {isOwn ? 'to' : 'from'} <span className="font-medium" style={{ color: isOwn ? 'rgba(255,255,255,0.65)' : 'var(--ink)' }}>
                    {recipientHandle.includes('0x') ? shortId(recipientHandle) : `@${recipientHandle}`}
                  </span>
                </div>
              )}
            </div>

            {/* Note */}
            {note && (
              <div className="px-3 py-2 rounded-xl mb-3"
                style={{ background: isOwn ? 'rgba(255,255,255,0.06)' : 'var(--surface-muted)' }}>
                <span className="text-xs italic" style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : 'var(--muted)' }}>
                  "{note}"
                </span>
              </div>
            )}

            {/* Timestamp + expand toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: isOwn ? 'rgba(255,255,255,0.3)' : 'var(--subtle)' }}>
                {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {(transactionId || circleTxId) && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: isOwn ? 'rgba(196,162,101,0.6)' : 'var(--muted)', padding: 0 }}>
                  Receipt {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              )}
            </div>
          </div>

          {/* Expandable receipt details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}>
                <div style={{
                  padding: '12px 18px 16px',
                  borderTop: `1px solid ${isOwn ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`,
                  background: isOwn ? 'rgba(0,0,0,0.2)' : 'var(--surface-muted)',
                }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-3"
                    style={{ color: isOwn ? 'rgba(196,162,101,0.6)' : 'var(--muted)', letterSpacing: '0.08em' }}>
                    Transaction details
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Amount', value: `$${parseFloat(amount).toFixed(6)} ${asset}` },
                      { label: 'Network', value: 'Arc Testnet' },
                      { label: 'Status', value: statusLabel },
                      transactionId ? { label: 'Tx ID', value: shortId(transactionId), full: transactionId } : null,
                      circleTxId ? { label: 'Circle ID', value: shortId(circleTxId), full: circleTxId } : null,
                    ].filter(Boolean).map((row) => {
                      const r = row as { label: string; value: string; full?: string };
                      return (
                        <div key={r.label} className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: isOwn ? 'rgba(255,255,255,0.35)' : 'var(--muted)' }}>
                            {r.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium font-mono"
                              style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : 'var(--ink)' }}>
                              {r.value}
                            </span>
                            {r.full && (
                              <button
                                onClick={() => copy(r.full!)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isOwn ? 'rgba(196,162,101,0.5)' : 'var(--muted)' }}>
                                {copied ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* View on explorer */}
                  {circleTxId && (
                    <a
                      href={`https://explorer.arc.io/tx/${circleTxId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 mt-3 text-xs font-medium"
                      style={{ color: isOwn ? '#C4A265' : 'var(--gold)', textDecoration: 'none' }}>
                      View on explorer <ArrowUpRight size={11} />
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
