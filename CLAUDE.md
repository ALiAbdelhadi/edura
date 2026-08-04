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

## Messaging (built 2026-07-22 — awaiting review)

Relationship-scoped messaging with a child-safety layer. Built ON TOP of the
existing chat system (conversations/messages, apps/realtime Socket.IO, the
shared ChatScreen) — nothing was rebuilt.

1. **ONE authorization module**: `packages/database/src/queries/chat-scope.ts`.
   A single `EDGES` table defines every relationship, PARAMETERIZED rather than
   duplicated: `narrowTo` set = "can this actor reach THIS user?" (the gate),
   unset = "who can they reach?" (the directory). `assertCanReach` and
   `listContacts` are the two consumers, so the auto-search can never offer
   someone the gate would reject — a drift test asserts set-equality.
   Gate order: matrix (chat-policy.ts) → relationship (EDGES) → **guardian
   channel (chat-guardian.ts, added 2026-07-25)** → block → rate limit.
   **Default-deny**: `EDGES[role] ?? []`, and a center-staff sub-role not
   named on an edge cannot use it. New roles fail closed with no denylist.
2. **Matrix change (reverses the old assistant-first rule).** Students and
   parents now message their own teachers DIRECTLY (`student/parent → teacher`
   were previously absent; `teacher → student/parent` were "escalation"). No
   pair is escalation-mode any more. The assistant-first convention survives as
   UI ordering only, not as an authorization rule.
3. **center_staff got a messaging surface** (was an empty matrix row), scoped by
   preset sub-role: receptionist → families, manager → the whole center scope,
   **center_accountant → nobody** (that tier appears on no edge).
4. **No impersonation in messaging.** Unlike Step 8's `delegated()`, an
   assistant/staff member messages AS THEMSELVES, scoped by their principal —
   an adult must never talk to a minor behind another identity.
5. **DEFAULT-MINOR (binding).** `isMinor()` in `chat-minors.ts` is the single
   implementation, written as one POSITIVE adult condition:
   `adult = dateOfBirth AND dateOfBirthVerifiedAt AND age >= 18`. Missing,
   unverified, or under-18 all mean MINOR with parent oversight ACTIVE. New
   columns `student_profiles.date_of_birth` + `date_of_birth_verified_at/by`;
   no backfill, so students default to minor — intended, not a gap.
   **[dev, measured 2026-07-26]** this is no longer universal: of 230
   `student_profiles`, **225 have a NULL `date_of_birth` and 3 carry a
   verification stamp** — so a handful now resolve as ADULTS and sit outside
   parent oversight. The default is still minor; "every existing student is a
   minor", as this line previously read, is not. **[production]** the columns
   exist but there are no student rows at all.
6. **Parent oversight** = protective transparency, not surveillance:
   strictly read-only (never touches unread counters or read receipts — proven),
   no write path in UI or API, only MINOR children with an APPROVED link, only
   threads with ADULTS, and a persistent disclosure banner shown to BOTH sides.
7. **Retention**: append-only; soft-delete keeps the body (participants see
   "message removed", the super-admin log does not). `/dashboard/superadmin/
   messaging` = log search + read-only thread viewer + reports queue + blocks;
   **opening a thread writes a `messaging.thread_viewed` audit row.**
8. **Rate limiting**: `ChatLimiter` is a REQUIRED parameter on `appendMessage`/
   `getOrCreateConversation`/`postGroupMessage`, so a transport that forgets one
   fails to COMPILE. This closed a real gap — the socket path (the PRIMARY send
   path) bypasses Next middleware and was previously unlimited. Buckets key on
   USER id, not IP.
9. **Block/report**: enforced inside `assertCanReach`, so no entry point can
   bypass them. A block halts BOTH directions, deletes no history, and never
   hides a thread from parent oversight or the super-admin log. An ADULT
   blocking a MINOR auto-files a `safety_concern` report.
10. **Groups**: `group_members` is a fanout CACHE only — `assertGroupAccess`
    re-derives live per user, so a dropped student is denied even with a stale
    cached row (proven). Announcement-shaped (`owner_only` default).

Migration `20260722200000_messaging_scope_groups_safety` (additive only).
Proofs: `apps/www/tests/db/messaging-scope.test.ts` **87/87**, unit
`tests/unit/messaging-matrix.test.ts` 12/12. Regressions green: rbac-isolation
11/11, center-staff-delegation 55/55, unit suite 85 pass/1 skip, typecheck 5/5,
`bun run build` both apps. Demo data: `prisma/messaging-demo-seed.ts`
(`--purge` to remove), two centers so isolation is visible in the preview.

## Student ID card + student code v2 (built 2026-08-02 — awaiting review)

Every student now carries a card: their own eight-character ID, a QR the counter
can scan, a guilloché engraving unique to them, and two ways to take it with
them (print → PDF, and a PNG for WhatsApp).

1. **THE CODE CARRIES NO PERSONAL DATA (binding).** The ask was for a code built
   out of the student's initial, birth date and phone digits. It is NOT built
   that way, for two reasons that only surface after launch: (a) inside eight
   characters that space is small enough for two real children in one
   governorate to COLLIDE, and this code is what attendance and cash run on;
   (b) it is printed, scanned and read aloud across a counter, and nearly every
   student here is a MINOR — a code you can read a child's birthday out of leaks
   it to everyone handed the card. The body is instead DERIVED FROM THE STUDENT
   (a SHA-256 of their own `student_profiles.id`) so it is theirs and
   reproducible from their record, but one-way, and its input carries nothing
   personal even if reversed.
2. **THE CHECK CHARACTER IS THE POINT.** `G7K3M2QF` = system letter + 6-char
   body + check character. Every old `STU-000123` neighboured another valid
   code, so ONE mistyped digit at the counter resolved to a DIFFERENT CHILD,
   silently. The alphabet is Crockford base32 minus Z — **31 symbols, and 31
   being PRIME is the guarantee**: with weights 1..7 no single wrong character
   and no swap of two neighbours can produce a valid code. Both classes are
   ALWAYS caught, not usually caught.
3. **The letter encodes the education SYSTEM, not the stage** (G/A/B from the
   new `education_systems.code_letter`; `X` = not chosen yet). A student moves
   from preparatory to secondary; they do not move from Azhari to General. A
   stage letter would need re-issuing every couple of years — meaning either a
   lying letter or a second table to keep old cards resolvable.
4. **ISSUANCE IS ONCE-ONLY, and enforced, not intended.** The profile row exists
   before onboarding picks a system, so a student is born with a pending `X`
   code (real, valid, usable — a walk-in can pay cash on it). It becomes final
   in `completeStudentOnboarding`, in the SAME transaction, via
   `finalizeStudentCode`, whose update is written `WHERE student_code LIKE 'X%'`
   — so no later call, from anywhere, can move an issued code.
5. **TWO IMPLEMENTATIONS, HELD BY A PROOF.** `gen_student_code()` mints inside
   the INSERT so no creation path (register, invite claim, walk-in, temp
   student, manual student, every seed) changed; the TypeScript twin
   (`@repo/database/student-code`, dependency-free so the browser and the
   counter share it) verifies. A drift test generates 400 codes with the SQL
   function and verifies every one in TypeScript. A CHECK constraint holds the
   alphabet AND the check character, so no writer can store a code the counter
   would reject.
6. **THE CARD CARRIES THE LEAST THAT IS USEFUL** — name, code, system, grade,
   track. No phone, email, date of birth, national ID or money; the proof
   asserts the exact key set, because "we did not put the phone on it" is a
   claim about the object, not about intent. **The QR holds the code and
   nothing else** — no token, no URL — so a photographed card grants nobody
   anything, and an ordinary keyboard-wedge barcode scanner works with zero
   server change.
7. **A GUILLOCHÉ, NOT A GRADIENT.** The request was "a different gradient per
   student"; `design/CONSTITUTION.md` §4 forbids exactly that on student
   surfaces ("fills and tiles — never a new hue, never a gradient"). Uniqueness
   is carried by the engine-turned rosette instead — five varying axes rather
   than one, drawn from the student's own id, in the three accents §4 already
   permits "for orientation and identity". Deterministic and stored NOWHERE, so
   a card printed today and one printed in two years are the same card.
8. **Exports: both, from one layout.** PDF via a print route OUTSIDE /dashboard
   (the receipt's pattern — the browser's own engine shapes Arabic correctly,
   zero dependency, ID-1 at 85.6×54mm). PNG via `<canvas>` using the SAME
   `rosettePoints` geometry and colours READ OFF the live card, with
   `navigator.share` on phones — because on this platform the card's real
   destination is WhatsApp.
9. **Who may see it:** the student, and a parent with an APPROVED link — through
   `assertApprovedChild`, the gate every parent money path already uses. No new
   authorization logic. Center staff printing cards was NOT built.
10. **THE ISSUER MARK IS THE EXISTING LOGO, ENGRAVED — not a second one.**
    `public/edura-mark.svg` could not go on the card as it stands: it is a
    violet→indigo GRADIENT on a filled tile plus `#00b473` and `#ffc6c6`, three
    hues the Ledger palette does not contain and the one device §4 forbids on a
    student surface — and a filled gradient tile fights an engraving anyway. So
    `@repo/ui/lib/edura-mark.ts` re-draws the SAME logo in one ink at hairline
    weight, the way an engraved document carries a crest rather than a
    letterhead. It is **reduced to the open book and its spine**: the cap,
    tassel and stud are shapes at 200px and a smudge at 30px, which is the size
    a card's issuer mark actually renders at. It is drawn in `--indigo` for
    EVERY student, deliberately not in the per-student accent — a logo that
    changed colour per holder stops being a logo; the brand is constant, the
    rosette is the identity. Path DATA, not markup, so the card's SVG feeds it
    to `<path d>` and the PNG exporter feeds the same strings to `new Path2D()`
    — one geometry, three surfaces. **Designing a new brand mark was NOT done:
    that is a decision wider than this card, and a second logo beside the first
    is a second answer to what the product looks like.**

Migration `20260803110000_student_code_v2` (adds `education_systems.code_letter`,
rewrites the legacy `STU-` rows, adds the CHECK).
**[dev, applied 2026-08-02] — 48 migrations, verify-db 27/27;
`expected-db-shape.json` updated to 48.**
**[production, APPLIED 2026-08-02] — 48 migrations, verify-db 27/27.** It was
applied BEFORE this code deploys, which is the order the bootstrap lesson above
exists to enforce. Production held exactly ONE student (`STU-000001`) with zero
attendance, enrollments, subscriptions or money rows referencing it, so the
rewrite touched one row nobody had used a code on; it is now `GV9H49TJ`. Checked
after applying, against production: the code verifies in TypeScript, the catalog
carries G/A/B, and the CHECK constraint actually REJECTS a wrong check character
(23514) rather than merely existing.
**[test] NOT applied — the test database refuses both roles on disk
(`edura_app` and `neondb_owner` both fail password authentication in
`apps/www/.env.test` and `packages/database/.env.test`). Pre-existing and
unrelated to this change, but it means the db suite below has never run and
`verify-db` against test will report 47 ≠ 48 until the credentials are
refreshed.**

The rewrite lands rows on pending codes; `bun run db:finalize-codes --write`
(idempotent, safe against any environment) issues the final letter for anyone
already onboarded — 12 codes on dev, 1 on production.

Proof: unit `student-code.test.ts` **14/14** (including every single-character
mistype of five real codes — 1200 of them — and every adjacent transposition)
and `student-identity.test.ts` **8/8** (determinism, 5000 seeds without a
repeated pattern). `apps/www/tests/db/student-id-card.test.ts` is written but
**NOT YET RUN — the test database rejects both roles on disk (`edura_app` and
`neondb_owner`), a pre-existing credential problem unrelated to this change.**
The SQL↔TypeScript agreement was proven against DEV read-only instead (1000
`student_code_for()` codes, 0 rejected; 30,000 mutations, 0 slipped through).
Regressions green: root `bun run check-types` 9/9, www unit **236 pass/1 skip**,
`bun run build` both apps, lint error-parity (14 errors, all in files this
change does not touch). Verified live in the browser on dev: card, PNG export,
print route, account-page card, dark mode, and two students side by side with
different letters and visibly different engravings.

Found while building this, FIXED ON MAIN, not here: `DataRightsCard` and the
student/parent wallet screens threw on first paint (`exports.find is not a
function`) because `useCustom` defaults its payload to a frozen empty OBJECT,
so the idiomatic `?? []` never fires. Surfaced because the ID card lives on the
settings screen. This branch carried a local narrowing for it and that was
REVERTED once main's `7e25b80` turned out to already own the problem properly —
one `asArray()` helper across every affected screen plus a unit test, rather
than a hand-rolled `Array.isArray` per file. A second answer to a solved
problem is worse than no answer; take main's on merge.

Demo data: `prisma/student-id-demo-seed.ts` (`bun run seed:studentid-demo`,
`--purge` to remove) — six students, one per education system so the letters
come out G…/A…/B… beside each other, plus one deliberately left without a system
so the pending state is visible. Zero money rows.

## Off-system ("external") teachers (built 2026-08-02 — awaiting review)

A center runs on the platform while one or more of its teachers refuses to (or
keeps their own system). The center keeps a 100% complete picture — students,
groups, attendance, grades, money — by MANUAL ENTRY, and all of it lands in the
center's ordinary reports beside everyone else.

1. **AN EXTERNAL TEACHER IS A `users` ROW, NOT A NEW ENTITY** (binding). Role
   `teacher`, `status='shell'`, `password_hash NULL`, plus
   `teacher_profiles.system_status='external'` and `managed_by_center_id`.
   Every operational table already keys on the teacher's USER id
   (courses/sessions/subscriptions/session_settlements/transactions), so
   supporting them changed NONE of them. Three consequences, each a
   requirement: no login is enforced by the door that already exists (status +
   no hash — no second gate, same reasoning as ONE SUSPENSION MECHANISM);
   converting to `enrolled` is a flip of ONE column on the SAME id, so no row
   is copied, re-pointed or re-parented and nothing CAN be lost; and
   `access_level` models a future read-only tier without pretending to enforce
   one (see #7).
2. **THE SHARED STUDENT IS ONE ROW.** The same child studying with an
   on-platform teacher AND an off-system one keeps ONE `users` row and gets a
   second Enrollment. The student↔teacher relation is `enrollments -> courses.
   teacher_id` — already many-to-many — so NO join table was added; a second
   answer to "who teaches this child" could disagree with the one attendance
   and money already run on. Dedup is two layers: `resolveOrCreateStudent`
   looks up by phone then by the new `student_profiles.national_id` BEFORE
   creating (and has no "create anyway" flag), and both keys are UNIQUE at the
   DB level as the backstop under a race.
3. **PROVENANCE IS INHERITED, NEVER PASSED BY HAND.** `data_source`
   (`system` default | `manual`) is on courses, sessions, enrollments,
   attendance_records, grades, payments, transactions, subscriptions, rosters
   and affiliations. A group created for an external teacher derives `manual`
   from the TEACHER (in `createCourse`), and subscription → payment → ledger →
   enrollment → attendance each inherit from their parent. So the ordinary
   Classes screen labels an off-system group correctly without knowing this
   feature exists. `systemStatus` and `dataSource` are SEPARATE filters on
   purpose: a teacher who joins keeps the groups the center keyed in, so those
   rows stay `manual` while their teacher is now `enrolled`.
4. **NO SECOND MONEY ENGINE.** Manual payments run through the existing
   `createWalkInSubscription` (Payment + Transaction + receipt + points +
   parent notification); lessons settle through the unchanged
   `distributeSessionRevenue`, so the center's cut is whatever the group's own
   pricing says (hall %, per-student rate, or the flat affiliation share) and
   the teacher's wallet accrues what they are owed. The ONE addition is a
   CENTER-side cash settlement (`settleWithTeacher`) — an external teacher has
   no account to request a payout with — using the same H2 conditional
   decrement every payout uses, writing a `payout` row to the same ledger, in
   the same transaction as the append-only `external_teacher_settlements`
   statement. It is NOT routed through the `payouts` queue: that is the
   platform paying out of platform-held funds, this is a center paying out of
   its own drawer.
5. **MANUAL ENTRY FAILS SILENTLY, so `buildGapReport` complains.** Seven
   findings (lesson without attendance, partial attendance, past lesson never
   completed, enrolled-unpaid, group without schedule / price / students), each
   naming the exact row to open and separated into blocking vs warning. The
   `session_not_completed` finding is the one that matters most: an uncompleted
   lesson never runs distribution, so the teacher is silently under-paid.
6. **REPORTS COMBINE BOTH KINDS BY DEFAULT.** `?systemStatus=` / `?dataSource=`
   narrow only when asked (one parser, `lib/http/provenance.ts`), and the center
   home ALWAYS reports the off-system split beside the headline whether or not a
   filter is set — a center that must change a setting to discover how much of
   its business runs off-system will not think to look.
7. **`access_level` IS MODELLED, NOT ENFORCED — stated plainly.** Taking a
   teacher off-system closes their login through `users.status` (which fires
   `sessionRevocationExtension` → the `users_revoke_sessions` trigger), and is
   REFUSED when the teacher also works with another center. `read_only` is
   where a future "let them look, not touch" goes; nothing writes it today,
   because a column claiming a restriction nothing enforces is worse than no
   column.
8. **Grades are the ONE surface that needed new code.** `createGrade` demands
   `course.teacherId === caller.id` — right for a teacher who signs in,
   impossible for one who never will. That gate was NOT loosened; a narrow
   center-side path (`manual-grades.ts`) can only reach a group belonging to an
   off-system teacher this center manages, writes the assessment owned by the
   TEACHER, and fires the same `grade_entered` notification. Everything else
   (groups, schedules, enrolment, attendance, counter check-in, cash, session
   completion) already worked for a center actor with zero changes.
9. **Ownership never leans on RLS.** `teacher_profiles` has no `center_id`, so
   `assertManagedExternalTeacher` demands BOTH the profile pointer and a live
   affiliation, explicitly, on every entry point. The one function that runs
   under platform context is `convertToExternal` — "does this teacher also work
   with another center?" is inherently cross-tenant, and under `scopedDb` the
   RLS policy hides exactly the rows that would answer yes.

Migrations (additive only): `20260803100000_teacher_invite_purpose` (enum value,
own file — Postgres cannot USE a new enum value in the transaction that adds it)
and `20260803100100_external_teachers` (3 new types, `data_source` columns with
DEFAULT `'system'` so no existing row or write changes, `student_profiles.
national_id` UNIQUE, and two append-only RLS tables:
`teacher_system_status_changes` + `external_teacher_settlements`). Each ships a
companion `rollback.sql` stating honestly what a reversal costs.
**[dev + test, applied 2026-08-02] — 47 migrations, 79 tables, verify-db 27/27
(the baseline in `expected-db-shape.json` and the `APPEND_ONLY` map in
`verify-db.ts` were updated to match).
[production, APPLIED — observed 2026-08-02] both migrations are present there
(`_prisma_migrations` carries `20260803100000_teacher_invite_purpose` and
`20260803100100_external_teachers`; production stood at 47 migrations / 79
tables before the student-code migration landed on top). The line that used to
stand here said "NOT applied" and was STALE — exactly the failure the
environment-labelling convention at the top of this file exists to catch.**

Proof: `apps/www/tests/db/external-teachers.test.ts` **102/102** (live DB, real
center-actor authorization, real services, real money engine) — including the
shared-student scenario and a conversion that asserts eight record counts are
byte-identical before and after, against the counts the journal itself froze in
the same transaction. Regressions green: full `test:db:ci` **27 suites / 839
assertions**, root check-types 9/9, www unit 214 pass/1 skip, `bun run build`
both apps, lint error-parity with main (the 12 errors are pre-existing
privacy/terms/use-chat files). Verified live in the browser on dev: created an
off-system teacher, re-typed the same phone and watched it REUSE the child,
enrolled, took cash (receipt `RCP-NILE-2026-00002`), and read the statement,
provenance labels and gap findings on screen in Arabic/RTL. Demo data:
`prisma/external-teachers-demo-seed.ts` (`bun run seed:extteachers-demo`,
`--purge` to remove) — one center, one on-platform + two off-system teachers, a
child shared between two of them, and deliberately-broken groups so the gaps
report has real findings. ZERO money rows seeded (per the Conventions rule):
take a payment and settle it in the preview, which is the part worth seeing.

## Team notes (built 2026-07-27 — awaiting review)

Internal to-do board for ONE team — center owner + center_staff, or teacher +
assistants — with status (open/done/declined), pinning, read receipts, and
notifications. Approved 2026-07-27; fills the deliberate staff↔staff /
assistant↔assistant hole WITHOUT touching the messaging matrix (chat-scope
EDGES unchanged — notes are non-conversational, every participant is an adult
staff role, so none of the child-safety machinery applies).

1. **Schema**: `team_notes` (nullable `center_id` XOR `teacher_id`, DB CHECK
   `team_notes_exactly_one_scope`; center rows RLS tenant-isolated like
   `center_staff`, teacher rows app-guarded like `teacher_assistants`) +
   `team_note_reads` (note_id+user_id unique; no center_id — reached only
   through an already-authorized note). Migrations
   `20260727100000_team_note_notification_types` (isolated enum ADD VALUEs:
   `team_note_created`, `team_note_status_changed`) and
   `20260727100100_team_notes`. **[dev + test, applied 2026-07-27] — 38
   migrations. [production, applied 2026-08-02] — production is no longer
   behind; it now stands at 43 migrations, verify-db 25/25.**
2. **Membership IS the gate.** One route pair (`/api/v1/team-notes`,
   `/team-notes/[id]`) wrapped in `delegatedWithCenter(..., {staffAllow: ALL
   three sub-roles})`: the wrappers' live-link resolution already proves team
   membership, and staff mutations get the on-behalf-of audit row for free.
   Authors write as THEMSELVES (caller id) — no impersonation, same principle
   as messaging.
3. **Read receipts on GET, deliberately**: listing the board IS the read
   (idempotent upsert), so the read-only `center_accountant` — whose mutations
   the method gate rejects and who gets `me.canWrite=false` (composer hidden)
   — still registers as having read. Each note shows "قرأها n/total — names".
4. **To-do semantics**: ANY team member flips status (open→done/declined or
   reopen); the author is notified when someone ELSE flips theirs, never on a
   self-flip. Body edit = author only. Pin/delete = author or LEAD (center:
   owner/manager; teacher side: teacher AND assistant per Step 8 full
   delegation; receptionist is a member, not a lead). Soft-delete only.
5. **Notifications**: two new `notification_type` values, CHANNEL_MATRIX rows
   in-app+push only, fanout resolvers `resolveCenterTeamPeers` /
   `resolveTeacherTeamPeers` in @repo/server-core (revocation-aware — a
   soft-removed member drops out of the fanout immediately, proven). Deep link
   `${portal}/notes` in the notifications screen. Side fix: the notifications
   screen's deep-link base now derives from the pathname (the old `params.role`
   read didn't exist on the fixed portal folders and always fell back to
   "student", mislinking staff/assistant/admin deep links).
6. **UI**: `TeamNotesBoard` (full + `compact`) — status-themed cards (done =
   success + strikethrough, declined = destructive + strikethrough), pinned
   first. Full board at `/dashboard/{admin,staff,teacher,assistant}/notes` +
   nav items; compact panel on the staff home, center-admin dashboard, and
   ABOVE the chat on the assistant home. i18n `teamNotes.*` ar/en.
7. Proof: `apps/www/tests/db/team-notes.test.ts` **47/47** (live DB, real
   center-actor + real resolveActingTeacher + real service; includes raw-RLS
   cross-center peek and the CHECK rejections). Regressions green: root
   check-types 6/6, www unit 111 pass/1 skip, rbac-isolation 11/11,
   center-staff-delegation 55/55, messaging-scope 87/87, l1 12/12, `bun run
   build` both apps. Demo data: `prisma/team-notes-demo-seed.ts`
   (`bun run seed:teamnotes-demo`, `--purge` to remove) — one center team + one
   teacher team, all states visible, zero money rows. Verified live in the
   browser on dev (staff home panel + full board, create + fanout rows).

## Superadmin center oversight (built 2026-07-25 — awaiting review)

Cross-center read visibility + a CLOSED SET of audited control operations, in
`apps/superadmin` only. Built on the existing systems; nothing was rebuilt.

1. **Two modules, one boundary.** `center-oversight.ts` READS (no mutation, and
   it imports nothing that mutates); `center-control.ts` ACTS. "Superadmin sees
   all money but moves none" is checkable by reading one import list.
2. **Read visibility** — pick any center, see rooms, teachers, students,
   courses, sessions, enrollments, subscriptions, attendance, staff, pending
   items, AND all six money ledgers scoped to it (transactions, payments,
   payouts, session_settlements, invoices, wallet_ledger) plus the cached
   wallet balance and the existing `centerStatement`. Rows with a NULL
   `center_id` are teacher-direct and are never folded into a center's books.
3. **Six control ops**, each mutating + writing ONE `audit_logs` row (actor,
   action, target, center, before, after, ip, timestamp) in the SAME
   transaction — so a write cannot commit without its audit row:
   `center.activated/deactivated`, `user.activated/deactivated` (scoped to
   members of that center), `center.student_removed/restored`,
   `collaboration_request.approved/rejected`, `center.profile_updated`,
   `center.room_created/updated/activated/deactivated`.
   `on_behalf_of` is left NULL on purpose — that column means "assistant X for
   teacher Y" (Step 8); a super admin acts as themselves.
4. **MONEY IS READ-ONLY, and superadmin is NOT exempt.** Both apps connect as
   the same `edura_app` role; `platformDb` only sets the `app.bypass_rls` GUC,
   which RLS policies read and table GRANTs do not. So the existing REVOKEs
   still bite: UPDATE/DELETE on `transactions`, `points_ledger`,
   `session_settlements`, `audit_logs` and DELETE on `invoices`/`payouts` all
   fail with `permission denied` for a super admin (proven). No GRANT, no
   second DB role, no `$queryRawUnsafe` was added. `wallet_ledger` still has no
   DB-level REVOKE (deliberate, see migration `20260722000100_student_wallet`)
   — it is held by `immutableExtension` at runtime; the proof reports this
   honestly rather than claiming a guarantee that is not there.
5. **Revenue split / commission % are NOT editable here** (decided 2026-07-25).
   The center-profile allowlist is `.strict()` and excludes them, plus
   walletBalance / receiptSeq / status / shortId / entityType / isDemo /
   ownerUserId. Splits keep their dedicated pricing flow with snapshot-on-create
   + new-courses-only semantics — one money-sensitive number, one edit path.

   > **AMENDED 2026-08-01 (Ali) — the CENTER now prices its own hall's
   > per-attending-student rate.** Rationale: the center owns the hall. This
   > splits the two numbers that used to be lumped together as "superadmin-only
   > money config":
   > - **whole-room revenue split %** (platform/teacher/center) — UNCHANGED,
   >   still superadmin-only. That is the platform's cut.
   > - **per-attending-student rate** (`center_per_student_fee|bp`) — the
   >   center may now set it for its OWN halls, **bounded by the platform's
   >   published rate (center > global), which is the CEILING**. The bound is
   >   not optional politeness: a per-student-only hall deliberately shows NO
   >   price to the teacher at booking (the cost depends on attendance), so an
   >   unbounded center-set rate would take a share the teacher never saw and
   >   only discovers at settlement. The center must also quote in the SAME
   >   form the platform published (piasters vs basis points are not comparable
   >   without a lesson price). The superadmin is NOT bounded — it sets the
   >   ceiling.
   >
   > One implementation in `@repo/server-core/services/rooms/room-rate.ts`
   > (shape rules, row layout, ceiling, ownership, audit); apps/superadmin
   > re-exports the primitives so the two writers cannot drift, and the ONLY
   > difference between them is the ceiling. The center writes through
   > `POST/PATCH /api/v1/rooms` in the same transaction as the hall itself.
   > Every center-set rate writes an `m2_rate.room.updated` audit row attributed
   > to the center actor. Snapshot-on-create still holds: changing a hall's rate
   > never re-prices an existing course. Proof: room-pricing-methods **73/73**
   > (VP10).
   >
   > **The teacher SEES the rate at booking (added same day).** The asymmetry
   > the ceiling only bounded is now closed: `GET /api/v1/centers/[id]/rooms`
   > returns each hall's effective per-student rate (resolved room > center >
   > global by `resolveMethod2RatesForRooms`, one query for all halls), and the
   > collaboration panel shows it ON THE HALL CARD — so halls are compared on
   > it, not just confirmed after picking — plus an explicit line at the moment
   > the per-student method is chosen. `source` (room/center/global) is NOT
   > exposed: the teacher needs the number, not where the center got it. The
   > whole-room split % is still never sent to a teacher. A per-student-only
   > hall still hides its whole-room `price` (meaningless there) — the rate is
   > now what it shows instead. Proof: VP11 asserts the picker's batch resolver
   > returns exactly what the per-room resolver (the settlement engine) returns
   > at every precedence state, so a hall can never be quoted a price it does
   > not settle at.
   >
   > Demo data: `prisma/room-rate-demo-seed.ts` (`bun run seed:roomrate-demo`,
   > `--purge` to remove) — two centers whose six halls cover every state
   > (own rate under the cap / at the cap / inheriting / no per-student method),
   > one of them carrying a CENTER-level cap so `center > global` is visible,
   > plus a teacher to browse them. Zero money rows; the GLOBAL rate is
   > platform config, so the seed creates it only when missing and never
   > overwrites one you set.
6. **Deactivation reuses C-03**, not a new mechanism: the status write passes
   through `sessionRevocationExtension`, so `token_version` bumps in the same
   statement and the next request is unauthenticated. Enrollments are NOT
   touched by a deactivation.
7. **The only enrollment-removing op reuses H-04** — it routes through
   `centerBlacklistStudent`, so `blacklist_cascade_actions` journals each
   withdrawal and "restore" replays it. `centerBlacklistStudent` gained an
   optional explicit `centerId` (superadmin has no session centerId); a
   non-super_admin naming another center is refused in the service.
8. **Shared-kernel move (pure, with shims).** `collaboration.ts` moved to
   `@repo/server-core/services/collaboration` — same precedent as
   `blacklist.ts` — along with `session-generator`, `conflict-detector`,
   notification `fanout`, and `assertMethod2Enablable`. www re-exports all of
   them, so every www import path and behaviour is unchanged. The ONE addition
   is `opts.as = "platform_override"`, default-closed (defaults to `"party"`
   and re-checks `role === "super_admin"` inside `assertResponder`).
9. **Audit-log viewer** (roadmap decision #10, never built until now):
   `/dashboard/superadmin/audit` + an Audit tab on each center. `audit_logs` is
   REVOKEd UPDATE/DELETE, so the trail cannot be edited from any surface.

**No database migration was required.** Proof: `apps/superadmin/tests/db/
center-oversight.test.ts` **119/119** (live DB, real services + real NextAuth
callbacks + real DB role). Regressions green: `bun run check-types` 5/5, `bun run
build` both apps, www unit 111 pass/1 skip, rbac-isolation 11/11, h04 44/44,
c03 www 26/26 + superadmin 15/15, c04 72/72 + 26/26, messaging-scope 87/87,
center-staff-delegation 55/55, l1 12/12, refund 13/13, h2 7/7, h3 6/6,
room-pricing-methods 47/47, center-share-admin 11/11. Demo data:
`prisma/center-oversight-demo-seed.ts` (`--purge` to remove) — two centers, and
**zero money rows** (per the Conventions rule), so the Finance tab is
legitimately empty for demo centers.

## Email invites + guardian channel (built 2026-07-25 — awaiting review)

EMAIL is now the primary invite/credential-delivery channel for everyone.
WhatsApp is DEMOTED, not deleted (no verified Meta number yet). Built on the
Step 7 tokenized single-use claim — nothing was rebuilt.

> **NOTE:** the mail layer is `@repo/server-core/mail/send.ts` — provider-agnostic
> **nodemailer over SMTP** (`MAIL_PROVIDER=console|smtp`), NOT the Resend SDK.
> It works with Resend's SMTP bridge; that is an env change, never a code one.

1. **ONE claim kernel**: `apps/www/src/lib/services/invites/invite-token.ts`.
   `CLAIMABLE` maps purpose → the exactly-one role it may resolve to
   (`walk_in_onboarding`→student, `assistant_invite`→assistant,
   `center_staff_invite`→center_staff). The NextAuth claim provider reads that
   table, so a token minted for one role can never open another — a lookup, not
   a branch someone can forget. Generalizing Step 7's provider LOOSENED NOTHING:
   all five gates hold, plus two new ones (the account must not be soft-deleted;
   the assistant/staff link must still be live, so revoking a membership kills
   an outstanding invite without hunting for the token). Provider id
   `invite-token`, with `walkin-token` kept as an alias so Step 7 callers and
   proofs are untouched.
2. **PART A — student invite is email-first.** Delivery channels are an env set
   (`INVITE_CHANNELS`, default `email`); the WhatsApp leg is the same
   `sendWhatsApp` call, just off by default, and returns `skipped` (not
   `failed`) so "we chose not to" is distinguishable from "it broke".
3. **Guardian contact, and where the invite goes.** Almost every student here is
   a MINOR (default-minor), so "email the student" is the wrong default.
   `resolveStudentInviteRecipient` resolves, strictest-trust first: approved
   parent link with an email → `student_profiles.guardian_email` → the
   student's own email **only if they are a VERIFIED adult** → nothing. There
   is deliberately NO fallback to a minor's own inbox.
   The walk-in counter captures guardian **email if available, else phone**
   (kept for the record + a future SMS/WhatsApp channel). **Registration is
   never blocked on either.**
4. **Phone-only minor** ⇒ no email is sent at all; the API returns the copyable
   one-time claim link for in-person handover (the guardian is standing at the
   counter) plus `guardianEmailRequired`, and the student sees a required
   "add a guardian email" notice on their dashboard.
5. **CHILD-SAFETY GATE (binding).** `chat-guardian.ts` is the single rule: a
   MINOR with no guardian EMAIL has adult-facing messaging LOCKED — teacher,
   assistant, center_admin, center_staff (`ADULT_ROLES`). A guardian PHONE does
   NOT satisfy it: email is the only guardian channel we can deliver on today.
   The gate is enforced in `assertCanReach` AND filtered in `listContacts` from
   the same predicate, so the directory can never offer what the gate refuses
   (the drift proof still asserts set-equality), and in `assertGroupAccess` for
   posting. **Everything else works normally** — paid classes, materials,
   grades, wallet, login. The account is NEVER suspended by this rule.
   Existing students with an APPROVED parent link carrying an email are
   unaffected (that is why messaging-scope stayed 87/87).
6. **Timeout ESCALATES, never punishes.** `guardian_contact_due_at`
   (`GUARDIAN_EMAIL_GRACE_DAYS`, default 14) is set when we learn a minor has
   no guardian email, and is NEVER reset by a re-send. Before it: periodic
   reminders (cron `guardian-contact-reminders`, idempotent per window) and a
   dismissable banner. After it: the banner becomes non-dismissable and the
   owning CENTER is notified. Passing it never suspends the account and never
   unlocks messaging.
7. **PART B — assistants and center staff get the same invite/claim.** The
   creator NO LONGER types a password (`password` removed from both create
   APIs). The account is created `status: "shell"` + `passwordHash: NULL`,
   an invite is emailed, and the invitee sets their OWN password via
   `me/credentials` (still strictly set-once — that one condition is what makes
   it safe for three roles instead of one; an invitee keeps the address they
   were invited at, only a phone-only student chooses one). Both create/resend
   responses return a **copyable fallback link**, because an email in spam must
   not strand a hire. Invites are audited (`assistant.invited`,
   `center_staff.invited`); the token itself is never written to any row.
   Re-inviting an already-claimed account is REFUSED — that would be a
   creator-controlled password-reset door.
8. **The staff no-password bug, fixed at the source.** The old invariant
   ("creator supplies a password") is replaced by: a staff/assistant account
   has EITHER a password OR a live invite — never neither. `createStaff` /
   `createAssistant` now accept `shell` as a legitimate existing state
   (previously they threw "not active" at an unclaimed invitee, which is what
   could strand one). Asserted, not commented.
9. **Guardian email is stored, NOT verified.** A student could type a friend's
   address. What we do enforce: it may not equal the student's own login email,
   every set writes an audit row, and a self-supplied one notifies the center so
   a human sees it. **Confirm-by-click verification of the guardian address is
   the recommended follow-on and was deliberately NOT built.**

Migrations (additive only): `20260725100000_invite_purposes_guardian_notice`
(enum values, own file — Postgres cannot USE a new enum value in the transaction
that adds it) and `20260725100100_guardian_contact` (5 nullable columns + index,
no backfill).
**[dev] APPLIED. [production, 2026-07-31] APPLIED — all 40 migrations deployed; production is no longer behind.** Consequence: `guardian_contact_due_at` does not exist there, so the
`guardian-contact-reminders` cron job ERRORS on production rather than no-oping.
Applying them is part of the production bootstrap. Proof: `apps/www/tests/db/invite-claim.test.ts` **107/107** (live
DB, real services + real NextAuth providers + the real me/credentials route).
Regressions green: `bun run check-types` 5/5, `bun run build` both apps, www unit
111 pass/1 skip, messaging-scope 87/87, c04 72/72, center-staff-delegation
55/55, rbac-isolation 11/11, l1 12/12, m5 10/10.

### Optional env vars added
- `INVITE_CHANNELS` — `email` (default) | `email,whatsapp` | `whatsapp`.
- `INVITE_TOKEN_TTL_HOURS` — default 168 (falls back to `WALKIN_TOKEN_TTL_HOURS`).
- `GUARDIAN_EMAIL_GRACE_DAYS` — default 14.
- `GUARDIAN_REMINDER_EVERY_DAYS` — default 3.

## Parent pays for a child's lesson (built 2026-07-27 — awaiting review)

A PARENT can activate and pay for a specific lesson (or a month) for their own
child, from their own money. Built by WIDENING THE ACTOR on the Step 4
subscription engine — not by adding a second money path. Nothing was rebuilt.

1. **One gate, one implementation.** `assertApprovedChild` in
   `packages/server-core/src/services/wallet/parent-wallet.ts` is the only place
   "is this my child?" is decided; every parent money and browse path calls it.
   `pending`, `rejected` and `revoked` links all fail — approval is the point of
   the link, and a revoked one stops working immediately.
2. **MONEY DIRECTION IS UNCHANGED BY WHO PAID (binding).** A parent-funded
   subscription still moves `student -> center/teacher` in the Transaction
   ledger (`fromEntityId = studentId`), so every split, statement, payout,
   distribution and report behaves exactly as for a self-funded one. Who paid is
   recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
   redirecting the ledger. Proven, not asserted (proof 3).
3. **Each wallet belongs to exactly one role, and neither reaches across.**
   `payFrom: "wallet"` stays student-only — a parent spending their CHILD's
   balance is not "paying for their child", it is spending the child's money, so
   it is REFUSED. `payFrom: "parent_wallet"` is parent-only. Both directions are
   proven (proof 8).
4. **Parent wallet = the student wallet's deliberate MIRROR.** Same invariants:
   append-only `parent_wallet_ledger` as source of truth (added to
   `IMMUTABLE_MODELS`), `ParentProfile.walletBalance` as the reconciled cache,
   H2 conditional decrement for all-or-nothing debits, DB `CHECK (>= 0)` floor,
   `reconcileParentWallet`. A SIBLING table rather than a nullable owner on
   `wallet_ledger`, whose `student_id` is NOT NULL and whose queries are proven
   money code — widening it would have changed the meaning of every one of them.
   One extra column the student ledger has no use for: `beneficiary_student_id`,
   naming WHICH child a spend was for.
5. **A parent top-up writes NO Payment row** — it is a float deposit by a
   guardian, not a center/teacher receipt. Its receipt number lives on the
   Transaction and the ledger row's `ref_number`. That is why
   `payments.student_id` stayed NOT NULL while `payment_intents.student_id`
   became nullable (guarded by CHECK `payment_intents_student_required` so the
   NULL can only ever mean `purpose = 'parent_wallet_topup'`).
6. **Ownership of an intent = who is PAYING it.** A student for their own, a
   parent for the ones they funded. A parent is deliberately NOT given their
   child's own checkout intents — that is the child's, and parent oversight is a
   separate read surface with its own rules. Same rule in `getIntentForStudent`
   and in `mock-complete`, so no entry point disagrees.
7. **Browse widening is filtering, not authorization.** `search/courses` and
   `catalog/subjects` accept `?studentId=` and resolve the CHILD's grade/track
   after the link check; an unapproved id resolves NO scope, landing on the same
   unnarrowed list an anonymous browser already sees. No course row exposes
   anything new.
8. **The student path is byte-for-byte unchanged** — `payerUserId` and
   `createdBy` stay NULL on a self-checkout, and the existing suites confirm it
   (proof 12 + wallet 20/20, m1 9/9).

Migrations (additive only): `20260727110000_parent_wallet_topup_purpose` (enum
value, own file — Postgres cannot USE a new enum value in the transaction that
adds it) and `20260727110100_parent_wallet`.
**[dev + test, verified 2026-07-27] APPLIED — 40 migrations. [production, 2026-07-31] APPLIED — bootstrap executed, 40 migrations, verify-db 25/25.**
The `parent_profiles_wallet_balance_nonneg` CHECK is `convalidated = true` from
birth in dev and test (every row was 0), unlike the centers wallet CHECK.

Proof: `apps/www/tests/db/parent-pay.test.ts` **60/60** (live DB, real services,
real webhook + HMAC path). Regressions green: `bun run build` both apps, www unit
111 pass/1 skip, wallet 20/20, wallet-no-cap 7/7, m1-webhook-atomicity 9/9,
c04-login-parity 72/72, messaging-scope 87/87, rbac-isolation 11/11 (206
assertions across 6 suites). Typecheck is clean for every package this touched;
the repo-wide `bun run check-types` fails only in the untracked
`packages/ui/src/components/charts/` work in progress (`ChartLegendItem` expects
`key`, line-chart passes `id`) — unrelated, and surfaced only because `recharts`
was declared in `packages/ui/package.json` but never installed until now.

Demo data: `prisma/parent-pay-demo-seed.ts` (`bun run seed:parentpay-demo`,
`--purge` to remove) — one parent, two linked children, one center, two courses
with BOTH plans priced and 8 upcoming sessions, and a 750 EGP opening parent
wallet balance written through the REAL credit primitive so it reconciles like
real data. It deliberately seeds NO paid subscription / Payment / Transaction:
those are append-only and would be demo rows the purge cannot remove. Pay them
yourself in the preview — that is the point.

## Platform user directory + admin actions (built 2026-08-01 — awaiting review)

The cross-role user surface roadmap decision #10 called for and that was never
built. `apps/superadmin` ONLY (`/dashboard/superadmin/users`), super_admin only.
Service: `apps/superadmin/src/lib/services/admin/admin-users.ts`.

1. **ONE SUSPENSION MECHANISM (binding).** better-auth's admin plugin ships
   `banned` / `ban_reason` / `ban_expires` columns and its own ban endpoints.
   This app does NOT use them and `auth.api.banUser` is deliberately never
   called. The platform already disables an account through `users.status`
   (+ the 3-level blacklist), and C-03 wires that column to hard session
   revocation. A second parallel way to disable an account is exactly the C-04
   failure mode. The proof asserts the ban columns are STILL untouched after a
   suspension, so the two can never drift.
2. **Actions, each audited with actor + target + REQUIRED reason:** suspend /
   reinstate (`user.suspended` / `user.reinstated`), revoke all sessions
   (`user.sessions_revoked` — records `statusChanged:false, canSignInAgain:true`,
   because it is the compromised-credential response, NOT a punishment), revoke
   one device (`user.session_revoked`), reset 2FA (`user.two_factor_reset` —
   also ends sessions, so it cannot keep a live session alive without a second
   factor, and flags `mustReEnroll` for back-office accounts), send a password
   reset (`user.password_reset_sent` — the admin NEVER sees or sets a password;
   proven by asserting `password_hash` is unchanged). Self-targeting is refused;
   suspending a blacklisted user is refused (the blacklist has its own H-04
   reversal journal).
3. **IMPERSONATION IS BOUNDED TO THE BACK OFFICE, on purpose.** www and
   superadmin carry distinct cookie names AND distinct signing secrets, so a
   session minted in the back office is unreadable by www BY CONSTRUCTION.
   "Impersonate a teacher to see their portal" is therefore not a feature this
   app can ship without breaking that separation, and it does not. What it does
   allow: a super_admin viewing the finance portal as the `accountant` sees it —
   same app, same cookie, audited on start AND stop, persistent banner, 1-hour
   session. Refused: every www role, another super_admin (lateral privilege),
   yourself, and any non-active account. The admin plugin's `impersonate-admins`
   statement is deliberately NOT granted, so better-auth refuses admin targets
   independently of our own check.
4. **Money stays read-only** — the module imports no money service, and the
   proof asserts that by reading its import list (same posture as
   center-oversight).
5. **Shared-kernel move (pure, with a shim):** password reset moved to
   `@repo/server-core/services/auth/password-reset` so the back office triggers
   the SAME implementation; `apps/www/src/lib/services/auth/password-reset.ts`
   re-exports it, so every www import path and behaviour is unchanged (proven by
   mail-password-reset 15/15). The one addition is an optional `linkBaseUrl`.
   **Known limitation, stated honestly:** the reset PAGE lives in apps/www and is
   role-agnostic, so a back-office account resets on the public domain and then
   signs in to the back office. A superadmin-hosted reset page is the obvious
   follow-on and was deliberately NOT built.
6. Proof: `apps/superadmin/tests/db/admin-users.test.ts` **52/52** (live DB,
   real services). NOTE for future suites: www roles cannot pass the superadmin
   sign-in door at all (C-04), so a www user's live session is represented by a
   planted `auth_sessions` row; back-office fixtures use the real door. No
   database migration was required.

## Auth: next-auth → better-auth migration (built 2026-08-01 — awaiting review)

Both apps now run **better-auth 1.6.25** (DB-backed sessions); next-auth is
REMOVED from both package.jsons. Full audit:
[docs/architecture/better-auth-migration-audit.md](docs/architecture/better-auth-migration-audit.md);
data-migration + rollback plan:
[docs/architecture/better-auth-rollback.md](docs/architecture/better-auth-rollback.md).

1. **The stable API surface (other workstreams code against THIS):**
   server = `getSessionUser()` / `requireSession()` from `@/lib/auth/session`
   (signatures and `SessionUser` shape UNCHANGED — the 58 existing call sites
   did not change); client = `authClient` from `@/lib/auth/client`
   (`signIn.email`, `signOut`, `useSession`, `listSessions`, `revokeSession`,
   `twoFactor.*`, `admin.*` on superadmin). The better-auth instance itself is
   `@/lib/auth/auth` (`auth.api.*` for server-side flows). Do NOT hand-fetch
   `/api/auth/*`.
2. **Schema (migration `20260801170000_better_auth`, additive):**
   `auth_sessions` (NOT `sessions` — that is the live-class engine),
   `auth_accounts`, `auth_verifications`, `two_factors` + user columns
   `image`, `two_factor_enabled`, `banned`, `ban_reason`, `ban_expires`.
   User IDs/rows untouched — better-auth maps onto the existing `users` table.
   **[dev + test, applied 2026-08-01] — 42 migrations, verify-db 25/25.
   [production, APPLIED 2026-08-02] — see the note below; production had been
   running better-auth CODE against a database with NO auth tables, so every
   sign-in returned 500. Applying this migration is what fixed it.
   The expected-db-shape file now says 75 tables / 43 migrations (the extra
   table + migration over 74/42 is `contact_submissions`).**
3. **`users.password_hash` stays the SINGLE SOURCE OF TRUTH.** DB triggers
   (`users_credential_sync_*`) mirror it into the better-auth credential row
   both directions with IS-DISTINCT guards, so none of the ~10 existing
   password writers (services, seeds, raw SQL) changed and bcrypt hashes
   verify as-is — NO forced resets. Never write `auth_accounts.password`
   directly.
4. **L1 + C-03 became HARD revocation.** The `users_revoke_sessions` trigger
   DELETES a user's `auth_sessions` rows in the same statement as any
   deactivating write (`status` ≠ active, `deleted_at` set, or `token_version`
   bump) — stronger than the old per-request JWT epoch re-read, and it holds
   even for SQL that never touches Prisma. `token_version` and
   `sessionRevocationExtension` stay (their bump is what fires the trigger).
5. **One sign-in implementation per app** (before-hook in `lib/auth/auth.ts`):
   C-04 `canSignIn` partition, C2 token buckets (same limits), H5 dummy-hash
   timing, and the typed www codes (`USER_NOT_FOUND` / `ACCOUNT_INACTIVE` /
   `RATE_LIMITED`; superadmin stays fully generic). The REST door
   `POST /api/v1/auth/login` now FORWARDS to the same instance — it holds no
   policy, so C-04 drift is structurally impossible. The Step 7 invite claim
   is a better-auth plugin (`invite-token-plugin.ts`, endpoint
   `/api/auth/invite-token/claim`) with the identical five gates; the
   `walkin-token` provider-id alias was retired with NextAuth.
6. **Sessions & devices UI ("الأجهزة والجلسات")** on every www settings screen
   + superadmin/finance `security` pages: list devices, revoke one / all
   others. **2FA (TOTP + backup codes):** REQUIRED for super_admin/accountant
   (dashboard layout redirects to `/two-factor-setup` until enrolled), guided
   optional enrollment for center owners (settings card), `/two-factor`
   verify page in both apps.
7. **Env: ZERO new vars.** `NEXTAUTH_SECRET` / `NEXTAUTH_URL` /
   `SUPERADMIN_NEXTAUTH_SECRET` keep their names as the better-auth
   secret/baseURL. Cookies are now `edura.session_token` /
   `edura-superadmin.session_token` (old JWT cookies simply become inert —
   everyone logs in once again; prod has only the 2 staff accounts).
8. **Proofs (live test DB):** l1 13/13, c03 30/30, c04-parity 76/76,
   invite-claim 107/107, registration-doors 17/17, c01 36/36, h03 48/48;
   superadmin c03 16/16, c04-boundary 29/29, center-oversight 122/122,
   center-platform 45/45, c02 28/28. Full sweeps green except
   `catalog-onboarding` (pre-existing `cacheTag()` env failure, unrelated —
   already excluded from `test:db:ci`). Root check-types 6/6, www unit 132/132
   (+1 skip), `bun run build` both apps, lint error-parity with main.
   Verified live in the browser: all six www roles sign in, teacher + center
   admin portals, sessions card, full 2FA enroll→login cycle (real computed
   TOTP), superadmin forced-2FA gate → dashboard → security page.
   Demo helper: `demo-superadmin@edura.test` / `Passw0rd!` (is_demo, dev only).

## Operational layer (built 2026-08-02 — awaiting review)

Notifications, error tracking, product analytics, backups, health checks. Four
new surfaces, two new packages, and NO schema migration.

1. **`packages/notifications` is the single owner of transactional email.**
   `send(template, to, data)`; NEVER THROWS (every call site is downstream of a
   committed write). Templates are react-email, ar/en, RTL, each with a
   hand-written `text/plain` part: `welcome`, `password_reset`,
   `email_verification`, `payment_receipt`.
   **The SMTP transport MOVED here** (`transport/smtp.ts`) so the package is a
   LEAF — `@repo/server-core/mail/send` is now a re-export shim, and server-core
   depends on notifications rather than the reverse. Without the move,
   password-reset.ts calling a renderer that calls sendMail would be a cycle.
   This also killed real drift: `welcome-email.ts` had a THIRD hand-rolled email
   design (indigo, no shared layout) and now renders in the one shell.
   > **Resend is an ENV change, not a code change** (`MAIL_PROVIDER=smtp`,
   > `SMTP_HOST=smtp.resend.com`, API key as the password). No vendor SDK was
   > added — the 2026-07-23 decision stands.
   The three INVITE templates (student claim / assistant / staff) deliberately
   stayed hand-written in `server-core/mail/templates.ts`: each is threaded
   through a claim flow with heavy proofs, and the new shell is a VISUAL MATCH,
   so porting them is a copy of their COPY constants with no design decision
   left. **WhatsApp costs one file + one array entry + one env value** — proven
   by a test that registers a synthetic channel and asserts the fan-out reaches
   it, with zero dispatcher change.

2. **better-auth: `sendResetPassword` is DELIBERATELY NOT SET, in both apps.**
   better-auth ships a complete reset flow backed by its own
   `auth_verifications` tokens, and its writer does NOT bump
   `users.token_version` — the write that fires `users_revoke_sessions`. Wiring
   it would give the app a second way to set a password that leaves every
   pre-existing session alive, silently undoing L1. Reset stays on
   `requestPasswordReset`. Only `emailVerification.sendVerificationEmail` is
   wired (no competing implementation; does NOT set `requireEmailVerification`,
   so no sign-in behaviour changed). Same reasoning as ONE SUSPENSION MECHANISM.

3. **`packages/observability` is the ONE place that decides what Sentry and
   PostHog may see.** Dependency-free (browser + node + edge import it).
   **IDs only** — never a name, email, phone, or anything a human typed.
   **`isMinorRole()` treats EVERY `student` as a minor**, deliberately stricter
   than `chat-minors.ts` (which does read the verified DOB columns): analytics
   does not get a birth-date read on the page-view path, and stricter is the
   right direction for a third party. Session replay/recording and autocapture
   are OFF (autocapture records clicked element TEXT — on a roster screen that
   is a list of children's names). `beforeSend` deletes cookies/headers/bodies
   and redacts the single-use TOKENS that ride in claim/reset/onboarding query
   strings; if scrubbing itself throws it returns null and DROPS the event.
   Proof: `apps/www/tests/unit/observability.test.ts` 26/26.

4. **The PostHog funnel is the CENTER/TEACHER activation journey**, so the
   minor rule costs it nothing — a student appears only as the OBJECT of "first
   student added". `first_*` is COMPUTED (row count === 1), never assumed.
   The funnel helpers live in `@repo/server-core/services/analytics` so the
   WALLET and CASH rails (kernel code) report the same events; a helper in
   apps/www could only ever have seen the gateway rail. PostHog is
   reverse-proxied through `/ingest` because `*.i.posthog.com` is on every
   ad-blocker list; Sentry is NOT proxied, because an error tracker must work
   when this server is unhealthy.

5. **`/api/health` in both apps** (not `/api/v1/` — infrastructure, not product
   API). Status CODE is the signal: 200 / 503 + `Retry-After`. Only the DATABASE
   affects status. **Bounded at 8s, and the number was measured:** 3s produced a
   FALSE 503 on a Neon cold start (scale-to-zero; warm requests are 96–550ms).
   Do not lower it without re-measuring a cold start. The pre-existing
   `/api/v1/_ping` returns 200 even when the DB is unreachable — never point a
   monitor at it.

6. **Backups: `db:backup` + `db:restore-test`.** Encrypted (`age`, public-key)
   `pg_dump -Fc` to any S3-compatible bucket, 7 daily + 4 weekly, label-guarded
   by the same `edura-env:` marker, and it REFUSES to upload an unencrypted
   dump. `.github/workflows/backup.yml` runs it nightly + a **weekly restore
   test that pulls from the BUCKET** (so download and decrypt are exercised too).
   > **[2026-08-02] THE SCHEDULE IS DISABLED — nothing is being backed up
   > automatically.** No bucket and no `BACKUP_*` secrets exist yet, and the
   > job fails LOUDLY rather than skipping quietly, so it was paused rather
   > than training anyone to ignore a nightly red run. **Neon PITR is the only
   > protection currently in force.** Re-enable with
   > `packages/database/scripts/setup-backup-secrets.sh`, confirm a manual run
   > passes, then restore the `schedule:` block (exact YAML is in the
   > workflow's header comment — the key was REMOVED, not emptied, because
   > GitHub rejects an empty schedule array).
   > **PostgreSQL client major must be >= the server's.** Neon runs **18.4**;
   > `pg_dump` 17 aborts outright. The scripts pre-flight this with an
   > actionable error.
   **[dev, VERIFIED 2026-08-02]** a real 0.32 MiB dump restored into a scratch
   PostgreSQL 18.4 server: 8/8 checks — 78 tables, 44 applied migrations, 45
   subjects / 27 grade levels, 38 users, 0 orphaned refunds/enrollments, 296
   indexes / 45 FKs. Caveat recorded honestly in the runbook: dev held 0
   transactions and 0 payments, so the money-ledger check passed VACUOUSLY.
   **[production] never exercised.** A restored dump has NO `edura_app` role and
   NO grants (`--no-owner --no-privileges`), so `db:bootstrap-role` + `db:verify`
   after a restore is MANDATORY — otherwise the money ledger comes back
   writable. Runbook: [docs/runbooks/backup-restore.md](docs/runbooks/backup-restore.md).

Docs: [backup-restore.md](docs/runbooks/backup-restore.md),
[uptime-and-status.md](docs/runbooks/uptime-and-status.md),
[observability.md](docs/runbooks/observability.md).
Proofs: unit 181 pass/1 skip (up from 132), check-types 8/8, `bun run build`
both apps, mail-password-reset **15/15** and invite-claim **107/107** on the
live test DB after the template re-point, lint error-parity with main.

### Optional env vars added
All are OPT-IN: with none of them set, Sentry and PostHog are inert and mail
behaves exactly as before.
- `NOTIFICATION_CHANNELS` (default `email`), `NOTIFICATIONS_PREVIEW`,
  `NOTIFICATIONS_PREVIEW_DIR`.
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`,
  `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`; CI only:
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PROJECT_SUPERADMIN`,
  `SENTRY_AUTH_TOKEN`.
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (use the EU region).
- Backups (CI secrets): `BACKUP_DIRECT_URL`, `BACKUP_AGE_RECIPIENT`,
  `BACKUP_AGE_IDENTITY`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`,
  `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION`,
  `BACKUP_ALERT_EMAIL`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`.

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
- **M4** — return a generic "Internal error" for unhandled errors in prod (stop
  leaking raw err.message).
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
- Then the lighter: **M5** (temp-students/[id]/send-invite ownership check),
  **M6** (materials %PDF- magic-byte check), **M8** (kill $queryRawUnsafe).
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

(Recommended once M3 lands: `REDIS_URL` for a shared rate-limit store across
instances, `TRUSTED_PROXY_HOPS` matching the deploy's proxy depth.)
