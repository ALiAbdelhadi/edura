# Project Context

Education platform for the Egyptian market (K-12 private lessons / teaching centers).

## Apps & Roles
- `erp` app (`apps/erp`, formerly `apps/www`): four roles — Center, Teacher, Parent, Student.
- `superadmin` app (`apps/superadmin`, built): Super Admin + Accountant only — full
  control over every entity in the database. No superadmin functionality may ever
  exist in the erp app.

(`apps/www` is now the marketing/landing site.)

## Core Domain Rules
- Onboarding: each student selects an academic year + detailed track (شعبة).
  Subjects are auto-assigned from a track-to-subject mapping. The subjects/classes
  page shows ONLY the student's track subjects by default, with a separate
  "browse all subjects" search mode.
- Subscriptions: a student subscribes either to an individual Teacher or to a Center.
- Payments: online via Paymob (foundation + sandbox + mock mode), or cash at the
  center (walk-in, recorded by center staff).
- Walk-in registration at a center creates a student account and sends a WhatsApp
  message containing the Student ID + a secure tokenized link to complete onboarding.
- Attendance at centers is a per-teacher setting with two modes:
  (A) counter check-in only, or (B) counter check-in + a second check-in at the
  classroom door.
- Teachers and Centers can send each other collaboration requests (subject, year,
  hall, schedule, optional expected student count). Either side accepts/rejects;
  acceptance creates the class/schedule.
- Teachers can delegate management to Assistant accounts acting on their behalf,
  with audit attribution.

## Scope limits (full text in `.claude/rules/domain-decisions.md`)
- **Descoped for good (2026-07-21):** AI bot / chatbot / AI assistant (the
  `chatbot_*` tables stay inert), scholarships, bookstore, video lessons. Never
  build, scaffold or re-add them; skip them in any design. A `lesson` = a live
  class `Session` (money/attendance engine) — core, untouched.
- **Deferred:** debt / credit / pay-later ("بالأجل") — no build, no placeholder UI.
- **Post-launch only:** the Next.js rendering/caching pass; never cache money,
  wallets, subscriptions, attendance, messaging, auth/session or per-user data.

## Conventions
- **STATE CLAIMS MUST NAME THEIR ENVIRONMENT** (`dev`, `test`, `production`,
  each labelled `edura-env:<env>` inside itself): say which one anything is
  applied, present, seeded or wiped in. Prefer running the read-only
  `packages/database/scripts/verify-db.ts` over trusting a sentence.
- All demo/seed data is flagged `is_demo = true` so it can be purged later.
  Purgeable `is_demo` demo data is wiped before launch. This NEVER includes the
  permanent reference data — the Egyptian education catalog (systems / stages /
  grades / tracks / subjects / offerings) and my real superadmin/accountant
  accounts — which always stay.
- **Realistic demo data during development:** whenever building a new
  feature/screen/system, also seed enough realistic demo data (flagged
  `is_demo = true`) so I can view and test it as if it were real — populated
  screens, not empty states. Keep all demo data in clearly-labeled,
  cleanly-removable seed scripts. NEVER let demo data write to the money
  ledger, wallets, or finance tables unless the feature being built IS a money
  feature and I've approved its plan — and even then, flag it `is_demo` and
  keep it purgeable. This demo data is for my preview only and gets wiped
  before launch (Step 9 style).
- Bun (>= 1.4.0) is the only package manager and runtime — never npm/pnpm/yarn
  installs; details in `.claude/rules/runtime-bun.md`.
- Secrets only via env vars (e.g. PAYMOB_*, WHATSAPP_*). Never hardcode.
- Destructive operations use soft-delete; all superadmin writes go to an audit log.
- Prefer incremental, migration-safe schema changes.
- Git: Claude never runs git add/commit/push and never adds a Co-Authored-By or
  any other trailer to commit messages. Claude only provides the commit message
  text; I run all git commands myself.
- Full text with the dated dev/production notes →
  [conventions-history](docs/claude/conventions-history.md)

## Approved decisions (2026-07-18) — summary
> **TERMINOLOGY WARNING:** in this codebase `dashboard/admin` is the **CENTER**
> portal (role `center_admin`) — it stays in apps/erp, untouched. The app being
> extracted is the SUPER ADMIN platform portal (`dashboard/superadmin` +
> `/api/v1/admin/**`). The new app is named **`apps/superadmin`** — NOT
> `apps/admin` — to avoid confusion with the center portal.
Items 1–11 (back-office, subscriptions, collaboration, attendance, WhatsApp,
`is_demo`, Paymob, assistants, roadmap) → `.claude/rules/domain-decisions.md`.

## Binding invariants
Read the linked decision before changing anything it governs. Violating one is
never a local change.
**Money**
- **MONEY DIRECTION IS UNCHANGED BY WHO PAID.** A parent-funded subscription
  still moves `student -> center/teacher` (`fromEntityId = studentId`); who paid
  is recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
  redirecting the ledger. → [parent-pays-lesson](docs/decisions/parent-pays-lesson.md)
- **NO SECOND MONEY ENGINE.** Every new money path routes through the existing
  primitives (`createWalkInSubscription`, `distributeSessionRevenue`, the H2
  conditional decrement). → [external-teachers](docs/decisions/external-teachers.md)
- **ONE DERIVATION OF WHAT A LESSON IS WORTH** — `resolveLessonPrice`. An
  unpriced lesson REFUSES to complete rather than settling zero.
  → [lesson-settlement](docs/decisions/lesson-settlement.md)
- **MONEY IN THE BACK-OFFICE APP MOVES ONLY THROUGH SANCTIONED CENTRE
  FUNCTIONS, AUDITED — it is not "read-only".** Exactly four writers:
  `adminRecordPayment`, `adminTopUpWallet`, `adminCreateWalkInSubscription`
  (`center-money.ts`, each the SAME `*Tx` the ERP counter runs + audit) and
  `refundLessonForStudent` (`super_admin` only). The ledgers are append-only for
  `edura_app` and `payments` cannot be deleted. A `super_admin` CAN move money
  through "view as", under the target's own ERP session (Ali's choice).
  → [superadmin-center-oversight](docs/decisions/superadmin-center-oversight.md),
  [superadmin-view-as](docs/decisions/superadmin-view-as.md)
- **AN EXPORT RUNS THE SAME SERVICE FUNCTION THE SCREEN RUNS.** A report that
  re-derives its own totals is a second set of books.
  → [report-export](docs/decisions/report-export.md)
- **THE COUNTER BOARD WRITES NOTHING OF ITS OWN** — three reads; every commit
  goes through `counterCheckin` and the existing per-session subscription.
  → [counter-board](docs/decisions/counter-board.md)

**Child safety and identity**
- **DEFAULT-MINOR.** `isMinor()` is one POSITIVE adult condition:
  `adult = dateOfBirth AND dateOfBirthVerifiedAt AND age >= 18`. Missing,
  unverified, or under-18 all mean MINOR with parent oversight ACTIVE.
  → [messaging](docs/decisions/messaging.md)
- **CHILD-SAFETY GATE.** A MINOR with no guardian EMAIL has adult-facing
  messaging LOCKED (`chat-guardian.ts`, the single rule). A guardian PHONE does
  NOT satisfy it. The account is never suspended by this rule.
  → [email-invites-guardian](docs/decisions/email-invites-guardian.md)
- **THE STUDENT CODE CARRIES NO PERSONAL DATA.** Derived from a SHA-256 of the
  student's own profile id — never from initials, birth date or phone. Its check
  character rejects any single mistype or adjacent transposition. → [student-id-card](docs/decisions/student-id-card.md)
- **THE CARD QR MINTS NO SESSION.** `guardian_email_verification` and the card
  credential are deliberately ABSENT from `CLAIMABLE`; the signed URL grants
  nobody anything.
  → [student-card-qr](docs/decisions/student-card-qr.md),
  [guardian-email-verification](docs/decisions/guardian-email-verification.md)
- **ONE DEFINITION OF "THE SAME CHILD"** — `findStudentByKeys` /
  `normalizeNationalId`. No importer, counter or seed may hold a second one, and
  there is no "create anyway" flag. → [bulk-student-import](docs/decisions/bulk-student-import.md)

**Auth and authorization**
- **ONE SUSPENSION MECHANISM.** Accounts are disabled through `users.status`
  (+ the 3-level blacklist). better-auth's `banned` / `ban_reason` / `ban_expires`
  columns are never written and `auth.api.banUser` is never called.
  → [admin-user-directory](docs/decisions/admin-user-directory.md)
- **`sendResetPassword` IS DELIBERATELY NOT SET, in both apps.** It does not
  bump `users.token_version`, so it would silently undo L1. Reset stays on
  `requestPasswordReset`. → [operational-layer](docs/decisions/operational-layer.md)
- **AN EXTERNAL TEACHER IS A `users` ROW, NOT A NEW ENTITY** (role `teacher`,
  `status='shell'`, `password_hash NULL`). No login is enforced by the door that
  already exists. → [external-teachers](docs/decisions/external-teachers.md)
- **"VIEW AS" IS A SECOND DOOR, NOT A HOLE IN THE FIRST.** `login-policy.ts` is
  untouched and no back-office cookie ever crosses; a signed, 60-second,
  single-target handoff token does, and the ERP mints its OWN session. In-app
  impersonation takes back-office targets; view-as takes ERP roles — exactly one
  mechanism per target. The one-hour window is enforced from
  `auth_sessions.created_at`, NOT `expires_at`. → [superadmin-view-as](docs/decisions/superadmin-view-as.md)
- **GLOBAL SEARCH ADDS NO REACH.** Every provider reads what the caller's role
  already reads through an existing route, under the same tier constant and the
  same tenancy — and offers nothing the role cannot open.
  → [global-search](docs/decisions/global-search.md)

**Design and delivery**
- **TOKENS ARE RE-POINTED, NOT RENAMED.** Values move; names stay.
  → [classical-ledger-redesign](docs/decisions/classical-ledger-redesign.md)
- **ON-DEMAND READS — a DEFAULT, not a law.** A screen must not spend a query on
  something the reader has not asked to see; but the primary thing a page exists
  for still loads with the page. → [student-card-qr](docs/decisions/student-card-qr.md)

## Databases & production procedure (current)

- Endpoints: dev `ep-withered-field-b23csnyq`, production
  `ep-mute-rice-b2s8gg42`, Neon test `ep-morning-snow-b269im2n` (only via
  `db:neon:env`; the default test DB is local). Every other endpoint is dead.
- **EVERY PRISMA COMMAND AGAINST A NON-DEV DATABASE STARTS WITH `EDURA_ENV`**,
  and uses `npx prisma` / `npx tsx` — never `bun run db:*`, which reaches dev
  whatever `EDURA_ENV` says. Read the `Datasource "db": … at "<host>"` line
  prisma prints and check the endpoint before trusting anything below it.
- Merging a migration applies it nowhere. A migration reaches production BEFORE
  the code that needs it deploys. Never apply one ahead of a sibling branch that
  owns the same object; migration order in the repo is the contract.
- Hosts: `edura-erp.vercel.app`, `edura-www.vercel.app`,
  `edura-superadmin.vercel.app`. **`app.edura.eg` is NOT in use** — do not put
  it in code, config or docs.

## Path-scoped rules (`.claude/rules/`, loaded automatically when you open matching files)
- `db-and-migrations.md` — DB suites, migration counts, prod deploy recipe, bootstrap,
  Prisma-cannot-model objects. Loads on DB files (`packages/database/**`, `apps/*/tests/db/**`, `*.sql`).
- `runtime-bun.md` — Bun runtime rules. Loads on `package.json`, `bun.lock`, workflows, `scripts/`.
- `prod-env-vars.md` — required production env vars. Loads on `.env*`, instrumentation, auth, server-core, `vercel.json`.
- `design-stitch.md` — Stitch design workflow + the command that restores the
  Stitch MCP (removed 2026-09-27). Loads on `.tsx`, `packages/ui`, CSS.
- `domain-decisions.md` — full scope limits, approved decisions 1–11, shipped-work decision index. Loads on app/package source, `schema.prisma`, `docs/decisions/`.
- `graphify.md` — graphify usage (`graphify query`, `graphify update .` after code changes).

## Reference docs (read on demand)

- [environment-state](docs/claude/environment-state.md) — before any migration,
  production DB work, deploy, or environment-state claim.
- [db-suites](docs/claude/db-suites.md) — odd DB-suite failures; test env, guard or runner changes.
- [runtime-bun](docs/claude/runtime-bun.md) — Bun versions, start/dev scripts, CI pins.
- [security-remediation](docs/claude/security-remediation.md) — rate limiting,
  client IP, CSP, cron auth, dependency overrides, prod env vars.
- [approved-decisions](docs/claude/approved-decisions.md) — subscriptions,
  attendance, collaboration, assistants, Paymob.
- [conventions-history](docs/claude/conventions-history.md) — dated seed/wipe history.
- [project-rules-full](docs/claude/project-rules-full.md) — uncompressed
  Descoped, Deferred, Post-launch, invariants, Stitch, graphify.
