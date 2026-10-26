import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/clients';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { handle } = req.body as { handle?: string };
  if (!handle || !/^[a-z0-9]{3,24}$/.test(handle)) {
    res.status(400).json({ error: 'Invalid handle format' });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from('one_identities')
    .select('id')
    .eq('user_id', user.userId)
    .maybeSingle();
  if (existing) {
    res.status(409).json({ error: 'You already have a ONE identity' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('one_identities')
    .insert({ user_id: user.userId, handle });
  if (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'That identity was just claimed. Please choose another.' });
    } else {
      res.status(500).json({ error: error.message });
    }
    return;
  }
  res.json({ success: true, identity: `${handle}.one` });
}
