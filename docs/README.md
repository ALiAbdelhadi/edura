# Edura — documentation

Every project document lives in this folder. Four files deliberately stay in
the repo root: [`CLAUDE.md`](../CLAUDE.md) (project instructions + binding
decisions — read by Claude Code every session), [`AGENTS.md`](../AGENTS.md) (a
one-line pointer to `CLAUDE.md`, kept at root for the agent-tool convention),
[`README.md`](../README.md) (GitHub entry point) and
[`SECURITY.md`](../SECURITY.md) (hardening decisions + the vulnerability-report
address, which GitHub surfaces from the root like `README.md`). Per-package
`README.md` files also stay beside the code they describe.

> Ten audit and migration-plan documents were moved out of the repo root into
> [`audits/`](#audits) on 2026-09-12 — the root had drifted to fourteen
> markdown files against the rule above. Code comments cite them by **name**
> (`REFUND_DECISION.md §1.4`, `SECURITY_AUDIT.md BIZ-01`), not by path, so
> those pointers still resolve to a `grep`; the files themselves are all in
> `docs/audits/`.

> **`CLAUDE.md` is the single source of truth** for scope, roadmap, and binding
> decisions. Where any document here disagrees with it, `CLAUDE.md` wins.

---

## architecture/

How the system is put together.

| Document | What it's for |
|---|---|
| [architecture-review.md](architecture/architecture-review.md) | Full codebase review — monorepo structure, schema, auth, data isolation, plus the **§5 ten-step implementation roadmap** the project executes against. Start here to understand the system. |
| [education-catalog.md](architecture/education-catalog.md) | (Arabic) The config-driven Egyptian education catalog — systems → stages → grades → tracks → subject offerings — and how student/teacher/center onboarding consumes it. |
| [better-auth-migration-audit.md](architecture/better-auth-migration-audit.md) · [better-auth-rollback.md](architecture/better-auth-rollback.md) | The next-auth → better-auth migration audit and its rollback path. |
| [superadmin-center-parity.md](architecture/superadmin-center-parity.md) | What the back office can do against what a centre can do. |
| [fee-points-engine.md](architecture/fee-points-engine.md) | The money engine: what `POST /sessions/:id/complete` triggers, how revenue is distributed, wallets credited, and points awarded. |

## security/

| Document | What it's for |
|---|---|
| [security-audit-2026-09-06.md](security/security-audit-2026-09-06.md) | The 2026-09-06 audit, all 28 findings remediated. The `M-xx` / `H-xx` ids in older code comments and in `CLAUDE.md` refer to THIS file. |
| [dependency-audit-2026-08-27.md](security/dependency-audit-2026-08-27.md) | Why five advisories were accepted as staying, with reasons per package. |
| [security-audit.md](security/security-audit.md) | The security findings register (C/H/M/L severities). Remediation progress is tracked in `CLAUDE.md`; this file holds the full report and reproduction detail for each finding. |

## product/

Source specifications and compliance.

| Document | What it's for |
|---|---|
| [edura-fullstack-prd.md](product/edura-fullstack-prd.md) | The original EduConnect full-stack PRD v1.0 — the source spec the platform was built against. §0 contains a historical draft `CLAUDE.md` that is **not** authoritative. |
| [prd-compliance-audit.md](product/prd-compliance-audit.md) | Line-by-line audit of the codebase against the PRD across 13 dimensions, every row citing `file:line`. Dated report — reflects the codebase at audit time. |

## audits/

Point-in-time audits, their verification passes, and the migration plans they
produced. Each is dated evidence, not a living spec — where one disagrees with
`CLAUDE.md`, `CLAUDE.md` wins.

| Document | What it's for |
|---|---|
| [SECURITY_AUDIT.md](audits/SECURITY_AUDIT.md) | **Current.** The 2026-09-11 application security audit: 70-item checklist, 57 findings, the three remediation batches (§7) and the Phase-5 before/after (§8). |
| [SECURITY_TODO.md](audits/SECURITY_TODO.md) | The out-of-repo half of that audit — deploys, console settings, key rotations. Ticked as they are done. |
| [AUDIT_REPORT.md](audits/AUDIT_REPORT.md) | The 2026-09-01 superadmin audit (C/H/M/L findings) with its remediation log. |
| [VERIFICATION_REPORT.md](audits/VERIFICATION_REPORT.md) | Independent read-only verification of `AUDIT_REPORT.md`'s remediation. |
| [ERP_AUDIT_PLAN.md](audits/ERP_AUDIT_PLAN.md) | The pass-by-pass plan for auditing `apps/erp`. |
| [REFUND_DECISION.md](audits/REFUND_DECISION.md) | Why refunds are Option B (money leaves the way it arrived), and the one refund door. |
| [WALLET_SPENDABILITY.md](audits/WALLET_SPENDABILITY.md) | The evidence that a student wallet credit is a trapped balance — the reason Option A was rejected. |
| [MIGRATION_PLAN_B.md](audits/MIGRATION_PLAN_B.md) | The refund migrations (73–75). |
| [MIGRATION_PLAN_C4.md](audits/MIGRATION_PLAN_C4.md) · [MIGRATION_PLAN_C5.md](audits/MIGRATION_PLAN_C5.md) | The duplicate-row guard migrations (71–72). |

## decisions/

**The canonical list is the "Shipped work" table in
[`CLAUDE.md`](../CLAUDE.md)** — 36 rows, each naming what the decision covers.
This folder holds the documents themselves. Each records what was built, why the
alternative was rejected, its proofs, and what was deliberately NOT done; read
the relevant one before touching the system it describes.

## plans/

Work planned but not finished. A plan that shipped becomes a `decisions/`
document; a plan still here has not.

| Document | What it's for |
|---|---|
| [counter-wallet-payment.md](plans/counter-wallet-payment.md) | Letting the counter spend a student's wallet balance — item 3 of the wallet-spendability evidence. |
| [h3-tx-split.md](plans/h3-tx-split.md) | Splitting the H-3 audit transaction. |
| [per-student-attendance-mode.md](plans/per-student-attendance-mode.md) | Per-student attendance mode, against today's per-teacher setting. |

## runbooks/

Operator procedures. Run these by hand; nothing invokes them.

| Document | What it's for |
|---|---|
| [backup-restore.md](runbooks/backup-restore.md) | The nightly encrypted dump, the weekly restore proof, and how to restore for real. |
| [vercel-project-recreate.md](runbooks/vercel-project-recreate.md) | Rebuilding the Vercel projects: root dirs, the `turbo run build` exit-127 trap, the per-project env matrix. |
| [observability.md](runbooks/observability.md) · [uptime-and-status.md](runbooks/uptime-and-status.md) | Sentry/PostHog wiring and the uptime surface. |
| [auth-env-rename.md](runbooks/auth-env-rename.md) | The auth environment-variable rename. Historical. |

## showcase/

| Document | What it's for |
|---|---|
| [feature-matrix.md](showcase/feature-matrix.md) | **Historical.** The 2026-08-02 Phase 0 audit for the `apps/showcase` site, which no longer exists — the public site is `apps/www` now (see [showcase-is-public-site](decisions/showcase-is-public-site.md)). Kept because every row cites a file that existed on that date. |

## reports/

Point-in-time verification runs. Each is a snapshot, not living documentation.

| Document | What it's for |
|---|---|
| [api-verification.md](reports/api-verification.md) | Live API sweep (2026-07-23) — real HTTP requests against the running apps and the live Neon database. Report-only; nothing was fixed during the sweep. |
| [scale-proof.md](reports/scale-proof.md) | Load-test proof against PRD §9.1 — `EXPLAIN (ANALYZE, BUFFERS)` on the heaviest query shapes over a 400,000-row transaction ledger, with and without the composite index. |
| [pre-launch-review-parent-center.md](reports/pre-launch-review-parent-center.md) | Pre-launch walkthrough (2026-08-04) of the parent and center portals, driven through the real UI against dev. Report-only, except the grading-scale fix it records as merged. Leads with a cross-center exposure in the counter lookup. |


Dated, point-in-time reports. Each is evidence of what was true on its date, not
a living spec — where one disagrees with `CLAUDE.md`, `CLAUDE.md` wins. Beyond those listed above:
[api-modernization-audit](reports/api-modernization-audit.md) ·
[cleanup-audit-2026-08-27](reports/cleanup-audit-2026-08-27.md) ·
[cleanup-notes](reports/cleanup-notes.md) ·
[cron-jobs-unscheduled](reports/cron-jobs-unscheduled.md) ·
[edura-improvement-report](reports/edura-improvement-report.md) ·
[feature-completeness](reports/feature-completeness.md) ·
[foundation-review-2026-07-27](reports/foundation-review-2026-07-27.md) ·
[guardian-gate-findings](reports/guardian-gate-findings.md) ·
[mvp-launch-plan](reports/mvp-launch-plan.md) ·
[pre-launch-center-walkthrough](reports/pre-launch-center-walkthrough.md) ·
[rendering-optimization-plan](reports/rendering-optimization-plan.md) ·
[revenue-operations-spec-audit](reports/revenue-operations-spec-audit.md) ·
[seed-and-fixture-findings](reports/seed-and-fixture-findings.md) ·
[session-identity-mismatch](reports/session-identity-mismatch.md) ·
[student-ia-audit](reports/student-ia-audit.md).

The QA set: [00-coverage-map](reports/qa/00-coverage-map.md) ·
[01-findings](reports/qa/01-findings.md) · [progress](reports/qa/progress.md) ·
[raw/endpoint-inventory](reports/qa/raw/endpoint-inventory.md).

## guides/

Operational how-to.

| Document | What it's for |
|---|---|
| [deployment.md](guides/deployment.md) | Deploying to Vercel + Neon: project settings, required env vars, post-deploy checks. |
| [test-credentials.md](guides/test-credentials.md) | Seeded dev/demo login accounts for each role. |
| [whatsapp-templates.md](guides/whatsapp-templates.md) | WhatsApp message template bodies to submit for Meta approval, in both languages. |
| [center-operations-manual.ar.md](guides/center-operations-manual.ar.md) · [.en](guides/center-operations-manual.en.md) | The centre operator manual, Arabic and English. The Arabic one is what counter staff actually read. |
| [teacher-guide.md](guides/teacher-guide.md) · [.en](guides/teacher-guide.en.md) | Teacher-facing walkthrough, Arabic and English. |
| [parent-guide.md](guides/parent-guide.md) · [.en](guides/parent-guide.en.md) | Parent-facing walkthrough, Arabic and English. |
| [runbook.md](guides/runbook.md) | ⚠️ **Stale** — operational runbook rewritten 2026-08-29 for the Neon/Prisma stack; earlier sections still describe DaisyUI. Historical reference only; see the banner in the file. |

## testing/

| Document | What it's for |
|---|---|
| [manual-testing.md](testing/manual-testing.md) | ⚠️ **Partially stale** — manual QA scenarios (uploads, email, UI, rate limits) with P1–P3 priorities. The scenarios are still useful; the Newman-harness framing and coverage claims are outdated. |
| [seed-data-gaps.md](testing/seed-data-gaps.md) | ⚠️ **Stale** — seed coverage gap analysis written against the pre-Prisma data model. Historical reference only. |

---

## Documents that live outside this folder

| Path | Why it stays there |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Read from the repo root every session by Claude Code. |
| [`AGENTS.md`](../AGENTS.md) | Agent-instructions convention expects it at the repo root. |
| [`README.md`](../README.md) | GitHub convention. |
| [`SECURITY.md`](../SECURITY.md) | Hardening decisions and the vulnerability-report address; GitHub surfaces it from the root. |
| `apps/erp/README.md` | The product app — stack, setup, env vars, scripts. (Was `apps/www` before the 2026-08-20 rename.) |
| `apps/superadmin/README.md` | The internal back-office app (super_admin + accountant portals). |
| `apps/www/README.md` | The public marketing site. |
| `apps/realtime/README.md` | The standalone Socket.IO chat server. |
| `apps/erp/bruno/README.md` | The generated Bruno API collection sitting in that folder. |
| `packages/database/README.md` | The only package importing Prisma — schema, migrations, RLS, queries. |
| `packages/eslint-config/README.md` | Shared ESLint config package. |
| `apps/erp/.claude/skills/**` | Claude Code skill definitions — the loader requires this exact path. |

## This folder's own two files

| Document | What it's for |
|---|---|
| [follow-ups.md](follow-ups.md) | Known issues deliberately left open, each with what would close it. Ten entries. |
| [testing/playwright-revival-analysis.md](testing/playwright-revival-analysis.md) | Why the Playwright suite is where it is. |

## Conventions

- **Reports are dated snapshots.** `reports/`, `product/prd-compliance-audit.md`,
  and `security/security-audit.md` describe the codebase as of their stated
  date. Do not read them as current state.
- **Stale documents are banner-marked, not deleted.** A document that no longer
  matches the codebase gets a warning banner at the top stating what is
  outdated and when it was last accurate.
- **Relative links only**, so the tree stays movable.
