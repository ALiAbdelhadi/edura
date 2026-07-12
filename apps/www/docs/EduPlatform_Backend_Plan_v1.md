# EduPlatform — Backend Plan (v1)

> Companion to `EduPlatform_Spec_v2.md`. No code. This is the full backend imagination: assumptions, architecture, data model, cross-cutting specs, REST resource map, epic/story/task breakdown, and build sequence.

---

## 0. Locked Assumptions

| Area | Decision |
|---|---|
| Runtime | **Next.js** (App Router, route handlers under `/app/api/...`) |
| Database | **MongoDB** via Mongoose |
| Auth | **next-auth** Credentials provider, session cookie (HTTP-only) |
| API style | REST-ish, flat resource tree, `/api/v1/*`, JSON envelope `{ data, error, meta }` |
| File storage | **Cloudinary** (profile photos + PDF materials, signed URLs, 1h expiry) |
| Email | Mailgun or SendGrid (dev/test inbox only in V1) |
| Push | **FCM deferred to final phase.** Notifications service designed with a channel interface so FCM plugs in later. V1 ships with `in-app` channel only. |
| Search | Mongo text index + `2dsphere` geo index. No Elasticsearch. |
| Pagination | `?page=1&limit=20`, default 20, max 100 |
| Language | Web-only, bilingual (AR/EN), RTL for Arabic |

**Open-questions resolutions adopted from the spec:**

1. Admins can remove other admins, but not the last admin (must invite replacement first).
2. Reviews unlock on at least one **present** attendance. `excused` and `absent` do not count.
3. Subject list is a hardcoded seed; no in-app editor in V1.
4. Center registration is self-serve, no approval gate.
5. Account deletion = anonymize PII, retain financial and academic records.

---

## 1. High-Level Architecture

```
Next.js App Router
├── /app/(auth)/*                UI pages (out of scope here)
├── /app/api/v1/*                Route handlers = the backend
└── /lib
    ├── db/                      Mongoose models + connection
    ├── auth/                    next-auth config, guards
    ├── authz/                   Role + ownership checks
    ├── services/                Business logic (sessionGen, conflicts, receipts, notifications, …)
    ├── channels/                Notification channel adapters (inapp, email, fcm[later])
    ├── storage/                 Cloudinary wrapper, signed URL helpers
    ├── validation/              Zod schemas for request bodies
    ├── errors/                  Typed errors → HTTP mapping
    └── utils/                   Shared helpers (receiptSeq, geo, time)
```

**Design principles**

- **Thin route handlers, fat services.** Handlers validate input, call services, shape responses.
- **Role check at every handler entry.** A `requireRole(...roles)` guard reads the session, rejects early.
- **Ownership/tenancy check second.** A `requireCenterScope(resource, user)` guard confirms the user's center matches the resource's center.
- **No cross-center data leaks.** Every list query is scoped to the session user's center for admin/teacher roles.
- **Idempotency where it matters.** Attendance bulk mark, enrollment-request approval, session cancel all must be safe to retry.
- **Soft delete** on users, centers, courses. Hard delete on transient records only (notifications older than N days, expired invites).

---

## 2. Data Model

All collections use `_id: ObjectId`, `createdAt`, `updatedAt` unless noted. Money is stored as integer minor units (piastres) to avoid float rounding.

### 2.1 Identity

**`users`** — single collection, role discriminator
```
email                string, unique, lowercase, indexed
phone                string, unique sparse, indexed
passwordHash         string (null for un-activated shells)
role                 enum: student | parent | teacher | center_admin
name                 string
locale               enum: ar | en (default ar)
status               enum: active | shell | suspended | deleted
emailVerified        bool
createdAt, updatedAt, deletedAt
```
Shell accounts: `status=shell`, `passwordHash=null`. Activated via `POST /auth/invite/accept` which flips to `active`.

**`studentProfiles`** — 1:1 with user where role=student
```
userId               ref users, unique
familyLinkCode       string (10–12 chars, unique), rotatable
savedAreaCity        string
savedAreaLocation    GeoJSON Point (optional)
```

**`parentProfiles`** — 1:1 with user where role=parent
```
userId               ref users, unique
```

**`teacherProfiles`** — 1:1 with user where role=teacher
```
userId               ref users, unique
bio                  string
subjects             [string]   // indexed
qualifications       string
experienceYears      number
photoUrl             string (Cloudinary)
ratingAvg            number (denormalized, recomputed on review write)
ratingCount          number
```

**`centerAdminProfiles`** — 1:1 with user where role=center_admin
```
userId               ref users, unique
centerId             ref centers, indexed
```
(Admin → exactly one center in V1.)

### 2.2 Centers & Affiliations

**`centers`**
```
name, shortId (5–6 char slug, unique, used in receipts)
description, subjects [string], address
location             GeoJSON Point, 2dsphere indexed
phone, whatsapp, email, logoUrl
status               enum: active | suspended
receiptSeq           number (monotonically increasing counter)
```

**`centerTeacherAffiliations`** — teacher ↔ center membership
```
centerId, teacherId
status               enum: pending | active | declined | expired | removed
invitedAt, respondedAt, removedAt, expiresAt
```
Composite unique index `(centerId, teacherId)` where `status ∈ {pending, active}`. Expired/declined rows allow re-invite.

**`centerStudentRosters`** — student ↔ center membership
```
centerId, studentId
operationalParentName, operationalParentPhone     // free text, center-owned
addedAt, leftAt
blacklisted          bool
blacklistReason      string
blacklistedAt, blacklistedBy
```
Unique `(centerId, studentId)`.

**`parentStudentLinks`**
```
parentId, studentId
status               enum: pending | approved | rejected | revoked
initiatedBy          enum: parent | student
path                 enum: family_code | mutual_approval
createdAt, approvedAt, revokedAt, revokedBy
```
Business rule: at most **one** row with `status=approved` per `studentId` at any time. Past rows retained for audit.

### 2.3 Teaching

**`rooms`**
```
centerId, name, capacity
```

**`courses`**
```
centerId, teacherId, defaultRoomId
title, subject, description, gradeTag (free text)
schedulePattern: {
  daysOfWeek: [0..6],
  startTime: "HH:mm", endTime: "HH:mm",
  startDate, endDate
}
price                number (minor units)
maxStudents          number
status               enum: active | ended | cancelled
```

**`sessions`** — pre-generated from course pattern
```
courseId, teacherId (denormalized), roomId (default or overridden)
originalDate         Date
date                 Date (current effective date; equals originalDate unless postponed)
startTime, endTime
status               enum: scheduled | cancelled | postponed | completed
cancellationReason   string
postponedFromDate    Date (if postponed, stores the original)
editedAt
```
Indexes: `(courseId, date)`, `(teacherId, date)`, `(roomId, date)` — all used by the conflict detector.

**`enrollments`**
```
studentId, courseId, centerId
status               enum: active | unenrolled
enrolledAt, unenrolledAt
enrolledBy           userId (admin)
```
Unique partial index on `(studentId, courseId) where status=active`.

**`enrollmentRequests`**
```
studentId, courseId, centerId
status               enum: pending | approved | declined | cancelled | expired
submittedAt, respondedAt, respondedBy
declineReason
expiresAt            // submittedAt + 14 days
```
Unique partial index on `(studentId, courseId) where status=pending`.

### 2.4 Academics

**`attendanceRecords`**
```
sessionId, studentId, courseId (denorm)
status               enum: present | absent | excused
markedBy, markedAt, editedAt
locked               bool   // true when session is >7 days old
```
Unique `(sessionId, studentId)`.

**`grades`**
```
courseId, centerId (denorm)
type                 enum: homework | exam
name, maxScore, date
createdBy (teacherId)
scores: [{ studentId, score, updatedAt }]
```

**`materials`**
```
courseId, centerId (denorm)
title, type (notes|homework|exam)
cloudinaryPublicId, fileSize, originalFilename
uploadedBy (teacherId), uploadedAt
```

### 2.5 Money

**`payments`**
```
centerId, studentId, courseId
amount               signed integer (minor units). Negative = refund.
date
recordedBy (adminId)
receiptNumber        string, format: RCP-{centerShortId}-{YYYY}-{NNNNN}
note                 string (optional)
```

**`expenses`**
```
centerId, amount, category, date, note, recordedBy
```

### 2.6 Social

**`reviews`**
```
studentId, teacherId, centerId, courseId
rating               1..5
text                 string
createdAt, updatedAt
```
Unique `(studentId, teacherId)`. Editable by author only.

### 2.7 Platform

**`notifications`**
```
userId               recipient
type                 enum: (see Notification catalog §3.4)
title, body
data                 freeform object (ids to deep-link)
read                 bool
createdAt
```

**`passwordResetTokens`**
```
userId, tokenHash, expiresAt, usedAt
```

**`inviteTokens`** — used for shell account activation (student/teacher pre-create) and admin invite
```
email, tokenHash, purpose (student_activation | teacher_activation | admin_invite),
centerId (if center-scoped), expiresAt, usedAt
```

### 2.8 Index Summary (non-obvious ones)

- `sessions.teacherId + sessions.date` — conflict detection
- `sessions.roomId + sessions.date` — conflict detection
- `centers.location` — 2dsphere for geo discovery
- `courses.subject`, `teacherProfiles.subjects` — filter on discovery
- `notifications.userId + createdAt` — inbox queries
- Text index on `centers.name + description`, `courses.title + description`, `teacherProfiles.name + bio` — discovery search

---

## 3. Cross-Cutting Specs

### 3.1 Auth & Session

- `next-auth` Credentials provider, bcrypt password check.
- Session object carries: `userId`, `role`, `centerId` (for admins), `locale`.
- Middleware attaches `req.user` to every `/api/v1/*` handler.
- Password reset flow: `POST /auth/password/forgot` → email with token → `POST /auth/password/reset` with `token + newPassword`.
- Shell activation flow: invite email contains `inviteToken` → `POST /auth/invite/accept` with `token + password` → flips user to `active`.
- Email verification is **not required** for V1 login but is flagged on the user record for later.

### 3.2 Authorization Model

Centralized via two helpers:

- `requireRole(...allowedRoles)` — rejects 403 if `req.user.role` is not allowed.
- `requireCenterScope(resourceCenterId)` — for admin/teacher roles, rejects 403 if `req.user`'s center is not the resource's center.

Per the Authority Matrix, enforced at the handler/service boundary:

| Concern | Rule |
|---|---|
| Grades | `role=teacher` AND is assigned teacher of the course |
| Materials | `role=teacher` AND is assigned teacher of the course |
| Attendance (mark/edit) | `role=center_admin` AND course is in their center AND session is `scheduled` or within 7-day edit window |
| Session cancel/postpone | `role=teacher` AND is assigned teacher of the course |
| Course cancel | `role=center_admin` AND course is in their center |
| Enroll / unenroll | `role=center_admin` AND course is in their center AND student not blacklisted |
| Payment record | `role=center_admin` AND course is in their center |
| Review create | `role=student` AND has ≥1 `present` attendance with that teacher |
| Teacher profile edit | `role=teacher` AND is self |
| Admin invite/remove admins | `role=center_admin`, cannot remove last admin |

### 3.3 Session Pre-Generation

Triggered by: course creation, course end-date extension, course pattern change (future-only), teacher reassignment (no session regeneration — same schedule, only `teacherId` updated on non-completed sessions).

Algorithm:

1. Walk days from `startDate` to `endDate`.
2. On each day whose `dayOfWeek ∈ pattern.daysOfWeek`, create a `session` with that day's date, the pattern's start/end times, and the course's default room.
3. Skip dates that already have a session (idempotent regeneration).
4. When the pattern changes, delete only future sessions with `status=scheduled`. Preserve `completed`, `cancelled`, `postponed`.

Conflict detection runs **per session** at creation:
- Same teacher + overlapping time window on same date → 409 with the clashing session's id, course title, and time.
- Same room + overlapping time window on same date → same response shape.
- On postponement, conflicts checked against the new slot.

### 3.4 Notification Service (channel-pluggable)

Single entry point: `notify({ recipients, type, title, body, data })`.

Pipeline:
1. Fan-out — resolve recipients (e.g., `notify_course_students_and_parents(courseId)` expands to student IDs + their linked parent IDs).
2. Persist one `notifications` row per recipient (this is the **in-app channel**).
3. Dispatch to other channels declared for that type (V1: only `email` for a few critical types; FCM added later).

**Notification catalog (locked):**

| Type | Recipients | V1 channels |
|---|---|---|
| `absence_marked` | student + linked parent | in-app |
| `attendance_corrected` | student + linked parent | in-app |
| `session_cancelled` | enrolled students + parents + all center admins | in-app |
| `session_postponed` | enrolled students + parents + all center admins | in-app |
| `course_cancelled` | all enrolled students + parents + all center admins | in-app |
| `grade_entered` | student + linked parent | in-app |
| `material_uploaded` | enrolled students + linked parents | in-app |
| `payment_recorded` | linked parent (fallback student) | in-app |
| `enrollment_request_submitted` | all center admins | in-app |
| `enrollment_request_approved` | student | in-app |
| `enrollment_request_declined` | student | in-app |
| `student_added_to_roster` | student | in-app |
| `teacher_invited` | teacher | in-app + email |
| `parent_link_requested` | the other party | in-app + email |
| `admin_broadcast` | targeted parents | in-app |
| `password_reset_requested` | user | email only |
| `shell_activation_invite` | user | email only |

**Parent fallback rule** enforced at fan-out: when "parent" is listed but the student has no active link, the student receives it instead.

### 3.5 File Handling

- Profile photos: signed upload directly to Cloudinary, server stores the returned `publicId`.
- PDF materials: server-mediated upload with validation (mime = `application/pdf`, max size 20 MB). Server stores `publicId` + metadata.
- Download: `GET /materials/:id/download` → enrollment check → server generates **time-bound signed URL** (1h) → returns JSON `{ url }` (no redirect, keeps control).
- Unenrollment revokes access by failing the enrollment check on the next download request. Existing signed URLs expire on their own within 1h.

### 3.6 Receipt Numbering

- Stored atomically: `findOneAndUpdate({ _id: centerId }, { $inc: { receiptSeq: 1 } })` → use returned counter.
- Format: `RCP-{centerShortId}-{YYYY}-{NNNNN}` — zero-padded to 5 digits, resets on admin's fiscal year rollover **not** in V1 (counter is monotonic forever in V1; revisit later).

### 3.7 Discovery Search

Three entry points, one index strategy:

- **Courses endpoint** queries `courses` with filters: subject, price range, days-of-week overlap, time-of-day bucket (morning 6–12 / afternoon 12–17 / evening 17–23), center distance via center's geo, minimum teacher rating via teacher denorm.
- **Centers endpoint** queries `centers` with `hasActiveCourses=true` filter implemented as aggregation.
- **Teachers endpoint** queries `teacherProfiles` with subject filter (matches `teacherProfiles.subjects`, not `courses.subject`).
- Remaining seats = `course.maxStudents − count(enrollments where active)`, computed inline, never stored.
- Text search uses Mongo `$text` across indexed name/description fields.

### 3.8 Data Retention on Account Delete

`DELETE /me` is soft delete:
- `users.status = deleted`, `users.email = deleted+<userId>@edu.local`, `users.phone = null`, `users.name = "Deleted user"`.
- `payments`, `attendanceRecords`, `grades.scores`, `reviews` **retained** with userId intact (for center's books).
- `reviews.text` blanked; only rating and createdAt retained.
- `parentStudentLinks` set to `revoked`.
- Future logins blocked.

### 3.9 Error Envelope

```
200/201  { "data": ... }
400      { "error": { "code": "validation_error", "message": "...", "fields": {...} } }
401      { "error": { "code": "unauthenticated", "message": "..." } }
403      { "error": { "code": "forbidden", "message": "..." } }
404      { "error": { "code": "not_found", "message": "..." } }
409      { "error": { "code": "conflict", "message": "...", "details": {...} } }
410      { "error": { "code": "expired", "message": "..." } }
422      { "error": { "code": "business_rule", "message": "..." } }
500      { "error": { "code": "internal", "message": "..." } }
```

---

## 4. REST API — Resource Map

All under `/api/v1`. Flat tree. Role required in brackets. `[*]` = any authenticated user. `[anon]` = public.

### 4.1 Auth

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /auth/register/student | anon | Self-register |
| POST | /auth/register/parent | anon | Self-register |
| POST | /auth/register/center | anon | Self-serve center creation, caller becomes first admin |
| POST | /auth/login | anon | Session login |
| POST | /auth/logout | * | End session |
| GET | /auth/session | * | Current user + role + centerId |
| POST | /auth/password/forgot | anon | Send reset email |
| POST | /auth/password/reset | anon | Consume token, set new password |
| POST | /auth/invite/accept | anon | Activate shell account via invite token |

### 4.2 Profile

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /me | * | Load session user full profile |
| PATCH | /me | * | Update name, locale |
| DELETE | /me | * | Soft delete + anonymize |
| GET | /me/family-code | student | View rotatable code |
| POST | /me/family-code/rotate | student | Regenerate code |
| PATCH | /me/teacher-profile | teacher | Edit bio, subjects, quals, experience |
| POST | /me/teacher-profile/photo | teacher | Upload/replace photo |
| GET | /me/children | parent | List linked students for child-switcher |

### 4.3 Parent ↔ Student links

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /parent-links | parent, student | Initiate link via family code OR lookup (email/phone) |
| GET | /parent-links | parent, student | List my links + statuses |
| POST | /parent-links/:id/approve | parent, student | Approve pending link (mutual approval path) |
| POST | /parent-links/:id/reject | parent, student | Reject pending link |
| DELETE | /parent-links/:id | parent, student | Unlink (revoke) |

### 4.4 Centers

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /centers | anon, student | Discovery list (filters) |
| GET | /centers/:id | anon, student | Public center detail |
| GET | /centers/me | center_admin | My center (session-scoped) |
| PATCH | /centers/me | center_admin | Edit my center |
| POST | /centers/me/admins/invite | center_admin | Invite co-admin by email |
| DELETE | /centers/me/admins/:userId | center_admin | Remove co-admin (not last) |

### 4.5 Center roster — students

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /roster/students/lookup | center_admin | Exact email/phone lookup |
| POST | /roster/students | center_admin | Add existing student to roster |
| POST | /roster/students/invite | center_admin | Pre-create shell + send invite |
| GET | /roster/students | center_admin | List roster (filters: blacklisted, course) |
| GET | /roster/students/:studentId | center_admin | Student detail in this center |
| PATCH | /roster/students/:studentId | center_admin | Edit operational parent contact; blacklist toggle |
| DELETE | /roster/students/:studentId | center_admin | Remove from center |

### 4.6 Center roster — teachers

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /roster/teachers/lookup | center_admin | Exact email lookup |
| POST | /roster/teachers/invite | center_admin | Invite existing or pre-create shell |
| GET | /roster/teachers | center_admin | List affiliated teachers (filters: status) |
| DELETE | /roster/teachers/:teacherId | center_admin | Remove affiliation (blocked if active courses) |

### 4.7 Affiliations (teacher-side)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /me/affiliations | teacher | List my centers + statuses |
| POST | /affiliations/:id/accept | teacher | Accept pending invite |
| POST | /affiliations/:id/decline | teacher | Decline pending invite |
| DELETE | /affiliations/:id | teacher | Leave center (blocked if active courses) |

### 4.8 Rooms

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /rooms | center_admin | List my center's rooms |
| POST | /rooms | center_admin | Create |
| PATCH | /rooms/:id | center_admin | Edit |
| DELETE | /rooms/:id | center_admin | Delete (blocked if referenced by future sessions) |

### 4.9 Courses

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /courses | any | Discovery + admin listing (filters decide scope) |
| POST | /courses | center_admin | Create course, triggers session pre-generation |
| GET | /courses/:id | any | Detail (public fields; roster fields gated) |
| PATCH | /courses/:id | center_admin | Edit; pattern change regenerates future sessions |
| POST | /courses/:id/cancel | center_admin | Course-level cancel, cascades to future sessions |
| POST | /courses/:id/reassign-teacher | center_admin | Reassign to another active-affiliated teacher |

### 4.10 Sessions

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /sessions | any | Filters: courseId, teacherId, studentId (me), from/to |
| GET | /sessions/:id | any | Detail + attendance summary |
| POST | /sessions/:id/cancel | teacher | Cancel with reason |
| POST | /sessions/:id/postpone | teacher | Postpone; re-runs conflict detection |

### 4.11 Enrollments

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /enrollments | center_admin, student, parent | Filters: studentId, courseId, status |
| POST | /enrollments | center_admin | Direct enroll (blocked if blacklisted) |
| DELETE | /enrollments/:id | center_admin | Unenroll |

### 4.12 Enrollment Requests

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /enrollment-requests | student | Submit request |
| GET | /enrollment-requests | center_admin, student | Filters: studentId, courseId, status |
| DELETE | /enrollment-requests/:id | student | Cancel own pending request |
| POST | /enrollment-requests/:id/approve | center_admin | Capacity checked here |
| POST | /enrollment-requests/:id/decline | center_admin | Optional reason |

### 4.13 Attendance

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /sessions/:id/attendance | center_admin, teacher, student, parent | Role-scoped view |
| PUT | /sessions/:id/attendance | center_admin | Bulk mark/overwrite for the session |
| PATCH | /attendance/:id | center_admin | Edit single record (within 7-day window) |

### 4.14 Grades

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /grades | teacher | Create grade entry |
| GET | /grades | teacher, student, parent, center_admin | Filters: courseId, studentId |
| GET | /grades/:id | same | Detail with scores scoped to caller |
| PATCH | /grades/:id | teacher | Edit name/max/date |
| DELETE | /grades/:id | teacher | Delete |
| PUT | /grades/:id/scores | teacher | Bulk upsert student scores |

### 4.15 Materials

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /materials | teacher | Upload PDF, course-scoped |
| GET | /materials | teacher, student, parent | Filters: courseId |
| GET | /materials/:id/download | teacher, student, parent | Returns 1h signed URL; enrollment required |
| PATCH | /materials/:id | teacher | Replace file or metadata |
| DELETE | /materials/:id | teacher | Delete |

### 4.16 Payments

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /payments | center_admin | Record payment (positive) or refund (negative) |
| GET | /payments | center_admin, student, parent | Filters: studentId, courseId, from/to |
| GET | /payments/:id | same | Detail |
| GET | /payments/:id/receipt | center_admin, student, parent | Printable receipt JSON |

### 4.17 Expenses

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /expenses | center_admin | Record |
| GET | /expenses | center_admin | Filters: category, from/to |
| PATCH | /expenses/:id | center_admin | Edit |
| DELETE | /expenses/:id | center_admin | Delete |

### 4.18 Reports / Dashboards

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /reports/revenue | center_admin | Sum of payments, filterable |
| GET | /reports/expenses | center_admin | Sum of expenses |
| GET | /reports/net-profit | center_admin | Revenue − expenses, filterable |
| GET | /dashboards/admin | center_admin | Totals + today's sessions + attendance rate |
| GET | /dashboards/teacher | teacher | Active students + today's sessions + avg attendance + pending grades |

### 4.19 Reviews

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /reviews | student | One per teacher; requires ≥1 `present` attendance |
| GET | /reviews | any | Filters: teacherId, centerId; pagination 20 |
| PATCH | /reviews/:id | student | Author-only edit |

### 4.20 Notifications

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /notifications | * | Inbox; filter by type, read/unread |
| POST | /notifications/:id/read | * | Mark one |
| POST | /notifications/read-all | * | Mark all |
| POST | /notifications/broadcast | center_admin | Custom broadcast: course-scoped or center-scoped |

### 4.21 Discovery

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /search/courses | anon, student | Filters: subject, price, distance, days, time-bucket, rating |
| GET | /search/centers | anon, student | Filters: subject, distance; excludes centers with no active courses |
| GET | /search/teachers | anon, student | Filters: subject, rating |
| GET | /subjects | anon | Curated subject list |

---

## 5. Epics → Stories → Tasks

Each epic is a milestone. Stories are user-facing outcomes. Tasks are the backend-only work.

### Epic 1 — Foundation

> Goal: Every subsequent epic has a working skeleton.

- **Story 1.1** — As a developer, I can run the app locally with a Mongo connection and send a signed-in request.
  - Task: Next.js + next-auth Credentials provider wired.
  - Task: Mongoose connection with reconnect logic.
  - Task: Zod validation pipeline; typed error classes → HTTP mapping.
  - Task: `requireRole` + `requireCenterScope` guards.
  - Task: Response envelope helpers.
  - Task: Seed script for curated subjects + one fixture of each role for dev.

### Epic 2 — Identity & Accounts

- **Story 2.1** — Student/parent self-registers.
  - Tasks: register endpoints, password hashing, email/phone uniqueness, role-specific profile creation.
- **Story 2.2** — Center self-registers; first user becomes admin.
  - Tasks: `POST /auth/register/center` creates `centers` + `centerAdminProfiles` in a transaction, generates `shortId`.
- **Story 2.3** — Password reset via email.
  - Tasks: token generation + hashing, email send via Mailgun/SendGrid wrapper, reset endpoint, token expiry.
- **Story 2.4** — Shell account activation.
  - Tasks: invite token model, `POST /auth/invite/accept`, collision handling when a user self-registers against a pending shell.
- **Story 2.5** — Soft-delete account with anonymization.
  - Tasks: `DELETE /me` executes the retention policy from §3.8; login blocked afterwards.

### Epic 3 — Parent ↔ Student Linking

- **Story 3.1** — Student views a family code and can rotate it.
- **Story 3.2** — Parent enters a family code and is linked instantly.
- **Story 3.3** — Either party initiates mutual-approval link by email/phone lookup.
- **Story 3.4** — Either party unlinks; access revokes on next request.
  - Tasks: enforce one active link per student; link state machine; notifications for `parent_link_requested`.

### Epic 4 — Center Setup

- **Story 4.1** — Admin invites co-admins.
- **Story 4.2** — Admin cannot remove the last admin.
- **Story 4.3** — Admin manages rooms.
- **Story 4.4** — Admin updates center profile and contact info.

### Epic 5 — Roster Management

- **Story 5.1** — Admin adds existing student by exact email/phone.
- **Story 5.2** — Admin pre-creates a shell student and sends activation invite.
- **Story 5.3** — Student is auto-joined to center and notified; can leave/report.
- **Story 5.4** — Admin records operational parent contact on a student's center record.
- **Story 5.5** — Admin blacklists / unblacklists a student with reason.
- **Story 5.6** — Admin invites teachers (lookup or shell).
- **Story 5.7** — Teacher accepts/declines/leaves center; remove blocked while active courses exist.
  - Tasks across 5.*: uniqueness checks, invite expiry (30 days), state machine on affiliation, notifications catalog hookup.

### Epic 6 — Courses & Sessions

- **Story 6.1** — Admin creates a course; sessions pre-generate from the pattern.
- **Story 6.2** — Admin reassigns teacher; future sessions' `teacherId` updates; conflict detection re-runs.
- **Story 6.3** — Admin extends course end date; new sessions generated.
- **Story 6.4** — Admin changes pattern; only future scheduled sessions regenerate.
- **Story 6.5** — Admin cancels course; cascade cancel all future non-completed sessions; single fan-out notification.
  - Tasks: session generator service, conflict detector service with detailed 409 payload, course-cancel cascade, idempotent generation.

### Epic 7 — Enrollment

- **Story 7.1** — Admin enrolls a student directly (blacklist-checked).
- **Story 7.2** — Student submits enrollment request; admins notified.
- **Story 7.3** — Admin approves (capacity checked) or declines (optional reason).
- **Story 7.4** — Request auto-expires after 14 days.
- **Story 7.5** — Student cancels their pending request.
- **Story 7.6** — Admin unenrolls a student.
  - Tasks: request state machine, capacity calc, scheduled expiry job (V1 = lazy expiry on read, no cron), notifications.

### Epic 8 — Attendance

- **Story 8.1** — Admin marks attendance for a session in bulk.
- **Story 8.2** — Admin edits within 7 days; locked after.
- **Story 8.3** — Absent → auto notification; correction → correction notification.
- **Story 8.4** — Teacher views attendance, cannot edit.

### Epic 9 — Session Cancel / Postpone

- **Story 9.1** — Teacher cancels a session with required reason.
- **Story 9.2** — Teacher postpones a session; conflict re-detected.
- **Story 9.3** — Notifications fan out to students + parents + all admins including reason and new date/time.
  - Tasks: session state machine, conflict detection on postpone, notification composer with reason field.

### Epic 10 — Grades & Materials

- **Story 10.1** — Teacher creates grade entry, enters/edits per-student scores.
- **Story 10.2** — Teacher uploads/replaces/deletes PDF materials.
- **Story 10.3** — Student/parent views grades and materials for enrolled courses only.
- **Story 10.4** — Signed download URL returned; unenrollment blocks future downloads.

### Epic 11 — Payments, Refunds & Reports

- **Story 11.1** — Admin records a cash payment; receipt number auto-generates.
- **Story 11.2** — Admin records a refund as negative payment.
- **Story 11.3** — Linked parent (fallback student) receives receipt notification.
- **Story 11.4** — Admin logs expenses.
- **Story 11.5** — Admin views revenue, expenses, net profit, and dashboard.
  - Tasks: atomic receipt counter, report aggregation pipelines, dashboard endpoint composer.

### Epic 12 — Reviews

- **Story 12.1** — Student leaves one review per teacher; only after a `present` attendance.
- **Story 12.2** — Student edits their own review.
- **Story 12.3** — Teacher's public profile shows ratingAvg + count, reviews paginated 20.
  - Tasks: eligibility check query, denormalized rating recompute on review write, center filter on listing.

### Epic 13 — Discovery

- **Story 13.1** — Student searches courses by subject, price, time bucket, distance, rating.
- **Story 13.2** — Student discovers centers; only centers with active courses returned.
- **Story 13.3** — Student discovers teachers by declared subjects.
- **Story 13.4** — Seats-remaining computed live, exposed on course detail.
  - Tasks: compound indexes, aggregation pipeline for centers-with-active-courses, time-bucket → time-range mapping.

### Epic 14 — Notifications

- **Story 14.1** — Every trigger in the catalog writes an in-app row for each recipient with correct fan-out.
- **Story 14.2** — Parent fallback rule enforced.
- **Story 14.3** — Inbox endpoints + mark-as-read.
- **Story 14.4** — Admin broadcast: course-scoped or center-scoped.
  - Tasks: `notify()` service with channel registry (`inapp` registered, `email` for 2 types, `fcm` stub for later), fan-out helpers per recipient group.

### Epic 15 — Hardening (pre-launch)

- **Story 15.1** — Rate-limit auth and search endpoints.
- **Story 15.2** — Request logging + error reporting.
- **Story 15.3** — Lazy-expiry sweeps for `enrollmentRequests`, `inviteTokens`, `passwordResetTokens` on relevant reads.
- **Story 15.4** — Seed + backup/restore docs.

### Epic 16 — FCM integration (final phase)

- **Story 16.1** — Users register FCM device tokens.
- **Story 16.2** — `fcm` channel registered in `notify()`; enabled types migrate to also send push.
- **Story 16.3** — Token invalidation handling.

---

## 6. Build Sequence

Suggested order — each phase leaves a testable slice.

**Phase 1 — Foundations (Epics 1, 2, 3)**
Identity + linking. App is usable as "four roles can exist and relate to each other."

**Phase 2 — Center scaffolding (Epics 4, 5)**
Centers exist, roster and teacher affiliations work. No teaching yet.

**Phase 3 — Teaching (Epics 6, 7, 8, 9)**
Courses, sessions, enrollment, attendance, cancel/postpone. Biggest phase.

**Phase 4 — Academic content (Epic 10)**
Grades and materials; Cloudinary integration.

**Phase 5 — Money (Epic 11)**
Payments, refunds, expenses, reports, dashboards.

**Phase 6 — Public surface (Epics 12, 13)**
Reviews and discovery; the outward-facing features.

**Phase 7 — Notifications pass (Epic 14)**
Audit every notification trigger, wire them through the service. Done in parallel-ish, but a final pass ensures the catalog is complete.

**Phase 8 — Hardening (Epic 15)**

**Phase 9 — FCM (Epic 16)**

---

## 7. Business Rules Enforced at API Layer (cheat-sheet)

For review and test checklists.

- Student cannot self-join a center's roster. Centers add them.
- Partial search over the user base is **never** exposed. Roster lookups are **exact** email or phone match.
- A student can only have one active parent link at a time.
- A student cannot be actively enrolled in the same course twice.
- Enrollment request → one pending per `(student, course)`.
- Capacity check happens at approval time, not submission.
- Blacklisted students cannot submit a request; button hidden on client, server also rejects.
- Teacher cannot be removed from a center while they have active courses.
- Teacher cannot leave a center while they have active courses.
- Admin cannot remove the last admin of a center.
- Attendance editable up to 7 days post-session.
- Only the assigned teacher of a session can cancel/postpone it.
- Course cancel cascades to future non-completed sessions only.
- Session conflicts: same teacher OR same room, overlapping time on the same date.
- Grade/material operations restricted to the assigned teacher of the course.
- Material downloads gated by active enrollment.
- Review requires ≥1 `present` attendance with the target teacher, one review per `(student, teacher)`, editable by author only.
- Receipts are sequential per center, never reused.
- Refunds are negative payments, not a separate collection.
- Notifications to "parent" fall back to student when no link exists.

---

## 8. What's Deliberately Out of Scope for V1

Carried over from the spec, repeated here so the plan stays honest:

- Young students without email/phone.
- Multi-parent linking, co-parents, observers.
- Subscription/arrears/billing-cycle tracking.
- Waitlists on full courses.
- Structured Egyptian grade taxonomy and streams.
- In-app messaging or chat.
- Review moderation by platform.
- Admin emergency session cancellation.
- Driving-distance discovery.
- iCal RRULE patterns.
- Native mobile apps.
- Unified admin-facing audit log UI.

---

*End of plan v1. Ready for coding phase when you are.*
