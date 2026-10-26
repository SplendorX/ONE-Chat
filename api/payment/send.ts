import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin, circleSdk, BLOCKCHAIN } from '../_lib/clients';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

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
    const { data: identity } = await supabaseAdmin
      .from('one_identities')
      .select('user_id, handle')
      .eq('handle', handle)
      .maybeSingle();
    if (!identity) { res.status(404).json({ error: `Identity ${handle}.one not found` }); return; }
    if (identity.user_id === user.userId) { res.status(400).json({ error: 'You cannot send to yourself' }); return; }

    const { data: senderWallet } = await supabaseAdmin
      .from('wallets').select('circle_wallet_id').eq('user_id', user.userId).maybeSingle();
    if (!senderWallet) { res.status(400).json({ error: 'Sender wallet not provisioned' }); return; }

    const { data: recipientWallet } = await supabaseAdmin
      .from('wallets').select('address, circle_wallet_id').eq('user_id', identity.user_id).maybeSingle();
    if (!recipientWallet) { res.status(400).json({ error: 'Recipient has no wallet yet' }); return; }

    const balRes = await circleSdk.getWalletTokenBalance({ id: senderWallet.circle_wallet_id });
    const usdcToken = (balRes.data?.tokenBalances ?? []).find(
      (b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
    );
    if (!usdcToken?.token?.id) { res.status(400).json({ error: 'USDC token not found in sender wallet' }); return; }

    const idempotencyKey = randomUUID();

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

    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .insert({
        circle_transaction_id: circleTxId,
        sender_id: user.userId,
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

    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.userId,
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
}
