# EduPlatform — Per-Epic Implementation Prompts

> Companion to `EduPlatform_Spec_v2.md` and `EduPlatform_Backend_Plan_v1.md`.
> Paste one prompt at a time into your AI coder (Claude Code, Cursor, etc.).
> Each prompt leaves the app in a working, testable state before moving on.
>
> **Global context to paste once at the start of each session:**
>
> > You are implementing the backend of **EduPlatform**, a Next.js + MongoDB web app for tutoring centers. Tech stack is locked: **Next.js App Router**, **MongoDB via Mongoose**, **next-auth Credentials provider (session cookie)**, **Zod validation**, **Cloudinary** for files, **Mailgun/SendGrid** for email, no FCM until the final epic. All endpoints live under `/app/api/v1/*`. Thin handlers, fat services in `/lib/services`. Always enforce role + center scope at handler entry. Response envelope is `{ data }` on success, `{ error: { code, message, ... } }` on failure. Money is stored as signed integer minor units. Two source documents are authoritative: `EduPlatform_Spec_v2.md` (product behavior) and `EduPlatform_Backend_Plan_v1.md` (backend design). When they conflict, the backend plan wins.

---

## Epic 1 — Foundation

**Goal:** Every subsequent epic has a working skeleton to plug into.

**Depends on:** nothing.

**Read first:** Backend Plan §1, §3.1, §3.2, §3.9.

**Scope (in):**
- Next.js project scaffold (App Router, TypeScript).
- Mongoose connection util with global cache for hot-reload safety.
- next-auth Credentials provider; session object carries `{ userId, role, centerId?, locale }`.
- `requireRole(...roles)` + `requireCenterScope(resource)` guards.
- Zod validation helper that maps errors to 400 with the `fields` map.
- Typed error classes (`ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`) → HTTP mapping middleware.
- Response envelope helpers `ok(data)`, `fail(error)`.
- Seed script: curated subject list (hardcoded ~20 subjects: Math, Physics, Chemistry, Biology, Arabic, English, French, History, Geography, Philosophy, Economics, Accounting, Statistics, Computer Science, …), plus one dev-mode fixture of each role.

**Out of scope:**
- Any business endpoint.

**Deliverables:**

```
/lib/db/connect.ts            Mongoose singleton
/lib/auth/options.ts          next-auth config
/lib/auth/session.ts          getSession helper for route handlers
/lib/authz/requireRole.ts
/lib/authz/requireCenterScope.ts
/lib/errors/classes.ts        typed errors
/lib/errors/http.ts            error → Response mapper
/lib/validation/zod.ts         parseOrThrow helper
/lib/http/envelope.ts          ok(), fail()
/scripts/seed.ts               curated subjects + fixtures
/app/api/v1/_ping/route.ts     GET → { data: { ok: true, now } }
```

**Acceptance criteria:**
- [ ] `pnpm dev` starts.
- [ ] `GET /api/v1/_ping` returns `{ data: { ok: true, now: ISO } }`.
- [ ] Hitting a guarded test route while unauthenticated returns the 401 envelope.
- [ ] Zod errors return the 400 envelope with a `fields` object.
- [ ] Seed script creates subject list and 4 dev users (one per role) with known passwords.

**Gotchas:**
- Mongoose connection must be cached across hot reloads (`global._mongoose`).
- `next-auth` session callback must attach `role` and `centerId` — plumb them through the jwt + session callbacks.

---

## Epic 2 — Identity & Accounts

**Goal:** All four roles can self-register or be activated, log in, reset their password, and soft-delete themselves.

**Depends on:** Epic 1.

**Read first:** Spec "Authentication & Roles", "Accounts, Onboarding & Linking". Backend Plan §2.1, §3.1, §3.8.

**Scope (in):**
- Models: `users`, `studentProfiles`, `parentProfiles`, `teacherProfiles`, `centerAdminProfiles`, `centers`, `passwordResetTokens`, `inviteTokens`.
- Password hashing (bcrypt, cost 10).
- Shell account model: `users.status=shell`, `passwordHash=null`.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /auth/register/student | anon | Self-register |
| POST | /auth/register/parent | anon | Self-register |
| POST | /auth/register/center | anon | Creates `centers` + first `centerAdminProfile` in a Mongo transaction; generates 5–6 char `shortId` |
| POST | /auth/login | anon | next-auth signin wrapper |
| POST | /auth/logout | * | next-auth signout wrapper |
| GET | /auth/session | * | Returns `{ userId, role, centerId?, name, locale }` |
| POST | /auth/password/forgot | anon | Generates token, hashes it, emails link (dev inbox OK) |
| POST | /auth/password/reset | anon | Consumes token, sets new password, marks `usedAt` |
| POST | /auth/invite/accept | anon | Activates shell via token → flips status to `active` + sets password |
| GET | /me | * | Full profile |
| PATCH | /me | * | Update `name`, `locale` |
| DELETE | /me | * | Soft delete + anonymize per §3.8 |

**Business rules:**
- Email is lowercased; `users.email` unique.
- `phone` unique sparse (student-only can register with phone alone).
- If a shell with the same email exists when someone self-registers, **claim the shell**: overwrite `passwordHash`, flip status, keep original `_id` so roster/enrollment links survive.
- Password min 8 chars, at least one letter + one digit.
- Invite token: hash stored, 7-day expiry for shell activation, 1-hour for password reset.
- `DELETE /me` applies the exact retention policy from §3.8 — anonymize PII fields, keep financial/academic rows, revoke parent links, block future logins.

**Notifications emitted:**
- `password_reset_requested` → email.
- `shell_activation_invite` → email (when invite sent — triggered in later epics).

**Acceptance criteria:**
- [ ] Student, parent, and center can self-register end-to-end.
- [ ] Center registration creates both the center record and the first admin profile in one transaction.
- [ ] Password reset works with a real token round-trip.
- [ ] Invite acceptance flips shell → active and claims any pre-existing state.
- [ ] `DELETE /me` leaves financial rows intact but blocks login on the same credentials.
- [ ] Session endpoint returns `centerId` for admins, omits it for students/parents/teachers.

**Gotchas:**
- Transactions need a Mongo replica set. For local dev, document that the reader needs `mongod --replSet` or Atlas.
- Don't send the raw token to the DB — hash it.

---

## Epic 3 — Parent ↔ Student Linking

**Goal:** A parent can be linked to one student (at a time), via family code or mutual approval, and either side can unlink.

**Depends on:** Epics 1, 2.

**Read first:** Spec "Parent ↔ student linking". Backend Plan §2.1, §2.2, §3.4.

**Scope (in):**
- Model: `parentStudentLinks`.
- Family code generation on `studentProfiles` (10–12 chars, alphanumeric, ambiguous chars stripped: no `0`, `O`, `1`, `I`).

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /me/family-code | student | Return current code |
| POST | /me/family-code/rotate | student | Rotate; all prior codes invalidated |
| POST | /parent-links | parent or student | Initiate: body is either `{ code }` OR `{ email }` OR `{ phone }` |
| GET | /parent-links | parent or student | List my links + statuses |
| POST | /parent-links/:id/approve | the counter-party | Approve pending link |
| POST | /parent-links/:id/reject | the counter-party | Reject |
| DELETE | /parent-links/:id | either party on the link | Revoke |
| GET | /me/children | parent | List linked students for switcher |

**Business rules:**
- Family-code path → link is created with `status=approved` immediately.
- Mutual-approval path → `status=pending`, counter-party receives notification, must approve.
- A student may have **at most one approved link** at any time. Second attempt → 409.
- Either party may unilaterally unlink at any time; status flips to `revoked`, `revokedBy` captured.
- Past rows retained forever (audit trail).

**Notifications:**
- `parent_link_requested` → in-app + email to counter-party (mutual-approval path only).

**Acceptance criteria:**
- [ ] Rotate-code invalidates old code (old code returns 404 on link attempt).
- [ ] Linking via code is instant and atomic.
- [ ] Linking via email/phone triggers a pending row.
- [ ] Second link attempt on a student with active link → 409.
- [ ] Unlink from either side works; parent's `GET /me/children` reflects the change immediately.

---

## Epic 4 — Center Setup

**Goal:** An admin can manage co-admins, rooms, and the center profile.

**Depends on:** Epic 2.

**Read first:** Spec "Center Portal". Backend Plan §2.2, §3.2.

**Scope (in):**
- Co-admin invite + acceptance.
- Last-admin protection.
- Rooms CRUD.
- Center profile edit.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /centers/me | center_admin | My center |
| PATCH | /centers/me | center_admin | Edit profile (name, description, subjects, address, geo, phone, whatsapp, email, logo) |
| POST | /centers/me/admins/invite | center_admin | Invite co-admin by email (new or existing user) |
| GET | /centers/me/admins | center_admin | List co-admins |
| DELETE | /centers/me/admins/:userId | center_admin | Remove co-admin (blocked if removing last admin) |
| GET | /rooms | center_admin | List |
| POST | /rooms | center_admin | Create |
| PATCH | /rooms/:id | center_admin | Edit |
| DELETE | /rooms/:id | center_admin | Delete (blocked if future sessions reference it) |

**Business rules:**
- Invite-existing-user: sets `centerAdminProfile.centerId` to this center (after they accept via invite token).
- Invite-new-user: creates a shell with `role=center_admin`, token emailed.
- Removing the last remaining active admin → 422 "cannot remove last admin".
- Room delete blocked when any future `session.roomId = this room AND session.status ∈ {scheduled, postponed}`.

**Notifications:**
- Admin invite uses `shell_activation_invite` (email).

**Acceptance criteria:**
- [ ] Last-admin rule bulletproof (try it with exactly 1 admin → 422).
- [ ] Room referenced by a future session cannot be deleted.
- [ ] Center profile accepts GeoJSON Point and index is created.

---

## Epic 5 — Roster Management

**Goal:** A center can roster students and teachers, pre-create shells, manage blacklists, and handle the teacher lifecycle at the center.

**Depends on:** Epics 2, 4.

**Read first:** Spec "Student onboarding — two paths", "Teacher onboarding". Backend Plan §2.2, §3.2.

**Scope (in):**
- `centerStudentRosters` CRUD ops.
- `centerTeacherAffiliations` state machine.
- Exact-match lookups (never partial).

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /roster/students/lookup | center_admin | `{ email }` or `{ phone }` exact-match → returns student summary or 404 |
| POST | /roster/students | center_admin | Add existing student to roster |
| POST | /roster/students/invite | center_admin | Pre-create shell + send activation email |
| GET | /roster/students | center_admin | List (filters: blacklisted, courseId, q by name) |
| GET | /roster/students/:studentId | center_admin | Detail in my center |
| PATCH | /roster/students/:studentId | center_admin | Edit `operationalParent*`, `blacklisted`, `blacklistReason` |
| DELETE | /roster/students/:studentId | center_admin | Remove from center (sets `leftAt`) |
| POST | /roster/teachers/lookup | center_admin | Exact email lookup |
| POST | /roster/teachers/invite | center_admin | Invite existing OR pre-create shell |
| GET | /roster/teachers | center_admin | List affiliations (filter: status) |
| DELETE | /roster/teachers/:teacherId | center_admin | Blocked if active courses exist in my center |
| GET | /me/affiliations | teacher | My centers + statuses |
| POST | /affiliations/:id/accept | teacher | Accept pending |
| POST | /affiliations/:id/decline | teacher | Decline pending |
| DELETE | /affiliations/:id | teacher | Leave (blocked if active courses in that center) |

**Business rules:**
- `POST /roster/students/lookup` returns ONLY a minimal summary `{ id, name, email, phone (masked) }`; never exposes other centers the student belongs to.
- `POST /roster/students/invite`: if an active user with that email already exists → 422 "use lookup instead". If a pending shell exists → 409.
- Affiliation invite token expires after 30 days; after expiry status becomes `expired` (lazy flip on next read).
- Blacklist toggle is a single field update + timestamp + `blacklistedBy` userId.
- Removing a teacher while they have a course where `status=active` → 422.
- Teacher leaving a center while they have a course where `status=active` → 422.

**Notifications:**
- `student_added_to_roster` → student (in-app).
- `teacher_invited` → teacher (in-app + email for new shells).

**Acceptance criteria:**
- [ ] Lookup returns 404 for non-existent emails, not a list.
- [ ] Partial-match search is impossible (no regex, no substring, no listing endpoint without exact filter).
- [ ] All happy paths + 4 negative paths (lookup not found, invite existing user, remove teacher with courses, leave with courses) covered.

---

## Epic 6 — Courses & Sessions

**Goal:** Courses can be created and edited, with sessions pre-generated and conflicts detected.

**Depends on:** Epics 4, 5.

**Read first:** Spec "Courses & Sessions". Backend Plan §2.3, §3.3.

**Scope (in):**
- `courses`, `sessions` models.
- **Session generator service** — idempotent, triggered on create/extend/pattern-change.
- **Conflict detector service** — same teacher OR same room OR overlapping time on same date.
- Teacher reassignment — updates non-completed `session.teacherId` without regenerating.
- Course cancel cascade.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /courses | * | Filters: centerId, teacherId, subject, status |
| POST | /courses | center_admin | Create + trigger session gen |
| GET | /courses/:id | * | Detail |
| PATCH | /courses/:id | center_admin | Edit; pattern change regenerates future-scheduled only |
| POST | /courses/:id/cancel | center_admin | Cascade cancel future non-completed sessions |
| POST | /courses/:id/reassign-teacher | center_admin | `{ teacherId }` must have `active` affiliation |
| GET | /sessions | * | Filters: courseId, teacherId, studentId=me, from, to |
| GET | /sessions/:id | * | Detail |

**Services:**

- `sessionGenerator.generate(course)` — walks dates, skips existing, returns inserted IDs.
- `sessionGenerator.regenerateFuture(course, newPattern)` — deletes future `status=scheduled`, re-runs generator. Preserves completed/cancelled/postponed.
- `conflictDetector.check({ teacherId, roomId, date, startTime, endTime, excludeSessionId? })` — returns array of conflicts with `{ id, courseTitle, time }`.

**Business rules:**
- Time overlap: `existing.startTime < new.endTime && existing.endTime > new.startTime` on the same date.
- Conflicts on creation → 409 with `details.conflicts: [...]`, no sessions inserted.
- Course can only be created with a teacher whose affiliation is `active`.
- Course cancel → one batch update on `sessions` (`status=cancelled`, store reason), single fan-out notification per enrolled student + linked parent + every center admin.
- Pattern change → delete then regenerate only future scheduled.
- Extending end date → idempotent generation fills the gap.

**Notifications:**
- `course_cancelled` (Epic 14 wires this; emit via notification service stub here).

**Acceptance criteria:**
- [ ] Course with `daysOfWeek=[1,3]` from Oct 1 to Nov 1 generates the correct number of sessions.
- [ ] Re-running generation is idempotent (no duplicates).
- [ ] Conflict on same room same time → 409 with conflict details.
- [ ] Conflict on same teacher same time → 409.
- [ ] Teacher reassignment does NOT delete any session; only updates `teacherId` on future non-completed.
- [ ] Course cancel leaves completed/cancelled/postponed untouched.

**Gotchas:**
- `startTime`/`endTime` stored as `"HH:mm"` strings for portability; compare as strings (lexicographic comparison is safe for this format).
- Dates stored with time zeroed at 00:00 UTC to avoid timezone drift.

---

## Epic 7 — Enrollment

**Goal:** Students can request enrollment; admins can direct-enroll, approve, decline, or unenroll. Blacklist is enforced. Capacity is checked at approval.

**Depends on:** Epics 5, 6.

**Read first:** Spec "Enrollment". Backend Plan §2.3.

**Scope (in):**
- `enrollments` and `enrollmentRequests` with state machines.
- Blacklist enforcement.
- Capacity calc (live, not stored).

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /enrollments | admin, student, parent | Filters |
| POST | /enrollments | center_admin | Direct enroll; 422 if blacklisted |
| DELETE | /enrollments/:id | center_admin | Unenroll (sets `status=unenrolled`) |
| POST | /enrollment-requests | student | Submit |
| GET | /enrollment-requests | admin, student | Filters |
| DELETE | /enrollment-requests/:id | student | Cancel own pending |
| POST | /enrollment-requests/:id/approve | center_admin | Capacity check happens here |
| POST | /enrollment-requests/:id/decline | center_admin | Optional reason |

**Business rules:**
- Unique `(studentId, courseId)` where `status=active` on `enrollments`.
- Unique `(studentId, courseId)` where `status=pending` on `enrollmentRequests`.
- On submit: reject if student is blacklisted at the course's center → 403 "blacklisted" (never disclose reason to student).
- On approve: if `count(enrollments, status=active, courseId) >= course.maxStudents` → 422 "course full"; admin prompted to decline with course-full reason.
- Pending request older than 14 days → treated as `expired` (lazy flip on read; actual status update on response). No cron in V1.
- Unenroll + re-enroll allowed; new row, old row kept.

**Notifications:**
- `enrollment_request_submitted` → all center admins.
- `enrollment_request_approved` / `enrollment_request_declined` → student.

**Acceptance criteria:**
- [ ] Blacklisted student gets 403 and no leak of reason text.
- [ ] Full-course approval returns 422 with clear code.
- [ ] Expiring a pending request on read flips it correctly and does not fire any notification (it's silent expiry).
- [ ] Unenroll then re-enroll creates 2 rows; student's current active enrollment is the latest.

---

## Epic 8 — Attendance

**Goal:** Admins mark attendance per session in bulk, can edit within 7 days, and teachers have read-only visibility.

**Depends on:** Epics 6, 7.

**Read first:** Spec "Attendance". Backend Plan §2.4, §3.2.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /sessions/:id/attendance | admin, teacher, student, parent | Role-scoped view |
| PUT | /sessions/:id/attendance | center_admin | Bulk mark: body `[{ studentId, status }]` |
| PATCH | /attendance/:id | center_admin | Edit single (within 7 days only) |

**Business rules:**
- Bulk mark is an UPSERT keyed by `(sessionId, studentId)`; only active enrollees at the session date are accepted, others → 422.
- Edit window: if `now - session.date > 7 days` → `locked=true` and further edits return 403.
- Absent-marked triggers `absence_marked` notification to student + linked parent.
- Flip absent → present triggers `attendance_corrected` notification (do not un-send the original).
- Teacher GET shows the full roster's status; teacher PUT/PATCH → 403.
- Student/parent GET returns only their own record for that session.

**Notifications:**
- `absence_marked`, `attendance_corrected`.

**Acceptance criteria:**
- [ ] Bulk mark replaces only the rows in the payload; other students' attendance untouched.
- [ ] Day-8 edit returns 403 with `locked=true` hint.
- [ ] Student sees only their own record on GET.

---

## Epic 9 — Session Cancel / Postpone

**Goal:** The assigned teacher can cancel or postpone an individual session; postponement re-runs conflict detection.

**Depends on:** Epic 6.

**Read first:** Spec "Cancellation & Postponement". Backend Plan §3.3.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /sessions/:id/cancel | teacher | `{ reason }` required |
| POST | /sessions/:id/postpone | teacher | `{ newDate, newStartTime, newEndTime, reason }` |

**Business rules:**
- Only the session's assigned teacher may cancel/postpone → 403 otherwise.
- Cancel: `status=cancelled`, reason stored, `editedAt` set.
- Postpone: update `date/startTime/endTime` to new values, store `postponedFromDate = oldDate`, `status=postponed`, re-run conflict detector with `excludeSessionId=self`. Conflict → 409.
- Reason is required on both; missing → 422.
- Admin cannot cancel a single session directly in V1 (use course cancel or teacher coordination). Document this in response if they try.

**Notifications:**
- `session_cancelled` / `session_postponed` → enrolled students + linked parents + all center admins. Payload includes reason and (for postpone) old + new datetime.

**Acceptance criteria:**
- [ ] Non-assigned teacher → 403.
- [ ] Missing reason → 422.
- [ ] Postpone into a slot conflicting with another session for the same teacher → 409 with conflict details; original session unchanged.
- [ ] Postpone into a valid slot updates the record and keeps `postponedFromDate`.

---

## Epic 10 — Grades & Materials

**Goal:** Teachers manage grades and PDF materials for their courses; students and linked parents see them; material downloads are gated by active enrollment.

**Depends on:** Epics 6, 7. Cloudinary account.

**Read first:** Spec "Grades & Materials". Backend Plan §2.4, §3.5.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /grades | teacher | Create entry (no scores yet) |
| GET | /grades | teacher, student, parent, admin | Filters: courseId, studentId |
| GET | /grades/:id | same | Detail; scores scoped per caller |
| PATCH | /grades/:id | teacher | Edit name/maxScore/date |
| DELETE | /grades/:id | teacher | Delete |
| PUT | /grades/:id/scores | teacher | Bulk upsert `[{ studentId, score }]` |
| POST | /materials | teacher | Multipart: PDF + title + type |
| GET | /materials | teacher, student, parent | Filters: courseId |
| GET | /materials/:id/download | teacher, student, parent | Returns `{ url }` (1h signed) |
| PATCH | /materials/:id | teacher | Replace file or metadata |
| DELETE | /materials/:id | teacher | Delete |

**Business rules:**
- Grade create/edit/delete + score upsert restricted to the assigned teacher of the course.
- Score in range `[0, maxScore]`; out-of-range → 422.
- Student/parent GET scopes scores — students see own, parents see linked children's, admins see all for the center.
- Material upload: server validates `application/pdf` mime + size ≤ 20 MB.
- Material download: server re-checks active enrollment on each call, generates Cloudinary signed URL with 1h expiry, returns JSON `{ url }`.
- Grade-entered notification fires on score upsert (once per student affected).
- Material-uploaded notification fires on create (once, to enrolled students + linked parents).

**Notifications:**
- `grade_entered`, `material_uploaded`.

**Acceptance criteria:**
- [ ] Non-PDF upload → 422.
- [ ] Non-assigned teacher → 403 on create/edit.
- [ ] Download URL expires (test with a short TTL override in dev).
- [ ] Unenrolled student → 403 on download.

---

## Epic 11 — Payments, Expenses & Reports

**Goal:** Admins record cash payments and refunds, log expenses, and view revenue / net-profit reports and dashboards.

**Depends on:** Epics 5, 6, 7.

**Read first:** Spec "Payments". Backend Plan §2.5, §3.6.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /payments | center_admin | Record positive payment or negative refund |
| GET | /payments | admin, student, parent | Filters: studentId, courseId, from, to |
| GET | /payments/:id | same | Detail |
| GET | /payments/:id/receipt | admin, student, parent | Printable receipt JSON |
| POST | /expenses | center_admin | Log expense |
| GET | /expenses | center_admin | Filters: category, from, to |
| PATCH | /expenses/:id | center_admin | Edit |
| DELETE | /expenses/:id | center_admin | Delete |
| GET | /reports/revenue | center_admin | Sum of payments (signed) in range |
| GET | /reports/expenses | center_admin | Sum of expenses |
| GET | /reports/net-profit | center_admin | Revenue − expenses |
| GET | /dashboards/admin | center_admin | Totals + today's sessions + attendance rate |
| GET | /dashboards/teacher | teacher | Active students + today + avg attendance + pending grade entries |

**Business rules:**
- `amount` is signed integer minor units. Positive = payment, negative = refund. Zero → 422.
- Receipt number atomically generated: `findOneAndUpdate({_id: centerId}, {$inc: {receiptSeq: 1}})`. Format: `RCP-{shortId}-{YYYY}-{NNNNN}` (5 digits zero-padded).
- Revenue in a range = sum of all `payments.amount` for the center in that date range (includes refunds as negatives).
- Receipt accessible by: the recording admin (or any admin of the center), the linked parent, or the student if no parent linked.
- Dashboards compute live; no caching in V1.

**Notifications:**
- `payment_recorded` → linked parent with receipt link; falls back to student if no parent.

**Acceptance criteria:**
- [ ] Two concurrent payment creates get two sequential, non-duplicated receipt numbers.
- [ ] Refund shows as negative in reports and on receipts.
- [ ] Dashboard endpoints return under 500ms for a seeded dataset of ~100 sessions.

**Gotchas:**
- Keep money as integer (piastres = 1/100 EGP). Never float.

---

## Epic 12 — Reviews

**Goal:** Students can review teachers they've attended, one review per teacher, editable by author.

**Depends on:** Epics 6, 7, 8.

**Read first:** Spec "Reviews & Ratings". Backend Plan §2.6, §3.2.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /reviews | student | Create |
| GET | /reviews | * | Filters: teacherId, centerId; paginated 20 |
| PATCH | /reviews/:id | student (author) | Edit |
| GET | /teachers/:teacherId | * | Public teacher profile with ratingAvg + ratingCount |

**Business rules:**
- Eligibility: at least one `attendanceRecords` row with `status=present` and `session.teacherId = target`, regardless of center.
- Unique `(studentId, teacherId)`. Duplicate → 409.
- Rating 1–5 integer; text optional but if present, max 2000 chars.
- On create/edit/delete, recompute `teacherProfiles.ratingAvg` and `ratingCount` as unweighted mean.
- Listing paginated 20 per page, optional `centerId` filter.
- Review is final once created; only the author can edit. No platform moderation in V1.

**Acceptance criteria:**
- [ ] Student with 0 present attendance → 403 on POST.
- [ ] Student with only excused/absent attendance → 403 on POST.
- [ ] Second review for same teacher → 409.
- [ ] ratingAvg updates after each write; 3 reviews of 4,5,5 → avg 4.67.

---

## Epic 13 — Discovery

**Goal:** Public search of courses, centers, and teachers with filters; seats remaining computed live.

**Depends on:** Epics 4, 5, 6, 7, 12.

**Read first:** Spec "Discovery". Backend Plan §3.7.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /search/courses | anon, student | Filters: subject, priceMin, priceMax, daysOfWeek, timeBucket (morning/afternoon/evening), distanceKm, nearLat, nearLng, minRating, q |
| GET | /search/centers | anon, student | Filters: subject, distanceKm, nearLat, nearLng, q; only centers with ≥1 active course |
| GET | /search/teachers | anon, student | Filters: subject, minRating, q |
| GET | /subjects | anon | Curated seed list |

**Business rules:**
- Time bucket → time range: morning `06:00–12:00`, afternoon `12:00–17:00`, evening `17:00–23:00`. Match is "course's startTime falls within bucket."
- Distance: MongoDB `$geoNear` on `centers.location`. Courses inherit their center's distance.
- Rating filter on courses joins via teacher's denormalized `ratingAvg`.
- Centers-with-active-courses: aggregation `$lookup` + `$match` on `courses.status=active`.
- Remaining seats = `course.maxStudents − count(enrollments where status=active, courseId=this)`, computed per result row.
- Text search (`q`) uses Mongo `$text` across indexed name/description fields.
- Pagination: `page`, `limit` (default 20, max 100).

**Acceptance criteria:**
- [ ] Centers with 0 active courses are excluded from `/search/centers`.
- [ ] Distance filter returns only centers within the given km radius.
- [ ] Course detail response includes `remainingSeats` field.
- [ ] `/search/teachers` filter matches `teacherProfiles.subjects`, not `courses.subject`.

---

## Epic 14 — Notifications

**Goal:** Every notification trigger across the app flows through one service, writes to the in-app inbox, and plugs into email + (later) FCM.

**Depends on:** All prior epics (wire triggers from each).

**Read first:** Spec "Notifications". Backend Plan §3.4.

**Scope (in):**
- `notifications` model + inbox endpoints.
- `notify({ recipients, type, title, body, data })` service with a channel registry.
- Channel adapters: `inapp` (always), `email` (used by `teacher_invited`, `parent_link_requested`, `password_reset_requested`, `shell_activation_invite`).
- Fan-out helpers: `resolveCourseStudentsAndParents(courseId)`, `resolveCenterAdmins(centerId)`, `withParentFallback(studentId)`.
- Admin broadcast endpoint.

**Endpoints:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /notifications | * | Inbox; filters: type, read |
| POST | /notifications/:id/read | * | Mark one |
| POST | /notifications/read-all | * | Mark all mine |
| POST | /notifications/broadcast | center_admin | `{ scope: "center"|"course", courseId?, title, body }` |

**Business rules:**
- Recipient resolver enforces parent-fallback: if "parent" is in the audience and student has no approved link, deliver to the student instead.
- Every trigger from §3.4's catalog must be emitted; audit each epic for wired triggers.
- Channel registry is a `Map<channelName, adapter>`; `fcm` stub exists but is unregistered in V1.
- Admin broadcast targets parents of a course (default: course scope) or all parents linked to students in the center (center scope).

**Acceptance criteria:**
- [ ] Checklist of all 17 notification types confirms each fires at the right moment (manual walkthrough OK).
- [ ] Fan-out helpers return correct recipient sets, including parent-fallback.
- [ ] Broadcast scoped to a course excludes parents of students not in that course.
- [ ] Inbox paginates and marks-as-read cleanly.

---

## Epic 15 — Hardening

**Goal:** The app is ready for a real user. Rate limits, logging, lazy expiry, and backup docs.

**Depends on:** All prior epics.

**Read first:** Backend Plan §2.7 (lazy expiry), §3.9.

**Scope (in):**
- Rate limit `/auth/*` (20/min per IP) and `/search/*` (60/min per IP) — in-memory token bucket is acceptable for MVP.
- Structured request logging (pino or similar): method, path, status, ms, userId, centerId.
- Lazy expiry sweeps triggered on relevant GETs: `enrollmentRequests` older than 14 days → `expired`, `inviteTokens` past `expiresAt` → `usedAt=now` and marked invalid, same for `passwordResetTokens`.
- Seed script for dev + README snippet for backup/restore (`mongodump` / `mongorestore`).

**Acceptance criteria:**
- [ ] 25 consecutive `/auth/login` requests → first 20 pass, next 5 get 429.
- [ ] Logs include the session userId when authenticated.
- [ ] A request that reads an expired pending enrollment request gets back `status=expired` without needing a cron.

---

## Epic 16 — FCM (final phase)

**Goal:** Push notifications ship. The `fcm` channel is registered in the notify service and types that should push, push.

**Depends on:** Epic 14. Firebase project + service account.

**Scope (in):**
- `userDeviceTokens` collection: `userId`, `token`, `platform`, `createdAt`, `lastSeenAt`.
- Endpoints:

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /me/device-tokens | * | Register FCM token |
| DELETE | /me/device-tokens/:token | * | Unregister |

- `fcm` channel adapter implementing the channel interface; reads all device tokens for the recipient and sends in a batch.
- Invalid-token handling: on send error `NotRegistered` or `InvalidRegistration`, purge the token.
- Enable `fcm` channel on these types: `absence_marked`, `session_cancelled`, `session_postponed`, `course_cancelled`, `grade_entered`, `material_uploaded`, `payment_recorded`, `enrollment_request_approved`, `enrollment_request_declined`, `admin_broadcast`.

**Acceptance criteria:**
- [ ] A device token registered via the endpoint receives a push on a tested trigger.
- [ ] An invalidated token is purged on the next failed send.
- [ ] All notification types that should push, do; types that should not push (e.g., `password_reset_requested`) stay email-only.

---

*End of per-epic prompts. Feed one at a time. Between epics, run the Postman collection to confirm nothing regressed.*
