# OpenEscrow — Agent Team Package

Drop these files into your cloned `OpenEscrow/` repo root, then follow the launch steps.

## Files in this package

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Master agent team manifest — all agents read this on spawn |
| `STATUS.md` | Live build status — lead keeps this updated |
| `BLOCKERS.md` | Cross-agent blocker log — any agent writes, lead resolves |
| `DECISIONS.md` | Architecture decisions — lead documents, all agents read |
| `LEAD_PROMPT.txt` | Paste this into Claude Code to start the build |
| `LAUNCH.sh` | Step-by-step launch instructions |

## Agent Team Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      🎯 LEAD AGENT                          │
│  Phase 0 bootstrap · spawns teammates · integration check  │
└────────┬──────────────┬─────────────────┬───────────────────┘
         │              │                 │
   (immediate)    (after Phase 1)   (after Phase 2)
         │              │              ┌──┴──────────┐
         ▼              ▼              ▼             ▼
  ⛓ contracts-    🔧 api-        🌐 web-       🤖 bot-
     agent           agent          agent         agent
  contracts/       apps/api/      apps/web/     apps/bot/
  Phase 1          Phase 2        Phase 3       Phase 4
```

## Communication Protocol

Agents communicate through files, not direct messages:

- **`STATUS.md`** — Lead updates after every milestone
- **`BLOCKERS.md`** — Any agent writes a blocker; Lead resolves it
- **`DECISIONS.md`** — Lead documents cross-cutting decisions
- **`*.DONE.flag`** — Each agent writes when their phase is complete

## Launch Steps

```bash
# 1. Clone repo
git clone https://github.com/baties/OpenEscrow.git
cd OpenEscrow

# 2. Copy agent team files into repo root
cp /path/to/agent-team/* .

# 3. Enable Agent Teams in ~/.claude/settings.json
# { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": true }

# 4. Set tmux backend for visible split panes
export CLAUDE_CODE_SPAWN_BACKEND=tmux

# 5. Launch Claude Code
claude

# 6. Paste contents of LEAD_PROMPT.txt into the session
```

## What Gets Built (MVP Phases 0–4)

| Phase | What | Who |
|-------|------|-----|
| 0 | Monorepo scaffold, Docker Compose, CI, shared config | Lead |
| 1 | `OpenEscrow.sol` + Hardhat tests + ABI export | contracts-agent |
| 2 | Fastify API, SIWE auth, Drizzle DB, all 13 routes, indexer | api-agent |
| 3 | Next.js dashboard, wallet connect, client + freelancer flows | web-agent |
| 4 | Telegraf bot, /start /link /deals, approve/reject keyboards | bot-agent |

Phases 5 (AI layer) and 6 (hardening) are deliberately deferred — your CLAUDE.md says so.

## Token Usage Warning

Agent teams use significantly more tokens than a single session.
With 4 parallel agents across ~6 weeks of code, expect heavy usage.
Consider Claude Max or monitoring token consumption closely.
