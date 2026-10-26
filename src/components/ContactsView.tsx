import { useState } from 'react';
import { Search, UserPlus, MessageCircle } from 'lucide-react';
import type { User, Conversation } from '../types';
import { CONTACTS } from '../lib/mockData';

interface ContactsViewProps {
  user: User;
  onStartChat: (conv: Conversation) => void;
}

export function ContactsView({ onStartChat }: ContactsViewProps) {
  const [search, setSearch] = useState('');
  const filtered = CONTACTS.filter((c) =>
    c.displayName.toLowerCase().includes(search.toLowerCase()) ||
    c.oneId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-xl font-700" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Contacts</h1>
        <button className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'var(--surface-muted)' }}>
          <UserPlus size={15} style={{ color: 'var(--ink)' }} />
        </button>
      </div>

      <div className="px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <Search size={15} style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or .one identity..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-xs font-semibold pb-2 pt-1" style={{ color: 'var(--muted)' }}>
          ON ONE CHAT — {filtered.length}
        </p>
        <div className="space-y-1">
          {filtered.map((contact) => (
            <div key={contact.id}
              className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-all"
              style={{ border: '1px solid transparent' }}>
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                  {contact.initials}
                </div>
                {contact.isOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                    style={{ background: 'var(--success)', borderColor: 'var(--bg)' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{contact.displayName}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{contact.oneId}</div>
              </div>
              <button
                onClick={() => onStartChat({
                  id: `conv_${contact.id}`,
                  type: 'direct',
                  name: contact.displayName,
                  oneId: contact.oneId,
                  initials: contact.initials,
                  isOnline: contact.isOnline,
                })}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{ background: 'var(--surface-muted)' }}>
                <MessageCircle size={15} style={{ color: 'var(--ink)' }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
