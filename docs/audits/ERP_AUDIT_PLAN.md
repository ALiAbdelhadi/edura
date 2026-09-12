# ERP Audit Plan — Phase 0 (map only)

Date: 2026-09-05. Scope: `apps/erp` (the tenant-facing app: center, staff, teacher, assistant, parent, student) plus the shared kernel it depends on (`packages/server-core`, `packages/database`, `packages/ui`, `packages/client-core`, `packages/notifications`, `apps/realtime`). Read-only: **no code was changed.** This document is the map and the split; it contains no findings. Where the mapping surfaced something that *looks* wrong it is recorded in §8 as a question for the owning pass, not as a verdict.

Prior work read before mapping: [AUDIT_REPORT.md](AUDIT_REPORT.md) (superadmin, 2026-09-01), [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md), [docs/security/security-audit.md](../security/security-audit.md) with its remediation log in `CLAUDE.md:878-1090`, and the binding invariants in `CLAUDE.md:355-451`. Everything below was verified against ERP's own source; nothing was assumed from the superadmin report.

---

## 1. Scale

| Metric | Value | Source |
|---|---|---|
| Files under `apps/erp/src` | 865 (415 `.ts`, 345 `.tsx`, 68 `.mdx`, 30 `.json`, 6 `.css`) | `find` |
| TS/TSX lines under `apps/erp/src` | 67,792 | `wc` |
| Route handler files | **235** `route.ts` → **298** exported handlers (130 GET, 124 POST, 24 DELETE, 17 PATCH, 3 PUT) | `apps/erp/src/app/api/**` |
| Lines in route handlers | 7,675 (avg 33 lines/file — routes are thin) | |
| Pages / layouts | **122** `page.tsx`, **9** `layout.tsx`; 5,646 lines. Portals: admin 24, student 16, teacher 15, parent 14, assistant 12, staff 12; public/auth 28 | `apps/erp/src/app/[locale]/**` |
| Feature directories | **23** (185 files, 42,694 lines) — `features/admin` alone is 51 files / 14,712 lines | `apps/erp/src/features/**` |
| ERP-local services | 61 files under `apps/erp/src/lib/services`, of which **26 are one-line shims** re-exporting server-core and **35 are real** (5,871 lines) | |
| Shared server kernel | `packages/server-core/src`: 116 files, 21,600 lines; 84 of them under `services/` | |
| Schema | `packages/database/prisma/schema.prisma` 2,417 lines, **82 models**, 66 enums, 71 migrations; live shape 82 tables / 41 RLS tables / 62 policies (`packages/database/scripts/expected-db-shape.json:4-5`) | |
| Messaging query layer | `packages/database/src/queries/chat-*.ts` — 3,064 lines of scope/safety logic living in the *database* package, not server-core | |
| Shared client | `packages/ui` 93 files / 10,598 lines (70 components); `packages/client-core` 17 files / 1,070 lines | |
| Tests | 70 DB suites (`apps/erp/tests/db`), 103 unit (`tests/unit`), 10 Playwright specs, 1 bun e2e | |
| Realtime | `apps/realtime/src` 8 files (socket.io server, JWT auth, internal bridge) | |

**Largest files** (all under `apps/erp/src` unless noted):

| Lines | File |
|---|---|
| 1,522 | `features/admin/admin-classes-screen.tsx` |
| 1,312 | `features/admin/admin-fees-screen.tsx` |
| 1,114 | `packages/server-core/src/services/reports/reports.ts` |
| 1,044 | `features/messaging/chat-screen.tsx` |
| 1,006 | `features/collaboration/collaboration-panel.tsx` |
| 973 | `features/admin/counter/center-counter-screen.tsx` |
| 969 | `packages/server-core/src/services/external-teachers/external-teachers.ts` |
| 950 | `features/admin/admin-rooms-screen.tsx` |
| 912 | `features/teacher/teacher-gradebook-screen.tsx` |
| 870 | `packages/database/src/queries/chat-scope.ts` |
| 863 | `features/settings/settings-screen.tsx` |
| 825 | `packages/server-core/src/errors/messages-ar.ts` |
| 734 | `features/admin/admin-student-detail-screen.tsx` |
| 735 | `packages/server-core/src/services/search/global-search.ts` |
| 702 | `packages/server-core/src/services/subscriptions/subscriptions.ts` |
| 696 | `features/admin/external-teacher-detail-screen.tsx` |
| 634 | `packages/server-core/src/services/finance/distribution.ts` |
| 629 | `packages/server-core/src/services/center/roster.ts` |

### 1.1 Layering — does routes → services → server-core → prisma hold?

Mostly yes, with three deviations the audit must keep in mind.

**Holds:**
- Routes never touch Prisma directly: exactly **1** of 235 route files references `prisma.` (`api/v1/%5Fping/route.ts`, the health ping). Routes import from `@/lib/services` (163 files) and `@repo/server-core` (51 files).
- Pages are thin mounts: every `dashboard/**/page.tsx` is a 5–10 line file importing one screen (e.g. `app/[locale]/dashboard/admin/fees/page.tsx`, `dashboard/student/wallet/page.tsx`).
- Features never import Prisma at runtime: 0 `@repo/database` client imports in `features/**`. (39 import lines from server modules exist, but they are pure helpers or types — `date-key`, `student-code`, `grading-scale`, `conflict-detector`, `chat-protocol`, `StudentCard` types. Two are real service imports: `features/marketing/pricing-screen.tsx:5` → `@/lib/services/pricing/public-rates` and `features/onboarding/student-wizard.tsx:10` → `@/lib/services/catalog/second-language`. Pass G verifies both are client-safe.)
- The HTTP shim pattern from superadmin is present and identical: `apps/erp/src/lib/{db/scope,http/envelope,errors/http,errors/classes,validation/zod,validation/common,rate-limit/*,authz/require-center-scope}.ts` are all one-line `export * from "@repo/server-core/..."`.

**Deviation 1 — two service layers.** 35 real service files live only in `apps/erp/src/lib/services` and are *not* in server-core, so superadmin cannot reuse them and they were not covered by the superadmin audit: `payments/payment-intents.ts` (391), `materials/materials.ts` (364), `messages/messages.ts` (343), `catalog/onboarding.ts` (332), `discovery/discovery.ts` (329), `cron/jobs.ts` (329), `auth/register.ts` (327), `grades/grades.ts` (273), `reviews/reviews.ts` (254), `wallet/parent-wallet.ts` (252), `team-notes/team-notes.ts` (248), `parent-links/parent-links.ts` (235), `wallet/wallet.ts` (228), `teacher/assistants.ts` (224), `wallet/center-credit-topup.ts` (171), `attendance/sync.ts` (166), `finance/teacher-wallet.ts` (157), plus the payment gateway drivers. Note the asymmetry: **center** payout requests are in server-core (`packages/server-core/src/services/finance/center-wallet.ts:59`) while **teacher** payout requests are ERP-only (`apps/erp/src/lib/services/finance/teacher-wallet.ts:70`).

**Deviation 2 — messaging logic in the database package.** `packages/database/src/queries/chat*.ts` (3,064 lines) hold the reach/scope/safety rules for chat and are called from `apps/erp/src/lib/services/messages/messages.ts:1-4` via `@repo/database/chat`, `chat-groups`, `chat-safety`, `chat-oversight`. `packages/database/src/queries/auth.ts:5-13` calls the bare `prisma` client directly (no scope wrapper).

**Deviation 3 — eight SSR pages call services directly** (not via the API): `app/[locale]/receipts/[paymentId]/page.tsx`, `student-id/print/page.tsx`, `c/[payload]/page.tsx`, `reports/print/page.tsx`, `onboarding/page.tsx`, `dashboard/staff/page.tsx`, `dashboard/staff/layout.tsx`, `register/page.tsx`. All except `register` (public form, validation helpers only) and the root layout contain an auth call; Pass A confirms each one's scope check, since this is the exact shape of superadmin/altruvex CRIT-1.

---

## 2. Surface map by domain

Route paths are relative to `apps/erp/src/app/api/v1/`; services relative to `packages/server-core/src/services/` unless prefixed `erp:` (= `apps/erp/src/lib/services/`); screens relative to `apps/erp/src/features/`; tests relative to `apps/erp/tests/`.

### 2.1 Money / billing / wallets / payouts
- **Routes (≈35):** `payments/**` (10: list, `[id]` GET+PATCH refund, `[id]/receipt`, `availability`, `initiate`, `intents`, `intents/[id]`, `intents/[id]/mock-complete`, `wallet-topup/*`, `parent-wallet-topup/*`, `paymob/webhook`), `center/wallet`, `center/wallet/transactions`, `center/wallet/payout-request`, `center/wallet/payouts`, `center/wallet/payouts/[id]`, `center/wallet/payouts/[id]/cancel`, `center/wallet-topup`, `center/credit`, `center/credit/topup`, `center/shifts/**` (4), `teacher/wallet/**` (6), `me/wallet`, `me/wallet/history`, `me/parent-wallet`, `me/parent-wallet/history`, `me/points`, `me/points/history`, `expenses`, `expenses/[id]`, `sessions/[id]/complete`, `sessions/[id]/settlement-preview`, `center/external-teachers/[teacherId]/settlements`, `.../statement`, `center/external-teachers/balances`, `subscriptions/checkout` (money half).
- **Services:** `finance/{distribution,fees,commission,agreements,center-credit,center-wallet,payout-cancel,invoices,ref-numbers}.ts`, `wallet/{wallet,parent-wallet,cash-topup}.ts`, `payments/{payments,receipt-document,receipt-email,notification-types}.ts`, `points/points.ts`, `center/shifts.ts`, `expenses/expenses.ts`, `external-teachers/reconciliation.ts`; `erp:payments/payment-intents.ts`, `erp:payments/gateway/*`, `erp:wallet/{wallet,parent-wallet,center-credit-topup}.ts`, `erp:finance/teacher-wallet.ts`, `erp:cron/jobs.ts` (month-end statements).
- **Screens:** `admin/admin-fees-screen.tsx` (1,312), `admin/admin-expenses-screen.tsx`, `admin/center-staff-finance-screen.tsx`, `admin/counter/{shift-card,walk-in-panel}.tsx`, `admin/today-takings-card.tsx` + `takings.ts`, `student/student-wallet-screen.tsx`, `student/student-receipts-section.tsx`, `parent/parent-wallet-screen.tsx`, `parent/parent-pay-screen.tsx` (600), `parent/parent-fees-screen.tsx`, `teacher/teacher-wallet-screen.tsx`, `receipts/*`, `components/ledger/*`, `admin/external-teacher-detail-screen.tsx` (settlements tab), `lib/payments/{checkout-redirect,use-online-checkout}.ts`.
- **Tests:** db `wallet`, `wallet-no-cap`, `h1-payout-race`, `payout-cancel`, `teacher-payout-replay`, `c01-lesson-settlement`, `settled-lesson-lock`, `settlements-for-all`, `shift-reconciliation`, `center-credit-clearing`, `parent-pay`, `counter-payment-methods`, `mc3-payment-method`, `m1-webhook-atomicity`, `teacher-earnings-period`, `teacher-direct-pricing`, `center-share-governance`, `teacher-agreements`, `hall-booking`; unit `money-distribution`, `c1-payments-mode`, `route-paymob-webhook`, `payment-payer-ownership`, `parent-topup-receipt`, `online-checkout-gate`, `payments-day-range`.

### 2.2 Enrollment, subscriptions, roster & course booking
- **Routes (≈40):** `courses` (+`[id]`, `[id]/cancel`, `[id]/reassign-teacher`), `enrollments` (+`[id]`), `enrollment-requests` (+`[id]`, `approve`, `decline`), `subscriptions` (+`[id]`, `[id]/cancel`, `checkout`), `center/subscriptions`, `center/walk-in`, `center/walk-in/resend`, `center/temp-students`, `temp-students` (+`[id]`, `send-invite`, `claim`), `roster/students/**` (5), `me/roster`, `me/roster/choice`, `me/subscriptions`, `teacher/coverage`, `teacher/temp-students`, `center/external-teachers/[teacherId]/students/**` (3), `center/blacklist/**`, `teacher/blacklist/**`, `search/courses`, `catalog/**`, `subjects`, `me/subjects`, `me/subject-requests`.
- **Services:** `subscriptions/{subscriptions,coverage,teacher-coverage}.ts`, `center/{courses,enrollments,roster,roster-membership}.ts`, `walk-in/walk-in.ts`, `temp-students/temp-students.ts`, `blacklist/blacklist.ts`, `external-teachers/manual-students.ts`, `catalog/catalog-admin.ts` (read side); `erp:discovery/discovery.ts`, `erp:catalog/{catalog-read,catalog-cache,second-language}.ts`.
- **Screens:** `admin/admin-classes-screen.tsx` (1,522), `admin/admin-enrollment-requests-screen.tsx`, `admin/admin-students-screen.tsx`, `admin/admin-student-detail-screen.tsx` (734), `admin/student-import-dialog.tsx`, `student/student-subjects-screen.tsx` (518), `student/subscription-alert.tsx`, `subscriptions/*`, `parent/child-subscription-alert.tsx`, `teacher/teacher-classes-screen.tsx` (529), `teacher/teacher-create-group-dialog.tsx`, `admin/counter/walk-in-panel.tsx` (shared with 2.1).
- **Tests:** db `roster-courses-count`, `course-create-atomicity`, `walk-in-ownership`, `temp-student-invite-ownership`, `bulk-import-students`, `h04-blacklist-cascade-reversal`, `teacher-coverage`, `renewal-reminders`, `second-language-scoping`, `catalog-onboarding`; unit `subscription-state`, `courses-create-routing`, `route-center-subscriptions-method`.

### 2.3 Scheduling, sessions, rooms, collaboration & teacher agreements
- **Routes (≈25):** `sessions` (list), `sessions/[id]` (+`cancel`, `postpone`), `rooms` (+`[id]`, `[id]/photos`, `per-student-availability`), `centers/[id]/rooms`, `collaboration-requests` (+`[id]`, `accept`, `reject`, `cancel`), `affiliations/[id]` (+`accept`, `decline`), `me/affiliations`, `center/teacher-agreements`, `center/counter/sessions`, `teachers/me`, `center/external-teachers/[teacherId]/convert`.
- **Services:** `sessions/{session-generator,conflict-detector}.ts`, `session-actions/session-actions.ts`, `collaboration/collaboration.ts` (607), `rooms/{method2,room-rate}.ts`, `finance/agreements.ts`, `finance/commission.ts` (room-rate side), `external-teachers/external-teachers.ts` (convert paths); `erp:rooms/rooms.ts`, `erp:sessions/enrich.ts`, `lib/rooms/amenities.ts`.
- **Screens:** `admin/admin-schedule-screen.tsx`, `admin/admin-rooms-screen.tsx` (950), `collaboration/collaboration-panel.tsx` (1,006), `admin/agreement-propose-dialog.tsx`, `teacher/teacher-affiliations-screen.tsx`, `student/schedule-screen.tsx`, `sessions/session-time.ts`, `admin/center-day.ts`.
- **Tests:** db `hall-booking`, `room-ownership`, `sessions-center-name`, `sessions-staff-scope`, `teacher-agreements`, `center-share-governance`; unit `schedule-clashes`, `session-time`, `route-collab-accept-body`, `platform-day-bounds`, `center-day`.

### 2.4 Attendance, check-in, student identity (card/QR), offline sync
- **Routes (≈20):** `attendance`, `attendance/[id]`, `sessions/[id]/attendance`, `sessions/[id]/attendance/reopen`, `door-checkin`, `center/checkin` (+`lookup`, `suggest`), `center/counter/{roster,teachers,sessions}`, `teacher/attendance`, `teacher/attendance/sync`, `teacher/attendance-mode`, `me/attendance`, `me/student-card`; pages `c/[payload]`, `student-id`, `student-id/print`.
- **Services:** `attendance/{attendance,checkin,counter,lesson-lock}.ts`, `students/{student-card,student-qr,student-scan,disclosure}.ts`; `erp:attendance/sync.ts`; `lib/attendance/{qr-decoder,scanned-code}.ts`, `lib/pwa/{attendance-outbox,use-attendance-sync,sw-handlers}.ts`.
- **Screens:** `admin/counter/center-counter-screen.tsx` (973) + `use-checkin-commit.ts`, `admin/admin-checkin-screen.tsx` (449), `attendance/door-checkin-screen.tsx` (418), `teacher/teacher-attendance-screen.tsx` (538), `student/student-attendance-screen.tsx`, `student/student-id-*.tsx`, `student/scan-result-view.tsx`, `student/student-recent-attendance.tsx`, `parent/parent-recent-attendance.tsx`, `settings/attendance-mode-card.tsx`.
- **Tests:** db `counter-board`, `t9-attendance-reopen`, `offline-sync`, `student-id-card`, `student-qr-credential`, `settled-lesson-lock`, `settlements-for-all`; unit `door-offline`, `qr-decoder`, `scanned-code`, `route-center-checkin`, `attendance-outbox-partition`, `student-qr`, `student-code`, `me-attendance-course-name`, `sw-handlers`.

### 2.5 Students, guardians & family
- **Routes (≈25):** `me/children`, `me/family-code` (+`rotate`), `me/guardian-contact`, `me/guardian-verification`, `guardian/verify`, `parent-links` (+`[id]`, `approve`, `reject`), `parent/oversight/**` (4 — messaging oversight, see 2.9), `center/students` (+`[id]`, `[id]/guardian-contact`, `import`), `me/onboarding`, `me/onboarding-email`, `me/profile-checklist`, `me/credentials`, `deletion-requests` (+`[id]`, `approve`, `reject`).
- **Services:** `invites/{guardian-contact,guardian-verification,recipient,deliver,invite-token}.ts`, `center/{bulk-import-students,student-csv,deletion-requests}.ts`, `wallet/parent-wallet.ts` (`assertApprovedChild`, `approvedChildIds`), `data-rights/{account-deletion,data-export}.ts`; `erp:parent-links/parent-links.ts`, `erp:catalog/onboarding.ts`, `erp:onboarding/welcome-email.ts`, `erp:activation/center-checklist.ts`; `packages/database/src/queries/chat-guardian.ts`, `chat-minors.ts`.
- **Screens:** `parent/*` (17 files, 3,701 lines: `parent-linking-screen` 428, `parent-dashboard`, `parent-progress-screen`, `child-*`), `student/student-family-code-screen.tsx`, `student/guardian-*.tsx`, `onboarding/*` (7 files, 1,558), `settings/{children-guardian-cards,guardian-contact-card,onboarding-profile-card,data-rights-card}.tsx`.
- **Tests:** db `guardian-contact-access`, `guardian-verification`, `me-children-grade-level`, `data-rights`, `self-service-profile`; unit `student-identity`, `student-csv`, `guardian-verification`, `sessions-parent-child-scope`, `onboarding-steps`.

### 2.6 Staff, teachers, assistants, external teachers, invites & registration
- **Routes (≈45):** `auth/register/{center,student,parent,teacher}`, `auth/invite/accept`, `auth/password/{forgot,reset}`, `auth/view-as/**` (3), `api/auth/[...all]`, `center/staff` (+`[id]`, `[id]/invite`, `me`), `centers/me` (+`admins`, `admins/[userId]`, `admins/invite`, `logo`), `teacher/assistants` (+`[id]`, `[id]/invite`), `roster/teachers/**` (4), `center/external-teachers/**` (17, minus the 5 money/enroll routes owned by 2.1/2.2), `teachers` (+`[teacherId]`, `me`, `me/photo`), `search/teachers`, `centers/[id]`, `me` (GET/PATCH), `me/password`, `me/email`, `me/prefs`.
- **Services:** `center/{staff,admins}.ts`, `external-teachers/{external-teachers,gaps,manual-grades}.ts`, `auth/password-reset.ts`, `auth/{login-policy,passwords,session-cookies,view-as-token,secret-compare}` (kernel, Pass A), `whatsapp/*`, `mail/*`; `erp:auth/{register,invite-accept}.ts`, `erp:teacher/assistants.ts`, `erp:media/profile-images.ts`, `erp:external-teachers/index.ts`; `apps/erp/src/lib/auth/{auth,view-as-plugin,invite-token-plugin}.ts`.
- **Screens:** `admin/center-staff-screen.tsx` (496), `admin/admin-teachers-screen.tsx`, `admin/external-teachers-screen.tsx`, `admin/external-teacher-detail-screen.tsx` (696), `admin/external-teacher-gaps-screen.tsx`, `teacher/teacher-team-screen.tsx`, `settings/*` (12 files, 2,498), `app/[locale]/{login,register,forgot-password,reset-password,two-factor,invite,claim}/page.tsx`.
- **Tests:** db `center-staff-delegation`, `external-teachers`, `m5-send-invite-ownership`, `invite-claim`, `rbac-isolation`, `registration-doors`, `c04-login-parity`, `view-as`, `l1-session-invalidation`, `c03-status-revocation`, `mail-password-reset`, `profile-images`; unit `authz-center-actor`, `authz-teacher-actor`, `t2-delegated-gates`, `route-register`, `route-auth-doors`, `m1-login-lockout`, `session-integrity`, `portal-gate`.

### 2.7 Reporting, dashboards & audit trail
- **Routes (≈17):** `reports/**` (9: revenue, revenue-timeseries, expenses, expenses-timeseries, net-profit, course-fill-rates, attendance-by-course, enrollment-funnel, export), `dashboards/{admin,admin/checklist,student,teacher}`, `center/audit-logs` (+`actors`), `center/external-teachers/gaps`; page `reports/print`.
- **Services:** `reports/{reports,report-export}.ts` (1,114 + 341), `center/center-audit.ts`, `external-teachers/gaps.ts`, `analytics/{funnel,posthog-server}.ts`, `packages/server-core/src/analytics/contracts.ts`; `lib/http/provenance.ts`, `lib/analytics/*`.
- **Screens:** `admin/admin-reports-screen.tsx`, `admin/center-staff-reports-screen.tsx`, `admin/report-export-menu.tsx`, `admin/report-print-sheet.tsx`, `admin/admin-dashboard.tsx` (428), `admin/admin-audit-screen.tsx`, `teacher/teacher-dashboard.tsx` (428), `student/student-dashboard.tsx`, `parent/parent-dashboard.tsx`, `parent/parent-progress-screen.tsx`, `components/charts/*`.
- **Tests:** db `report-export`; unit `report-export-csv`, `report-export-tiers`, `reports-period-buckets`, `dashboards-admin-period`, `dashboards-student-contract`, `center-takings`, `http-provenance`, `route-reports-export`.

### 2.8 Academic records: grades, materials, reviews, team notes
- **Routes (≈14):** `grades` (+`[id]`, `[id]/scores`), `materials` (+`[id]`, `[id]/download`), `reviews` (+`[id]`, `eligible`), `team-notes` (+`[id]`), `center/external-teachers/[teacherId]/grades/**` (3).
- **Services:** `erp:grades/grades.ts`, `erp:materials/materials.ts`, `erp:reviews/reviews.ts`, `erp:team-notes/team-notes.ts`, `external-teachers/manual-grades.ts`, `packages/database/src/queries/grading-scale.ts`, `media/{cloudinary,images}.ts`.
- **Screens:** `teacher/teacher-gradebook-screen.tsx` (912), `teacher/teacher-materials-screen.tsx` (614), `teacher/teacher-reviews-screen.tsx`, `student/{grades-screen,student-materials-screen,student-reviews-screen}.tsx`, `grades/*`, `team-notes/team-notes-board.tsx` (472).
- **Tests:** db `materials-access`, `review-per-lesson`, `team-notes`; unit `m6-materials-magic-bytes`.

### 2.9 Notifications, messaging, realtime & parent oversight
- **Routes (≈22):** `messages/**` (11), `notifications/**` (4: list, `[id]`, `[id]/read`, `read-all`, `broadcast`), `realtime/token`, `internal/chat-notify`, `me/unread-counts`, `me/device-tokens` (+`[token]`), `me/push-subscription`, `parent/oversight/**` (4).
- **Services:** `packages/database/src/queries/chat*.ts` (9 files, 3,064 lines), `erp:messages/{messages,realtime-bridge}.ts`, `notifications/{notify,fanout,deep-link}.ts`, `fcm/fcm-channel.ts`, `sms/sms-channel.ts`, `webpush/web-push-channel.ts`, `whatsapp/*` (7 files), `mail/{send,templates}.ts`, `packages/notifications/**` (email templates + SMTP), `erp:notifications/{push-registration,fanout,notify}.ts`, `apps/realtime/src/*`.
- **Screens:** `messaging/*` (5 files, 2,159: `chat-screen` 1,044, `use-chat` 602), `notifications/notifications-screen.tsx` (404), `parent/oversight-screen.tsx`, `lib/pwa/use-push-subscription.ts`.
- **Tests:** db `messaging-scope`, `unread-counts`, `weekly-digest`, `push-registration-ownership`; unit `messaging-matrix`, `messaging-load-errors`, `notifications`, `notification-deep-link`, `route-internal-chat-notify`.

### 2.10 Settings, account & data rights
Split across 2.5 (guardian/children cards), 2.6 (password/email/2FA/sessions), and Pass A (session integrity). `settings/settings-screen.tsx` (863) is the hub; `settings/{two-factor-card,sessions-card,password-card,email-card,profile-image-card,center-profile-card}.tsx`; routes `me/*`, `me/data-rights/**` (5), `me/delete-request`.

### 2.11 Public, discovery, marketing, cron & infra
- **Routes (≈14):** `contact`, `search` (global), `search/{centers,teachers,courses}`, `centers/[id]`, `teachers/[teacherId]`, `subjects`, `payments/availability`, `cron/[job]`, `internal/chat-notify`, `security/csp-report`, `api/health`, `v1/%5Fping`.
- **Services:** `search/global-search.ts` (735), `platform/feature-flags.ts`, `erp:discovery/discovery.ts`, `erp:pricing/public-rates.ts`, `erp:marketing/contact.ts`, `erp:cron/jobs.ts` (4 jobs) + the 5 cron entries wired in `cron/[job]/route.ts:27-45` from other services.
- **Screens:** `marketing/*` (21 files, 1,943), `landing/*`, `legal/*`, help/changelog MDX (68 files under `src/content`), `app/[locale]/{pricing,faq,help,contact,changelog,privacy,terms}/page.tsx`.
- **Tests:** db `center-directory-search`, `global-search`, `search-normalize`; unit `route-public-infra`, `m7-cron-auth`, `csp-policy`, `health-rate-limiter`, `m3-rate-limit`, `mc-shared-rate-limit-store`.

---

## 3. The tenant model

**What a tenant is.** A `Center` (`schema.prisma` model `Center`). 39 models carry a `center_id` column; 41 tables carry RLS (`expected-db-shape.json:4`).

**How the current tenant is resolved (request → SessionUser).**
1. better-auth session is read in `apps/erp/src/lib/auth/session.ts:33-71` (`getSessionUser`). The `SessionUser` shape (`packages/server-core/src/auth/types.ts:3-10`) is `{ id, role, centerId?, locale, name, email }`.
2. `centerId` comes from the **session row**, not the user row: `session.ts:49-57` reads `sessionRow.centerId`. It is stamped at login by `resolveLoginCenterId` (`packages/server-core/src/auth/login-policy.ts:33-55`): `center_admin` → `CenterAdminProfile.centerId`, `center_staff` → `CenterStaff.centerId` where `removedAt IS NULL`. Every other role has `centerId = undefined`.
3. `session.ts:44-46` drops the session if `user.status !== "active"`; `:58-61` drops expired view-as sessions; `:23-30, 73-81` refuse ambiguous multi-cookie requests (`SessionConflictError`).
4. `apps/erp/src/proxy.ts` (Next 16 middleware) is **next-intl only** — there is no auth middleware. Page gating is per-portal layout: all six `dashboard/<portal>/layout.tsx` call `requirePortal(role, locale)` (`apps/erp/src/lib/auth/portal-gate.ts:7-21`), which redirects on missing session, wrong role, or incomplete onboarding. `dashboard/layout.tsx` itself carries no gate (it only mounts `ViewAsBanner`).

**Where `withTenant` is applied.** Never directly by routes or services (0 direct calls in `apps/erp/src/app/api`, 0 in either service layer). It is reached only through `scopedDb` (`packages/server-core/src/db/scope.ts:13-28`):

```
scopedDb(user, fn):
  role === "center_admin" && user.centerId  →  withTenant(centerId, fn)        // RLS ON
  everything else                            →  withPlatformContext(fn)          // RLS BYPASSED
platformDb(fn)                               →  withPlatformContext(fn)          // RLS BYPASSED
```

`withTenant` (`packages/database/src/client.ts:175-184`) opens an interactive transaction and runs `SELECT set_config('app.current_center_id', $1, true)`. `withPlatformContext` (`client.ts:186-193`) runs `set_config('app.bypass_rls', 'on', true)`. Both also bind the transaction into an AsyncLocalStorage (`packages/database/src/context.ts:20-32`) so the auto-audit extension can join it.

**The enforcement boundary.** Three layers, and the guarantee is different per role:

| Layer | Mechanism | Covers |
|---|---|---|
| Postgres RLS | Policy `tenant_isolation USING (rls_bypass() OR center_id = current_center_id())` created by a loop over 21 tables in `packages/database/prisma/migrations/00000000000001_rls_and_constraints/migration.sql:55-75` plus per-table policies in 15 later migrations (list in §3.1). Helper functions `current_center_id()` / `rls_bypass()` at `migration.sql:14-20`. Catalog tables get read-all / write-bypass-only policies (`20260714142944_education_catalog:346-351`). | **Only** requests that go through `withTenant`, i.e. center-actor requests. |
| DB role guard | `roleGuardExtension` (`packages/database/src/extensions/index.ts:286-298`) refuses to serve if the connected role is SUPERUSER or BYPASSRLS (`:248-283`), so RLS cannot be silently inert. `edura_app` is the intended role (`CLAUDE.md:485-496`). | Every query. |
| Application where-clauses | Services filter by `user.centerId`, `user.id`, `teacherId`, `approvedChildIds(...)` etc. Example: the sessions list builds the center's course-id set by hand (`apps/erp/src/app/api/v1/sessions/route.ts:52-60`); direct enroll calls `requireCenterScope` (`packages/server-core/src/services/center/enrollments.ts:83`). | Every role, and the **only** layer for teacher / assistant / student / parent. |

**Role re-mapping that makes RLS reachable for staff and assistants.**
- `center_staff` → `authorizeCenterActor` (`apps/erp/src/lib/authz/center-actor.ts:43-70`) returns an `acting` user with `role: "center_admin"` and the staff link's `centerId` — the comment at `:61` calls this "load-bearing: scopedDb → withTenant(centerId)". So staff requests get RLS. Staff sub-role gating is by allow-list (`RECEPTION`, `MANAGER`, `ACCOUNTANT`, `:11-13`), and `center_accountant` is made read-only at the HTTP-method level (`:74-82`).
- `assistant` → `requireTeacherActor` / `toActingUser` (`apps/erp/src/lib/authz/teacher-actor.ts:20-52`) swaps `id` to the linked teacher's id via `resolveActingTeacher` (`packages/server-core/src/authz/acting-teacher.ts:6-17`). Assistant requests run **without** RLS (teacher path = platform context).

**Consequences the audit must carry.**
- The RLS backstop protects exactly one of eight roles' request paths (center_admin, plus staff via re-mapping). For teacher, assistant, student and parent — 61% of the portal pages and the majority of `me/*` routes — tenancy is entirely application logic. Superadmin's uniform `requireRole("super_admin")` has no ERP equivalent; ERP's isolation risk is concentrated in the 42 `requireSession`-only routes (§4) and in the service-level ownership checks behind them.
- `platformDb` is called **163** times inside server-core services and **64** times inside ERP services. Any `platformDb` call nested inside a `scopedDb` callback opens a *second, RLS-bypassing* transaction (e.g. `enrollments.ts:71-74` inside `enrollStudentTx`; `createSubscriptionCheckout` runs entirely on `platformDb`, `subscriptions.ts:360-437`). These are not findings by themselves — many are deliberate cross-center reads — but each one is a place where RLS is not the guard. Pass A inventories them; domain passes verify each.
- Transactions: interactive, `maxWait 10s / timeout 20s` (`client.ts:105-108`), retried up to 2× only on start-timeout or connection drop *before the body completed* (`client.ts:148-172`). Post-commit side effects are deferred via `packages/server-core/src/db/effects.ts` (`WithEffects` / `runEffects`), the pattern the superadmin H-3 fix standardized.

### 3.1 RLS coverage list (verified from migrations)
Loop in migration 1 (`:56-61`): `center_admin_profiles, center_student_rosters, center_teacher_affiliations, rooms, courses, enrollments, enrollment_requests, attendance_records, grades, materials, classroom_bookings, payments, expenses, transactions, invoices, payouts, blacklist_entries, audit_logs, deletion_requests, message_threads, reviews`; plus `centers` (`:73-77`). Later per-table policies: `center_stages, conversations, conversation_groups, subscriptions, collaboration_requests, center_staff, session_settlements, blacklist_cascade_actions, team_notes, teacher_agreements, center_shifts, center_wallet_ledger, teacher_system_status_changes, external_teacher_settlements`, and the catalog tables. Tables with `center_id` but **no** tenant policy located during mapping: `auth_sessions, invite_tokens, whatsapp_messages, payment_intents, wallet_ledger, commission_settings`. Pass A confirms this list against `pg_policies` on dev and decides whether each omission is intended.

---

## 4. The role / permission model

**Roles** (`schema.prisma:11-22`, enum `Role`): `super_admin`, `accountant`, `center_admin`, `center_staff`, `teacher`, `assistant`, `parent`, `student`. `super_admin` and `accountant` **cannot sign in to ERP** — `LOGIN_APP` in `login-policy.ts:7-17` binds them to the superadmin app; they reach ERP only via the signed, 60-second view-as handoff (`auth/view-as/claim`, `apps/erp/src/lib/auth/view-as-plugin.ts`, `CLAUDE.md:429-438`). **Staff sub-roles** (`CenterStaffRole`): `receptionist`, `manager`, `center_accountant` (`center-actor.ts:11-13`). Portal routing by role: `apps/erp/src/lib/auth/portal.ts:1-8`.

**There is no permission matrix.** Authorization is expressed by *which wrapper a route chose*, and there are **eight coexisting mechanisms**:

| # | Mechanism | Where defined | Route files using it |
|---|---|---|---|
| 1 | `requireRole(...roles)` — session + role allow-list | `apps/erp/src/lib/authz/require-role.ts:5-14` | 105 |
| 2 | `requireSession()` only — any authenticated role; ownership must be enforced in the service | `apps/erp/src/lib/auth/session.ts:73-81` | 51 (42 of them with no `requireRole` and no wrapper) |
| 3 | `centerStaff(handler, { allow })` — center_admin or center_staff, sub-role allow-list, accountant read-only, auto audit row on mutating requests | `center-actor.ts:108-140` | ≈50 |
| 4 | `delegated(handler)` / `delegatedWithCenter(handler, { staffAllow })` — teacher or assistant (assistant acts as teacher, audited), optionally also center actors | `teacher-actor.ts:60-108` | ≈30 |
| 5 | `requireCenterScope(user, resourceCenterId)` — per-resource check, throws `ForbiddenError` | `packages/server-core/src/authz/center-scope.ts:4-12` | 4 routes + ~20 service call sites |
| 6 | Shared-secret / signature: `CRON_SECRET` bearer (`cron/[job]/route.ts:20-27`), `INTERNAL_API_SECRET` header (`internal/chat-notify/route.ts:22-26`), Paymob HMAC (`payments/paymob/webhook/route.ts:14-17`), realtime JWT (`apps/realtime/src/auth.ts:14`), view-as token (`auth/view-as/claim`) | | 5 |
| 7 | Page-level `requirePortal(role)` | `portal-gate.ts:7-21` | 6 layouts |
| 8 | Service-internal role checks, e.g. `createWalkInSubscriptionTx` throws unless `role === "center_admin"` (`subscriptions.ts:528`), `createSubscriptionCheckout` restricts `payFrom` by role (`:350-355`), `cancelPendingSubscription` ownership (`:643-647`), `initiatePayment` students only (`erp:payments/payment-intents.ts:32`) | scattered | — |

**Places where two mechanisms coexist in one route** (worth naming because they are where a reviewer can be misled):
- `api/v1/sessions/route.ts:17-26` is a role switchboard: `requireSession` → `authorizeCenterActor` for staff, `toActingUser` for assistants, then hand-built where-clauses per role.
- `api/v1/payments/[id]/route.ts`: GET is `requireSession` + service ownership (`:14-20`); PATCH is `requireRole("center_admin")` + `requireCenterScope` (`:30-33, 40-42`).
- `api/v1/sessions/[id]/complete/route.ts:8-33`: `delegatedWithCenter` (which already writes a `center_staff.post` audit row on success via `writeCenterStaffAudit`) **and** an inline `tx.auditLog.create` for staff — two audit rows per staff completion. Pass B decides whether that is intended.
- `delegatedWithCenter` (`teacher-actor.ts:93-108`) composes mechanisms 3 and 4 in one wrapper and casts the handler type (`as unknown as CenterActorHandler`).

**Routes with no authentication at all** (19, verified by grep for every guard symbol; all look intentional): `api/health`, `api/auth/[...all]`, `v1/%5Fping`, `v1/guardian/verify`, `v1/contact`, `v1/subjects`, `v1/payments/availability`, `v1/search/{centers,teachers}`, `v1/security/csp-report`, `v1/centers/[id]`, `v1/teachers/[teacherId]`, `v1/auth/password/{forgot,reset}`, `v1/auth/invite/accept`, `v1/auth/register/{center,student,parent,teacher}`. Pass A verifies rate limiting and data exposure on each (31 route files use `withRateLimit`).

**Error / validation envelope** (same kernel as superadmin): `withErrors` (`packages/server-core/src/errors/http.ts:59-68`) is applied on 231 of 235 route files, either directly or inside `centerStaff` / `delegated` / `withRateLimit`; the four without are `api/health`, `api/auth/[...all]`, `auth/view-as/stop`, `auth/view-as/claim`. `fail()` attaches `messageAr` (`packages/server-core/src/http/envelope.ts:37-48`) and the client consumer is `packages/ui/src/lib/api-error.ts:186` (`localizeApiError`). `parseJson` (`packages/server-core/src/validation/zod.ts:22-30`) is used in 113 route files, but only **36** of them contain a `.strict()` schema in-file, and **0** of the 88 `z.object(` schemas defined inside services use `.strict()` — a measurable divergence from the superadmin app's "near-universal `.strict()`". Pass A counts the real gap (schemas imported from services).

---

## 5. The money model

**Units.** Integer **piasters**, currency `EGP`. Shared schema `moneySchema` caps at `MAX_MONEY_PIASTERS = 99_999_900` (`packages/server-core/src/validation/common.ts:26-32`); DB mirrors it with `CHECK` bounds on `courses.price`, `payments.amount` (signed), `transactions.amount`, `expenses.amount`, `invoices.*`, `payouts.*` (`migrations/00000000000001:27-35`). Basis points (`*_bp`, 0..10000) for splits and commissions (`20260719160000_commission_settings:13-40`).

**Balances (denormalized counters).** `centers.wallet_balance` (platform-held payable) and `centers.credit_balance` (signed center↔platform position, may be negative by design — `20260825180100_center_credit_clearing:90`), `teacher_profiles.wallet_balance`, `student_profiles.wallet_balance` + `points_balance`, `parent_profiles.wallet_balance`.

**Ledgers.** `transactions` (single-entry rows with `from_entity_id`/`to_entity_id`/`type`/`reversal_of_id` — **not** double-entry; balances are not derived from it), `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger` (each row carries `delta` + `balance_after`), `points_ledger`, `session_settlements` (one per settled lesson), `external_teacher_settlements`, `payouts`, `invoices`, `payments` (mutable `status`), `payment_intents` (`idempotency_key` and `gateway_order_id` unique).

**Who moves money** (every writer located during mapping):

| Mover | File:line | Writes |
|---|---|---|
| `recordPaymentTx` (counter cash / card / wallet) | `packages/server-core/src/services/payments/payments.ts:38-152` | `Payment` (+ `receiptSeq` increment on `Center`), `Transaction`, points; links `shiftId` via `openShiftIdFor` (`:108`) |
| `settleSubscriptionMoney` | `subscriptions/subscriptions.ts:172-311` (private) | called by walk-in (`:515-606`), wallet checkout (`:360-410`), gateway settlement (`:454-492`) |
| `distributeSessionRevenue` | `finance/distribution.ts:204-450`; entry `completeSessionTx` `:609-633` | 3 `Transaction` rows per present student, `SessionSettlement`, teacher/center wallet increments (`:376`), `creditMove` for center-held funding; refuses unpriced lessons (`:263-275`) |
| `walletCredit` / `walletDebit` (student) | `wallet/wallet.ts:38-88` | conditional decrement `updateMany where walletBalance >= amount` (`:68-74`) + `WalletLedger` |
| `parentWalletCredit` / `parentWalletDebit` | `wallet/parent-wallet.ts:36-83` | same shape |
| `creditMove` (center credit) | `finance/center-credit.ts:63-92` | raw `UPDATE … RETURNING`, no floor (signed by design) + `CenterWalletLedger` |
| `topUpWalletCashTx` | `wallet/cash-topup.ts:24` | student wallet cash top-up at counter |
| `initiate*TopUpIntent` / `settle*FromIntentTx` | `erp:wallet/wallet.ts:57,115`, `erp:wallet/parent-wallet.ts:51,116`, `erp:wallet/center-credit-topup.ts:34,98` | intent → ledger on webhook |
| `processWebhookEvent` | `erp:payments/payment-intents.ts:214-330` | claims intent `updateMany where status='pending'` (`:258-275`) and settles in the **same** transaction (security-audit M1 closed) |
| `requestTeacherPayout` | `erp:finance/teacher-wallet.ts:70-146` | `FOR UPDATE` on profile (`:76-77`), `clientRequestId` idempotency (`:85-90`), amount-replay window (`:112-122`), `available = balance − open payouts` |
| `requestCenterPayoutTx` | `finance/center-wallet.ts:59-114` | same contract, no replay window |
| `cancelOwnPayoutRequest` | `finance/payout-cancel.ts:5-60` | `FOR UPDATE` beneficiary (`:23-25`), claim via `updateMany` (`:41`) |
| `settleWithTeacher` (external teacher) | `external-teachers/reconciliation.ts:180-280` | conditional decrement (`:212-220`) + `Transaction` type `payout` + `ExternalTeacherSettlement` |
| `awardPoints` | `points/points.ts:17-58` | `pointsBalance` increment + `PointsLedger` |
| `closeShift` | `center/shifts.ts:92-130` | `FOR UPDATE` (`:103`), expected vs counted cash variance |
| Expenses CRUD | `expenses/expenses.ts` | center P&L only, no balance |
| Payment "refund" | `api/v1/payments/[id]/route.ts:36-58` | **status transition only** (`paid → refunded`); no ledger reversal, no wallet movement — contrast superadmin's `refunds.ts` clawback |
| Payout approve / settle / reject | superadmin app (`payouts.ts`) | out of ERP scope; ERP only requests and cancels |

**Invariants that are supposed to hold, and what backs each:**

| Invariant | Backing |
|---|---|
| Balances never negative | DB `CHECK (wallet_balance >= 0)` on `teacher_profiles` (`20260720160000:6-7`), `centers` (`:16-17`, validated in all three environments per `CLAUDE.md`), `student_profiles` (`20260722000100:12`), `parent_profiles` (`20260727110100:22`); `balance_after >= 0` on student/parent ledgers. App-side conditional decrements in `walletDebit`, `parentWalletDebit`, `settleWithTeacher`, `settlePayout` (superadmin). **`credit_balance` and `points_balance` have no CHECK** (intentional for credit; unverified for points). |
| Ledgers append-only | Prisma `immutableExtension` for `Transaction, PointsLedger, WalletLedger, ParentWalletLedger, SessionSettlement, TeacherSystemStatusChange, ExternalTeacherSettlement` (`extensions/index.ts:6-14, 122-150`); DB `REVOKE UPDATE, DELETE` for `transactions, points_ledger, audit_logs` (`00000000000003:83-85`), `session_settlements` (`20260722100100:50`), `teacher_system_status_changes`, `external_teacher_settlements` (`20260803100100:201-204`); `REVOKE DELETE` on `invoices`, `payouts` (`:88-89`), `blacklist_cascade_actions`. **`wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger` have no DB REVOKE** — deliberately deferred to "launch hardening" (`20260722000100:41-43`, `20260727110100:55`). |
| Settlement sums | `CHECK (platform_total + center_total + teacher_total = per_session_price * present_count)` (`20260722100100:34`); `UNIQUE(session_id)` on `session_settlements`. |
| A lesson settles once | `updateMany where distributedAt IS NULL` claim (`distribution.ts:245-249`) after `lockSessionRow` `FOR UPDATE` (`attendance/lesson-lock.ts:16-18`, `distribution.ts:209`); attendance edits on a settled lesson refused via `lessonClosed` (`checkin.ts:266, 403`) unless explicitly reopened (`attendance.ts:205`). |
| One price derivation | `resolveLessonPrice` (`finance/fees.ts:44`) + `courses.settlement_basis`; unpriced lesson refuses to complete (`distribution.ts:271-275`). Binding per `CLAUDE.md:370-373`. |
| Idempotency | `payment_intents.idempotency_key` unique + owner check (`payment-intents.ts:41-49`); `payouts (beneficiary_id, client_request_id)` unique (schema `Payout` `@@unique`, migration 70); intent webhook claim; receipt numbers unique per `Payment`; `ref_number` unique per `Transaction` via sequence (`ref-numbers.ts`). **No idempotency key on `recordPaymentTx` or walk-in subscriptions** (security-audit L10, still open). |
| Money direction unchanged by payer | `payments.payer_user_id` / `Subscription.createdBy` record who paid; ledger always student → center/teacher (`CLAUDE.md:363-366`). |
| Reconciliation | `reconcileWallet` (`wallet.ts:120`) and `reconcileParentWallet` (`parent-wallet.ts:84`) compare counter vs `SUM(delta)` vs last `balance_after` — used by tests, not scheduled. |

**Read-only in the back office; superadmin reuse.** Superadmin reaches ERP money paths via `superadminAsCenter` (`apps/superadmin/src/lib/authz/center-actor.ts:11`) which fabricates a center_admin `SessionUser`; that is superadmin's C-3 and out of scope here, but Pass B must remember that every `…Tx` money function has a second caller.

---

## 6. The booking / enrollment model

**Entities.** `Course` (`max_students` required, `price` / `price_per_month` / `price_per_session`, `pricing_method`, `settlement_basis`, nullable `center_id` for teacher-direct), `Session` (generated from `days_of_week`/`start_date`/`end_date` by `sessions/session-generator.ts:40-150`), `Enrollment` (the roster link), `EnrollmentRequest` (student asks, `expires_at`), `Subscription` (payment coverage that *wraps* enrollment, `CLAUDE.md:272-286`), `CollaborationRequest` (teacher↔center proposal that, on accept, creates the course + sessions + affiliation, `collaboration.ts:308-517`).

**How a seat is claimed.** An `Enrollment` row with `status = 'active'`. Duplicate protection is at the DB: partial unique `enrollments_active_student_course ON (student_id, course_id) WHERE status = 'active'` (`00000000000003:48-49`); services pre-check with `findFirst` and map `P2002` → `ConflictError` (`enrollments.ts:105-116, 233-244`). Creation paths: direct enroll (`enrollStudentTx`, `enrollments.ts:63-135`), request approval (`approveEnrollmentRequestTx`, `:198-271`), subscription activation (`activateSubscription`, `subscriptions.ts:120-160` — creates the enrollment if missing), manual entry for external teachers (`manual-students.ts:354`), bulk CSV import (`center/bulk-import-students.ts`).

**How capacity is enforced.** `max_students` is checked by `count(active) >= maxStudents` in exactly two places: `approveEnrollmentRequestTx` (`enrollments.ts:215-220`, error code `course_full`) and `enrollManualStudent` (`manual-students.ts:420`). It is **not** checked in direct enroll, in `activateSubscription`, in walk-in or online subscription checkout, or in collaboration accept (which sets `maxStudents = expectedStudents ?? 30`, `collaboration.ts:22, 455`). Blacklist restore detects over-capacity and only notifies (`blacklist/blacklist.ts:143-154`). `remainingSeats` is computed for display in three places (`courses.ts:462`, `erp:discovery.ts:214`, `api/v1/courses/[id]/route.ts:59`). Neither capacity check takes a lock on the course row, so two concurrent approvals can both pass the count. Whether capacity is meant to be a hard limit is not written down anywhere found during mapping; Pass C settles it (§8 Q3).

**Subscriptions / coverage.** `plan ∈ {monthly, per_session}`; `status: pending_payment → active → expired | cancelled` (DB `CHECK (status <> 'active' OR activated_at IS NOT NULL)`). Duplicates prevented by partial uniques `subs_one_active_monthly (student_id, course_id)` and `subs_one_active_pass (student_id, session_id)` (`20260719120000:72-74`) plus the app pre-check `assertNoDuplicateActive` (`subscriptions.ts:89-114`). Monthly window is `now + 30 days` (`:29`, `MONTH_MS`). Per-session passes lock the session row while resolving (`:52`). Coverage queries: `subscriptions/coverage.ts`, `teacher-coverage.ts`; the settlement engine prices each present student at their own coverage under `settlement_basis = subscription` (`CLAUDE.md` lesson-settlement decision).

**Waitlist.** None exists (no `waitlist` symbol anywhere). `EnrollmentRequest` with `expires_at` is the only "ask" state.

**Cancellation / expiry / refunds.**
- Student/parent may cancel only `pending_payment` subscriptions (`cancelPendingSubscription`, `subscriptions.ts:639-658`, route `subscriptions/[id]/cancel`). Active subscriptions cannot be cancelled by the client from ERP.
- `unenrollStudentTx` (`enrollments.ts:137-155`) flips the enrollment; it does not touch the subscription or money.
- `cancelCourseTx` (`courses.ts:343`), `cancelSessionTx` / `postponeSessionTx` (`session-actions/session-actions.ts:42, 116`) — Pass C checks what happens to paid per-session passes and monthly coverage when the underlying session/course is cancelled.
- Expiry is a **cron** job: `expireSubscriptions` (`subscriptions.ts:660-700`: monthly by `period_end`, passes by session date, stale pending after 24h). `cron/[job]/route.ts` exposes 9 jobs behind `CRON_SECRET`, but `apps/erp/vercel.json` defines **no `crons` block**, and `docs/reports/cron-jobs-unscheduled.md` (2026-07-26, status *open — pre-launch blocker*) records that nothing invokes the endpoint. Pass F confirms whether an external scheduler now exists.
- Refund: ERP's only refund surface is the `Payment.status` PATCH (`payments/[id]/route.ts:36-58`, `paid → refunded`), with no compensating ledger/wallet movement. `walletDebit`/`walletCredit` accept `type: "refund"` but no ERP caller was found passing it. Real refunds with clawback live in superadmin.

**Where concurrency is handled.**
- Row locks: `lockSessionRow` `FOR UPDATE` for attendance writes, counter/door check-in, settlement, per-session pass resolution, offline sync (`attendance.ts:121, 295`; `checkin.ts:250, 394`; `distribution.ts:209`; `subscriptions.ts:52`; `erp:attendance/sync.ts:39`); `FOR UPDATE` on payer profile for wallet checkouts (`subscriptions.ts:371-373`); on beneficiary for payout request/cancel; on shift for close.
- Claims via `updateMany` with a status/null predicate: session distribution, payment-intent webhook, payout cancel, agreement decide (`agreements.ts:148`).
- DB partial uniques as the last line: enrollments, subscriptions, payouts client key, agreements one-active-per-pair (`AGREEMENT_ONE_ACTIVE_PER_PAIR`, `agreements.ts:191`), plus the three from superadmin C-4 (`packages/server-core/src/db/unique-indexes.ts`).
- **No lock or unique backs the capacity count** (above).

---

## 7. Proposed split — seven parallel read-only passes

Each pass is one session. Every pass reads this file and `AUDIT_REPORT.md` §"What is already solid" first, then its own globs, and writes `docs/audits/erp/<pass>.md` with findings in the superadmin format (ID, severity, `file:line`, impact, fix). Findings that belong to another pass are written to `docs/audits/erp/handoff-<pass>.md`, not investigated. Line counts are approximate and are the *read* budget, not the write budget.

Every pass applies the same checklist to its surface: (1) guard + scope on every route and every service entry; (2) transaction atomicity — writes + audit row in one tx, effects after commit; (3) `.strict()` and bounds on every body/query schema; (4) idempotency and races on every write; (5) `messageAr` / no hardcoded English on user-facing strings; (6) UI action states (busy, success, distinct error, 403 rendered as denied) on every mutation in its screens; (7) a11y on its screens (labels, keyboard, `aria-*`); (8) unbounded reads / N+1; (9) endpoints with no client caller (grep `features/**` and `lib/**` for the path).

### Pass A — Kernel, tenancy & authorization (≈9k lines)
Owns the mechanism, the 235 route *guard lines*, and every auth flow.
- `apps/erp/src/lib/auth/**`, `apps/erp/src/lib/authz/**`, `apps/erp/src/proxy.ts`, `apps/erp/src/lib/config/secrets.ts`, `apps/erp/src/lib/http/**`, `apps/erp/src/lib/observability/sentry-user.ts`
- `packages/server-core/src/{auth,authz,db,errors,http,rate-limit,validation}/**`
- `packages/database/src/{client,context,index,neon-ws,pg-ssl}.ts`, `packages/database/src/extensions/**`, `packages/database/src/queries/auth.ts`
- `packages/database/prisma/migrations/**` — RLS, REVOKE, role-guard sections only (§3.1 list; grep `POLICY|REVOKE|ROW LEVEL`)
- `apps/erp/src/app/api/**/route.ts` — first 30 lines of each (wrapper, guard, schema), not the bodies
- `apps/erp/src/app/[locale]/**/layout.tsx`, the 8 SSR pages in §1.1 Deviation 3, `app/[locale]/{login,register,forgot-password,reset-password,two-factor,invite,claim,guardian}/**`
- Routes owned end-to-end: `auth/**`, `api/auth/[...all]`, `me` (GET/PATCH), `me/{password,email,credentials,prefs,delete-request,data-rights/**}`, `security/csp-report`, `health`, `%5Fping`
- Services: `data-rights/**`, `auth/password-reset.ts`, `erp:auth/**`
- Screens: `settings/**` (auth-related cards), `components/providers/session-integrity-guard.tsx`
- Tests to read: `rbac-isolation`, `sessions-staff-scope`, `view-as`, `l1-session-invalidation`, `c03-status-revocation`, `c04-login-parity`, `registration-doors`, unit `authz-*`, `t2-delegated-gates`, `route-auth-doors`, `route-conventions`, `session-integrity`, `portal-gate`
- Specific questions: §8 Q1, Q2, Q6, Q7; the `platformDb`-inside-`scopedDb` inventory; the six unpoliced `center_id` tables; the 19 unauthenticated routes; the `.strict()` real coverage.

### Pass B — Money engine (≈12k lines, the heavy one)
- `packages/server-core/src/services/{finance,wallet,payments,points,expenses}/**`, `center/shifts.ts`, `external-teachers/reconciliation.ts`, `packages/server-core/src/db/effects.ts`
- `apps/erp/src/lib/services/{payments,wallet,finance}/**`, `apps/erp/src/lib/payments/**`
- Routes: every path in §2.1
- Schema models: `Payment, PaymentIntent, Transaction, WalletLedger, ParentWalletLedger, CenterWalletLedger, WalletSettings, Payout, Invoice, SessionSettlement, ExternalTeacherSettlement, CenterShift, Expense, CommissionSetting, TeacherAgreement`, wallet fields on `Center/TeacherProfile/StudentProfile/ParentProfile`; migrations `00000000000001..3`, `payment_intents`, `subscriptions` (money columns), `commission_settings`, `wallet_nonneg_check`, `student_wallet`, `parent_wallet`, `session_settlements`, `center_credit_clearing`, `teacher_agreements`, `settlements_for_all_lessons`, `payout_client_request_id`
- Screens: §2.1 list (`admin-fees-screen`, `parent-pay-screen`, wallets, receipts, ledger components, shift/walk-in panels)
- Tests: §2.1 list; read `docs/decisions/{lesson-settlement,parent-pays-lesson,external-teachers,counter-board,money-day-boundary,attendance-reopen-settlement}.md` and `docs/architecture/fee-points-engine.md` first
- Specific questions: §8 Q4, Q5, Q8; every balance mutation has a same-tx ledger row; `creditMove` floor semantics; teacher wallet has no per-entry ledger (Transaction rows are the ledger — confirm reconciliation is possible); the deferred wallet-ledger REVOKEs; `recordPaymentTx` double-submit; `payments/[id]` PATCH refund semantics; the two-audit-rows case in `sessions/[id]/complete`.
- If over budget: defer `invoices.ts`, `receipt-*.ts`, `expenses` and the expenses screen to Pass G.

### Pass C — Enrollment, subscriptions, roster, courses, catalog (≈10k lines)
- `packages/server-core/src/services/{subscriptions,walk-in,temp-students,blacklist,catalog}/**`, `center/{courses,enrollments,roster,roster-membership,bulk-import-students,student-csv}.ts`, `external-teachers/manual-students.ts`
- `apps/erp/src/lib/services/{discovery,catalog,subscriptions,walk-in,temp-students}/**`
- Routes: every path in §2.2
- Schema: `Course, Enrollment, EnrollmentRequest, Subscription, CenterStudentRoster, BlacklistEntry, BlacklistCascadeAction, InviteToken`, catalog models; migrations `subscriptions`, `blacklist_cascade_journal`, `education_catalog`, `dedupe_guards`
- Screens: §2.2 list (`admin-classes-screen` 1,522 is the big read)
- Tests: §2.2 list; read `docs/decisions/{bulk-student-import,external-teachers}.md`, `docs/architecture/education-catalog.md`
- Specific questions: §8 Q3 (capacity), Q9; what a cancelled course/session does to paid coverage; `activateSubscription` creating enrollments with no capacity or blacklist check; `createSubscriptionCheckout` running under `platformDb` for center courses; P2002 from the subscription partial uniques surfacing as a generic 409.
- Shared boundary with B: C owns everything in `subscriptions.ts` **except** `settleSubscriptionMoney` (`:172-311`), which B owns. Shared boundary with D: D owns `createWalkInSubscriptionTx`'s attendance upsert (`:568-585`); C owns the rest of the function.

### Pass D — Attendance, check-in, identity & scheduling (≈12k lines)
- `packages/server-core/src/services/{attendance,students,sessions,session-actions,rooms,collaboration}/**`, `finance/agreements.ts` (proposal/decide flow only; rates are B's), `external-teachers/external-teachers.ts` (convert paths `:670-870`)
- `apps/erp/src/lib/services/{attendance,rooms,sessions}/**`, `apps/erp/src/lib/{attendance,pwa,rooms}/**`
- Routes: every path in §2.3 and §2.4
- Schema: `Session, AttendanceRecord, Room, CollaborationRequest, CenterTeacherAffiliation, TeacherAssistant`; migrations `room_pricing_*`, `collaboration_requests`, `assistant_delegation`, `student_code_v2`, `student_qr_credential`
- Screens: §2.3 and §2.4 lists (counter screen 973, rooms 950, collaboration panel 1,006)
- Tests: §2.3 and §2.4 lists; read `docs/decisions/{counter-board,attendance-reopen-settlement,student-id-card,student-card-qr,lesson-times-12h}.md`
- Specific questions: offline outbox replay safety (`erp:attendance/sync.ts`, `lib/pwa/attendance-outbox.ts`); door vs counter mode transitions; `lessonClosed` coverage on every attendance writer; session regeneration vs existing attendance/settlements; collaboration accept atomicity (course + sessions + affiliation + agreement); room-rate ceilings; QR credential revocation.
- If over budget: hand `collaboration/**` + `collaboration-panel.tsx` (≈1.8k) to Pass C.

### Pass E — People: staff, teachers, assistants, external teachers, guardians, parents, invites (≈11k lines)
- `packages/server-core/src/services/{invites,center/staff.ts,center/admins.ts,center/deletion-requests.ts,external-teachers/{external-teachers,gaps,manual-grades}.ts,whatsapp,mail,notifications/fanout.ts}`, `packages/server-core/src/mail/**`, `packages/database/src/queries/{chat-guardian,chat-minors}.ts`
- `apps/erp/src/lib/services/{teacher,parent-links,invites,onboarding,media,activation,external-teachers,marketing}/**`
- Routes: every path in §2.5 and §2.6 not owned by A (i.e. minus `auth/**`, `me` self-account routes)
- Schema: `User, StudentProfile, ParentProfile, TeacherProfile, CenterAdminProfile, CenterStaff, TeacherAssistant, ParentStudentLink, InviteToken, WhatsAppMessage, DeletionRequest, DataExportRequest, TeacherSystemStatusChange`; migrations `center_staff`, `external_teachers`, `maturity_layer`, `dedupe_guards`
- Screens: §2.5 and §2.6 lists (`parent/**`, `onboarding/**`, `center-staff-screen`, external-teacher screens, `settings/**` non-auth cards)
- Tests: §2.5 and §2.6 lists; read `docs/decisions/{external-teachers,email-invites-guardian,guardian-email-verification,messaging (minor rules),self-service-corrections,parent-portal-dedup}.md`
- Specific questions: every invite/claim path's ownership (security-audit M5 pattern) and token expiry; `findStudentByKeys` / `normalizeNationalId` as the single identity rule; `isMinor()` default-minor gate on every guardian-facing surface; staff sub-role escalation (can a `receptionist` reach a `MANAGER` route through a non-`centerStaff` wrapper?); assistant delegation exclusions (wallet/payouts/assistants) enforced server-side, not just by nav.

### Pass F — Messaging, notifications, realtime, cron, public & infra (≈10k lines)
- `packages/database/src/queries/chat*.ts` (all 9), `apps/erp/src/lib/services/{messages,notifications,cron}/**`, `packages/server-core/src/services/{notifications,fcm,sms,webpush,search,platform}/**`, `packages/notifications/src/**`, `apps/realtime/src/**`, `apps/erp/src/lib/rate-limit/**` (behavioural, A owns the kernel code)
- Routes: every path in §2.9 and §2.11, plus `notifications/broadcast`, `parent/oversight/**`
- Schema: `Conversation*, Group*, Notification, UserDeviceToken, WebPushSubscription, UserPrefs, ContactSubmission, FeatureFlag`; migrations `realtime_chat`, `messaging_scope_groups_safety`, `contact_submissions`
- Screens: `messaging/**`, `notifications/**`, `parent/oversight-screen.tsx`, `marketing/**` (skim for data exposure only), `lib/pwa/use-push-subscription.ts`
- Tests: §2.9 and §2.11 lists; read `docs/decisions/{messaging,global-search,weekly-center-digest}.md`, `docs/reports/cron-jobs-unscheduled.md`
- Specific questions: §8 Q10 (cron scheduling); chat reach matrix vs `reachableRoles` (`chat-scope.ts:866`); minor/guardian gate on every send path including groups and realtime bridge; `internal/chat-notify` and realtime JWT secret separation (security-audit M2/L9 status); notification fan-out volume and failure isolation (`notifyAfterCommit`, `notify.ts:193`); public search/discovery field exposure (`search/*`, `centers/[id]`, `teachers/[teacherId]`); global search "adds no reach" invariant.

### Pass G — Insight, academic records & the shared client kit (≈13k lines, half of it skim)
- Server: `packages/server-core/src/services/{reports,center/center-audit.ts,analytics}/**`, `apps/erp/src/lib/services/{grades,materials,reviews,team-notes}/**`, `external-teachers/manual-grades.ts`, `packages/database/src/queries/grading-scale.ts`, `apps/erp/src/lib/{analytics,http/provenance}.ts`
- Routes: every path in §2.7 and §2.8
- Screens: §2.7 and §2.8 lists (all six dashboards, gradebook 912, materials 614, reports/print, audit viewer, team-notes board)
- Client kit (owned for the cross-cutting a11y / DRY / state findings): `apps/erp/src/components/**`, `apps/erp/src/lib/{api,refine,i18n}/**`, `packages/client-core/src/**`, `packages/ui/src/lib/api-error.ts`, `packages/ui/src/components/{data-table,form,dialog,sheet,sidebar,confirm-dialog,input,select}.tsx`, `apps/erp/src/messages/**` (i18n parity)
- Tests: §2.7 and §2.8 lists; unit `i18n-parity`, `api-error-*`, `query-section-combine`, `error-boundary-and-as-array`, `design-*`, `tailwind-dead-classes`
- Specific questions: "export runs the same service the screen runs" (`CLAUDE.md:386-388`) on every report; unbounded report reads (`reports.ts` date-range defaults); materials access + magic-byte check status (security-audit M6); grade score visibility to parents vs students; audit-log viewer redaction; the two feature-layer service imports (§1.1); whether ERP's `useAction` (`lib/api/use-action.ts`) is the shared mutation hook superadmin's M-8 asked for, and its adoption rate across the other six passes' screens (report the number, do not re-review those screens).

**Overlap rules.** Each file has exactly one owner (the lists above); when a symbol is called across passes (e.g. `notify()` from a money service) the *caller's* pass reviews the call site and the *owner's* pass reviews the implementation. The only deliberately shared files are `subscriptions.ts` (B/C/D split by line range above) and `external-teachers.ts` (D owns convert `:670-870`, E owns the rest).

---

## 8. Questions surfaced during mapping (for the owning pass — not findings)

1. **(A)** Six tables carry `center_id` without a tenant policy: `auth_sessions, invite_tokens, whatsapp_messages, payment_intents, wallet_ledger, commission_settings`. Intended? Verify against `pg_policies` on dev.
2. **(A)** `.strict()` appears in 36/113 route files and in 0/88 service-defined `z.object` schemas. Is the real strict coverage lower than superadmin's, and does any route accept unknown keys into a Prisma `data:` spread?
3. **(C)** Is `max_students` a hard limit? Enforced only on request approval (`enrollments.ts:215-220`) and manual entry (`manual-students.ts:420`); not on direct enroll, subscription activation, walk-in, checkout, or collaboration accept; no lock on the count.
4. **(B)** ERP refund is a `Payment.status` flip with no ledger reversal (`payments/[id]/route.ts:36-58`). Is that the intended ERP surface, with real refunds only in superadmin?
5. **(B)** `sessions/[id]/complete/route.ts:13-32` writes an inline audit row for staff while `delegatedWithCenter` → `writeCenterStaffAudit` already writes one. Two rows per completion, or is the inline one carrying data the wrapper cannot?
6. **(A)** `platformDb` nested inside `scopedDb` callbacks (e.g. `enrollments.ts:71-74`) opens a second RLS-bypassing transaction and rebinds the audit-tx AsyncLocalStorage. Inventory every nesting and confirm each is a deliberate cross-center read.
7. **(A)** `packages/database/src/queries/auth.ts:5-13` uses the bare `prisma` client with no context — who calls it, and is it only better-auth internals?
8. **(B)** `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger` have Prisma-level immutability only; the DB REVOKE was deferred "until after the demo wipe" (`20260722000100:41-43`). Production was wiped on 2026-08-26 — is the deferral still justified?
9. **(C)** `activateSubscription` (`subscriptions.ts:120-160`) creates an `Enrollment` without the blacklist/roster/capacity checks that `enrollStudentTx` performs. Are those checks guaranteed upstream on every activation path (walk-in, wallet checkout, gateway webhook)?
10. **(F)** `apps/erp/vercel.json` has no `crons`; `docs/reports/cron-jobs-unscheduled.md` is marked open. If still true, `expireSubscriptions`, `expirePaymentIntents`, `expireCollaborationRequests`, reminders and month-end statements never run in production — which turns several "expiry" invariants in §6 into no-ops.
11. **(E)** Teacher payout requests live in an ERP-only service (`erp:finance/teacher-wallet.ts`) while center payouts are in server-core. Superadmin's `superadminAsCenter` cannot reach the teacher path — confirm superadmin does not have a *different* teacher-payout implementation (a second money engine).
12. **(G)** `features/marketing/pricing-screen.tsx:5` and `features/onboarding/student-wizard.tsx:10` import from `@/lib/services/**`. Confirm both modules are client-safe and pull no server-only code into the bundle.

---

## 9. What each pass must read before starting

- This file, §3–§6 in full.
- `AUDIT_REPORT.md` "What is already solid" (`:340-353`) and "Remediation log" — to avoid re-finding fixed kernel issues.
- `docs/security/security-audit.md` severity table + `CLAUDE.md:878-1090` remediation status — several ERP-specific items (L3, L4, L5, L7, L8, L10, M6, M8) may still be open; the owning pass confirms status rather than re-discovering them.
- `CLAUDE.md:355-451` binding invariants; the decision docs named per pass.
- `docs/reports/feature-completeness.md` and `docs/reports/api-modernization-audit.md` for prior dead-endpoint and convention counts.

Output location: `docs/audits/erp/<A..G>.md` per pass, merged afterwards into `ERP_AUDIT_REPORT.md` in the superadmin report's format.
