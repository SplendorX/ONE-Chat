/**
 * One Chat — typed API client
 * Every call attaches the Supabase JWT as a Bearer token.
 * All sensitive operations (wallet, payments, identity) go through
 * the Express backend — never called directly from the frontend.
 */

import { supabase } from './supabase';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// In dev the Vite proxy rewrites /api/* → localhost:3001/*.
// In production VITE_API_URL points directly at the backend (e.g. same origin on port 3001).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

async function get<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(b.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Identity ──────────────────────────────────────────────────────────

export async function checkIdentityAvailable(handle: string): Promise<{ available: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/identity/check/${encodeURIComponent(handle)}`);
  return res.json() as Promise<{ available: boolean; reason?: string }>;
}

export async function claimIdentity(handle: string): Promise<{ success: boolean; identity: string }> {
  return post('/identity/claim', { handle });
}

export async function resolveIdentity(handleOrFull: string) {
  const handle = handleOrFull.replace(/\.one$/, '');
  return get<{
    handle: string;
    userId: string;
    profile: { display_name?: string; avatar_url?: string | null } | null;
    address: string | null;
    circleWalletId: string | null;
  }>(`/identity/resolve/${encodeURIComponent(handle)}`);
}

// ── Wallet ────────────────────────────────────────────────────────────

export async function provisionWallet() {
  return post<{
    wallet: {
      id: string;
      circle_wallet_id: string;
      address: string;
      blockchain: string;
      status: string;
    };
  }>('/wallet/provision', {});
}

export async function getWalletBalance() {
  return get<{ balance: string; address: string | null }>('/wallet/balance');
}

// ── Payments ──────────────────────────────────────────────────────────

export async function sendUsdc(params: {
  recipientHandle: string;
  amount: string;
  conversationId: string;
  note?: string;
}) {
  return post<{ success: boolean; transactionId: string; circleTxId: string; state: string }>(
    '/payment/send',
    params
  );
}

export async function getPaymentStatus(txId: string) {
  return get<{
    transaction: {
      id: string;
      state: string;
      tx_hash: string | null;
      amount: string;
      circle_transaction_id: string | null;
    };
  }>(`/payment/status/${txId}`);
}
