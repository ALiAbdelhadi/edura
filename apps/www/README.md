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
| Validation   | Zod 4.x                                      |
| Frontend     | React 19, shadcn/ui (Radix + Tailwind CSS 4) via `@repo/ui`, `@refinedev/core` |
| Charts       | Recharts 3.x                                  |
| i18n         | next-intl 4.x (ar default + RTL, en)          |
| PWA          | Serwist + native VAPID web-push               |
| Tests        | Vitest (unit) + live-DB suites + Playwright (browser) + `pnpm smoke:api` |

---

## Prerequisites

| Dependency          | Version  | Check                      |
|---------------------|----------|----------------------------|
| **Node.js**         | ≥ 20     | `node -v`                  |
| **pnpm**            | ≥ 9      | `pnpm -v`                  |
| **Git**             | any      | `git --version`            |

> The database is a hosted **Neon Postgres** instance — nothing to install locally. Migrations/RLS live in `packages/database`; see `docs/guides/deployment.md` (repo root).

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
| `DATABASE_URL`     | ✅       | Neon Postgres pooled URL — **NOBYPASSRLS role** (see the repo-root `docs/guides/deployment.md`) |
| `NEXTAUTH_SECRET`  | ✅       | Random secret — generate with `openssl rand -base64 32`         |
| `NEXTAUTH_URL`     | ✅       | App URL (default: `http://localhost:3002`)                       |
| `MAIL_PROVIDER`    | —        | `console` (default, logs to stdout) · `smtp` (nodemailer; needs `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`). Any other value silently falls back to `console` and delivers nothing. |
| `MAIL_FROM`        | —        | Sender email address                                            |
| `APP_BASE_URL`     | —        | Used for links in emails (default: `http://localhost:3002`)      |
| `SEED_PASSWORD`    | —        | Password for dev fixture accounts (default: `Passw0rd!`)         |

### 4. Seed the database (optional)

```bash
pnpm db:seed
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
| `pnpm dev`                   | Start dev server on `:3002`                          |
| `pnpm dev:pwa`               | Dev server with the Serwist service worker enabled   |
| `pnpm build`                 | Production build                                     |
| `pnpm start`                 | Start production server on `:3003`                   |
| `pnpm lint`                  | Run ESLint                                           |
| `pnpm typecheck`             | Run TypeScript type checking (`tsc --noEmit`)        |
| `pnpm db:seed`               | Seed subjects + dev fixtures                         |
| `pnpm test:unit`             | Unit tests (Vitest)                                  |
| `pnpm test:db`               | Live-DB suites against `.env.test` (guarded)         |
| `pnpm test:pw`               | Browser tests (Playwright)                           |
| `pnpm test:all`              | `check-types` + unit + live-DB suites                |
| `pnpm smoke:api`             | Role-based API smoke test (`scripts/api-smoke.sh`)   |
| `pnpm gen:bruno`             | Regenerate the Bruno API collection                  |
| `pnpm mail:check`            | Verify SMTP delivery config                          |

---

## Project Structure

This app is one workspace in the monorepo — paths below are relative to `apps/www/`.
Shared code lives in `packages/` (`@repo/database`, `@repo/server-core`, `@repo/ui`),
and operational docs live in `docs/` at the **repo root**, not here.

```
apps/www/
├── src/
│   ├── app/
│   │   ├── api/v1/          # REST API route handlers
│   │   ├── [locale]/        # Locale-prefixed routes (role portals)
│   │   └── globals.css      # Design tokens (Tailwind v4)
│   ├── proxy.ts             # Locale-prefix proxy (Next.js proxy convention)
│   ├── features/            # Feature modules (role/domain screens)
│   │   ├── admin/  teacher/  student/  parent/  onboarding/
│   │   └── attendance/  collaboration/  messaging/  notifications/  settings/
│   ├── components/          # App-local components (shared primitives are in @repo/ui)
│   │   ├── charts/          # Recharts wrappers (+ barrel)
│   │   ├── kit/  ui/        # Local composites & primitives
│   │   ├── providers/       # App/i18n/theme providers
│   │   ├── pwa/             # Install prompt, offline surfaces
│   │   └── refine/          # Refine framework adapters
│   ├── lib/
│   │   ├── auth/            # next-auth config & session helpers
│   │   ├── authz/           # Role & center scope guards
│   │   ├── db/
│   │   │   └── scope.ts     # scopedDb/platformDb — RLS-aware data access (@repo/database)
│   │   ├── errors/          # Typed error classes + HTTP mapper
│   │   ├── http/            # Response envelope helpers
│   │   ├── services/        # Business logic layer (by domain)
│   │   ├── validation/      # Zod schemas & parse helpers
│   │   ├── rate-limit/      # Token-bucket limiter
│   │   ├── cloudinary/      # Media upload helpers
│   │   ├── pwa/             # Service-worker & push helpers
│   │   ├── constants/       # Subject list, seed data
│   │   ├── utils/           # Random generators, helpers
│   │   └── mail/            # Email sender (console/smtp)
│   ├── i18n/                # Routing + request config (next-intl)
│   ├── messages/            # i18n dictionaries (ar/en)
│   └── types/               # TypeScript type definitions
├── scripts/                 # api-smoke.sh, gen-bruno.mjs, mail-check.ts, analyze-components.mjs
├── tests/
│   ├── unit/                # Vitest
│   ├── db/                  # Live-DB suites (run against .env.test)
│   └── playwright/          # Browser tests
├── bruno/                   # Generated Bruno API collection
└── public/                  # Static assets
```

---

## Environment Variables Reference

See [`.env.example`](.env.example) for the full list. Key variables:

```env
DATABASE_URL=postgresql://edura_app:<password>@ep-...-pooler.<region>.aws.neon.tech/neondb?sslmode=require
NEXTAUTH_SECRET=<your-secret-here>
NEXTAUTH_URL=http://localhost:3002
MAIL_PROVIDER=console   # or 'smtp' — any other value silently falls back to console
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
<summary><strong>Port 3002 already in use</strong></summary>

Kill the process using port 3002 (the dev port; `pnpm start` uses 3003):

```bash
# macOS / Linux
lsof -ti:3002 | xargs kill -9

# Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3002).OwningProcess | Stop-Process -Force
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
