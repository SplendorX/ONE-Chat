/**
 * Vercel catch-all API handler.
 * All /api/* requests land here; we route them manually.
 * This lets us deploy the full stack from a single serverless function.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, circleSdk, BLOCKCHAIN } from './_lib/clients';
import { requireAuth } from './_lib/auth';
import { randomUUID } from 'node:crypto';

const RESERVED = ['admin', 'allie', 'onechat', 'support', 'help', 'system', 'root', 'circle', 'arc'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url = req.url ?? '';
  // Strip the /api prefix that Vercel passes through
  const path = url.replace(/^\/api/, '').split('?')[0];

  // ── GET /health ────────────────────────────────────────────────────
  if (path === '/health') {
    res.json({ ok: true, ts: Date.now() }); return;
  }

  // ── GET /identity/check/:handle ────────────────────────────────────
  const checkMatch = path.match(/^\/identity\/check\/([^/]+)$/);
  if (checkMatch) {
    const raw = checkMatch[1];
    const handle = decodeURIComponent(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!handle || handle.length < 3 || handle.length > 24) {
      res.status(400).json({ available: false, error: 'Handle must be 3–24 lowercase alphanumeric characters' }); return;
    }
    if (RESERVED.includes(handle)) { res.json({ available: false, reason: 'reserved' }); return; }
    const { data } = await supabaseAdmin.from('one_identities').select('handle').eq('handle', handle).maybeSingle();
    res.json({ available: !data }); return;
  }

  // ── POST /identity/claim ───────────────────────────────────────────
  if (path === '/identity/claim' && req.method === 'POST') {
    const user = await requireAuth(req, res); if (!user) return;
    const { handle } = req.body as { handle?: string };
    if (!handle || !/^[a-z0-9]{3,24}$/.test(handle)) { res.status(400).json({ error: 'Invalid handle format' }); return; }
    const { data: existing } = await supabaseAdmin.from('one_identities').select('id').eq('user_id', user.userId).maybeSingle();
    if (existing) { res.status(409).json({ error: 'You already have a ONE identity' }); return; }
    const { error } = await supabaseAdmin.from('one_identities').insert({ user_id: user.userId, handle });
    if (error) {
      res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'That identity was just claimed.' : error.message }); return;
    }
    res.json({ success: true, identity: `${handle}.one` }); return;
  }

  // ── GET /identity/resolve/:handle ──────────────────────────────────
  const resolveMatch = path.match(/^\/identity\/resolve\/([^/]+)$/);
  if (resolveMatch) {
    const user = await requireAuth(req, res); if (!user) return;
    const handle = decodeURIComponent(resolveMatch[1]).toLowerCase().replace(/\.one$/, '');
    const { data: identity } = await supabaseAdmin
      .from('one_identities').select('user_id, handle, profiles(display_name, avatar_url)').eq('handle', handle).maybeSingle();
    if (!identity) { res.status(404).json({ error: 'Identity not found' }); return; }
    const { data: wallet } = await supabaseAdmin.from('wallets').select('circle_wallet_id, address').eq('user_id', identity.user_id).maybeSingle();
    res.json({
      handle: `${identity.handle}.one`, userId: identity.user_id,
      profile: (identity as { profiles?: unknown }).profiles,
      address: wallet?.address ?? null, circleWalletId: wallet?.circle_wallet_id ?? null,
    }); return;
  }

  // ── POST /wallet/provision ─────────────────────────────────────────
  if (path === '/wallet/provision' && req.method === 'POST') {
    const user = await requireAuth(req, res); if (!user) return;
    const { data: existing } = await supabaseAdmin.from('wallets').select('*').eq('user_id', user.userId).maybeSingle();
    if (existing) { res.json({ wallet: existing }); return; }
    try {
      const wsRes = await circleSdk.createWalletSet({ name: `one-chat-user-${user.userId}` });
      const walletSetId = wsRes.data?.walletSet?.id;
      if (!walletSetId) throw new Error('No walletSetId returned');
      const wRes = await circleSdk.createWallets({ accountType: 'EOA', blockchains: [BLOCKCHAIN], count: 1, walletSetId });
      const wallet = wRes.data?.wallets?.[0];
      if (!wallet) throw new Error('No wallet returned');
      const { data: saved, error: saveErr } = await supabaseAdmin.from('wallets')
        .insert({ user_id: user.userId, circle_wallet_id: wallet.id, circle_wallet_set_id: walletSetId, address: wallet.address, blockchain: BLOCKCHAIN, status: wallet.state ?? 'LIVE' })
        .select().single();
      if (saveErr) throw saveErr;
      res.json({ wallet: saved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[wallet/provision]', msg);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── GET /wallet/balance ────────────────────────────────────────────
  if (path === '/wallet/balance') {
    const user = await requireAuth(req, res); if (!user) return;
    const { data: wallet } = await supabaseAdmin.from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).maybeSingle();
    if (!wallet) { res.json({ balance: '0', address: null }); return; }
    try {
      const balRes = await circleSdk.getWalletTokenBalance({ id: wallet.circle_wallet_id });
      const balances = balRes.data?.tokenBalances ?? [];
      const usdc = balances.find((b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin'));
      res.json({ balance: usdc?.amount ?? '0', address: wallet.address, allBalances: balances });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // ── POST /payment/send ─────────────────────────────────────────────
  if (path === '/payment/send' && req.method === 'POST') {
    const user = await requireAuth(req, res); if (!user) return;
    const { recipientHandle, amount, conversationId, note } = req.body as { recipientHandle?: string; amount?: string; conversationId?: string; note?: string };
    if (!recipientHandle || !amount || !conversationId) { res.status(400).json({ error: 'recipientHandle, amount, and conversationId are required' }); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 10000) { res.status(400).json({ error: 'Invalid amount' }); return; }
    const handle = recipientHandle.toLowerCase().replace(/\.one$/, '');
    try {
      const { data: identity } = await supabaseAdmin.from('one_identities').select('user_id, handle').eq('handle', handle).maybeSingle();
      if (!identity) { res.status(404).json({ error: `Identity ${handle}.one not found` }); return; }
      if (identity.user_id === user.userId) { res.status(400).json({ error: 'You cannot send to yourself' }); return; }
      const { data: senderWallet } = await supabaseAdmin.from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
      if (!senderWallet) { res.status(400).json({ error: 'Sender wallet not provisioned' }); return; }
      const { data: recipientWallet } = await supabaseAdmin.from('wallets').select('address').eq('user_id', identity.user_id).maybeSingle();
      if (!recipientWallet) { res.status(400).json({ error: 'Recipient has no wallet yet' }); return; }
      const balRes = await circleSdk.getWalletTokenBalance({ id: senderWallet.circle_wallet_id });
      const usdcToken = (balRes.data?.tokenBalances ?? []).find((b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin'));
      if (!usdcToken?.token?.id) { res.status(400).json({ error: 'USDC token not found in sender wallet' }); return; }
      const idempotencyKey = randomUUID();
      const txRes = await circleSdk.createTransaction({
        walletId: senderWallet.circle_wallet_id, tokenId: usdcToken.token.id,
        destinationAddress: recipientWallet.address, amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey,
      });
      const circleTxId = txRes.data?.id;
      if (!circleTxId) throw new Error('No transaction ID from Circle');
      const { data: tx } = await supabaseAdmin.from('transactions')
        .insert({ circle_transaction_id: circleTxId, sender_id: user.userId, recipient_id: identity.user_id, amount: amountNum, asset: 'USDC', blockchain: BLOCKCHAIN, state: 'INITIATED', conversation_id: conversationId, idempotency_key: idempotencyKey })
        .select().single();
      await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, sender_id: user.userId, type: 'payment', content: note ?? null, metadata: { transactionId: tx?.id, circleTransactionId: circleTxId, amount, asset: 'USDC', recipientHandle: `${identity.handle}.one`, state: 'INITIATED' } });
      res.json({ success: true, transactionId: tx?.id, circleTxId, state: 'INITIATED' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[payment/send]', msg);
      res.status(500).json({ error: msg });
    }
    return;
  }

  // ── GET /payment/status/:txId ──────────────────────────────────────
  const statusMatch = path.match(/^\/payment\/status\/([^/]+)$/);
  if (statusMatch) {
    const user = await requireAuth(req, res); if (!user) return;
    const txId = decodeURIComponent(statusMatch[1]);
    const { data: tx } = await supabaseAdmin.from('transactions').select('*').eq('id', txId).or(`sender_id.eq.${user.userId},recipient_id.eq.${user.userId}`).maybeSingle();
    if (!tx) { res.status(404).json({ error: 'Transaction not found' }); return; }
    if (!tx.circle_transaction_id) { res.json({ transaction: tx }); return; }
    try {
      const circleTx = await circleSdk.getTransaction({ id: tx.circle_transaction_id as string });
      const state = circleTx.data?.transaction?.state ?? (tx.state as string);
      const txHash = circleTx.data?.transaction?.txHash ?? (tx.tx_hash as string | null);
      if (state !== tx.state) {
        await supabaseAdmin.from('transactions').update({ state, tx_hash: txHash, updated_at: new Date().toISOString() }).eq('id', tx.id);
      }
      res.json({ transaction: { ...tx, state, tx_hash: txHash } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
