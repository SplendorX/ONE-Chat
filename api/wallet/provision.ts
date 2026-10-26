import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, circleSdk, BLOCKCHAIN } from '../_lib/clients';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

  // Idempotent — return existing wallet if already provisioned
  const { data: existing } = await supabaseAdmin
    .from('wallets')
    .select('*')
    .eq('user_id', user.userId)
    .maybeSingle();
  if (existing) {
    res.json({ wallet: existing });
    return;
  }

  try {
    const wsRes = await circleSdk.createWalletSet({ name: `one-chat-user-${user.userId}` });
    const walletSetId = wsRes.data?.walletSet?.id;
    if (!walletSetId) throw new Error('No walletSetId returned');

    const wRes = await circleSdk.createWallets({
      accountType: 'EOA',
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId,
    });
    const wallet = wRes.data?.wallets?.[0];
    if (!wallet) throw new Error('No wallet returned');

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('wallets')
      .insert({
        user_id: user.userId,
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
}
