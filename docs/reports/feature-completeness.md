# Feature completeness audit

**Date:** 2026-07-26
**Commit:** `f503254` (clean tree, nothing uncommitted)
**Scope:** `apps/www`, `apps/superadmin`, `apps/realtime`, `packages/{server-core,database,ui}`
**Size:** 1,358 TS/TSX files · ~318k LOC · 359 API routes (177 www + 182 superadmin) · 67 Prisma models · 56 enums · 37 migrations
**Mode:** read-only. No database writes, no migrations, no seeding, no test runs, no `month-end-statements`.

> **Tree state caveat.** The working tree was clean at `f503254` when this audit began. Between 12:38 and 12:46 on 2026-07-26 — while the audit was in progress — ten files were modified by another process (dev servers are running on ports 3002 and 3004): `README.md`, `docs/reports/scale-proof.md`, both apps' `next-env.d.ts` and `src/components/refine/dashboard-shell.tsx`, and four `packages/database/scripts/*`. The `dashboard-shell.tsx` change adds a `SidebarNavLink` that dismisses the mobile sidebar; it shifted line numbers in the one file this report cites for the i18n finding, and that citation has been re-verified against the current content (the finding itself is unchanged). Everything else in this report was read before those edits and reflects `f503254`.

---

## Method and confidence

Every grade below comes from reading source, not from `CLAUDE.md`. Where `CLAUDE.md` makes a claim I verified it against code and say so explicitly.

Two confidence levels are used, because they were earned differently:

- **[chain]** — I traced UI → API route → service → Prisma call myself, and checked the error paths. High confidence.
- **[surface]** — I confirmed the API route, the service function, and that it persists, but did not read every branch. Medium confidence; the grade is directionally right, the detail may be off by one notch.

A planned 13-agent parallel deep-trace of all seven roles was launched and **failed** — every agent died on a session limit and returned nothing. Everything in this document is therefore my own first-hand reading, which is thorough on the money, payments, messaging, invite, notification, test and schema layers, and **[surface]**-level on parts of the center-admin, staff and superadmin CRUD breadth. The gaps in coverage are named in §1.8 rather than papered over.

---

## ⛔ FINDING 0 — production connects as the database owner, so the money guarantee does not exist there

**Recorded 2026-07-26. This is the most serious finding in this report and it invalidates a COMPLETE grade given in §1.7.**

`apps/www/.env.production` and `apps/superadmin/.env.production` both set `DATABASE_URL` and `DIRECT_URL` with role **`neondb_owner`**. Neither file contains an `edura_app` URL at all. Measured consequences, in dev, by comparing the two roles:

| | `edura_app` | `neondb_owner` |
|---|---|---|
| `rolbypassrls` | **false** | **true** |
| RLS policies enforced (56 defined, 35 tables) | yes | **no — all 56 inert** |
| `transactions` UPDATE / DELETE | **denied / denied** | allowed / allowed |
| `points_ledger` UPDATE / DELETE | **denied / denied** | allowed / allowed |
| `session_settlements` UPDATE / DELETE | **denied / denied** | allowed / allowed |
| `audit_logs` UPDATE / DELETE | **denied / denied** | allowed / allowed |
| `invoices` / `payouts` DELETE | **denied** | allowed |
| `blacklist_cascade_actions` DELETE | **denied** | allowed |

Method: `pg_roles.rolbypassrls` and `has_table_privilege(role, table, priv)` — catalogue reads, no writes attempted.

**So, in the production configuration: RLS does not run, and every money-table REVOKE is inert.** The DB-level append-only ledger and tenant isolation — the strongest guarantees in this architecture — exist in dev only. That is precisely why every proof passed and nobody caught it: the suites run against dev, where the role *is* `edura_app`.

**§1.7's grade "Money is read-only for superadmin — COMPLETE" is CORRECT FOR DEV AND WRONG FOR PRODUCTION.** It should read: COMPLETE in dev; **ABSENT in the production configuration as committed**. The mechanism is sound and fully implemented; it is simply not connected in prod.

One detail deserves credit, because it shows the design anticipated this: all 35 RLS tables carry `FORCE ROW LEVEL SECURITY`, which exists specifically to subject a table's *owner* to its policies. It is defeated only because `neondb_owner` additionally holds the `BYPASSRLS` **role attribute**, which in Postgres always wins over `FORCE`. The migrations did the right thing; the connection string undoes it.

Mitigating today: production is an empty schema shell (0 rows), so nothing is currently exposed. This is a deploy-blocker, not an active breach.

### What actually needs owner, and what does not

| Needs owner (`ADMIN_URL`) | Why |
|---|---|
| `prisma migrate deploy` | DDL; `edura_app` has no `CREATE` on schema `public` (verified `false`) |
| `scripts/bootstrap-app-role.ts` | `CREATE ROLE` |
| `scripts/test-cleanup.ts` | must DELETE from `transactions` / `points_ledger` / `session_settlements` / `audit_logs`, which are REVOKEd from `edura_app` **by design** |
| Seeds, when they touch REVOKEd tables | same reason |
| `scripts/verify-db.ts`, `db-guard.ts` | read-only; owner is convenient, not required |

**The app needs none of it.** Verified that `edura_app`'s grant set is sufficient — nothing the application does was caught by the REVOKEs:

- `SELECT` and `INSERT` on **all 68** tables (0 tables missing either).
- `USAGE` + `SELECT` on all 6 sequences, so `nextval()` works for `platform_receipt_seq`, `txn_ref_seq`, `invoice_ref_seq`, `student_code_seq` and the two message sequences. No `UPDATE` (no `setval`) — and no application code calls `setval`.
- `USAGE` but **not** `CREATE` on schema `public`, so the app cannot add or drop objects.
- The revoked privileges are genuinely unused: **zero** `update`/`delete` call sites on `transactions`, `points_ledger`, `session_settlements` or `audit_logs` anywhere in `apps/*/src` or `packages/server-core/src`. The six call sites that do exist are all `UPDATE`, which `edura_app` holds — `payout.update` ×4 (`pending→approved→paid`), `invoice.update` ×1, `blacklistCascadeAction.update` ×1. Only DELETE is revoked on those three.

The grant mechanism is also correct by construction: `bootstrap-app-role.ts` uses `ALTER DEFAULT PRIVILEGES` (not a blanket `GRANT ON ALL TABLES`), so tables created by later migrations are granted automatically and the migrations' REVOKEs then carve out the append-only set afterwards. The script additionally refuses to run against a non-empty schema, precisely to stop a blanket grant from re-granting what was revoked.

### Proposed env shape (NOT APPLIED — proposal only)

The rule: **`ADMIN_URL` must never be present in a serving process's environment.** Not "unused" — absent.

| Variable | www / superadmin runtime | migration & script runner (CI job, or a local operator shell) |
|---|---|---|
| `DATABASE_URL` | `edura_app` (pooled) | `edura_app` |
| `DIRECT_URL` | `edura_app` (unpooled) | `edura_app` |
| `ADMIN_URL` | **absent** | `neondb_owner` |
| `APP_ROLE_PASSWORD` | **absent** | present (bootstrap only) |

Concretely: the three owner-only entry points (`migrate:deploy`, `bootstrap-app-role`, `test-cleanup`) already read `ADMIN_URL ?? DIRECT_URL`. That fallback is what lets an owner credential leak in through `DIRECT_URL` — it should be tightened to `ADMIN_URL` only, so those scripts fail loudly rather than silently succeeding on an app-role URL, and so nothing is tempted to put an owner string in `DIRECT_URL`.

### What enforces the swap — a boot assertion is the right shape

A startup assertion that refuses to boot as owner is the correct control, and it is stronger than a checklist for the same reason `db-guard` is stronger than a convention: it reads the truth from the connection rather than trusting the string. Proposed shape:

```
assertNotOwner()  — runs once per process, at first DB use, in every environment:
  SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)
  → refuse to serve if rolbypassrls is true, or if current_user is the database owner
```

Three properties worth having:
1. **Fail closed, and in every environment** — not just production. A dev process that accidentally connects as owner silently disables the isolation the tests exist to prove, which is how this class of bug survives.
2. **Assert the negative capability, not the role name.** Checking `current_user <> 'neondb_owner'` is defeated by a renamed or second owner-equivalent role. Checking `rolbypassrls = false` asserts the property that actually matters.
3. **One call site.** `packages/database/src/client.ts` (or `scope.ts`) is where every app query already funnels; the scripts that legitimately need owner do not go through it.

`verify-db.ts` should additionally report the effective role and RLS posture, so a bootstrap that skipped a step is visible before traffic rather than after.

---

## ⛔ FINDING 0b — referential integrity is drift, not policy: 40 FKs, 44 tables with none, 958 existing orphans

**Recorded 2026-07-26.**

The schema declares **40 FOREIGN KEY constraints across 23 of 68 tables. 44 tables have none** — including every money table (`transactions`, `payments`, `wallet_ledger`, `session_settlements`, `payment_intents`, `subscriptions`, `invoices`, `payouts`) and `audit_logs`.

**Is it a documented decision? No.** There is no FK or referential-integrity policy in `CLAUDE.md` or anywhere in `docs/`. The opposite exists: [docs/product/prd-compliance-audit.md:257](docs/product/prd-compliance-audit.md) already graded this **⚠️ partial** — *"Only 16 FKs exist … MISSING FKs the PRD specifies"* — and recommended *"Add NOT VALID FKs (then VALIDATE) for the student/user reference columns with ON DELETE RESTRICT."* That was never done. The count has since grown 16 → 40 as newer features (education catalog, realtime chat, messaging scope) added FKs for their own tables, while the older core and money tables never got theirs. One loose reference is even commented as intentional in the schema (`sessionId` — *"loose ref (no FK), like transactions.lesson_id"*), so the pattern was known and propagated locally, never decided globally.

**Nor is it defensible as a soft-delete-everywhere design.** Only **3 of 67 models carry `deletedAt`**: `User`, `ConversationMessage`, `GroupMessage`. `Center`, `Course`, `Session`, `Enrollment`, `Room`, `Payment` and the rest have no soft-delete column at all. `CLAUDE.md`'s convention *"destructive operations use soft-delete"* holds for users and messages and has no mechanism anywhere else.

### What it costs today: 958 orphaned references in dev

44 FK-less column pairs checked; a reference is orphaned when the target row does not exist.

| Orphans | Column | → |
|---|---|---|
| 260 | `audit_logs.actor_id` | users |
| 191 | `transactions.from_entity_id` | users |
| 180 | `transactions.to_entity_id` | users |
| 78 | `audit_logs.center_id` | centers |
| 67 | `transactions.lesson_id` | sessions |
| 65 | `transactions.center_id` | centers |
| 62 | `points_ledger.student_id` | users |
| 19 | `wallet_ledger.student_id` | users |
| 13 | `blacklist_entries.target_id` | users |
| 11 | `invite_tokens.user_id` | users |
| 12 | `conversations.*`, `conversation_reports.reporter_id` | users |
| **958** | **total** | |

**~520 of those are in the money ledger and ~338 in the audit trail — the two tables that are `REVOKE`d `UPDATE`/`DELETE`, so they can never be repaired through the application.** The audit trail contains 260 entries attributing actions to users that do not exist.

**Which delete paths leave them behind:** not the application — there are **zero** `user.delete`/`center.delete` call sites in app code. Every orphan came from **test and script cleanup**: a suite deletes its fixture users through the admin pool, and the `transactions`, `points_ledger` and `audit_logs` rows those users generated stay behind. FK-less columns mean Postgres neither blocks the delete nor cascades it.

That is also why the first version of `test-cleanup.ts` was dangerous rather than merely incomplete: walking only declared FKs, it reached the 470 tagged users but not their 427 transactions, 558 audit rows, 100 wallet-ledger and 99 points-ledger rows — running it would have manufactured **~1,750 new unrepairable orphans**. Fixed by adding a column-name convention edge set (`CONVENTION_EDGES`); the corrected dry-run reports **3,435 rows** against the FK-only walk's 1,492, with `110` convention edges supplementing `40` declared ones.

**Recommendation** (not applied): adopt the `prd-compliance-audit` remedy — `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` then `VALIDATE` per table, `ON DELETE RESTRICT` for money and identity references, `ON DELETE SET NULL` for `audit_logs.actor_id` (an audit row must outlive its actor). Clean the 958 existing orphans first, or the `VALIDATE` step will fail — which is itself the useful forcing function.

---

## ⛔ FINDING 0c — 558 fabricated rows in the audit trail, and a tooling tension

**Recorded 2026-07-26.** Of `audit_logs`' 1,183 rows in dev, **558 belong to test fixtures** and 260 already point at deleted actors. The audit trail — the artefact whose value is that it cannot be edited — is over a third synthetic.

**The tension, stated plainly:** clearing them requires `DELETE` on `audit_logs`, which is `REVOKE`d from `edura_app` by design. So the cleanup tooling needs `ADMIN_URL` — the credential Finding 0 is trying to remove from circulation. **The cleanup tooling must not become the reason owner access stays wired in.**

Resolution that keeps both properties:

1. **Never put `ADMIN_URL` in a serving environment.** The sweeper is an operator/CI tool, not an app dependency. Runtime and cleanup are different processes with different credentials; they do not need to share an env file.
2. **Tighten the fallback.** `test-cleanup.ts` reads `ADMIN_URL ?? DIRECT_URL` today. Drop the `DIRECT_URL` fallback so the sweeper cannot silently run on an app-role URL — and so nobody is tempted to make `DIRECT_URL` an owner string to make it work.
3. **Stop generating the rows.** The 41 suites now sweep their own tag in a `finally`, so this residue should not recur; the sweeper's role shrinks to clearing history once.
4. **Scope the credential, don't share it.** If a narrower grant is wanted long-term, a dedicated `edura_cleanup` role with `DELETE` on exactly the fixture-reachable tables and no `BYPASSRLS` would remove the last reason to hold an owner credential outside migrations. That is a larger change and is not proposed for now.

The honest summary: production should never hold an owner credential; migrations and cleanup legitimately need one; the fix is process separation, not a broader grant.

---

## Findings that change the picture — read these first

Six things materially change how "close to done" should be read. They are not opinions; each is a one-line check.

| # | Finding | Evidence |
|---|---|---|
| 1 | **The Paymob integration does not exist.** Not "partially wired" — the driver is 84 lines in which both methods are stubs. `createCheckout` throws; `verifyWebhook` returns `{valid:false}` unconditionally. Five TODO comments *are* the integration. | [paymob-driver.ts:22-84](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:22) |
| 2 | **`sandbox` is as broken as `live`.** `resolveDriver()` returns the stub for both. There is no working non-mock mode to test against. | [gateway/index.ts:16](apps/www/src/lib/services/payments/gateway/index.ts:16) |
| 3 | **Six cron jobs exist; nothing schedules any of them.** No `vercel.json`, no crontab, no `fly.toml`, no Dockerfile, no pipeline file anywhere in the repo. Subscription expiry, intent expiry, collaboration expiry, lesson reminders, month-end statements and the entire guardian escalation are inert code. | [cron/[job]/route.ts:28-43](apps/www/src/app/api/v1/cron/[job]/route.ts:28); `find` for scheduler configs returns nothing |
| 4 | **The proof corpus is not runnable.** All 38 DB test suites are launched via `tsx --env-file=.env.test`. There is no `.env.test` anywhere in the tree, and no `.env.example` either (despite `.gitignore:11` claiming those are the committed secret-free copies). `node --env-file=<missing>` exits 9. Every `bun run test:db*` fails before the first assertion. | [package.json](apps/www/package.json) `pretest:db`; `find . -name '.env.test*'` → empty |
| 5 | **There is no CI.** No `.github/workflows`, no pipeline config of any kind. Every "119/119", "107/107", "87/87" in `CLAUDE.md` is a number from a manual run on one machine, unreproducible today because of #4. | `ls .github/workflows` → not found |
| 6 | **`apps/superadmin/.env.production` contains three keys** — `DIRECT_URL`, `DATABASE_URL`, `APP_ROLE_PASSWORD`. No `NEXTAUTH_SECRET`, no `SUPERADMIN_NEXTAUTH_SECRET`, no `CRON_SECRET`, no `INTERNAL_API_SECRET`, no `MAIL_PROVIDER`, no `PAYMENTS_MODE`. The back-office app is not production-configured at all. | [apps/superadmin/.env.production](apps/superadmin/.env.production) |

None of these invalidate the audit — they *are* the audit's headline. But #4 and #5 together mean the confidence that `CLAUDE.md` projects ("proven", "verified", "green") is currently unverifiable, and #3 means a meaningful slice of shipped logic never executes.

---

## 1. Journey coverage

Grades: **COMPLETE** (real data in and out, error paths handled, something proves it) · **PARTIAL** (happy path works; error paths or proof missing) · **STUBBED** (code exists, behaviour is placeholder) · **MISSING** (no code path).

### 1.1 Student

Overall: the strongest role in the product. Onboarding, subjects, attendance, wallet, grades, materials and messaging are all real and mostly proven. The two holes are payment (blocked behind the gateway stub) and assignments (does not exist).

| Journey | Grade | What actually works | What's missing / broken | Evidence |
|---|---|---|---|---|
| Registration | **COMPLETE** [chain] | `auth/register/student` → shared `registerStudent()`; four distinct doors (student/parent/teacher/center) share one service | — | [register/student/route.ts:23](apps/www/src/app/api/v1/auth/register/student/route.ts:23); proof `tests/db/registration-doors.test.ts` |
| Onboarding (year + track → subjects) | **COMPLETE** [chain] | `me/onboarding` GET state + PATCH; auto-assign resolves through `subjectOffering` against the real catalog | — | [catalog/onboarding.ts:141,196](apps/www/src/lib/services/catalog/onboarding.ts:141); proof `tests/db/catalog-onboarding.test.ts`, `tests/unit/onboarding-steps.test.ts` |
| Claim / invite accept | **COMPLETE** [chain] | Single-use tokenised claim, `CLAIMABLE` purpose→role map, set-once password via `me/credentials` | — | [invite-token.ts](packages/server-core/src/services/invites/invite-token.ts); proof `tests/db/invite-claim.test.ts` (not runnable — see finding #4) |
| Login + role routing | **COMPLETE** [chain] | NextAuth + `RoleGuard` + `OnboardingGate`; `token_version` re-read every request so a password reset revokes live JWTs | — | proof `tests/db/l1-session-invalidation.test.ts`, `rbac-isolation.test.ts` |
| Discovery (subjects / browse) | **COMPLETE** [surface] | Track-default view + Browse All; `search/{teachers,courses,centers}` | — | `dashboard/student/subjects`; `api/v1/subjects`, `api/v1/search/*` |
| Enrolment | **COMPLETE** [surface] | `enrollment-requests` create → approve/decline, real persistence both sides | — | [enrollment-requests/[id]/approve/route.ts](apps/www/src/app/api/v1/enrollment-requests/[id]/approve/route.ts) |
| **Payment (online)** | **STUBBED** | Everything from the intent row inward is real and good: server-side amount, idempotency key, M1 atomic claim+settle, `failed`/`paid` states, ledger + points + notification | The gateway conversation does not exist. In `mock` the money is fake; in `sandbox`/`live` `createCheckout` throws. There is no working real-money path. | [payment-intents.ts:224-280](apps/www/src/lib/services/payments/payment-intents.ts:224) vs [paymob-driver.ts:58](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:58) |
| Payment (cash at center) | **COMPLETE** [chain] | Counter records it; mirrored to the `Transaction` ledger in the same tx as the `Payment` row (Step 4 reconciliation) | Pre-Step-4 cash history is not ledger-mirrored (documented, forward-only) | [counterCheckin](packages/server-core/src/services/attendance/checkin.ts:169); `center/wallet-topup`, `center/subscriptions` |
| Subscription | **COMPLETE** [chain] | MONTHLY + PER_SESSION; subscription wraps enrolment; coverage checked against the session's date window, so a stale `status` cannot grant access | `expire-subscriptions` never runs, so `status` drifts stale (reporting only, not access) | [coverage.ts:21-37](packages/server-core/src/services/subscriptions/coverage.ts:21) |
| Attendance | **COMPLETE** [chain] | counter/door stage model, mode-derived status, `counter_only` distinct and excluded from distribution | — | [checkin.ts:169-240](packages/server-core/src/services/attendance/checkin.ts:169) |
| Messaging | **COMPLETE** [chain] | Direct student→teacher per the current matrix; gate order matrix → EDGES → guardian → block → rate-limit; `ChatLimiter` is a required param so a transport cannot forget it | — | [chat-scope.ts:928-937](packages/database/src/queries/chat-scope.ts:928) |
| Materials | **COMPLETE** [surface] | Full CRUD + signed download URL + `%PDF-` magic-byte check | — | [materials.ts:25,82-355](apps/www/src/lib/services/materials/materials.ts:25) |
| Grades | **COMPLETE** [surface] | create/list/get/update/delete + `bulkUpsertScores` | — | [grades.ts:45-208](apps/www/src/lib/services/grades/grades.ts:45) |
| **Assignments** | **MISSING** | Nothing. There is no `Assignment`, `Submission`, `Homework` or `Quiz` model among the 67. The screen reskins `grades` records — anything without a score is labelled "pending" and a "completion %" is computed from that. | No due dates, no submission, no upload, no teacher-side creation. `homework_deadline` is a declared notification type that nothing fires. | [assignments-screen.tsx:29-50](apps/www/src/features/student/assignments-screen.tsx:29); `grep -E '^model .*(assign\|submis\|homework\|quiz)'` → none |
| Reviews | **PARTIAL** [chain] | Create/list/eligible; recomputes teacher rating; awards points | `@@unique([studentId, teacherId])` makes the declared `lessonId` (per-lesson ratings, a PRD feature) unusable, and it is never written | [reviews.ts:65-73](apps/www/src/lib/services/reviews/reviews.ts:65); [schema.prisma:1378,1384](packages/database/prisma/schema.prisma:1378) |
| Notifications | **PARTIAL** [chain] | In-app rows are real; a complete 32-type channel matrix; web push is configured and fires | FCM inert, SMS unimplemented — see §2.4. `lesson_reminder` only fires from the unscheduled cron. | [notify.ts:30-73](packages/server-core/src/services/notifications/notify.ts:30) |
| Wallet | **COMPLETE** [chain] | Top-up (online/cash), pay-from-wallet all-or-nothing, history, refund-to-wallet; balance ledger-derived, H2 non-negative floor | Online top-up inherits the gateway stub | [wallet.ts](packages/server-core/src/services/wallet/wallet.ts); proofs `tests/db/wallet.test.ts`, `wallet-no-cap.test.ts` |
| Invoicing | **PARTIAL** [chain] | `payments/[id]/receipt` exists | A student never sees a statement; invoice generation is superadmin-side and the email leg misreports success (§2.5) | [payments/[id]/receipt/route.ts](apps/www/src/app/api/v1/payments/[id]/receipt/route.ts) |

### 1.2 Parent

Overall: **the weakest role, and the gap is structural, not cosmetic.** Oversight is excellent. Everything transactional is read-only.

| Journey | Grade | What actually works | What's missing / broken | Evidence |
|---|---|---|---|---|
| Registration | **COMPLETE** [chain] | `auth/register/parent` → `registerParent()` | — | [register/parent/route.ts:22](apps/www/src/app/api/v1/auth/register/parent/route.ts:22) |
| Child linking | **COMPLETE** [surface] | `parent-links` create → approve/reject, either side; `me/children` | — | [parent-links/[id]/approve/route.ts](apps/www/src/app/api/v1/parent-links/[id]/approve/route.ts) |
| Login + routing | **COMPLETE** [chain] | Same shared path as student | — | — |
| Discovery / enrolment | **MISSING** | — | A parent has no enrolment path. Only nine parent-callable endpoints exist, all oversight/linking. | `grep 'requireRole("parent"' apps/www/src/app/api` → 9 hits, none transactional |
| **Payment** | **MISSING** | — | **Both payment entry points are `requireRole("student")` only.** A parent cannot pay for their child, online or from a wallet. For a K-12 product in Egypt — where the parent holds the money and the phone — this is the single largest journey gap in the product. | [subscriptions/checkout/route.ts:31](apps/www/src/app/api/v1/subscriptions/checkout/route.ts:31); [payments/initiate/route.ts:24](apps/www/src/app/api/v1/payments/initiate/route.ts:24) |
| Attendance view | **COMPLETE** [surface] | `dashboard/parent/attendance` | — | — |
| Progress | **PARTIAL** [surface] | `dashboard/parent/progress` reads real analytics contracts | Nav label untranslated (§2.7) | `analytics/contracts.ts` |
| Fees view | **PARTIAL** [chain] | `parent-fees-screen` reads the `payments` resource | Read-only. There is no "pay this" action, because there is no endpoint for one. | [parent-fees-screen.tsx:41](apps/www/src/features/parent/parent-fees-screen.tsx:41) |
| **Messaging oversight** | **COMPLETE** [chain] | Strictly read-only; never touches unread counters or read receipts; only MINOR children with an APPROVED link; only threads with ADULTS; persistent disclosure banner to both sides | — | [parent/oversight/*](apps/www/src/app/api/v1/parent/oversight); `chat-oversight.ts`; proof `messaging-scope.test.ts` |
| Messaging (own) | **COMPLETE** [chain] | Direct parent↔teacher; `parent` is deliberately **not** an adult role, so the guardian lock never cuts a child off from their guardian | — | [chat-guardian.ts](packages/database/src/queries/chat-guardian.ts) header + `ADULT_ROLES` |
| Notifications | **PARTIAL** | Same as student | Same channel gaps | — |
| Wallet / payouts | **MISSING** | — | No parent wallet. Reasonable by design, but it means the parent cannot fund anything. | — |
| Invoicing | **MISSING** | — | No parent-facing invoice or statement | — |

### 1.3 Teacher

Overall: strong and broad. The money side is the best-proven part of the codebase.

| Journey | Grade | Notes | Evidence |
|---|---|---|---|
| Registration + onboarding | **COMPLETE** [chain] | `registerTeacher()`; subject/grade-level selection through the real catalog; photo via Cloudinary | `register/teacher`, `TeacherSubject`/`TeacherGradeLevel` |
| Login + routing | **COMPLETE** [chain] | — | — |
| Course + schedule creation | **COMPLETE** [surface] | `session-generator` + `conflict-detector` in the shared kernel | [sessions/session-generator.ts](packages/server-core/src/services/sessions/session-generator.ts) |
| Collaboration with centers | **COMPLETE** [chain] | create/list/accept/reject/cancel/expire; acceptance creates class+schedule in one tx with proven conflict rollback; carries `proposedCenterShare` | [collaboration.ts:59-598](packages/server-core/src/services/collaboration/collaboration.ts:59) |
| Attendance + door | **COMPLETE** [chain] | Both modes; `attendance-mode` setting; offline outbox sync with server-wins conflict resolution preserving `localTimestamp` | [checkin.ts](packages/server-core/src/services/attendance/checkin.ts); [sync.ts:23](apps/www/src/lib/services/attendance/sync.ts:23); proof `offline-sync.test.ts` |
| Grades / gradebook | **COMPLETE** [surface] | — | [grades.ts](apps/www/src/lib/services/grades/grades.ts) |
| Materials | **COMPLETE** [surface] | — | [materials.ts](apps/www/src/lib/services/materials/materials.ts) |
| **Assignments** | **MISSING** | `/dashboard/teacher/assignments` renders **the same `TeacherGradebookScreen`** as `/dashboard/teacher/grades`. Two nav entries, one component, no distinct feature. | [teacher/assignments/page.tsx](apps/www/src/app/[locale]/dashboard/teacher/assignments/page.tsx) vs [teacher/grades/page.tsx](apps/www/src/app/[locale]/dashboard/teacher/grades/page.tsx) |
| Messaging | **COMPLETE** [chain] | Direct to students/parents; guardian gate applies | `chat-scope.ts` |
| Wallet + payouts | **COMPLETE** [chain] | Ledger-derived balance; `SELECT … FOR UPDATE` on the beneficiary (H1); conditional decrement + DB `CHECK (wallet_balance >= 0)` (H2) | proofs `h1-payout-race.test.ts`, `h2-payout-floor.test.ts` |
| Money engine | **COMPLETE** [chain] | Exactly-once `distributedAt` claim; commission chain global→center→teacher→room; Method 2 per-attending-student share; `session_settlements` witness | [distribution.ts:49-51,185](packages/server-core/src/services/finance/distribution.ts:49); proofs `room-pricing-methods.test.ts` (47), `money-distribution.test.ts` |
| Payout settlement to a bank | **MISSING** | Payouts are a ledger + approval workflow only. There is no disbursement integration — a human moves the money out of band. | `finance/payouts/*` |
| Invoicing | **PARTIAL** | `teacher_statement` invoices generate | Only from the unscheduled month-end cron, and the email leg misreports (§2.5) | [cron/jobs.ts:16-75](apps/www/src/lib/services/cron/jobs.ts:16) |
| Team / assistants | **COMPLETE** [surface] | Invite → shell account → claim; partial unique enforces one-teacher-per-assistant | `teacher/assistants/*` |

### 1.4 Assistant

Overall: real, and correctly built as delegation rather than a parallel app. Screens are deliberate reuse, not stubs.

| Journey | Grade | Notes | Evidence |
|---|---|---|---|
| Invite → claim → password | **COMPLETE** [chain] | Creator no longer types a password; account created `shell` + `passwordHash: NULL`; invitee sets their own once; re-inviting a claimed account is refused | [invite-token.ts](packages/server-core/src/services/invites/invite-token.ts); `me/credentials` |
| Login + routing | **COMPLETE** [chain] | — | — |
| Delegated actions | **COMPLETE** [chain] | `acting-teacher.ts` is default-closed; wallet/payouts/financial settings and managing other assistants excluded; every action audited as "assistant X on behalf of teacher Y" via `on_behalf_of` | [authz/acting-teacher.ts](packages/server-core/src/authz/acting-teacher.ts) |
| Attendance / door / grades / materials / collaborations | **COMPLETE** [surface] | Reuse the teacher screens under the delegation guard — correct, not lazy | `dashboard/assistant/*` pages import teacher features |
| Messaging | **COMPLETE** [chain] | Assistant messages **as themselves**, scoped by their principal. No impersonation — deliberate, so an adult never talks to a minor behind another identity. | `chat-scope.ts` EDGES |
| Nav i18n | **PARTIAL** | "My Centers" and "My Classes" fall through to raw English (§2.7) | [assistant/layout.tsx](apps/www/src/app/[locale]/dashboard/assistant/layout.tsx) |

### 1.5 Center admin (`center_admin`, routes `dashboard/admin/*`)

Overall: broad and real. This is the operational heart of the product and it is largely built.

| Journey | Grade | Notes | Evidence |
|---|---|---|---|
| Registration + onboarding | **COMPLETE** [chain] | `registerCenter()`; geocode persisted; `shortId` issued | [register/center/route.ts:42-62](apps/www/src/app/api/v1/auth/register/center/route.ts:42) |
| Rooms | **COMPLETE** [surface] | Profile, photos (magic-byte checked), per-room pricing + 3-way split with snapshot-on-create | [rooms.ts:52](apps/www/src/lib/services/rooms/rooms.ts:52); proof `room-revenue-split.test.ts` |
| **Walk-in registration** | **COMPLETE** [chain] | Creates the student account, captures guardian email-or-phone, never blocks on either, mints a single-use claim link, returns a copyable fallback, sets `guardian_contact_due_at`, flags `guardianEmailRequired` | [walk-in.ts:162-358](packages/server-core/src/services/walk-in/walk-in.ts:162) |
| Roster / students / teachers / classes | **COMPLETE** [surface] | Full CRUD + lookup | `roster/*`, `center/students`, `centers/me/*` |
| Enrollment requests | **COMPLETE** [surface] | — | `enrollment-requests/*` |
| Cash at counter + check-in | **COMPLETE** [chain] | `counterCheckin` returns a structured `needs_payment` error carrying `pricePerSession` and `courseTitle`, so the UI chains straight into payment. Two calls, one counter workflow — the Egyptian center pattern, correctly modelled. | [checkin.ts:195-205](packages/server-core/src/services/attendance/checkin.ts:195) |
| Counter check-in (lookup/suggest) | **COMPLETE** [chain] | Manual Student ID entry + session suggestion | [checkin.ts:37,102](packages/server-core/src/services/attendance/checkin.ts:37) |
| Collaboration (inbound) | **COMPLETE** [chain] | — | `collaboration.ts` |
| Wallet + payout request | **COMPLETE** [chain] | H1/H2 protections apply | `center/wallet/*` |
| Reports | **COMPLETE** [chain] | 977-line service, real Prisma aggregates, `centerStaff`/`MANAGER`/`ACCOUNTANT` authz per report | [reports.ts](packages/server-core/src/services/reports/reports.ts); `api/v1/reports/*` (8 endpoints) |
| Expenses | **COMPLETE** [surface] | Full CRUD | [expenses.ts:16-88](packages/server-core/src/services/expenses/expenses.ts:16) |
| Blacklist | **COMPLETE** [chain] | 3-level; reason required; `blacklist_cascade_actions` journals each withdrawal and restore replays it | [blacklist.ts:285-422](packages/server-core/src/services/blacklist/blacklist.ts:285); proof `h04-blacklist-cascade-reversal.test.ts` (44) |
| Staff management | **COMPLETE** [chain] | Invite/claim, preset sub-roles, default-closed exclusions | [center/staff.ts:56-382](packages/server-core/src/services/center/staff.ts:56); proof `center-staff-delegation.test.ts` (55) |
| Broadcast notifications | **COMPLETE** [surface] | `requireRole("center_admin")` → course-scoped fanout | [notifications/broadcast/route.ts:22-34](apps/www/src/app/api/v1/notifications/broadcast/route.ts:22) |
| Deletion requests | **COMPLETE** [surface] | list/approve/reject | [deletion-requests.ts:21-72](packages/server-core/src/services/center/deletion-requests.ts:21) |
| Settings | **PARTIAL** [surface] | Attendance mode, profile fields persist | Not chain-traced field by field; revenue split is deliberately **not** editable here |
| Nav i18n | **PARTIAL** | "Requests" untranslated | [admin/layout.tsx](apps/www/src/app/[locale]/dashboard/admin/layout.tsx) |

### 1.6 Center staff (`center_staff`, routes `dashboard/staff/*`)

Overall: a real mirror of the assistant pattern, correctly scoped by sub-role.

| Journey | Grade | Notes | Evidence |
|---|---|---|---|
| Invite → claim | **COMPLETE** [chain] | `center_staff_invite` purpose; shell account; set-once password; audited as `center_staff.invited` | `invite-token.ts`, `center/staff.ts` |
| Sub-role scoping | **COMPLETE** [chain] | `receptionist` / `manager` / `center_accountant` via one `center-actor.ts`; default-closed | [authz/center-scope.ts](packages/server-core/src/authz/center-scope.ts); proof `center-staff-delegation.test.ts` (55) |
| Check-in | **COMPLETE** [chain] | Same `counterCheckin` | — |
| Students / rooms / reports / finance | **COMPLETE** [surface] | Sub-role gated | `dashboard/staff/*` |
| Messaging | **COMPLETE** [chain] | receptionist → families; manager → whole center scope; **`center_accountant` reaches nobody** (that tier appears on no edge) | `chat-scope.ts` EDGES |
| On-behalf-of audit | **COMPLETE** [chain] | — | `on_behalf_of` column |

### 1.7 Superadmin + accountant (`apps/superadmin`)

Overall: real, and the read/write boundary is genuinely enforced — but decision #10's "generic auto-CRUD for every entity" was **not** built as described.

| Journey | Grade | Notes | Evidence |
|---|---|---|---|
| Login boundary | **COMPLETE** [chain] | `authorize()` accepts only `super_admin` + `accountant`; separate cookie names | proof `c04-login-boundary.test.ts` |
| **Accountant restriction (API layer, not nav)** | **COMPLETE** [chain] | `requireRole` gives `super_admin` a blanket bypass, then allow-lists. Every `admin/*` route names `"super_admin"` only, so an accountant is refused at the handler. The five routes with no `requireRole` are NextAuth, `me`, and three own-notification endpoints — session-only by design. | [require-role.ts:5-14](apps/superadmin/src/lib/authz/require-role.ts:5); route sweep |
| **Generic auto-CRUD for every entity** | **PARTIAL** | Route groups are targeted, not generic: `admin/centers` (85), `admin/catalog` (17), `teachers` (7), `messaging` (6), `students` (5), `points` (4), `platform` (3), `collaboration-requests` (3), `users` (2), `subscriptions` (2), `revenue-split` (2), `payment-intents` (2), `blacklist` (2), `audit-logs` (2). Rich for the entities that matter; **not** "every entity in the database" as decision #10 specified. | route inventory |
| Dashboard counters | **PARTIAL** [chain] | Real aggregates over real tables | Two defects: `platformKpis()` counts students/parents **without** `deletedAt: null` while `userGrowthChart` filters it — so the headline user count includes soft-deleted rows; and there is **no active-subscriptions counter**, which decision #10 required. | [platform-dashboard.ts:17](apps/superadmin/src/lib/services/admin/platform-dashboard.ts:17) vs [:65](apps/superadmin/src/lib/services/admin/platform-dashboard.ts:65) |
| Center oversight (read) | **COMPLETE** [chain] | Zero mutation verbs in the file; imports nothing that writes | [center-oversight.ts](apps/superadmin/src/lib/services/admin/center-oversight.ts) — `grep` for `.create(`/`.update(`/`.delete(` returns nothing |
| Center control (six ops) | **COMPLETE** [chain] | Mutation + one `audit_logs` row in the same `platformDb` transaction; import list contains no money service | [center-control.ts:1-40](apps/superadmin/src/lib/services/admin/center-control.ts:1) |
| Money read-only for superadmin | **COMPLETE in dev · ABSENT in prod config** [chain] — see **Finding 0** | The mechanism is real and fully implemented, but production connects as `neondb_owner` (BYPASSRLS), which makes all 56 RLS policies and every money REVOKE inert. Real DB `REVOKE`s, not a convention: `UPDATE, DELETE` revoked on `transactions`, `points_ledger`, `audit_logs`, `session_settlements`; `DELETE` revoked on `invoices`, `payouts`, `blacklist_cascade_actions`. Both apps connect as the same `edura_app` role. | [00000000000003_…/migration.sql:83-89](packages/database/prisma/migrations/00000000000003_integrity_sequences_indexes/migration.sql:83); [20260722100100_session_settlements/migration.sql:50](packages/database/prisma/migrations/20260722100100_session_settlements/migration.sql:50) |
| — `wallet_ledger` exception | **PARTIAL** | Honestly documented, not hidden: `GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_ledger` with **no** REVOKE. Immutability there is runtime-only (`immutableExtension`), so the guarantee is weaker than for the other ledgers. | [20260722000100_student_wallet/migration.sql:41,73](packages/database/prisma/migrations/20260722000100_student_wallet/migration.sql:41) |
| Audit-log viewer | **COMPLETE** [surface] | `/dashboard/superadmin/audit` + per-center Audit tab; opening a thread writes `messaging.thread_viewed` | `admin/audit-logs/*` |
| Finance (payouts) | **COMPLETE** [chain] | generate/approve/reject/settle/bulk-approve/receipt | proofs `c02-payout-generation.test.ts`, `h2-payout-floor.test.ts` |
| Finance (invoices) | **PARTIAL** [chain] | list/get/PDF are real | `sendInvoiceEmail` **hardcodes `{sent:true}`** and ignores the mail result — see §2.5 | [invoices.ts:132-146](packages/server-core/src/services/finance/invoices.ts:132) |
| Refunds | **COMPLETE** [chain] | Ledger refund with a partial unique preventing double-refund | proofs `refund.test.ts`, `h3-refund-race.test.ts`; **no gateway-side refund** (§2.2) |
| Commission / wallet settings | **COMPLETE** [surface] | Global row + resolve chain | proofs `commission-audit.test.ts`, `wallet-settings-admin.test.ts` |
| Messaging oversight | **COMPLETE** [surface] | Log search, read-only thread viewer, reports queue, blocks | `admin/messaging/*` (6 routes) |
| Catalog admin | **COMPLETE** [surface] | 17 routes over systems/stages/grades/tracks/subjects/offerings | `admin/catalog/*` |
| **Cron surface** | **STUBBED** | Six jobs, correctly auth'd (`CRON_SECRET` required in every env, no bypass; POST-only, GET alias removed) — and **nothing invokes them** | [cron/[job]/route.ts](apps/www/src/app/api/v1/cron/[job]/route.ts); proof `m7-cron-auth.test.ts` |
| Production config | **MISSING** | `.env.production` holds 3 keys — see finding #6. The M2/C1 fail-closed checks would refuse to serve. | [apps/superadmin/.env.production](apps/superadmin/.env.production) |
| Nav i18n | **PARTIAL** | 5 labels raw English: Collaborations, Commission, Messaging, Payments, Subscriptions | §2.7 |

### 1.8 What this section does not cover

Named so the confidence is legible:

- The **17 catalog routes** and the **85 `admin/centers` routes** were inventoried and sampled, not each read.
- **Center-admin settings** was not field-by-field traced.
- **Playwright specs** were inventoried, not read line by line.
- No journey was executed against a running app (read-only constraint), so every grade is a static-analysis grade. A screen that renders correct-looking data from a correct-looking query can still fail at runtime.

---

## 2. Mocked and unimplemented paths

### 2.1 Payments — where the boundary is

```
                        │ ── the seam ──
  client → /subscriptions/checkout   │
        → /payments/initiate         │
              ↓                      │
        PaymentIntent row  ← REAL ────┤
              ↓                      │
        resolveDriver()              │   ← THE ONLY DECISION POINT
         ├─ mock  → mockDriver       │   fake URL, self-signed webhook
         └─ sandbox|live → paymobDriver → THROWS (createCheckout)
                                     │   RETURNS {valid:false} (verifyWebhook)
        ─────────────────────────────┤
        POST /payments/paymob/webhook │
              ↓                      │
        processWebhookEvent  ← REAL ──┤  M1 atomic claim+settle, idempotent
              ↓                      │
        Payment + Transaction        │  REAL — ledger, points, notification,
        + points + notification      │  wallet credit, subscription activation
```

**Upstream of the seam is fake. Downstream of the seam is production-grade.** That asymmetry is the single most important fact about this codebase's payment readiness: the hard, dangerous part (money settling correctly, exactly once, atomically, idempotently) is built and proven. The part that is missing is the vendor conversation.

`resolveDriver()` — [gateway/index.ts:16](apps/www/src/lib/services/payments/gateway/index.ts:16):

```ts
return paymentsMode() === "mock" ? mockDriver : paymobDriver;
```

`sandbox` and `live` both get the stub. There is no mode in which a real gateway is contacted.

### 2.2 Has any code path ever run against real Paymob?

**No.** Evidence searched for, and not found:

| Looked for | Result |
|---|---|
| Non-empty `PAYMOB_*` in any env file | All four empty in `apps/www/.env.local`, `apps/www/.env.production`, `apps/superadmin/.env.local`; absent from `apps/superadmin/.env.production` |
| Any HTTP call to `accept.paymob.com` | Zero. The URLs exist only inside TODO comments at [paymob-driver.ts:30,35,42,53,55](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:30) |
| Recorded/fixture Paymob payloads in tests | None. `m1-webhook-atomicity.test.ts` uses `signMockWebhook` |
| An HMAC implementation to compare against | None — the field order is documented in a comment ([paymob-driver.ts:67-72](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:67)) but never coded |
| Docs or comments claiming a live/sandbox test | None. Every note says the opposite |

`CLAUDE.md` is consistent with this: Step 3 describes "EMPTY paymob driver stub … real API deliberately not integrated."

### 2.3 What is not implemented behind the mock

| # | Capability | State | Evidence / consequence |
|---|---|---|---|
| 1 | auth-token → order → payment-key → iframe/redirect | **MISSING** | Four TODOs; `createCheckout` throws `BusinessRuleError` — [paymob-driver.ts:58](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:58) |
| 2 | Webhook **receipt** (server POST) | **COMPLETE** as infrastructure | Route, rate-limit, raw-body capture, unknown-order 200, idempotent replay all real — [webhook/route.ts](apps/www/src/app/api/v1/payments/paymob/webhook/route.ts) |
| 3 | Browser **return/redirect** callback (the second, separate thing Paymob sends the user back through) | **MISSING** | No route exists. After paying, the user has nowhere to land. |
| 4 | HMAC signature verification | **MISSING** | `verifyWebhook` returns `{valid:false, error:"not implemented"}` → in sandbox/live **every** callback 401s at [webhook/route.ts:23](apps/www/src/app/api/v1/payments/paymob/webhook/route.ts:23) |
| 5 | Idempotency on repeated callbacks | **COMPLETE** | `updateMany where status:'pending'` takes a row lock; a concurrent second delivery blocks then sees 0 rows and no-ops — [payment-intents.ts:264](apps/www/src/lib/services/payments/payment-intents.ts:264) |
| 6 | Refund — ledger | **COMPLETE** | Partial unique `transactions_one_refund_per_payment` on `(reversal_of_id) WHERE type='refund'` (H3) |
| 7 | Refund — **at the gateway** | **MISSING** | Nothing calls Paymob to reverse a charge. A "refunded" card payment is refunded in our books only; the customer's card is never credited. **This is the most dangerous single gap** — it looks complete from the admin UI. |
| 8 | Partial payments / installments | **MISSING** | Amount is a single server-side snapshot; no partial-capture concept |
| 9 | Failed payments | **COMPLETE downstream, unreachable** | `processWebhookEvent` sets `status:'failed'` + `failureReason` — [payment-intents.ts:273-278](apps/www/src/lib/services/payments/payment-intents.ts:273). No real gateway can deliver that event. |
| 10 | Abandoned payments | **STUBBED** | `expirePaymentIntents` is a correct 4-line sweeper — [payment-intents.ts:392-400](apps/www/src/lib/services/payments/payment-intents.ts:392) — **and nothing runs it.** Pending intents accumulate forever. |
| 11 | Reconciliation (gateway ledger vs ours) | **MISSING** | No job, no report, no endpoint |
| 12 | Disputes / chargebacks | **MISSING** | No model, no state, no path |
| 13 | Payout/disbursement to teachers & centers | **MISSING** as an integration | Ledger + approval workflow only; a human moves money out of band |
| 14 | 3DS / SCA | **MISSING** | `is_3d_secure` appears only in the HMAC-order comment |
| 15 | Mobile wallets vs card | **MISSING** | `PaymentIntentMethod` has `card`/`wallet` and the checkout body accepts both; only the TODO distinguishes them |
| 16 | Amount units | **CONSISTENT, unverified against vendor** | Intent amount is integer minor units throughout; the TODO maps it to `amount_cents`. No `×100` conversion exists anywhere, which is correct **if** the whole app stores piastres. Not proven against a real Paymob order. |

### 2.4 If we set `PAYMENTS_MODE=live` tomorrow with real credentials — what breaks, in order

1. **Nothing breaks at boot.** `paymentsMode()` is called per request, not at startup, and `live` is a valid value. There is no startup validation that the four `PAYMOB_*` values are present. So the deploy looks healthy.
2. **First checkout attempt 500s / surfaces a business error.** [paymob-driver.ts:58](apps/www/src/lib/services/payments/gateway/paymob-driver.ts:58) throws `BusinessRuleError("Paymob driver not implemented yet — run with PAYMENTS_MODE=mock for now")`. Every student hitting "pay" gets that. This is loud and immediate — the *good* failure.
3. **Wallet top-ups die the same way**, same line, via `payments/wallet-topup/initiate`.
4. **Subscription checkout dies the same way**, via `initiateSubscriptionIntent`.
5. **Every webhook 401s.** [webhook/route.ts:23](apps/www/src/app/api/v1/payments/paymob/webhook/route.ts:23) returns `fail(401, "invalid_signature", "Paymob driver not implemented yet…")`. Paymob will retry, then give up, and the retry exhaustion is invisible to us — there is no dead-letter, no alert.
6. **`mock-complete` correctly 404s in production** — verified guard, `tests/unit/c1-payments-mode.test.ts`. So there is no back door.

**What would break silently and cost money** — the answers that matter more than the throw:

- **Nothing charges, so nothing is lost — today.** The throw at step 2 is a fail-closed. Credit where due: C1 did its job.
- **The moment the driver *is* written, refunds become the silent money leak.** The admin UI reports a successful refund, the ledger is correct, the customer's card is never credited (§2.3 #7). No test can catch it because no gateway call exists to assert on.
- **Abandoned intents never expire** (§2.3 #10), so `pending` grows without bound and any "pending revenue" figure drifts.
- **Reconciliation would never happen** (§2.3 #11), so a gateway-side settlement we never received a webhook for is invisible forever.

### 2.5 Email / SMTP — a hardcoded success return

`mailProvider()` defaults to `console` when unset, and console **delivers nothing** — [mail/send.ts:22](packages/server-core/src/mail/send.ts:22). Unlike `PAYMENTS_MODE`, there is **no production fail-closed**. A prod deploy that forgets `MAIL_PROVIDER` silently sends zero email.

| App / env | `MAIL_PROVIDER` | Real delivery? |
|---|---|---|
| `apps/www/.env.local` | `smtp` | **Yes** |
| `apps/www/.env.production` | `smtp` | **Yes** |
| `apps/superadmin/.env.local` | `console` | **No — silently nothing** |
| `apps/superadmin/.env.production` | *absent* → defaults to `console` | **No — silently nothing** |

And the result is not surfaced. [invoices.ts:132-146](packages/server-core/src/services/finance/invoices.ts:132):

```ts
await sendMail({ to: recipient.email, subject: `Your Edura invoice ${inv.invoiceNumber}`, html });
return { sent: true, to: recipient.email };     // ← hardcoded, ignores the result
```

So on superadmin — the app the accountant actually uses — clicking "send invoice" returns `sent: true` while `sendMail` returned `{sent:false}`. That is a hardcoded return standing in for a real outcome, on a money-facing surface.

It is swallowed twice more:

- [invoices.ts:108](packages/server-core/src/services/finance/invoices.ts:108) — `await sendInvoiceEmail(invoice.id).catch(() => {})`
- [cron/jobs.ts:56,68](apps/www/src/lib/services/cron/jobs.ts:56) — `} catch { }` around each statement, and the return counts **only successes**, so a run where every invoice failed reports `{teacherStatements: 0}` and looks like "nothing to do".

`notify()` also swallows every mail error, and every push error — four `.catch(() => {})` sites at [notify.ts:117,127](packages/server-core/src/services/notifications/notify.ts:117) (mail) and `:150,157` (FCM + web push). So a notification that reached nobody is indistinguishable from one that reached everybody.

### 2.6 WhatsApp — a real driver held back by credentials

Unlike Paymob, **the Cloud API driver is genuinely implemented**: real `fetch` to `graph.facebook.com/{version}/{phoneId}/messages`, correct template payload shape, HTTP-error and missing-message-id handling, network-error catch — [cloud-api-driver.ts:9-64](packages/server-core/src/services/whatsapp/cloud-api-driver.ts:9). With real credentials, outbound template sends would plausibly work on the first try.

`WHATSAPP_MODE=mock`, `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` empty in every env file.

| Aspect | State | Evidence |
|---|---|---|
| Seam | `resolveWhatsAppDriver()`, one line | [whatsapp/index.ts:19](packages/server-core/src/services/whatsapp/index.ts:19) |
| Send + log | **COMPLETE** | Row written `queued` **before** the provider call, updated with the outcome; login tokens masked in the log via `redactSecrets`; never throws on delivery failure so a registration can't roll back — [send.ts](packages/server-core/src/services/whatsapp/send.ts) |
| Outbound templates | **COMPLETE (driver) / MISSING (catalogue)** | **Only two templates exist**: `edura_walk_in_welcome`, `edura_student_code_reminder` — [templates.ts:17,25](packages/server-core/src/services/whatsapp/templates.ts:17). Even with credentials, WhatsApp covers the walk-in invite and a code reminder. Nothing else. |
| Template registration/approval at Meta | **MISSING** (manual by nature) | `docs/guides/whatsapp-templates.md` prepares them; approval is out-of-band |
| **Delivery / read status webhook** | **MISSING** | No inbound route exists anywhere. `WhatsAppMessageStatus` is `queued\|sent\|failed` — there is no `delivered`/`read` value, so status can never advance past the send call. |
| **Inbound messages / replies** | **MISSING** | A parent replying to a WhatsApp message reaches nobody |
| Opt-in / consent, 24-hour session window | **MISSING** | Not modelled |
| Retry | **MISSING** | One attempt, result recorded, done |
| Rate limits | **MISSING** | No throttle on the Meta side |
| Egyptian phone normalization | **COMPLETE** | `normalizeEgyptPhone` handles `01…`, `1…`, `201…`, `+201…`, `00201…`, spaces and dashes — [phone.ts](packages/server-core/src/services/whatsapp/phone.ts) |
| **Production fail-closed** | **MISSING — asymmetry with C1** | `whatsappMode()` silently returns `mock` for any unset/invalid value, in every environment — [types.ts:3-6](packages/server-core/src/services/whatsapp/types.ts:3). Payments hard-fails in prod on an ambiguous mode; WhatsApp does not. |

**If `WHATSAPP_MODE=live` tomorrow with real credentials:** nothing throws. Sends attempt for real. First failures would be Meta rejecting the two template names if they aren't approved under exactly those names — surfaced as `status:'failed'` + `error` on the row, visible in the superadmin log. That is a good failure mode. The unfixed gaps are the missing inbound webhook (no delivery confirmation, replies lost) and the missing template catalogue.

**What silently degrades today:** `INVITE_CHANNELS` defaults to `email`, so the WhatsApp leg returns `"skipped"` — deliberately distinguishable from `"failed"` — [deliver.ts:70](packages/server-core/src/services/invites/deliver.ts:70). This is handled honestly. Walk-in invites go by email; a phone-only minor gets the copyable link for in-person handover. Nothing is silently lost here.

### 2.7 Every other mock, stub, flag and hardcoded path

| Feature area | Item | Kind | Standing in for | Rank | Evidence |
|---|---|---|---|---|---|
| payments | `mockDriver` | mock driver | the Paymob conversation | **BLOCKS-LAUNCH** | [mock-driver.ts](apps/www/src/lib/services/payments/gateway/mock-driver.ts) |
| payments | `paymobDriver` | empty stub | the Paymob conversation | **BLOCKS-LAUNCH** | [paymob-driver.ts](apps/www/src/lib/services/payments/gateway/paymob-driver.ts) |
| payments | `mock-complete` endpoint | dev-only route | a gateway callback | RISKY-BUT-SHIPPABLE (prod 404 proven) | `payments/intents/[id]/mock-complete` |
| notifications | **`sendSms` has no implementation for any provider** — returns `{sent:false}` for `console` and warns "not implemented" for everything else | stub | an SMS gateway | **BLOCKS-LAUNCH** | [sms-channel.ts:7-19](packages/server-core/src/services/sms/sms-channel.ts:7) |
| notifications | **`invite_code_sent` is SMS-only** — `C(false, false, false, true)`: no in-app row, no push, no email. With SMS a no-op, this notification **delivers absolutely nothing, anywhere**. | dead channel | telling a walk-in student their code | **BLOCKS-LAUNCH** | [notify.ts:60](packages/server-core/src/services/notifications/notify.ts:60) |
| notifications | FCM: a real firebase-admin driver, inert because `FIREBASE_SERVICE_ACCOUNT_JSON` is empty — and in production it does **not even warn** (the warn is gated on `NODE_ENV !== "production"`) | real-but-inert | mobile push | RISKY-BUT-SHIPPABLE (web push covers the same matrix flag) | [fcm-channel.ts:62-66](packages/server-core/src/services/fcm/fcm-channel.ts:62) |
| notifications | Web push: real, VAPID keys set in www, **empty in superadmin** | misconfigured | superadmin push | POST-LAUNCH | `apps/superadmin/.env.local` |
| money / invoicing | `sendInvoiceEmail` returns hardcoded `{sent:true}` | hardcoded return | the actual delivery result | **BLOCKS-LAUNCH** | [invoices.ts:145](packages/server-core/src/services/finance/invoices.ts:145) |
| infra | **6 cron jobs, 0 schedulers** | unscheduled | a scheduler | **BLOCKS-LAUNCH** | §Findings #3 |
| infra | Rate limiter falls back to in-memory when `REDIS_URL` unset | graceful degradation | shared store | POST-LAUNCH (`REDIS_URL` **is** set) | `rate-limit/token-bucket.ts` |
| infra | `TRUSTED_CLIENT_IP_HEADER` empty, `TRUSTED_PROXY_HOPS=0` | unconfigured | real client IP behind a proxy | RISKY-BUT-SHIPPABLE — rate-limit buckets key on user id for chat, but IP-keyed limits will collapse to the proxy's IP | env |
| superadmin | `center-platform.ts:364` — a refusal deliberately left present "so the refusal is discoverable" | intentional non-implementation | nothing | NOISE (good practice) | [center-platform.ts:364](apps/superadmin/src/lib/services/admin/center-platform.ts:364) |
| materials & grades | **`/dashboard/teacher/assignments` and `/dashboard/assistant/grades` both render `TeacherGradebookScreen`** | route alias | an assignments feature | RISKY-BUT-SHIPPABLE (misleading nav) | [teacher/assignments/page.tsx](apps/www/src/app/[locale]/dashboard/teacher/assignments/page.tsx) |
| i18n | **12 nav labels fall through to raw English.** `tNav()` is `NAV_KEY[label] ? t(...) : label` — an unmapped label silently renders English. www: *Child Progress, Family, Fees & Payments, My Centers, My Children, My Classes, Requests*. superadmin: *Collaborations, Commission, Messaging, Payments, Subscriptions*. **Three of the four parent nav items are affected** — on an Arabic-first product whose parent users are the least likely to read English. | silent fallback | translations | RISKY-BUT-SHIPPABLE | [dashboard-shell.tsx:208](apps/www/src/components/refine/dashboard-shell.tsx:208) (`tNav`), `NAV_KEY` at `:54` |
| descoped (inert by decision) | `ChatbotConfig`/`ChatbotFaq`/`ChatbotConversation` models + `BotType` enum | schema-only, no logic | the descoped AI bot | NOISE (deliberate) | schema; `CLAUDE.md` Descoped §1 |
| descoped (inert by decision) | `PaymentMethod.online_fawry`, `EntityType.shadow` | unreachable enum values | out-of-scope gateway / "no shadow centers" | NOISE (deliberate) | §6 |

**Launch-blocking shortlist**, in order:

1. Paymob driver — both methods (§2.1–2.4)
2. Gateway-side refund (§2.3 #7) — the one that looks done and isn't
3. A scheduler for the six cron jobs (Findings #3)
4. `sendSms` — implement or remove, and re-route `invite_code_sent` off a dead channel (§2.7)
5. `sendInvoiceEmail`'s hardcoded `{sent:true}` (§2.5)
6. `apps/superadmin/.env.production` (Findings #6)
7. `.env.test` + a runnable aggregate test command + CI (Findings #4, #5)

---

## 3. TODO inventory

**The headline is the absence.** This codebase is remarkably free of debt markers — which means *incompleteness here is structural, not signposted*. You cannot find the holes by grepping for TODO. That is precisely why this audit had to trace chains.

| Marker | Total (non-test src, excl. generated) | Assessment |
|---|---|---|
| `TODO` | **5** | **All five are in `paymob-driver.ts`.** Nowhere else in 318k LOC. |
| `FIXME` | 0 | — |
| `HACK` | 0 | — |
| `XXX` | 5 | **All false positives** — Egyptian phone-format docs (`01XXXXXXXXX`) in `validation/common.ts:19`, `whatsapp/phone.ts:4-6`, `whatsapp/types.ts:15` |
| `@ts-ignore` | **0** | — |
| `@ts-expect-error` | **0** | — |
| `: any` | 122 | See below |
| `as any` | 79 | See below |
| empty `catch {}` | **12** | See below |
| `"not implemented"` | 3 | `sms-channel.ts:17`, `paymob-driver.ts:20`, `center-platform.ts:364` (intentional) |
| `placeholder` | 190 | ~all HTML `placeholder=` attributes. Non-attribute hits are component props and one comment. **No fake data found.** |

**Empty catch blocks — grouped by area, ranked:**

| Area | Location | What it swallows | Rank |
|---|---|---|---|
| money / invoicing | [cron/jobs.ts:56](apps/www/src/lib/services/cron/jobs.ts:56) | every teacher-statement generation+email failure; the return counts only successes | **BLOCKS-LAUNCH** |
| money / invoicing | [cron/jobs.ts:68](apps/www/src/lib/services/cron/jobs.ts:68) | same, for center statements | **BLOCKS-LAUNCH** |
| notifications | [notifications-screen.tsx:98,115](apps/www/src/features/notifications/notifications-screen.tsx:98) | mark-read failures — the badge desyncs silently | POST-LAUNCH |
| auth | [login/page.tsx:117](apps/www/src/app/[locale]/login/page.tsx:117) | a post-login side effect | POST-LAUNCH |
| auth / routing | [dashboard/page.tsx:28,39,63](apps/www/src/app/[locale]/dashboard/page.tsx:28) | role-dispatch lookups; a failure silently falls through to a default route | RISKY-BUT-SHIPPABLE |
| onboarding | [student-family-code-screen.tsx:115](apps/www/src/features/student/student-family-code-screen.tsx:115) | family-code submit error | POST-LAUNCH |
| public pages | [[id]/page.tsx:144](apps/www/src/app/[locale]/[id]/page.tsx:144) | short-id resolution | POST-LAUNCH |
| UI | `theme-mode-provider.tsx:65` ×2 apps | `localStorage` access | NOISE (correct) |

Plus the semantically-equivalent `.catch(() => {})` swallows: [invoices.ts:108](packages/server-core/src/services/finance/invoices.ts:108) (invoice email), [notify.ts:117,127,150,157](packages/server-core/src/services/notifications/notify.ts:117) (all notification mail **and** all push), [sms-channel.ts](packages/server-core/src/services/sms/sms-channel.ts) (`smsToUser`).

**`any` usage — grouped, ranked:** 201 total. Concentrated in three benign classes: (a) Refine `useList` result destructuring in feature screens, (b) the deliberate `firebaseAdmin: any` with an eslint-disable at [fcm-channel.ts:23](packages/server-core/src/services/fcm/fcm-channel.ts:23), (c) `body?.error?.message` on external JSON at [cloud-api-driver.ts:47](packages/server-core/src/services/whatsapp/cloud-api-driver.ts:47). The one worth fixing is in the assignments screen — `(g: any)` plus `g.id || g._id`, a pre-Prisma leftover reading a Postgres row ([assignments-screen.tsx:32,38](apps/www/src/features/student/assignments-screen.tsx:32)). **No `any` was found on a money, authz, or persistence path.** Rank: POST-LAUNCH.

---

## 4. The "awaiting review" work

Both bodies of work are committed. Judged as they stand.

### 4.1 Email invites + guardian channel

**Actually finished** (claim verified in code):

| Claim | Verdict | Evidence |
|---|---|---|
| One claim kernel with a `CLAIMABLE` purpose→role table, so a token minted for one role cannot open another | ✅ | `invite-token.ts` |
| Email-first; `INVITE_CHANNELS` env set, default `email`; WhatsApp leg returns `skipped` not `failed` | ✅ | [deliver.ts:27-35,70](packages/server-core/src/services/invites/deliver.ts:27) |
| Guardian recipient resolution, strictest-trust first, **no fallback to a minor's own inbox** | ✅ | [recipient.ts:39-77](packages/server-core/src/services/invites/recipient.ts:39) |
| The child-safety gate is enforced in **all three** claimed places from **one** predicate | ✅ | `assertCanReach` [chat-scope.ts:937](packages/database/src/queries/chat-scope.ts:937); `listContacts` via `guardianFilter` [chat-scope.ts:1024](packages/database/src/queries/chat-scope.ts:1024); group posting [chat-groups.ts:329](packages/database/src/queries/chat-groups.ts:329) |
| A guardian **phone** does not satisfy the gate | ✅ | [chat-guardian.ts](packages/database/src/queries/chat-guardian.ts) `decide()`: `hasGuardianChannel = viaParent \|\| !!profile?.guardianEmail` |
| Default-closed: no profile row ⇒ minor ⇒ locked; unknown ids included in the locked set, never dropped | ✅ | `isGuardianChannelLocked`, `guardianLockedStudentIds` |
| `parent` is not an adult role, so a child is never cut off from their guardian | ✅ | `ADULT_ROLES` |
| The lock never suspends the account — classes, materials, grades, wallet, login all work | ✅ | gate is inside chat only |
| Timeout escalates, never punishes; `guardian_contact_due_at` never reset by a re-send | ✅ | [recipient.ts:83-88](packages/server-core/src/services/invites/recipient.ts:83) |
| Migrations additive only, no backfill | ✅ | `20260725100000`, `20260725100100` |

**Half-built:**

1. **The escalation half of item 6 never fires.** `guardian-contact-reminders` is a real, idempotent cron job — and nothing schedules it. So: periodic reminders never send, the banner never becomes non-dismissable, and the owning center is never notified. The *lock* works; the *escalation* is dead code. This is the single largest gap in this work item.
2. `CLAUDE.md` places the claim kernel at `apps/www/src/lib/services/invites/invite-token.ts`. It is at `packages/server-core/src/services/invites/invite-token.ts`. **Doc path is stale** — harmless, but it means the doc was not re-checked after the kernel move.
3. Guardian email is stored, not verified — acknowledged in the doc, but it means a student can satisfy a child-safety gate with a friend's address.

**Tested:** `apps/www/tests/db/invite-claim.test.ts` exists and is substantial (31 cleanup-related statements, exits non-zero on failure). `CLAUDE.md` claims 107/107. **I could not verify that number and neither can anyone else right now** — the suite is launched via `tsx --env-file=.env.test` and there is no `.env.test` (Finding #4). The assertion *style* across these suites is a hand-rolled `assert(cond, msg)` with pass/fail counters and `process.exit(fail === 0 ? 0 : 1)` — real assertions, correctly failing the process, not vacuous.

**Planned and never written:**

- **Confirm-by-click verification of the guardian address** — explicitly named as the recommended follow-on and deliberately skipped (`CLAUDE.md` item 9).
- **An SMS/WhatsApp guardian channel.** `guardianPhone` is captured and stored specifically for this, and there is no channel to use it. `sendSms` is unimplemented (§2.7), so the phone-only minor case has no future path today, only a stored value.
- OTP / phone verification — out of scope by decision #5, still absent.

**Verdict: reviewable and acceptable, with one required follow-up.** The safety logic is genuinely well built — one predicate, three enforcement points, default-closed, and the drift test design (set-equality between gate and directory) is the right idea. Sign it off **conditional on scheduling `guardian-contact-reminders`**, because right now the design's promise ("escalates, never punishes") is only half-delivered: it punishes (locks) and never escalates.

### 4.2 Superadmin center oversight

**Actually finished:**

| Claim | Verdict | Evidence |
|---|---|---|
| Two modules, one boundary: oversight READS, control ACTS | ✅ | `center-oversight.ts` contains **zero** mutation verbs; `center-control.ts`'s import list contains **no** money service |
| Read visibility across all six money ledgers + cached balance + `centerStatement` | ✅ | `center-oversight.ts`; `admin/centers/[id]/oversight/*` |
| NULL-`centerId` rows are teacher-direct and never folded into a center's books | ✅ | documented and implemented as the scoping rule |
| Six control ops, each writing one `audit_logs` row in the **same** transaction | ✅ | [center-control.ts:22-32](apps/superadmin/src/lib/services/admin/center-control.ts:22) |
| `on_behalf_of` left NULL on purpose | ✅ | a super admin acts as themselves |
| **Money is read-only, and superadmin is not exempt** | ✅ | Real `REVOKE`s, verified in migration SQL: `UPDATE, DELETE` on `transactions`, `points_ledger`, `audit_logs`, `session_settlements`; `DELETE` on `invoices`, `payouts`, `blacklist_cascade_actions`. Both apps use the same `edura_app` role; `platformDb` only sets `app.bypass_rls`, which RLS reads and GRANTs do not. |
| Revenue split / commission % excluded from the center-profile allowlist | ✅ | `.strict()` allowlist |
| Deactivation reuses C-03 (`sessionRevocationExtension` bumps `token_version` in the same statement) | ✅ | — |
| The only enrolment-removing op routes through H-04 `centerBlacklistStudent` | ✅ | `center-control.ts` imports exactly that |
| Shared-kernel move with www re-export shims | ✅ | `collaboration.ts` etc. now under `@repo/server-core`; www re-exports |
| Audit-log viewer exists | ✅ | `admin/audit-logs/*` + per-center tab |
| No migration was required | ✅ | no new migration in the range |

**Half-built:**

1. **`wallet_ledger` is not REVOKEd.** The migration explicitly `GRANT`s `UPDATE, DELETE` on it. Immutability is runtime-only. `CLAUDE.md` reports this honestly rather than overclaiming — credit for that — but the claim "superadmin moves no money" is one table weaker than it reads.
2. **Roadmap decision #10 is only partly satisfied by this work.** The audit-log viewer landed. "Generic auto-CRUD screens for **every** entity" did not — the route groups are targeted (§1.7). And the dashboard-home counters are missing the required **active-subscriptions** counter, plus `platformKpis()` omits the `deletedAt: null` filter that `userGrowthChart` applies, so the headline user counts include soft-deleted rows ([platform-dashboard.ts:17](apps/superadmin/src/lib/services/admin/platform-dashboard.ts:17)).
3. **The whole app is unshippable as configured** — `.env.production` has three keys (Finding #6). Not a defect in this work item, but it gates it.

**Tested:** `apps/superadmin/tests/db/center-oversight.test.ts` exists; `CLAUDE.md` claims 119/119. Same caveat as §4.1 — unrunnable today. Note also that `apps/superadmin` has **no `vitest.config.ts` and no `test` script at all**; its only test entry points are hand-listed `test:db:*` scripts, and `test:db` runs exactly one file (`refund.test.ts`) out of eighteen.

**Planned and never written:** superadmin live chat, dropped by decision #1 (broadcast notifications only) — correctly absent.

**Verdict: reviewable and acceptable as scoped.** The read/write boundary is real and, as intended, checkable by reading one import list — that design choice paid off and I verified it in about a minute. What is *not* done is the rest of decision #10 (generic CRUD breadth, the subscriptions counter). Sign off the oversight work; keep #10 open.

---

## 5. Test reality

### 5.1 The shape of the suite

| Kind | Count | Runner | Runnable today? |
|---|---|---|---|
| www unit | 13 files | vitest (`include: ["tests/unit/**/*.test.ts"]`) | **Yes** |
| www DB | 20 files | standalone `tsx --env-file=.env.test` scripts | **No** — Finding #4 |
| superadmin DB | 18 files | standalone `tsx --env-file=.env.test` scripts | **No** — Finding #4 |
| superadmin unit | **0** | no `vitest.config.ts`, no `test` script | n/a |
| Playwright | 7 specs | `npx playwright test` | Needs a running app |

The DB suites are **not vitest tests.** They are scripts with a hand-rolled harness:

```ts
function assert(cond: boolean, msg: string) { cond ? (pass++, log("✓")) : (fail++, error("✗")) }
…
process.exit(fail === 0 ? 0 : 1);
```

That is where the `119/119`, `107/107`, `87/87` numbers come from. To its credit, the harness **does** exit non-zero on failure (verified across all 38 files: every one calls `process.exit`), so a failing run cannot be mistaken for a pass.

### 5.2 Coverage per feature area

| Area | Grade | Proof |
|---|---|---|
| auth & session | **PROVEN** | `l1-session-invalidation` (12), `rbac-isolation` (11), `c03-status-revocation` (www 26 + superadmin 15), `c04-login-parity`/`c04-login-boundary` (72 + 26), `c04-login-allowlist`, `m2-secrets` |
| money engine | **PROVEN** — the best-covered area in the product | `run-db-tests` (distribution, exactly-once, no-attendance), `c01-lesson-settlement`, `money-distribution`, `room-pricing-methods` (47), `room-revenue-split`, `center-share-governance`/`center-share-admin`, `commission-audit`, `c02-payout-generation`, `h1-payout-race`, `h2-payout-floor` |
| refunds | **PROVEN** | `refund`, `h3-refund-race`, `wallet-refund` — **all ledger-side only; no gateway** |
| wallet | **PROVEN** | `wallet`, `wallet-no-cap`, `wallet-settings-admin` |
| payments (webhook/intent) | **THIN** | `m1-webhook-atomicity` + `c1-payments-mode`. Both exercise the **mock** path. Zero coverage of the real gateway, because there is none to cover. |
| messaging & chat safety | **PROVEN** | `messaging-scope` (87), `messaging-matrix` (12) |
| invites & guardian | **PROVEN** *(as written)* | `invite-claim` (107), `m5-send-invite-ownership`, `mail-password-reset` |
| attendance | **PARTIAL** | `offline-sync` covers the sync path; counter/door staging is covered only incidentally |
| center operations | **PROVEN** | `center-staff-delegation` (55), `h04-blacklist-cascade-reversal` (44), `room-ownership`, `center-{people,academic,operations,money,platform}` |
| superadmin oversight | **PROVEN** *(as written)* | `center-oversight` (119) |
| onboarding & catalog | **PARTIAL** | `catalog-onboarding`, `onboarding-steps`, `second-language-scoping`, `registration-doors` |
| collaboration requests | **UNPROVEN** | **No dedicated test file.** Acceptance is a multi-table transaction with conflict rollback — the riskiest untested thing in the codebase. |
| materials & grades | **UNPROVEN** | Only `m6-materials-magic-bytes` (a validation unit test). No CRUD/authz coverage. |
| notifications | **UNPROVEN** | No test for the channel matrix, the fanout, or delivery |
| reports & analytics | **UNPROVEN** | A 977-line service with zero tests |
| subscriptions & enrolment | **PARTIAL** | Covered incidentally by money tests; no dedicated checkout/coverage/cancel suite |
| assignments | n/a | nothing to test |
| i18n & UI | **UNPROVEN** | No parity test — which is why 12 untranslated nav labels went unnoticed |
| cron jobs | **THIN** | `m7-cron-auth` proves the *auth*; nothing proves any job's *behaviour* |

### 5.3 Tests that only pass because a mock hides the real path

**The vitest alias.** `apps/www/vitest.config.ts:5-9` sets exactly one alias:

```ts
resolve: { alias: { "@": fileURLToPath(new URL("./src/", import.meta.url)) } }
```

That is a **path** alias, not a module substitution — it does not stub anything. The real hiding is elsewhere and is structural:

1. **`include: ["tests/unit/**/*.test.ts"]`** — the 20 DB suites are outside vitest's include glob. `bun run test` in `apps/www` reports success having run **13 of 33** suites. That is the mechanism by which a green `bun run test` means much less than it appears to.
2. **`PAYMENTS_MODE` defaults to `mock`** outside production ([types.ts:74](apps/www/src/lib/services/payments/gateway/types.ts:74)), so every payment test runs against `mockDriver`. `m1-webhook-atomicity` asserts on a webhook the test itself signed with `signMockWebhook`. The atomicity claim is genuinely proven; the *gateway* claim is proven about nothing.
3. **`MAIL_PROVIDER` defaults to `console`**, which returns `{sent:false}` and never throws. A test asserting "the invite was sent" that calls `sendInvoiceEmail` would pass on the hardcoded `{sent:true}` (§2.5) regardless. **This is a second instance of the same class as the alias problem, and it is on a money surface.**
4. **`whatsappMode()` defaults to `mock`**, so every WhatsApp assertion is about `mockWhatsAppDriver`.
5. **The rate limiter falls back to in-memory** without `REDIS_URL`, so `m3-rate-limit` proves the in-memory bucket, not the shared store that production uses.
6. **`FIREBASE_SERVICE_ACCOUNT_JSON` unset ⇒ `sendFcmBatch` returns `[]` silently.** Any notification test would pass with zero pushes delivered.

I found no `vi.mock`, no `__mocks__` directory, and no injected fakes. The hiding here is entirely via **env-defaulted driver selection**, which is a cleaner design than mocks but has the same epistemic cost: the tests prove the mock's behaviour.

### 5.4 Weak assertions

I read the harness and sampled bodies. The `assert(cond, msg)` style is used consistently and the conditions are real (`empty.distributed === false && empty.reason === "no_present_students"`, `s2after?.distributedAt == null`). I found **no** test with zero assertions and **no** `.only`. What I did find:

- **Cleanup is inconsistent.** Nine of 38 suites have no cleanup statement at all and leave rows behind: `wallet`, `wallet-no-cap`, `room-ownership`, `center-share-governance`, `center-share-admin`, `commission-audit`, `room-revenue-split`, `wallet-refund`, `wallet-settings-admin`. Several of those write to money tables.
- **No aggregate runner.** `www test:db` runs 1 of 20 files; `test:db:all` runs 4. `superadmin test:db` runs 1 of 18. Sixteen www suites and seventeen superadmin suites are only reachable by hand-typing a path. **A suite nobody has a command for is a suite nobody runs.**
- **Hardcoded seed UUIDs.** `CLAUDE.md` notes `h1`/`h2` hardcode seed UUIDs that must pre-exist — so those two are coupled to database state, not self-contained.

### 5.5 Which database do the DB tests hit?

They hit **whatever `.env.test` points at — and there is no `.env.test`**, so today they hit nothing; they fail at process start.

This is worth reading in context, because the guard around it is one of the better things in the repo. [`db-guard.ts`](packages/database/scripts/db-guard.ts) records the environment **inside the database** as a comment on the database object (`COMMENT ON DATABASE neondb IS 'edura-env:production'`) and fails closed on an unlabelled database. Its header documents why:

> on 2026-07-23 dev, tests, and (as documented) production all resolved to ONE Neon database, because every context read the same `.env.local`. 330 `@x.io` users and 83 unflagged centers were written into what was meant to be the launch database by test runs alone.

So: the tests **did** hit the launch database, that was **not** intentional, and the fix is structural and correct — an assertion no copied connection string can defeat. Every `test:db*` script runs `pretest:db` (`db-guard test`) first.

The residual risk is not "which DB" any more — it is that (a) the guard's own gate file is absent so nothing runs, (b) nine suites leak rows into whichever branch does get used, and (c) there is no committed `.env.test.example` to recreate the file from, despite `.gitignore:11` stating that `.env.example` files are the committed secret-free copies. **No `.example` file exists anywhere in the repo.**

### 5.6 Playwright and CI

- 7 specs: `auth`, `navigation`, `role-guard`, `admin-students`, `parent-portal`, `student-dashboard`, `teacher-gradebook`. Scoped like smoke tests, not journey tests. They need a running app and, presumably, seeded credentials (`docs/guides/test-credentials.md`).
- `apps/www/test-results/` holds **83 entries dated 13 July** — stale output from a run ~13 days before this audit. No evidence of a Playwright run since.
- **CI: none.** No `.github/workflows`, no pipeline file of any kind, no pre-commit hook. Every "green" claim in `CLAUDE.md` is a manual local run, on one machine, at one moment, and today unreproducible.

---

## 6. Data model gaps

67 models, 56 enums. Reading them against the journeys.

### 6.1 Missing models — features the schema proves are unbuilt

| Absent | What it means |
|---|---|
| `Assignment` / `Submission` / `Homework` / `Quiz` | **No assignments feature exists.** Confirmed: `grep -E '^model .*(assign\|submis\|homework\|quiz\|exam)'` → nothing. `homework_deadline` is a declared notification type with no producer; `MaterialType.homework` is the closest thing, and it is a file-type tag. |
| Any dispute / chargeback model | No gateway dispute handling (§2.3 #12) |
| Any reconciliation / gateway-statement model | No reconciliation (§2.3 #11) |
| Any parent-payment linkage | Consistent with §1.2 — parents cannot transact |

### 6.2 Never-written models

| Model | Status |
|---|---|
| `ChatbotConfig`, `ChatbotFaq`, `ChatbotConversation` | **Deliberately inert** — `CLAUDE.md` Descoped §1. Confirmed no logic wired. Removing them is a migration and correctly not done. |

I found no *unintentionally* dead model. Every other one has a create path.

### 6.3 Enum values never assigned

Method: for each value, count string literals in non-generated, non-test source, then look for a field-assignment site. `assign=0` with `prod-lits>0` means "the value is read/filtered but I found no site that sets it" — a strong lead, not a proof, since a value can arrive via a validated request body as a variable. I have marked the confidence.

| Enum · value | Confidence | What the gap implies |
|---|---|---|
| `TransactionStatus.reversed` | **High** — 2 literals total (schema + type) | Nothing ever reverses a transaction. Refunds create a **new** `type:'refund'` row instead. So the ledger has a state it can never enter — dead vocabulary, and a reader could reasonably expect reversal semantics that don't exist. |
| `InvoiceStatus.void` | **High** — 1 literal (schema only) | **No void-invoice path.** An invoice issued in error cannot be voided from any surface, and `DELETE` on `invoices` is REVOKEd. It is permanent. |
| `SessionStatus.ongoing` | **High** — 2 literals | No session ever enters "in progress". Sessions jump `scheduled → completed`. Any live-session UI would have nothing to read. |
| `CourseStatus.ended` | **High** — 3 literals | **Courses never end.** There is no lifecycle transition to `ended`, so a finished course stays `active` forever — which feeds every "active courses" count and every roster query. |
| `GroupKind.center_announcement` | **Medium** — 7 literals, no assignment site | The center-announcement group kind exists in the schema and the type, and I found no creation path. Center-wide announcements go through `notifications/broadcast` instead. Likely a planned-and-skipped surface. |
| `PaymentMethod.online_fawry` | **High** | Descoped by decision #7. Deliberate. |
| `EntityType.shadow` | **High** — 1 literal | Deliberate: decision #2 says "NO shadow centers". Good — the schema value is vestigial, not a trap. |
| `EntityType.external` | **Medium** | 9 literals, no assignment site found |
| `BotType.support`, `BotType.academic` | **High** | Descoped. Deliberate. |
| `ReportStatus.reviewing/actioned/dismissed` | **Low** — likely false positives | The superadmin reports queue almost certainly sets these from a validated body variable. Flagged for confirmation, not asserted. |
| `AttendanceStatus.absent/late/excused/counter_only` | **False positive** | These are certainly set — `counter_only` is derived at [checkin.ts:223](packages/server-core/src/services/attendance/checkin.ts:223) via a variable, and `bulkMarkAttendance` takes a status parameter. My heuristic missed variable assignment. Listed here so the method's limits are visible. |
| `ExpenseCategory.*`, `ReportCategory.*`, `DevicePlatform.*`, `MaterialStorage.*` | **False positives** | All arrive as validated request-body variables |

### 6.4 Fields declared but never written

| Field | Finding |
|---|---|
| **`Review.lessonId`** | **Never written.** [reviews.ts:65-73](apps/www/src/lib/services/reviews/reviews.ts:65) omits it, and it *cannot* be used: `@@unique([studentId, teacherId])` at [schema.prisma:1384](packages/database/prisma/schema.prisma:1384) permits one review per student-teacher pair, so per-lesson ratings are structurally impossible. The schema comment at line 1378 says "for per-lesson ratings (PRD)" — a PRD feature declared, contradicted by its own constraint, and never built. |
| `StudentProfile.guardianPhone` | Written (walk-in counter captures it) and read (the guardian banner shows it) but **there is no channel that can use it** — §4.1. A stored value awaiting a feature. |
| `User.fcmToken` + `UserDeviceToken.token` | Written and read correctly, but `sendFcmBatch` returns `[]` with no credentials, so the tokens are collected and never used (§2.7). |
| `guardianContactDueAt` | Written on discovery, read by the banner and the gate state — but the *escalation* that gives it meaning never runs (§4.1). |

### 6.5 Modelling smells

| Smell | Detail |
|---|---|
| **Soft-delete inconsistency** | `platformKpis()` counts `user` rows with **no** `deletedAt: null` filter, while `userGrowthChart` in the *same file* filters `deleted_at IS NULL` — [platform-dashboard.ts:16-20](apps/superadmin/src/lib/services/admin/platform-dashboard.ts:16) vs `:63`. The dashboard headline count and the growth chart disagree by construction. `CLAUDE.md` names this bug class "the soft-delete trap"; here is a live instance in the superadmin dashboard. |
| **Cached balance vs derived ledger** | `TeacherProfile.walletBalance` / `Center.walletBalance` are cached columns beside an append-only ledger. Protected by H2 (conditional decrement + DB `CHECK >= 0`) and reconciled at settlement — but the centers `CHECK` is `NOT VALID` pending a `VALIDATE` after the Step 9 wipe, so one legacy negative row is tolerated. Known and tracked. |
| **`wallet_ledger` mutability** | The only money table with `GRANT … UPDATE, DELETE` and no REVOKE (§4.2). Runtime-only immutability. |
| **Pre-Prisma residue** | `g.id || g._id` in [assignments-screen.tsx:38](apps/www/src/features/student/assignments-screen.tsx:38) — reading a Postgres row through a legacy `_id` fallback. Cosmetic, but it marks the assignments screen as the least-touched code in the app. |

### 6.6 What the gaps imply

Read together, the schema tells a consistent story:

- **`SessionStatus.ongoing` + `CourseStatus.ended` never reached** ⇒ there is no lifecycle *closing* logic anywhere. Things get created and completed; nothing is retired. Combined with `expire-subscriptions` and `expire-collaboration-requests` never running (Finding #3), **the entire "things end" half of the domain is written but never executed.**
- **`Review.lessonId` + `GroupKind.center_announcement` + `homework_deadline`** ⇒ three PRD surfaces were designed into the schema and then not built.
- **`guardianPhone` + `User.fcmToken` + `invite_code_sent`** ⇒ two delivery channels were designed for, plumbed to the storage layer, and left without a driver.
- **`TransactionStatus.reversed` + `InvoiceStatus.void` never reached** ⇒ there is no correction path for money mistakes. Every ledger row and every invoice is permanent from the moment it is written. That is defensible as a design (append-only), but it means an operational error has no in-product remedy.

---

## 7. The verdict

### How done is the product logic?

**≈ 72%.**

Defending the number. I am scoring *product logic* — domain rules, authorization, persistence, money correctness — not screens and not polish. Weighted by how much of the product each area carries:

| Area | Weight | Done | Contribution | Why |
|---|---|---|---|---|
| Auth, session, RBAC, registration doors | 8% | 95% | 7.6 | Real, proven, revocation works |
| Catalog + onboarding (all roles) | 7% | 95% | 6.7 | Config-driven, track auto-assign works |
| Money engine (fees, commission, distribution, splits, settlements) | 14% | 95% | 13.3 | The best work in the repo. Exactly-once, race-proofed, heavily tested |
| Subscriptions + enrolment + coverage | 8% | 85% | 6.8 | Real; expiry job unscheduled |
| Wallets (student/teacher/center) | 6% | 90% | 5.4 | Real; online top-up gated on the gateway |
| **Payments to real money** | **12%** | **20%** | **2.4** | Downstream real, gateway absent, refund/reconciliation/disputes absent |
| Attendance + check-in + offline sync | 8% | 95% | 7.6 | Both modes, staging, sync — all real |
| Messaging + chat safety + oversight | 9% | 95% | 8.6 | Excellent. One predicate, three enforcement points |
| Center operations (rooms, staff, walk-in, blacklist) | 8% | 92% | 7.4 | Broad and real |
| Collaboration requests | 4% | 90% | 3.6 | Real; **zero test coverage** |
| Materials, grades, reviews, expenses, reports | 7% | 85% | 6.0 | Real CRUD; reviews' per-lesson field unusable; untested |
| Superadmin + accountant + audit | 6% | 80% | 4.8 | Real, boundary enforced; decision #10 breadth incomplete; unshippable env |
| Notifications + delivery channels | 5% | 45% | 2.3 | In-app + web push real; FCM inert; SMS nonexistent; one type delivers nothing |
| Invoicing | 3% | 55% | 1.7 | Generates; hardcoded `{sent:true}`; unscheduled; no void |
| **Assignments / homework** | **3%** | **0%** | **0.0** | Does not exist; routes are aliases |
| Operational runtime (scheduler, CI, runnable tests) | 5% | 15% | 0.8 | 6 jobs unscheduled, no CI, `.env.test` absent |
| i18n | 2% | 90% | 1.8 | Full parity; 12 nav labels leak English |
| **Total** | **100%** | | **≈ 72%** | |

Two honest caveats on that number, in both directions:

- **It may be generous.** Roughly half of the "done" areas are graded **[surface]** — I confirmed route → service → persist, not every branch, and nothing was executed against a running app. And "proven" leans on 38 test suites that **cannot currently be run**. If those numbers in `CLAUDE.md` don't reproduce, several 95%s move.
- **It may be harsh on the hard part.** The genuinely difficult, dangerous engineering — exactly-once settlement, refund races, payout floors, session revocation, a default-minor child-safety gate, DB-level money immutability — is *finished and well done*. That is the work that usually eats the last 30% of a project, and here it is behind you.

### Is payments a third of the remaining work?

**Yes — and that is the right way to say it.** Of the ~28 points remaining, payments-and-money-adjacent accounts for **~9.6 points, about a third**: the gateway itself (9.6 of the 12-point payments weight is undone), plus gateway refunds, plus reconciliation, plus disputes, plus the failed/abandoned/partial paths that exist as unreachable code today. And it is the *highest-risk* third, because it is the only remaining work where being wrong costs real money rather than time.

The reason it is only a third rather than half is the boundary in §2.1: the settlement engine behind the seam is already built and proven. You are writing a vendor adapter into a finished machine, not building the machine.

### The five largest remaining pieces of work

**1. Paymob, and everything real money implies.** (~a third of what's left; the riskiest.)
Write the four API calls and the HMAC verification ([paymob-driver.ts](apps/www/src/lib/services/payments/gateway/paymob-driver.ts)), add the missing browser return/redirect route, then close what the stub has been hiding: **gateway-side refunds** (§2.3 #7), reconciliation, disputes, and end-to-end exercise of the failed/abandoned paths that already exist as unreachable code. Note that `sandbox` is currently as broken as `live`, so step zero is getting *any* real mode to work.

> **BINDING SEQUENCING CONSTRAINT — gateway refunds ship with the driver, never after.**
> Decided 2026-07-26. The gateway-side refund call must be written in the **same pass** as the Paymob driver, not deferred to a follow-up.
> **Why this one is different from every other gap in this report:** it is the only defect that reports success while losing real money, and it is structurally untestable before the driver exists. The ledger refund is already correct and race-proofed (H3, `transactions_one_refund_per_payment`), the admin UI already reports success, and the audit trail already looks complete — so a refunded card payment that was never credited at the gateway leaves **no** local evidence that anything went wrong. No test can catch it, because until the driver exists there is no gateway call to assert on, and once the driver exists the missing refund is a silent no-op rather than a failure.
> Concretely: the moment `createCheckout` can charge a card, `refundPayment` must be able to reverse it at Paymob, and the local refund transaction must not commit unless the gateway reversal succeeded. Shipping the charge path without the reverse path converts a currently-harmless bookkeeping gap into an active, invisible money leak.

**2. Make the product actually run: a scheduler, and a test harness that executes.**
Six mutating jobs exist and nothing invokes them (Finding #3) — subscription expiry, intent expiry, collaboration expiry, lesson reminders, month-end statements, and the entire guardian escalation are inert. Separately: commit a `.env.test.example`, restore `.env.test`, add an aggregate runner that runs all 38 suites rather than 1, and stand up CI. Until that exists, every quality claim in `CLAUDE.md` is unverifiable, and §6.6's "things never end" problem stays live.

**3. Delivery channels — decide, then finish or delete.**
`sendSms` is unimplemented for every provider, and `invite_code_sent` routes exclusively to it, so that notification **delivers nothing to anyone** (§2.7). FCM is a real driver with no credentials that doesn't even warn in production. `MAIL_PROVIDER` silently defaults to a mode that delivers nothing — and `apps/superadmin/.env.production` has no mail config at all, while `sendInvoiceEmail` hardcodes `{sent:true}`. WhatsApp has a working driver, two templates, and no inbound webhook. Every one of these fails silently; none of them tells anyone.

**4. Close the parent journey, and the payment UX around it.**
A parent cannot pay for their child — both entry points are `requireRole("student")` (§1.2). On a K-12 product in Egypt, that is the largest *product* gap in the codebase, independent of the gateway. Alongside it: there is no UI surface for a failed or abandoned payment, because there has never been a real one to surface.

**5. Assignments — build it or descope it in writing.**
There is no model, no API, and no teacher-side creation; `/dashboard/teacher/assignments` renders the gradebook (§1.3). Two nav entries currently promise a feature that isn't there. Then sweep the smaller schema-implied gaps in the same pass: `Review.lessonId` (drop the field or relax the unique), `InvoiceStatus.void`, `CourseStatus.ended`, the 12 untranslated nav labels, and the `platformKpis` soft-delete filter.

---

### One closing observation for the redesign decision

You asked this to decide when to redesign. The answer the evidence gives is: **the product logic is far enough along that a redesign will not be undermined by churn beneath it.** The domain model, authorization, money engine and safety layers are settled and unusually well built — a redesign lands on stable foundations.

What is *not* settled is anything that leaves the process: the payment gateway, the scheduler, and the three delivery channels. Pieces 1, 2 and 3 are integration and operations work, not domain work — they will not move a screen's information architecture.

**Pieces 4 and 5 will, and they have to be decided before the redesign, not after.** *(Correction to an earlier draft of this section, which claimed none of the five affected IA. That was wrong for these two.)*

- **Piece 4 (parent payment) adds surfaces to a role that currently has none.** The parent has nine endpoints and every one is read-only oversight or linking. Letting a parent pay means a fee list with a pay action, a checkout, payment history, and probably a parent wallet — new screens, new nav entries, and a second actor in the payment flow that the student-only checkout was never shaped for. Design the parent portal for a role that transacts, or design it twice.
- **Piece 5 (assignments) changes the nav either way.** Building it adds a teacher creation surface, a student submission surface, and a due-date/deadline model that touches the schedule and the notification matrix. Descoping it removes two nav entries from both the teacher and student sidebars and retires the screen that currently reskins grades. Both outcomes change the sidebar; leaving it undecided means designing around a feature that may not exist.

So the sequencing is: settle **4 and 5 as product decisions** (build or descope, in writing) before the redesign starts, because they change what screens exist. Pieces **1, 2 and 3** can land in parallel with a redesign without disturbing it.

The one thing I would fix *before* any of it, because it is cheap and it changes what you can trust while redesigning: **the test harness and CI** (piece 2). Right now you cannot prove a redesign broke nothing, because you cannot run the suite that would tell you.

---

## Addendum — 2026-07-26, after making the proof corpus runnable

Work order: commit the missing `.example` files, build an aggregate runner, fix the leaking suites, add CI, then report the real numbers. Findings that correct or extend the audit above.

### A1. Corrections to this report

| § | Said | Actually |
|---|---|---|
| 5.1, Findings #4 | "20 db tests in `apps/www/tests/db`", 38 total | **23** runnable in www (22 `*.test.ts` + `run-db-tests.ts`) and 18 in superadmin = **41**. The runner now prints the list: `bun run --filter edura test:db:list`. |
| 5.1 | "13 www unit files" | Confirmed: **13 files, 111 passed / 1 skipped**, matching `CLAUDE.md`. |
| 5.6 | "no CI" | Fixed — [.github/workflows/ci.yml](.github/workflows/ci.yml). |
| Findings #4 | "`.env.test` absent, no `.env.example` anywhere" | Fixed — ten `.example` files committed (§A4). |
| 5.2 | "5 packages typecheck" | **`packages/database` had no `check-types` script at all** — the package holding the schema, all seeds and every DB script was outside `bun run check-types`. Adding it surfaced **7 pre-existing type errors** in two demo seeds. Now 6/6 green. |

### A2. The guard hole is worse than "a hole the size of how people run these" — and it is now closed

Confirmed, and sharper than suspected: the guard's only enforcement point was `pretest:db`, and **the suites' own docblocks instructed you to bypass it.** 15 suites carried a `Run:` line reading `tsx --env-file=.env.local …` — the DEV database — and **zero** suites mentioned `.env.test`. Zero of 41 guarded themselves in-process. So the documented procedure routed around the guard, and `.env.local` was the only env file that existed to route to.

Closed at **41/41**: every suite now calls `assertDbEnv(["test"])` before its first fixture, and the aggregate runner calls it before spawning anything. Verified against the live dev database — all refuse, exit 1, before creating a row:

```
db-guard [suite wallet.test.ts]: REFUSING TO RUN against a 'dev' database.
  reached:  ep-patient-scene-...eu-central-1.aws.neon.tech/neondb
  labelled: dev
  allowed:  test
```

Spot-checked on `center-oversight`, `refund`, `h3-refund-race`, `invite-claim`, `messaging-scope` and the runner itself. The 15 misleading docblocks were rewritten to point at `bun run test:db` / `test:db:only`.

**One hole cannot be closed this way, and it is the bigger one.** `apps/www/tests/db/` contains **19 committed `_*.{ts,mjs}` probe scripts** — not counted in the audit above because they do not match `*.test.ts`. They are the harness that produced `docs/reports/api-verification.md`, and they work at the HTTP layer: **348 POST/PUT/PATCH calls** against a *running* dev server on ports 3002/3004, authenticated with session cookies forged by `_mint.ts`. Those writes travel through the server's own connection, so no connection-string guard — `db-guard`, the runner, or anything else — can ever observe them.

- `apps/www/tests/db/_mint.ts` *(deleted 2026-07-26 — see §A6)* mints valid NextAuth JWE cookies for any email, including `super_admin`, with no password, reading the real `NEXTAUTH_SECRET` / `SUPERADMIN_NEXTAUTH_SECRET` from env. It is a committed authentication-bypass utility. Pointed at production secrets it mints production super-admin sessions.
- `apps/www/tests/db/_deep-write-3.ts` *(deleted 2026-07-26 — see §A6)* reads its fixtures from `/private/tmp/claude-501/.../67a8faec-.../scratchpad/fixtures.json` — a scratchpad belonging to a session that no longer exists. It is unrunnable and unreproducible as committed.

**Done 2026-07-26 (§A6): all 19 were deleted.** The recommendation at the time was: move `_*` out of `tests/db/` into a clearly-marked `tools/api-probe/` directory, gitignore or delete `_mint.ts`, and gate the harness on an explicit `EDURA_ALLOW_HTTP_WRITES=1`. The runner's docblock records this limit so it is not mistaken for solved.

### A3. Attribution of the dev contamination — hypothesis confirmed, with names

The dev database (labelled `edura-env:dev`) holds **535 users, of which 472 are `@x.io` test fixtures, and 42 are `super_admin`**. 470 of the 472 are attributable by email tag to specific no-cleanup suites:

| Tag | Users | of which `super_admin` | Suite | Had cleanup? |
|---|---|---|---|---|
| `m2-` | 156 | 13 | `room-pricing-methods.test.ts` | no |
| `msgtest-` | 105 | 0 | `messaging-scope.test.ts` | **yes — and still leaked 105** |
| `split-` | 65 | 11 | `room-revenue-split.test.ts` | no |
| `wallet-` | 63 | 0 | `wallet.test.ts` | no |
| `wref-` | 30 | 6 | `wallet-refund.test.ts` | no |
| `nocap-` | 12 | 0 | `wallet-no-cap.test.ts` | no |
| `shadm-` | 12 | 4 | `center-share-admin.test.ts` | no |
| `share-` | 10 | 0 | `center-share-governance.test.ts` | no |
| `roomown-` | 8 | — | `room-ownership.test.ts` | no |
| `wpol-` | 6 | — | `wallet-settings-admin.test.ts` | no |
| `commaud-` | 3 | — | `commission-audit.test.ts` | no |

So: **leakage plus direct `--env-file=.env.local` invocation is exactly right**, and 34 of the 42 super_admins trace to four suites that mint a super-admin fixture and never remove it. Two refinements:

1. `messaging-scope.test.ts` **did** have cleanup and still left 105 rows — its hand-written delete list had drifted behind the schema. "Has a `finally` block" was not the right predicate; the audit's nine-suite list understated the problem by one.
2. The 19 HTTP probe scripts are a second, independent contamination path that no per-suite cleanup addresses.

### A4. What was built

| Path | What |
|---|---|
| [packages/database/scripts/test-cleanup.ts](packages/database/scripts/test-cleanup.ts) | Tag-scoped sweeper. Walks the FK graph at runtime (seed from tagged rows → transitive closure → delete children-first), so it cannot drift behind the schema the way a hand-written delete list does. Fails closed on the DB label; refuses a loose tag; never touches the education catalog; connects on `ADMIN_URL` because the money ledgers have `DELETE` REVOKEd from `edura_app`. |
| [packages/database/scripts/run-db-suites.ts](packages/database/scripts/run-db-suites.ts) | Aggregate runner. **Discovers** suites rather than listing them, so a new one is included the day it lands. Guards in-process before spawning; children inherit the validated env. Per-suite pass/fail plus a total; non-zero exit on any failure. |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | `static` job (typecheck 6/6, unit, build both apps) runs everywhere. `db` job is **gated on a secret** so forks skip instead of failing red, and asserts the `test` label before running. Sweeps residue with `always()`, because a timeout-killed suite never reaches its own `finally`. |
| 10 × `.env*.example` | www / superadmin / realtime / database, for dev, test and production. Verified: none contains a value from any real env file. |

`test:db` in both apps now runs **all** suites (was 1 of 23 and 1 of 18); `test:db:all` and `test:db:parity` were re-pointed at the full run rather than left as misleading partial aliases; the six single-suite superadmin aliases were replaced by `test:db:only`.

### A5. Which `CLAUDE.md` numbers reproduce

| Claim | Status | Evidence |
|---|---|---|
| `bun run check-types` 5/5 | **Reproduces, and was understating the scope** — 6/6 now that `packages/database` is included | run 2026-07-26 |
| `bun run build` both apps | **Reproduces** | 2 tasks successful, 26.7s |
| www unit 111 pass / 1 skip | **Reproduces exactly** | 13 files, 111 passed, 1 skipped |
| Every DB figure — messaging-scope 87/87, invite-claim 107/107, center-oversight 119/119, c04 72/72, center-staff-delegation 55/55, room-pricing-methods 47/47, h04 44/44, and the rest | **Still unverified** | Blocked: no `edura-env:test` database exists to run them against. See below. |

**Why the DB numbers are still unverified, and what unblocks them.** The only labelled database reachable from this machine is `edura-env:dev`. Running the suites against it would have (a) been refused by the guard I just installed, and (b) added another few hundred fixture rows to the database this work exists to protect. I did not create a Neon branch, because that is an account-level action with cost implications and it is your call.

To get the numbers, once:

```bash
# 1. create a Neon branch from dev, then label it (as the branch owner)
#    psql "<branch-admin-url>" -c "COMMENT ON DATABASE neondb IS 'edura-env:test';"
# 2. cp apps/www/.env.test.example apps/www/.env.test           # fill in the 3 URLs
#    cp apps/superadmin/.env.test.example apps/superadmin/.env.test
# 3. bun run --filter @repo/database migrate:deploy
# 4. bun run --filter edura test:db && bun run --filter superadmin test:db
```

The runner prints a per-suite table and a single total, so step 4's output *is* the answer to "which figures reproduce".

**Dev was not written to by any of this work** — verified before and after: 535 users / 42 super_admins / 472 `@x.io`, unchanged. The historical residue is still there; `bun run --filter edura test:db:sweep -- --dry-run m2- msgtest- split- wallet- wref- nocap- shadm- share- roomown- wpol- commaud-` reports what removing it would take, and dropping `--dry-run` does it. That is a destructive write against dev, so it is deliberately left for you to run.

---

## Addendum A6 — probe scripts removed, 2026-07-26

The 19 `apps/www/tests/db/_*.{ts,mjs}` scripts were **deleted**. They were tracked since `9be4271` (2026-07-23) and remain in history; no rewrite was needed because a full scan confirmed **no secret is embedded in any of them** — every one read its credentials from `process.env`.

**Why they went rather than being guarded.** `_mint.ts` minted a valid NextAuth JWE session cookie for any email — including `super_admin` — with no password, from whatever `NEXTAUTH_SECRET` / `SUPERADMIN_NEXTAUTH_SECRET` the environment supplied. `_fixtures.ts` did the same for every actor role at once. The remaining 17 drove the running dev servers over HTTP with those cookies (**348 `POST`/`PUT`/`PATCH` calls**). Because those writes travel through the server's own connection, no connection-string guard — `db-guard` or the aggregate runner — can observe them. The capability was the problem, not the wiring.

Dev and production secrets are fully rotated (verified: all five differ, and `.env.production` says so explicitly), but rotation was never the protection: `_mint.ts` takes its secret from the environment, so `tsx --env-file=.env.production _mint.ts <email>` would have used the production keys, and a working DB connection came free via `ADMIN_URL ?? DIRECT_URL`. It failed today only because production has zero user rows — after bootstrap and seed it would have worked immediately.

**12 of the 19 were already dead** as committed: every script that read or wrote state hardcoded `/private/tmp/claude-501/.../67a8faec-…/scratchpad/fixtures.json`, a session directory that no longer exists. `_deep-write-1/2` wrote their cleanup manifests to the same vanished path, and `_purge.ts` — the script their docblocks named as the consumer — was never committed at all. The cleanup contract they advertised did not exist. Only `_mint.ts`, `_fixtures.ts` and `_params.mjs` still ran, and two of those three were the session forgers.

Their findings are preserved in [docs/reports/api-verification.md](docs/reports/api-verification.md), and the harness tags (`apiv-`, `apiv2-`, `apiw3-`, `aprl-`) return **zero** rows in dev — their own cleanup did work.

**Session-minting outside the auth path after removal:** two suites, both legitimate and both now gated. `c01-lesson-settlement.test.ts:65` and `h03-seed-uuid-flows.test.ts:84` mint a JWE for their fixtures, and since the guard work they can only run against an `edura-env:test` database. `c04-login-parity.test.ts` only *decodes* — that is the test. In production code, exactly two minters exist and both are correct: `api/v1/auth/login/route.ts:64` (authenticates first) and `api/v1/realtime/token/route.ts:19` (`SignJWT` for the socket handshake).

### Coverage being replaced, not dropped

Three in-process suites, following the pattern the other 41 already use — import the handler or service, pass a `SessionUser`, no server, no cookie, no secret:

| Replacement | Replaces | Why it is stronger |
|---|---|---|
| `apps/www/tests/db/authz-sweep.test.ts` | `_sweep-auth.mjs` + `_params.mjs` | Enumerates `src/app/api/**/route.ts`, invokes each handler with no session and with a wrong-role session, asserts 401/403/404. No dev server, runs in CI, and a new route is swept the day it lands rather than when someone regenerates an inventory file. |
| `apps/www/tests/db/tenant-isolation.test.ts` | `_deep-isolation.mjs`, `_deep-get.mjs` | Extends the existing `rbac-isolation.test.ts` (11 assertions) with the cross-tenant, assistant/staff-boundary and oversight cases. |
| `apps/www/tests/db/rate-limit-rest.test.ts` | `_ratelimit-probe.ts` | The one genuine gap: `ChatLimiter` on the REST send path against Redis, not the in-memory fallback that `m3-rate-limit` currently proves. |

The 11 write/diagnostic probes are not replaced. They were one-shot exploration for the API-verification report, and the bugs they chased (the session-completion 500 from a negative `centerNet`) are addressed.

**Commit message text:**

```
Remove the 19 HTTP probe scripts from apps/www/tests/db

_mint.ts minted a valid NextAuth super_admin session cookie for any
email with no password, from the real signing secrets; _fixtures.ts did
the same for every role; the other 17 drove the running dev servers
through 348 mutating HTTP calls using those cookies. Writes made that
way travel through the server's own connection, so no connection-string
guard can see them — the capability had to go, not just its wiring.

12 of the 19 were already dead: they hardcoded a scratchpad path from a
session that no longer exists, and _purge.ts (the cleanup script their
docblocks named) was never committed.

No history rewrite: none of them embedded a secret, all read process.env.

Coverage is being REPLACED, not dropped — authz-sweep, tenant-isolation
and rate-limit-rest suites will cover the same ground in-process, under
the guarded runner, in CI. Findings preserved in
docs/reports/api-verification.md.
```

---

## Addendum A7 — role split APPLIED, 2026-07-26

Finding 0 is closed in code and configuration. Three controls, in the order they bite.

### 1. The boot assertion — `roleGuardExtension`

[packages/database/src/extensions/index.ts](packages/database/src/extensions/index.ts), wired as the **outermost** extension in [packages/database/src/client.ts](packages/database/src/client.ts).

```sql
SELECT current_user,
       COALESCE((SELECT rolsuper OR rolbypassrls
                   FROM pg_roles WHERE rolname = current_user), false) AS unsafe
```

If `unsafe`, every query throws with the remediation inline. Three properties, each deliberate:

- **Asserts the capability, not the role name.** `current_user <> 'neondb_owner'` is defeated by a rename or a second owner-equivalent role. `rolsuper OR rolbypassrls` is the property that matters: *can this connection see through RLS?*
- **Fails closed in every environment.** A dev process running as owner silently disables the isolation the suites exist to prove — precisely how this survived.
- **One call site.** Outermost on the client every app query funnels through, so a new route cannot forget it. The owner-legitimate scripts open their own `pg` pools and never touch this client, so they bypass the guard **by construction, not by exception.**

Cost: one memoised `SELECT` per process. The rejection is cached too, so a retry cannot slip past a first failure.

**Proven both ways against dev:**

```
CASE A  DATABASE_URL = neondb_owner  ->  REFUSED
        role-guard: REFUSING TO SERVE as database role "neondb_owner".
          This role is SUPERUSER or has BYPASSRLS, so:
            - every RLS policy is inert (tenant isolation is OFF), and
            - the append-only REVOKEs ... do not apply.
CASE B  DATABASE_URL = edura_app     ->  SUCCEEDED, user.count() = 459
```

Incidental confirmation in case B: `edura_app` sees **459** users where the owner sees **535** — RLS and the soft-delete extension actually applying. Under the owner they did not.

### 2. Owner-only, no fallback

`ADMIN_URL ?? DIRECT_URL` let an app-role URL be silently accepted, and created pressure to make `DIRECT_URL` an owner string — which is how an owner credential reaches a serving environment. Tightened to `ADMIN_URL` only, with a message naming the reason:

| Script | Why it needs owner |
|---|---|
| [bootstrap-app-role.ts](packages/database/scripts/bootstrap-app-role.ts) | `CREATE ROLE` |
| [apply-migrations.mjs](packages/database/scripts/apply-migrations.mjs) | applies DDL |
| [test-cleanup.ts](packages/database/scripts/test-cleanup.ts) | `DELETE` on the REVOKEd ledger + audit tables |
| [label-db.ts](packages/database/scripts/label-db.ts) | `COMMENT ON DATABASE` requires ownership |

`label-db.ts` was **not** in the original three; it was included because it mutates as owner by the same reasoning. Flagged so it can be reverted if unwanted.

Deliberately left with the fallback, because they are **read-only** and the fallback is correct there: `db-guard.ts` (documented to check "the most privileged connection in scope"), `verify-db.ts`, `smoke-test.ts`, `scale-load-test.mjs`.

### 3. Env shape — which variable each consumer reads

**No serving configuration contains `ADMIN_URL`, `DIRECT_URL`, or `APP_ROLE_PASSWORD` — verified across all six app env files.**

| Consumer | `DATABASE_URL` | `DIRECT_URL` | `ADMIN_URL` | `APP_ROLE_PASSWORD` |
|---|---|---|---|---|
| `apps/www` runtime (dev + prod) | `edura_app` | **absent** | **absent** | **absent** |
| `apps/superadmin` runtime | `edura_app` | **absent** | **absent** | **absent** |
| `apps/realtime` runtime | `edura_app` | **absent** | **absent** | **absent** |
| `prisma migrate deploy` (via `prisma.config.ts`) | — | **owner** | — | — |
| `bootstrap-app-role.ts` | — | — | **owner** | required |
| `apply-migrations.mjs` | — | — | **owner** | — |
| `test-cleanup.ts` | — | — | **owner** | — |
| `label-db.ts` | — | — | **owner** | — |
| `db-guard.ts`, `verify-db.ts` | fallback | fallback | preferred | — |
| DB test suites (41) | `edura_app` | owner | owner | — |

The owner credentials live in exactly two files, neither of which is a serving config: `packages/database/.env` (dev) and `packages/database/.env.production`. Both were **already correctly shaped** — `DATABASE_URL=edura_app`, `DIRECT_URL`/`ADMIN_URL`=owner — so no change was needed there. Every owner-needing script imports `scripts/load-env.ts`, which reads those files, so they work with **no `--env-file` at all`:

```bash
tsx scripts/test-cleanup.ts --dry-run m2-      # verified working
tsx scripts/db-guard.ts dev                    # verified working
```

The one exception is `apply-migrations.mjs`, which does not import `load-env` and therefore still needs an explicit `--env-file=packages/database/.env[.production]`.

Removing the owner vars from `apps/*/.env.local` as well as `.env.production` was a deliberate extension of design point 2: the rule is worthless in dev if dev is exempt, and dev is where every proof runs.

### What Ali must fill in

Placeholders marked `REPLACE...` / `TODO(ali)`:

| File | Fill | Note |
|---|---|---|
| `apps/www/.env.production` | `DATABASE_URL` | The **value already exists** — copy `DATABASE_URL` from `packages/database/.env.production`, which is already on `edura_app`. Must be the pooled (`-pooler`) host. |
| `apps/superadmin/.env.production` | `DATABASE_URL` | Same value as www. |
| `apps/superadmin/.env.production` | `NEXTAUTH_SECRET`, `SUPERADMIN_NEXTAUTH_SECRET`, `REALTIME_JWT_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET` | **Byte-identical to www's production values**, and the two NextAuth secrets must differ from each other — `c04-login-boundary` proves a www cookie is rejected here and vice versa, and passes for the wrong reason if they accidentally match. |
| `apps/superadmin/.env.production` | `NEXTAUTH_URL`, `APP_BASE_URL`, `APP_ORIGIN` | The back-office host. |
| `apps/superadmin/.env.production` | `MAIL_*`, `REDIS_URL`, `CLOUDINARY_*` | Was missing entirely (Finding #6). `MAIL_PROVIDER` defaults to `console`, which delivers nothing, silently, in production too. |

Regression after the change: **typecheck 6/6, unit 13 files / 111 passed / 1 skipped, build both apps.** DB suites still pending a test-labelled branch.

---

## Addendum A8 — held back deliberately

### A8.1 FK remediation plan — NOT SCHEDULED, and the orphan mechanism is LIVE until it lands

Stated plainly: **until this migration lands, the mechanism that produced dev's 958 orphans is still active.** Every future cleanup — including the one-time sweep of the 3,435 tagged rows — deletes parents that Postgres will not stop it from deleting, and any append-only child left behind becomes permanently unrepairable. The sweeper's convention walk mitigates this by *finding* the children; it does not make the database enforce the relationship.

Following the recommendation already in [docs/product/prd-compliance-audit.md:257](docs/product/prd-compliance-audit.md): `ADD CONSTRAINT ... NOT VALID`, then `VALIDATE` in a later statement, so the lock is brief and existing rows do not block the deploy.

**`ON DELETE RESTRICT`** — identity and money references. A row here must never disappear from under a ledger entry.

| Table | Columns → parent |
|---|---|
| `transactions` | `from_entity_id`, `to_entity_id` → `users`; `center_id` → `centers`; `lesson_id` → `sessions` |
| `payments` | `student_id` → `users`; `course_id` → `courses`; `center_id` → `centers` |
| `points_ledger` | `student_id` → `users` |
| `wallet_ledger` | `student_id` → `users`; `center_id` → `centers`; `payment_id` → `payments` |
| `session_settlements` | `session_id` → `sessions`; `teacher_id` → `users`; `center_id` → `centers`; `room_id` → `rooms` |
| `payment_intents` | `student_id` → `users`; `course_id` → `courses`; `subscription_id` → `subscriptions` |
| `subscriptions` | `student_id` → `users`; `course_id` → `courses`; `enrollment_id` → `enrollments` |
| `invoices` | `issued_to_id` → `users`; `center_id` → `centers` |
| `payouts` | `beneficiary_id` → `users`; `center_id` → `centers` |
| `parent_student_links` | `parent_id`, `student_id` → `users` |
| `center_teacher_affiliations` | `teacher_id` → `users`; `center_id` → `centers` |
| `center_staff` | `staff_user_id` → `users`; `center_id` → `centers` |
| `teacher_assistants` | `assistant_id`, `teacher_id` → `users` |
| `center_student_rosters` | `student_id` → `users`; `center_id` → `centers` |
| `enrollment_requests`, `grades`, `materials`, `reviews`, `blacklist_entries`, `commission_settings`, `collaboration_requests` | their `*_id` columns per the convention map in `test-cleanup.ts` |

**`ON DELETE SET NULL`** — an audit row must outlive its actor, so the reference nulls rather than blocking the delete or vanishing.

| Table | Columns |
|---|---|
| `audit_logs` | `actor_id`, `center_id`, `target_id` |
| `points_ledger` | `adjusted_by` |
| `notifications` | `user_id` *(or RESTRICT — decide whether a notification may outlive its recipient)* |

**Migration order — this sequence matters:**

1. **Clean the 958 existing orphans first**, or step 3 fails. That failure is itself the useful forcing function: it enumerates exactly what is already broken.
2. `ADD CONSTRAINT ... NOT VALID` for every pair above — one migration, no table scan, no long lock.
3. `VALIDATE CONSTRAINT` per table — a second migration, run off-peak. Splitting 2 and 3 is what keeps the deploy non-blocking.
4. Re-run `verify-db.ts` and confirm the FK count rises from 40 to roughly 100.
5. **Only then** consider narrowing `test-cleanup.ts`: with real FKs and `ON DELETE RESTRICT`, an incomplete sweep *fails loudly* instead of silently orphaning — the convention map becomes a belt-and-braces rather than the only protection.

Also worth settling in the same pass: soft-delete covers only 3 of 67 models (`User`, `ConversationMessage`, `GroupMessage`). `CLAUDE.md`'s convention *"destructive operations use soft-delete"* has no mechanism on the other 64. Either extend it or narrow the stated convention to match reality.

### A8.2 The 958 existing orphans — LEFT IN PLACE, deliberately

Dev-only, and production launches empty, so they are not cleaned. Recorded so nobody later reads dev's data as evidence:

- **260 rows in `audit_logs` attribute actions to users that no longer exist**, out of 1,183 total — and **558 of those 1,183 rows are test fixtures**. Roughly a third of dev's audit trail is synthetic, and a fifth of it is unattributable.
- **~520 orphans sit in the money ledger** (`transactions.from/to_entity_id` 371, `transactions.lesson_id` 67, `points_ledger.student_id` 62, `wallet_ledger.student_id` 19).
- **These are unrepairable through the application.** `audit_logs`, `transactions`, `points_ledger` and `session_settlements` all have `UPDATE`/`DELETE` REVOKEd from `edura_app`. Only an owner connection can touch them — which is the credential the role split exists to retire.

**Do not treat dev's `audit_logs` as an audit trail.** It is a test artefact with real rows mixed in.

### A8.3 `edura_cleanup` — the eventual target

The end state, recorded as intent rather than a task:

1. All 41 suites now sweep their own tag in a `finally`, so this residue should not recur.
2. The operator sweeper therefore shrinks to a **one-time history clear** (3,435 rows across 11 tags, dry-run measured).
3. Once that clear is done, the owner credential has **no remaining consumer outside migrations and bootstrap** — `prisma migrate deploy`, `apply-migrations.mjs`, `bootstrap-app-role.ts`, `label-db.ts`. All four are operator/CI actions, none is a serving process.
4. If a cleanup credential is still wanted at that point, a dedicated **`edura_cleanup`** role — `DELETE` on exactly the fixture-reachable tables, `NOBYPASSRLS`, no DDL — removes the last reason to hold an owner credential for anything but schema changes.

The principle to hold onto: **the cleanup tooling must never become the reason owner access stays wired in.** Runtime and cleanup are different processes with different credentials, and they do not need to share an env file.

---

## Addendum A9 — the 41-suite run on a real test branch, 2026-07-26

Branch `test` (`ep-shiny-waterfall-as6cxn8n`), cut from production, relabelled `edura-env:test`, migrated to 36 and seeded.

**36 of 41 suites pass. 1,034 assertions passed, 0 failed.** Sixteen of the seventeen figures `CLAUDE.md` names reproduce **exactly**.

| Suite | CLAUDE.md | Actual | |
|---|---|---|---|
| center-oversight | 119/119 | **119** | ✅ |
| invite-claim | 107/107 | **107** | ✅ |
| c04-login-parity (www) | 72/72 | **72** | ✅ |
| center-people | — | 66 | ✅ |
| center-staff-delegation | 55/55 | **55** | ✅ |
| center-academic | — | 54 | ✅ |
| center-operations | — | 50 | ✅ |
| center-money | — | 48 | ✅ |
| room-pricing-methods | 47/47 | **47** | ✅ |
| h04-blacklist-cascade | 44/44 | **44** | ✅ |
| center-platform | — | 44 | ✅ |
| c02-payout-generation | — | 28 | ✅ |
| c03-status-revocation (www) | 26/26 | **26** | ✅ |
| c04-login-boundary (sa) | 26/26 | **26** | ✅ |
| room-revenue-split | — | 22 | ✅ |
| wallet | — | 20 | ✅ |
| registration-doors | — | 17 | ✅ |
| offline-sync | — | 16 | ✅ |
| c03-status-revocation (sa) | 15/15 | **15** | ✅ |
| mail-password-reset | — | 15 | ✅ |
| wallet-settings-admin | — | 15 | ✅ |
| refund | 13/13 | **13** | ✅ |
| l1-session-invalidation | 12/12 | **12** | ✅ |
| rbac-isolation | 11/11 | **11** | ✅ |
| center-share-admin | 11/11 | **11** | ✅ |
| second-language-scoping | — | 11 | ✅ |
| run-db-tests | — | 11 | ✅ |
| m5-send-invite-ownership | 10/10 | **10** | ✅ |
| wallet-refund | — | 8 | ✅ |
| h2-payout-floor | 7/7 | **7** | ✅ |
| wallet-no-cap | — | 7 | ✅ |
| h3-refund-race | 6/6 | **6** | ✅ |
| commission-audit | — | 6 | ✅ |
| center-share-governance | — | 6 | ✅ |
| m1-webhook-atomicity | — | 9 | ✅ |
| h1-payout-race | — | exit 0, no count line | ✅ |
| **messaging-scope** | **87/87** | hung 1085s → exit 1 | ⚠️ **the one unverified figure** |
| c01-lesson-settlement | — | 3 failed assertions + FATAL | ✗ |
| catalog-onboarding | — | `cacheTag()` config error | ✗ |
| h03-seed-uuid-flows | — | missing `messaging-demo-seed` | ✗ |
| room-ownership | — | 5/5 pass, then hangs | ✗ |

**superadmin: 18/18, all pass, 585 assertions.** **www: 18/23, 449 assertions.**

### The five that did not pass — none is a product defect

1. **`h03-seed-uuid-flows`** — needs a fourth seed I did not run. It says so itself: `Missing seeded fixtures. Run: seed.ts, preview-seed.ts, messaging-demo-seed.ts`. Environment, not code.
2. **`catalog-onboarding`** — `` `cacheTag()` is only available with the `cacheComponents` config ``. A Next.js config coupling: the service under test calls a Next cache API that has no runtime outside a Next server. The suite cannot pass standalone regardless of database state. **This is a real defect in the test's design, not in the product.**
3. **`c01-lesson-settlement`** — the only suite with genuinely failed assertions: `✗ all 3 CHECKs are VALIDATED (not NOT VALID)`, plus two `401`s and a FATAL on `wallet_balance`. The CHECK assertion is an **environment difference, and an informative one**: the branch was cut from production, where `centers_wallet_balance_nonneg` is still `NOT VALID` — exactly as §Security/H2 records. The suite asserts dev's post-wipe validated state. The two 401s suggest it expects a running dev server.
4. **`room-ownership`** — run alone it prints `5 passed, 0 failed` and completes its sweep. It is **not an assertion failure**; the suite hangs after cleanup. 842s in the batch.
5. **`messaging-scope`** — 1085s then exit 1, no summary line. The 87/87 figure remains **unverified**.

### Suspected cause of the two hangs — my own sweeper

`room-ownership` and `messaging-scope` are the two slowest suites by an order of magnitude, and both complete their assertions before stalling. The likeliest cause is `sweepTag`'s fixed-point walk: up to 32 passes over ~150 edges, one `SELECT` per edge per pass, against a now-seeded database on free-tier Neon compute. That is thousands of round-trips per suite. Recorded as a suspicion, **not proven** — it needs a timed profile of `sweepTag` before anyone acts on it.

If confirmed, the fix is to stop iterating to a fixed point and instead expand once per topological level, which the relation graph already gives.

### Seed order used

All three guards passed on the relabelled branch (`assertNotProduction` = `assertDbEnv(["dev","test"])`):

| # | Seed | Guard | Provides |
|---|---|---|---|
| 1 | `prisma/seed.ts` (calls `seedCatalog`) | `readDbEnv()` → `test`, so demo data included | Egyptian catalog, `super_admin` + `accountant`, base demo users, one center, one course |
| 2 | `prisma/preview-seed.ts` | `assertNotProduction` ✔ | NILE/ANDL/FUTR/BRGT centers, 5 teachers, 5 students, 5 courses, 7 sessions — what `c01` and `h1`/`h2` need |
| 3 | `prisma/center-oversight-demo-seed.ts` | `assertNotProduction` ✔ | The two oversight centers |
| 4 | `prisma/messaging-demo-seed.ts` | `assertNotProduction` ✔ | **Not run — this is why `h03` failed** |

`seed.ts` decides what to write from the **database label**, not `NODE_ENV`: on a `test` label it seeds catalog + staff + demo; on `production` it would seed catalog + staff only, and refuse without explicit staff credentials.

**Invocation matters:** these scripts load env through `scripts/load-env.ts`, which defaults to `packages/database/.env` — **dev**. They must be run as `EDURA_ENV=test tsx prisma/<seed>.ts`, which loads `.env.test`. A bare `bun run seed` writes to dev.

### A9.1 — 31 of 41 suites depend on pre-existing database state

Not just the `h1`/`h2` hardcoded UUIDs the audit flagged — it is broad. Before seeding, 28 suites crashed; after seeding, 36 pass. That difference *is* the dependency.

**This makes CI flaky by construction, and the workflow as committed will fail exactly as this run first did.** [.github/workflows/ci.yml](.github/workflows/ci.yml) goes straight from *Materialise `.env.test`* → *`pretest:db`* → *`test:db`*. There is **no migrate step and no seed step** — the only match for `seed` in the file is a comment about type errors.

What it needs, between "Materialise" and "DB suites":

```yaml
- name: Apply migrations to the test branch
  run: bun run --filter @repo/database exec tsx --env-file=.env.test scripts/apply-migrations.mjs

- name: Seed deterministically
  env: { EDURA_ENV: test }
  run: |
    bun run --filter @repo/database exec tsx prisma/seed.ts
    bun run --filter @repo/database exec tsx prisma/preview-seed.ts
    bun run --filter @repo/database exec tsx prisma/center-oversight-demo-seed.ts
    bun run --filter @repo/database exec tsx prisma/messaging-demo-seed.ts
```

`packages/database/.env.test` must also be materialised, not just the two app ones — the seeds read it. All four seeds are idempotent (`upsert` on deterministic UUIDv5 ids from `seed-ids.ts`), so re-running is safe; but a CI branch that persists between runs will accumulate whatever the suites fail to sweep, so the residue sweep at the end of the job is load-bearing, not optional.

The deeper point: **31 suites asserting against seeded rows they did not create is a design property worth revisiting.** Self-contained suites cost more to write and cannot drift out from under a shared fixture.

### A9.2 — the migration drift is now proven, not inferred

The branch arrived at **34 of 36 migrations**, inheriting production's state. That converts a doc claim into a measurement: **production is two migrations behind**, missing `20260725100000_invite_purposes_guardian_notice` and `20260725100100_guardian_contact`.

Concretely, on production today:

- `student_profiles` has **28 columns, not 33** — missing `guardian_email`, `guardian_phone`, `guardian_email_added_at`, `guardian_email_added_by`, `guardian_contact_due_at`. Every code path that creates a `StudentProfile` fails immediately with `The column (not available) does not exist in the current database`. **That includes ordinary student registration.**
- The `invite_purpose` enum has only `student_activation, teacher_activation, admin_invite, walk_in_onboarding`. **`assistant_invite` and `center_staff_invite` do not exist**, so production cannot mint an assistant or center-staff invite at all — the entire Part B invite flow is inoperable there.
- The `guardian-contact-reminders` cron errors rather than no-ops, as already recorded.

**Add to the pre-deploy list, before any traffic:**

1. `tsx --env-file=<prod env> scripts/apply-migrations.mjs` — takes production to 36.
2. `VALIDATE CONSTRAINT centers_wallet_balance_nonneg` — still `NOT VALID` there (the test branch inherited that too, which is what `c01` detected).
3. Fix `DATABASE_URL` in the app env to `edura_app` (FINDING 0) — the boot assertion will refuse to serve otherwise.

---

## Addendum A10 — first green CI run, and three structural findings

### A10.1 The run

Every step of the workflow, executed against the `edura-env:test` branch:

| CI step | Result |
|---|---|
| Typecheck | **6/6** |
| Unit (www) | **111 passed / 1 skipped** |
| Build both apps | **PASS** |
| Apply migrations to the test branch | 36/36, idempotent on re-run |
| Seed (4 seeds) | all four idempotent on re-run |
| DB suites — www (`test:db:ci`, 20 of 23) | **ALL PASS — 541 assertions, 0 failed** |
| DB suites — superadmin (18) | **ALL PASS — 585 assertions, 0 failed** |

**38 suites, 1,126 assertions, zero failures.** This is the first reproducible green run in the repo's history.

**`messaging-scope` is verified: 87/87.** That was the last unverified figure and the child-safety suite. **All 17 of `CLAUDE.md`'s named figures now reproduce exactly.**

Caveat on provenance: this was the CI *sequence* run locally against the real test branch, not a GitHub Actions run. Actions needs the repo secrets (`TEST_DATABASE_URL`, `TEST_DIRECT_URL`, `TEST_ADMIN_URL`) and a push, and pushing is not something this session does. Every command is the one the workflow invokes.

Two bugs in the workflow were found and fixed by running it:
- `packages/database/.env.test` was not materialised — the seeds read that file, not the app envs.
- `bun run --filter X exec` runs from the **repo root**, so `--env-file=.env.test` resolved to nothing and node exited 9. The migrate step now uses `working-directory: packages/database`.

### A10.2 `sweepTag` is CLEARED — the suspicion was wrong

§A9 named the sweeper as the prime suspect for two suites taking 1085s and 842s. Profiled with per-line timestamps:

```
messaging-scope suite body : 22:29:37 → 22:31:29    112s
                sweepTag   : 22:31:29 → 22:31:36      7s   (removed 15 rows)
```

**Seven seconds.** The sweeper is not the cause, and no optimisation is warranted. On the green run both suites were healthy in batch too (`messaging-scope` 183s, `room-ownership` 98s). The original 1085s/842s were transient Neon free-tier compute contention across 23 sequential suites — environmental, and it did not reproduce.

Recorded because the discipline matters more than the answer: the suspicion was stated as a suspicion, profiled before acting, and disproved. Optimising blind would have changed working code for no reason.

### A10.3 Three suites are structurally unrunnable — excluded, not left red

A permanently red test trains people to ignore red. These are now skipped by name via `--exclude`, and the runner prints `EXCLUDED (3): …` on every run so the exclusion is visible rather than silent.

| Suite | Why it cannot pass at any database state |
|---|---|
| `catalog-onboarding` | Calls `` `cacheTag()` is only available with the `cacheComponents` config ``. The service under test uses a Next.js cache API that has no runtime outside a Next server. **Restructure it or remove it from the suite** — it can never pass standalone. |
| `c01-lesson-settlement` | Uses network `fetch()` against `http://localhost:3002` / `:3004`. Needs a dev server running against the *same* branch with the *same* `NEXTAUTH_SECRET`. CI has no server. |
| `h03-seed-uuid-flows` | Same — 15 of its assertions fail with `401 unauthenticated` because the minted cookie is signed with the test secret while any running dev server holds the dev secret. |

**The distinction worth generalising:** `c04-login-parity` (72/72) and `invite-claim` (107/107) also exercise HTTP routes — but they construct `new Request(...)` and call the imported route handler **in-process**. No server, no port, no cookie-secret coupling. That is the pattern to standardise on, and it is the same one proposed for the `authz-sweep` replacement in §A6.

**`c01` keeps its exclusion from CI but stays a working alarm.** Its one genuine assertion failure — `✗ all 3 CHECKs are VALIDATED (not NOT VALID)` — correctly detects that the branch inherited production's un-validated `centers_wallet_balance_nonneg`. It is doing its job. Run it by hand after production is fixed; it should go green, and if it does not, production is not fixed.

### A10.4 `load-env` defaults to dev — same mechanism as the 2026-07-23 incident

`packages/database/scripts/load-env.ts` selects its env file from `EDURA_ENV`:

```
(unset)              -> packages/database/.env             (DEV)
EDURA_ENV=test       -> packages/database/.env.test
EDURA_ENV=production -> packages/database/.env.production
```

**Unset means dev.** So a bare `bun run --filter @repo/database seed` — the obvious command, the one in the README-shaped muscle memory — writes demo users, centers, courses and enrollments **into the dev database**. Every seed and script that imports `load-env` inherits this default.

**This is the same mechanism as the 2026-07-23 incident.** `db-guard.ts`'s own header records it: *"dev, tests, and (as documented) production all resolved to ONE Neon database, because every context read the same `.env.local`. 330 `@x.io` users and 83 unflagged centers were written into what was meant to be the launch database by test runs alone."* The lineage is direct — a default that silently resolves to a real database, with no explicit target in the command.

**What has changed, and what has not.** The label guard closed the *production* case: every seed calls `assertNotProduction`, and `seed.ts` reads the label rather than `NODE_ENV`, so production cannot be seeded by accident any more. **Dev is still exposed** — `assertNotProduction` is `assertDbEnv(["dev","test"])`, and dev is on the allow-list by design, because dev is where demo data is *supposed* to go. Nothing distinguishes "I meant dev" from "I forgot to say test".

Not fixed, deliberately. Recorded so the lineage is visible: dev's 3,435 rows of test residue and 958 orphans were produced by exactly this class of default, and the next 3,435 will be too unless the default becomes explicit. The smallest change that would close it is requiring `EDURA_ENV` to be set explicitly for any script that writes — turning a silent default into a named target.
