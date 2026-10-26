import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../_lib/clients';

const RESERVED = ['admin', 'allie', 'onechat', 'support', 'help', 'system', 'root', 'circle', 'arc'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = Array.isArray(req.query.handle) ? req.query.handle[0] : req.query.handle ?? '';
  const handle = raw.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!handle || handle.length < 3 || handle.length > 24) {
    res.status(400).json({ available: false, error: 'Handle must be 3–24 lowercase alphanumeric characters' });
    return;
  }
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
}
