# Edura — Educational Management Platform

A modern educational management platform for tutoring centers in Egypt, built with **Next.js** (App Router), **Neon Postgres** (Prisma), and **TypeScript**.

> **Status:** Active development · V1

---

## Tech Stack

| Layer        | Technology                                    |
|------------- |-----------------------------------------------|
| Runtime      | Node.js ≥ 20                                 |
| Package Mgr  | pnpm 9.x                                     |
| Framework    | Next.js 16 (App Router, TypeScript)           |
| Database     | Neon Postgres (serverless) via Prisma — `@repo/database` |
| Auth         | next-auth 4.x — Credentials provider, JWT     |
| Validation   | Zod 3.x                                      |
| Frontend     | React 18, Ant Design 5, Tailwind CSS 4        |
| Tests        | Playwright (browser) + `pnpm smoke:api` (API)  |

---

## Prerequisites

| Dependency          | Version  | Check                      |
|---------------------|----------|----------------------------|
| **Node.js**         | ≥ 20     | `node -v`                  |
| **pnpm**            | ≥ 9      | `pnpm -v`                  |
| **Git**             | any      | `git --version`            |

> The database is a hosted **Neon Postgres** instance — nothing to install locally. Migrations/RLS live in `packages/database`; see `docs/DEPLOYMENT.md`.

---

## Quick Start (All Platforms)

### 1. Clone the repo

```bash
git clone https://github.com/rixtrayker/edura.git
cd edura
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

| Variable           | Required | Description                                                     |
|--------------------|----------|-----------------------------------------------------------------|
| `DATABASE_URL`     | ✅       | Neon Postgres pooled URL — **NOBYPASSRLS role** (see `docs/DEPLOYMENT.md`) |
| `NEXTAUTH_SECRET`  | ✅       | Random secret — generate with `openssl rand -base64 32`         |
| `NEXTAUTH_URL`     | ✅       | App URL (default: `http://localhost:3002`)                       |
| `MAIL_PROVIDER`    | —        | `console` (default, logs to stdout) · `mailgun` · `sendgrid`   |
| `MAIL_FROM`        | —        | Sender email address                                            |
| `APP_BASE_URL`     | —        | Used for links in emails (default: `http://localhost:3002`)      |
| `SEED_PASSWORD`    | —        | Password for dev fixture accounts (default: `Passw0rd!`)         |

### 4. Seed the database (optional)

```bash
pnpm seed
```

This creates subject data and dev fixture accounts.

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002) in your browser.

---

## Platform-Specific Setup

### macOS

**Install prerequisites with Homebrew:**

```bash
# Node.js (via nvm recommended)
brew install nvm
nvm install 20
nvm use 20

# pnpm
npm install -g pnpm@9
```

**Generate your auth secret:**

```bash
openssl rand -base64 32
```

---

### Linux (Ubuntu/Debian)

**Install Node.js:**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Install Node 20
nvm install 20
nvm use 20
```

**Install pnpm:**

```bash
npm install -g pnpm@9
```

**Generate your auth secret:**

```bash
openssl rand -base64 32
```

---

### Windows

**Option A — Using winget (recommended):**

```powershell
# Node.js
winget install OpenJS.NodeJS.LTS

# pnpm
npm install -g pnpm@9
```

**Option B — Using installers:**

1. Download and install [Node.js 20 LTS](https://nodejs.org/)
2. Run `npm install -g pnpm@9` in PowerShell

**Generate your auth secret (PowerShell):**

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]])
```

---

## Available Scripts

| Command                      | Description                                          |
|------------------------------|------------------------------------------------------|
| `pnpm dev`                   | Start dev server on `:3000`                          |
| `pnpm build`                 | Production build                                     |
| `pnpm start`                 | Start production server on `:3000`                   |
| `pnpm lint`                  | Run ESLint                                           |
| `pnpm typecheck`             | Run TypeScript type checking (`tsc --noEmit`)        |
| `pnpm seed`                  | Seed subjects + dev fixtures                         |
| `pnpm seed:deploy`           | Seed for production (deploy mode)                    |
| `pnpm test:e2e`              | Run E2E tests via Newman                             |
| `pnpm test:e2e:bail`         | Run E2E tests, stop on first failure                 |
| `pnpm test:e2e:preflight`    | Run preflight E2E checks only                        |

---

## Project Structure

```
edura/
├── app/
│   ├── api/v1/          # REST API route handlers
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Frontend entry
│   └── globals.css       # Design tokens (Tailwind v4)
├── components/
│   ├── screens/          # Role-specific screen components
│   └── ui/               # Reusable UI primitives
├── lib/
│   ├── auth/             # next-auth config & session helpers
│   ├── authz/            # Role & center scope guards
│   ├── db/
│   │   └── scope.ts      # scopedDb/platformDb — RLS-aware data access (@repo/database)
│   ├── errors/           # Typed error classes + HTTP mapper
│   ├── http/             # Response envelope helpers
│   ├── services/         # Business logic layer
│   ├── validation/       # Zod schemas & parse helpers
│   ├── constants/        # Subject list, seed data
│   ├── utils/            # Random generators, helpers
│   └── mail/             # Email sender (console/mailgun/sendgrid)
├── scripts/
│   └── api-smoke.sh      # Role-based API smoke test (pnpm smoke:api)
├── tests/                # Test files
├── types/                # TypeScript type definitions
├── docs/                 # Product spec, backend plan, epic prompts
└── public/               # Static assets
```

---

## Environment Variables Reference

See [`.env.example`](.env.example) for the full list. Key variables:

```env
DATABASE_URL=postgresql://edura_app:<password>@ep-...-pooler.<region>.aws.neon.tech/neondb?sslmode=require
NEXTAUTH_SECRET=<your-secret-here>
NEXTAUTH_URL=http://localhost:3002
MAIL_PROVIDER=console
APP_BASE_URL=http://localhost:3002
```

---

## Troubleshooting

<details>
<summary><strong>Empty data / queries return nothing</strong></summary>

The runtime role must be a **NOBYPASSRLS** Postgres role and every query must go
through `scopedDb`/`platformDb` (`lib/db/scope.ts`) so a Row-Level-Security
context is set. A missing tenant context returns zero rows, not an error.

</details>

<details>
<summary><strong>Port 3000 already in use</strong></summary>

Kill the process using port 3000:

```bash
# macOS / Linux
lsof -ti:3000 | xargs kill -9

# Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

</details>

<details>
<summary><strong>pnpm not found after install</strong></summary>

Make sure pnpm is in your PATH. Try:

```bash
corepack enable
corepack prepare pnpm@9 --activate
```

Or install globally: `npm install -g pnpm@9`

</details>

<details>
<summary><strong>Node version mismatch</strong></summary>

This project requires Node.js ≥ 20. Use [nvm](https://github.com/nvm-sh/nvm) to manage versions:

```bash
nvm install 20
nvm use 20
```

</details>

---

## License

Private — All rights reserved.
