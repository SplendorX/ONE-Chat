import type { Conversation, Message, Channel, Transaction, User } from '../types';

export const DEMO_USER: User = {
  id: 'u1',
  displayName: 'Amara',
  oneId: 'amara.one',
  initials: 'AM',
  isOnline: true,
  isPro: false,
  walletBalance: 124.50,
};

export const CONTACTS: User[] = [
  { id: 'u2', displayName: 'Daniel', oneId: 'daniel.one', initials: 'DA', isOnline: true, walletBalance: 0 },
  { id: 'u3', displayName: 'Benneth', oneId: 'benneth.one', initials: 'BE', isOnline: false, walletBalance: 0 },
  { id: 'u4', displayName: 'Sofia', oneId: 'sofia.one', initials: 'SO', isOnline: true, walletBalance: 0 },
  { id: 'u5', displayName: 'Kai', oneId: 'kai.one', initials: 'KA', isOnline: false, walletBalance: 0 },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    type: 'direct',
    name: 'Daniel',
    oneId: 'daniel.one',
    initials: 'DA',
    lastMessage: 'Sure, I\'ll send you the money now',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 3),
    unreadCount: 2,
    isOnline: true,
    isPinned: true,
  },
  {
    id: 'c2',
    type: 'group',
    name: 'Weekend Trip',
    initials: 'WT',
    lastMessage: 'ALLIE: Bill split created — $180 each',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 47),
    unreadCount: 5,
    members: ['daniel.one', 'sofia.one', 'kai.one'],
  },
  {
    id: 'c3',
    type: 'direct',
    name: 'Sofia',
    oneId: 'sofia.one',
    initials: 'SO',
    lastMessage: 'Payment received — 25 USDC',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 2),
    isOnline: true,
  },
  {
    id: 'c4',
    type: 'group',
    name: 'Apartment Fund',
    initials: 'AF',
    lastMessage: 'Goal progress: $720 / $1,200',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 5),
    members: ['benneth.one', 'sofia.one'],
  },
  {
    id: 'c5',
    type: 'direct',
    name: 'Benneth',
    oneId: 'benneth.one',
    initials: 'BE',
    lastMessage: 'Thanks for the transfer!',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
];

// Legacy mock messages — kept for reference; real app loads from Supabase
export const MESSAGES: Record<string, Message[]> = {
  c1: [
    { id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Daniel', type: 'text', content: 'Hey! Can you send me $40 for dinner?', createdAt: new Date(Date.now() - 1000 * 60 * 20), isOwn: false, deliveryState: 'read' },
    { id: 'm2', conversationId: 'c1', senderId: 'u1', senderName: 'You', type: 'text', content: 'Of course, give me a sec', createdAt: new Date(Date.now() - 1000 * 60 * 18), isOwn: true, deliveryState: 'read' },
    { id: 'm3', conversationId: 'c1', senderId: 'u1', senderName: 'You', type: 'payment', content: 'Dinner', metadata: { amount: '40', asset: 'USDC', recipientHandle: 'daniel.one', state: 'COMPLETE' }, createdAt: new Date(Date.now() - 1000 * 60 * 17), isOwn: true, deliveryState: 'read' },
    { id: 'm4', conversationId: 'c1', senderId: 'u2', senderName: 'Daniel', type: 'text', content: 'Got it, thank you!', createdAt: new Date(Date.now() - 1000 * 60 * 15), isOwn: false, deliveryState: 'read' },
    { id: 'm5', conversationId: 'c1', senderId: 'u2', senderName: 'Daniel', type: 'text', content: "Sure, I'll send you the money now", createdAt: new Date(Date.now() - 1000 * 60 * 3), isOwn: false, deliveryState: 'delivered' },
  ],
  c2: [
    { id: 'm10', conversationId: 'c2', senderId: 'u4', senderName: 'Sofia', type: 'text', content: 'Can we split the Airbnb cost?', createdAt: new Date(Date.now() - 1000 * 60 * 60), isOwn: false, deliveryState: 'read' },
    { id: 'm11', conversationId: 'c2', senderId: 'u1', senderName: 'You', type: 'bill_split', content: null, metadata: { title: 'Airbnb — Barcelona Weekend', total: 720 }, createdAt: new Date(Date.now() - 1000 * 60 * 47), isOwn: true, deliveryState: 'read' },
  ],
};

export const CHANNELS: Channel[] = [
  {
    id: 'ch1',
    name: 'Finance with Amara',
    creatorOneId: 'amara.one',
    description: 'Personal finance tips, investment strategies, and money mindset for the modern generation.',
    followerCount: 12400,
    isFollowing: true,
    posts: [
      {
        id: 'p1', channelId: 'ch1',
        content: 'The 50/30/20 rule changed how I manage my money. Here\'s how to apply it when you\'re living paycheck to paycheck — it\'s simpler than you think.',
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        reactions: { '👏': 342, '🔥': 128, '💡': 94 },
        giftTotal: 47.50,
        commentsEnabled: true,
      },
      {
        id: 'p2', channelId: 'ch1',
        content: 'Emergency fund first. Always. Before stocks, before crypto, before anything else. 3-6 months of expenses sitting in a stable account is the foundation.',
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26),
        reactions: { '👏': 891, '❤️': 203 },
        giftTotal: 102.00,
        commentsEnabled: true,
      },
    ],
  },
  {
    id: 'ch2',
    name: 'The Crypto Report',
    creatorOneId: 'kai.one',
    description: 'Daily analysis on stablecoins, DeFi protocols, and emerging blockchain infrastructure.',
    followerCount: 8920,
    isFollowing: false,
    posts: [
      {
        id: 'p3', channelId: 'ch2',
        content: 'Why USDC\'s market cap growing 40% YoY matters more than most people realize. Settlement layer for internet commerce is being quietly built.',
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
        reactions: { '🔥': 445, '👏': 217 },
        giftTotal: 63.00,
        commentsEnabled: true,
      },
    ],
  },
];

export const TRANSACTIONS: Transaction[] = [
  {
    id: 't1', type: 'sent', amount: 40, asset: 'USDC',
    counterpartyOneId: 'daniel.one', counterpartyName: 'Daniel',
    note: 'Dinner', status: 'confirmed',
    timestamp: new Date(Date.now() - 1000 * 60 * 17),
  },
  {
    id: 't2', type: 'received', amount: 25, asset: 'USDC',
    counterpartyOneId: 'sofia.one', counterpartyName: 'Sofia',
    note: 'Coffee', status: 'confirmed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: 't3', type: 'request_received', amount: 180, asset: 'USDC',
    counterpartyOneId: 'amara.one', counterpartyName: 'Amara',
    note: 'Airbnb share', status: 'pending',
    timestamp: new Date(Date.now() - 1000 * 60 * 47),
  },
  {
    id: 't4', type: 'gift_sent', amount: 5, asset: 'USDC',
    counterpartyOneId: 'amara.one', counterpartyName: 'Finance with Amara',
    note: 'Great content!', status: 'confirmed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
];
