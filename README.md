# One Chat

The next generation of messaging, powered by money. Chat with friends, send USDC, split bills, save together, and let ALLIE handle the busywork — all in one place.

Built with [Arc Studio](https://studio.arc.io)

---

## What It Does

One Chat combines messaging, USDC payments, collaborative finance, creator gifting, and an AI financial assistant into a single cohesive experience. Users get a human-readable ONE identity (e.g. `amara.one`) that works across conversations, payments, and creator discovery. The blockchain infrastructure (Arc Network, Circle wallets) stays invisible to the user.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Fonts:** Space Grotesk (display), DM Sans (body)
- **Web3:** wagmi v2, viem v2, ConnectKit
- **Chain:** Arc Testnet (Chain ID: 5042002) — USDC as native gas
- **Wallet infrastructure:** Circle developer-controlled wallets (Phase 7)

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1+

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `CIRCLE_API_KEY` | Circle Standard Developer API Key for wallet operations | Phase 7+ |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret for developer-controlled wallets | Phase 7+ |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL (optional outside Arc Studio) | No |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy auth token | No |
| `RPC_PROXY_CHAINS` | Comma-separated chain keys for the proxy | No |

### Run

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
bun run build
```

### Lint & Typecheck

```bash
bun run check
```

## Features

- **Landing page** — Marketing page with product mockup hero, feature sections, Arc/Circle infrastructure explainer
- **Authentication** — Google OAuth and email magic-link sign-in
- **ONE identity onboarding** — 5-step flow: welcome, claim identity (`name.one`), profile photo, wallet setup, meet ALLIE
- **Messaging** — Inbox with search, real-time-style conversation view, message bubbles, typing indicator, reactions
- **USDC payments** — Send/request sheets with quick amounts, review confirmation, payment cards in conversation
- **Bill splitting** — Group bill split cards with per-participant tracking and progress bar
- **Activity feed** — Unified transaction history with USDC balance display
- **Channels** — Creator content feed with USDC gifting (public/private attribution, gift messages)
- **ALLIE** — Dedicated AI assistant conversation with structured command suggestions (free tier)
- **Light/dark theme** — Intentional warm-neutral light and deep-charcoal dark modes
- **Responsive layout** — Mobile bottom nav + desktop 3-column workspace

## Build Phases

1. **Phase 1–4 (Done):** Foundation, messaging, payments, group finance, channels, gifting
2. **Phase 5 (Next):** ALLIE typed function registry, Pro entitlement gate, LLM integration
3. **Phase 6:** Premium desktop enforcement, communities, advanced search
4. **Phase 7:** Circle wallet integration, real USDC transfers, security hardening
