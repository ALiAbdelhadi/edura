# API Audit Changelog — 2026-07-12

Audit of all API routes against PRD §4 (endpoints), §8.1 (RBAC), §8.2 (data
isolation), §8.3 (input validation). 45 findings surfaced (8 high, 20 medium,
17 low) + 33 PRD endpoints not yet built.

## ✅ Fixed (verified live)

### High severity — data-isolation leaks / cross-user reads
| # | Route | Fix |
|---|-------|-----|
| 1 | `GET /payments/:id`, `/payments/:id/receipt` | `getPayment` had no default-deny — a **teacher** (or any un-handled role) could read ANY payment. Added `else → Forbidden`. **Verified 403.** |
| 2 | `GET /grades/:id` | Teacher fell through with no ownership check, reading any grade. Now requires `grade.teacherId === user.id`; default-deny others. |
| 3 | `GET /teachers/:id` (public) | `getTeacherPublicProfile` exposed teacher **email** on an unauthenticated endpoint. Removed email from the select. **Verified no email field.** |
| 4 | `GET /search/centers` | Returned full center rows (walletBalance, receiptSeq, ownerUserId, email) publicly. Now `select`s only public fields. **Verified.** |
| 5 | `GET /search/courses` | `include: { center: true }` spread the full center object publicly. Now selects only public course + public center fields. |
| 6 | `PATCH /reviews/:id` | No 24h edit-window enforcement (§8.3). Added: reject edits >24h after creation. |
| 7 | `POST /sessions/:id/postpone` | `newDate` accepted past dates. Added not-past refinement. |
| 8 | `POST /register/*` | Phone regex was generic, not Egyptian (§8.3). Tightened shared `phoneSchema` to `^(?:\+20\|0)1[0125]\d{8}$`. **Verified 400 on bad phone.** |

### Medium severity
- **Money bounds (§8.3):** added `0..99,999,900` piaster limits to `POST/PATCH /courses` (price), `POST/PATCH /expenses`, `POST /payments` (signed). Shared `moneySchema`/`signedMoneySchema`. **Verified 400 on over-bound.**
- **Material upload:** lowered limit `20MB → 10MB` (PRD PDF limit).
- **Grade scores:** `bulkUpsertScores` now verifies each student is actively enrolled in the grade's course before scoring.
- **Review `centerId`:** `createReview` now derives `centerId` from the student's attendance with that teacher (was always null, breaking `?centerId=` filters).
- **Login enumeration:** `/auth/login` now always runs one `bcrypt.compare` (dummy hash for missing/inactive users) to remove the timing oracle.
- **Session date bug:** `/courses/:id/cancel` and `/reassign-teacher` used un-normalized `new Date()` vs UTC-midnight session dates, silently skipping **today's** sessions. Now use `startOfTodayUTC()`.
- **Course dates:** `startDate` cannot be in the past; `endDate ≥ startDate`.
- **`PATCH /me`:** phone now validated to Egyptian format.

## ⚠️ Flagged — recommended next (not yet fixed)
- **Rate limiter** is an in-process Map (bypassable across serverless instances). Back it with a shared store (Neon/Redis) before high-traffic production.
- **`POST /messages`:** does not verify the recipient shares a center/relationship with the sender, and never triggers a notification (PRD §6). Add a relationship check + `notify()`.
- **`POST /me/device-tokens`:** an FCM token already owned by another user is silently reassigned to the caller. Scope the upsert to the caller or reject collisions.
- **`PATCH /roster/students/:studentId`:** a center_admin can mutate GLOBAL `User.name/email/phone` for a roster student shared across centers. Restrict to center-local fields.
- **Enum query params** (`notifications?type=`, `deletion-requests?status=`) are cast to Prisma enums without validation → raw errors on bad input. Validate against the enum.
- **Unbounded string lengths** on `messages.body` and `notifications/broadcast` title/body.
- **Attendance status** enum diverges from PRD (`present|absent|excused` vs PRD `present|absent|late|removed`); single-record edit is admin-only (PRD gives teachers ownership of their own lessons' attendance).
- **Temp-student merge (§5.4):** registration doesn't detect invite_code/phone matches to claim invited profiles.

## 🏗️ Missing PRD endpoints (build backlog, by priority)
**High:** money-distribution/fee engine (§5.1), `POST /auth/verify-otp`, temp-student `claim` (§5.4), offline attendance `sync` (§5.3).
**Medium:** invoices (§5.5) + payouts (§4.3) surfaces, center blacklist list/add/remove (§7), parent per-child views (summary/schedule/expenses), `GET /sessions/:id/roster`, teacher single-lesson create, `POST /auth/refresh`, teacher rating reply.
**Low / new roles:** super_admin + accountant roles and their entire management/finance surfaces (§4.2/§4.3), teacher revenue-share, shadow centers.

> Roles note: PRD super_admin/accountant do not exist in Edura (roles: student|parent|teacher|center_admin). Their endpoints require adding the roles first; the Prisma schema already models them.
