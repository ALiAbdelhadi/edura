# Edura — Architecture Review

> Produced 2026-07-18 from a full read of the codebase (monorepo structure, `apps/www`,
> `apps/realtime`, `packages/database` including the generated Prisma client and all
> migrations), plus the PRD compliance audit (`docs/product/prd-compliance-audit.md`, formerly `AUDIT.md`) and the PRD. No application code was modified.
> Companion roadmap: [CLAUDE.md](../../CLAUDE.md).

---

## 1. Tech stack & www app structure

### 1.1 Monorepo

pnpm 9 workspaces + Turborepo ^2.10 (`apps/*`, `packages/*`), TypeScript 5.9, Node ≥ 20.

| Workspace | What it is |
|---|---|
| `apps/www` | Next.js **16.2** App Router monolith — all four portals **plus** (today) superadmin/finance/assistant portals, and the whole REST API under `app/api/v1/**`. Dev port 3002, prod 3003. `next build --webpack` (required by Serwist). |
| `apps/realtime` | Plain Node Socket.IO 4.8 server (port 3005) for chat — deliberately outside Next because serverless can't hold WebSockets. |
| `packages/database` | `@repo/database` — the **only** package that imports Prisma (^7.8). Neon serverless adapter (or `pg` pool via `DATABASE_DRIVER=pg` for the realtime server). Exports the client, RLS wrappers, and shared chat domain modules. |
| `packages/ui` | `@repo/ui` — shadcn/ui (new-york, Radix, Tailwind v4) design system, 37 primitives, single `globals.css` token source, RTL direction provider. |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling config. |

Key libraries in `www`: React 19.2, next-auth 4 (JWT credentials), `jose`, next-intl 4 (ar/en, ar default + RTL), `@refinedev/core` only (AntD/`@refinedev/antd` fully migrated off), Tailwind 4, recharts, TanStack Table, react-hook-form + zod 4, Serwist PWA + native `web-push` (VAPID, not FCM), socket.io-client, pdf-lib (receipts/invoices), ky, vitest + Playwright + a Bruno API collection generator.

`next.config.ts` notables: wrapped in `createNextIntlPlugin()` **and** `withSerwistInit()`; Serwist excludes the whole precache manifest and precaches only 3 explicit entries; `transpilePackages: ["@repo/database", "@repo/ui"]` (raw TS workspace source); Prisma/bcryptjs/Neon/ws in `serverExternalPackages`.

### 1.2 Routing

- **Middleware**: `src/proxy.ts` (Next 16's middleware convention) is *only* next-intl locale routing; the matcher excludes `/api`. **No auth happens in middleware** — protection is per-API-route.
- **Public pages** (`src/app/[locale]/…`): landing `/`, `/[id]` (teacher↔center affiliation-invite landing), `/centers/[id]`, `/courses/[id]`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/accept`, `/onboarding`, `/ui-preview`.
- **Dashboard**: `/dashboard/page.tsx` is a client role-router (localStorage `edura_state` cache → `/api/v1/me` fallback) that redirects to the role's portal. Seven portals exist today:

| Portal | Role guard | Screens |
|---|---|---|
| `dashboard/admin` (= **Center**) | `center_admin` | overview, students (+detail), enrollment-requests, teachers, classes, rooms, fees, expenses, reports, messages, notifications, settings |
| `dashboard/teacher` | `teacher` | overview, classes, attendance, assignments, grades, materials, reviews, centers (affiliations), team (assistants), messages, notifications, settings |
| `dashboard/student` | `student` | overview, courses, schedule, attendance, assignments, grades, materials, reviews, family, messages, notifications, settings |
| `dashboard/parent` | `parent` | overview, children, attendance, progress, fees, messages, notifications, settings |
| `dashboard/assistant` | `assistant` | overview, messages, notifications, settings (chat-centric, minimal) |
| `dashboard/superadmin` | `super_admin` | overview (KPIs), registrations queue, education-catalog manager, messages |
| `dashboard/finance` | `accountant` | overview only |

Each portal layout = client `RoleGuard` (Refine `useGetIdentity` → `/api/v1/me`; redirects on mismatch) → `OnboardingGate` (admin/teacher/student only) → `DashboardShell` with hardcoded nav. **These guards are client-side UX only; real authorization is entirely at the API layer.** Screens live in `src/features/<area>/*-screen.tsx`; pages are thin wrappers. One shared `chat-screen.tsx` + `use-chat.ts` powers Messages in every portal.

### 1.3 API surface (196 route files, `app/api/v1/**`)

Envelope helpers (`lib/http/envelope.ts`), `withErrors`, and an in-memory token-bucket rate limiter wrap handlers. Grouped:

- **Auth**: `auth/login`, `auth/register/{student,parent,center}`, `auth/password/{forgot,reset}`, `auth/invite/accept`, plus the NextAuth catch-all `api/auth/[...nextauth]`.
- **Super-admin platform** (`admin/**`, ~45 endpoints): centers/teachers/students list + approve/reject/toggle/blacklist/link, accountant creation, permissions, full education-catalog CRUD (systems/stages/grade-levels/tracks/grade-tracks/subjects/offerings/subject-requests), points rules + manual adjust/ledger, dashboard KPIs + charts, registrations, notification history, platform blacklist.
- **Accountant finance** (`finance/**`): dashboard + revenue chart + alerts, invoices (list/create/detail/PDF/send-email), payouts (list/create/approve/reject/receipt/bulk-approve), refunds, transactions, reports (revenue, refunds, trial-balance, center/teacher statements).
- **Center-scoped**: `center/blacklist`, `center/booking-requests` (+approve/reject), `center/temp-students`, `centers/me` (+admins/invite), public `centers/[id]`.
- **Teacher-scoped**: `teacher/assistants`, `teacher/attendance/sync` (offline outbox), `teacher/blacklist`, `teacher/classroom-requests`, `teacher/temp-students`, `teacher/wallet` (+transactions, payout-request), public `teachers/[teacherId]`.
- **Core domain**: courses (+cancel/reassign-teacher), sessions (+attendance GET/PUT, cancel, complete, postpone), attendance, enrollments, enrollment-requests (+approve/decline), grades (+scores), materials (+download), payments (+receipt), expenses, rooms, reviews, affiliations (accept/decline), parent-links (+approve/reject), deletion-requests, roster (students/teachers + invite/lookup), temp-students (claim, send-invite), catalog read (`catalog/tree`, `catalog/subjects`), search (centers/courses/teachers), dashboards, reports (8 center-analytics endpoints), `cron/[job]`.
- **Me**: profile, affiliations, attendance, children, delete-request, device-tokens, family-code (+rotate), onboarding (GET/PATCH/POST), points (+history), prefs, push-subscription, subject-requests.
- **Messaging**: `messages` POST, `messages/conversations` (+detail/read), `messages/contacts` (old `threads` routes deleted — conversation model replaced them).
- **Notifications**: list, read, read-all, broadcast.
- **Realtime**: `realtime/token` (mints 60-second HS256 JWT for the socket handshake), `internal/chat-notify` (realtime → Next web-push bridge, guarded by `INTERNAL_API_SECRET`).

### 1.4 apps/realtime

Socket.IO server with `/healthz`, `/internal/*` bridge, CORS locked to `APP_ORIGIN`. Auth: browser calls `GET /api/v1/realtime/token` (NextAuth session required) → Next mints a 60s `jose` JWT (sub/role/centerId, aud `edura-realtime`, secret `REALTIME_JWT_SECRET` ?? `NEXTAUTH_SECRET`) → socket handshake verifies it; identity only ever comes from the token. Message fanout, typing, read receipts, presence; persistence through the same `@repo/database` chat queries the REST layer uses. If realtime is down, REST messaging degrades gracefully (persist now, sweep to delivered on next connect).

### 1.5 PWA

Serwist SW (`src/app/sw.ts` → `public/sw.js`): NetworkFirst caching for same-origin `GET /api/v1/*`, offline.html fallback, push + notificationclick handlers. Manifest via `src/app/manifest.ts` (standalone, `lang: ar`). Push = native VAPID web-push stored in `web_push_subscriptions`; offline attendance outbox syncs through `POST /api/v1/teacher/attendance/sync`; install-prompt component.

---

## 2. Database schema (current, complete)

> ⚠️ **Schema-file drift (must fix before any new migration).** There are two
> `schema.prisma` files and they disagree. The source file
> `packages/database/prisma/schema.prisma` (~42 models) is **stale**: it lacks the
> `assistant` role, `TeacherAssistant`, the `Conversation`/`ConversationMessage` chat
> models (it still has the old `MessageThread`/`Message` pair), all 11
> education-catalog models, and the `onboardingCompleted/Draft` fields. The
> **generated client's embedded schema**
> (`packages/database/src/generated/client/schema.prisma`, 53 models / 35 enums)
> matches the applied migrations, `src/types.ts`, the chat modules, and the seeds —
> it is the operative truth and is what this section documents. A fresh
> `prisma generate` from the stale source would break the app. The two chat/catalog
> migrations are also untracked in git.

Conventions: UUID PKs (`gen_random_uuid()`), money as **integer piasters** (never Float/Decimal), snake_case column mapping, `timestamptz` timestamps ("ts" below = `createdAt` + `updatedAt`), native Postgres enums.

### 2.1 Enums (35)

`role` (super_admin, accountant, center_admin, teacher, assistant, parent, student) · `user_status` (active, shell, pending, suspended, blacklisted, deleted) · `locale` (ar, en) · `theme` · `entity_type` (registered, invited, external, shadow) · `center_status` (pending, active, suspended, rejected, blacklisted) · `affiliation_status` (pending, active, declined, expired, removed) · `course_status` (active, ended, cancelled) · `session_status` (scheduled, ongoing, cancelled, postponed, completed) · `enrollment_status` · `enrollment_request_status` (pending, approved, declined, cancelled, expired) · `parent_link_status` (pending, approved, rejected, revoked) · `link_actor` (parent, student) · `attendance_status` (present, absent, late, excused, removed) · `grade_type` · `material_type` (lecture, homework, exam, other) · `material_storage` (cloudinary, external) · `payment_status` (pending, paid, failed, refunded) · `expense_category` · `deletion_status` · `invite_purpose` (student_activation, teacher_activation, admin_invite) · `device_platform` · `booking_status` · `transaction_type` (payment, commission, payout, refund, adjustment) · `transaction_status` · `payment_method` (**cash, online_paymob, online_fawry**) · `invoice_type` (payment_receipt, student_invoice, teacher_statement, center_statement) · `invoice_status` · `payout_status` (pending, approved, paid, rejected) · `beneficiary_type` (teacher, center) · `blacklist_level` (**platform, center, teacher**) · `notification_status` · `notification_type` (28 values incl. lesson_reminder, invite_code_sent, new_chat_message) · `bot_type` · `message_delivery_status` (sent, delivered, read) · `subject_request_status`.

### 2.2 Models (53)

**Identity & profiles**

| Model → table | Fields (key ones) | Relations |
|---|---|---|
| `User` → users | email? uniq, phone? uniq, passwordHash?, **role**, name, locale=ar, theme, status=active, emailVerified, fcmToken?, ts, deletedAt (soft delete) | 1:1 → StudentProfile, ParentProfile, TeacherProfile, CenterAdminProfile, UserPrefs |
| `StudentProfile` → student_profiles | userId? uniq (**NULL for temp/shell students**), fullName, phone?, grade? (DEPRECATED), familyLinkCode uniq, entityType=registered, inviteCode? uniq, pointsBalance, savedArea{City,Lat,Lng}, invitationSentAt?, claimedAt?, catalog FKs: educationSystemId?, stageId?, gradeLevelId?, trackId?, secondLanguageSubjectId?, onboardingCompleted, onboardingDraft Json?, ts | → User?, EducationSystem?, Stage?, GradeLevel?, Track?, Subject? (second language) |
| `ParentProfile` → parent_profiles | userId uniq, ts | → User |
| `TeacherProfile` → teacher_profiles | userId uniq, bio?, subjects[] (DEPRECATED), qualifications?, experienceYears, photoUrl?, lessonPrice? (piasters), ratingAvg/Count, walletBalance (piasters), certificates Json?, onboardingCompleted, onboardingDraft?, ts | → User, TeacherGradeLevel[], TeacherSubject[] |
| `CenterAdminProfile` → center_admin_profiles | userId uniq, centerId, ts | → User, Center |
| `Center` → centers | ownerUserId? (NULL = shadow center), name, shortId uniq, description?, address?, area?, subjects[], lat/lng?, phone?, whatsapp?, email?, logoUrl?, classroomCount, entityType, status=**pending**, walletBalance, receiptSeq, governorate?, onboardingCompleted, onboardingDraft?, ts | → CenterAdminProfile[], Room[], Course[], CenterStage[] |
| `UserPrefs` → user_prefs | userId uniq, tourCompleted, ts | → User |

**Tokens & push**

| Model | Fields |
|---|---|
| `PasswordResetToken` | userId, tokenHash uniq, expiresAt, usedAt? (single-use, 1h TTL) |
| `InviteToken` | email, tokenHash uniq, purpose, centerId?, expiresAt, usedAt? (30-day) |
| `UserDeviceToken` | userId, token uniq, platform, lastSeenAt? (FCM-style device tokens) |
| `WebPushSubscription` | userId, endpoint uniq, p256dh, auth, userAgent? (native VAPID) |

**Relationships (roster / affiliation / team / family)**

| Model | Fields | Notes |
|---|---|---|
| `CenterStudentRoster` | centerId, studentId, operationalParent{Name,Phone}?, addedAt, leftAt?, blacklisted + reason/at/by, ts; uniq (center, student) | center ↔ student membership |
| `CenterTeacherAffiliation` | centerId, teacherId, status=pending, **centerShare?** (piasters, feeds money engine), invitedAt, respondedAt?, removedAt?, expiresAt, ts | center ↔ teacher; invite → accept/decline |
| `TeacherAssistant` | teacherId, assistantId, title?, removedAt? (soft revoke), ts; uniq pair | teacher-managed delegation |
| `ParentStudentLink` | parentId, studentId, status=pending, initiatedBy/revokedBy LinkActor | family-code = instant approval; email/phone = pending approval |

**Academic core**

| Model | Fields | Relations / constraints |
|---|---|---|
| `Room` | centerId, name, capacity?, facilities[], photos[], isActive (soft delete) | → Center, Course[], Session[] |
| `Course` | centerId, teacherId, defaultRoomId?, title, subject (DEPRECATED), gradeTag? (DEPRECATED), catalog FKs subjectId?/gradeLevelId?/trackId? (NULL track = all tracks), daysOfWeek[], start/endTime, start/endDate?, price (piasters), maxStudents, status, ts | → Center, Room?, Subject?, GradeLevel?, Track?, Session[], Enrollment[] |
| `Session` (≈ PRD "lesson") | courseId, teacherId, roomId?, originalDate, date, start/endTime, status, cancellationReason?, postponedFromDate?, editedAt?, **distributedAt?** (money-engine idempotency gate), ts | → Course, Room?, AttendanceRecord[]. **No center_id → not RLS-protected (app-scoped)** |
| `Enrollment` | studentId, courseId, centerId, status, enrolledAt, unenrolledAt?, enrolledBy | partial unique: one *active* (student, course) |
| `EnrollmentRequest` | studentId, courseId, centerId, status=pending, submittedAt, respondedAt/By?, declineReason?, expiresAt | |
| `AttendanceRecord` | sessionId, studentId, courseId, centerId, status, markedBy, editedAt?, **synced** (false = offline-captured), **localTimestamp?** (device time), notes?, ts; uniq (session, student) | → Session |
| `Grade` | courseId, centerId, teacherId, name, gradeType, maxScore, date, ts | → GradeScore[] |
| `GradeScore` | gradeId, studentId, score; uniq (grade, student) | Cascade from Grade; no center_id (app-scoped) |
| `Material` | courseId, centerId, teacherId, title, type, storageProvider=cloudinary, cloudinaryPublicId/Url?, externalUrl?, fileSizeBytes?, ts | |
| `ClassroomBooking` | centerId, roomId, sessionId?, courseId?, teacherId, status=pending, centerShare?, requestedAt, decidedAt/By?, rejectReason?, ts | partial unique: one live (room, session) |

**Money** (all piasters; ledger append-only via Prisma extension + SQL `REVOKE UPDATE/DELETE`)

| Model | Fields | Notes |
|---|---|---|
| `Payment` | centerId, studentId, courseId?, status=paid, amount (SIGNED — negative = refund), currency=EGP, note?, receiptNumber uniq, recordedBy, paidAt | cash-at-center records |
| `Expense` | centerId, amount, currency, category, description?, recordedBy, expenseDate | |
| `Transaction` | refNumber uniq (TXN-YYYY-NNNNN via PG sequence), type, amount, from/toEntityId?, centerId?, lessonId? (→ sessions), status, paymentMethod?, gatewayRef?, reversalOfId?, notes?, createdAt only | immutable platform ledger |
| `Invoice` | invoiceNumber uniq (INV- sequence), type, centerId?, issuedToId?, periodStart/End?, subtotal?, commission?, netAmount? (may be negative), status, pdfUrl?, qrCode? | no hard delete |
| `Payout` | centerId?, beneficiaryId, beneficiaryType, period?, lessonCount?, grossAmount?, commission?, netPayable?, status, approvedBy?, rejectionReason?, paidAt?, receiptUrl? | no hard delete |

**Points**: `PointsRule` (eventName, pointsValue, isActive, createdBy?) and append-only `PointsLedger` (studentId, delta, balanceAfter, eventName?, ruleId?, adjustedBy? — NULL = automatic, reason?, internalNote?).

**Notifications / governance**

| Model | Fields |
|---|---|
| `Notification` | userId, type (28-value enum), title, body, data Json, channels[], status, fcmMessageId?, read, readAt? |
| `BlacklistEntry` | targetId, level (platform/center/teacher), centerId? (scope), imposedById, **reason (required)**, isActive, removedAt/By? — reversible, audited |
| `AuditLog` | actorId?, action ('center.approved' …), targetType/Id?, centerId?, beforeState/afterState Json?, ipAddress inet, createdAt — UPDATE/DELETE revoked from runtime role |
| `DeletionRequest` | userId, centerId?, reason, status=pending, reviewedBy/At/Note? |
| `Review` | studentId, teacherId, centerId?, lessonId?, rating (1..5 CHECK), text?; uniq (student, teacher) |

**Chat** (replaced the old MessageThread/Message tables — data-migrated then dropped)

| Model | Fields |
|---|---|
| `Conversation` | userAId/userBId (canonical pair, CHECK a < b), centerId? (defense-in-depth), lastMessageAt/Preview/SenderId, per-side unreadCount + lastReadAt; uniq (a, b) |
| `ConversationMessage` | conversationId, senderId, **seq bigserial** (authoritative sort), body, clientId? (idempotency, uniq per conversation), status, deliveredAt?, readAt? |

**Chatbot (schema only — no AI logic yet)**: `ChatbotConfig` (bot toggles, monthly token limit/used), `ChatbotFaq`, `ChatbotConversation` (messages Json, botType, handedOff, satisfaction?).

**Education catalog** (platform-global config data; world-readable, writable only under `rls_bypass()` — i.e. the superadmin panel; every table has `code` uniq, `isActive`, `sortOrder`):

| Model | Purpose |
|---|---|
| `EducationSystem` | general / azhari / bacc … |
| `Stage` | belongs to system; `hasSecondLanguage` drives wizard step |
| `GradeLevel` | belongs to stage; `level` 1..12 — **the "academic year" (الصف)** |
| `Track` | belongs to stage — **the شعبة** |
| `GradeLevelTrack` | which grades ask for which track (no rows ⇒ wizard skips track step) |
| `Subject` | + language, isAzhari, isSecondLanguage flags |
| `SubjectOffering` | **subject ↔ (gradeLevel, track?) — the track-to-subject mapping**; NULL track = whole grade; NULLS-NOT-DISTINCT unique |
| `TeacherGradeLevel` / `TeacherSubject` | teacher's grades & subjects (m:n on users.id) |
| `CenterStage` | stages a center covers (tenant-scoped) |
| `SubjectRequest` | teacher "add my subject" requests → superadmin approve/reject |

### 2.3 Migrations, RLS, runtime client

Migrations in order: `init` → `rls_and_constraints` → `relax_invoice_net` → `integrity_sequences_indexes` (PG sequences for TXN/INV numbers, `distributed_at`, partial uniques, ledger REVOKEs) → `refund_notification_type` → `add_web_push_subscriptions` → `education_catalog` → `realtime_chat` (assistant role, teacher_assistants, conversations; migrated + dropped old message tables). The last two are **untracked in git**.

- Runtime role **`edura_app` is NOBYPASSRLS** over the Neon pooled host; owner role only for migrations. Three env URLs: `DATABASE_URL` (runtime), `ADMIN_URL` (owner, pooled — used by the custom `scripts/apply-migrations.mjs` runner that replays migration SQL over the Neon WebSocket driver), `DIRECT_URL` (owner, direct — `prisma migrate`).
- RLS: `ENABLE` + `FORCE` + `tenant_isolation USING (rls_bypass() OR center_id = current_center_id())` on 21 center-scoped tables + `centers`. GUCs are set per-transaction: `withTenant(centerId, fn)` and `withPlatformContext(fn)` in `packages/database/src/client.ts`.
- **Not RLS-protected** (no center_id, app-layer scoped by design, flagged in migration comments): `sessions`, `grade_scores`, `notifications`, `users`, profiles, tokens, `teacher_assistants`, `conversations`-adjacent scoping.
- Prisma client extensions: soft delete (User), immutability (Transaction/PointsLedger append-only; Invoice/Payout no hard delete), audit-log (11 model.operation → action mappings, stamped from an AsyncLocalStorage request context, written under bypass-RLS).
- Seeds: `seed.ts` (Nile Academy demo center, one user per role, course, points rules) + idempotent `seed-catalog.ts` (full Egyptian catalog: 3 systems, 7 stages, 24+ grades, tracks, ~40 subjects, offerings). **`is_demo` does not exist anywhere in the repo** — demo data is only recognizable by seeded identifiers.
- Shared domain modules exported from `@repo/database`: `queries/chat.ts` (all chat reads/writes used by both REST and Socket.IO), `chat-policy.ts` (**conversation-initiation matrix SSOT** — who may start a chat with whom, "open" vs "escalation"), `chat-protocol.ts` (wire protocol types), `queries/auth.ts`.

---

## 3. Auth & role system

### 3.1 Authentication

- **NextAuth v4, JWT strategy (30-day), single CredentialsProvider, bcryptjs cost 10.** `authorize()` requires `status === "active"` — pending centers and shell students cannot log in. For `center_admin`, `centerId` is resolved from `CenterAdminProfile` and **baked into the JWT** along with `role` and `locale` → role/center changes need re-login; there is no session revocation (stateless JWTs, no jti/session table) — suspending a user blocks new logins only.
- A parallel `POST /api/v1/auth/login` mints the same NextAuth JWT manually (`next-auth/jwt encode`) and sets the session cookie — used by API clients/e2e; constant-time dummy-hash compare against unknown emails; rate-limited.
- Registration is self-service for **student / parent / center** only. Center registration creates `Center(status=pending)` + a `pending` admin user — gated behind the superadmin approve/reject queue. **Teachers are invite-only** (center roster invite → `invite/accept`); **assistants are created directly by their teacher** (active immediately); **accountants are created by superadmin**.
- Shell-merge pattern: registering with an email/phone/inviteCode matching a `status=shell` user **activates the shell in place** (temp students keep their attendance/payments history). Separately, `temp-students/claim` re-points records from a shell to an existing student account.
- Password reset: opaque single-use hashed token, 1h TTL, enumeration-silent. **No OTP and no email/phone verification exist anywhere** (`emailVerified` only becomes true via invite-accept).

### 3.2 Roles & authorization

- **Single-role-per-user** enum on `User.role`: `super_admin, accountant, center_admin, teacher, assistant, parent, student`. No multi-role, role never changes after creation. Per-role 1:1 profile tables; assistant/accountant/super_admin have no profile.
- Enforcement is **per-route, at the API layer** (155 routes call `requireRole`, 32 `requireSession`): `requireSession()` → `getServerSession`; `requireRole(...allowed)` with an **unconditional super_admin bypass of every gate**; `requireCenterScope(user, centerId)` for cross-checks. No API middleware; page-level guards are client-side only.
- **Data isolation**: `scopedDb(user, fn)` (`apps/www/src/lib/db/scope.ts`) runs `withTenant(user.centerId)` **only for `center_admin`**; every other role (student/parent/teacher/assistant/accountant/super_admin) runs under `withPlatformContext` (RLS bypass) and relies on app-layer where-clauses. So Postgres RLS is truly *enforced* only for center-admin traffic; for other roles it's defense-in-depth. `platformDb` is the pre-auth variant (register/login/reset/claim).
- Audit attribution: `scopedDb`/`platformDb` wrap calls in `runWithContext({actorId, centerId, ipAddress})`; the audit extension stamps `audit_logs` from that context.

### 3.3 How the four www roles are modeled

| Relationship | Mechanism |
|---|---|
| Center ↔ its admins | `CenterAdminProfile.centerId` (lifted into JWT; drives `withTenant`) + `centers/me/admins` invites |
| Center ↔ teacher | `CenterTeacherAffiliation` invite → accept/decline; `centerShare` (flat piasters) feeds the money split |
| Center ↔ student | `CenterStudentRoster` (+ operational parent contact, center-level blacklist flags) |
| Parent ↔ student | `ParentStudentLink`; rotatable `familyLinkCode` = instant approval; email/phone lookup = pending approval by the other side |
| Teacher ↔ assistant | `TeacherAssistant` (teacher creates the account, soft-revoke); today delegation is **chat-centric** — the conversation policy matrix makes assistants the "open" first contact while teachers are "escalation-only" for students/parents |
| Student placement | `StudentProfile` catalog FKs set by the onboarding wizard (`OnboardingGate` redirects until `onboardingCompleted`) |

---

## 4. Gap analysis — today vs. the CLAUDE.md roadmap

### 4.1 Apps & roles

| Roadmap item | Status | Detail |
|---|---|---|
| `www` = four roles (Center, Teacher, Parent, Student) | ⚠️ **Exceeds spec** | www currently also contains the **superadmin portal + ~45 `/api/v1/admin/**` endpoints**, the **accountant/finance portal + `/api/v1/finance/**`**, and an **assistant portal**. |
| Separate `admin` app, superadmin only; *no superadmin functionality may ever exist in www* | ❌ Missing (and violated today) | `apps/admin` doesn't exist. Everything superadmin lives in www (built during the audit phase, before this rule). Needs extraction, then deletion from www. Open question: where do **accountant** and **assistant** land under the new rule (§7 Q1). |

### 4.2 Core domain rules

| Roadmap item | Status | Detail |
|---|---|---|
| Onboarding: academic year + track (شعبة), subjects auto-assigned from track-to-subject mapping | ✅ Largely built | Education catalog (`GradeLevel` = year, `Track` = شعبة, `SubjectOffering` = the mapping) + data-driven wizards + `OnboardingGate`. Config-driven, superadmin-managed, seeded for Egypt. |
| Subjects/classes page shows ONLY track subjects by default + separate "browse all subjects" mode | ⚠️ Partial | Student search already filters courses to grade/track (legacy uncatalogued courses stay visible). A deliberate two-mode UI (track-subjects default / explicit browse-all) needs verification & likely a dedicated toggle + endpoint param. |
| Subscriptions: student subscribes to a **Teacher** or a **Center** | ❌ Missing | Today's model is **enrollment into a Course**, and every course **requires a center** (`Course.centerId` NOT NULL; RLS keys on it). There is no subscription entity and no teacher-direct offering path. This is the single biggest schema change in the roadmap. |
| Payments: Paymob online (foundation + sandbox + mock) | ❌ Missing | `payment_method` enum already has `online_paymob`/`online_fawry` and `Transaction.gatewayRef` exists, but there is no gateway code, no webhook, no `PAYMOB_*` env. Previously blocked on a §11 open decision; the roadmap now unblocks foundation + sandbox + mock. |
| Cash at center (walk-in, recorded by staff) | ✅ Built | `Payment` records (signed piasters, sequenced receipt numbers, PDF receipts) recorded by center_admin. |
| Walk-in registration → student account + **WhatsApp** message (Student ID + secure tokenized onboarding link) | ⚠️ Partial | Temp/shell students + `inviteCode` + claim/merge + activation invites all exist (PRD §5.4 done) — but delivery is **email-based**; there is **no WhatsApp integration** (`WHATSAPP_*` unused; `Center.whatsapp` is just a display field). Also no `notification_type` for it beyond `invite_code_sent`, and no tokenized *onboarding* deep-link (invite tokens exist for account activation). |
| Attendance: per-teacher setting, mode A (counter only) vs mode B (counter + classroom door) | ❌ Missing | Attendance is a single per-session `AttendanceRecord` marked by teacher/center (with offline sync). There is no per-teacher attendance-mode setting, no notion of *check-in stages*, and no counter vs door distinction. |
| Teacher ↔ Center collaboration requests (subject, year, hall, schedule, expected count; accept ⇒ class/schedule created) | ⚠️ Partial | Two adjacent pieces exist: `CenterTeacherAffiliation` (relationship + centerShare) and `ClassroomBooking` (teacher requests a room, center approves). Neither carries subject/year/schedule/expected-count, neither is bidirectional, and **acceptance does not create a course/sessions**. |
| Assistants acting on behalf of teachers, with audit attribution | ⚠️ Partial | `TeacherAssistant` + assistant role/portal exist, but delegation today is chat-only. Assistants cannot manage attendance/grades/materials on the teacher's behalf; no permission scopes; audit infra (actorId) exists and would attribute correctly once write paths open up. |

### 4.3 Conventions

| Convention | Status |
|---|---|
| `is_demo = true` on demo/seed data | ❌ Missing everywhere — zero occurrences in the repo; seeds are only recognizable by name/shortId. Also: demo credentials are hardcoded in the login page (quick-login buttons, `Passw0rd!`). |
| Secrets only via env vars | ✅ Followed (`.env` + `.env.example`; Prisma URLs via env; realtime secrets via env). No `PAYMOB_*`/`WHATSAPP_*` yet since those features don't exist. |
| Destructive ops = soft delete | ⚠️ Partial — User (deletedAt), Room (isActive), rosters/affiliations/assistants (leftAt/removedAt), ledgers immutable. But e.g. materials, expenses, grades, catalog grade-track links use hard DELETE. |
| All superadmin writes → audit log | ⚠️ Partial — the audit extension covers 11 model.operation pairs + explicit audit writes in approve/reject flows; not yet a guaranteed blanket over every `/admin/**` mutation. |
| Incremental, migration-safe schema changes | ✅ Practiced (additive migrations, backfills, partial indexes) — **but** the schema.prisma drift (§2 warning) currently breaks the migration workflow and must be fixed first. |

---

## 5. Proposed implementation order (migration-safe)

Ordering principles: fix the broken migration workflow first; land the app split early (it's pure code movement, no schema risk, and everything later must be built in the right app); then schema-additive features in dependency order. Every schema step is **additive** (new tables / nullable columns / new enum values) — no destructive change until a final deprecation pass.

### Step 0 — Repo hygiene (blocker for everything)

**Schema:** none (restores correctness only).
1. Reconcile `packages/database/prisma/schema.prisma` with the applied migrations/generated client (assistant role, TeacherAssistant, Conversation models, catalog models, onboarding fields). Until this lands, any `prisma generate` or new migration is dangerous.
2. Commit the two untracked migrations (`education_catalog`, `realtime_chat`) — they exist in the DB but not in git.
3. Replace the stock Turborepo `README.md`; delete/refresh the stale `apps/www/AGENTS.md` (describes a dead Mongoose stack).

**Risk:** low, but *doing anything else first* risks generating a client that drops half the schema.

### Step 1 — `is_demo` convention

**Schema:** additive migration adding `is_demo boolean NOT NULL DEFAULT false` to the seeded entity tables (proposed: users, centers, courses, and let child rows inherit by joinable ancestry rather than flagging all 53 tables — see §7 Q6). Update `seed.ts`/`seed-catalog.ts` to set it (catalog seed rows are real reference data, arguably *not* demo — Q6). Remove the hardcoded quick-login buttons or gate them behind `NODE_ENV`.
**Risk:** trivial; DEFAULT false backfills instantly on Postgres 11+.

### Step 2 — Extract the `admin` app (superadmin out of www)

**Schema:** none.
1. Scaffold `apps/admin` (Next.js, same `@repo/database` + `@repo/ui`, own port, own NextAuth instance restricted to `role=super_admin` at `authorize()` time — not just at route guards).
2. Move `dashboard/superadmin` screens + `features/admin/catalog` + all `/api/v1/admin/**` routes there; move `requireRole("super_admin")`-only code paths.
3. Delete the superadmin surface from www (per the hard rule), including the superadmin branch of the dashboard role-router and superadmin rows in the chat policy matrix as exposed in www.
4. Decide (Q1) whether the accountant/finance portal and `/api/v1/finance/**` move too (recommended: yes — it's platform-level, not one of the four www roles).

**Risks:** shared-cookie clashes if both apps run on one domain (use distinct cookie names/domains); the chat system currently lets super_admin message anyone — the admin app needs its own realtime/token minting or superadmin chat is dropped from scope (Q1); duplicated auth config drift (mitigate with a shared `@repo/auth` helper or copied-but-tested options).

### Step 3 — Paymob foundation (mock + sandbox)

**Schema (additive):** new `payment_intents` table (id, studentId, courseId?/subscriptionId? later, amount, currency, method, gateway `paymob`, gatewayOrderId?, gatewayRef?, status pending/paid/failed/expired, idempotencyKey uniq, raw webhook payload Json, ts). Existing `Transaction.paymentMethod=online_paymob` + `gatewayRef` already fit settlement.
1. Provider abstraction (`lib/services/payments/gateway.ts`) with `mock` driver (auto-succeed in dev/e2e) and `paymob` driver (auth token → order → payment key → iframe/redirect).
2. `POST /api/v1/payments/initiate` + `POST /api/v1/payments/paymob/webhook` (HMAC signature verification, idempotent on gatewayOrderId, writes Payment + Transaction + points event `online_payment` — rule already seeded).
3. Env: `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMENTS_MODE=mock|sandbox|live`.

**Risks:** webhook idempotency/replay (solved by unique gatewayOrderId + append-only ledger); amount tampering (always trust server-side intent amount, verify HMAC); refunds flow interaction with the signed-Payment convention.

### Step 4 — Subscriptions (student → Teacher | Center)

The biggest change; do it **before** collaboration requests and attendance modes since both reference it.
**Schema (additive):**
- `subscriptions` (id, studentId, targetType enum `teacher|center`, teacherId?, centerId? — CHECK exactly one per targetType, plan/pricing fields, status enum, startedAt, endsAt?, cancelledAt?, source enum online|walk_in, ts) + partial unique on one active subscription per (student, target).
- To support teacher-direct offerings: make `Course.centerId` **nullable** (nullable-ing a column is safe) OR keep courses center-only and model teacher-direct teaching as courses under a *shadow/"virtual" center* owned by the teacher. **Recommended: nullable centerId with `teacherOwned` semantics** — shadow centers pollute analytics and the RLS story (Q2 decides).
1. Subscription CRUD + student-facing subscribe flows (pays via Step 3; cash path = center staff records it).
2. Gate enrollment/booking by active subscription where the roadmap requires it (Q2: does subscription *replace* per-course enrollment or wrap it?).

**Risks:** RLS — 21 policies key on `center_id`; teacher-owned rows (NULL centerId) silently vanish under `withTenant` and need either a second policy arm (`teacher_id = current_teacher_id()`) or app-layer scoping like sessions today. Money engine — `computeLessonSplit` assumes a center share; teacher-direct sessions need a "no-center" split branch (platform fee only). Both must be designed, not patched.

### Step 5 — Collaboration requests (Teacher ↔ Center)

**Schema (additive):** `collaboration_requests` (id, initiatorType enum teacher|center, teacherId, centerId, subjectId, gradeLevelId, trackId?, roomId? (hall), scheduleDays int[], start/endTime, startDate, expectedStudents?, proposedCenterShare?, status pending/accepted/rejected/cancelled/expired, respondedAt/By?, message?, ts).
1. Either side creates; counterparty accepts/rejects; acceptance **transactionally** creates: the `CenterTeacherAffiliation` if absent (active), the `Course` (from subject/grade/schedule), its `Session` rows, and the room booking — reusing existing course-creation service code.
2. Notifications both ways (matrix-driven `notify()` already exists).
3. Supersedes-or-wraps decision vs. the existing `ClassroomBooking` flow (Q3).

**Risks:** low — pure additive; the acceptance transaction touches many tables, keep it in one `withTenant` transaction; expiry job needs the cron route.

### Step 6 — Attendance modes (counter / counter + door)

**Schema (additive):**
- Per-teacher setting: `TeacherProfile.attendanceMode` enum (`counter_only`, `counter_and_door`) default `counter_only` — or per (teacher, center) on the affiliation if the mode varies by center (Q4).
- Check-in stages: new `attendance_checkins` table (id, sessionId, studentId, stage enum `counter|door`, scannedBy, scannedAt, source enum online|offline, localTimestamp?) with uniq (session, student, stage); keep `attendance_records` as the derived per-session status (present once required stages complete). This preserves the existing offline-sync outbox contract (it writes records; extend the sync payload with stage).

**Risks:** offline sync compatibility (version the sync payload); "present" derivation rules for mode B when only the counter stage happened (late? pending?) — needs product answer (Q4).

### Step 7 — Walk-in + WhatsApp delivery

Depends on Step 6 only socially; technically independent, needs a provider decision (Q5).
**Schema (additive):** `whatsapp` value added to notification channels convention (channels is already `String[]`); optional `message_outbox` table if we want durable delivery/retry (recommended for a paid channel).
1. Provider abstraction (`lib/services/whatsapp/`) — WhatsApp Business Cloud API or aggregator; env `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, template names.
2. Wire into the existing walk-in flow: `center/temp-students` POST already creates the shell + inviteCode → after-create hook sends the WhatsApp template with Student ID + tokenized link (`/onboarding?claim=<opaque token>` — reuse the `InviteToken` mechanism with a new purpose `walk_in_onboarding` rather than the guessable short inviteCode in URLs).
3. Extend `notify()` with the whatsapp channel for the matrix rows that call for it.

**Risks:** template pre-approval lead time (Meta review); phone-number normalization (+20 handling); cost controls (rate limit + outbox).

### Step 8 — Assistant delegation (beyond chat)

**Schema (additive):** `permissions Json` (or a scoped enum array, e.g. `attendance`, `grades`, `materials`, `messages`) on `teacher_assistants`.
1. `requireRole` extension: an `actingFor(teacherId)` resolution that lets `assistant` hit teacher endpoints when a live `TeacherAssistant` row grants the scope; keep the assistant's own id as `actorId` in the audit context and add `onBehalfOf` to `audit_logs` metadata (fits in the existing Json before/after or a new nullable column).
2. Expand the assistant portal with the delegated screens (reuse teacher screens with scoped data providers).

**Risks:** authorization subtleties (assistant must inherit the *teacher's* data scope, not a center's) — concentrate the logic in one helper, never per-route.

### Step 9 — Deprecation & hardening pass (last)

Backfill catalog FKs then drop DEPRECATED fields (`StudentProfile.grade`, `TeacherProfile.subjects[]`, `Course.subject/gradeTag`) — the only destructive migration, done after all readers are migrated. Extend soft-delete to materials/expenses/grades. Blanket-audit all remaining admin mutations. Revisit the known RLS gaps (`sessions`, `grade_scores` center_id columns) if Step 4 chose the policy-arm route anyway.

**Pre-launch data wipe (decided 2026-07-18, during Step 1):** the live DB holds legacy data from past live-DB test runs that predates the `is_demo` flag and has no stable identifiers (~144 users, 21 centers, 19 courses as of 2026-07-18, plus their child rows). Decision: leave it untouched during development — do NOT flag it by heuristic. Before launch, wipe ALL non-seed data: purge `is_demo = true` roots (and children by ancestry) via the flag, and remove everything else that isn't the education catalog (permanent reference data) or real production accounts. Re-verify catalog integrity and sequences after the wipe.

---

## 6. Known debt worth tracking alongside the roadmap

- **schema.prisma drift** (§2 warning) — blocker, Step 0.
- Untracked migrations + large uncommitted working tree (the git status shows a broad in-flight change set).
- No session revocation (30-day stateless JWTs) and role/centerId baked into the token.
- RLS enforced only for center_admin traffic; everything else runs under bypass + app-layer filters (documented design, but the subscriptions work will stress it).
- No OTP / phone verification anywhere (WhatsApp step could double as the phone-verification channel).
- Client-side-only portal guards (fine given API-layer enforcement, but worth a server-side check when the admin app is built).
- In-memory rate limiter (per-instance only) — fine for one node, not for horizontal scale.
- 2 known open bugs from the PRD compliance audit (docs/product/prd-compliance-audit.md): temp-student claim P2002 edge case; dead Newman e2e harness.

---

## 7. Ambiguities / decisions needed before implementation

1. **Scope of the admin app.** "No superadmin functionality in www" is clear — but do **accountant/finance** (`/dashboard/finance`, `/api/v1/finance/**`) and the accountant role move to `apps/admin` too, or stay in www? And does superadmin keep chat (the policy matrix lets super_admin message everyone — that requires the admin app to talk to the realtime server), or is superadmin chat dropped?
2. **Subscription semantics.** (a) Is a subscription *recurring* (monthly, renewable) or a one-time bundle? (b) Does subscribing to a teacher/center replace per-course enrollment, or is it a prerequisite wrapper (subscribe → then enroll in that target's courses)? (c) For teacher-direct subscriptions: where do sessions physically happen, and what is the money split (platform fee only, since there's no centerShare)? (d) Preferred modeling: nullable `Course.centerId` (my recommendation) vs. teacher-owned shadow centers?
3. **Collaboration requests vs. existing flows.** Should the new `collaboration_requests` **replace** `ClassroomBooking` (and absorb affiliation-invite), or layer on top of both? Replacing is cleaner long-term but touches the money engine's booking-derived `centerShare`.
4. **Attendance modes.** (a) Is the mode a global per-teacher setting or per teacher-per-center (on the affiliation)? (b) Who performs the counter check-in (center staff at the front desk?) vs. the door check-in (teacher/assistant?)? (c) In mode B, what is a student's status if they pass the counter but never the door — absent, late, or a distinct state? (d) QR/short-code scanning, manual lists, or both?
5. **WhatsApp provider.** Meta WhatsApp Business Cloud API directly, Twilio, or a local Egyptian aggregator? Is a WhatsApp Business number + verified sender already available (template approval has lead time)? Should WhatsApp double as phone verification (OTP), which is still missing platform-wide?
6. **`is_demo` scope.** Flag only root entities (users, centers, courses) and treat children by ancestry, or add the column to every table? And is the seeded Egyptian education catalog "demo" (purgeable) or permanent reference data (my read: permanent — it should *not* be flagged)?
7. **Paymob specifics.** Which Paymob products (card iframe, mobile wallets, kiosk/Aman)? Sandbox credentials available now? Is Fawry (already in the `payment_method` enum) in or out of scope for this roadmap phase?
8. **Schema drift fix approval.** Confirm I should restore `schema.prisma` from the generated client + migrations as Step 0 in the next (implementation) session — it's a code change, so it was out of bounds for this review session.
9. **Assistant delegation scope.** Which capabilities exactly may be delegated (attendance, grades, materials, messaging, finance-visibility?), and may an assistant serve multiple teachers simultaneously (the schema allows it)?
