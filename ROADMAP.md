# OpenEscrow — ROADMAP

> Single source of truth for project phase status and future direction.
> Updated by lead after every phase completion or milestone.
>
> Last updated: 2026-04-17

---

## Project State Summary

| Milestone                           | Status                                          | Date       |
| ----------------------------------- | ----------------------------------------------- | ---------- |
| MVP (Phases 0–4) built and reviewed | ✅ Complete                                     | 2026-02-27 |
| Public repo cleanup + CI stability  | ✅ Complete                                     | 2026-03-07 |
| Docker VPS deployment hardening     | ✅ Complete                                     | 2026-03-09 |
| Sepolia contract deployment         | ✅ Complete                                     | 2026-03-09 |
| Live production instance            | ✅ Live at https://openescrow.smarthinking.tech | 2026-03-09 |
| Improvement Phase I (current)       | 🔄 In Progress                                  | 2026-03-27 |

---

## Phase History

### Phase 0 — Repo Bootstrap ✅

- pnpm monorepo + Turborepo, root tsconfig strict mode
- Shared ESLint + Prettier, GitHub Actions CI
- Docker Compose (postgres + api + web + bot), `.env.example`
- `packages/shared/` scaffold (types + ABIs)

### Phase 1 — Smart Contracts ✅

- `contracts/src/OpenEscrow.sol` — Solidity 0.8.24
- OpenZeppelin: ReentrancyGuard, SafeERC20, Ownable
- 7 on-chain events, cancel refund rules, NatSpec on every function
- 69/69 Hardhat tests passing
- ABI exported to `packages/shared/src/abis/OpenEscrow.json`
- **Deployed:** Sepolia testnet (address in `.env`)

### Phase 2 — Backend API ✅

- Fastify + TypeScript strict + pino structured logging
- Drizzle ORM + PostgreSQL — all 7 tables, migrations
- SIWE auth + JWT, 16 API routes (see HANDOFF.md)
- Chain indexer: `eth_getLogs` every 12 seconds
- Telegram OTP linking (15-min expiry)
- 65/65 Vitest tests passing

### Phase 3 — Web Dashboard ✅

- Next.js 14 App Router + Tailwind CSS
- wagmi v2 + viem + RainbowKit wallet connection
- Client flows: create deal, fund on-chain, approve/reject milestone
- Freelancer flows: agree to deal, submit milestone, view feedback
- Telegram linking page
- 77/77 Vitest tests passing

### Phase 4 — Telegram Bot ✅

- Telegraf + TypeScript + pino
- Commands: `/start`, `/link`, `/deals`, `/status <dealId>`
- `isLinked()` guard on every command entry point
- Notification polling every 30 seconds
- 54/54 Vitest tests passing

### Integration & Review ✅

- Pass 1: `pnpm lint` + `pnpm test` + `pnpm build` — all green (265/265 tests)
- Pass 2: Full code review checklist — all items resolved
- `HANDOFF.md` written

### Post-MVP: Docker VPS Deployment ✅ (2026-03-09)

- Next.js standalone output + `outputFileTracingRoot` for monorepo
- Dockerfile entry points corrected (`dist/src/index.js`)
- Docker Compose updated for VPS subdomain routing
- API migration path fixed for Docker runtime
- Single-click wallet sign-in fix
- pgAdmin added as dev tool

---

## Improvement Phase I — Complete (2026-03-27)

These improvements are being applied before moving to Phase 5 (AI Layer).

| #    | Improvement                                         | Status         | Notes                                              |
| ---- | --------------------------------------------------- | -------------- | -------------------------------------------------- |
| I-1  | ROADMAP.md                                          | ✅ Done        | This file                                          |
| I-2  | Multi-chain support (Sepolia / ETH / BNB / Polygon) | 🔄 In Progress | Config-driven, one chain per deployment            |
| I-3a | Dashboard: two CTAs when Telegram not connected     | 🔄 In Progress | Banner on /deals with Create Deal + Connect Bot    |
| I-3b | Help page: Deal Lifecycle section                   | 🔄 In Progress | Full state machine table above Milestone Lifecycle |
| I-3c | Click-to-copy for codes in web + Telegram bot       | 🔄 In Progress | CopyButton component + bot monospace formatting    |
| I-3d | New Deal: wallet validation + tx count + balance    | ✅ Done        | Debounced viem lookup after address entry          |

---

## Improvement Phase II — Complete (2026-03-27)

Fixes and enhancements discovered during live testing.

| #    | Improvement                             | Status  | Notes                                                                                     |
| ---- | --------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| II-1 | Fix wallet reconnect on page refresh    | ✅ Done | AuthProvider hasMountedRef guard fixes race with wagmi reconnect                          |
| II-2 | Fix tx count label (nonce ≠ total txns) | ✅ Done | Relabelled "Sent Txns" with tooltip                                                       |
| II-3 | Mobile responsive deal detail page      | ✅ Done | grid-cols-1 sm:grid-cols-2, truncate + title on addresses                                 |
| II-4 | USDC/USDT balance in Navbar             | ✅ Done | TokenBalances.tsx via useReadContract; shown when connected                               |
| II-5 | Real-time notifications + auto-refresh  | ✅ Done | NotificationProvider (30s poll) + NotificationBell + ToastContainer + deal:updated events |

---

## Improvement Phase III — Complete (2026-04-05)

> Improvement Phase II confirmed complete. III-2 was shipped in Phase II.

| #     | Feature                                                                  | Priority | Status  | Notes                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------ | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| III-1 | Client↔Freelancer chat per deal                                          | Medium   | ✅ Done | Privacy relay via Telegram bot. Messages stored permanently in DB. Web panel shows read-only history with 🧑‍💼/🛠️ icons + Load older pagination. Bot poller sends MESSAGE_RECEIVED notifications with Open Chat button. |
| III-2 | Bot session persistence (survive restarts)                               | High     | ✅ Done | Shipped in Improvement Phase II — bot calls GET /telegram/bot-sessions on startup to restore sessions.                                                                                                                |
| III-3 | Telegram notifications for Completed/Cancelled status too (both parties) | Medium   | ✅ Done | Removed COMPLETED/CANCELLED filter in notifier.ts; final events now delivered to both parties.                                                                                                                        |
| III-4 | Mobile hamburger nav menu                                                | Low      | ✅ Done | Hamburger toggle + dropdown panel in Navbar.tsx; auto-closes on route change.                                                                                                                                         |
| III-5 | Deal sharing link (shareable URL for freelancer to accept)               | Medium   | ✅ Done | /deals/accept/[id] invitation page + Share Link button on deal detail (client, DRAFT) + post-auth redirect.                                                                                                           |

---

## Improvement Phase IV — In Progress

Privacy, identity, and administration layer.

| #    | Feature                            | Priority | Status         | Notes                                                                                                                                                                                                                                           |
| ---- | ---------------------------------- | -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IV-1 | Platform usernames + privacy model | High     | 🔄 In Progress | Auto-generated 8-char alphanumeric username per user. User-changeable (4–10 chars, unique). Wallet/Telegram IDs hidden from counterparty. Usernames shown on all deal views, bot, and timeline. DB migration 0002 required.                     |
| IV-2 | Admin dashboard + settings         | Medium   | ⏸️ Planned     | Admin-only UI: user list (username, userId, wallet, Telegram), deal browser, deal event audit log, reporting. Configurable "Confidentiality" setting (hides all counterparty identifiers when enabled). Backend: admin role + protected routes. |

---

## Phase 5 — AI Clarity Layer ⏸️ (Post Improvement Phase II)

> Do not start until Improvement Phase I is complete.

- Milestone draft suggestions via LLM
- Submission summary generation
- Rejection revision notes generation
- AI adapter in `apps/api/src/ai/` (placeholder directory exists)
- OpenAI API via adapter with timeout + retry + error handling
- AI outputs are suggestions only — humans approve/reject every output

---

## Phase 6 — Hardening ⏸️ (Post Phase 5)

> Do not start until Phase 5 is complete and reviewed.

- Per-user rate limiting (Redis-backed)
- Circuit breakers for RPC and Telegram API calls
- Monitoring + alerting (Prometheus / Grafana or equivalent)
- End-to-end Playwright test suite
- Security review checklist
- Gas optimizations on smart contract
- Professional security audit preparation

---

## Phase 7 — Mainnet Launch ⏸️ (Post Phase 6 + Audit)

> Requires successful professional security audit.

- Deploy `OpenEscrow.sol` to Ethereum mainnet
- Deploy to BNB Smart Chain and Polygon Mainnet
- Update `.env` / CI for mainnet chain IDs and addresses
- Update RainbowKit chain configuration for mainnet-first
- Real USDC/USDT addresses per chain
- Remove testnet warnings from UI
- Legal review (terms of service, jurisdiction)

---

## Supported Chains (Configuration-Driven)

OpenEscrow uses a **one chain per deployment** model. The active chain is set via
environment variables. The same codebase can target any of the following chains
by changing `.env` values — no code changes required.

| Chain                      | Chain ID   | Status         | Notes                         |
| -------------------------- | ---------- | -------------- | ----------------------------- |
| Ethereum Sepolia (testnet) | `11155111` | ✅ Active      | Current production deployment |
| Ethereum Mainnet           | `1`        | ⏸️ After audit | Requires Phase 7              |
| BNB Smart Chain Mainnet    | `56`       | ⏸️ After audit | Requires Phase 7              |
| Polygon Mainnet            | `137`      | ⏸️ After audit | Requires Phase 7              |

To switch chains, update these `.env` variables:

```
CHAIN_ID=<chain_id>
CONTRACT_ADDRESS=<deployed_contract_address_on_that_chain>
RPC_URL=<rpc_endpoint_for_that_chain>
USDC_ADDRESS=<usdc_address_on_that_chain>
USDT_ADDRESS=<usdt_address_on_that_chain>
NEXT_PUBLIC_CHAIN_ID=<chain_id>
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed_contract_address>
NEXT_PUBLIC_RPC_URL=<public_rpc_endpoint>
NEXT_PUBLIC_USDC_ADDRESS=<usdc_address>
NEXT_PUBLIC_USDT_ADDRESS=<usdt_address>
```

---

## Known Limitations (MVP Scope — Will Not Fix Before Phase 5)

- Bot sessions are in-memory only (lost on restart). Users must re-link after bot restart.
- Chain indexer processes only `DealFunded` and `DealCancelled` events. `MilestoneApproved`
  on-chain is triggered by the web frontend directly (see `DECISIONS.md` DEC-005).
- No arbitration, no council, no third-party dispute resolution (by design — see `CONTRIBUTING_RULES.md` Section C).
- No email/password auth (by design — wallet sign-in only).
- OTP linking requires both web and Telegram bot interaction.

---

## File Locations Quick Reference

| What                   | Where                                         |
| ---------------------- | --------------------------------------------- |
| Engineering spec       | `CONTRIBUTING_RULES.md`                       |
| Architecture decisions | `DECISIONS.md`                                |
| Build status           | `STATUS.md`                                   |
| Handoff doc            | `HANDOFF.md`                                  |
| Blocker log            | `BLOCKERS.md`                                 |
| Smart contract         | `contracts/src/OpenEscrow.sol`                |
| API entry point        | `apps/api/src/index.ts`                       |
| Deal state machine     | `apps/api/src/modules/deals/deals.service.ts` |
| DB schema              | `apps/api/src/database/schema.ts`             |
| Chain indexer          | `apps/api/src/chain/indexer.ts`               |
| Web API client         | `apps/web/src/lib/api-client.ts`              |
| Bot API client         | `apps/bot/src/api-client/index.ts`            |
| Shared types           | `packages/shared/src/types/index.ts`          |
| Contract ABI           | `packages/shared/src/abis/OpenEscrow.json`    |
