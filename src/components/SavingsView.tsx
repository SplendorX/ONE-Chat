import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PiggyBank, Plus, Target, Trash2, CheckCircle, Clock, TrendingUp, X, Loader2, ChevronRight } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { getSavingsGoals, createSavingsGoal, depositToGoal, deleteGoal } from '../lib/api';
import { formatUSDC } from '../lib/utils';

interface Goal {
  id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  deadline: string | null;
  created_at: string;
  is_completed: boolean;
}

interface SavingsViewProps {
  user: User;
  session: Session;
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, target > 0 ? (current / target) * 100 : 0);
  return (
    <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 99, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ height: '100%', background: 'var(--gold)', borderRadius: 99 }}
      />
    </div>
  );
}

export function SavingsView({ user, session }: SavingsViewProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeposit, setShowDeposit] = useState<Goal | null>(null);
  const [depositAmt, setDepositAmt] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { goals: g } = await getSavingsGoals();
      setGoals(g);
    } catch { setGoals([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim() || !newTarget.trim()) { setError('Name and target are required'); return; }
    const amt = parseFloat(newTarget);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid target amount'); return; }
    setCreating(true); setError('');
    try {
      await createSavingsGoal({ name: newName.trim(), targetAmount: newTarget.trim(), deadline: newDeadline || undefined });
      setNewName(''); setNewTarget(''); setNewDeadline(''); setShowCreate(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create goal'); }
    finally { setCreating(false); }
  }

  async function handleDeposit() {
    if (!showDeposit || !depositAmt.trim()) return;
    const amt = parseFloat(depositAmt);
    if (isNaN(amt) || amt <= 0) return;
    setDepositLoading(true);
    try {
      await depositToGoal(showDeposit.id, depositAmt.trim());
      setShowDeposit(null); setDepositAmt('');
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Deposit failed'); }
    finally { setDepositLoading(false); }
  }

  async function handleDelete(goalId: string) {
    if (!confirm('Delete this savings goal?')) return;
    try {
      await deleteGoal(goalId);
      await load();
    } catch { alert('Failed to delete'); }
  }

  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.current_amount || '0'), 0);
  const totalTarget = goals.reduce((sum, g) => sum + parseFloat(g.target_amount || '0'), 0);
  const completed = goals.filter((g) => g.is_completed).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PiggyBank size={18} color="var(--bg)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Savings</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Track your USDC goals</div>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} />New goal
          </motion.button>
        </div>

        {/* Stats row */}
        {goals.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Total saved', value: `$${totalSaved.toFixed(2)}`, icon: <TrendingUp size={14} /> },
              { label: 'Total target', value: `$${totalTarget.toFixed(2)}`, icon: <Target size={14} /> },
              { label: 'Completed', value: `${completed}/${goals.length}`, icon: <CheckCircle size={14} /> },
            ].map((s) => (
              <div key={s.label} style={{ background: 'var(--surface-card)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold)', marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Goals list */}
      <div style={{ flex: 1, padding: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
          </div>
        ) : goals.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <PiggyBank size={28} color="var(--gold)" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No savings goals yet</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>Set a target and track your USDC progress — vacation, emergency fund, or anything you're saving for.</div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowCreate(true)}
              style={{ padding: '10px 24px', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 20, fontWeight: 600, cursor: 'pointer' }}>
              Create first goal
            </motion.button>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimatePresence>
              {goals.map((goal, i) => {
                const current = parseFloat(goal.current_amount || '0');
                const target = parseFloat(goal.target_amount || '0');
                const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000) : null;
                return (
                  <motion.div key={goal.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.05 }}
                    style={{ background: 'var(--surface-card)', borderRadius: 16, padding: 16, border: goal.is_completed ? '1.5px solid var(--gold)' : '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          {goal.is_completed && <CheckCircle size={14} color="var(--gold)" />}
                          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{goal.name}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10 }}>
                          {daysLeft !== null && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={11} />{daysLeft > 0 ? `${daysLeft}d left` : 'Deadline passed'}
                            </span>
                          )}
                          <span>{pct.toFixed(0)}% complete</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!goal.is_completed && (
                          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowDeposit(goal); setDepositAmt(''); }}
                            style={{ padding: '5px 10px', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            Add
                          </motion.button>
                        )}
                        <motion.button whileTap={{ scale: 0.9 }} onClick={() => void handleDelete(goal.id)}
                          style={{ padding: '5px 8px', background: 'var(--surface-muted)', color: 'var(--muted)', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                          <Trash2 size={12} />
                        </motion.button>
                      </div>
                    </div>
                    <ProgressBar current={current} target={target} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 600 }}>${current.toFixed(2)} saved</span>
                      <span style={{ color: 'var(--muted)' }}>of ${target.toFixed(2)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create goal modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: 'var(--surface-overlay)', borderRadius: '20px 20px 0 0', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>New savings goal</div>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Goal name (e.g. Vacation fund)"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box' }} />
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 14 }}>$</span>
                  <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="Target amount (USDC)" type="number" min="0"
                    style={{ width: '100%', padding: '12px 14px 12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <input value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} type="date"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: newDeadline ? 'var(--ink)' : 'var(--muted)', fontSize: 14, boxSizing: 'border-box' }} />
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => void handleCreate()} disabled={creating}
                  style={{ width: '100%', padding: '14px', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Creating…' : 'Create goal'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit modal */}
      <AnimatePresence>
        {showDeposit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeposit(null); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: 'var(--surface-overlay)', borderRadius: '20px 20px 0 0', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Add to "{showDeposit.name}"</div>
                <button onClick={() => setShowDeposit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
              </div>
              <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
                Progress: ${parseFloat(showDeposit.current_amount).toFixed(2)} / ${parseFloat(showDeposit.target_amount).toFixed(2)}
              </div>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16 }}>$</span>
                <input value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} placeholder="Amount to add" type="number" min="0" autoFocus
                  style={{ width: '100%', padding: '14px 14px 14px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--ink)', fontSize: 15, boxSizing: 'border-box' }} />
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => void handleDeposit()} disabled={depositLoading}
                style={{ width: '100%', padding: '14px', background: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: depositLoading ? 0.7 : 1 }}>
                {depositLoading ? 'Saving…' : 'Record deposit'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
