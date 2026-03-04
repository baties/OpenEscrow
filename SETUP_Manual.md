# OpenEscrow — Local Setup & Run Guide

Step-by-step instructions to deploy the smart contract on Sepolia testnet and run all
four parts of the project (API, Web, Bot, Contracts) manually on your local machine.

---

## Prerequisites

Make sure these are installed before you start:

| Tool | Minimum version | Check |
|------|----------------|-------|
| Node.js | 20.x | `node --version` |
| pnpm | 9.x | `pnpm --version` |
| Docker + Docker Compose | any recent | `docker compose version` |
| Git | any | `git --version` |

> **macOS with nvm:** run `nvm use v22` before any `pnpm` command in this guide.

---

## Step 1 — Install Dependencies

From the repo root, install all workspace packages in one shot:

```bash
cd /path/to/OpenEscrow
pnpm install
```

This installs dependencies for all five packages: `contracts`, `api`, `web`, `bot`, and `shared`.

---

## Step 2 — Create Your `.env` File

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Open `.env` in your editor. The sections below explain what each value is and where to get it.

### 2a — Generate local secrets (run once)

```bash
# Paste each output into .env
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → BOT_API_SECRET
```

### 2b — Database

```
POSTGRES_USER=escrow
POSTGRES_PASSWORD=<any strong local password>
POSTGRES_DB=open_escrow
POSTGRES_PORT=5432
DATABASE_URL=postgresql://escrow:<your_password>@localhost:5432/open_escrow
```

> Make sure `POSTGRES_PASSWORD` in `DATABASE_URL` matches `POSTGRES_PASSWORD` above.

### 2c — API server

```
API_PORT=3001
LOG_LEVEL=info
NODE_ENV=development
ALLOWED_ORIGIN=http://localhost:3000
JWT_SECRET=<generated above>
JWT_EXPIRY=24h
BOT_API_SECRET=<generated above>
```

### 2d — Blockchain / Chain indexer

Get a free Sepolia RPC endpoint from [Alchemy](https://alchemy.com) or [Infura](https://infura.io):

```
CHAIN_ID=11155111
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your_key>
USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
INDEXER_POLL_INTERVAL_MS=12000
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
```

> `CONTRACT_ADDRESS` stays as the zero address until you complete Step 4. The API will
> start fine; the chain indexer will log errors until a real address is set.

### 2e — Contract deployment vars (used only by Hardhat scripts)

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your_key>
SEPOLIA_USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
SEPOLIA_USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
DEPLOYER_PRIVATE_KEY=<your_sepolia_deployer_wallet_private_key>
ETHERSCAN_API_KEY=<optional — only needed if you want to verify on Etherscan>
```

> **Security:** Use a dedicated Sepolia-only wallet. Never use a wallet that holds
> mainnet funds. Never commit `.env` to git.

### 2f — Web dashboard

```
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Get a free WalletConnect Project ID at [cloud.walletconnect.com](https://cloud.walletconnect.com):

```
WALLETCONNECT_PROJECT_ID=<your_project_id>
```

The remaining `NEXT_PUBLIC_*` vars (chain ID, contract address, token addresses) are set
after contract deployment in Step 4d.

### 2g — Telegram bot

Create a bot via [@BotFather](https://t.me/BotFather) on Telegram (`/newbot` command):

```
TELEGRAM_BOT_TOKEN=<token from BotFather>
BOT_API_BASE_URL=http://localhost:3001
BOT_POLL_INTERVAL_MS=30000
```

---

## Step 3 — Start PostgreSQL

Run only the database container (not the full stack yet):

```bash
docker compose up -d postgres
```

Confirm it is healthy (wait ~15 seconds after starting):

```bash
docker compose ps
# postgres row should show: healthy
```

---

## Step 4 — Deploy the Smart Contract to Sepolia

### 4a — Fund your deployer wallet

Send a small amount of Sepolia ETH to your deployer wallet address.
Free faucets: [sepoliafaucet.com](https://sepoliafaucet.com) or [faucets.chain.link](https://faucets.chain.link/sepolia).

You need approximately **0.01–0.05 ETH** to cover deployment gas.

### 4b — Compile the contract

```bash
cd contracts
pnpm install
pnpm build
```

Expected output: `Compiled 1 Solidity file successfully`

### 4c — Run the contract tests (optional but recommended)

```bash
pnpm test
```

Expected: **69 tests passing**.

### 4d — Deploy to Sepolia

```bash
pnpm deploy:sepolia
```

The script will print:

```
[deploy] Deployer: 0xYourWalletAddress
[deploy] Deployer balance: 0.05 ETH
[deploy] OpenEscrow deployed at: 0xAbCd...1234
[deploy] ABI exported to: packages/shared/src/abis/OpenEscrow.json
[deploy] Deployment complete.
```

**Copy the deployed address.** You will need it in the next step.

### 4e — Update `.env` with the deployed address

Open `.env` and update:

```
CONTRACT_ADDRESS=0xAbCd...1234   # ← paste the address printed above
```

Also add the `NEXT_PUBLIC_*` web vars (all go in the same `.env`):

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xAbCd...1234
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
NEXT_PUBLIC_USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_project_id>
```

### 4f — (Optional) Verify on Etherscan

```bash
npx hardhat verify --network sepolia \
  0xAbCd...1234 \
  0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8 \
  0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
```

> Replace the first address with your deployed contract address.
> Requires `ETHERSCAN_API_KEY` to be set in `.env`.

Go back to the repo root when done:

```bash
cd ..
```

---

## Step 5 — Run the Database Migrations

Apply the schema to PostgreSQL (run from repo root):

```bash
cd apps/api
DATABASE_URL=postgresql://escrow:<your_password>@localhost:5432/open_escrow pnpm db:migrate
cd ../..
```

Or export the variable first:

```bash
export DATABASE_URL=postgresql://escrow:<your_password>@localhost:5432/open_escrow
cd apps/api && pnpm db:migrate && cd ../..
```

Expected output: migration applied with no errors.

---

## Step 6 — Run Each Part

Open **four separate terminal windows/tabs**, one per service.

---

### Terminal 1 — Backend API

```bash
cd apps/api

# Export all required API env vars (or source your .env)
export NODE_ENV=development
export DATABASE_URL=postgresql://escrow:<your_password>@localhost:5432/open_escrow
export JWT_SECRET=<your_jwt_secret>
export JWT_EXPIRY=24h
export BOT_API_SECRET=<your_bot_api_secret>
export ALLOWED_ORIGIN=http://localhost:3000
export CONTRACT_ADDRESS=0xAbCd...1234
export RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your_key>
export CHAIN_ID=11155111
export USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
export USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
export INDEXER_POLL_INTERVAL_MS=12000
export API_PORT=3001
export LOG_LEVEL=info

pnpm dev
```

Verify it is running:

```bash
curl http://localhost:3001/api/v1/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

### Terminal 2 — Web Dashboard

```bash
cd apps/web

export NEXT_PUBLIC_API_URL=http://localhost:3001
export NEXT_PUBLIC_CHAIN_ID=11155111
export NEXT_PUBLIC_CONTRACT_ADDRESS=0xAbCd...1234
export NEXT_PUBLIC_USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
export NEXT_PUBLIC_USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
export NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_project_id>

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Terminal 3 — Telegram Bot

```bash
cd apps/bot

export NODE_ENV=development
export TELEGRAM_BOT_TOKEN=<token from BotFather>
export API_BASE_URL=http://localhost:3001
export POLL_INTERVAL_MS=30000
export LOG_LEVEL=info

pnpm dev
```

Open your bot in Telegram and send `/start` to confirm it responds.

---

## Step 7 — Smoke Test

Run through this checklist to confirm everything is working:

- [ ] `curl http://localhost:3001/api/v1/health` returns `{"status":"ok"}`
- [ ] Web dashboard loads at `http://localhost:3000`
- [ ] Wallet connect button appears on the web dashboard
- [ ] Connect a MetaMask wallet (switch MetaMask network to **Sepolia**)
- [ ] Sign-in with Ethereum (SIWE) prompt appears and completes successfully
- [ ] Telegram bot replies to `/start`
- [ ] Send `/link` to the bot — it returns a one-time code
- [ ] Paste the OTP on the web dashboard Settings page — account links successfully
- [ ] API logs (Terminal 1) show the chain indexer polling every 12 seconds

---

## Tip — Source `.env` Instead of Exporting Each Var

If you prefer not to export each variable manually, you can source your `.env` file:

```bash
# Bash / zsh helper — loads .env into current shell session
set -a && source /path/to/OpenEscrow/.env && set +a
```

Run this before starting each terminal's service. This works for the API and bot.

For the web, Next.js reads `NEXT_PUBLIC_*` vars from `apps/web/.env.local` automatically.
You can create that file once:

```bash
cat << 'EOF' > apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_CONTRACT_ADDRESS=0xAbCd...1234
NEXT_PUBLIC_USDC_ADDRESS=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
NEXT_PUBLIC_USDT_ADDRESS=0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_project_id>
EOF
```

Then just run `pnpm dev` in `apps/web` without any exports.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| API crashes immediately on start | Missing or invalid env var | Read the error — it prints exactly which variable is wrong |
| `DATABASE_URL` error | PostgreSQL not running or wrong password | Run `docker compose ps` and verify postgres is healthy |
| `CONTRACT_ADDRESS must be a valid EVM address` | Still has zero address in `.env` | Complete Step 4 and update `CONTRACT_ADDRESS` |
| Web shows blank page or config error | Missing `NEXT_PUBLIC_*` var | Check `apps/web/.env.local` or your exports |
| Bot does not respond | Wrong token or API not running | Confirm Terminal 1 (API) is healthy and token is correct |
| Hardhat deploy: `Deployer has zero ETH balance` | Deployer wallet not funded | Get Sepolia ETH from a faucet |
| Hardhat deploy: `No deployer signer found` | `DEPLOYER_PRIVATE_KEY` not set | Add it to `.env` (without quotes, with or without `0x` prefix) |
| MetaMask shows wrong network | Not on Sepolia | Switch MetaMask to Sepolia testnet (chain ID 11155111) |
