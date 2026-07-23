# Edura — documentation

Every project document lives in this folder. Three files deliberately stay in
the repo root: [`CLAUDE.md`](../CLAUDE.md) (project instructions + binding
decisions — read by Claude Code every session), [`AGENTS.md`](../AGENTS.md) (a
one-line pointer to `CLAUDE.md`, kept at root for the agent-tool convention),
and [`README.md`](../README.md) (GitHub entry point). Per-package `README.md`
files also stay beside the code they describe.

> **`CLAUDE.md` is the single source of truth** for scope, roadmap, and binding
> decisions. Where any document here disagrees with it, `CLAUDE.md` wins.

---

## architecture/

How the system is put together.

| Document | What it's for |
|---|---|
| [architecture-review.md](architecture/architecture-review.md) | Full codebase review — monorepo structure, schema, auth, data isolation, plus the **§5 ten-step implementation roadmap** the project executes against. Start here to understand the system. |
| [education-catalog.md](architecture/education-catalog.md) | (Arabic) The config-driven Egyptian education catalog — systems → stages → grades → tracks → subject offerings — and how student/teacher/center onboarding consumes it. |
| [fee-points-engine.md](architecture/fee-points-engine.md) | The money engine: what `POST /sessions/:id/complete` triggers, how revenue is distributed, wallets credited, and points awarded. |

## security/

| Document | What it's for |
|---|---|
| [security-audit.md](security/security-audit.md) | The security findings register (C/H/M/L severities). Remediation progress is tracked in `CLAUDE.md`; this file holds the full report and reproduction detail for each finding. |

## product/

Source specifications and compliance.

| Document | What it's for |
|---|---|
| [edura-fullstack-prd.md](product/edura-fullstack-prd.md) | The original EduConnect full-stack PRD v1.0 — the source spec the platform was built against. §0 contains a historical draft `CLAUDE.md` that is **not** authoritative. |
| [prd-compliance-audit.md](product/prd-compliance-audit.md) | Line-by-line audit of the codebase against the PRD across 13 dimensions, every row citing `file:line`. Dated report — reflects the codebase at audit time. |

## reports/

Point-in-time verification runs. Each is a snapshot, not living documentation.

| Document | What it's for |
|---|---|
| [api-verification.md](reports/api-verification.md) | Live API sweep (2026-07-23) — real HTTP requests against the running apps and the live Neon database. Report-only; nothing was fixed during the sweep. |
| [scale-proof.md](reports/scale-proof.md) | Load-test proof against PRD §9.1 — `EXPLAIN (ANALYZE, BUFFERS)` on the heaviest query shapes over a 400,000-row transaction ledger, with and without the composite index. |

## guides/

Operational how-to.

| Document | What it's for |
|---|---|
| [deployment.md](guides/deployment.md) | Deploying to Vercel + Neon: project settings, required env vars, post-deploy checks. |
| [test-credentials.md](guides/test-credentials.md) | Seeded dev/demo login accounts for each role. |
| [whatsapp-templates.md](guides/whatsapp-templates.md) | WhatsApp message template bodies to submit for Meta approval, in both languages. |
| [runbook.md](guides/runbook.md) | ⚠️ **Stale** — operational runbook last accurate 2026-05-07; still describes MongoDB/DaisyUI. Historical reference only; see the banner in the file. |

## testing/

| Document | What it's for |
|---|---|
| [manual-testing.md](testing/manual-testing.md) | ⚠️ **Partially stale** — manual QA scenarios (uploads, email, UI, rate limits) with P1–P3 priorities. The scenarios are still useful; the Newman-harness framing and coverage claims are outdated. |
| [seed-data-gaps.md](testing/seed-data-gaps.md) | ⚠️ **Stale** — seed coverage gap analysis written against MongoDB collections, pre-Prisma. Historical reference only. |

---

## Documents that live outside this folder

| Path | Why it stays there |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Read from the repo root every session by Claude Code. |
| [`AGENTS.md`](../AGENTS.md) | Agent-instructions convention expects it at the repo root. |
| [`README.md`](../README.md) | GitHub convention. |
| `apps/www/README.md` | The main web app — stack, setup, env vars, scripts. |
| `apps/superadmin/README.md` | The internal back-office app (super_admin + accountant portals). |
| `apps/realtime/README.md` | The standalone Socket.IO chat server. |
| `apps/www/bruno/README.md` | The generated Bruno API collection sitting in that folder. |
| `packages/database/README.md` | The only package importing Prisma — schema, migrations, RLS, queries. |
| `packages/eslint-config/README.md` | Shared ESLint config package. |
| `apps/www/.claude/skills/**` | Claude Code skill definitions — the loader requires this exact path. |

## Conventions

- **Reports are dated snapshots.** `reports/`, `product/prd-compliance-audit.md`,
  and `security/security-audit.md` describe the codebase as of their stated
  date. Do not read them as current state.
- **Stale documents are banner-marked, not deleted.** A document that no longer
  matches the codebase gets a warning banner at the top stating what is
  outdated and when it was last accurate.
- **Relative links only**, so the tree stays movable.
