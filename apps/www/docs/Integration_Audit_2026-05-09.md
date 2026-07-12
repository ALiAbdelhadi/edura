# Backend ↔ Frontend Integration Audit

**Date:** 2026-05-09
**Branch:** `claude/analyze-integration-j4TKM`
**Scope:** Hand-verified pass through every screen in `components/screens/**` and every route in `app/api/v1/**`. All findings below were checked against the actual source — not inferred.

---

## TL;DR

| Severity | Count | Notes |
|---|---|---|
| 🔴 Deployment-blocking | 9 | Mostly response-shape / field-name mismatches between backend payloads and screen reads. Surgical fixes, not architectural. |
| 🟡 Visible but non-blocking | 6 | Cosmetic, scoping, or known gaps already documented elsewhere. |
| ✅ Verified working | ~20 flows | Listed at the bottom. |

Estimated fix time for the 🔴 set: **2–4 hours**.

---

## Auth & Infrastructure (Verified Working)

- `app/login/page.tsx` exists (184 lines). Calls `POST /api/v1/auth/login` directly via `ky` (bypasses NextAuth's `signIn`). Backend (`app/api/v1/auth/login/route.ts`) validates the password and sets the same `next-auth.session-token` cookie that NextAuth would set, using `NEXTAUTH_SECRET`. Front end then stores `edura_state` in `localStorage` and pushes `/dashboard`.
- `/dashboard/page.tsx` reads `localStorage.edura_state.role`, falls back to `GET /api/v1/me`, and forwards to the role-specific portal (`admin/teacher/student/parent`).
- `lib/api/client.ts` redirects 401 responses to `/login` and clears local state.
- `lib/refine/dataProvider.ts`'s `extractListData` accepts both flat-array and `{items: [...]}` envelopes — so backend routes can return either shape.
- Pagination uses `?page=` + `?pageSize=`. Two backends use a different param name (see #B6 below).

---

## 🔴 Deployment-Blocking Issues

### B1. `TeacherDashboard` shows nothing — every field name mismatched

**Files:**
- Frontend: `components/screens/TeacherDashboard.tsx:39-95`
- Backend: `lib/services/reports/reports.ts:187-199` (used by `app/api/v1/dashboards/teacher/route.ts`)

**What the screen reads:**
```
data.classesToday, data.pendingGrades, data.totalStudents,
data.attendanceRate, data.schedule, data.ungraded, data.classPerformance
```

**What the backend returns:**
```js
{
  activeStudents,
  activeCourses,
  todaySessions,
  avgAttendanceRate,
  pendingGradeEntries,
}
```

Zero overlap. Every stat card renders `undefined`; schedule, ungraded list, and class performance sections all empty.

**Fix options:**
1. Rename screen reads to match service output (`activeStudents`, `todaySessions`, `avgAttendanceRate`, `pendingGradeEntries`, drop `ungraded`/`classPerformance` until service computes them).
2. Or add the missing aggregations server-side.

---

### B2. `AdminReportsScreen` shows zeros / empty charts

**Files:**
- Frontend: `components/screens/AdminReportsScreen.tsx:29-35`
- Backend: `lib/services/reports/reports.ts:53-66` (`getNetProfitReport`) via `app/api/v1/reports/net-profit/route.ts`

**What the screen reads:**
```
data.currentRevenue, data.currentExpenses, data.monthly,
data.byCourse, data.enrollmentRates, data.attendanceRate
```

**What the backend returns:**
```js
{ revenue, expenses, netProfit, from, to }
```

Cards show 0; the three charts (Revenue vs Expenses, Revenue by Course, Enrollment Rate) all render "No data yet."

**Fix options:**
1. Strip the screen down to the three numbers we have (`revenue`, `expenses`, `netProfit`).
2. Or extend `getNetProfitReport` to return monthly buckets, per-course breakdown, enrollment rates, and overall attendance rate.

---

### B3. `AdminTeachersScreen` table is blank

**Files:**
- Backend: `app/api/v1/roster/teachers/route.ts:26-29`
- Frontend (consumes): `components/screens/AdminTeachersScreen.tsx:50-90`
- Frontend (also depends on nested shape): `components/screens/AdminClassesScreen.tsx:367` (`t.teacher?.name`, `t.teacherId`)

**Current backend response:**
```js
[ { ...affiliation, teacher: { name, email, status } } ]
```

**Screen reads flat:** `record.name`, `record.email`, `record.subjects`, `record.coursesCount`, `record.rating`, `record.reviewsCount`. All resolve to `undefined` / `0` / "No reviews".

**Constraint:** `AdminClassesScreen.tsx:367` builds the teacher dropdown via `t.teacher?.name` and `t.teacherId`. The fix must keep `teacherId` plus add the flat fields so both screens work.

**Recommended response shape:**
```js
[
  {
    id: <teacherUserId>,
    teacherId: <teacherUserId>,           // keep for AdminClassesScreen
    name, email, status,                  // flat for AdminTeachersScreen
    subjects: [],                         // (no source yet — return [])
    coursesCount: <Course.countDocuments({ teacherId, status: "active" })>,
    rating: 0, reviewsCount: 0,           // (no source yet — return zeros, fill later)
    affiliation: { ...originalAffiliation } // optional, for completeness
  }
]
```

---

### B4. `AdminStudentsScreen` blacklist mutates the wrong record (404)

**Files:**
- Backend GET: `app/api/v1/roster/students/route.ts:66-71` returns `{items: [{...roster, user}]}`
- Backend PATCH: `app/api/v1/roster/students/[studentId]/route.ts:39` keys by **student userId**
- Frontend: `components/screens/AdminStudentsScreen.tsx:111`
- Envelope: `lib/http/envelope.ts` adds `id = _id` to each top-level row

**Symptom:** Each row's `record.id` (and `record._id`) is the **roster** `_id`, not the student userId. The screen sends `PATCH /roster/students/<rosterId>` → backend looks up `{centerId, studentId: rosterId}` → 404. Blacklist/unblacklist always silently fails.

**Recommended fix (backend):** In the GET response, build each item as
```js
{
  id: roster.studentId,        // <-- so Refine's record.id is the student id
  studentId: roster.studentId,
  rosterId: roster._id,
  blacklisted, blacklistReason, addedAt, leftAt,
  ...user                       // name, email, phone, status flat
}
```
This single change also resolves B5.

---

### B5. `AdminEnrollmentRequestsScreen` displays raw ObjectIds for student names

**File:** `components/screens/AdminEnrollmentRequestsScreen.tsx:31-45, 109`

`studentMap.set(s._id, s.name)` is keyed by **roster `_id`** while the lookup uses **student userId** (`r.studentId`). And `s.name` is `undefined` because name lives at `s.user.name` in the current response. Both bugs disappear once B4 is fixed.

---

### B6. `TeacherGradebookScreen` shows student IDs, not names

**File:** `components/screens/TeacherGradebookScreen.tsx:59-69`

Calls `useList({resource: "students"})` → `GET /roster/students`, which is **`requireRole("center_admin")`** only. Teachers receive 403; the student-name map stays empty; the gradebook table renders raw ObjectIds in the Student column.

**Fix options:**
1. Open `GET /roster/students` to teachers (filter to teachers' enrolled students only).
2. Or create a new teacher-scoped endpoint, e.g. `GET /sessions/:id/attendance` already returns enrolled students per course; reuse a similar mechanism for the gradebook.
3. Or drive the row list off `Grade.scores[]` (which already carries `studentId`) and add a small lookup endpoint.

---

### B7. `ParentDashboard` / `ParentProgressScreen` return wrong (and over-shared) data

**Files:**
- Frontend: `components/screens/ParentDashboard.tsx:55-57`, `components/screens/ParentProgressScreen.tsx:770-792`, `components/screens/GradesScreen.tsx:469`
- Backend: `lib/services/grades/grades.ts:46-58`

**Issue 1 — privacy leak + wrong scores:** Parent calls `GET /grades?studentId=childId`. The service for the `parent` role does **not** apply the `studentId` filter (comment at line 51 says "filter by courseId only"). With no `courseId` either, the query is `{}` → returns **all grades in the system**, with all scores. Screen does `g.scores?.[0]` and renders that as "the child's score" — it's actually a random other student's score.

**Issue 2 — phantom "Fees Due":** `ParentDashboard.tsx:55-57` filters payments by `p.status === "pending"`. The Payment model has no `status` field. "Fees Due" is permanently 0.

**Issue 3 — subject column shows ObjectId:** `ParentProgressScreen.tsx:817` and `GradesScreen.tsx:469` render `r.courseId` (raw ObjectId) as the subject. `GET /grades` doesn't enrich responses with courseName or subject.

**Fix:**
1. In `listGrades` for parent role: require `studentId`, verify ParentStudentLink (`status: "approved"`), then apply `query.studentId = studentId` and scope `scores` to that student.
2. Enrich `GET /grades` results with `courseName` / `subject` (same pattern as `/enrollments` and `/sessions`).
3. Drop the "Fees Due" card from `ParentDashboard` (or compute it from enrollments × course price − payments).

---

### B8. `ScheduleScreen` and `TeacherClassesScreen` see all data globally

**Files:**
- `components/screens/ScheduleScreen.tsx:262` — `useList({resource: "sessions"})` with no filter. `GET /sessions` does not auto-scope by student. Student sees other classes' sessions.
- `components/screens/TeacherClassesScreen.tsx:17` — `useList({resource: "courses"})` with no filter. `GET /courses` does not auto-scope by teacher. Teacher sees every center's courses.

**Fix:** Pass filters at the screen level — backend already supports them.
```ts
useList({ resource: "sessions", filters: [{ field: "studentId", operator: "eq", value: "me" }] });
useList({ resource: "courses",  filters: [{ field: "teacherId",  operator: "eq", value: "me" }] }); // requires backend to handle "me"
```
For courses, either resolve `"me"` server-side (mirror what `/enrollments` and `/sessions` do) or pass the actual teacher id from `useGetIdentity()`.

---

### B9. ~~Seed data missing critical tables~~ — **NOT a bug**

Earlier audit (a sub-agent run) claimed `ParentStudentLink`, `Enrollment`, `AttendanceRecord`, `EnrollmentRequest`, and `Notification` were unseeded. Verified false: all five are seeded by `scripts/seed/users.ts:159`, `courses.ts:67`, `sessions.ts:105`, `relational.ts:35`, and `relational.ts:101` respectively. Listed here only because it appeared in the prior report and might mislead.

---

## 🟡 Non-Blocking (Visible but Acceptable for the Demo)

| # | Item | File | Note |
|---|---|---|---|
| N1 | "Record Payment" modal asks for raw studentId/courseId text | `AdminFeesScreen.tsx:163-184` | Functional but ugly — should be Selects driven by roster + courses. |
| N2 | `daysOfWeek` in course schedule renders as numbers | `AdminClassesScreen.tsx:266` | Cosmetic — should map 0–6 to Sun–Sat. |
| N3 | `AdminDashboard` hard-codes "Pending enrollment requests: 0" and a fake fee-defaulter estimate | `AdminDashboard.tsx:104-105` | Cosmetic. |
| N4 | `me/attendance` for parent does not validate `studentId` belongs to that parent | `app/api/v1/me/attendance/route.ts` | Pre-existing security gap, documented in `docs/Priority_Plan.md`. |
| N5 | Resources missing from `AppProviders.tsx` `resources` list: `materials`, `notifications`, `parent-links`, `reviews`, `enrollment-requests` | `components/providers/AppProviders.tsx:13-28` | Refine warns but `useList`/`useCustom` still work. Breaks Refine's breadcrumbs / `syncWithLocation`. |
| N6 | Notifications route uses `?limit=` while dataProvider sends `?pageSize=` | `app/api/v1/notifications/route.ts:17` vs `lib/refine/dataProvider.ts:67` | Default limit (20) is used; only matters if a screen sets a custom page size. `NotificationsScreen` uses `pagination: {mode: "off"}` so this is moot today. |

---

## ✅ Verified Working End-to-End

- **Auth:** login flow, JWT cookie, role-aware `/dashboard` redirect, 401 handler.
- **Admin Rooms:** full CRUD via `useList`/`useCreate`/`useUpdate`/`useDelete`.
- **Admin Expenses:** full CRUD; schema matches.
- **Admin Fees stats card:** field names match `getNetProfitReport` output (unlike `AdminReportsScreen`).
- **Admin Course management:** create (with auto-generated sessions), edit, cancel via `POST /courses/:id/cancel`. (No DELETE endpoint exists or is needed — earlier sub-agent report was wrong about this.)
- **Admin Enrollment Requests:** list / approve / decline wired correctly to `enrollment-requests/[id]/approve|decline`. (Student-name display still broken — see B5.)
- **Teacher Materials:** PDF upload via `FormData` posted directly through `lib/api/client.ts` (bypasses dataProvider, which is JSON-only); delete via `useDelete`; download via signed Cloudinary URL.
- **Teacher Reviews:** list scoped to current teacher in backend; `studentId.populate("name")` makes `record.studentId.name` work.
- **Teacher Affiliations:** accept / decline; centers populated via separate query, displayed correctly.
- **Teacher Classes session controls:** cancel + postpone POST endpoints wired.
- **Teacher Attendance:** `GET sessions/:id/attendance` + `PUT sessions/:id/attendance` correctly wired (NOT broken — earlier sub-agent claim was wrong; the screen uses `useCustom`/`useCustomMutation` to the right URL with the right method).
- **Student Dashboard:** every field name matches `dashboards/student` output.
- **Student Materials download:** signed URL flow works.
- **Student Reviews:** create / edit / list eligible teachers all correct.
- **Student Family Code:** rotate works.
- **Notifications:** list, mark-read, mark-all-read all wired.
- **Parent Linking:** code (parent role only), email, phone all work; backend correctly forbids student-initiated code linking.

---

## What the Sub-Agent Report Got Wrong (for the record)

The first audit (a sub-agent) flagged the following as deployment blockers. **All four are false positives** — verified against the code:

1. ❌ "DELETE `/courses/:id` missing" — `AdminClassesScreen.tsx:155` calls `POST courses/:id/cancel`, not DELETE. Correctly wired.
2. ❌ "No login page exists" — `app/login/page.tsx` exists, 184 lines.
3. ❌ "TeacherAttendanceScreen calls wrong endpoint `/me/attendance`" — actually calls `sessions/:id/attendance` via `useCustom` (line 56) and `useCustomMutation` PUT (line 89).
4. ❌ "Seed missing critical tables" — verified all are seeded; see B9.

I'm noting these because the agent's report cited file paths and line numbers, which made it look authoritative when it wasn't.

---

## Recommended Fix Order

1. **B3** — `roster/teachers` shape (+ `coursesCount` aggregation). 15 min.
2. **B4** — `roster/students` shape so `id = studentId`. Resolves B5 too. 15 min.
3. **B1** — TeacherDashboard field renames. 15 min.
4. **B2** — Strip AdminReportsScreen to the three values that exist, OR extend the service. 30–60 min.
5. **B7** — Parent grades scoping + grades enrichment with courseName. 45 min.
6. **B8** — Add `studentId=me` / `teacherId=me` filters at call sites. 20 min.
7. **B6** — Teacher access to a student-name lookup for the gradebook. 30 min.

Total: ~3 hours of mechanical work.
