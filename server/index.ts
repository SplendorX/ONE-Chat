/**
 * One Chat — API Server
 * Runs on port 3001. Vite proxies /api/* → http://localhost:3001/*
 *
 * Responsibilities:
 *  - Validate Supabase JWT on every protected route
 *  - Provision Circle developer-controlled wallets per user
 *  - Execute USDC transfers via Circle SDK (never from the frontend)
 *  - Resolve ONE identities to verified wallet addresses
 *  - Return balance from Circle (not from the frontend)
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ── Env ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const BLOCKCHAIN = 'ARC-TESTNET';

// Validate required env
const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CIRCLE_API_KEY', 'CIRCLE_ENTITY_SECRET']
  .filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[server] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────
// Service-role client — bypasses RLS for server-side writes
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const circleSdk = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

// ── App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  const token = auth.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  res.locals.userId = data.user.id;
  res.locals.userEmail = data.user.email;
  next();
}

// ── Health ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ── ONE identity: check availability ─────────────────────────────────
app.get('/identity/check/:handle', async (req, res) => {
  const handle = req.params.handle.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!handle || handle.length < 3 || handle.length > 24) {
    res.status(400).json({ available: false, error: 'Handle must be 3–24 lowercase alphanumeric characters' });
    return;
  }
  const RESERVED = ['admin', 'allie', 'onechat', 'support', 'help', 'system', 'root', 'circle', 'arc'];
  if (RESERVED.includes(handle)) {
    res.json({ available: false, reason: 'reserved' });
    return;
  }
  const { data } = await supabaseAdmin
    .from('one_identities')
    .select('handle')
    .eq('handle', handle)
    .maybeSingle();
  res.json({ available: !data });
});

// ── ONE identity: claim ───────────────────────────────────────────────
app.post('/identity/claim', requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const { handle } = req.body as { handle?: string };
  if (!handle || !/^[a-z0-9]{3,24}$/.test(handle)) {
    res.status(400).json({ error: 'Invalid handle format' });
    return;
  }
  // Check not already claimed by this user
  const { data: existing } = await supabaseAdmin
    .from('one_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    res.status(409).json({ error: 'You already have a ONE identity' });
    return;
  }
  // Atomic insert — unique constraint prevents races
  const { error } = await supabaseAdmin
    .from('one_identities')
    .insert({ user_id: userId, handle });
  if (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'That identity was just claimed. Please choose another.' });
    } else {
      res.status(500).json({ error: error.message });
    }
    return;
  }
  res.json({ success: true, identity: `${handle}.one` });
});

// ── Wallet: provision (idempotent) ────────────────────────────────────
app.post('/wallet/provision', requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;

  // Idempotent — return existing wallet if already provisioned
  const { data: existing } = await supabaseAdmin
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    res.json({ wallet: existing });
    return;
  }

  try {
    // Create wallet set for this user
    const wsRes = await circleSdk.createWalletSet({
      name: `one-chat-user-${userId}`,
    });
    const walletSetId = wsRes.data?.walletSet?.id;
    if (!walletSetId) throw new Error('No walletSetId returned');

    // Create one EOA wallet on Arc Testnet
    const wRes = await circleSdk.createWallets({
      accountType: 'EOA',
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId,
    });
    const wallet = wRes.data?.wallets?.[0];
    if (!wallet) throw new Error('No wallet returned');

    // Persist to Supabase (service role bypasses RLS)
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('wallets')
      .insert({
        user_id: userId,
        circle_wallet_id: wallet.id,
        circle_wallet_set_id: walletSetId,
        address: wallet.address,
        blockchain: BLOCKCHAIN,
        status: wallet.state ?? 'LIVE',
      })
      .select()
      .single();
    if (saveErr) throw saveErr;

    res.json({ wallet: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[wallet/provision]', msg);
    res.status(500).json({ error: msg });
  }
});

// ── Wallet: get balance ───────────────────────────────────────────────
app.get('/wallet/balance', requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('circle_wallet_id, address')
    .eq('user_id', userId)
    .maybeSingle();
  if (!wallet) {
    res.json({ balance: '0', address: null });
    return;
  }
  try {
    const balRes = await circleSdk.getWalletTokenBalance({ id: wallet.circle_wallet_id });
    const balances = balRes.data?.tokenBalances ?? [];
    // Find USDC balance
    const usdc = balances.find(
      (b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
    );
    res.json({ balance: usdc?.amount ?? '0', address: wallet.address, allBalances: balances });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Resolve ONE identity to wallet address ────────────────────────────
app.get('/identity/resolve/:handle', requireAuth, async (req, res) => {
  const handle = req.params.handle.toLowerCase().replace(/\.one$/, '');
  const { data: identity } = await supabaseAdmin
    .from('one_identities')
    .select('user_id, handle, profiles(display_name, avatar_url)')
    .eq('handle', handle)
    .maybeSingle();
  if (!identity) {
    res.status(404).json({ error: 'Identity not found' });
    return;
  }
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('circle_wallet_id, address')
    .eq('user_id', identity.user_id)
    .maybeSingle();
  res.json({
    handle: `${identity.handle}.one`,
    userId: identity.user_id,
    profile: (identity as { profiles?: { display_name?: string; avatar_url?: string | null } }).profiles,
    address: wallet?.address ?? null,
    circleWalletId: wallet?.circle_wallet_id ?? null,
  });
});

// ── Send USDC ─────────────────────────────────────────────────────────
app.post('/payment/send', requireAuth, async (req, res) => {
  const senderId = res.locals.userId as string;
  const { recipientHandle, amount, conversationId, note } = req.body as {
    recipientHandle?: string;
    amount?: string;
    conversationId?: string;
    note?: string;
  };

  if (!recipientHandle || !amount || !conversationId) {
    res.status(400).json({ error: 'recipientHandle, amount, and conversationId are required' });
    return;
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0 || amountNum > 10000) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  const handle = recipientHandle.toLowerCase().replace(/\.one$/, '');

  try {
    // 1. Resolve recipient
    const { data: identity } = await supabaseAdmin
      .from('one_identities')
      .select('user_id, handle')
      .eq('handle', handle)
      .maybeSingle();
    if (!identity) {
      res.status(404).json({ error: `Identity ${handle}.one not found` });
      return;
    }
    if (identity.user_id === senderId) {
      res.status(400).json({ error: 'You cannot send to yourself' });
      return;
    }

    // 2. Get sender wallet
    const { data: senderWallet } = await supabaseAdmin
      .from('wallets')
      .select('circle_wallet_id')
      .eq('user_id', senderId)
      .maybeSingle();
    if (!senderWallet) {
      res.status(400).json({ error: 'Sender wallet not provisioned' });
      return;
    }

    // 3. Get recipient wallet address
    const { data: recipientWallet } = await supabaseAdmin
      .from('wallets')
      .select('address, circle_wallet_id')
      .eq('user_id', identity.user_id)
      .maybeSingle();
    if (!recipientWallet) {
      res.status(400).json({ error: 'Recipient has no wallet yet' });
      return;
    }

    // 4. Get USDC token address from balance (needed for transfer)
    const balRes = await circleSdk.getWalletTokenBalance({ id: senderWallet.circle_wallet_id });
    const usdcToken = (balRes.data?.tokenBalances ?? []).find(
      (b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
    );
    if (!usdcToken?.token?.id) {
      res.status(400).json({ error: 'USDC token not found in sender wallet' });
      return;
    }

    // 5. Idempotency key — stored to prevent duplicate transfers
    const idempotencyKey = randomUUID();

    // 6. Create Circle transaction
    const txRes = await circleSdk.createTransaction({
      walletId: senderWallet.circle_wallet_id,
      tokenId: usdcToken.token.id,
      destinationAddress: recipientWallet.address,
      amounts: [amount],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey,
    });
    const circleTxId = txRes.data?.id;
    if (!circleTxId) throw new Error('No transaction ID from Circle');

    // 7. Persist transaction record (service role)
    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .insert({
        circle_transaction_id: circleTxId,
        sender_id: senderId,
        recipient_id: identity.user_id,
        amount: amountNum,
        asset: 'USDC',
        blockchain: BLOCKCHAIN,
        state: 'INITIATED',
        conversation_id: conversationId,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    // 8. Post a payment message into the conversation
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      type: 'payment',
      content: note ?? null,
      metadata: {
        transactionId: tx?.id,
        circleTransactionId: circleTxId,
        amount,
        asset: 'USDC',
        recipientHandle: `${identity.handle}.one`,
        state: 'INITIATED',
      },
    });

    res.json({ success: true, transactionId: tx?.id, circleTxId, state: 'INITIATED' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payment/send]', msg);
    res.status(500).json({ error: msg });
  }
});

// ── Transaction status poll ───────────────────────────────────────────
app.get('/payment/status/:txId', requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const { data: tx } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', req.params.txId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .maybeSingle();
  if (!tx) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  if (!tx.circle_transaction_id) {
    res.json({ transaction: tx });
    return;
  }
  try {
    const circleTx = await circleSdk.getTransaction({ id: tx.circle_transaction_id });
    const state = circleTx.data?.transaction?.state ?? tx.state;
    const txHash = circleTx.data?.transaction?.txHash ?? tx.tx_hash;

    // Update state in DB if changed
    if (state !== tx.state) {
      await supabaseAdmin
        .from('transactions')
        .update({ state, tx_hash: txHash, updated_at: new Date().toISOString() })
        .eq('id', tx.id);
      // Also update the message metadata
      if (tx.message_id) {
        const { data: msg } = await supabaseAdmin
          .from('messages')
          .select('metadata')
          .eq('id', tx.message_id)
          .maybeSingle();
        if (msg) {
          await supabaseAdmin
            .from('messages')
            .update({ metadata: { ...(msg.metadata as object), state, txHash } })
            .eq('id', tx.message_id);
        }
      }
    }
    res.json({ transaction: { ...tx, state, tx_hash: txHash } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Static frontend (production) ─────────────────────────────────────
// In development the Vite dev server handles the frontend.
// In production (Docker / HF Spaces) we serve the Vite build from /dist.
const distPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — all non-API routes return index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[one-chat-api] listening on :${PORT}`);
});
