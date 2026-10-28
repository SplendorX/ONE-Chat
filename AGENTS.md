# One Chat

> AI-powered messaging platform with USDC payments, ONE identities, ALLIE AI, and creator gifting.
> Built on Arc Network with Circle wallet infrastructure.

---

## What This App Does

One Chat is a premium messaging application where users can chat, send USDC, request money, split bills, save toward shared goals, gift creators, and interact with ALLIE — an AI financial assistant — all using human-readable ONE identities (e.g. amara.one).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals) — Address: 0x3600000000000000000000000000000000000000
- Fonts: Space Grotesk (display), DM Sans (body), JetBrains Mono
- Toasts: Sonner

## Build Plan Phases

- **Phase 1 (COMPLETE):** Design system (brand palette, fonts), landing page, auth (Google/email), ONE identity onboarding, app shell (mobile bottom nav + desktop 3-col)
- **Phase 2 (COMPLETE):** Messaging UI — inbox, conversation view, message bubbles, payment/bill-split cards, ALLIE chat with command suggestions
- **Phase 3 (COMPLETE):** Payments UI — send USDC sheet, request sheet, payment cards with status states, quick amounts, transaction receipts
- **Phase 4 (COMPLETE):** Group finance — bill split cards with participant tracking, channels with creator gifting (GiftSheet)
- **Phase 5 (TODO):** ALLIE: typed function registry, group @ALLIE invocation, Pro entitlement gate, LLM integration
- **Phase 6 (TODO):** Premium desktop enforcement, communities, advanced search, ALLIE side panel
- **Phase 7 (TODO):** Security hardening, production readiness
- **Phase 8 (FUTURE):** End-to-end encryption — Phase 1: AES-GCM per-conversation keys with password-based backup (solves plaintext-in-DB and key loss). Phase 2: per-device keypairs via tweetnacl-js + key distribution (solves multi-device). Phase 3: full X3DH + double ratchet via libsignal (forward secrecy, metadata protection). Decision: defer until after core social layer is stable. Key tradeoff accepted for v1: Supabase RLS policies enforce access control; messages stored as plaintext server-side.

## Key Files

- `src/App.tsx` — Composition root; manages view state (landing, auth, onboarding, app)
- `src/types.ts` — All TypeScript interfaces
- `src/lib/mockData.ts` — Demo conversations, messages, channels, transactions
- `src/lib/utils.ts` — Formatting helpers (time, USDC, dates)
- `src/components/LandingPage.tsx` — Marketing landing page
- `src/components/AuthScreen.tsx` — Google/email auth flow
- `src/components/OnboardingFlow.tsx` — 5-step ONE identity onboarding
- `src/components/AppShell.tsx` — Main app: mobile nav + desktop 3-col
- `src/components/InboxView.tsx` — Chat list with search
- `src/components/ConversationView.tsx` — Full chat with payment cards, bill splits, ALLIE
- `src/components/PaymentSheet.tsx` — Send/request USDC bottom sheet
- `src/components/ActivityView.tsx` — Transaction history + USDC balance
- `src/components/ContactsView.tsx` — Contact search by ONE identity
- `src/components/ChannelsView.tsx` — Creator channel feed + gift button
- `src/components/GiftSheet.tsx` — USDC gifting flow with privacy toggle
- `src/components/ProfileView.tsx` — Profile, wallet, settings, theme toggle

## Design Tokens (One Chat Brand)

- Warm White `#FFFFFF` · Soft Ivory `#FAF8F4` · Oat Beige `#EDE5D8` · Sand `#DCCFBD`
- Espresso `#302B26` · Warm Gray `#857D73`
- Dark BG `#171614` · Dark Surface `#22201D` · Dark Elevated `#2C2925`
- Success `#27845B` · Error `#C94B45`

## Deployed Contracts

None yet. Phase 7 will integrate real Circle wallet provisioning and USDC transfers.

## To Run

```bash
bun install
bun run dev
```
