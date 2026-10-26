import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, circleSdk } from '../../_lib/clients';
import { requireAuth } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const txId = Array.isArray(req.query.txId) ? req.query.txId[0] : req.query.txId ?? '';

  const { data: tx } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .or(`sender_id.eq.${user.userId},recipient_id.eq.${user.userId}`)
    .maybeSingle();
  if (!tx) { res.status(404).json({ error: 'Transaction not found' }); return; }
  if (!tx.circle_transaction_id) { res.json({ transaction: tx }); return; }

  try {
    const circleTx = await circleSdk.getTransaction({ id: tx.circle_transaction_id as string });
    const state = circleTx.data?.transaction?.state ?? (tx.state as string);
    const txHash = circleTx.data?.transaction?.txHash ?? (tx.tx_hash as string | null);

    if (state !== tx.state) {
      await supabaseAdmin
        .from('transactions')
        .update({ state, tx_hash: txHash, updated_at: new Date().toISOString() })
        .eq('id', tx.id);

      if (tx.message_id) {
        const { data: msg } = await supabaseAdmin
          .from('messages').select('metadata').eq('id', tx.message_id as string).maybeSingle();
        if (msg) {
          await supabaseAdmin
            .from('messages')
            .update({ metadata: { ...(msg.metadata as object), state, txHash } })
            .eq('id', tx.message_id as string);
        }
      }
    }
    res.json({ transaction: { ...tx, state, tx_hash: txHash } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
