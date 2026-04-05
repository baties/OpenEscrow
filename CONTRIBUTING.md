# Contributing to OpenEscrow

## Before You Code

Read **[CONTRIBUTING_RULES.md](./CONTRIBUTING_RULES.md)** completely — all sections A through L.
It is the single source of truth for all engineering decisions, the tech stack, and the build order.
All rules are non-negotiable. If you believe a rule should change, open a GitHub discussion issue first.

## Branching

- `main` — protected, requires PR + CI green
- `feature/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `chore/<short-description>` — tooling, dependencies, docs

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add milestone rejection endpoint
fix: enforce OTP expiry at verify time
chore: update drizzle-kit to 0.25
docs: add CONTRIBUTING.md
test: add reentrancy test for approveMilestone
```

## Pull Requests

1. Open PRs against `main`
2. CI must pass: `pnpm lint` + `pnpm test` + `pnpm build`
3. Every PR description must include:
   - What changed and why
   - Any dependency additions with justification (per rule F.1 in CONTRIBUTING_RULES.md)
   - Test coverage for new functionality

## Code Quality Checklist (non-exhaustive)

- [ ] Every function has JSDoc with `@param`, `@returns`, `@throws`
- [ ] Every file has a module-level comment explaining what it does AND does not do
- [ ] Every `catch` block logs `{ module, operation, relevant IDs, error.message }`
- [ ] No `any` types without justified inline comment
- [ ] No hardcoded secrets, RPC URLs, or API keys
- [ ] Zod validation on all external inputs
- [ ] TypeScript `strict: true` — no type errors

See [CONTRIBUTING_RULES.md](./CONTRIBUTING_RULES.md) for the full checklist and what will cause a PR to be rejected.

## Running Locally

See [README.md](./README.md) for full setup instructions.

```bash
pnpm install
pnpm dev          # starts all services in watch mode
pnpm test         # run all tests
pnpm lint         # lint all packages
```
