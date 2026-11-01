import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { randomUUID } from 'crypto';

const BLOCKCHAIN = 'ARC-TESTNET';
const RESERVED = ['admin', 'allie', 'onechat', 'support', 'help', 'system', 'root', 'circle', 'arc'];
const TERMINAL_STATES = ['CONFIRMED', 'COMPLETE', 'SENT', 'FAILED', 'DENIED', 'CANCELLED'];

function checkEnv(): string | null {
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CIRCLE_API_KEY', 'CIRCLE_ENTITY_SECRET']
    .filter((k) => !process.env[k]);
  return missing.length ? `Server misconfigured — missing: ${missing.join(', ')}` : null;
}

function db() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function circle() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });
}

async function getUser(req: VercelRequest, res: VercelResponse): Promise<{ userId: string; userEmail: string | undefined } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing bearer token' }); return null; }
  const { data, error } = await db().auth.getUser(auth.slice(7));
  if (error || !data.user) { res.status(401).json({ error: 'Invalid or expired token' }); return null; }
  return { userId: data.user.id, userEmail: data.user.email };
}

// Poll Circle REST API until terminal state or timeout
async function pollCircleUntilTerminal(circleTxId: string, maxMs = 8000): Promise<{ state: string; txHash: string | null }> {
  const deadline = Date.now() + maxMs;
  let lastState = 'INITIATED';
  let lastHash: string | null = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`https://api.circle.com/v1/w3s/transactions/${circleTxId}`, {
        headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY!}` },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        const d = await r.json() as { data?: { transaction?: { state?: string; txHash?: string } } };
        const st = d.data?.transaction?.state ?? lastState;
        const th = d.data?.transaction?.txHash ?? null;
        lastState = st;
        lastHash = th;
        if (TERMINAL_STATES.includes(st)) return { state: st, txHash: th };
      }
    } catch { /* ignore — keep polling */ }
    if (Date.now() < deadline - 2000) await new Promise((r) => setTimeout(r, 2000));
  }
  return { state: lastState, txHash: lastHash };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const envErr = checkEnv();
  if (envErr) { res.status(500).json({ error: envErr }); return; }

  const url = req.url ?? '';
  const path = url.replace(/^\/api/, '').split('?')[0];

  // GET /health
  if (path === '/health') { res.json({ ok: true, ts: Date.now() }); return; }

  // GET /identity/check/:handle
  const checkMatch = path.match(/^\/identity\/check\/([^/]+)$/);
  if (checkMatch) {
    const handle = decodeURIComponent(checkMatch[1]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!handle || handle.length < 3 || handle.length > 24) { res.status(400).json({ available: false }); return; }
    if (RESERVED.includes(handle)) { res.json({ available: false, reason: 'reserved' }); return; }
    const { data } = await db().from('one_identities').select('handle').eq('handle', handle).maybeSingle();
    res.json({ available: !data }); return;
  }

  // POST /identity/claim
  if (path === '/identity/claim' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const body = req.body as { handle?: string };
    const handle = body?.handle;
    if (!handle || !/^[a-z0-9]{3,24}$/.test(handle)) { res.status(400).json({ error: 'Invalid handle' }); return; }
    const supabase = db();
    const { data: authUser } = await supabase.auth.admin.getUserById(user.userId);
    const meta = authUser?.user?.user_metadata ?? {};
    await supabase.from('profiles').upsert({
      id: user.userId,
      display_name: (meta.full_name as string | undefined) ?? user.userEmail?.split('@')[0] ?? 'User',
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    const { data: existing } = await supabase.from('one_identities').select('id').eq('user_id', user.userId).maybeSingle();
    if (existing) { res.status(409).json({ error: 'You already have a ONE identity' }); return; }
    const { error } = await supabase.from('one_identities').insert({ user_id: user.userId, handle });
    if (error) { res.status(error.code === '23505' ? 409 : 500).json({ error: error.message }); return; }
    res.json({ success: true, identity: `${handle}.one` }); return;
  }

  // GET /identity/resolve/:handle
  const resolveMatch = path.match(/^\/identity\/resolve\/([^/]+)$/);
  if (resolveMatch) {
    const user = await getUser(req, res); if (!user) return;
    const handle = decodeURIComponent(resolveMatch[1]).toLowerCase().replace(/\.one$/, '');
    const supabase = db();
    const { data: identity } = await supabase.from('one_identities').select('user_id, handle, profiles(display_name, avatar_url)').eq('handle', handle).maybeSingle();
    if (!identity) { res.status(404).json({ error: 'Identity not found' }); return; }
    const { data: wallet } = await supabase.from('wallets').select('circle_wallet_id, address').eq('user_id', identity.user_id).maybeSingle();
    res.json({ handle: `${identity.handle}.one`, userId: identity.user_id, profile: (identity as { profiles?: unknown }).profiles, address: wallet?.address ?? null, circleWalletId: wallet?.circle_wallet_id ?? null }); return;
  }

  // POST /wallet/provision
  if (path === '/wallet/provision' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const supabase = db();
    const { data: existing } = await supabase.from('wallets').select('*').eq('user_id', user.userId).maybeSingle();
    if (existing) { res.json({ wallet: existing }); return; }
    try {
      const sdk = circle();
      const wsRes = await sdk.createWalletSet({ name: `one-chat-user-${user.userId}` });
      const walletSetId = wsRes.data?.walletSet?.id;
      if (!walletSetId) throw new Error('No walletSetId returned');
      const wRes = await sdk.createWallets({ accountType: 'EOA', blockchains: [BLOCKCHAIN], count: 1, walletSetId });
      const wallet = wRes.data?.wallets?.[0];
      if (!wallet) throw new Error('No wallet returned');
      const { data: saved, error: saveErr } = await supabase.from('wallets')
        .insert({ user_id: user.userId, circle_wallet_id: wallet.id, circle_wallet_set_id: walletSetId, address: wallet.address, blockchain: BLOCKCHAIN, status: wallet.state ?? 'LIVE' })
        .select().single();
      if (saveErr) throw saveErr;
      res.json({ wallet: saved });
    } catch (err) {
      console.error('[wallet/provision] raw error:', JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : Object(err))));
      const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err);
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      res.status(500).json({ error: msg, detail });
    }
    return;
  }

  // GET /wallet/balance
  if (path === '/wallet/balance') {
    const user = await getUser(req, res); if (!user) return;
    const { data: wallet } = await db().from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).maybeSingle();
    if (!wallet) { res.json({ balance: '0', address: null }); return; }
    try {
      const balRes = await circle().getWalletTokenBalance({ id: wallet.circle_wallet_id });
      const usdc = (balRes.data?.tokenBalances ?? []).find((b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin'));
      res.json({ balance: usdc?.amount ?? '0', address: wallet.address });
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Helper: execute a payment, poll for confirmation, return final state
  async function executePayment(params: {
    supabase: ReturnType<typeof db>;
    senderWalletId: string;
    destinationAddress: string;
    amount: string;
    amountNum: number;
    recipientUserId: string | null;
    recipientHandle: string;
    conversationId: string;
    note: string | null;
    senderUserId: string;
  }) {
    const sdk = circle();
    const balRes = await sdk.getWalletTokenBalance({ id: params.senderWalletId });
    const usdcToken = (balRes.data?.tokenBalances ?? []).find((b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin'));
    if (!usdcToken?.token?.id) throw new Error('USDC not found in sender wallet');

    const idempotencyKey = randomUUID();
    const txRes = await sdk.createTransaction({
      walletId: params.senderWalletId,
      tokenId: usdcToken.token.id,
      destinationAddress: params.destinationAddress,
      amounts: [params.amount],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey,
    });
    const circleTxId = txRes.data?.id;
    if (!circleTxId) throw new Error('No transaction ID from Circle');

    // Insert DB row immediately
    const { data: tx, error: insertErr } = await params.supabase.from('transactions').insert({
      circle_transaction_id: circleTxId,
      sender_id: params.senderUserId,
      recipient_id: params.recipientUserId,
      amount: params.amountNum,
      asset: 'USDC',
      blockchain: BLOCKCHAIN,
      state: 'INITIATED',
      conversation_id: params.conversationId,
      idempotency_key: idempotencyKey,
    }).select('id').single();
    if (insertErr || !tx?.id) throw new Error(`DB insert failed: ${insertErr?.message ?? 'no row returned'}`);

    const txDbId = tx.id as string;

    // Poll Circle synchronously (up to 8s, within Vercel's 10s limit) before responding
    const { state: finalState, txHash } = await pollCircleUntilTerminal(circleTxId, 8000);

    // Update DB with whatever state we got
    await params.supabase.from('transactions').update({
      state: finalState,
      tx_hash: txHash,
      updated_at: new Date().toISOString(),
    }).eq('id', txDbId);

    // Insert message and return its DB id so client can dedup
    const { data: msgRow } = await params.supabase.from('messages').insert({
      conversation_id: params.conversationId,
      sender_id: params.senderUserId,
      type: 'payment',
      content: params.note,
      metadata: {
        transactionId: txDbId,
        circleTransactionId: circleTxId,
        amount: params.amount,
        asset: 'USDC',
        recipientHandle: params.recipientHandle,
        state: finalState,
      },
    }).select('id').single();

    return { transactionId: txDbId, circleTxId, state: finalState, messageId: msgRow?.id as string | undefined };
  }

  // POST /payment/send  (send to .one handle)
  if (path === '/payment/send' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { recipientHandle, amount, conversationId, note } = req.body as { recipientHandle?: string; amount?: string; conversationId?: string; note?: string };
    if (!recipientHandle || !amount || !conversationId) { res.status(400).json({ error: 'recipientHandle, amount, and conversationId required' }); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }
    const handle = recipientHandle.toLowerCase().replace(/\.one$/, '');
    try {
      const supabase = db();
      const { data: identity } = await supabase.from('one_identities').select('user_id, handle').eq('handle', handle).maybeSingle();
      if (!identity) { res.status(404).json({ error: `${handle}.one not found` }); return; }
      if (identity.user_id === user.userId) { res.status(400).json({ error: 'Cannot send to yourself' }); return; }
      const { data: senderWallet } = await supabase.from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
      if (!senderWallet) { res.status(400).json({ error: 'Sender wallet not provisioned' }); return; }
      const { data: recipientWallet } = await supabase.from('wallets').select('address').eq('user_id', identity.user_id).maybeSingle();
      if (!recipientWallet) { res.status(400).json({ error: 'Recipient has no wallet' }); return; }
      const result = await executePayment({
        supabase, senderWalletId: senderWallet.circle_wallet_id,
        destinationAddress: recipientWallet.address, amount, amountNum,
        recipientUserId: identity.user_id as string,
        recipientHandle: `${identity.handle as string}.one`,
        conversationId, note: note ?? null, senderUserId: user.userId,
      });
      res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // POST /payment/send-address  (send to external wallet address)
  if (path === '/payment/send-address' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { destinationAddress, amount, conversationId, note } = req.body as { destinationAddress?: string; amount?: string; conversationId?: string; note?: string };
    if (!destinationAddress || !amount || !conversationId) { res.status(400).json({ error: 'destinationAddress, amount, and conversationId required' }); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(destinationAddress)) { res.status(400).json({ error: 'Invalid wallet address' }); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }
    try {
      const supabase = db();
      const { data: senderWallet } = await supabase.from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
      if (!senderWallet) { res.status(400).json({ error: 'Sender wallet not provisioned' }); return; }
      const result = await executePayment({
        supabase, senderWalletId: senderWallet.circle_wallet_id,
        destinationAddress, amount, amountNum,
        recipientUserId: null, recipientHandle: destinationAddress,
        conversationId, note: note ?? null, senderUserId: user.userId,
      });
      res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // GET /payment/status/:txId  (lightweight — just read DB state)
  const statusMatch = path.match(/^\/payment\/status\/([^/]+)$/);
  if (statusMatch) {
    const user = await getUser(req, res); if (!user) return;
    const txId = decodeURIComponent(statusMatch[1]);
    const { data: tx } = await db().from('transactions').select('id, state, tx_hash, amount, circle_transaction_id').eq('id', txId).or(`sender_id.eq.${user.userId},recipient_id.eq.${user.userId}`).maybeSingle();
    if (!tx) { res.status(404).json({ error: 'Transaction not found' }); return; }
    res.json({ transaction: tx });
    return;
  }

  // POST /chat/allie
  if (path === '/chat/allie' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { message, history, isPro } = req.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      isPro?: boolean;
    };
    if (!message) { res.status(400).json({ error: 'message required' }); return; }

    const t = message.toLowerCase().trim();
    // Strip @allie prefix if used in group context
    const clean = t.replace(/^@allie\s*/i, '').trim();

    // --- Local handler: simple keywords never hit the LLM ---
    // --- Payment intent: parse natural language send commands (ALWAYS FREE) ---
    // Patterns: "send 5 usdc to alice", "send alice 5", "pay alice.one 10 usdc",
    //           "@allie send him 1usdc" (him/her resolved to conversation partner), etc.
    // Two orderings: "send <amount> to <handle>" OR "send <handle> <amount>"
    const payIntent =
      clean.match(/\b(?:send|transfer|pay)\s+\$?([\d.]+)\s*(?:usdc)?\s+(?:to\s+)?(@?[\w.]+(?:\.one)?|0x[0-9a-fA-F]{40})/i) ||
      clean.match(/\b(?:send|transfer|pay)\s+(?:to\s+)?(@?[\w.]+(?:\.one)?|0x[0-9a-fA-F]{40})\s+\$?([\d.]+)\s*(?:usdc)?/i);
    if (payIntent) {
      // Normalise: first pattern has (amount, recipient), second has (recipient, amount)
      const isFirstPattern = /\b(?:send|transfer|pay)\s+\$?[\d.]/.test(clean);
      const amount = isFirstPattern ? payIntent[1] : payIntent[2];
      const rawRecipient = (isFirstPattern ? payIntent[2] : payIntent[1])?.replace(/^@/, '') ?? '';
      // Pronouns like "him"/"her"/"them" — can't resolve without conversation context, ask for handle
      if (/^(him|her|them|this|that|it)$/.test(rawRecipient)) {
        res.json({ reply: `Who would you like to send $${amount} USDC to? Just say their .one handle, like "send ${amount} USDC to alice.one".`, usedLlm: false }); return;
      }
      // Validate amount
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.json({ reply: `I couldn't parse the amount "${amount}". Try: "send 5 USDC to alice.one"`, usedLlm: false }); return;
      }
      // Resolve recipient — could be a .one handle or a wallet address
      const isAddress = /^0x[0-9a-fA-F]{40}$/.test(rawRecipient);
      let destAddress: string | null = null;
      let resolvedHandle = rawRecipient;
      if (isAddress) {
        destAddress = rawRecipient;
      } else {
        const handle = rawRecipient.replace(/\.one$/, '');
        const { data: identity } = await db().from('one_identities').select('user_id, handle').eq('handle', handle).maybeSingle();
        if (!identity) {
          res.json({ reply: `I couldn't find anyone with the handle "${rawRecipient}.one". Double-check the handle and try again.`, usedLlm: false }); return;
        }
        const { data: wallet } = await db().from('wallets').select('address').eq('user_id', identity.user_id).maybeSingle();
        if (!wallet?.address) {
          res.json({ reply: `Found ${rawRecipient}.one but they haven't set up a wallet yet.`, usedLlm: false }); return;
        }
        destAddress = wallet.address;
        resolvedHandle = identity.handle as string;
      }
      // Execute the payment via Circle
      let dbWalletId = '';
      let resolvedTokenId = '';
      try {
        const senderWallet = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
        if (!senderWallet.data?.circle_wallet_id) {
          res.json({ reply: "You don't have a wallet set up yet. Go to the You tab and set up your wallet first.", usedLlm: false }); return;
        }
        dbWalletId = senderWallet.data.circle_wallet_id as string;
        const idempotencyKey = randomUUID();
        // Look up token ID from wallet balances — never hardcode
        const balRes = await circle().getWalletTokenBalance({ id: dbWalletId });
        const usdcToken = (balRes.data?.tokenBalances ?? []).find(
          (b: { token?: { symbol?: string; id?: string; name?: string } }) =>
            b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
        );
        if (!usdcToken?.token?.id) {
          res.json({ reply: "I couldn't find USDC in your wallet. Make sure your wallet is funded.", usedLlm: false }); return;
        }
        resolvedTokenId = usdcToken.token.id as string;
        if (!destAddress) {
          res.json({ reply: `I couldn't find a wallet for "${rawRecipient}". Make sure they have a ONE Chat account and wallet set up.`, usedLlm: false }); return;
        }
        const txRes = await circle().createTransaction({
          walletId: dbWalletId,
          tokenId: resolvedTokenId,
          destinationAddress: destAddress,
          amounts: [String(amountNum)],
          fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
          idempotencyKey,
        });
        const circleTxId = (txRes.data as { id?: string; transaction?: { id?: string } })?.id ?? (txRes.data as { transaction?: { id?: string } })?.transaction?.id ?? '';
        const { state: finalState } = await pollCircleUntilTerminal(circleTxId, 8000);
        await db().from('transactions').insert({
          sender_id: user.userId,
          amount,
          asset: 'USDC',
          state: finalState,
          circle_transaction_id: circleTxId,
          idempotency_key: idempotencyKey,
        });
        const succeeded = ['CONFIRMED', 'SENT', 'COMPLETE'].includes(finalState);
        res.json({
          reply: succeeded
            ? `Done! I sent $${amount} USDC to ${resolvedHandle}${resolvedHandle.includes('.one') ? '' : '.one'}. The transaction is confirmed on Arc Network.`
            : `I submitted the payment of $${amount} USDC to ${resolvedHandle} but it's still processing. Check the Activity tab for the final status.`,
          usedLlm: false,
          paymentExecuted: true,
          paymentState: finalState,
        });
      } catch (err: unknown) {
        const errObj = err as { message?: string; response?: { data?: unknown }; code?: string };
        const detail = errObj?.response?.data ?? errObj?.message ?? String(err);
        res.json({ reply: `[debug] ${JSON.stringify(detail)} dest=${destAddress} amt=${amountNum} tokenId=${resolvedTokenId} walletId=${dbWalletId}`, usedLlm: false });
      }
      return;
    }

    // --- Balance check: return actual balance ---
    if (/\bbalance\b|\bhow much\b.*\bhave\b|\bwhat.*\bbalance\b|\bmy balance\b/i.test(clean)) {
      try {
        const { data: w } = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
        if (w?.circle_wallet_id) {
          const balRes = await circle().getWalletTokenBalance({ id: w.circle_wallet_id as string });
          const usdc = (balRes.data?.tokenBalances ?? []).find((b: { token?: { symbol?: string }; amount?: string }) => b.token?.symbol === 'USDC');
          const bal = usdc?.amount ?? '0';
          res.json({ reply: `Your current USDC balance is $${parseFloat(bal).toFixed(2)} on Arc Network. Want to send or save some?`, usedLlm: false }); return;
        }
      } catch { /* fall through */ }
      res.json({ reply: "You can see your live USDC balance in the You tab.", usedLlm: false }); return;
    }

    // --- Split bill: parse total + people count, calculate shares ---
    const splitMatch = clean.match(/split\s+\$?([\d.]+)(?:\s+usdc)?(?:\s+(?:between|among|with|for))?\s+(\d+)\s+(?:people|persons?|ways?|friends?)/i)
      || clean.match(/(\d+)\s+(?:people|persons?|ways?|friends?)\s+(?:split|splitting|share|sharing)\s+\$?([\d.]+)/i)
      || clean.match(/split\s+(?:a\s+)?bill\s+(?:of\s+)?\$?([\d.]+)\s+(\d+)\s*ways?/i);
    if (splitMatch) {
      const total = parseFloat(splitMatch[1]) || parseFloat(splitMatch[2]);
      const people = parseInt(splitMatch[2] || splitMatch[1]);
      if (!isNaN(total) && !isNaN(people) && people > 1) {
        const share = (total / people).toFixed(2);
        res.json({ reply: `$${total.toFixed(2)} split ${people} ways = $${share} each. I can send each person their share — just give me their .one handles and I'll send them one by one.`, usedLlm: false }); return;
      }
    }
    // Split with explicit names: "split 30 between alice, bob, carol [and send]"
    const splitNamesMatch = clean.match(/split\s+\$?([\d.]+)(?:\s+usdc)?\s+(?:between|among|with)\s+(.+)/i);
    if (splitNamesMatch) {
      const total = parseFloat(splitNamesMatch[1]);
      const rawNames = splitNamesMatch[2].replace(/\s+(and\s+)?send(\s+now)?.*$/i, '').trim();
      const names = rawNames.split(/,\s*|\s+and\s+/).map((n) => n.trim().replace(/^@/, '').replace(/\.one$/, '')).filter((n) => n && !/^(now|them|everyone|all)$/i.test(n));
      const shouldSend = /\bsend\b|\bpay\b|\bdo it\b|\bnow\b/i.test(clean);
      if (!isNaN(total) && names.length > 0) {
        const share = parseFloat((total / names.length).toFixed(6));
        if (!shouldSend) {
          const list = names.map((n) => `${n}.one: $${share.toFixed(2)}`).join(', ');
          res.json({ reply: `$${total.toFixed(2)} split ${names.length} ways: ${list}.\n\nSay "split $${total.toFixed(2)} between ${names.join(', ')} and send" to execute all payments now.`, usedLlm: false }); return;
        }
        // Execute all payments in parallel
        const { data: senderWalletRow } = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
        if (!senderWalletRow?.circle_wallet_id) {
          res.json({ reply: "You don't have a wallet set up yet. Go to the You tab first.", usedLlm: false }); return;
        }
        const senderWalletId = senderWalletRow.circle_wallet_id as string;
        const balRes = await circle().getWalletTokenBalance({ id: senderWalletId });
        const usdcToken = (balRes.data?.tokenBalances ?? []).find((b: { token?: { symbol?: string; id?: string } }) => b.token?.symbol === 'USDC');
        if (!usdcToken?.token?.id) { res.json({ reply: "I couldn't find USDC in your wallet. Make sure it's funded first.", usedLlm: false }); return; }
        const results: string[] = [];
        for (const handle of names) {
          try {
            const { data: identity } = await db().from('one_identities').select('user_id').eq('handle', handle).maybeSingle();
            if (!identity) { results.push(`❌ ${handle}.one — not found`); continue; }
            const { data: recipWallet } = await db().from('wallets').select('address').eq('user_id', identity.user_id).maybeSingle();
            if (!recipWallet?.address) { results.push(`❌ ${handle}.one — no wallet`); continue; }
            const txRes = await circle().createTransaction({ walletId: senderWalletId, tokenId: usdcToken.token.id as string, destinationAddress: recipWallet.address as string, amounts: [String(share)], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: randomUUID() });
            const circleTxId = (txRes.data as { id?: string })?.id ?? '';
            const { state } = await pollCircleUntilTerminal(circleTxId, 8000);
            results.push(['CONFIRMED', 'SENT', 'COMPLETE'].includes(state) ? `✅ ${handle}.one — $${share.toFixed(2)} sent` : `⚠️ ${handle}.one — ${state}`);
          } catch (e) { results.push(`❌ ${handle}.one — ${e instanceof Error ? e.message : 'error'}`); }
        }
        res.json({ reply: `Split $${total.toFixed(2)} ${names.length} ways:\n\n${results.join('\n')}`, usedLlm: false, splitExecuted: true }); return;
      }
    }

    const LOCAL_PATTERNS: [RegExp, string][] = [
      [/^(hi|hey|hello|sup|yo|what'?s up|howdy)[\s!?.]*$/i, "Hey! I'm ALLIE — your financial assistant in ONE Chat. I can send USDC, check your balance, split bills, and more. What do you need?"],
      [/^(thanks?|thank you|thx|ty|cheers)[\s!.]*$/i, "You're welcome! Let me know if you need anything else."],
      [/^(bye|goodbye|see ya|later)[\s!.]*$/i, "Bye! I'll be here whenever you need me."],
      [/^(ok|okay|got it|sure|nice|cool|great|awesome|perfect|sounds good)[\s!.]*$/i, "Got it! Anything else I can help with?"],
      [/\bwho are you\b|\bwhat are you\b/i, "I'm ALLIE — the AI financial assistant built into ONE Chat. I can send USDC, check balances, split bills, and explain transactions."],
      [/\bwhat can you do\b|\bhelp\b|\bcommands?\b/i, "I can: send USDC to any .one handle or wallet address, check your balance, split bills, request payments, and explain transactions. Just ask naturally!"],
      [/\bhow.*send\b|\bsend.*how\b|\bwhat.*send\b/i, "Just say 'send 5 USDC to alice.one' and I'll handle it. You can use a .one handle or a wallet address starting with 0x."],
      [/\brequest\b.*\bpayment\b|\brequest\b.*\busdc\b|\bask.*\bpay\b/i, "Tap the $ button in any conversation to send or request USDC. I can also send on your behalf — just say 'send X USDC to handle'."],
      [/\btransaction\b|\bhistory\b|\bactivity\b/i, "Check the Activity tab for your full transaction history, including explorer links for every confirmed payment."],
      [/\bsave\b|\bsaving\b|\bgoal\b/i, "You can create savings goals in the You tab — set a target amount and deadline, and track your progress. Want help setting one up?"],
    ];
    for (const [pattern, reply] of LOCAL_PATTERNS) {
      if (pattern.test(clean)) { res.json({ reply, usedLlm: false }); return; }
    }

    // --- Pro gate: non-pro users get a helpful nudge instead of LLM ---
    // Verify pro status server-side from DB (don't trust client isPro blindly)
    const { data: profileRow } = await db().from('profiles').select('is_pro').eq('id', user.userId).maybeSingle();
    const userIsPro = (profileRow?.is_pro as boolean | null) ?? isPro ?? false;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!userIsPro || !apiKey) {
      const proNudge = userIsPro
        ? "I'm having a moment — please try again shortly."
        : "That's a great question! Upgrade to ONE Pro to unlock full AI-powered responses from me. I can still help with basic commands — try 'send', 'balance', or 'help'.";
      res.json({ reply: proNudge, usedLlm: false, requiresPro: !userIsPro }); return;
    }

    // --- LLM path: Pro users only ---
    try {
      const { data: wallet } = await db().from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).maybeSingle();
      let balanceContext = '';
      if (wallet) {
        try {
          const balRes = await circle().getWalletTokenBalance({ id: wallet.circle_wallet_id });
          const usdc = (balRes.data?.tokenBalances ?? []).find((b: { token?: { symbol?: string } }) => b.token?.symbol === 'USDC');
          if (usdc) balanceContext = `\nThe user's current USDC balance is $${usdc.amount} on Arc Network.`;
        } catch { /* ignore */ }
      }
      const systemPrompt = `You are ALLIE, the AI financial assistant in ONE Chat — a messaging app where users send USDC on Arc Network (USDC is the native gas token; no separate ETH needed).${balanceContext}
Help users: send USDC by .one handle or wallet address, understand transactions, check balances, split bills. Be concise and warm — 2–4 sentences max. Direct payment actions to the $ button. Never invent addresses or amounts. Politely redirect off-topic questions.`;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: systemPrompt,
          messages: [...(history ?? []).slice(-10), { role: 'user', content: message }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
      const data = await response.json() as { content: { type: string; text: string }[] };
      const reply = data.content.find((c) => c.type === 'text')?.text ?? 'Sorry, I could not process that.';
      res.json({ reply, usedLlm: true });
    } catch {
      res.json({ reply: "I'm having a moment — please try again shortly.", usedLlm: false });
    }
    return;
  }

  // POST /subscription/subscribe  — charge 5 USDC and mark user as Pro
  if (path === '/subscription/subscribe' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    // Check already pro
    const { data: profile } = await db().from('profiles').select('is_pro').eq('id', user.userId).maybeSingle();
    if (profile?.is_pro) { res.json({ success: true, alreadyPro: true, message: "You're already a ONE Pro member!" }); return; }
    // Get sender wallet
    const { data: wallet } = await db().from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).maybeSingle();
    if (!wallet?.circle_wallet_id) { res.status(400).json({ error: 'Wallet not set up. Go to the You tab first.' }); return; }
    // Charge 5 USDC — send to app treasury address (owner's wallet)
    const treasuryAddress = process.env.VITE_TREASURY_ADDRESS;
    if (!treasuryAddress) { res.status(500).json({ error: 'Subscription not configured' }); return; }
    try {
      const idempotencyKey = randomUUID();
      const subWalletId = wallet.circle_wallet_id as string;
      const subBalRes = await circle().getWalletTokenBalance({ id: subWalletId });
      const subUsdc = (subBalRes.data?.tokenBalances ?? []).find(
        (b: { token?: { symbol?: string; id?: string; name?: string } }) =>
          b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
      );
      if (!subUsdc?.token?.id) { res.status(400).json({ error: 'No USDC in wallet. Please fund your wallet first.' }); return; }
      const txRes = await circle().createTransaction({
        walletId: subWalletId,
        tokenId: subUsdc.token.id as string,
        destinationAddress: treasuryAddress,
        amounts: ['5'],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey,
      });
      const circleTxId = (txRes.data as { id?: string })?.id ?? '';
      const { state: finalState } = await pollCircleUntilTerminal(circleTxId, 8000);
      if (!['CONFIRMED', 'SENT', 'COMPLETE'].includes(finalState)) {
        res.status(402).json({ error: `Payment ${finalState}. Please check your USDC balance and try again.` }); return;
      }
      // Mark pro + record expiry (30 days)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db().from('profiles').update({ is_pro: true, pro_expires_at: expiresAt }).eq('id', user.userId);
      res.json({ success: true, message: 'Welcome to ONE Pro! You now have full ALLIE AI access.', expiresAt });
    } catch (err) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data ?? (err instanceof Error ? err.message : 'Subscription failed');
      res.status(500).json({ error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    }
    return;
  }

  // GET /wallet/savings — get user's savings goals
  if (path === '/wallet/savings' && req.method === 'GET') {
    const user = await getUser(req, res); if (!user) return;
    const { data, error } = await db().from('savings_goals')
      .select('id, name, target_amount, current_amount, deadline, created_at, is_completed')
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ goals: data ?? [] });
    return;
  }

  // POST /wallet/savings — create a savings goal
  if (path === '/wallet/savings' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { name, targetAmount, deadline } = req.body as { name?: string; targetAmount?: string; deadline?: string };
    if (!name || !targetAmount) { res.status(400).json({ error: 'name and targetAmount required' }); return; }
    const { data, error } = await db().from('savings_goals').insert({
      user_id: user.userId, name, target_amount: targetAmount, current_amount: '0', deadline: deadline ?? null,
    }).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ goal: data });
    return;
  }

  // POST /wallet/savings/:id/deposit — send USDC onchain to savings wallet + update goal
  if (path.match(/^\/wallet\/savings\/[^/]+\/deposit$/) && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const goalId = path.split('/')[3];
    const { amount } = req.body as { amount?: string };
    if (!amount) { res.status(400).json({ error: 'amount required' }); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }
    // Load goal
    const { data: goal } = await db().from('savings_goals').select('current_amount, target_amount, savings_wallet_id').eq('id', goalId).eq('user_id', user.userId).maybeSingle();
    if (!goal) { res.status(404).json({ error: 'Goal not found' }); return; }
    // Load sender wallet
    const { data: senderWalletRow } = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
    if (!senderWalletRow?.circle_wallet_id) { res.status(400).json({ error: 'No wallet found. Set up your wallet first.' }); return; }
    const senderWalletId = senderWalletRow.circle_wallet_id as string;
    // Get or create savings sub-wallet for this user
    let savingsWalletId = (goal as { savings_wallet_id?: string }).savings_wallet_id ?? null;
    let savingsAddress = '';
    if (!savingsWalletId) {
      // Check if user already has a savings wallet
      const { data: existingSavings } = await db().from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).eq('wallet_type', 'savings').maybeSingle();
      if (existingSavings?.circle_wallet_id) {
        savingsWalletId = existingSavings.circle_wallet_id as string;
        savingsAddress = existingSavings.address as string;
      } else {
        // Create a new savings sub-wallet
        const { data: wsRow } = await db().from('wallets').select('circle_wallet_set_id').eq('user_id', user.userId).maybeSingle();
        const walletSetId = (wsRow as { circle_wallet_set_id?: string } | null)?.circle_wallet_set_id;
        if (!walletSetId) { res.status(400).json({ error: 'Wallet set not found' }); return; }
        const wRes = await circle().createWallets({ accountType: 'EOA', blockchains: [BLOCKCHAIN], count: 1, walletSetId });
        const newWallet = (wRes.data as { wallets?: { id?: string; address?: string }[] })?.wallets?.[0];
        if (!newWallet?.id || !newWallet?.address) { res.status(500).json({ error: 'Failed to create savings wallet' }); return; }
        savingsWalletId = newWallet.id;
        savingsAddress = newWallet.address;
        await db().from('wallets').insert({ user_id: user.userId, circle_wallet_id: savingsWalletId, circle_wallet_set_id: walletSetId, address: savingsAddress, blockchain: BLOCKCHAIN, status: 'LIVE', wallet_type: 'savings' });
      }
      // Store savings_wallet_id on goal for future deposits
      await db().from('savings_goals').update({ savings_wallet_id: savingsWalletId }).eq('id', goalId);
    } else {
      const { data: sw } = await db().from('wallets').select('address').eq('circle_wallet_id', savingsWalletId).maybeSingle();
      savingsAddress = (sw as { address?: string } | null)?.address ?? '';
    }
    if (!savingsAddress) { res.status(500).json({ error: 'Could not resolve savings wallet address' }); return; }
    // Execute onchain transfer: sender wallet → savings wallet
    const balRes = await circle().getWalletTokenBalance({ id: senderWalletId });
    const usdcToken = (balRes.data?.tokenBalances ?? []).find((b: { token?: { symbol?: string; id?: string; name?: string } }) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin'));
    if (!usdcToken?.token?.id) { res.status(400).json({ error: 'No USDC in wallet' }); return; }
    const txRes = await circle().createTransaction({ walletId: senderWalletId, tokenId: usdcToken.token.id as string, destinationAddress: savingsAddress, amounts: [String(amountNum)], fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: randomUUID() });
    const circleTxId = (txRes.data as { id?: string })?.id;
    if (!circleTxId) throw new Error('No transaction ID from Circle');
    const { state: finalState } = await pollCircleUntilTerminal(circleTxId, 8000);
    if (!['CONFIRMED', 'SENT', 'COMPLETE'].includes(finalState)) { res.status(500).json({ error: `Transfer failed with state: ${finalState}` }); return; }
    // Update goal progress
    const newAmount = (parseFloat(goal.current_amount as string) + amountNum).toFixed(6);
    const isCompleted = parseFloat(newAmount) >= parseFloat(goal.target_amount as string);
    await db().from('savings_goals').update({ current_amount: newAmount, is_completed: isCompleted }).eq('id', goalId);
    res.json({ newAmount, isCompleted, txId: circleTxId });
    return;
  }

  // DELETE /wallet/savings/:id — delete a savings goal
  if (path.match(/^\/wallet\/savings\/[^/]+$/) && req.method === 'DELETE') {
    const user = await getUser(req, res); if (!user) return;
    const goalId = path.split('/')[3];
    const { error } = await db().from('savings_goals').delete().eq('id', goalId).eq('user_id', user.userId);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
    return;
  }

  // POST /payment/request — create a payment request (stored, notified via message)
  if (path === '/payment/request' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { toHandle, amount, note, conversationId } = req.body as {
      toHandle?: string; amount?: string; note?: string; conversationId?: string;
    };
    if (!toHandle || !amount) { res.status(400).json({ error: 'toHandle and amount required' }); return; }
    const handle = (toHandle as string).replace(/\.one$/, '');
    const { data: identity } = await db().from('one_identities').select('user_id').eq('handle', handle).maybeSingle();
    if (!identity) { res.status(404).json({ error: `${toHandle} not found` }); return; }
    // Store as a transaction with state=REQUESTED
    const { data: req_, error } = await db().from('transactions').insert({
      sender_id: identity.user_id,
      recipient_id: user.userId,
      amount, asset: 'USDC', state: 'REQUESTED',
      idempotency_key: `req-${user.userId}-${Date.now()}`,
    }).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    // Post a payment_request message to the conversation if provided
    if (conversationId) {
      const { data: senderIdentity } = await db().from('one_identities').select('handle').eq('user_id', user.userId).maybeSingle();
      await db().from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.userId,
        type: 'payment_request',
        content: `Requested $${amount} USDC`,
        metadata: { amount, note: note ?? '', requestId: (req_ as { id: string })?.id, requesterHandle: senderIdentity?.handle ?? '' },
      });
    }
    res.json({ success: true, requestId: (req_ as { id: string })?.id });
    return;
  }

  // POST /payment/bill-split — create a group bill split request
  if (path === '/payment/bill-split' && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const { conversationId, title, totalAmount, perPersonAmount, memberIds } = req.body as {
      conversationId?: string; title?: string; totalAmount?: string; perPersonAmount?: string; memberIds?: string[];
    };
    if (!conversationId || !title || !totalAmount || !perPersonAmount || !memberIds?.length) {
      res.status(400).json({ error: 'conversationId, title, totalAmount, perPersonAmount, memberIds required' }); return;
    }
    // Create bill_split record
    const { data: split, error: splitErr } = await db().from('bill_splits').insert({
      conversation_id: conversationId, created_by: user.userId, title,
      total_amount: totalAmount, per_person_amount: perPersonAmount,
    }).select().single();
    if (splitErr) { res.status(500).json({ error: splitErr.message }); return; }
    const splitId = (split as { id: string }).id;
    // Create contribution rows for each member (excluding creator)
    const contribs = memberIds.filter((id) => id !== user.userId).map((memberId) => ({
      split_id: splitId, user_id: memberId, amount: perPersonAmount, state: 'PENDING',
    }));
    if (contribs.length) await db().from('bill_split_contributions').insert(contribs);
    // Post a bill_split message to the group
    const { data: creatorIdentity } = await db().from('one_identities').select('handle').eq('user_id', user.userId).maybeSingle();
    await db().from('messages').insert({
      conversation_id: conversationId, sender_id: user.userId,
      type: 'bill_split',
      content: `${creatorIdentity?.handle ?? 'Someone'} created a bill split: ${title}`,
      metadata: { splitId, title, totalAmount, perPersonAmount, memberCount: memberIds.length },
    });
    res.json({ success: true, splitId });
    return;
  }

  // POST /payment/bill-split/:id/pay — pay your share of a bill split
  if (path.match(/^\/payment\/bill-split\/[^/]+\/pay$/) && req.method === 'POST') {
    const user = await getUser(req, res); if (!user) return;
    const splitId = path.split('/')[3];
    // Load the split
    const { data: split } = await db().from('bill_splits').select('created_by, per_person_amount, conversation_id, title').eq('id', splitId).maybeSingle();
    if (!split) { res.status(404).json({ error: 'Bill split not found' }); return; }
    // Check contribution exists and is pending
    const { data: contrib } = await db().from('bill_split_contributions').select('id, state').eq('split_id', splitId).eq('user_id', user.userId).maybeSingle();
    if (!contrib) { res.status(404).json({ error: 'You are not part of this bill split' }); return; }
    if ((contrib.state as string) !== 'PENDING') { res.json({ success: true, alreadyPaid: true }); return; }
    // Get payer wallet
    const { data: payerWallet } = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
    if (!payerWallet?.circle_wallet_id) { res.status(400).json({ error: 'Wallet not set up' }); return; }
    // Get creator wallet address
    const { data: creatorWallet } = await db().from('wallets').select('address').eq('user_id', split.created_by).maybeSingle();
    if (!creatorWallet?.address) { res.status(404).json({ error: 'Creator has no wallet' }); return; }
    // Execute payment
    const balRes = await circle().getWalletTokenBalance({ id: payerWallet.circle_wallet_id as string });
    const usdcToken = (balRes.data?.tokenBalances ?? []).find((b: { token?: { symbol?: string; id?: string } }) => b.token?.symbol === 'USDC');
    if (!usdcToken?.token?.id) { res.status(400).json({ error: 'No USDC in wallet' }); return; }
    try {
      const txRes = await circle().createTransaction({
        walletId: payerWallet.circle_wallet_id as string, tokenId: usdcToken.token.id as string,
        destinationAddress: creatorWallet.address as string, amounts: [String(split.per_person_amount)],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey: randomUUID(),
      });
      const circleTxId = (txRes.data as { id?: string })?.id ?? '';
      const { state } = await pollCircleUntilTerminal(circleTxId, 8000);
      if (!['CONFIRMED', 'SENT', 'COMPLETE'].includes(state)) { res.status(500).json({ error: `Payment ${state}` }); return; }
      // Mark contribution as paid
      await db().from('bill_split_contributions').update({ state: 'PAID', circle_tx_id: circleTxId }).eq('id', contrib.id);
      // Post a message confirming payment
      const { data: payerIdentity } = await db().from('one_identities').select('handle').eq('user_id', user.userId).maybeSingle();
      await db().from('messages').insert({
        conversation_id: split.conversation_id, sender_id: user.userId, type: 'text',
        content: `✅ I paid my share ($${parseFloat(split.per_person_amount as string).toFixed(2)} USDC) for "${split.title}"`,
      });
      res.json({ success: true, state, txId: circleTxId, payerHandle: payerIdentity?.handle });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Payment failed' });
    }
    return;
  }

  // GET /payment/bill-split/:id — get bill split status
  if (path.match(/^\/payment\/bill-split\/[^/]+$/) && req.method === 'GET') {
    const user = await getUser(req, res); if (!user) return;
    const splitId = path.split('/')[3];
    const { data: split } = await db().from('bill_splits').select('*, bill_split_contributions(user_id, state, amount)').eq('id', splitId).maybeSingle();
    if (!split) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ split });
    return;
  }

  res.status(404).json({ error: `Not found: ${path}` });
}
