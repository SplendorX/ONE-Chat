/**
 * JWT auth helper for Vercel API handlers.
 * Returns { userId, userEmail } on success, or sends 401 and returns null.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './clients';

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ userId: string; userEmail: string | undefined } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return null;
  }
  const token = auth.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return { userId: data.user.id, userEmail: data.user.email };
}
