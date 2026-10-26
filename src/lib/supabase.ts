import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ── Types matching the DB schema ──────────────────────────────────────

export interface DbProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_pro: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbOneIdentity {
  id: string;
  user_id: string;
  handle: string;
  claimed_at: string;
}

export interface DbWallet {
  id: string;
  user_id: string;
  circle_wallet_id: string;
  circle_wallet_set_id: string;
  address: string;
  blockchain: string;
  status: string;
  created_at: string;
}

export interface DbConversation {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  type: 'text' | 'payment' | 'payment_request' | 'bill_split' | 'savings_goal' | 'gift' | 'system';
  content: string | null;
  metadata: Record<string, unknown> | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface DbTransaction {
  id: string;
  circle_transaction_id: string | null;
  sender_id: string | null;
  recipient_id: string | null;
  amount: string;
  asset: string;
  blockchain: string;
  state: string;
  tx_hash: string | null;
  message_id: string | null;
  conversation_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}
