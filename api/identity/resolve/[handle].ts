import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../_lib/clients';
import { requireAuth } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const raw = Array.isArray(req.query.handle) ? req.query.handle[0] : req.query.handle ?? '';
  const handle = raw.toLowerCase().replace(/\.one$/, '');

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
}
