// One Chat — shared types

export type View = 'landing' | 'auth' | 'onboarding' | 'app';
export type AppTab = 'chats' | 'contacts' | 'activity' | 'channels' | 'you';
export type Theme = 'light' | 'dark';

export interface User {
  id: string;
  displayName: string;
  oneId: string; // e.g. "amara.one"
  avatar?: string;
  avatarUrl?: string;
  initials: string;
  isOnline?: boolean;
  lastSeen?: Date;
  isPro?: boolean;
  walletBalance?: number; // USDC
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'payment' | 'payment_request' | 'request' | 'gift' | 'bill_split' | 'savings_goal' | 'system';
  content: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  editedAt?: Date;
  replyToId?: string;
  isOwn: boolean;
  deliveryState: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface PaymentCard {
  amount: number;
  asset: 'USDC';
  from: string; // oneId
  to: string;   // oneId
  note?: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  direction: 'sent' | 'received' | 'requested';
  requestId?: string;
}

export interface GiftCard {
  amount: number;
  asset: 'USDC';
  fromOneId: string;
  toOneId: string;
  message?: string;
  isPublic: boolean;
  status: 'pending' | 'confirmed' | 'failed';
  postId?: string;
}

export interface BillSplitCard {
  id: string;
  title: string;
  total: number;
  asset: 'USDC';
  participants: BillParticipant[];
  createdBy: string; // oneId
  dueDate?: Date;
  status: 'active' | 'settled';
}

export interface BillParticipant {
  oneId: string;
  displayName: string;
  share: number;
  paid: boolean;
  paidAt?: Date;
}

export interface SavingsGoalCard {
  id: string;
  title: string;
  targetAmount: number;
  fundedAmount: number;
  asset: 'USDC';
  participants: { oneId: string; displayName: string; contributed: number }[];
  deadline?: Date;
  status: 'active' | 'completed';
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  oneId?: string;
  avatar?: string;
  initials: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount?: number;
  isOnline?: boolean;
  members?: string[];
  isPinned?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  creatorOneId: string;
  description: string;
  followerCount: number;
  isFollowing: boolean;
  avatar?: string;
  banner?: string;
  posts: ChannelPost[];
}

export interface ChannelPost {
  id: string;
  channelId: string;
  content: string;
  imageUrl?: string;
  publishedAt: Date;
  reactions: Record<string, number>; // emoji -> count
  giftTotal: number;
  commentsEnabled: boolean;
}

export interface Transaction {
  id: string;
  type: 'sent' | 'received' | 'request_sent' | 'request_received' | 'gift_sent' | 'gift_received';
  amount: number;
  asset: 'USDC';
  counterpartyOneId: string;
  counterpartyName: string;
  note?: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  txHash?: string;
  conversationId?: string;
}
