# CONTRIBUTING_RULES.md — OpenEscrow Engineering Specification

> This is the single source of truth for all engineering decisions, the tech stack,
> the state machine, the build order, naming conventions, database schema, and API routes.
> Read it completely before writing a single line of code.

---

## A) PROJECT IDENTITY

**OpenEscrow** — open-source, milestone-based on-chain escrow for freelancers & Web3 projects.
Clients and freelancers agree on milestones, lock funds (USDC/USDT) via smart contract,
and complete work with fewer disputes.

- **Repo:** https://github.com/baties/OpenEscrow
- **Primary interface:** Web dashboard (Next.js)
- **Secondary interface:** Telegram bot
- **Single source of truth:** Backend API (all state, roles, audit trail)

---

## B) GOAL (Success Metric)

Contributors are expected to produce **working, tested, production-quality code** that:

- Follows the monorepo structure and tech stack defined below
- Implements one milestone at a time (see Roadmap section)
- Ships the simplest correct implementation — no over-engineering
- Passes lint + tests before any PR/commit
- Is self-hostable via Docker Compose from day one

---

## C) MVP DECISIONS (Non-Negotiable)

These are locked. Do NOT change, expand, or "improve" them without explicit permission.
If you believe a decision should change, open a GitHub discussion issue first.

| Decision               | Rule                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stack**              | TypeScript everywhere (backend, web, bot). Solidity for contracts.                                                                                                       |
| **Assets**             | USDC and USDT only. No native tokens, no other ERC-20s in MVP.                                                                                                           |
| **Dispute handling**   | Approve/reject + revision loop only. No arbitration, no council, no voting.                                                                                              |
| **Interfaces**         | Web = primary. Telegram = secondary. Both are API clients only.                                                                                                          |
| **Auth**               | Wallet sign-in (SIWE). Magic link deferred to post-MVP. No email/password ever.                                                                                          |
| **Telegram linking**   | One-time code from bot → submitted on web dashboard → backend links Telegram user ID. OTP expires after 15 minutes.                                                      |
| **AI role**            | Clarity + productivity tool (milestone drafts, summaries, revision notes). AI is NOT a decision-maker or judge.                                                          |
| **Backend authority**  | API is the single source of truth. Bot and Web never bypass the API.                                                                                                     |
| **Database**           | PostgreSQL for production. SQLite for unit test fixtures only.                                                                                                           |
| **Deployment**         | Docker + Docker Compose. Single-server MVP.                                                                                                                              |
| **Target chain**       | EVM-compatible testnet (Sepolia). Mainnet only after audit.                                                                                                              |
| **Chain indexer**      | Poll `eth_getLogs` every 12 seconds. No WebSocket for MVP.                                                                                                               |
| **Cancel refund rule** | DRAFT/AGREED cancel → no funds to refund (not yet deposited). FUNDED cancel → all unreleased milestone amounts returned to client. Released milestones are irreversible. |

---

## D) MONOREPO STRUCTURE

```
OpenEscrow/
├── apps/
│   ├── api/              # Backend API (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── config/         # Env parsing + validation (Zod)
│   │   │   ├── modules/        # Feature modules (deals, milestones, auth, telegram-link)
│   │   │   │   └── deals/
│   │   │   │       ├── deals.controller.ts
│   │   │   │       ├── deals.service.ts
│   │   │   │       ├── deals.router.ts
│   │   │   │       └── deals.schema.ts    # Zod validation
│   │   │   ├── middleware/     # Auth, error handling, rate limiting
│   │   │   ├── database/       # Migrations, schema, repositories
│   │   │   ├── chain/          # On-chain event indexer, contract interaction
│   │   │   ├── ai/             # LLM adapter — Phase 5 only, do not implement before then
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/              # Frontend (Next.js + React)
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router pages
│   │   │   ├── components/     # React components
│   │   │   ├── hooks/          # Custom hooks (useDeals, useWallet, etc.)
│   │   │   ├── lib/            # API client, utils, types
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── bot/              # Telegram Bot (TypeScript)
│       ├── src/
│       │   ├── config/         # Env + bot config
│       │   ├── commands/       # Bot command handlers
│       │   ├── callbacks/      # Inline keyboard callbacks
│       │   ├── api-client/     # Calls to apps/api (never direct DB)
│       │   └── index.ts
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── contracts/            # Solidity smart contracts
│   ├── src/
│   │   └── OpenEscrow.sol
│   ├── test/
│   ├── scripts/          # Deploy + verify scripts
│   ├── hardhat.config.ts
│   └── package.json
├── packages/
│   └── shared/           # Types, constants, ABIs shared across apps
│       ├── src/
│       │   ├── abis/           # Exported contract ABIs
│       │   └── types/          # Shared TypeScript types
│       └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
├── CONTRIBUTING.md
├── CONTRIBUTING_RULES.md  # This file
├── LICENSE
├── DECISIONS.md           # Architecture decisions log
└── ROADMAP.md             # Phase tracker
```

---

## E) TECH STACK (Specific Choices)

| Layer               | Library / Tool                                                        | Notes                                                                  |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Monorepo**        | pnpm workspaces + Turborepo                                           | `pnpm-workspace.yaml` at root                                          |
| **Smart Contracts** | Solidity 0.8.x + Hardhat                                              | OpenZeppelin: ReentrancyGuard, SafeERC20, Ownable                      |
| **Backend**         | Fastify + TypeScript                                                  | Prefer Fastify; Express only if Fastify causes a documented blocker    |
| **ORM / DB**        | Drizzle ORM + PostgreSQL                                              | drizzle-kit for migrations; type-safe queries required                 |
| **Validation**      | Zod                                                                   | Every API input + every env config validated via Zod schemas           |
| **Auth**            | SIWE (Sign-In With Ethereum)                                          | ethers.js for signature verification; JWT for session                  |
| **Frontend**        | Next.js 14+ (App Router) + Tailwind CSS                               | wagmi + viem + RainbowKit for wallet connection                        |
| **Telegram Bot**    | Telegraf (TypeScript)                                                 | Default per engineering rules                                          |
| **Logging**         | pino                                                                  | Structured JSON logging from Phase 2 onwards — not deferred to Phase 6 |
| **AI**              | OpenAI API via adapter                                                | Behind adapter in `apps/api/src/ai/` — Phase 5 only                    |
| **Testing**         | Vitest (API + bot) · Hardhat (contracts) · Playwright (e2e, optional) |                                                                        |
| **Linting**         | ESLint + Prettier                                                     | Shared config at root                                                  |
| **CI**              | GitHub Actions                                                        | Lint → Test → Build on every PR                                        |

---

## F) ENGINEERING RULES

### Hard rules — do not violate under any circumstance

1. **Never add a dependency without justification.**
   Explain in a code comment or PR description: why this dep, what alternatives exist,
   what the security impact is, what the bundle cost is.

2. **Never hardcode secrets, RPC endpoints, API keys, or private keys.**
   Use `.env` + Zod config loader. Every secret is typed, validated at startup.

3. **Never log sensitive data.**
   No private keys, tokens, OTPs, signatures, full wallet balances, or raw request
   bodies containing secrets. Use pino `redact` config for known sensitive field names.

4. **Every external call must have: timeout + retry/backoff + error handling.**
   This applies to: RPC (`eth_getLogs`), Telegram Bot API, OpenAI API.
   Minimum: 10s timeout, 3 retries with exponential backoff, typed error on failure.

5. **No silent failures.**
   No empty catch blocks. No ignored promise rejections. No swallowed errors.
   If you catch an error and don't rethrow it, you must log it with full context.

6. **TypeScript strict mode everywhere.**
   `strict: true` in all `tsconfig.json` files.
   No `any` type without an explicit inline comment justifying it.

7. **Validate every input.**
   API params and request bodies → Zod schemas.
   Telegram command arguments → validated in command handler middleware.
   Webhook payloads → Zod schemas before processing.

8. **JSDoc/TSDoc required on EVERY function and method — no exceptions.**
   Every function must include:

   ```ts
   /**
    * Brief one-line description of what this function does.
    *
    * @param paramName - description of what this param is and valid values
    * @returns description of what is returned and under what condition
    * @throws {ErrorType} description of when and why this throws
    */
   ```

   This applies to: service methods, controller handlers, utility functions,
   Solidity functions (NatSpec), React hooks, React component props interfaces.

9. **Module-level comment required on every file.**
   Every `.ts`, `.tsx`, `.sol` file must start with a block comment explaining:
   - What this module is and what it belongs to
   - What it owns/handles
   - What it does NOT do (boundaries — prevents scope creep)

   ```ts
   /**
    * deals.service.ts — OpenEscrow API
    *
    * Business logic for deal lifecycle management.
    * Handles: create, read, state transitions, audit event emission.
    * Does NOT: interact with the blockchain directly (see chain/indexer.ts),
    *            send Telegram notifications (triggered by API consumers).
    */
   ```

10. **No god files.**
    If a file exceeds ~300 lines or handles more than one clear responsibility, split it.

11. **Structured logging with pino — not optional.**
    Every significant operation must be logged with:
    - Correct log level: `info` for normal, `warn` for recoverable issues, `error` for failures
    - Structured fields: always include `module` and `operation`, plus all relevant IDs
    - Example:
      ```ts
      logger.info({ module: 'deals.service', operation: 'createDeal', clientId, freelancerId });
      logger.error({
        module: 'chain.indexer',
        operation: 'pollEvents',
        blockFrom,
        blockTo,
        error: err.message,
      });
      ```
    - Never log: `logger.error(err)` alone — always include context fields

12. **Descriptive error handling in every catch block.**
    Every `try/catch` must:
    - Log the error with: `module`, `operation`, all relevant IDs, `error.message`
    - Return or throw a typed, descriptive error — never a raw string
    - Never be empty — zero-tolerance for `catch (e) {}`
    - Example pattern:
      ```ts
      try {
        await someOperation();
      } catch (err) {
        logger.error({
          module: 'milestones.service',
          operation: 'approveMilestone',
          milestoneId,
          dealId,
          actorId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new AppError('MILESTONE_APPROVE_FAILED', 'Failed to approve milestone', {
          milestoneId,
        });
      }
      ```

### Smart contract rules

- Use OpenZeppelin: `ReentrancyGuard`, `SafeERC20`, `Ownable` (or `AccessControl`).
- All state changes emit events (required for the API indexer).
- Fail closed on ambiguous state — if in doubt, revert.
- NatSpec comments on every Solidity function (`@notice`, `@param`, `@return`, `@dev`).
- Private keys: loaded from env, kept in-memory, never logged. Signing in a dedicated module.
- Target: Sepolia testnet. Mainnet only after professional audit.

### API rules

- Backend API is the single authority. Bot and Web are clients only.
- All deal state transitions go through the API — never bypass.
- Role-based access: client vs. freelancer enforced in middleware, not scattered in service layer.
- Audit trail: every action appended to `deal_events` with timestamp, actor_id, event_type, deal_id, metadata.
- CORS configured for web dashboard origin only — no wildcard `*` in production.
- Invalid state transitions return `400` with:
  ```json
  { "error": "INVALID_TRANSITION", "from": "DRAFT", "to": "APPROVED" }
  ```

### Telegram bot rules

- Bot calls the API for every action. No direct DB access. No direct chain interaction.
- Every command handler entry point: check `isLinked(ctx.from.id)` first.
  If not linked → send instructions to use `/link`, return immediately.
- Role checks are enforced by the API; bot reflects API errors in user-friendly messages.
- All bot actions include `telegram_user_id` in API calls for audit trail logging.

### AI rules (Phase 5 only — do not implement before Phases 0–4 complete)

- AI is a productivity tool, not a decision-maker.
- All LLM calls go through `apps/api/src/ai/` adapter with timeout + error handling.
- Never send private keys, wallet addresses with balances, or personal data to LLM.
- Prompt-injection resistance: sanitize all user input before including in prompts.
- AI outputs are suggestions — humans approve/reject every AI-generated output.

---

## G) DEAL STATE MACHINE

```
DRAFT → AGREED → FUNDED → [per milestone: SUBMITTED → APPROVED / REJECTED] → COMPLETED
                                              ↑                    |
                                              └─── REVISION ◄──────┘ (auto on reject)

CANCELLED (from DRAFT, AGREED, or FUNDED — refund rules from Section C apply)
```

### State transition table

| From                      | To          | Who triggers                 | API endpoint                          |
| ------------------------- | ----------- | ---------------------------- | ------------------------------------- |
| `DRAFT`                   | `AGREED`    | Freelancer confirms          | `POST /api/v1/deals/:id/agree`        |
| `AGREED`                  | `FUNDED`    | On-chain deposit detected    | Indexer → internal update             |
| `FUNDED`                  | `SUBMITTED` | Freelancer submits milestone | `POST /api/v1/milestones/:id/submit`  |
| `SUBMITTED`               | `APPROVED`  | Client approves              | `POST /api/v1/milestones/:id/approve` |
| `SUBMITTED`               | `REJECTED`  | Client rejects               | `POST /api/v1/milestones/:id/reject`  |
| `REJECTED`                | `REVISION`  | System (auto)                | Internal — set by API on reject       |
| `REVISION`                | `SUBMITTED` | Freelancer resubmits         | `POST /api/v1/milestones/:id/submit`  |
| Any eligible              | `CANCELLED` | Either party (rules apply)   | `POST /api/v1/deals/:id/cancel`       |
| Last milestone `APPROVED` | `COMPLETED` | System (auto)                | Internal — set by API                 |

### States

| State       | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `DRAFT`     | Deal created by client, awaiting freelancer agreement          |
| `AGREED`    | Freelancer confirmed milestones and acceptance criteria        |
| `FUNDED`    | Client deposited funds to smart contract (detected by indexer) |
| `SUBMITTED` | Freelancer submitted milestone deliverables                    |
| `APPROVED`  | Client approved milestone; on-chain funds released             |
| `REJECTED`  | Client rejected with structured reasons                        |
| `REVISION`  | Freelancer revising after rejection (auto-set)                 |
| `COMPLETED` | All milestones approved, deal finished (auto-set)              |
| `CANCELLED` | Deal cancelled; refund rules applied                           |

---

## H) DEVELOPMENT WORKFLOW (Build Order)

> **MVP v1 = Phases 0–4.** Phases 5–6 are post-MVP. Do NOT start them until 0–4 are complete.

### Phase 0 — Repo Bootstrap

1. Initialize pnpm monorepo with `pnpm-workspace.yaml`
2. Create directory structure per Section D
3. Add root `tsconfig.json` (base, `strict: true`), per-app tsconfigs extending it
4. Add root ESLint + Prettier config (shared across all packages)
5. Add `docker-compose.yml` (Postgres + api + web + bot services + volumes)
6. Add `.env.example` with all variables documented and example values
7. Add GitHub Actions CI: lint → test → build on every PR
8. Add `turbo.json` for build orchestration
9. Add `packages/shared/` package scaffold with src/abis/ and src/types/

### Phase 1 — Smart Contracts

1. Write `OpenEscrow.sol`: createDeal, deposit, submitMilestone, approveMilestone, rejectMilestone, cancelDeal
2. Support USDC + USDT (ERC-20 via SafeERC20)
3. Emit all events: `DealCreated`, `DealFunded`, `MilestoneSubmitted`, `MilestoneApproved`, `MilestoneRejected`, `FundsReleased`, `DealCancelled`
4. Implement cancel refund rules from Section C
5. NatSpec comments on every function
6. Hardhat tests: happy path + edge cases + reentrancy + cancel from each state + unauthorized callers
7. Deploy script for Sepolia
8. Export ABI to `packages/shared/src/abis/` and TypeScript types to `packages/shared/src/types/`

### Phase 2 — Backend API

1. Set up Fastify with TypeScript + pino structured logging
2. Zod config loader for all env vars (fail at startup if invalid)
3. Drizzle ORM + PostgreSQL schema + migrations (all 7 tables from Section J)
4. Auth: SIWE nonce → signature verify → JWT issue
5. Deal CRUD: create, get, list, agree (freelancer confirms), cancel
6. Milestone endpoints: submit, approve, reject
7. Chain indexer: poll `eth_getLogs` every 12s, update DB state on events
8. Telegram linking: generate OTP (15-min expiry), verify OTP, link user ID, unlink
9. Timeline endpoint: `GET /api/v1/deals/:id/timeline` (returns `deal_events` for deal)
10. Middleware: JWT auth, role-check, typed error-handler, rate-limiter
11. Vitest unit + integration tests for all services and routes

### Phase 3 — Web Dashboard (parallel with Phase 4)

1. Next.js App Router setup with Tailwind CSS
2. Wallet connection: wagmi + viem + RainbowKit
3. Pages: home, create deal, deal detail + timeline, my deals, settings/telegram
4. Client flows: create deal, fund on-chain, approve/reject milestone
5. Freelancer flows: agree to deal, view deal, submit milestone, view rejection feedback
6. Telegram linking page (enter OTP received from bot)
7. Single API client in `lib/api-client.ts` — no raw fetch anywhere else in codebase
8. Zod client-side validation on all forms before API call
9. JSDoc on every component and hook

### Phase 4 — Telegram Bot (parallel with Phase 3)

1. Telegraf setup with TypeScript + pino logging
2. Commands: `/start`, `/link`, `/deals`, `/status <dealId>`
3. Inline keyboards: approve/reject (client), submit confirmation (freelancer)
4. Notification polling: check API every 30s for new `deal_events` for linked user
5. API client in `src/api-client/` — all bot actions proxy through it
6. Vitest tests with mocked Telegraf context

### Phase 5 — AI Clarity Layer ⏸️ (Post-MVP)

Defer. Do not start until Phases 0–4 are complete, reviewed, and merged.

### Phase 6 — Hardening ⏸️ (Post-MVP)

Defer. Do not start until Phases 0–4 are complete, reviewed, and merged.

---

## I) FILE NAMING & CONVENTIONS

| Convention           | Rule                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| **Files**            | `kebab-case.ts` (e.g., `deals.service.ts`, `create-deal.tsx`)         |
| **Components**       | `PascalCase.tsx` (e.g., `DealCard.tsx`, `MilestoneTimeline.tsx`)      |
| **Types/Interfaces** | `PascalCase`                                                          |
| **Constants**        | `UPPER_SNAKE_CASE`                                                    |
| **Env vars**         | `UPPER_SNAKE_CASE` in `.env`, parsed via Zod into typed config object |
| **Database tables**  | `snake_case` (e.g., `deals`, `milestones`, `deal_events`)             |
| **API routes**       | `/api/v1/deals`, `/api/v1/milestones/:id/submit`, etc.                |
| **Commits**          | Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`     |
| **Branches**         | `feature/`, `fix/`, `chore/` prefixes                                 |

---

## J) DATABASE SCHEMA (7 Tables)

| Table             | Key Columns                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `users`           | id, wallet_address, telegram_user_id (nullable), created_at                                                        |
| `deals`           | id, client_id, freelancer_id, token_address, total_amount, status, chain_deal_id, created_at, agreed_at (nullable) |
| `milestones`      | id, deal_id, title, description, acceptance_criteria, amount, sequence, status                                     |
| `submissions`     | id, milestone_id, submitted_by, summary, links (jsonb), ai_summary (nullable), created_at                          |
| `deal_events`     | id, deal_id, actor_id, event_type, metadata (jsonb), created_at                                                    |
| `telegram_links`  | id, user_id, one_time_code, expires_at, used_at (nullable)                                                         |
| `rejection_notes` | id, submission_id, reason_codes (jsonb), free_text, ai_revision_notes (nullable), created_at                       |

> `agreed_at` on `deals`: populated when freelancer calls `/deals/:id/agree`. Required for DRAFT→AGREED transition.

---

## K) COMPLETE API ROUTES (16 endpoints)

| Method | Route                            | Role       | Description                                              |
| ------ | -------------------------------- | ---------- | -------------------------------------------------------- |
| POST   | `/api/v1/auth/nonce`             | Public     | Returns nonce for SIWE                                   |
| POST   | `/api/v1/auth/verify`            | Public     | Verifies SIWE signature, issues JWT                      |
| GET    | `/api/v1/deals`                  | Auth       | List deals for authenticated user (client or freelancer) |
| POST   | `/api/v1/deals`                  | Client     | Create new deal with milestones                          |
| GET    | `/api/v1/deals/:id`              | Auth       | Get deal + milestones + current status                   |
| POST   | `/api/v1/deals/:id/agree`        | Freelancer | Confirm milestones → DRAFT→AGREED                        |
| POST   | `/api/v1/deals/:id/fund`         | Client     | Record funding confirmation after on-chain tx            |
| POST   | `/api/v1/deals/:id/cancel`       | Either     | Cancel deal; refund rules from Section C applied         |
| GET    | `/api/v1/deals/:id/timeline`     | Auth       | Full audit trail from `deal_events`                      |
| POST   | `/api/v1/milestones/:id/submit`  | Freelancer | Submit milestone deliverables                            |
| POST   | `/api/v1/milestones/:id/approve` | Client     | Approve + trigger on-chain release                       |
| POST   | `/api/v1/milestones/:id/reject`  | Client     | Reject with structured reasons                           |
| POST   | `/api/v1/telegram/generate-code` | Auth       | Generate 15-min OTP for Telegram linking                 |
| POST   | `/api/v1/telegram/link`          | Auth       | Verify OTP, link Telegram user ID                        |
| DELETE | `/api/v1/telegram/unlink`        | Auth       | Remove Telegram link (revokes bot access immediately)    |
| GET    | `/api/v1/health`                 | Public     | Health check — returns `{ status: "ok", timestamp }`     |

---

## L) PR QUALITY CHECKLIST (Non-Negotiable)

Every pull request must pass all of the following before merge. PRs that fail any item will be asked to revise.

- [ ] Every function/method has JSDoc with `@param`, `@returns`, `@throws`
- [ ] Every file has a module-level comment explaining what it does AND does not do
- [ ] Every `catch` block logs `{ module, operation, relevant IDs, error.message }` — none are empty
- [ ] No `any` types without a justified inline comment
- [ ] No hardcoded secrets, RPC URLs, or API keys
- [ ] Zod validation on all external inputs (API routes, bot commands, webhook payloads)
- [ ] TypeScript `strict: true` — no type errors
- [ ] Tests added for all new functionality
- [ ] `pnpm lint` passes with zero errors and zero warnings
- [ ] `pnpm test` passes with all tests green
- [ ] `pnpm build` has zero TypeScript errors
- [ ] No dependency added without justification in PR description (what it does, alternatives, security impact)

### What will cause a PR to be rejected

- Adds a dependency without justification in comments or PR description
- Stores secrets in code, commits `.env`, or logs sensitive data
- Any external call (RPC, Telegram, OpenAI) without timeout + retry + typed error handling
- Any API endpoint or bot command without Zod input validation
- Any function or method missing JSDoc with `@param`, `@returns`, `@throws`
- Any file missing module-level comment
- Any `catch` block that doesn't log with `{ module, operation, relevant IDs, error.message }`
- Any empty `catch` block
- Any `logger.error(err)` without structured context fields
- Bot accessing DB directly — must call `api-client/` only
- Arbitration, voting, or dispute council logic implemented
- Non-stablecoin assets added
- Telegram positioned as primary interface or bypassing API
- AI positioned as decision-maker
- TypeScript not in strict mode or `any` used without justified inline comment
- No tests for new functionality
- God files (>300 lines or multiple responsibilities)
- Silent error swallowing
- Deal state machine changed without opening a discussion issue first
- Vague security language without qualifiers ("secure", "trustless", "guaranteed")
- Missing `agreed_at` tracking for DRAFT→AGREED transition
- OTP expiry not enforced (must be exactly 15 minutes)
- Cancel without checking and applying refund rules
- `/deals/:id/agree`, `/deals/:id/cancel`, or `/deals/:id/timeline` endpoints removed or renamed
