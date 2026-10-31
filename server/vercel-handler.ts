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

    // Insert message
    await params.supabase.from('messages').insert({
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
    });

    return { transactionId: txDbId, circleTxId, state: finalState };
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
      try {
        const senderWallet = await db().from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
        if (!senderWallet.data?.circle_wallet_id) {
          res.json({ reply: "You don't have a wallet set up yet. Go to the You tab and set up your wallet first.", usedLlm: false }); return;
        }
        const idempotencyKey = `allie-${user.userId}-${Date.now()}`;
        const txRes = await circle().createTransaction({
          walletId: senderWallet.data.circle_wallet_id as string,
          tokenId: process.env.USDC_TOKEN_ID ?? '36b6931a-873a-56a8-8a27-b706b17104ee',
          destinationAddress: destAddress,
          amounts: [amount],
          fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
          idempotencyKey,
        });
        const circleTxId = (txRes.data as { transaction?: { id?: string } })?.transaction?.id ?? '';
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.json({ reply: `I tried to send the payment but hit an error: ${msg}. Try using the $ button directly.`, usedLlm: false });
      }
      return;
    }

    const LOCAL_PATTERNS: [RegExp, string][] = [
      [/^(hi|hey|hello|sup|yo|what'?s up|howdy)[\s!?.]*$/i, "Hey! I'm ALLIE — your financial assistant in ONE Chat. I can send USDC, check your balance, split bills, and more. What do you need?"],
      [/^(thanks?|thank you|thx|ty|cheers)[\s!.]*$/i, "You're welcome! Let me know if you need anything else."],
      [/^(bye|goodbye|see ya|later)[\s!.]*$/i, "Bye! I'll be here whenever you need me."],
      [/^(ok|okay|got it|sure|nice|cool|great|awesome|perfect|sounds good)[\s!.]*$/i, "Got it! Anything else I can help with?"],
      [/\bwho are you\b|\bwhat are you\b/i, "I'm ALLIE — the AI financial assistant built into ONE Chat. I can send USDC, check balances, split bills, and explain transactions."],
      [/\bwhat can you do\b|\bhelp\b|\bcommands?\b/i, "I can: send USDC to any .one handle or wallet address, check your balance, split bills, request payments, and explain transactions. Just ask naturally!"],
      [/\bbalance\b|\bhow much\b.*\bhave\b|\bwhat.*\bbalance\b/i, "You can see your live USDC balance in the You tab. Want me to help you send or request funds?"],
      [/\bhow.*send\b|\bsend.*how\b|\bwhat.*send\b/i, "Just say 'send 5 USDC to alice.one' — I'll handle it. You can use a .one handle or a wallet address starting with 0x."],
      [/\brequest\b.*\busdc\b|\bask.*\bpay\b/i, "Payment requests aren't automated yet, but you can tap the $ button in any conversation to send USDC directly."],
      [/\bsplit\b.*\bbill\b|\bbill\b.*\bsplit\b|\bsplit\b.*\bcost\b/i, "For bill splits, tell me the total and the participants — I'll calculate each person's share and you can send it directly."],
      [/\btransaction\b|\bhistory\b|\bactivity\b/i, "Check the Activity tab for your full transaction history, including explorer links for every confirmed payment."],
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
    const { data: profile } = await params.supabase.from('profiles').select('is_pro').eq('id', user.userId).maybeSingle();
    if (profile?.is_pro) { res.json({ success: true, alreadyPro: true, message: "You're already a ONE Pro member!" }); return; }
    // Get sender wallet
    const { data: wallet } = await params.supabase.from('wallets').select('circle_wallet_id, address').eq('user_id', user.userId).maybeSingle();
    if (!wallet?.circle_wallet_id) { res.status(400).json({ error: 'Wallet not set up. Go to the You tab first.' }); return; }
    // Charge 5 USDC — send to app treasury address (owner's wallet)
    const treasuryAddress = process.env.VITE_TREASURY_ADDRESS;
    if (!treasuryAddress) { res.status(500).json({ error: 'Subscription not configured' }); return; }
    try {
      const idempotencyKey = `pro-sub-${user.userId}-${Date.now()}`;
      const txRes = await circle().createTransaction({
        walletId: wallet.circle_wallet_id as string,
        tokenId: process.env.USDC_TOKEN_ID ?? '36b6931a-873a-56a8-8a27-b706b17104ee',
        destinationAddress: treasuryAddress,
        amounts: ['5'],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey,
      });
      const circleTxId = (txRes.data as { transaction?: { id?: string } })?.transaction?.id ?? '';
      const { state: finalState } = await pollCircleUntilTerminal(circleTxId, 8000);
      if (!['CONFIRMED', 'SENT', 'COMPLETE'].includes(finalState)) {
        res.status(402).json({ error: `Payment ${finalState}. Please check your USDC balance and try again.` }); return;
      }
      // Mark pro + record expiry (30 days)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await params.supabase.from('profiles').update({ is_pro: true, pro_expires_at: expiresAt }).eq('id', user.userId);
      res.json({ success: true, message: 'Welcome to ONE Pro! You now have full ALLIE AI access.', expiresAt });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription failed' });
    }
    return;
  }

  res.status(404).json({ error: `Not found: ${path}` });
}
