import { supabase } from './supabase';

export interface GroupMember {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

/** Loads members of a conversation using three plain queries (no cross-table joins). */
export async function fetchGroupMembers(conversationId: string): Promise<GroupMember[]> {
  const { data: rows } = await supabase
    .from('conversation_members')
    .select('user_id, role')
    .eq('conversation_id', conversationId);
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.user_id as string);

  const [{ data: profs }, { data: idents }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids),
    supabase.from('one_identities').select('user_id, handle').in('user_id', ids),
  ]);
  const profMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
  const handleMap = new Map((idents ?? []).map((i) => [i.user_id as string, i.handle as string]));

  return rows.map((r) => {
    const uid = r.user_id as string;
    const p = profMap.get(uid);
    const handle = handleMap.get(uid) ?? '';
    return {
      userId: uid,
      handle,
      displayName: (p?.display_name as string | undefined) ?? (handle || 'Unknown'),
      avatarUrl: (p?.avatar_url as string | null | undefined) ?? undefined,
      isAdmin: (r.role as string) === 'admin',
    };
  });
}
