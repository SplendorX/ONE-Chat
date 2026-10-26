/**
 * Lazy singleton clients — only instantiated on first use so a missing
 * env var produces a clear 500 from checkEnv() instead of a cold-start crash.
 */
import { createClient } from '@supabase/supabase-js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

export const BLOCKCHAIN = 'ARC-TESTNET';

export function checkEnv(): string | null {
  const missing = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'CIRCLE_API_KEY',
    'CIRCLE_ENTITY_SECRET',
  ].filter((k) => !process.env[k]);
  return missing.length
    ? `Server misconfigured — missing env vars: ${missing.join(', ')}`
    : null;
}

let _supabase: ReturnType<typeof createClient> | null = null;
export function getSupabaseAdmin() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _supabase;
}

let _circle: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;
export function getCircleSdk() {
  if (!_circle) {
    _circle = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
  }
  return _circle;
}
