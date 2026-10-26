import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, circleSdk } from '../_lib/clients';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('circle_wallet_id, address')
    .eq('user_id', user.userId)
    .maybeSingle();
  if (!wallet) {
    res.json({ balance: '0', address: null });
    return;
  }
  try {
    const balRes = await circleSdk.getWalletTokenBalance({ id: wallet.circle_wallet_id });
    const balances = balRes.data?.tokenBalances ?? [];
    const usdc = balances.find(
      (b) => b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
    );
    res.json({ balance: usdc?.amount ?? '0', address: wallet.address, allBalances: balances });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
