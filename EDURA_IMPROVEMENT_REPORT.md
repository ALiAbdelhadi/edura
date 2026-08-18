# Edura — Product & Engineering Improvement Report

**Analysed commit:** `ac5e941` (branch `main`, with a large uncommitted restructure in the working tree)
**Date:** 2026-08-18
**Method:** read-only static analysis of the monorepo — `packages/database/prisma/schema.prisma` (2,865 lines, ~90 models / ~55 enums), 425 API route files, 155 pages, the `@repo/server-core` domain kernel, the test suites, CI workflows, and the QA audit in `QA/01-findings.md`. No code was modified.

---

## 0. Framing — read this before Section 3

Two things must be said up front, because they change how the rest of the report should be read.

**Edura is not a Teachable/Thinkific competitor.** Those are *course marketplaces* — they sell recorded video to strangers on the internet. Edura is an **operations ERP for physical Egyptian private-lesson centers**: a student walks through a door, a receptionist checks them in at a counter, cash changes hands, an assistant re-checks them at the classroom door, and at session close the money splits three ways between platform, teacher, and center. The nearest real comparables are Classter, TeachWorks, Skolera, and the Egyptian incumbents (Ta3lom, Elmadrasah's back-office) — not Thinkific. I have therefore benchmarked against *those*, and where the brief asked for marketplace features (certificates, drip content, video libraries) I have said plainly when they do not fit.

**Several requested categories are explicitly descoped in `CLAUDE.md`.** AI bot / chatbot / AI assistant, scholarships, bookstore, and video lessons were **permanently dropped on 2026-07-21**. Section 3 of this report was requested with "AI-powered features (AI tutor, auto-grading, content generation…)" — an AI tutor and a chatbot are *directly* against that decision. I have not silently omitted them; instead every AI item in Section 3 carries an explicit tag:

- 🟢 **compatible** — no student- or parent-facing AI assistant surface; back-office or invisible-inference only.
- 🔴 **conflicts with the 2026-07-21 descope** — listed because you asked, flagged so you can decide knowingly rather than discover it later.

Everything else in this report is fully within scope.

---

## 1. Current State Analysis

### 1.1 What exists — the full feature inventory

This is a genuinely large, genuinely finished product. The following is what I found *in code*, not in docs.

#### Identity, auth, and accounts
- **better-auth 1.6.25** with **database sessions** (`AuthSession`, `AuthAccount`, `AuthVerification`), replacing next-auth. `apps/erp/src/app/api/auth/[...all]/route.ts`.
- **Hard session revocation** via `users.token_version` + a `users_revoke_sessions` DB trigger — a password reset kills every live JWT/session, proven in `apps/erp/tests/db/l1-session-invalidation.test.ts`.
- **TOTP two-factor** (`TwoFactor` model, `/two-factor`, `/two-factor-setup` in superadmin).
- **8 roles** (`Role` enum): `super_admin`, `accountant`, `center_admin`, `center_staff`, `teacher`, `assistant`, `parent`, `student` — plus **3 center-staff sub-tiers** (`CenterStaffRole`: `receptionist`, `manager`, `center_accountant`).
- **App partition:** `apps/erp` accepts only the 6 tenant roles; `apps/superadmin` accepts only `super_admin` + `accountant`, on a separate subdomain with separate cookie names.
- **Impersonation** — bounded and audited (`v1/admin/users/[id]/impersonate`, `v1/admin/impersonation/stop`).
- **Invite kernel** — one `InviteToken` table with an `InvitePurpose` → role claim map covering student, assistant, staff, teacher, center-admin invites (`v1/auth/invite/accept`).
- **Password reset, forgot-password, set-once credentials for walk-ins** (`v1/me/credentials`).
- **Registration doors** per role: `v1/auth/register/{student,parent,teacher,center}`.

#### The money engine (the strongest part of the codebase)
- **Double-entry ledger** — `Transaction` (types: `payment`, `commission`, `payout`, `refund`, `adjustment`), append-only, with `Invoice` and `Payout` built on top.
- **Three revenue-split models**, all snapshotted at course creation so config changes never retroactively re-rate a live course (`Course.splitPlatformBp/splitTeacherBp/splitCenterBp`, `pricingMethod`, `m2CenterFee`, `m2CenterBp`).
- **`resolveLessonPrice`** as the single derivation of what a lesson is worth (`packages/server-core/src/services/finance/fees.ts`); an unpriced lesson **refuses to settle** rather than settling zero.
- **`settlementBasis`** on `Course` — `course_price` vs per-session, made explicit rather than inferred.
- **Wallets**: student wallet (`WalletLedger`), parent wallet (`ParentWalletLedger`), center wallet (`Center.walletBalance` + a **validated** `centers_wallet_balance_nonneg` CHECK), teacher wallet.
- **Race-safety proven**: `SELECT … FOR UPDATE` on payout beneficiaries (`h1-payout-race.test.ts`), conditional decrement on settlement, a partial unique `transactions_one_refund_per_payment` preventing double refunds.
- **Commission chain**: `CommissionSetting` with `CommissionScope` — global → center → room resolution.
- **`SessionSettlement`** records + a settlement-preview endpoint (`v1/sessions/[id]/settlement-preview`) so a teacher can see the split *before* closing.
- **Payments**: cash (recorded at counter) and online. Cash mirrors to the ledger in the *same transaction* as the `Payment` row.
- **`PaymentIntent`** with HMAC-verified, idempotent webhook (`v1/payments/paymob/webhook`) — claim + settlement in one transaction, self-healing on redelivery (`m1-webhook-atomicity.test.ts`).
- **Money is read-only in the back office** — enforced by DB-level `REVOKE`s that bite for `super_admin` too.
- **Expenses**, **invoices**, **trial balance**, **center/teacher statements**, **refund reports** (`v1/finance/reports/*`).

#### Subscriptions & enrollment
- **`Subscription` wraps `Enrollment`** — enrollment is the roster link, the subscription is the payment coverage that access checks consult.
- Two plans (`SubscriptionPlan`): `monthly` (manual renewal) and `per_session` (single-session pass tied to one `sessionId`).
- Four targets/sources: subscribe to a **teacher** or a **center**; created online, at the counter, or by a parent.
- `expire-subscriptions` cron sweep on the `[status, periodEnd]` index.

#### Attendance (the operational core)
- **Two modes** per teacher (`AttendanceMode`): `counter_only`, `counter_and_door`.
- **Staged records** — `AttendanceRecord` carries `counterAt/counterBy` and `doorAt/doorBy` as *facts*, with `status` as the derived truth; `counter_only` is a distinct status that does **not** count as present and is flagged to the teacher.
- **The Counter Board** (`apps/erp/src/features/admin/counter/center-counter-screen.tsx`, 972 lines) — the center's first screen; three reads, writes nothing of its own.
- **Offline attendance capture** with `synced` + `localTimestamp`, server-wins conflict resolution (`v1/teacher/attendance/sync`, `offline-sync.test.ts`).
- **QR + manual student-code check-in**, with the check-character student code v2 (`student-id-card.tsx`) and a **signed, session-less** card QR (`v1/me/student-card`, `student-qr-credential.test.ts`).

#### Center operations
- **Rooms** with profiles, photos, per-room pricing method and split.
- **Collaboration requests** — replaced `ClassroomBooking` and the affiliation invite; carries `proposedCenterShare`; one-transaction acceptance creates the class + schedule.
- **Center staff accounts** with preset sub-roles and default-closed exclusions, all audited as "staff X on behalf of center Y".
- **External teachers** — off-system teachers a center runs by manual entry; a `users` row with `status='shell'`, `password_hash NULL`. Full sub-module: grades, students, settlements, statements, balances, gap detection, convert-to-real-account (`v1/center/external-teachers/**`, 11 endpoints).
- **Walk-in registration** — creates the student, sends WhatsApp with student ID + tokenized onboarding link (`walk_in_onboarding` tokens, narrow provider, duplicate-by-phone detection).
- **Bulk CSV student import** with per-row transactions and dry-run (`v1/center/students/import`).
- **Blacklist** — 3 levels (platform/center/teacher), reason-required, reversible, with cascade reversal that warns on over-capacity restore.
- **Team notes** — an internal to-do board for center staff and teacher assistants, with read receipts.
- **Expenses**, **audit log viewer**, **enrollment request approvals**, **deletion requests**.

#### Teacher & assistant
- **Assistant delegation** — one assistant serves exactly one teacher (partial unique on `assistantId WHERE removedAt IS NULL`); default-closed permission model excluding wallet/payouts/other-assistants; every action audited as "assistant X on behalf of teacher Y".
- Gradebook (`Grade` + `GradeScore`), materials upload (Cloudinary, PDF magic-byte checked), schedule, door check-in, wallet + payout requests, reviews received, center affiliations.

#### Student & parent
- **Onboarding wizard** — academic year + track (شعبة) → subjects auto-assigned from the catalog mapping.
- **Subjects page** — track subjects by default, separate "browse all" mode.
- **Student ID card** with print route and a guilloché design.
- **Wallet** (top-up online/cash, pay-from-wallet all-or-nothing), **points** (`PointsRule` + `PointsLedger`), **receipts**, **grades**, **attendance**, **materials**, **reviews**, **family code**.
- **Parent**: multi-child oversight, pays for a child's lesson (money direction deliberately unchanged — `fromEntityId` stays the student), parent wallet, message oversight, progress view.
- **The "جرّب بنفسك" emulator** (`apps/erp/src/features/*/emulator/`) — a fully interactive, write-free, resumable simulator of each role's portal, used as first-run onboarding. **This is a real differentiator and I have not seen it in any comparable product.**

#### Messaging & realtime
- `apps/realtime` — a standalone **Socket.IO** server on Bun, outside Next.js because serverless can't hold WebSockets.
- **Relationship-scoped** 1:1 conversations + **groups** (`ConversationGroup`, `GroupMember`, `GroupPostPolicy`), with an SSOT policy matrix in `packages/database/src/queries/chat-scope.ts` (1,054 lines).
- **Blocks and reports** (`ConversationBlock`, `ConversationReport`) with a superadmin moderation queue.
- **Child-safety gate**: a MINOR with no verified guardian *email* has adult-facing messaging locked; `isMinor()` is one positive adult condition, so missing/unverified DOB all resolve to MINOR.
- **Parent oversight** of a child's conversations.

#### Notifications & comms
- **38 notification types** (`NotificationType`) with per-type channel config and deep-link routing (`packages/server-core/src/services/notifications/deep-link.ts`).
- **Channels**: in-app, email (SMTP/nodemailer with React email templates), **Web Push** (VAPID, `WebPushSubscription`), **FCM** (`UserDeviceToken`), **WhatsApp** (Meta Cloud API driver + mock driver, `WhatsAppMessage` log).
- **8 scheduled jobs** (`v1/cron/[job]`): month-end statements, lesson reminders, expire payment intents / subscriptions / collaboration requests, guardian-contact reminders, data exports, weekly center digest.

#### Platform / back-office (`apps/superadmin`)
- 36 pages, 204 route files. Cross-center **oversight** (18 read endpoints per center), center approval, user directory with audited actions, catalog CRUD (systems/stages/grades/tracks/subjects/offerings), points rules, commission & revenue-split settings, feature flags, WhatsApp log, contact submissions, messaging moderation, decision queue, KPI dashboard with revenue and user-growth charts.
- **Accountant portal** — finance screens only, enforced at the API layer.

#### Compliance & data rights
- `DataExportRequest` + `DeletionRequest` with approve/reject flows, soft-delete everywhere, `AuditLog` on every back-office write.

#### Platform infrastructure
- **Egyptian education catalog** — `EducationSystem` → `Stage` → `GradeLevel` → `Track` → `Subject` → `SubjectOffering` (45 subjects, 411 offerings in production), driving all content matching.
- **Global search** (⌘K palette) in both apps, adding no reach beyond what the caller's role already reads.
- **i18n** — `next-intl`, Arabic-first with RTL, 14 namespaced dictionaries + root files (~79 KB of strings).
- **PWA** — Serwist service worker, offline page, install prompt.
- **In-app help** — 30+ MDX articles per locale (`apps/erp/src/content/help/`), plus guided tours per role.

---

### 1.2 Tech stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo 2.10 + **Bun 1.3.12** (only package manager *and* runtime) |
| Framework | **Next.js 16.3** App Router, **React 19.2**, **TypeScript 7.0.2** |
| Styling | **Tailwind v4** (`@theme` tokens), shadcn/Radix primitives in `@repo/ui` (69 components) |
| Data | **Prisma** + **Neon Postgres** (serverless driver over WS), RLS via a `NOBYPASSRLS` `edura_app` role, `scopedDb()` / `platformDb()` |
| Auth | **better-auth 1.6.25**, DB sessions, TOTP 2FA |
| Realtime | **Socket.IO** on a standalone Bun process (Railway) |
| Media | **Cloudinary** (deterministic public_ids, magic-byte validation) |
| Mail | **nodemailer/SMTP**, provider-agnostic (deliberately not Resend — Egyptian card constraints) |
| Observability | **Sentry** + **PostHog** (`@repo/observability`) |
| Testing | **Vitest 4** (75 unit + 44 DB suites in erp, 24 DB in superadmin), **Playwright** (8 specs) |
| CI/CD | GitHub Actions (5 workflows), **Vercel** for both Next apps, **Railway** for realtime |

**Scale:** ~143 k lines of first-party TS/TSX. `apps/erp` 69.9 k · `apps/superadmin` 32.3 k · `packages/server-core` 22.4 k · `packages/database` 16.1 k · `packages/ui` 12 k · `apps/www` 6.5 k · `apps/realtime` 0.6 k.

---

### 1.3 Strengths

1. **The money engine is the best-engineered part and it is not close.** Snapshot-at-creation splits, one price derivation, a refuse-to-settle-zero rule, `FOR UPDATE` on beneficiaries, conditional decrements, a validated non-negative CHECK, and a partial unique that makes double-refund structurally impossible. Most products this size have none of that.
2. **Decisions are written down with their rejected alternatives.** `docs/decisions/` (26 documents) records *why*, not just *what*. The "Binding invariants" block in `CLAUDE.md` is a genuine architectural constitution. This is rare and it is why the codebase has stayed coherent at 143 k lines.
3. **Authorization is real and it has been attacked.** The QA pass in `QA/01-findings.md` probed 9 principals across every gate class and found **zero criticals**, one high (now fixed with a regression suite), and no SQL injection anywhere. Tier inheritance, hard exclusions, the read-only accountant, the app partition, and hard revocation all behaved as documented under live HTTP attack.
4. **Domain modelling matches the actual Egyptian market.** Counter-then-door check-in, cash-at-the-counter as a first-class path, walk-in-plus-WhatsApp onboarding, external (off-system) teachers, per-attending-student room rates. These are not generic-SaaS abstractions; they are the workflow.
5. **Arabic-first with real RTL**, not a bolted-on translation layer — including the 12-hour clock with the day period in words, and a documented Arabic-mono typography trap.
6. **Delegation is modelled properly.** Assistants and center staff act *on behalf of* a principal with audit attribution and default-closed permissions, rather than being handed a second copy of the principal's role.
7. **Child safety is default-closed** — `isMinor()` resolves missing data to MINOR, and the guardian gate requires an *email*, not a phone.
8. **The role emulator.** A write-free, resumable, interactive practice copy of each portal. For an audience of counter staff who are not all formally computer-literate (per your own recorded note on the operator audience), this is worth more than any amount of documentation.

### 1.4 Weaknesses

1. **🔴 Online payment does not work.** `apps/erp/src/lib/services/payments/gateway/paymob-driver.ts` is an 84-line stub whose `createCheckout` and `verifyWebhook` **throw `BusinessRuleError("Paymob driver not implemented yet")`**. Every online path — student subscribe, wallet top-up, parent-pays — is mock-only. The entire online revenue channel is closed. This is the single largest gap in the product.
2. **🔴 There is no academic layer.** No `Assignment`, no `Submission`, no `Quiz`, no `Attempt` model exists in the 2,865-line schema (I checked every one of those strings — zero hits). `MaterialType.homework` is a *file the teacher uploads*; nothing is ever turned in, nothing is ever marked. The `homework_deadline` notification type has channel config and deep-link routing in `notifications/notify.ts:60` and `deep-link.ts:155` — **and no producer anywhere in the codebase**. It is a wire hanging out of the wall.
3. **🔴 A latent data bug in `Review`.** The model carries `lessonId` with the comment *"for per-lesson ratings (PRD)"* — but the table has `@@unique([studentId, teacherId])`. A student can leave **exactly one** review per teacher, ever. Per-lesson ratings are structurally impossible; the second insert will throw P2002. Either the constraint or the column is wrong.
4. **🟠 Monthly subscriptions have no renewal path.** `SubscriptionPlan.monthly` is documented as "manual renewal by paying again"; the `expire-subscriptions` cron expires them and there is **no renewal reminder job** and no pre-expiry notification type. A student's access silently dies. In a market where the alternative is the teacher's WhatsApp group, that is the churn mechanism.
5. **🟠 The platform has no product to sell.** Monetization is 100% transactional commission (`CommissionSetting`). There is no plan/tier/licensing model — no `Plan`, no `Coupon`, no `Discount`, no `Referral`, no `Affiliate` table (all zero hits in the schema). A center with 40 students and a center with 4,000 pay the same *structure*, and nothing in the schema can express "this center is on the Pro tier".
6. **🟠 Enrollment tracks no progress.** `Enrollment` has `status`, `enrolledAt`, `unenrolledAt` and nothing else — no completion %, no sessions-attended rollup, no last-activity. Every "how is my child doing" answer must be recomputed from `AttendanceRecord` + `GradeScore` on every request.
7. **🟠 The gradebook is one flat table.** `Grade` has `name`, `gradeType`, `maxScore`, `date`. No weighting, no category, no term/semester, no curve, no comment field, no rubric, no drop-lowest. `GradeScore` is `{gradeId, studentId, score}` — no per-item feedback, no marked-by, no marked-at.
8. **🟠 Open security findings from your own QA pass.** M-1: login brute-force is bypassable by rotating `X-Forwarded-For`, and there is **no per-account lockout** — only per-IP. L-4: internal secrets compared with `===` rather than constant-time. Both verified, both open. *(Corrected 2026-08-18: M-2, the device-token ownership hijack, is **already fixed** — `apps/erp/src/lib/services/notifications/push-registration.ts` holds the rule for both channels and `push-registration-ownership.test.ts` passes 16/16. This report originally listed it as open by following the QA document's executive summary, which is stale relative to its own M-2 section.)*
9. **🟠 CSP is Report-Only in both apps** (`apps/erp/next.config.ts:60`, `apps/superadmin/next.config.ts:40`). It has been Report-Only since the H4 fix; flipping it to enforce needs nonce-based `script-src`.
10. **🟠 No test database exists.** Both `.env.test` files point at **dev** (documented decision, 2026-08-03). CI's DB job mutates the same database developers use. `QA/progress.md` records the auditor refusing to use it and standing up a disposable local Postgres instead — which is the correct instinct and also the proof that the setup is wrong.
11. **🟠 Backups are not running and no cron job is scheduled.** Per `CLAUDE.md`: the nightly backup schedule is disabled (no bucket, no `BACKUP_*` secrets) and **Neon PITR is the only protection in force**; neither `CRON_BASE_URL` nor `CRON_SECRET` is set as a repo secret, so all 8 scheduled jobs are inert. Lesson reminders, subscription expiry, and the weekly digest are all written and none of them run.
12. **🟡 Screen components are too large.** `admin-classes-screen.tsx` 1,560 lines, `admin-fees-screen.tsx` 1,248, `academic-tabs.tsx` 1,105, `chat-screen.tsx` 1,105, `collaboration-panel.tsx` 1,058, `admin-rooms-screen.tsx` 1,002. These are the files where the next regression will live.
13. **🟡 Playwright coverage is thin** — 8 specs for 155 pages, and the E2E suite depends on demo seed data that the 2026-07-31 wipe removed from dev.
14. **🟡 Schema debt carried forward.** `Course.subject` and `Course.gradeTag` are marked DEPRECATED free text but still `NOT NULL` / present alongside their catalog replacements; the three `chatbot_*` tables are inert by decision; `expected-db-shape.json` is committed at 48 while the tree says 52.

---

## 2. Missing Core Features

Ordered by how much each one costs you *today*.

### 2.1 A working online payment gateway 🔴
**Where:** `apps/erp/src/lib/services/payments/gateway/paymob-driver.ts` — the four TODOs are already written out in exact sequence (auth token → order registration → payment key → iframe/redirect hand-off), and the HMAC field concatenation order is documented in the stub. `PaymentIntent`, the idempotent webhook, and the settlement path are all built and tested against the mock driver.
**Why it matters:** everything downstream — student wallet top-up, parent-pays-lesson, online subscribe — is already wired and reachable through UI that currently throws. This is the highest ratio of value-unlocked to work-remaining anywhere in the repo.
**What's needed:** implement the four TODOs, add the sandbox credentials, and run the existing `m1-webhook-atomicity` suite against sandbox instead of mock.

### 2.2 Assignments and submissions 🔴
**Gap:** zero models. `MaterialType.homework` is upload-only; `homework_deadline` fires from nowhere.
**Proposed shape** (additive, migration-safe, follows existing conventions):
- `Assignment` — `courseId`, `teacherId`, `title`, `description`, `dueAt`, `maxScore`, `allowLate`, `attachmentMaterialId?`, `dataSource`, `isDemo`.
- `AssignmentSubmission` — `assignmentId`, `studentId`, `submittedAt`, `bodyText?`, `cloudinaryPublicId?`, `score?`, `feedback?`, `gradedBy?`, `gradedAt?`, `@@unique([assignmentId, studentId])`.
- Wire the existing `homework_deadline` notification (its deep link already points at `/subjects`) from a new `assignment-deadlines` cron job alongside `lesson-reminders` in `apps/erp/src/lib/services/cron/jobs.ts`.
- Reuse the material upload path — magic-byte validation and Cloudinary public_id derivation already exist.

### 2.3 Quizzes / in-app assessment 🔴
**Gap:** zero. Every exam in Edura today is a paper exam whose score a teacher types into `GradeScore`.
**Proposed shape:** `Quiz` → `QuizQuestion` (MCQ / true-false / short-answer) → `QuizAttempt` → `QuizAnswer`, with auto-scoring for objective types writing straight into the existing `Grade`/`GradeScore` tables so the gradebook stays the single source of truth. Deliberately *not* a new grading engine — the same rule as "no second money engine".
**Market note:** for Egyptian centers the killer variant is the **paper-exam bubble sheet scan** — a teacher photographs a marked answer sheet and the scores land in the gradebook. That fits the physical-center reality far better than an online quiz does.

### 2.4 Progress tracking as stored state 🟠
**Gap:** `Enrollment` stores no progress. Parent "progress" screens recompute from raw records every load.
**Proposal:** add a denormalised rollup — `Enrollment.sessionsHeld`, `sessionsAttended`, `lastAttendedAt`, `avgScorePct`, `updatedRollupAt` — maintained by the existing session-complete trigger (the same hook that runs `distributeSessionRevenue`). One write where you currently do N reads, and it makes "students at risk" a query instead of a report.

### 2.5 Renewal reminders and a renewal path 🟠
**Gap:** monthly subscriptions expire silently.
**Proposal:** a `subscription-renewal-reminders` cron job (the `[status, periodEnd]` index already exists precisely for this sweep) firing at T-5 / T-2 / T-0 across in-app + WhatsApp; a new `subscription_expiring` notification type; and a one-tap **Renew** action that re-runs `subscriptions/checkout` with the previous plan pre-filled. Explicitly *not* auto-charge — that would need stored cards and is a separate risk decision.

### 2.6 A parent/student calendar feed 🟠
**Gap:** `Session` has everything needed (date, times, room, course) and there is no `.ics` export.
**Proposal:** a signed, revocable per-user `.ics` subscription URL. Uses the same signed-URL primitive as the student card QR (`STUDENT_QR_SECRET` pattern) — mints no session, grants nothing, and can be revoked.

### 2.7 Certificates 🟡
Requested in the brief. **Honest assessment: low value for this market.** A center's completion certificate is a paper thing the center prints itself; nobody in Egyptian K-12 private lessons is collecting digital course certificates. If you build it, build it as a **PDF generated from the existing `pdf-lib` + print-route pattern** (`student-id/print`, `receipts/[paymentId]`), keyed off attendance ≥ threshold — not as a new credential system. Effort is small precisely because the print infrastructure exists.

### 2.8 Live/online classes 🟡
`Course.location` accepts free text like "Online" but there is no meeting-link field, no join button, no attendance-from-join.
**Minimum viable:** add `Course.meetingUrl` + `Session.meetingUrl` (session overrides course), a Join button gated by the same subscription-coverage check attendance uses, and mark attendance on join. **Do not build video infrastructure** — link out to whatever the teacher already uses. Note this sits adjacent to the descoped "video lessons" item; a *live link* is not a *recorded video library* and I read it as in-scope, but flag it to yourself.

### 2.9 Smaller genuine gaps
- ~~No teacher availability / conflict detection.~~ **CORRECTED 2026-08-18: this was wrong.** `packages/server-core/src/services/sessions/conflict-detector.ts` implements both sides properly — `checkConflicts` is the write gate (teacher *and* room, half-open overlap so back-to-back lessons don't cry wolf) and `findScheduleClashes` is the calendar read side. The real defect was narrower and is now fixed: `createCourse` committed the course row and *then* generated sessions in a **second** transaction, so a conflict returned 409 while leaving a committed course with zero sessions. The edit path had already been made atomic; create had not. See `course-create-atomicity.test.ts`.
- **No waitlist.** `Course.maxStudents` exists and full courses just refuse; `enrollment_restored_over_capacity` shows you already hit the capacity edge case from the other direction.
- **No makeup/compensation session flow.** `SessionStatus` has `postponed` and the reason field, but no "this session replaces that one" link, so a postponed session's money and attendance have no successor.
- **No student-facing receipt archive** — `receipts/[paymentId]` renders one; there is no list.
- **Reviews are teacher-only.** No center reviews despite `Review.centerId` existing, and `@@unique([studentId, teacherId])` blocks the per-lesson ratings the schema comment promises (see §1.4.3).

---

## 3. Growth & Differentiation Features

### 3.1 Lean into what nobody else has

**a) Ship the emulator as an acquisition asset.**
`apps/erp/src/features/*/emulator/` is a working, write-free, resumable copy of every portal. Today it lives behind login at `/dashboard/student/practice`. Put it on the **public marketing site** (`apps/www`) as "جرّب Edura دلوقتي" — no signup, no email. Nothing in it touches the network, so it is safe to expose. For a market where the buyer is a center owner deciding in five minutes whether this is too complicated for their receptionist, letting them *drive the counter board* beats every screenshot. **This is the single highest-leverage growth move in the report and the code already exists.**

**b) Make the counter the moat.**
Competitors sell dashboards. Edura's counter board, staged counter→door check-in, walk-in-plus-WhatsApp onboarding, and cash-first money path are the things a center *cannot* replicate with a spreadsheet plus a WhatsApp group. Market the 30-second walk-in: student arrives → receptionist types a phone number → account created, WhatsApp sent with ID + onboarding link, cash recorded, checked in. Everything in that sentence is already built (`v1/center/walk-in`, `v1/center/checkin`).

**c) The external-teacher module as a wedge.**
`v1/center/external-teachers/**` lets a center run teachers who are *not on Edura at all* — with grades, settlements, and statements. That means a center can adopt Edura **without recruiting a single teacher first**, and each external teacher is a pre-qualified conversion target sitting in the center's own data (the `convert` endpoint already exists). No competitor I know of models this. Sell it as "your teachers don't have to sign up."

### 3.2 AI features

Every item is tagged against the 2026-07-21 descope decision.

| Feature | Tag | What it does | Why it fits |
|---|---|---|---|
| **At-risk student detection** | 🟢 compatible | Weekly job scores each student on attendance decay, grade trend, payment lateness, and login gap; surfaces a ranked list on the teacher and center dashboards with the *reason*. | No assistant surface, no chat, no student-facing AI. It's a ranked query with a model behind it. Feeds the `weekly-center-digest` that already exists. |
| **Attendance & revenue forecasting** | 🟢 compatible | Predicts next month's attendance and revenue per course from `Session` + `AttendanceRecord` + `Transaction` history; drives capacity and staffing decisions. | Pure back-office analytics on data you already store. |
| **Bubble-sheet / paper-exam OCR** | 🟢 compatible | Teacher photographs a marked paper answer sheet; scores land in `GradeScore`. | Invisible inference, no assistant. Solves the *actual* Egyptian grading workflow rather than importing an American one. Highest practical value of any AI item here. |
| **Arabic handwriting → gradebook** | 🟢 compatible | Same as above for handwritten mark sheets. | Same reasoning. |
| **Auto-grading of objective quiz items** | 🟢 compatible | Deterministic scoring of MCQ/true-false — no model needed at all. | Depends on §2.3 landing first. |
| **Smart schedule / room allocation** | 🟢 compatible | Proposes a conflict-free timetable across teachers, rooms, and grade levels; a constraint solver, not an LLM. | Uses `Room`, `Course.daysOfWeek`, `Session`. Directly fixes the missing conflict detection in §2.9. |
| **AI-drafted parent communications** | 🟢 compatible | Center staff clicks "draft absence follow-up"; gets an Arabic draft they edit and send. Staff-facing, human always sends. | Adult staff tool, not a student surface. Still — it is a generation feature, so confirm you consider it distinct from "AI assistant" before building. |
| **Personalised learning paths** | 🔴 conflicts | Would need a content library to sequence, and the content library (video lessons) is descoped. Structurally blocked, not just policy-blocked. |
| **AI tutor / homework helper** | 🔴 conflicts | Directly the descoped "AI tutor". Also a child-safety surface, and your guardian gate exists precisely because adult-facing surfaces for minors are treated as high-risk. |
| **Support chatbot** | 🔴 conflicts | Directly descoped. The `chatbot_config` / `chatbot_faq` / `chatbot_conversations` tables exist and are *deliberately inert*. The 30+ MDX help articles are the chosen answer to this problem. |

### 3.3 Network-effect features

- **Center discovery marketplace.** `v1/search/centers`, `v1/search/teachers`, `v1/search/courses` and the public `centers/[id]` page already exist. Turn them into a real directory with location, subject, price band, and rating filters — and the platform becomes a demand channel, not just software. That flips the sales conversation from "pay me for a tool" to "I bring you students."
- **Parent referral loop.** The mechanic that actually works in this market is parent-to-parent. `family-code` and the invite kernel already exist; a referral credit to the student's wallet closes the loop (needs §4.3).
- **Teacher portability.** A teacher who works across three centers has one Edura account, one gradebook, one wallet. `CenterTeacherAffiliation` + collaboration requests already model this. Make it the teacher-side pitch.
- **Public teacher profile pages** with real ratings — fed by fixing the `Review` unique constraint (§1.4.3). SEO-indexable via `apps/www`.

---

## 4. Monetization & Business Features

Today: **transactional commission only**, resolved global → center → room through `CommissionSetting`. Nothing else exists. Zero schema hits for coupon, discount, promo, referral, affiliate, trial, or plan.

### 4.1 Center subscription tiers
Add a `Plan` + `CenterSubscription` pair so the platform can sell software, not only take a cut:

| Tier | Shape | Gate |
|---|---|---|
| Free | ≤50 active students, 1 room, no external teachers, standard commission | `Center.studentCount` |
| Growth | ≤300 students, unlimited rooms, external teachers, reports export, lower commission | |
| Pro | Unlimited, multi-branch, API access, priority support, lowest commission | |

The **enforcement primitive already exists** — `FeatureFlag` (`v1/admin/feature-flags`) is a global key/bool. Extend it to a per-center entitlement check and every gate above becomes one function call. Trading commission points for subscription revenue is also the standard way to make the pricing legible to a center owner who hates variable cost.

### 4.2 Coupons and discounts
`Coupon` — `code`, `type` (percent/fixed), `value`, `scope` (platform/center/teacher/course), `maxRedemptions`, `perStudentLimit`, `validFrom/validTo`, `minAmount`. Applied at `v1/subscriptions/checkout`, **snapshotted onto the `Subscription` row** (`discountAmount`, `couponId`) exactly as prices are snapshotted today, and mirrored to the ledger as an `adjustment` transaction so the books stay balanced. Critical for the Egyptian back-to-school season and for sibling discounts, which centers give informally today and record nowhere.

### 4.3 Referral / affiliate
`Referral` — `referrerUserId`, `refereeUserId`, `code`, `status`, `rewardAmount`, `rewardedAt`. Payout goes into the **existing wallets** (student wallet for parents, teacher wallet for teachers) — no new money path, per your "no second money engine" invariant. Teachers referring centers is the highest-value edge in this graph and the one most worth paying for.

### 4.4 B2B / school licensing
The schema is already multi-tenant per `Center`. What's missing for a school group is a **`CenterGroup` / branch parent** — consolidated reporting across branches, a group-level admin role, and one invoice. `v1/finance/reports/center-statement/[centerId]` already produces the per-branch artifact; the group version is an aggregation over it. This is the largest deal size available to you and the smallest schema change of anything in Section 4.

### 4.5 Revenue analytics you don't have
`v1/finance/dashboard`, `revenue-chart`, `trial-balance`, and `reports/revenue` give you *accounting*. They do not give you **SaaS metrics**: MRR/ARR, churn %, LTV, CAC, cohort retention, ARPU per center, net revenue retention, expansion vs contraction. Add a platform-metrics screen in `apps/superadmin` built on the existing `Transaction` + `Subscription` tables. Related: `v1/reports/enrollment-funnel` exists for centers — the *platform's own* funnel (center signup → approval → first student → first payment) does not.

### 4.6 Smaller revenue levers already half-built
- **Paid WhatsApp credits** — the infrastructure exists (`WhatsAppMessage` log with per-message rows); metering and billing does not. Templated messages have real per-message cost, so this is margin protection as much as revenue.
- **Printed student ID cards** as a paid service — the card, the QR credential, and the print route are all built.
- **Featured placement** in the center/teacher directory (needs §3.3).

---

## 5. UX / UI Improvements

Grounded in specific files.

1. **Split the six 1,000+ line screens.** `admin-classes-screen.tsx` (1,560), `admin-fees-screen.tsx` (1,248), `academic-tabs.tsx` (1,105), `chat-screen.tsx` (1,105), `collaboration-panel.tsx` (1,058), `admin-rooms-screen.tsx` (1,002). Each is a whole feature in one component. Extract table, filters, and each dialog into siblings — the `@repo/ui` `data-table.tsx` and `confirm-dialog.tsx` primitives already exist to receive them.

2. **Give the counter board a keyboard-only path.** `center-counter-screen.tsx` is used all day by a receptionist with a queue in front of them. Every action should be reachable without leaving the keyboard: type student code → Enter → confirm → next. `kbd.tsx` and `command.tsx` exist in `@repo/ui`. This is the highest-frequency screen in the product and the one where seconds compound.

3. **The `counter_only` status needs to shout.** It is a distinct status that deliberately does *not* count as present — the exact case where a student is in the building but never reached the classroom. Today it renders through the generic `status-badge.tsx`. It should be an unmissable, filterable, actionable state on the teacher's attendance screen with a one-tap "mark present" resolution.

4. **Consolidate the settings pages.** Seven separate `dashboard/*/settings/page.tsx` files across roles. The shared parts (profile, locale, theme, password, notification prefs, device tokens) should be one composed shell with role-specific slots — otherwise a change to notification preferences is a seven-file edit.

5. **Give the student dashboard a "what's next" hero.** `dashboard/student/page.tsx` should lead with: next session (when, where, which teacher), any unpaid/expiring subscription, and any new grade. Right now the most time-critical facts compete with everything else for attention.

6. **Surface subscription expiry everywhere it matters.** Once §2.5 lands, the countdown belongs on the student dashboard, the subjects page, and the parent children view — not only in a notification that can be missed.

7. **Empty states should teach, not apologise.** `empty-state.tsx` exists; with the 2026-07-31 dev wipe, a fresh center sees empty screens on day one. Each should carry the single next action ("add your first room", "invite a teacher") — the `dashboards/admin/checklist` endpoint already computes exactly this and should drive them.

8. **Mobile-first on the parent portal.** Egyptian parents are on phones. `bottom-nav.tsx` exists; verify every parent route is reachable from it and that `parent/pay` works one-handed. A payment flow that needs two hands loses money.

9. **Print routes deserve a print stylesheet review.** `reports/print`, `student-id/print`, `receipts/[paymentId]` are physical artifacts a center hands to a parent — they are brand surface, not debug output.

10. **The 8 unrouted notification types.** `homework_deadline` (§1.4.2) has full deep-link and channel config with no producer. Audit `NotificationType` for other orphans; a type that can never fire is a promise in the enum the product doesn't keep.

---

## 6. Technical Improvements

### 6.1 Security (highest priority first)

| ID | Finding | Fix |
|---|---|---|
| **M-1** | Login brute-force bypassable by rotating `X-Forwarded-For`; **no per-account lockout** — limiting is per-IP only. Verified in `QA/01-findings.md:159`. | Trust only `TRUSTED_PROXY_HOPS` from the right (the config exists in `packages/server-core/src/rate-limit/`), **and** add a per-account counter keyed on the email — exponential backoff after 5 failures. Per-IP alone cannot stop a distributed attempt on one account. |
| **M-2** | Device-token ownership hijack (`v1/me/device-tokens`). Verified. | Ownership check on write. A regression suite exists next door (`push-registration-ownership.test.ts`) to copy. |
| **L-4** | Internal secrets compared with `===`. `[STATIC]` | `crypto.timingSafeEqual` — the pattern is already used for the payment HMAC (C1). |
| **H4** | CSP is **Report-Only** in both apps (`apps/erp/next.config.ts:60`, `apps/superadmin/next.config.ts:40`). | Move to nonce-based `script-src`, then flip to enforce. Report-Only that nobody reads is a header, not a control. |
| **M8** | `$queryRawUnsafe` still present (open in the security batch). | Parameterise or kill. |
| — | **Backups are not running.** Per `CLAUDE.md`, the nightly schedule is disabled and **Neon PITR is the only protection in force**. `docs/runbooks/backup-restore.md` records the pause at 95%, blocked on a Read+Write B2 key. | Finish it. This is the one failure mode with no recovery path. |
| — | **No cron job runs anywhere.** Neither `CRON_BASE_URL` nor `CRON_SECRET` is a repo secret. All 8 jobs are inert. | Set both secrets. Lesson reminders, subscription expiry, guardian reminders, and the weekly digest are all written, tested, and doing nothing. |

### 6.2 Testing

- **Stand up a real test database.** Both `.env.test` files point at **dev**; CI mutates the database developers use. `QA/progress.md` documents the auditor refusing it and using a disposable local Postgres — that container recipe is the fix, promoted into `docker-compose.test.yml` and CI. This also removes the documented dev-DB suite interference where concurrent sessions make `h04`'s money census fail spuriously.
- **Playwright is at 8 specs for 155 pages.** Priority order: the counter check-in flow, subscribe-and-pay, walk-in registration, parent-pays, and the door check-in — the five paths where a regression costs money on the day it ships.
- **The E2E suite depends on demo data the dev wipe removed.** Either re-seed or move E2E onto the disposable DB above; right now `test:e2e` cannot pass from a clean checkout.
- **`test:db:ci` excludes three suites** (`catalog-onboarding`, `c01-lesson-settlement`, `h03-seed-uuid-flows`) — including the lesson-settlement suite, which covers the money engine. Fix and re-include.
- **7 erp + 2 superadmin assertions were failing** at the audited commit (per the QA header). Green or triaged, not both.

### 6.3 Performance & scalability

- **`Enrollment` rollups (§2.4)** remove the recompute-on-every-load pattern behind every parent and teacher progress view.
- **Neon serverless + a per-request `token_version` lookup on every authenticated request** (the L1 design). It is one indexed PK lookup, and it is on the hot path for every request in the system. Cache it in the session record with a short TTL — the invalidation trigger already exists to bust it.
- **Reports are computed live.** `packages/server-core/src/services/reports/reports.ts` is 1,131 lines of aggregation. Materialise the monthly ones (a `report_snapshots` table filled by the existing `month-end-statements` cron) — the export-runs-the-same-service-function invariant is preserved as long as the snapshot is what both read.
- **Chart payloads.** `revenue-timeseries`, `expenses-timeseries`, `user-growth-chart` should return pre-bucketed series, not rows for the client to fold.
- **Honour the post-launch caching decision as written** in `CLAUDE.md`: measure real traffic first, optimise specific slow paths, and **never cache money, wallets, subscriptions, attendance, messaging, or auth**.

### 6.4 Code quality

- **`packages/server-core` has 30 service directories and is the right home for domain logic** — but `apps/erp/src/lib/services/` shadows several of them (`payments/`, `cron/`). Two places to look for the same concept is how the payment gateway ended up living in the app rather than the kernel. Consolidate.
- **`packages/database/src/queries/chat-scope.ts` is 1,054 lines** and is the messaging policy SSOT. It deserves to be a directory with the policy matrix, the scope resolver, and the guards separated — it is the file most likely to be edited under pressure.
- **Kill the deprecated columns.** `Course.subject` and `Course.gradeTag` are marked DEPRECATED and still carried alongside `subjectId` / `gradeLevelId`. Every new query must decide which to trust.
- **`expected-db-shape.json` is committed at 48, tree says 52.** A `verify-db` run reporting "expected 52, got 50" against production is currently a *known artifact*, which means the check has stopped being a signal. Commit the bump.
- **`apps/erp` has package name `edura` but directory `erp`.** With `apps/showcase` → `apps/www` renamed in the same working tree, the naming is mid-flight. Land it before the next person joins.

### 6.5 CI/CD

- **CI is good and honest** — the header comment in `ci.yml` explaining that pre-2026-07-26 "119/119 green" claims came from one machine is exactly the right instinct.
- **Add to it:** a `bun audit` gate, a Playwright job (once §6.2 lands), a Lighthouse budget on `apps/www`, and a **migration-drift check against production** (`verify-db` is read-only and safe against any target — running it in CI would have caught the 2026-08-02 outage where better-auth code shipped against a database with no auth tables).
- **Encode the migration-order lesson as a check.** The `contact_submissions`-before-`maturity_layer` incident cost a repair. A CI step asserting that every migration in the branch sorts after the last one applied to production would catch the whole class.

---

## 7. Prioritized Roadmap

Priority = P0 blocks revenue or risks data · P1 high value, near-term · P2 valuable, not urgent · P3 opportunistic.

| # | Feature | Impact | Effort | Priority | Phase |
|---|---|---|---|---|---|
| 1 | **Implement the Paymob driver** (4 TODOs in `paymob-driver.ts`) | High | Med | **P0** | MVP+ |
| 2 | **Set `CRON_SECRET` + `CRON_BASE_URL`** — unblock all 8 scheduled jobs | High | Low | **P0** | MVP+ |
| 3 | **Finish backup provisioning** (B2 key, enable schedule) | High | Low | **P0** | MVP+ |
| 4 | **Fix M-1** — per-account lockout + trusted proxy hop | High | Low | **P0** | MVP+ |
| 5 | ~~Fix M-2 — device-token ownership check~~ | High | Low | **P0** | ✅ already done |
| 6 | **Fix the `Review` unique constraint** (per-lesson ratings are impossible) | Med | Low | **P0** | ✅ done |
| 7 | **Subscription renewal reminders + one-tap renew** | High | Low | **P0** | MVP+ |
| 8 | **Disposable test database** (docker-compose + CI) | High | Med | **P1** | MVP+ |
| 9 | **Assignments + submissions** (wire the dead `homework_deadline`) | High | Med | **P1** | v2 |
| 10 | **Enrollment progress rollups** | High | Med | **P1** | v2 |
| 11 | **Coupons / discounts** (incl. sibling discount) | High | Med | **P1** | v2 |
| 12 | **Center subscription tiers** on `FeatureFlag` entitlements | High | High | **P1** | v2 |
| 13 | **Ship the emulator publicly on `apps/www`** | High | Low | **P1** | MVP+ |
| 14 | ~~Teacher/room scheduling conflict detection~~ → **atomic course creation** (detection already existed) | High | Low | **P1** | ✅ done |
| 15 | **Playwright coverage for the 5 money/attendance paths** | High | Med | **P1** | MVP+ |
| 16 | **Nonce-based CSP → enforce** | Med | Med | **P1** | v2 |
| 17 | **SaaS metrics dashboard** (MRR, churn, LTV, cohorts) | Med | Med | **P1** | v2 |
| 18 | **Migration-drift check in CI** (`verify-db` vs production) | Med | Low | **P1** | MVP+ |
| 19 | **Split the six 1,000+ line screens** | Med | Med | **P1** | v2 |
| 20 | **Referral system** paying into existing wallets | Med | Med | **P2** | v2 |
| 21 | **Quizzes + auto-grading of objective items** | Med | High | **P2** | v2 |
| 22 | **Bubble-sheet / paper-exam OCR** 🟢 | High | High | **P2** | v3 |
| 23 | **At-risk student detection** 🟢 | High | Med | **P2** | v3 |
| 24 | **`CenterGroup` / multi-branch licensing** | High | Med | **P2** | v3 |
| 25 | **Center/teacher discovery directory** | High | High | **P2** | v3 |
| 26 | **Gradebook depth** (weights, terms, categories, comments) | Med | Med | **P2** | v2 |
| 27 | **Counter board keyboard-only path** | Med | Low | **P2** | MVP+ |
| 28 | **`.ics` calendar feed** (signed, revocable) | Med | Low | **P2** | v2 |
| 29 | **Live-class meeting link + join-marks-attendance** | Med | Low | **P2** | v2 |
| 30 | **Report snapshot materialisation** | Med | Med | **P2** | v3 |
| 31 | **Waitlist for full courses** | Med | Low | **P2** | v2 |
| 32 | **Makeup / compensation session linkage** | Med | Med | **P2** | v2 |
| 33 | **Smart schedule allocation (constraint solver)** 🟢 | Med | High | **P3** | v3 |
| 34 | **Attendance & revenue forecasting** 🟢 | Med | High | **P3** | v3 |
| 35 | **WhatsApp credit metering + billing** | Med | Med | **P3** | v3 |
| 36 | **Consolidate the 7 settings pages** | Low | Med | **P3** | v3 |
| 37 | **Drop deprecated `Course.subject` / `gradeTag`** | Low | Med | **P3** | v3 |
| 38 | **Certificates** (PDF via existing print pattern) | Low | Low | **P3** | v3 |
| 39 | **Consolidate `app/lib/services` into `server-core`** | Low | High | **P3** | v3 |
| 40 | **AI-drafted parent communications** 🟢 | Low | Med | **P3** | v3 |

---

## 8. Quick Wins

Ten things, each under a week, each with a named starting point.

1. **Set `CRON_SECRET` and `CRON_BASE_URL` as repo secrets.** *~1 hour.* Eight written, tested jobs are currently inert — lesson reminders, subscription expiry, guardian-contact reminders, the weekly center digest, month-end statements. Nothing to build; the work is done and switched off.

2. **Fix the `Review` unique constraint.** *~2 hours.* `@@unique([studentId, teacherId])` makes the `lessonId` column's own documented purpose impossible. Change to `@@unique([studentId, teacherId, lessonId])` (or drop `lessonId`) — one migration, and the per-lesson ratings the PRD promised become possible.

3. **Add per-account login lockout.** *~1 day.* M-1 in your own QA report: rotating `X-Forwarded-For` defeats the IP limiter entirely, and there is no account-keyed counter. The token bucket in `packages/server-core/src/rate-limit/token-bucket.ts` already supports arbitrary keys — key one on the email.

4. ~~**Fix the device-token ownership check.**~~ **ALREADY DONE** (verified 2026-08-18, 16/16). Left in place so the numbering matches the roadmap table; no work required.

5. **Commit the `expected-db-shape.json` bump (48 → 52).** *~30 minutes.* Right now a real production drift and a known artifact look identical, which means the check no longer works. This is the check that would have caught the 2026-08-02 auth-table outage.

6. **Ship subscription-expiry notifications.** *~3 days.* One new `NotificationType`, one cron job (the `[status, periodEnd]` index exists for exactly this sweep), reusing the existing multi-channel notify path. Directly attacks silent churn — the highest-value quick win on this list.

7. **Put the emulator on the public marketing site.** *~2 days.* `apps/erp/src/features/*/emulator/` touches no network and writes nothing, so exposing it is safe by construction. Let a center owner drive the counter board before signing up.

8. **Make course creation atomic.** *~1 day — DONE 2026-08-18.* Double-booking *detection* already existed; what was missing was the transaction boundary. `createCourse` and `createTeacherDirectCourse` now generate sessions inside the same transaction as the course row, so a conflict leaves no orphan group behind. Proven by `course-create-atomicity.test.ts` (10/10, and 7/10 with the fix reverted — the three failures being exactly the orphan-row assertions).

9. **Wire empty states to the existing checklist endpoint.** *~2 days.* `v1/dashboards/admin/checklist` already computes what a new center needs to do next; `empty-state.tsx` already exists. Connect them so a fresh center's day-one screens teach instead of apologise.

10. **Make `counter_only` unmissable on the teacher attendance screen.** *~2 days.* It is the "student is in the building but never reached the classroom" state — the exact thing counter+door mode exists to catch. Give it a distinct treatment, a filter, and a one-tap resolution instead of a generic badge.

---

## Appendix — Corrections worth making to the docs

Small factual drifts found while reading, listed because `CLAUDE.md` is treated as authoritative:

- The **Paymob driver is still an empty stub**. `CLAUDE.md` decision #11 says so correctly, but the surrounding "Step 3 done" framing and the production env-var list (`PAYMOB_HMAC_SECRET` "required in prod, no fallback") read as though online payments are live. They are not — `createCheckout` throws.
- `homework_deadline` and possibly other `NotificationType` values have full channel + deep-link config and **no producer**. Worth an audit pass over the enum.
- The **`Review` model's comment contradicts its own constraint** (`lessonId` "for per-lesson ratings" vs `@@unique([studentId, teacherId])`).
- `test:db:ci` **excludes `c01-lesson-settlement`** — the money-engine suite — which is not mentioned in the testing notes.
- **`hall-booking.test.ts` A4 fails on dev for an environment reason, not a code one** (found 2026-08-18): the assertion needs a per-student hall with NO configured rate, but `commission_settings` on dev carries a **`global`-scope row with `center_per_student_bp = 1500`**, which the room→center→global chain resolves, so nothing throws. Reproduces identically against unmodified `HEAD`. A concrete instance of why §6.2's "no test database" matters.
