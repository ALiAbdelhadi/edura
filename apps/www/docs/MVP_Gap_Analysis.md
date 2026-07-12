# MVP Gap Analysis — Edura

> Single-center deployment. No multi-tenancy. Prioritized for "ship a working demo", not production hardening.

---

## How to read this doc

- **Ship Blocker**: A user hits this and gets a broken screen, 403, or wrong data. Fix before any demo.
- **Ship Embarrassment**: Works technically but looks broken/unprofessional. Fix before showing to stakeholders.
- **Nice to Have**: Improves UX but the flow works without it. Defer.
- **Not MVP**: Doesn't apply to single-center demo. Ignore for now.

---

## SHIP BLOCKERS — Fix before any demo

### 1. Parent attendance page is 403'd

**Files:** `app/dashboard/parent/attendance/page.tsx:3`, `components/screens/AttendanceScreen.tsx:9`, `app/api/v1/me/attendance/route.ts:24-25`

Parent screen calls `me/attendance` with no `studentId`. Backend requires it for parents → every parent gets a 403.

**Fix:** Add a child selector (like `ParentFeesScreen` already has) and pass `?studentId=<id>`.

**Effort:** ~1 hour. Pattern already exists in `ParentFeesScreen`.

---

### 2. Sessions endpoints have no auth guard

**Files:** `app/api/v1/sessions/route.ts:14`, `app/api/v1/sessions/[id]/route.ts:11`

- List endpoint: `getSessionUser()` returns null but is never checked → unauthenticated callers get the full session list.
- Detail endpoint: zero auth code. Anyone can read any session by ID.

**Fix:** Add `requireSession()` + `requireRole()` to both. Auto-scope: admin sees center sessions, teacher sees own, student sees enrolled, parent sees child's.

**Effort:** ~2 hours.

---

### 3. Enrollments leak data to parents/teachers without linkage check

**File:** `app/api/v1/enrollments/route.ts:42-45`

- Parent can pass any `studentId` and see that student's enrollments — no `ParentStudentLink` verification.
- Teacher can pass any `studentId` — no course-assignment verification.

**Fix:** Parents: verify link exists. Teachers: filter to courses they teach only.

**Effort:** ~1.5 hours.

---

### 4. Materials list leaks all data to parents

**File:** `lib/services/materials/materials.ts:114-137`

The `listMaterials` role switch handles `center_admin`, `teacher`, `student` — but **no `parent` case**. Falls through with empty filter `{}` → returns ALL materials from DB.

**Fix:** Add explicit parent case: scope to linked student's enrolled courses, or throw `ForbiddenError`.

**Effort:** ~30 min.

---

### 5. Schedule shows wrong day and hides Sunday

**File:** `components/screens/ScheduleScreen.tsx:11-12`

- `days` array has 6 entries (Mon–Sat). `dayNames` has 7 (Sun–Sat).
- On Sundays, `dayIndex` = 0 → maps to Monday. Users see Monday's schedule on Sunday.
- Sunday sessions are invisible — no tab to select them.

**Fix:** Add `"Sun"` to `days` array. Fix `dayIndex` logic.

**Effort:** ~15 min.

---

### 6. Admin reports shows empty charts despite having data

**Files:** `components/screens/AdminReportsScreen.tsx:31-34`, `lib/services/reports/reports.ts:59-72`

UI expects `monthly`, `byCourse`, `enrollmentRates`, `attendanceRate`. Backend returns only `revenue`, `expenses`, `netProfit`. Four chart cards permanently show "No data yet".

**Fix:** Either extend `getNetProfitReport()` to return the 4 missing fields, or simplify UI to only show what the backend provides. The backend has the aggregation pipelines in `getAdminDashboard()` — could reuse.

**Effort:** ~3 hours (backend extend + frontend wire).

---

### 7. Teacher dashboard schedule table is blank

**Files:** `components/screens/TeacherDashboard.tsx:18-22`, `lib/services/reports/reports.ts:194-249`

Table columns expect `time`, `duration`, `subject`, `room`, `grade`. Backend returns `startTime`, `endTime`, `status`. Every cell except status is empty.

**Fix:** Enrich `todaySessions` aggregation to join course data (subject, room, grade level) and compute duration. Or adjust table columns to match what's returned.

**Effort:** ~2 hours.

---

### 8. Arabic users get LTR layout

**File:** `components/providers/AppProviders.tsx:64`

`direction="ltr"` is hardcoded. The default locale is Arabic (`ar`). Every Arabic-speaking user sees mirrored text with LTR alignment — broken forms, wrong icon placement, unreadable.

**Fix:** Read locale from session/user context, set `direction={locale === "ar" ? "rtl" : "ltr"}`.

**Effort:** ~30 min. Ant Design's `ConfigProvider` supports this natively.

---

### 9. Auth state becomes stale after logout

**Files:** `lib/refine/authProvider.ts:41-46, 70-78`

- Logout calls `signOut()` but doesn't clear `localStorage.edura_state`.
- The `check()` method's catch block reads localStorage and returns `authenticated: true` if a `role` key exists — even after logout.
- User can access dashboard UI in a confused state (API calls will 401 but the shell renders).

**Fix:** Clear `edura_state` in logout. Remove or guard the localStorage fallback in `check()`.

**Effort:** ~30 min.

---

## SHIP EMBARRASSMENT — Fix before stakeholder demos

### 10. Teacher dashboard "Ungraded Assignments" and "Class Performance" are dead

**File:** `components/screens/TeacherDashboard.tsx:74, 90`

`data.ungraded` and `data.classPerformance` are `undefined` — cards always show placeholder text.

**Fix:** Either compute in backend and return, or remove these cards from the dashboard until real.

**Effort:** ~1 hour to hide, ~4 hours to implement properly.

---

### 11. Header bell icon does nothing

**File:** `components/refine/DashboardShell.tsx:235-237`

`<Button icon={<BellOutlined />}>` has no `onClick`. Badge shows count but clicking is dead.

**Fix:** Add `onClick` → navigate to `/{role}/notifications`.

**Effort:** ~5 min.

---

### 12. Teacher subjects/rating are hardcoded zeros

**File:** `app/api/v1/roster/teachers/route.ts:36-39`

`subjects: []`, `rating: 0`, `reviewsCount: 0` — always. Admin teacher list looks empty.

**Fix:** Derive subjects from courses, rating from `teacherProfiles.ratingAvg`, reviewsCount from reviews collection.

**Effort:** ~1 hour.

---

### 13. Notifications don't link to anything

**File:** `components/screens/NotificationsScreen.tsx:95`

Clicking a notification only marks it read. No navigation. The `data` payload has contextual IDs but the frontend ignores it.

**Fix:** Map `notification.type` to a route. `payment` → receipts, `enrollment_request` → requests, `material` → materials, `absence_marked` → attendance.

**Effort:** ~2 hours.

---

### 14. Messages screen uses wrong query pattern

**File:** `components/screens/MessagesScreen.tsx:21, 33`

Uses `threadsQuery.data?.data` (old Refine pattern). Project uses `{ query, result }` pattern from `useCustom`.

**Fix:** Update to match `dataProvider.ts` `custom` method return shape, or remove Messages from nav if chat isn't core V1.

**Effort:** ~2 hours to fix, ~10 min to remove from nav.

---

### 15. Onboarding tour targets don't exist

**File:** `components/shared/OnboardingTour.tsx`

Tour steps reference `[data-tour="dashboard"]`, `[data-tour="classes"]`, etc. No component renders these attributes → Joyride silently skips all steps.

**Fix:** Add `data-tour` attributes to target elements, or disable the tour button until wired.

**Effort:** ~2 hours to wire, ~5 min to disable.

---

### 16. Student nav icon missing

**File:** `app/dashboard/student/layout.tsx:8`

Uses `icon: "search"` but `iconMap` in `DashboardShell.tsx` has no `"search"` key. Falls back to generic grid icon.

**Fix:** Add `SearchOutlined` to `iconMap`.

**Effort:** ~2 min.

---

### 17. Parent receipt access is blocked

**Files:** `lib/services/payments/payments.ts:149-151`, `app/api/v1/payments/[id]/receipt/route.ts`

`getPayment()` throws `ForbiddenError` for parent role. Parents can list payments but can't view/download individual receipts.

**Fix:** Allow parent access when the payment belongs to a linked student.

**Effort:** ~30 min.

---

## NICE TO HAVE — Defer to post-MVP

### 18. Password reset flow missing frontend

Backend (`lib/services/auth/passwordReset.ts`) is complete. Missing:
- `POST /api/v1/auth/password/forgot` route
- `POST /api/v1/auth/password/reset` route
- `/forgot-password` page
- `/reset-password` page

**Effort:** ~4 hours.

---

### 19. Invite accept page missing

Backend (`app/api/v1/auth/invite/accept/route.ts`) is complete. Missing: `/invite/accept?token=...` frontend page.

**Effort:** ~2 hours.

---

### 20. Center registration UI missing

Backend (`app/api/v1/auth/register/center/route.ts`) is complete. UI only supports student/parent.

**Effort:** ~3 hours.

---

### 21. Profile update/settings incomplete

`GET /me` exists but no `PATCH /me`. No name/phone/locale edit, no teacher profile edit, no settings page.

**Effort:** ~4 hours.

---

### 22. Attendance GET scope bug (latent)

**File:** `app/api/v1/sessions/[id]/attendance/route.ts:31`

Passes `session.courseId` where `centerId` is expected. Currently harmless (single-center + `requireCenterScope` is no-op), but will break if multi-tenancy is added.

**Fix:** Fetch course, pass `course.centerId`.

**Effort:** ~15 min (worth doing now since it's trivial).

---

### 23. Admin student detail is read-only

No edit, no blacklist toggle, no enroll-into-class, no record-payment actions.

**Effort:** ~6 hours.

---

### 24. Global search not mounted

`GlobalSearch.tsx` exists but isn't in the dashboard header.

**Effort:** ~30 min.

---

### 25. Browse courses too basic

Backend supports more filters than UI exposes (subject, price, days, rating).

**Effort:** ~3 hours.

---

### 26. No course detail or center detail pages

Students can't drill into a course or center before requesting enrollment.

**Effort:** ~4 hours each.

---

### 27. Materials upload UX polish

No progress bar, no file size preview, no edit modal. Works but rough.

**Effort:** ~3 hours.

---

## NOT MVP — Ignore for single-center demo

| # | Item | Why not MVP |
|---|------|-------------|
| 28 | `requireCenterScope` implementation | Single center — no cross-tenant risk |
| 29 | Cross-center security tests | No multi-tenancy |
| 30 | Multi-center seed data | Only one center |
| 31 | Cloudinary signed URL enforcement | External PDF links work fine for demo |
| 32 | Push notifications (FCM) | Nice-to-have, not demo-blocking |
| 33 | Real email providers (mailgun/sendgrid) | Console log is fine for demo |
| 34 | Account deletion/anonymization | Regulatory, not demo-blocking |
| 35 | Parent material download support | Can explicitly say "not available" |
| 36 | Playwright smoke tests | Post-MVP quality gate |
| 37 | API security tests | Post-MVP (single-center) |

---

## Recommended Fix Order

Ordered by: impact × effort. Ship blockers first, quick wins interleaved.

| Step | Item | Time est | Why this order |
|------|------|----------|----------------|
| 1 | #5 Schedule Sunday fix | 15 min | Fastest blocker fix |
| 2 | #8 Arabic RTL | 30 min | Affects all Arabic users |
| 3 | #9 Auth stale state | 30 min | Confuses every user after logout |
| 4 | #4 Materials parent fallthrough | 30 min | Data leak, one-line fix |
| 5 | #11 Bell icon onClick | 5 min | Visible dead element |
| 6 | #16 Student search icon | 2 min | Quick cosmetic |
| 7 | #1 Parent attendance child selector | 1 hr | Pattern exists, copy from ParentFees |
| 8 | #2 Sessions auth guard | 2 hr | Security, blocks demo confidence |
| 9 | #3 Enrollments linkage check | 1.5 hr | Security, parents/teachers see too much |
| 10 | #17 Parent receipt access | 30 min | Small service fix |
| 11 | #12 Teacher subjects/rating | 1 hr | Dashboard looks empty |
| 12 | #10 Teacher dashboard dead cards | 1 hr | Hide or implement |
| 13 | #6 Admin reports contract | 3 hr | Charts empty, looks broken |
| 14 | #7 Teacher schedule enrichment | 2 hr | Table blank |
| 15 | #14 Messages fix or remove | 10 min–2 hr | Decide and ship |
| 16 | #13 Notification deep links | 2 hr | UX improvement |
| 17 | #15 Onboarding tour | 5 min–2 hr | Disable or wire |
| 18 | #22 Attendance scope bug | 15 min | Latent, easy fix |

**Total estimated time for all ship blockers + embarrassments: ~20 hours.**

---

## Quick Wins (< 30 min each)

These can be knocked out in a single sitting:

1. Schedule Sunday fix (15 min)
2. Arabic RTL direction (30 min)
3. Auth localStorage cleanup (30 min)
4. Materials parent fallthrough (30 min)
5. Bell icon onClick (5 min)
6. Student search icon (2 min)
7. Parent receipt access (30 min)
8. Attendance scope bug fix (15 min)
9. Disable onboarding tour (5 min)
10. Hide teacher dead cards (10 min)

**~2.5 hours total for 10 fixes.**
