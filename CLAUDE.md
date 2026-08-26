# Project Context

Education platform for the Egyptian market (K-12 private lessons / teaching centers).

## Apps & Roles
- `www` app (existing): four roles — Center, Teacher, Parent, Student.
- `admin` app (separate, to be built): Super Admin only — full control over every
  entity in the database. No superadmin functionality may ever exist in the www app.

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

## Descoped (not building)

These four systems are **permanently dropped** from the roadmap (decided
2026-07-21). Do NOT build them, do NOT scaffold routes/screens/nav entries for
them, and do NOT re-add them to the roadmap. If a Stitch design (or any future
spec) includes them, skip those parts — treat their absence as intentional, not
a gap to fill.

1. **AI bot / chatbot / AI assistant** — no support bot, academic bot, AI tutor,
   or any AI-assistant surface. (The `chatbot_config` / `chatbot_faq` /
   `chatbot_conversations` tables in `schema.prisma` were always schema-only with
   no logic wired; they stay inert — do NOT wire any AI logic to them. Removing
   the tables is a DB migration and would need its own approved plan; leaving
   them dormant is fine.)
2. **Scholarships** — no scholarship entity, application flow, or UI.
3. **Bookstore** — no book catalog, store, or purchase flow.
4. **Videos / video lessons** — no pre-recorded video-lesson library, player, or
   content-upload surface. NOTE: this does NOT touch "lessons" in the money/
   attendance sense — in this codebase a `lesson` = a live class `Session`
   (the fee/points/attendance engine), which is core and untouched.

As of 2026-07-21 none of these four had any UI entry point in `apps/www` or
`apps/superadmin` (verified by search) — nothing was built, so nothing was
removed. This section is the guard so they are never revisited.

## Deferred (revisit later)

Unlike the Descoped systems above (permanently dropped), these are paused — not
killed. Do NOT build them now, and strip/hide any placeholder UI for them from
both the app and any designs. Revisit only when explicitly requested with the
business rules defined.

1. **Debt / credit (pay-later)** — deferred (decided 2026-07-21). Debt/credit
   (pay-later) is high-risk money functionality; deferred until explicitly
   needed with defined business rules (who can grant debt, limits, repayment,
   interest). The wallet is built and is the foundation if/when we do it.
   As of 2026-07-21 there is NO debt/pay-later feature, schema table, i18n
   string, or placeholder UI anywhere (verified by search) — nothing was built,
   so nothing needed removing. (The accounting `credit`/`debit` entries in the
   Transaction ledger are the double-entry money engine, NOT this feature —
   they stay.) If a Stitch design (or any future spec) includes a pay-later /
   installments / "بالأجل" surface, skip it — treat its absence as intentional.

## Post-launch improvements (do NOT implement now)

Recorded 2026-07-25. These are tasks for AFTER launch. Do not start them while
the launch path (DB separation, remaining fixes, hosting) is in progress.

1. **Next.js 16 rendering + caching optimization pass** — review pages/routes
   and apply the right rendering strategy (SSR / static / streaming) and
   selective `'use cache'` where it genuinely helps.
   **HARD CONSTRAINTS:** never cache money, wallet balances, subscriptions,
   attendance, messaging, auth/session, or any per-user or stateful data —
   those stay dynamic and fresh every request.
   **Approach:** measure real traffic first to find actual slow paths, then
   optimize those specific pages one batch at a time with review — NOT a
   repo-wide sweep. This is a performance refinement for after launch, done
   carefully, not a pre-launch task.

## Runtime: Bun-only surface (binding, added 2026-07-31)

- Bun is the only package manager/toolchain AND the official runtime:
  both apps' `start` scripts run `bun --bun next start` (proven 2026-07-31:
  session endpoint + full credentials path return 401-not-500, zero external-
  module errors), and `apps/realtime` runs `bun src/server.ts` directly
  (`tsx` removed from the app).
- The ONE remaining internal Node surface: `next dev` (Turbopack). Under
  `bun --bun` its hashed external server modules (bcryptjs, @prisma/adapter-neon,
  ws, pg) fail to resolve and every `/api/auth/*` route 500s — proven
  2026-07-31. Do NOT flip dev to `--bun` until a Bun/Next upgrade passes the
  login smoke test. CI keeps `setup-node` for exactly this dev/build tooling.
- `packages/database` tooling is explicitly ALLOWED to keep Node/tsx
  (Ali's decision, 2026-07-31). No Node install instructions, `engines.node`,
  or Node references may appear anywhere user-facing; `engines` declare Bun only.

## The DB suites run against DEV (decided 2026-08-03, Ali)

The `test` Neon branch was unreachable — `ep-shiny-waterfall-as6cxn8n` refused
BOTH roles, and the other endpoint on disk (`ep-dry-shape-asv1ah7y`) was an
empty, UNLABELLED database. CLAUDE.md had recorded the credential failure since
2026-08-02; what changed is `f7555a4`, which stopped letting a SKIPPED DB suite
pass as green. So a long-silent breakage became a deploy blocker, and Ali chose
to point the suites at **dev** rather than rebuild the test branch.

- **The default is still test-only.** All 52 suites, `run-db-suites.ts` and
  `pretest:db` name `["test"]` explicitly and were NOT edited — a repo-wide
  loosening in git to express one local setup would have been the wrong trade.
  The widening is a single opt-in read in `db-guard.ts`:
  `EDURA_ALLOW_DB_ENVS=dev`, set in the three (ungitted) `.env.test` files and
  appended by CI's materialise step.
- **PRODUCTION IS NEVER WIDENABLE.** Naming `production` in that variable is a
  hard error, not a wider permission — it fails loudly rather than being quietly
  dropped, because a silently ignored value leaves someone believing they hold a
  permission they do not. Proven: production is refused both with
  `EDURA_ALLOW_DB_ENVS=dev` and with `=production`.
- **Dev keeps its `edura-env:dev` label.** Relabelling it `test` was rejected:
  the label is what `db:wipe` keys on (dev/test only), so a dev database wearing
  a test label quietly becomes wipeable, and every environment claim in this file
  would start lying.
- **[dev, measured 2026-08-03]** residue is far smaller than the 2026-07-26
  history suggests — that is what `test-cleanup.ts` was written to fix. `l1`
  (13 assertions) left the census byte-identical; `wallet` + `wallet-no-cap`
  (27 assertions, real money paths) left **one extra `audit_logs` row** and
  nothing else. `audit_logs` is append-only, so such rows accumulate slowly and
  permanently. Run `bun run test:db:sweep` if fixtures ever do pile up.
- CI needs `TEST_DATABASE_URL` / `TEST_DIRECT_URL` / `TEST_ADMIN_URL` repointed
  at the DEV branch for this to take effect there.

## Conventions

> **STATE CLAIMS MUST NAME THEIR ENVIRONMENT (binding, added 2026-07-26).**
> There are three databases — `dev`, `test`, `production` — each carrying its
> environment as a label INSIDE it (`edura-env:<env>`; see
> `packages/database/scripts/db-guard.ts`). Any sentence in this file asserting
> that something is *applied, in force, present, seeded, or wiped* MUST say which
> environment it is true of. An unqualified "applied" reads as "everywhere" and
> has already misled: the guardian migrations were applied to dev only, while
> this file said "applied" flatly, and production was two migrations behind
> without anyone noticing. Behaviour and policy claims ("the gate is
> default-closed") need no qualifier — only claims about the state of a
> database, an environment, or a deployment do.
>
> Environment state changes without a commit, so this file goes stale silently.
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target: prefer running it over trusting a sentence written here.

- All demo/seed data is flagged `is_demo = true` so it can be purged later.
  Purgeable `is_demo` demo data is wiped before launch. This NEVER includes the
  permanent reference data — the Egyptian education catalog (systems / stages /
  grades / tracks / subjects / offerings) and my real superadmin/accountant
  accounts — which always stay.
  **[dev, verified 2026-07-26]** the catalog is present (3 systems / 45 subjects
  / 27 grade levels) and the real operator account exists.
  **[dev, WIPED + RE-SEEDED 2026-07-31]** the entire dev database was reset at
  Ali's request with `packages/database/scripts/wipe-data.ts` (`bun run db:wipe
  dev --yes` — label-guarded, dev/test only, REFUSES production by design):
  552 users / 144 centers / 508 transactions truncated across 70 tables,
  sequences restarted. Later the same day Ali
  requested a FULLY EMPTY start: wiped again and seeded with the new
  `bun run seed --no-demo` (production-equivalent path: catalog + the two real
  staff accounts + points rules, ZERO demo entities). Census now: 2 users /
  0 centers / 0 courses / 0 money rows / 45 catalog subjects; verify-db 25/25
  green. NOTE: dev quick-login tiles and the local E2E role-portal tests need
  demo accounts — run the demo seeds (`bun run seed` + preview-seed) if a
  populated preview is ever wanted again; CI is unaffected (test branch seeds
  its own). Every dev-state claim in this
  file dated BEFORE 2026-07-31 (legacy unflagged rows, 41 leaked super_admins,
  student_profiles dob counts) is now historical — that data no longer exists. **[production, BOOTSTRAPPED 2026-07-31]** the production branch
  (ep-solitary-river…, labelled `edura-env:production` internally) is now LIVE-READY:
  all 40 migrations applied, seeded via the production seed path (45 catalog
  subjects / 411 offerings, the two real staff accounts from SEED_*, points
  rules, ZERO demo rows), the H2 `centers_wallet_balance_nonneg` CHECK
  VALIDATED, and verify-db reports 25/25. During bootstrap the role-guard
  caught the old prod `DATABASE_URL` pointing at `neondb_owner` — it now uses
  `edura_app` (password synced to `APP_ROLE_PASSWORD`); the owner string lives
  only in `ADMIN_URL`/`DIRECT_URL`. (The earlier 2026-07-26 note — empty shell,
  68 tables, never seeded — is history.)
  **[production, 2026-08-02] CAUGHT AND FIXED: production had been running
  better-auth CODE against a database with NO auth tables.** `better_auth` was
  merged to main on 2026-08-01 but never applied to production, so
  `auth_sessions` / `auth_accounts` / `auth_verifications` / `two_factors` did
  not exist there and EVERY sign-in returned 500 instead of 401 — proven by
  probing the deployed login door with deliberately invalid credentials before
  and after. Every pending migration was applied — `better_auth`,
  `maturity_enums`, `maturity_layer`, `contact_submissions`: production went
  41 → 45 migrations, 70 → 77 tables, verify-db 25/25, and the login door now
  returns 401. Data was untouched (6 users / 1 center / 0 money rows before and
  after).
  **A second lesson from the same session, kept because it was a real mistake:**
  `contact_submissions` was applied to production BEFORE the workstream that
  owned the table had merged its own (non-idempotent) `maturity_layer`
  migration. That left production unable to run maturity_layer at all — its
  plain `CREATE TYPE contact_submission_status` would have aborted on the type
  this branch had already created, taking `feature_flags` and
  `data_export_requests` down with it. The repair was to drop the (empty,
  0-row) table and type, delete the migration's row from `_prisma_migrations`,
  and re-run the whole set in name order so `maturity_layer` created the table
  as its author intended. Do NOT apply a migration to production ahead of a
  sibling branch that owns the same object; migration order in the repo is the
  contract, and applying out of order breaks it for everyone downstream.
  **The lesson, written down because it cost a live outage:** merging a
  migration to main does NOT apply it anywhere. A branch whose code needs new
  schema must have its migration applied to production BEFORE that code
  deploys, and `verify-db` against production is the check that would have
  caught it on day one — it is read-only and safe against any target.
  Bootstrap order for a fresh environment: `label-db` → `bootstrap-app-role` →
  `prisma migrate deploy` → `seed` → `verify-db`.
- **Realistic demo data during development:** whenever building a new
  feature/screen/system, also seed enough realistic demo data (flagged
  `is_demo = true`) so I can view and test it as if it were real — populated
  screens, not empty states. Keep all demo data in clearly-labeled,
  cleanly-removable seed scripts. NEVER let demo data write to the money
  ledger, wallets, or finance tables unless the feature being built IS a money
  feature and I've approved its plan — and even then, flag it `is_demo` and
  keep it purgeable. This demo data is for my preview only and gets wiped
  before launch (Step 10 style).
- Secrets only via env vars (e.g. PAYMOB_*, WHATSAPP_*). Never hardcode.
- Destructive operations use soft-delete; all superadmin writes go to an audit log.
- Prefer incremental, migration-safe schema changes.
- Git: Claude never runs git add/commit/push and never adds a Co-Authored-By or
  any other trailer to commit messages. Claude only provides the commit message
  text; I run all git commands myself.

## Approved decisions (2026-07-18)

The implementation roadmap is the 10-step order in
[docs/architecture/architecture-review.md](docs/architecture/architecture-review.md) §5 (Step 0 done).
Work stops after each step for review before the next begins.

> **TERMINOLOGY WARNING:** in this codebase `dashboard/admin` is the **CENTER**
> portal (role `center_admin`) — it stays in www, untouched. The app being
> extracted is the SUPER ADMIN platform portal (`dashboard/superadmin` +
> `/api/v1/admin/**`). The new app is named **`apps/superadmin`** — NOT
> `apps/admin` — to avoid confusion with the center portal.

1. **Back-office**: ONE internal app, `apps/superadmin`, hosting two staff roles:
   `super_admin` (full platform control — everything from `dashboard/superadmin`
   + `/api/v1/admin/**`) and `accountant` (`/dashboard/finance` +
   `/api/v1/finance/**` as a restricted portal; finance screens ONLY, enforced at
   the API layer, not just navigation). Its NextAuth `authorize()` accepts only
   those two roles. Own subdomain + own cookie names, fully separated from www
   sessions. www keeps only: center, teacher, parent, student, assistant.
   Superadmin live chat is dropped for now (broadcast notifications only).
2. **Subscriptions & pricing**: both payment plans supported — MONTHLY (one
   month, manual renewal by paying again, online or cash; no auto-charge) and
   PER-SESSION (pay-as-you-go, modeled as a single-session pass tied to a
   specific session). The course owner configures which plans are enabled per
   course and their prices (`pricePerMonth`, `pricePerSession`; at least one
   enabled); the student/parent picks at checkout. Subscription WRAPS
   enrollment: enrollment stays the roster link; the subscription/pass is the
   payment coverage that access/attendance checks consult. Flow: pick target
   (teacher or center) → pick course/group → pick plan → pay → coverage +
   enrollment created together. Center counter must support cash for a single
   session + counter check-in in ONE step (the classic Egyptian center
   workflow). Teacher-direct courses: nullable `Course.centerId` with
   teacher-owned semantics (NO shadow centers), optional free-text location
   (own venue or online), money split = platform commission only.
3. **Collaboration requests REPLACE `ClassroomBooking` and absorb the
   affiliation invite** (pre-launch, prefer the clean model). The request
   carries `proposedCenterShare` so the money engine keeps working.
4. **Attendance modes**: global per-teacher setting, default `counter_only`.
   Counter check-in = center front-desk staff; in `counter_only` mode that
   single check-in marks the student attending the specific session they chose.
   In `counter_and_door` mode the door check-in at the hall entrance is done by
   the TEACHER'S ASSISTANT (teacher's own account as fallback). Counter without
   door = a distinct "counter_only" status that does NOT count as present,
   flagged visibly to the teacher. Manual Student ID entry required; QR
   scanning supported where simple.
5. **WhatsApp**: Meta WhatsApp Business Cloud API as the real driver behind an
   abstraction + a mock/log mode. No verified business number yet → run mock
   and prepare templates for Meta approval. Design so OTP/phone verification
   can be added later; OTP itself is out of scope this phase.
6. **`is_demo`**: flag root entities only (users, centers, courses); children
   inherit by ancestry. The Egyptian education catalog is permanent reference
   data — do NOT flag it. Hardcoded quick-login buttons gated behind
   `NODE_ENV !== "production"`.
   **Leftover legacy data (decided 2026-07-18; recounted 2026-07-26):**
   unflagged rows created by past live-DB test runs (not by the seed, no stable
   identifiers) stay untouched for now. **[dev, measured 2026-07-26]** the count
   is now **378 unflagged users / 124 centers / 130 courses** — the figures
   originally recorded here (~144 / 21 / 19) were from 2026-07-18 and had grown
   2.6–7× by the time anyone looked again. Among those users are **41 non-demo
   `super_admin` accounts leaked by DB test fixtures** (see
   docs/reports/seed-and-fixture-findings.md). Treat any count in this file as a
   snapshot with a date, never as current. **[production]** zero of any of it. Before launch, ALL non-seed
   data gets wiped — this is on the Step 9 (deprecation & hardening) checklist
   in docs/architecture/architecture-review.md; do not attempt to flag it by heuristic.
   **Step 9 wipe note (added in Step 4):** cash payments recorded BEFORE the
   Step 4 ledger reconciliation were never mirrored to the Transaction ledger
   (forward-only reconciliation, deliberately not backfilled) — they are part
   of the pre-launch wipe; do not read pre-Step-4 cash history as
   ledger-complete.
7. **Paymob**: card iframe + mobile wallets only; kiosk/Aman and Fawry out of
   scope this phase. Mock-first with the paymob driver ready; `PAYMOB_*` env
   keys arrive when the account is created.
8. **Schema drift**: approved and done (Step 0) — `schema.prisma` restored from
   the generated client; the two untracked migrations committed.
9. **Assistants**: an assistant serves EXACTLY ONE teacher — enforce in schema
   with a partial unique on `assistantId` where `removedAt IS NULL`. Delegation
   default = everything the teacher can do (attendance incl. door check-ins,
   grades, materials, schedules, collaboration requests, attendance-mode
   setting, messaging) EXCEPT wallet/payouts/financial settings and managing
   other assistants. Audit every action as "assistant X on behalf of teacher Y".
10. **Step 2 follow-on (approved 2026-07-18 — schedule right after the Step 2
    review, before Step 3):** in `apps/superadmin`, add generic auto-CRUD
    screens for every entity plus custom screens for the important ones
    (users, centers, teachers, subscriptions, payments), an audit-log viewer
    UI, and a dashboard home with counters (students / teachers / centers /
    active subscriptions / total revenue). Every list view gets search,
    filters, and pagination; destructive actions use soft-delete. This was
    deliberately deferred out of Step 2, which was extraction only.
11. **Step 3 done — Paymob foundation (2026-07-19).** Gateway abstraction +
    working mock driver (default, `PAYMENTS_MODE=mock`), EMPTY paymob driver
    stub (TODOs mark where auth token → order → payment key → iframe/redirect
    and HMAC verification go — real API deliberately not integrated),
    `payment_intents` table, initiate + HMAC-verified idempotent webhook,
    amount always from the server-side intent. Successful online settlement
    writes Payment + **Transaction** + points + notification.

    > **✅ LEDGER RECONCILIATION — DONE in Step 4 (2026-07-19):** cash
    > payments now mirror to the Transaction ledger (type payment/refund,
    > method cash) in the same DB transaction as the Payment row; the
    > "online payments only" caveat notes were removed. Forward-only: cash
    > payments recorded BEFORE Step 4 were never mirrored — see the Step 9
    > wipe note in decision #6.

## Binding invariants

Rules that hold across the whole product. Each was decided once, for a reason
written down in the linked file — read that file before changing anything it
governs. Violating one of these is never a local change.

**Money**

- **MONEY DIRECTION IS UNCHANGED BY WHO PAID.** A parent-funded subscription
  still moves `student -> center/teacher` (`fromEntityId = studentId`); who paid
  is recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
  redirecting the ledger. → [parent-pays-lesson](docs/decisions/parent-pays-lesson.md)
- **NO SECOND MONEY ENGINE.** Every new money path routes through the existing
  primitives (`createWalkInSubscription`, `distributeSessionRevenue`, the H2
  conditional decrement). → [external-teachers](docs/decisions/external-teachers.md)
- **ONE DERIVATION OF WHAT A LESSON IS WORTH** — `resolveLessonPrice`. The
  engine, the back-office preview and the www preview all call it. An unpriced
  lesson REFUSES to complete rather than settling zero.
  → [lesson-settlement](docs/decisions/lesson-settlement.md)
- **MONEY IS READ-ONLY IN THE BACK-OFFICE APP, and superadmin is NOT exempt
  THERE.** The DB-level REVOKEs bite for `super_admin` too; no GRANT and no
  second DB role was added, and no back-office module imports a money service.
  **QUALIFIED 2026-08-20 — read this before quoting the rule:** a `super_admin`
  CAN now move money, by using "view as" to become an ERP user inside the ERP
  app, under that user's own session. Ali chose that explicitly over the
  recommended "block money routes during view-as". The capability comes from the
  target's session in the other app, never from a money surface added to
  apps/superadmin. Every such write still carries its own ledger row and audit,
  and the session behind it carries `impersonated_by`.
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
  student's own profile id — never from initials, birth date or phone. The check
  character is the point: no single mistype and no adjacent transposition can
  produce a valid code. → [student-id-card](docs/decisions/student-id-card.md)
- **THE CARD QR MINTS NO SESSION.** `guardian_email_verification` and the card
  credential are deliberately ABSENT from `CLAIMABLE`; a signed URL proves
  authenticity and allows revocation, and grants nobody anything.
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
- **`sendResetPassword` IS DELIBERATELY NOT SET, in both apps.** better-auth's
  own reset writer does not bump `users.token_version` — the write that fires
  `users_revoke_sessions` — so wiring it would silently undo L1. Reset stays on
  `requestPasswordReset`. → [operational-layer](docs/decisions/operational-layer.md)
- **AN EXTERNAL TEACHER IS A `users` ROW, NOT A NEW ENTITY** (role `teacher`,
  `status='shell'`, `password_hash NULL`). No login is enforced by the door that
  already exists. → [external-teachers](docs/decisions/external-teachers.md)
- **"VIEW AS" IS A SECOND DOOR, NOT A HOLE IN THE FIRST.** `login-policy.ts` is
  untouched — a `super_admin` still cannot type their way into the ERP — and no
  back-office cookie ever crosses. What crosses is a signed, 60-second,
  single-target handoff token; the ERP re-reads the actor and the target and
  mints its OWN session. In-app impersonation takes back-office targets and
  refuses ERP roles; view-as takes ERP roles and refuses back-office ones —
  exactly one mechanism per target. The one-hour window is enforced from
  `auth_sessions.created_at`, NOT `expires_at`, which better-auth's rolling
  refresh extends out from under any short expiry (measured: 3600s written,
  2592000s read back). → [superadmin-view-as](docs/decisions/superadmin-view-as.md)
- **GLOBAL SEARCH ADDS NO REACH.** Every provider reads what the caller's role
  already reads through an existing route, under the same tier constant and the
  same tenancy — and offers nothing the role cannot open.
  → [global-search](docs/decisions/global-search.md)

**Design and delivery**

- **TOKENS ARE RE-POINTED, NOT RENAMED.** Values move; names stay, because they
  are generated inside `@theme` and read by hundreds of call sites.
  → [classical-ledger-redesign](docs/decisions/classical-ledger-redesign.md)
- **ON-DEMAND READS — a DEFAULT, not a law.** A screen must not spend a query on
  something the reader has not asked to see; but the primary thing a page exists
  for still loads with the page. → [student-card-qr](docs/decisions/student-card-qr.md)

## Environment state

> Per the Conventions rule above, every claim here names its environment.
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target: prefer running it over trusting a line written here.

> **EVERY PRISMA COMMAND AGAINST A NON-DEV DATABASE STARTS WITH `EDURA_ENV`.**
> Not a style preference — it is the ONLY input that selects the database, and
> every other way of pointing prisma somewhere reaches **dev**, silently:
>
> ```bash
> EDURA_ENV=production npx prisma migrate deploy   # from packages/database
> ```
>
> `prisma.config.ts` loads `.env.${EDURA_ENV}` (defaulting to `.env`, which is
> dev) and passes the resulting `DIRECT_URL` as the datasource. Sourcing
> `.env.production` into the shell first does NOT work: measured 2026-08-20,
> `set -a; . ./.env.production; npx prisma migrate status` reported it was
> connected to `ep-patient-scene-…` — **dev** — while the operator believed they
> were looking at production. The command printed a perfectly ordinary
> "2 migrations pending" against the wrong database. `migrate deploy` run the
> same way would have applied them there.
>
> So: read the `Datasource "db": … at "<host>"` line prisma prints on EVERY
> invocation and check the endpoint before trusting anything below it.
> Production is `ep-solitary-river-…`; dev is `ep-patient-scene-…`.
>
> The same variable is what arms the guard: with `EDURA_ENV=production`,
> `prisma.config.ts` REFUSES `migrate dev`, `migrate reset`, `db push` and
> `db execute` outright. Reaching production without it means reaching it with
> the safety off as well as by accident.
>
> `scripts/*.ts` (db-guard, verify-db, wipe-data, seeds) read the same variable
> through `scripts/load-env.ts`, so `EDURA_ENV=production npx tsx scripts/…`
> is the one form for those too.

- **[dev AND production, 2026-08-20]** **57 migrations, verify-db 28/28 on
  BOTH**, identical in shape (79 tables / 6 sequences / 38 RLS tables / 59
  policies / 57 migrations). The 57th is `20260820180000_search_text_remaining`:
  `search_text` on `student_profiles` and `rooms`, completing the rule that
  **EVERY TABLE A FREE-TEXT SEARCH REACHES CARRIES `search_text`** — six tables,
  and `apps/erp/tests/db/search-normalize.test.ts` asserts that set exactly, so
  a seventh column appearing (or one of these disappearing) is a red test.
  **WHY SIX AND NOT SEVENTY-NINE**, measured rather than assumed: 58 tables carry
  a candidate free-text column, but only six are reached by any search in the
  product — no Prisma `contains`, no refine `operator: "contains"`, nothing, on
  the other 52. A generated column there is write cost on every insert and update
  with no reader, and on `transactions` / `points_ledger` / `wallet_ledger` /
  `audit_logs` — append-only, money, highest volume — it is that cost per ledger
  row forever. The `chatbot_*` tables are descoped surface and were not touched.
  **`student_code` AND THE GUARDIAN COLUMNS ARE DELIBERATELY ABSENT** from the
  student haystack: the code is matched through `readStudentScan`, whose check
  character means a mistype resolves to NOBODY rather than to a different child,
  and a guardian's email or phone would make a CHILD findable by their parent's
  contact details. Both would widen reach, which global-search rule 1 forbids.
  **`lookupStudents` KEPT ITS JS DECIDE PASS**, and that is not redundancy: its
  haystack spans TWO tables (the profile's name/phone and the user row's), a
  generated column cannot reference another table, and a query naming a student
  by their user-row name and their profile phone satisfies the joined haystack
  and NEITHER column alone. The columns are its pre-filter; JS is its decision.
- **[dev AND production, 2026-08-20]** **56 migrations, verify-db 28/28 on
  BOTH** — the shape is identical again (79 tables / 6 sequences / 38 RLS tables
  / 59 policies / 56 migrations). The 56th is
  `20260820160000_search_text_columns`, applied to dev and then to production
  the same day; production's pre-flight showed exactly ONE pending migration
  with no sibling riding along, and 9 / 2 / 1 / 0 rows to backfill.
  It adds ONE `search_text` column to each of `users`, `centers`, `courses` and
  `contact_submissions`, **`GENERATED ALWAYS AS (edura_search_haystack(…))
  STORED`** — the row's searchable fields normalized, plus the same text with
  its spaces closed up, which is exactly what `matchesSearchTerms` compares. It
  also retires the five expression indexes from migration 55, whose query the
  application no longer issues. Tables stay 79: a column is not a table.
  **THE HAZARD, WRITTEN DOWN BECAUSE IT IS SILENT.** A STORED generated column
  is computed on WRITE. `CREATE OR REPLACE FUNCTION` on `edura_search_normalize`
  with a different body would NOT recompute the rows already stored, and the
  database would hold two definitions of the same word with nothing to say so.
  **Changing the normalizer requires rebuilding these columns.**
  `apps/erp/tests/db/search-normalize.test.ts` compares every stored value
  against a live call, which is what turns that into a red test rather than a
  quiet divergence — 43/43 on dev.
  **Prisma does not model generated columns**, so `prisma migrate dev` will
  propose turning them into ordinary ones. They are named in `schema.prisma`
  (with that warning on `User.searchText`) only so a typed `where` can filter
  them; writing to one fails at the database, which is a loud failure.
  Measured after applying, on production itself: all four columns report
  `is_generated = ALWAYS`, the four `*_search_text_trgm` indexes exist, zero
  expression indexes remain, zero desync rows, and data untouched (9 users /
  2 centers / 1 course / 0 payments / 0 transactions).
- **[dev, 2026-08-20]** **55 migrations, verify-db 28/28** — level with
  production again. The two were applied the same day and the same way
  (`npx prisma migrate deploy`, EDURA_ENV unset, which is what selects dev; the
  printed datasource read `ep-patient-scene-…`). Pre-flight matched production's:
  `centers_wallet_balance_nonneg` was already `convalidated`, no negative wallet
  balance, no `*_search_trgm` index yet. Data untouched: 257 users / 71 centers
  / 62 courses before and after.
  **The normalizer proven against real dev rows, which is the whole point:**
  searching `احمد` through `edura_search_normalize` returns 3 (أحمد الشناوي,
  أ. أحمد الشناوي, يوسف أحمد) where plain `ILIKE '%احمد%'` returns **0** — the
  exact failure the migration header measured on 2026-08-19.
- **[production, 2026-08-20]** **55 migrations, verify-db 28/28.** The two above
  were applied 2026-08-20 with `EDURA_ENV=production npx prisma migrate deploy`.
  Pre-flight (read-only) proved: the label reads `edura-env:production`, exactly
  those two were pending with no sibling riding along, `centers` held no negative
  wallet balance, and the five tables to be indexed held 9 / 2 / 1 / 0 rows — so
  the migration's own `NOT CONCURRENTLY` caveat did not bite. After: `pg_trgm`
  installed, `edura_search_normalize` present with EXECUTE granted to
  `edura_app`, five `*_search_trgm` indexes built, and the normalizer proven on
  production itself (`أحمد` == `احمد`, `فريدة` == `فريده`, `كنزي` == `كنزى`).
  `centers_wallet_balance_nonneg` was ALREADY `convalidated` there, so the first
  migration was the no-op its guard intends. Data untouched: 9 users / 2 centers
  / 1 course / 0 payments / 0 transactions, identical before and after.
  The 28th check is new — verify-db now asserts `convalidated` on that CHECK,
  which is the gap the first of these two migrations closes for fresh
  environments.
- **[2026-08-18, HISTORY — the two lines above supersede it]** 53 migrations,
  79 tables, verify-db 27/27, and dev and production identical in shape at that
  date (79 tables / 6 sequences / 38 RLS tables / 59 policies / 53 migrations).
  They are NO LONGER identical — see the dev line above. Bootstrapped
  2026-07-31; the
  `centers_wallet_balance_nonneg` CHECK is VALIDATED. Bootstrap order for a
  fresh environment: `label-db` → `bootstrap-app-role` → `prisma migrate deploy`
  → `seed` → `verify-db`.
  The 53rd is `20260818120000_review_per_lesson_unique`, applied to production
  BEFORE the code that needs it shipped — the order the 2026-08-02 outage note
  below demands. Pre-flight was read-only and is worth copying: `migrate status`
  proved exactly ONE migration was pending (no sibling branch riding along), and
  a SELECT proved `reviews` held 0 rows with no duplicate that either new index
  could reject.
- **[production, WIPED CLEAN 2026-08-26] MVP blocker #7 executed.** The
  walkthrough residue (7 users, 2 centers — Neyora + el maged, 1 course, 26
  sessions, 137 rows across 20 tables) was deleted via the migrate-production
  workflow's new `census`/`cleanup` modes (`packages/database/scripts/
  production-cleanup.ts` — census-then-confirm two-man rule, one transaction,
  catalog counts asserted identical inside it, sequences restarted so the
  first real receipt is 00001). KEPT: the two real staff accounts (super_admin
  + accountant) with their auth rows, the full catalog, and the config
  singletons. verify-db 28/28 immediately after, on ep-solitary-river. A fresh
  encrypted dump was uploaded to B2 minutes before the wipe (the weekly
  restore-proof step still fails on the known B2 key gap — blocker #5).
  Diagnosis note for future FK work: ON DELETE RESTRICT reports SQLSTATE
  23001, NOT 23503 — the first cleanup run failed exactly there.
- **[test] THERE IS NO TEST DATABASE.** Both `.env.test` files point at DEV, and
  `db-guard` reports them as `labelled 'dev'` — the 2026-08-03 decision still
  holding, not a gap. Do NOT read any `[test]` line in a decision doc as work
  pending.
  **[dev, 2026-08-18] A CONSEQUENCE, MEASURED:** `hall-booking.test.ts` A4
  ("a per-student hall with NO configured rate is refused at REQUEST time")
  FAILS on dev, and it is the DATA, not the code — `commission_settings` on dev
  carries a **`global`-scope row with `center_per_student_bp = 1500`**, which the
  room → center → global chain resolves, so the "no rate" case cannot arise.
  Reproduces identically against unmodified `HEAD`. Do not chase it as a code
  defect.
- **`expected-db-shape.json`** is committed at **53** and now TRAILS BOTH
  environments, which sit at 55 since 2026-08-20. Harmless as it stands: both
  migrations are additive — an extension, a function and five indexes — so the
  table / sequence / policy counts the file pins are unchanged and verify-db
  passes 28/28 against dev and production alike. Re-baseline it the next time
  the shape itself moves. The old caveat here — that a `verify-db`
  run against production reporting `expected 52, got 50` was a shared-baseline
  artifact rather than a defect — NO LONGER APPLIES and has been removed. A
  shape mismatch reported today is a real mismatch: investigate it.
- **[production Vercel, 2026-08-19] `STUDENT_QR_SECRET` IS GONE.** The
  2026-08-09 entry recorded it as set on BOTH `edura-www` and `edura-superadmin`
  with the SAME value. Those projects were deleted (see the entry below), and
  the value lived ONLY on the dashboard — it is not in `.env.production` and not
  in the repo. It must be generated fresh and set, identically, on the ERP and
  superadmin projects. **[2026-08-19] A fresh one has now been generated and
  written to `.env.production`**, and carried identically into `.env-erp` and
  `.env-superadmin`. `qrSecret()`
  (`packages/server-core/src/services/students/student-qr.ts:91`) THROWS in
  production when it is unset; there is deliberately no fallback. Takes effect
  only on REDEPLOY, since Vercel bakes env at build time.
- **[production, 2026-08-19] THE VERCEL PROJECTS WERE DELETED — NOTHING IS
  DEPLOYED.** All three hosts return `x-vercel-error: DEPLOYMENT_NOT_FOUND`
  (measured 2026-08-19). Ali is recreating them; the full rebuild sheet —
  root dirs, the `turbo run build` exit-127 trap, and the per-project env
  matrix — is [vercel-project-recreate](docs/runbooks/vercel-project-recreate.md).
  Two independent breakages recorded there, neither caused by the deletion:
  mail was unconfigured (`SMTP_HOST=REPLACE`) with `INVITE_CHANNELS=email` and
  `WHATSAPP_MODE=mock`, so NO invite could be delivered at all — Gmail SMTP has
  since been wired in `.env.production` and only `SMTP_PASS` is outstanding
  (an app password only Ali can generate); and `apps/www` needs
  `NEXT_PUBLIC_APP_ORIGIN` or every login/register CTA on the marketing site
  falls back to `http://localhost:3002`.
  The entry below is the hostname policy, which still holds:
- **[production, CORRECTED 2026-08-19] THE INTENDED HOSTS ARE THE VERCEL ONES.**
  `edura-erp.vercel.app`, `edura-www.vercel.app`, `edura-superadmin.vercel.app`.
  **`app.edura.eg` is NOT in use** — it has no DNS record and Ali does not use
  it. Do not put it in code, config or docs. The 2026-08-09 entry recorded
  `APP_BASE_URL` as pinned to `app.edura.eg`; that value emits links to a host
  that does not resolve, and the local `.env.production` has been corrected to
  `https://edura-erp.vercel.app` for all four of `NEXTAUTH_URL`, `APP_BASE_URL`,
  `APP_ORIGIN` and `APP_INTERNAL_URL`.
  **`.env.production` is gitignored and local-only** — production reads the
  Vercel dashboard, so the dashboard values still need changing there by hand;
  editing the file changes nothing a user sees.
  A claim/invite link belongs to the **ERP** host, not `edura-www`: it lands a
  student inside the app. `NEXTAUTH_URL` in that shared file is the ERP's —
  apps/erp, apps/superadmin and apps/realtime all symlink one `.env.production`,
  and superadmin signs in at its own host, so it must override it per project.
- **[2026-08-19] A DUPLICATE `appBaseUrl()` MADE `APP_BASE_URL` A NO-OP ON THE
  INVITE PATH.** `services/invites/invite-token.ts` defined its own copy that
  read `NEXTAUTH_URL` and fell back to `http://localhost:3002`, never consulting
  `APP_BASE_URL` — so walk-in claim links, guardian-verification links and
  welcome emails all ignored it. `http/app-url.ts` documents that this function
  "lived duplicated in five places"; this was the copy that survived. It now
  re-exports the canonical resolver. Anything that reasons about public link
  hosts before 2026-08-19 was reasoning about a value that did not apply.
- **[production Vercel, 2026-08-10]** `edura-showcase` live at
  `https://edura-showcase.vercel.app`. Vercel auto-detects Turbo and runs
  `turbo run build`, which dies on this Bun-only repo (`env: 'node'` not found,
  exit 127) — every project needs an explicit `buildCommand`.
- **BACKUPS ARE NOT RUNNING.** The nightly schedule is DISABLED (no bucket, no
  `BACKUP_*` secrets); **Neon PITR is the only protection currently in force.**
  → [backup-restore runbook](docs/runbooks/backup-restore.md)
- **NO SCHEDULED CRON JOB RUNS ANYWHERE.** Neither `CRON_BASE_URL` nor
  `CRON_SECRET` is set as a repo secret (verified 2026-08-09 with
  `gh secret list`). `CRON_SECRET` fails closed, so the schedule is inert rather
  than dangerous — but do not read `.github/workflows/cron.yml` existing as jobs
  being scheduled.

## Shipped work — awaiting review

Full write-ups live in `docs/decisions/`. Each records what was built, why the
alternative was rejected, its proofs, and what was deliberately NOT done. Read
the relevant one before touching the system it describes — the reasoning is the
point, not the changelog.

| Decision | What it covers |
|---|---|
| [messaging](docs/decisions/messaging.md) | Relationship-scoped messaging, one authorization module, parent oversight |
| [team-notes](docs/decisions/team-notes.md) | Internal to-do board for center staff / teacher assistants |
| [superadmin-center-oversight](docs/decisions/superadmin-center-oversight.md) | Cross-center read visibility + six audited control ops |
| [email-invites-guardian](docs/decisions/email-invites-guardian.md) | Email-first invites, one claim kernel, guardian contact |
| [parent-pays-lesson](docs/decisions/parent-pays-lesson.md) | Parent activates and pays for a child's lesson; parent wallet |
| [admin-user-directory](docs/decisions/admin-user-directory.md) | Platform user directory + audited admin actions, bounded impersonation |
| [better-auth-migration](docs/decisions/better-auth-migration.md) | next-auth → better-auth 1.6.25, DB sessions, hard revocation, 2FA |
| [operational-layer](docs/decisions/operational-layer.md) | Notifications, Sentry/PostHog, health checks, backups |
| [student-id-card](docs/decisions/student-id-card.md) | Student ID card + student code v2 (check character, guilloché) |
| [student-card-qr](docs/decisions/student-card-qr.md) | The card QR as a signed credential; tiered scan page; on-demand reads |
| [external-teachers](docs/decisions/external-teachers.md) | Off-system teachers a center runs by manual entry |
| [classical-ledger-redesign](docs/decisions/classical-ledger-redesign.md) | The "Classical Ledger" visual language + the five role pages |
| [counter-board](docs/decisions/counter-board.md) | The counter board — the center's first screen |
| [lesson-settlement](docs/decisions/lesson-settlement.md) | Settlement trigger, price and basis; `settlement_basis` |
| [bulk-student-import](docs/decisions/bulk-student-import.md) | CSV roster import, per-row transactions, dry run |
| [report-export](docs/decisions/report-export.md) | Report export — CSV and the print route |
| [weekly-center-digest](docs/decisions/weekly-center-digest.md) | The owner's Monday email; idempotency as an audit row |
| [guardian-email-verification](docs/decisions/guardian-email-verification.md) | Proving a guardian address without minting a session |
| [showcase-is-public-site](docs/decisions/showcase-is-public-site.md) | showcase = the public site, www = the app |
| [global-search](docs/decisions/global-search.md) | The ⌘K palette finds records, in both apps |
| [sidebar-ia](docs/decisions/sidebar-ia.md) | Sidebar information architecture across all 8 portals |
| [typescript-7-next-16](docs/decisions/typescript-7-next-16.md) | TypeScript 7 + Next.js 16.3 upgrade (two TypeScripts on purpose) |
| [portal-design-pass](docs/decisions/portal-design-pass.md) | Defect pass across student/parent/teacher/center portals |
| [lesson-times-12h](docs/decisions/lesson-times-12h.md) | 12-hour clock with the day period in words |
| [superadmin-view-as](docs/decisions/superadmin-view-as.md) | The back office reaches every ERP role via a signed handoff; the money qualifier |
| [parent-portal-dedup](docs/decisions/parent-portal-dedup.md) | Parent portal de-duplication (no capability removed) |
| [self-service-corrections](docs/decisions/self-service-corrections.md) | Login email, guardian contact and academic answers stop being write-once |
| [student-portal-dedup](docs/decisions/student-portal-dedup.md) | Student portal de-duplication (no capability removed) |
| [server-side-portal-gate](docs/decisions/server-side-portal-gate.md) | The portal/onboarding gate moved from the browser to the server |

## Stitch MCP design workflow (binding rules, added 2026-07-20)

The Stitch MCP (Google's design tool) is connected. When working with designs
from Stitch:

1. **Read, then implement faithfully.** Use Stitch to READ and understand the
   designs, then implement them in the existing UI, matching the design's
   layout, spacing, colors, and components.
2. **Additive only on existing work.** Applying a design must never delete,
   remove, or break any existing feature, screen, route, or functionality. If
   a design appears to REPLACE something that already exists, STOP and ask
   before removing anything — additions and refinements are fine, silent
   deletions are not.
3. **Never weaken what we built.** The security fixes, the money engine, the
   auth/session model, RLS/data-isolation, and the assistant delegation
   boundary are untouchable. A design change must never weaken them — UI
   changes stay on the presentation layer.
4. **Database changes require an approved plan first.** If a design genuinely
   requires a schema change, propose one — but ALWAYS present the plan first
   (exact schema change + migration) and WAIT for approval before touching the
   DB. Never modify the database silently. Same additive, migration-safe
   discipline as the rest of the project.
5. **One design system.** Follow the existing conventions — @repo/ui
   components, Tailwind v4 tokens, RTL/Arabic support. Do not introduce a
   parallel styling approach.

## Security remediation progress (BATCH 1 + BATCH 2, from docs/security/security-audit.md)

Findings fixed one-at-a-time, each with a proof, stop-per-fix. See
docs/security/security-audit.md for the full report and severities.

**DONE (reviewed + accepted):**
- **C1** — mock payment gateway can't settle real money in prod (PAYMENTS_MODE
  must be explicit; PAYMOB_HMAC_SECRET required, no fallback; mock-complete
  404s in prod; timingSafeEqual HMAC compare).
- **C2 + H5** — login rate-limiting + dummy-hash constant-time compare in BOTH
  apps' NextAuth authorize() (closes brute-force + email enumeration).
- **H1** — payout-request TOCTOU: `SELECT … FOR UPDATE` on the beneficiary in
  teacher/center wallet + generatePayouts.
- **H2** — payout-settlement floor: conditional decrement (updateMany where
  balance >= net) + DB `CHECK (wallet_balance >= 0)`.
  **[dev, verified 2026-07-26]** DONE — `centers_wallet_balance_nonneg` is
  `convalidated = true`, zero negative rows, minimum balance 0. The legacy
  -2600 row is gone (the Step 9 wipe removed it) and the constraint was
  validated afterwards. **[production, verified 2026-07-26]** the constraint
  exists but is still `NOT VALID` — validating it there is part of the
  production bootstrap, not a leftover from the wipe. The note that previously
  stood here ("NOT VALID — one legacy -2600 row left; VALIDATE after") read as a
  pending dev TODO and was wrong in both directions.
- **H3** — refund double-refund TOCTOU: partial unique
  `transactions_one_refund_per_payment` on (reversal_of_id) WHERE type='refund'.
- **H4** — security headers on both apps (HSTS, nosniff, Referrer-Policy,
  X-Frame-Options DENY/superadmin + SAMEORIGIN/www) + a **Report-Only** CSP
  (allows Cloudinary img, the realtime socket connect-src on www, Paymob
  frame-src on www; self-hosted fonts). CSP still needs tightening to a
  nonce-based script-src before flipping to enforce.
- **M1** — webhook claim + settlement in ONE transaction (self-heals on
  redelivery; no charged-but-empty intent); idempotent replay preserved.
- **M2** — split the shared secret: REALTIME_JWT_SECRET + INTERNAL_API_SECRET
  are dedicated + required in prod (fail closed); NEXTAUTH_SECRET fallback is
  dev-only.

**REMAINING (in priority order):**
- **M3** — shared-store (Redis) rate limiter + trusted client-IP hop.
  *Implemented + proven, awaiting review* (adds REDIS_URL / TRUSTED_PROXY_HOPS /
  TRUSTED_CLIENT_IP_HEADER; falls back to in-memory when REDIS_URL unset).
- **M4** — *Done (verified 2026-08-26):* `toErrorResponse` in the shared kernel
  (`packages/server-core/src/errors/http.ts`, both apps' `@/lib/errors/http`
  re-export it) logs the real error server-side in every environment and
  returns a fixed "Internal error" for the unhandled branch in production;
  AppError / mapped-Prisma messages stay intentional. Proof:
  apps/erp/tests/unit/m4-error-messages.test.ts (4/4).
- **M7** — cron auth: require CRON_SECRET unconditionally (fail closed if
  unset) and drop the side-effectful GET alias.
  *Done (2026-07-20):* `authorized()` returns false when CRON_SECRET is unset
  in EVERY env (no `NODE_ENV` bypass); `GET = POST` alias removed so the
  data-mutating jobs are POST-only (plain GET → 405). Proof in
  apps/www/tests/unit/m7-cron-auth.test.ts.
- **Dependency overrides** — package `overrides` (root package.json) to clear the 13 dev/build-time
  advisories (all transitive tooling; no runtime-path exposure).
  *Done (2026-07-20):* root `package.json` `overrides` forces the patched
  version WITHIN THE SAME MAJOR for minimatch (^3.1.5), flatted (^3.4.2),
  brace-expansion@1 (^1.1.16), picomatch@2 (^2.3.2) + picomatch@4 (^4.0.5),
  @hono/node-server (^1.19.14), postcss@8 (^8.5.20), uuid@8 (→ ^11.1.1 for
  next-auth). `bun audit` now reports **0 vulnerabilities**; typecheck (5/5),
  www unit suite (48 pass/1 skip), and `bun run build` (both apps) all green. No
  security-sensitive runtime dep (next/react/next-auth/prisma/bcryptjs/zod/
  jose/socket.io/ioredis) was bumped — deliberately out of scope.
  **`brace-expansion` IS ALSO A ROOT `dependency` (^5.0.9), AND THAT IS ON
  PURPOSE.** The `brace-expansion@1` / `@2` entries above pin the patched
  versions of the transitive copies; the root declaration is what anchors them.
  It is not application code and no file imports it, so every unused-dependency
  tool — `knip`, `depcheck` — reports it as dead, every time. **Do not remove
  it**; doing so un-pins a patched transitive and the advisory returns silently.
  **[2026-08-27] The "0 vulnerabilities" claim above is stale**: `bun audit` now
  reports **9 (7 high, 2 moderate)** — dompurify via posthog-js, deepmerge-ts and
  others, all published after 2026-07-30. Nothing regressed; the advisory
  database moved. Re-clearing them is its own task.
- Then the lighter: **M5** (temp-students/[id]/send-invite ownership check),
  **M6** (materials %PDF- magic-byte check).
- **M8** — *Done (2026-08-26):* the last `$queryRawUnsafe` (a fully static
  query in `packages/database/scripts/reconcile-wallets.ts`) converted to the
  tagged-template `$queryRaw` (byte-identical behaviour, proven by a dry run
  against dev), and `apps/erp/tests/unit/m8-no-raw-unsafe.test.ts` scans
  apps + packages so `$queryRawUnsafe` / `$executeRawUnsafe` can never
  reappear without a red test.
- Then **Step 10** — final cleanup pass (batch the remaining L-findings; flip
  the CSP to enforce; VALIDATE the centers wallet CHECK after the Step 9 wipe).

### BATCH 3 (L-findings)
- **L1** — password reset/change now invalidates pre-existing 30-day JWT
  sessions (server-side revocation for otherwise-stateless tokens).
  *Done (2026-07-20 — awaiting review):* new `users.token_version` int
  (migration `20260720180000_user_token_version`, default 0, backfilled 0 so
  no one is logged out on deploy). Every JWT records `ver` at issue time (both
  apps' `authorize` return it + the manual `/api/v1/auth/login` encode); the
  NextAuth `jwt` callback re-reads `token_version` on EVERY request and strips
  all claims (→ no session user → logged out) when the token's `ver` trails the
  column or the user row is gone. `resetPassword` bumps `token_version` in the
  SAME tx as the new hash. The check lives in BOTH apps' callbacks, and the
  column is shared, so a reset also revokes a stolen super_admin/accountant
  session. Cost: one indexed PK lookup per request (cacheable later). Proof
  (live DB, real authorize + jwt/session callbacks + real resetPassword),
  12/12: apps/www/tests/db/l1-session-invalidation.test.ts — pre-reset token
  accepted → reset bumps ver → same token now rejected → unrelated session
  still valid → old password stops working → fresh login (ver 1) accepted.
  Note: `me/credentials` (set-once first password for walk-ins) deliberately
  NOT bumped — no prior password to revoke.

### Env vars now REQUIRED in production (deployment must set these)
Missing any of these fails closed (refuse to boot / hard error) — by design.
- `PAYMENTS_MODE` — must be explicit: `mock` | `sandbox` | `live` (C1).
- `PAYMOB_HMAC_SECRET` — required in prod, no fallback (C1).
- `REALTIME_JWT_SECRET` — dedicated realtime handshake secret (M2).
- `INTERNAL_API_SECRET` — dedicated server↔server bridge secret (M2).
- `CRON_SECRET` — guards `/api/v1/cron/[job]`; required in EVERY environment
  (endpoint fails closed / rejects all requests when unset, no bypass) (M7).
- `STUDENT_QR_SECRET` — signs every student ID card's QR. Required in prod, no
  fallback: a card signed with a guessable value is forgeable, and nobody finds
  out until someone is marked present at a lesson they never attended. **Both
  apps must be given the SAME value** — a card rendered in the back office has
  to verify at a www counter. In development it falls back to a fixed literal
  (deliberately NOT the app secret, whose value differs per app). Rotating it
  invalidates every printed card at once; reissue is per-student and is the
  intended tool.

- `VIEW_AS_SECRET` — signs the back-office "view as" handoff token. Required in
  prod, no fallback (same posture as `STUDENT_QR_SECRET`, and the same hazard:
  a handoff signed with a guessable value is a forgeable session). **Both apps
  must be given the SAME value** — apps/superadmin signs and apps/erp verifies,
  so a mismatch is indistinguishable from a forgery. Rotating it invalidates
  only tokens in flight, which live 60 seconds, so rotation is cheap.
- `ERP_BASE_URL` — on **apps/superadmin only**: where a handoff is posted. Its
  own variable because the deploy runbook overrides `APP_BASE_URL` on that
  project with its own host, so every generic resolver there would answer "the
  back office" and send a live credential to a route that does not exist in it.
  Throws in production rather than misdirecting.
- `SUPERADMIN_BASE_URL` — on **apps/erp only**: where "end view-as" returns the
  browser. Falls back to localhost in development.

(Recommended once M3 lands: `REDIS_URL` for a shared rate-limit store across
instances, `TRUSTED_PROXY_HOPS` matching the deploy's proxy depth.)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- **Start EVERY task here.** Before reading, grepping, or planning anything in this
  repo, orient with the graph first: run `graphify query "<the task in one
  sentence>"` as the first tool call of the task. Only fall through to Grep/Read
  after the graph has pointed at the files — or when you already know the exact
  file and line you need to edit or debug. This applies to feature work, bug
  fixes, reviews and questions alike, not only to "where is X" questions.
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Every session opens with a ~400-token orientation digest (graph size, god nodes,
  community hubs, and whether the graph is STALE vs `HEAD`), injected by the
  `SessionStart` hook in `.claude/settings.json` →
  `.claude/hooks/graphify-session-digest.sh`. The digest is deliberately NOT the
  whole `GRAPH_REPORT.md` — that file is ~2.8k lines (~35k tokens) and injecting
  it every session would cost far more than it saves. If the digest says STALE,
  run `graphify update .` before trusting any query result.
