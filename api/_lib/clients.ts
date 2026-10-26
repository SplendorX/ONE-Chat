/**
 * Shared server-side clients for all Vercel API functions.
 * Instantiated lazily so a missing env var returns a clear 500 error
 * instead of crashing the function at cold-start with no message.
 */
import { createClient } from '@supabase/supabase-js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

export const BLOCKCHAIN = 'ARC-TESTNET';

// Validate env vars and return a human-readable error if any are missing.
export function checkEnv(): string | null {
  const missing = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'CIRCLE_API_KEY',
    'CIRCLE_ENTITY_SECRET',
  ].filter((k) => !process.env[k]);
  return missing.length
    ? `Server misconfigured: missing env vars: ${missing.join(', ')}`
    : null;
}

export function getSupabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function getCircleSdk() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });
}

// Convenience singletons — only call after checkEnv() returns null.
export const supabaseAdmin = getSupabaseAdmin();
export const circleSdk = getCircleSdk();
