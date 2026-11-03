import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, UserPlus, UserMinus, LogOut, Camera, Loader2, Check, Search } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Conversation } from '../types';
import { supabase } from '../lib/supabase';
import { post } from '../lib/api';
import { fetchGroupMembers } from '../lib/members';

interface Member {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

interface GroupSettingsSheetProps {
  conversation: Conversation;
  session: Session;
  onClose: () => void;
  onLeft: () => void;
  onNameChanged: (name: string) => void;
}

export function GroupSettingsSheet({ conversation, session, onClose, onLeft, onNameChanged }: GroupSettingsSheetProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [groupName, setGroupName] = useState(conversation.name);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [error, setError] = useState('');
  const [leavingGroup, setLeavingGroup] = useState(false);

  const myId = session.user.id;

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    const list = await fetchGroupMembers(conversation.id);
    setMembers(list);
    setLoadingMembers(false);
  }, [conversation.id]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  // Search users to add
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const q = searchQuery.trim().replace(/\.one$/, '');
      const { data } = await supabase
        .from('one_identities')
        .select('user_id, handle, profiles(display_name, avatar_url)')
        .ilike('handle', `%${q}%`)
        .limit(8);
      if (data) {
        const existingIds = new Set(members.map((m) => m.userId));
        setSearchResults(
          data
            .filter((r) => (r.user_id as string) !== myId && !existingIds.has(r.user_id as string))
            .map((r) => {
              const p = r.profiles as { display_name?: string; avatar_url?: string } | null;
              return { userId: r.user_id as string, handle: r.handle as string, displayName: p?.display_name ?? r.handle as string, avatarUrl: p?.avatar_url ?? undefined };
            })
        );
      }
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, members, myId]);

  async function saveName() {
    if (!groupName.trim() || groupName.trim() === conversation.name) { setEditingName(false); return; }
    setSavingName(true);
    const { error: err } = await supabase
      .from('conversations')
      .update({ name: groupName.trim() })
      .eq('id', conversation.id);
    setSavingName(false);
    if (err) { setError('Could not update name'); return; }
    onNameChanged(groupName.trim());
    setEditingName(false);
  }

  async function addMember(member: Member) {
    setError('');
    try {
      await post('/group/add-member', { conversationId: conversation.id, userId: member.userId });
      setMembers((prev) => [...prev, member]);
      setSearchResults((prev) => prev.filter((r) => r.userId !== member.userId));
      setSearchQuery('');
      setShowAddSearch(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member');
    }
  }

  async function removeMember(memberId: string) {
    if (!window.confirm('Remove this member from the group?')) return;
    setError('');
    try {
      await post('/group/remove-member', { conversationId: conversation.id, userId: memberId });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member');
    }
  }

  async function leaveGroup() {
    if (!window.confirm('Leave this group? You won\'t see new messages.')) return;
    setLeavingGroup(true);
    setError('');
    try {
      await post('/group/remove-member', { conversationId: conversation.id, userId: myId });
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave group');
      setLeavingGroup(false);
    }
  }

  const amAdmin = members.find((m) => m.userId === myId)?.isAdmin ?? false;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full flex flex-col rounded-t-3xl overflow-hidden"
          style={{ background: 'var(--surface-overlay)', maxWidth: 520, maxHeight: '90dvh' }}>

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="font-semibold text-base" style={{ color: 'var(--ink)' }}>Group settings</div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-muted)', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {error && (
              <div className="text-sm px-3 py-2 rounded-xl" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}>{error}</div>
            )}

            {/* Group avatar + name */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-2xl font-bold"
                  style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                  {(groupName || conversation.name).slice(0, 1).toUpperCase()}
                </div>
                {amAdmin && (
                  <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--gold)', border: '2px solid var(--surface-overlay)', cursor: 'pointer' }}>
                    <Camera size={13} color="var(--bg)" />
                  </button>
                )}
              </div>
              {editingName ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <input
                    autoFocus
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setEditingName(false); }}
                    className="flex-1 text-center font-semibold text-base rounded-xl px-3 py-2"
                    style={{ background: 'var(--surface-input)', border: '1px solid var(--border)', color: 'var(--ink)', outline: 'none' }}
                  />
                  <button onClick={() => void saveName()} disabled={savingName}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--gold)', border: 'none', cursor: 'pointer' }}>
                    {savingName ? <Loader2 size={14} color="var(--bg)" className="animate-spin" /> : <Check size={14} color="var(--bg)" />}
                  </button>
                </div>
              ) : (
                <button onClick={() => amAdmin && setEditingName(true)}
                  className="font-semibold text-base text-center"
                  style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: amAdmin ? 'pointer' : 'default' }}>
                  {groupName}
                  {amAdmin && <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>✏️</span>}
                </button>
              )}
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{members.length} members</div>
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  <Users size={14} style={{ color: 'var(--gold)' }} />Members
                </div>
                {(
                  <button onClick={() => setShowAddSearch((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: 'none', cursor: 'pointer' }}>
                    <UserPlus size={12} />Add
                  </button>
                )}
              </div>

              {/* Add member search */}
              <AnimatePresence>
                {showAddSearch && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-3">
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by .one handle"
                        className="w-full pl-8 pr-3 py-2 rounded-xl text-sm"
                        style={{ background: 'var(--surface-input)', border: '1px solid var(--border)', color: 'var(--ink)', outline: 'none' }}
                      />
                    </div>
                    {searching && <div className="text-xs text-center py-2" style={{ color: 'var(--muted)' }}>Searching…</div>}
                    {searchResults.map((r) => (
                      <button key={r.userId} onClick={() => void addMember(r)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-muted)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                          {r.displayName.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.displayName}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>@{r.handle}</div>
                        </div>
                        <UserPlus size={14} style={{ color: 'var(--gold)' }} />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {loadingMembers ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--muted)' }} />
                </div>
              ) : (
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-3 px-2 py-2.5 rounded-xl"
                      style={{ background: m.userId === myId ? 'var(--surface-muted)' : 'transparent' }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
                        style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : m.displayName.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                          {m.displayName}{m.userId === myId ? ' (you)' : ''}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                          @{m.handle}{m.isAdmin ? ' · admin' : ''}
                        </div>
                      </div>
                      {amAdmin && m.userId !== myId && (
                        <button onClick={() => void removeMember(m.userId)}
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--surface-muted)', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                          <UserMinus size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leave group */}
            <div className="pt-2 pb-4">
              <button
                onClick={() => void leaveGroup()}
                disabled={leavingGroup}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                {leavingGroup ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Leave group
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
