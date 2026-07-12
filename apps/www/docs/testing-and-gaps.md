# Edura — Testing Guide, Backend/Frontend Gaps & Seed Notes

> Generated: 2026-05-07
> Stack: Next.js 14 · MongoDB/Mongoose · NextAuth · Zustand · DaisyUI/TailwindCSS

---

## 1. Architecture Reality Check

### What the codebase actually is (post-PR #12)
The current `main` branch is a **daisyUI + Zustand** frontend wired to a real REST API (`/api/v1/*`).
- The portal-select page (`/`) has **no authentication** — it just writes a role key to `localStorage` and redirects to `/dashboard`.
- The dashboard (`/dashboard`) reads that `localStorage` key and renders the matching screen component.
- Each screen calls a **Zustand store** which calls `ky` against the real API.
- The API is properly protected with session cookies (NextAuth JWT) and role-based guards.

**Critical gap**: There is no login screen. Users cannot authenticate via the UI. The portal selector picks a role without verifying identity, so all API calls will fail with `401 Unauthorized` unless the browser already has a valid session cookie from a prior `/api/v1/auth/login` call.

---

## 2. Frontend Screens vs Backend Coverage

| Screen | Component | Store | API endpoint(s) called | Status |
|---|---|---|---|---|
| Portal Select | `app/page.tsx` | — | none | ❌ No auth — just writes localStorage |
| **Student Dashboard** | `StudentDashboard` | `studentDashboardStore` | `GET /dashboards/student` | ✅ Wired; falls back to mock on error |
| Student Schedule | `ScheduleScreen` | `scheduleStore` | `GET /enrollments?studentId=me` · `GET /sessions?studentId=me` | ⚠️ `enrollments` route does **not** support `?studentId=me` (only centerId/courseId filter); sessions `studentId=me` works |
| Student Grades | `GradesScreen` | `gradesStore` | `GET /grades?studentId=me` | ✅ Endpoint supports it |
| Student Attendance | `AttendanceScreen` | `attendanceStore` | `GET /me/attendance` | ✅ Wired |
| Student Assignments | `AssignmentsScreen` | `gradesStore` | `GET /grades?studentId=me` | ⚠️ Assignments screen re-uses grades store — no dedicated assignments concept in backend; "assignments due" surfaced via grade entries with no score |
| Messages | `MessagesScreen` | none | none — **pure mock data** | ❌ No messages API exists |
| **Teacher Dashboard** | `TeacherDashboard` | `teacherDashboardStore` | `GET /dashboards/teacher` | ✅ Wired; falls back to mock constants |
| Teacher Classes | `TeacherClassesScreen` | `teacherClassesStore` | `GET /courses` · `GET /sessions?courseId=X` · `POST /sessions/:id/cancel` · `POST /sessions/:id/postpone` | ✅ All endpoints exist |
| Teacher Gradebook | `TeacherGradebookScreen` | `gradebookStore` | `GET /grades/entries?courseId=X` · `GET /grades/students?courseId=X` · `POST /grades/batch-update` | ❌ **None of these sub-paths exist.** Backend has `GET /grades?courseId=X` (returns Grade documents) and `POST /grades/:id/scores` — the store invents paths that don't exist |
| Teacher Attendance | `AttendanceScreen` | `attendanceStore` | `GET /me/attendance` | ⚠️ Returns student-scoped attendance; for a teacher viewing class attendance use `GET /sessions/:id/attendance` — not surfaced |
| **Parent Dashboard** | `ParentDashboard` | `parentStore` | `GET /me/children` | ✅ Wired |
| Parent Progress | `ParentProgressScreen` | `parentStore` | `GET /me/children` · `GET /grades?studentId=X` · `GET /me/attendance?studentId=X` | ✅ All endpoints exist |
| Parent Fees | `ParentFeesScreen` | `parentStore` | `GET /payments?studentId=X` | ✅ Endpoint exists |
| Parent Attendance | `AttendanceScreen` | `attendanceStore` | `GET /me/attendance?studentId=X` | ✅ Wired |
| Parent Messages | `MessagesScreen` | none | none — pure mock | ❌ No messages API |
| Parent Meetings | renders `ParentProgressScreen` | `parentStore` | same as progress | ⚠️ Placeholder — no dedicated meetings concept |
| **Admin Dashboard** | `AdminDashboard` | `adminStore` | `GET /dashboards/admin` | ✅ Wired; falls back to mock |
| Admin Students | `AdminStudentsScreen` | `studentsStore` | `GET /roster/students` · `PATCH /roster/students/:id` | ✅ Wired |
| Admin Teachers | `AdminTeachersScreen` | `teachersStore` | `GET /roster/teachers` · `POST /roster/teachers/invite` · `DELETE /roster/teachers/:id` | ✅ Wired |
| Admin Classes | `AdminClassesScreen` | `coursesStore` | `GET /courses` · `POST /courses` · `DELETE /courses/:id` | ⚠️ `DELETE /courses/:id` doesn't exist — backend has `POST /courses/:id/cancel` only |
| Admin Fees | `AdminFeesScreen` | `feesStore` | `GET /payments` · `GET /reports/net-profit` · `POST /payments` | ✅ All endpoints exist |
| Admin Reports | `AdminReportsScreen` | `reportsStore` | `GET /reports/net-profit` · `GET /courses` · `GET /payments` | ✅ Core endpoints exist; monthly chart makes 6 serial requests |

### Screens with no backend at all (pure mock)
- `MessagesScreen` — used by all 4 roles. No `/messages` or `/threads` API exists.
- Meetings (parent) — renders ParentProgressScreen as placeholder.

### Backend resources with no frontend screen
These API endpoints exist but have zero UI:
- `GET/POST /enrollment-requests` + approve/decline
- `GET/POST /rooms` + CRUD
- `GET/POST /notifications` + mark-read
- `GET/POST /reviews`
- `POST /parent-links` + approve/reject (parent–student linking flow)
- `GET/POST /me/family-code` + rotate
- `GET/POST /affiliations` (teacher ↔ center)
- `GET /me/device-tokens` (push token management)
- `GET /search/centers`, `/search/courses`, `/search/teachers`
- `POST /auth/register/student`, `/parent`, `center`
- `POST /auth/invite/accept`
- `GET /centers/me` + admin management (`/centers/me/admins`)
- `GET /expenses` + CRUD
- `GET /subjects`

---

## 3. Specific API Mismatches

### 3.1 Gradebook store calls non-existent paths
The `gradebookStore` (`lib/store/gradebookStore.ts`) calls:
```
GET /api/v1/grades/entries?courseId=X   → 404
GET /api/v1/grades/students?courseId=X  → 404
POST /api/v1/grades/batch-update        → 404
```
**Actual backend API:**
```
GET  /api/v1/grades?courseId=X          → returns Grade[] (each with scores[])
POST /api/v1/grades                     → create a Grade entry
PUT  /api/v1/grades/:id/scores          → submit scores for a Grade
```
The teacher gradebook screen will always fail to load.

### 3.2 Schedule screen: enrollments filter
`scheduleStore` calls `GET /enrollments?studentId=me`. The `/enrollments` route only filters by `centerId`, `courseId`, and `studentId` (as a literal MongoDB ObjectId, not the string `"me"`). The `"me"` shorthand is not handled.

**Workaround**: The `GET /sessions?studentId=me` call in the same store **does** handle `"me"` correctly via enrolled course lookup.

### 3.3 Admin classes: delete vs cancel
`coursesStore` calls `DELETE /courses/:id` which returns 404. The backend only exposes `POST /courses/:id/cancel`. The admin classes screen's delete button will always fail.

### 3.4 Reports: `enrolledCount` not in courses response
`reportsStore` expects `GET /courses` to return `enrolledCount` per course. The courses route returns raw `Course` documents — there is no `enrolledCount` field. Enrollment rates in the reports chart will always show 0%.

### 3.5 No authentication in the UI
The portal selector (`app/page.tsx`) bypasses auth entirely. Every API call will receive `401` unless there's a pre-existing session cookie in the browser. There is no login form, no signup form, and no logout handler wired to the backend.

### 3.6 me/attendance: parent studentId not validated
`GET /me/attendance?studentId=X` for parents does not verify the parent–child relationship. A parent can pass any MongoDB ObjectId and get attendance data. (Low severity for an internal MVP but should be noted.)

---

## 4. User Flows & Manual Test Cases

### Prerequisites
1. Run the seed: `pnpm tsx scripts/seed.ts`
2. Start the server: `pnpm dev`
3. Get a session cookie by calling `POST /api/v1/auth/login` (see §4.0)

Since the UI has no login form, use **curl / Postman / browser DevTools** to obtain a session cookie before testing UI flows.

---

### 4.0 Authentication (API only — no UI)

**Test: Admin login**
```
POST /api/v1/auth/login
{ "email": "admin@nile-academy.eg", "password": "<from seed>" }

Expected: 200, Set-Cookie header, body { data: { token, user: { role: "center_admin" } } }
```

**Test: Wrong password**
```
POST /api/v1/auth/login
{ "email": "admin@nile-academy.eg", "password": "wrong" }

Expected: 401, { error: { code: "AUTH_ERROR", message: "Invalid email or password" } }
```

**Test: Rate limiting**
```
11× POST /api/v1/auth/login with wrong password in < 30 s

Expected: first 10 return 401; 11th returns 429
```

---

### 4.1 Center Admin flows

#### A. View dashboard
1. Log in as admin → set `localStorage.edura_state = {"role":"admin","screen":"dashboard"}` → open `/dashboard`
2. **Expected**: 4 stat cards (Students, Teachers, Active Courses, Net Revenue), today's sessions list, attendance rate badge.
3. **Verify**: numbers match seeded data (see §5 seed notes).

#### B. Manage students
1. Navigate to Students screen.
2. **Expected**: table of enrolled students with name, email, status, course count.
3. **Action**: blacklist a student — enter a reason, confirm.
4. **Expected**: student row shows `blacklisted` badge; API call `PATCH /roster/students/:id` with `{ blacklisted: true, blacklistReason }` returns 200.
5. **Action**: un-blacklist — confirm.
6. **Expected**: badge removed.

#### C. Manage teachers
1. Navigate to Teachers screen.
2. **Expected**: list of affiliated teachers.
3. **Action**: click Invite — enter email.
4. **Expected**: `POST /roster/teachers/invite` returns 201; teacher appears with `pending` status.
5. **Action**: remove a teacher.
6. **Expected**: `DELETE /roster/teachers/:id` → **will 404** (known gap — use cancel affiliation instead).

#### D. Manage classes (known gap)
1. Navigate to Classes screen.
2. **Expected**: list of courses with subject, teacher, room, schedule, enrolled count.
3. ⚠️ `enrolledCount` will be 0 for all courses (gap §3.4).
4. **Action**: cancel a course.
5. ⚠️ Will fail — store calls `DELETE /courses/:id` but endpoint is `POST /courses/:id/cancel`.

#### E. Fees screen
1. Navigate to Fees screen.
2. **Expected**: payments table + revenue/expenses summary from `GET /reports/net-profit`.
3. **Action**: record a payment — enter studentId, courseId, amount.
4. **Expected**: `POST /payments` returns 201; table updates.

#### F. Reports screen
1. Navigate to Reports screen.
2. **Expected**: revenue/expenses bar chart (6 months), per-course revenue breakdown, enrollment rate bars.
3. ⚠️ Enrollment rates will all be 0% (gap §3.4).
4. **Verify**: net profit matches sum of seeded payments minus expenses.

---

### 4.2 Teacher flows

#### A. View teacher dashboard
1. Log in as teacher → navigate to `/dashboard` with role=teacher.
2. **Expected**: stat cards (Active Students, Active Courses, Today's Sessions, Pending Grades), upcoming sessions list.

#### B. My Classes
1. Navigate to Classes screen.
2. **Expected**: list of courses assigned to this teacher.
3. **Action**: expand a course — see its sessions list (scheduled, completed, cancelled).
4. **Action**: cancel a session — enter a reason.
5. **Expected**: `POST /sessions/:id/cancel` returns 200; session status changes to `cancelled`.
6. **Action**: postpone a session — choose a new date.
7. **Expected**: `POST /sessions/:id/postpone` returns 200; session status changes to `postponed`.

#### C. Gradebook (known gap)
1. Navigate to Gradebook screen.
2. **Expected**: course selector + student score table.
3. ⚠️ **Will fail** — store calls `/grades/entries` and `/grades/students` which don't exist (gap §3.1).
4. Error state should render.

#### D. Attendance (partial)
1. Navigate to Attendance screen.
2. ⚠️ Fetches `GET /me/attendance` which is student-scoped — a teacher will get no meaningful data here.
3. **Expected workaround**: take attendance via `POST /sessions/:id/attendance` per session (API-only flow currently).

---

### 4.3 Student flows

#### A. View student dashboard
1. Log in as student → open `/dashboard` with role=student.
2. **Expected**: attendance rate %, assignments due count, average grade letter, GPA, today's schedule, upcoming sessions, subject performance bars.
3. **Verify**: GPA is derived from grade scores in seeded data.

#### B. Schedule
1. Navigate to Schedule screen.
2. ⚠️ `GET /enrollments?studentId=me` will fail — `studentId=me` not handled (gap §3.2).
3. `GET /sessions?studentId=me` will succeed and return sessions for enrolled courses.
4. **Expected**: schedule renders sessions; course list may be empty.

#### C. Grades
1. Navigate to Grades screen.
2. **Expected**: list of grade entries with name, date, score, max score, percentage.
3. **Verify**: matches seeded grade data for this student.

#### D. Attendance
1. Navigate to Attendance screen.
2. **Expected**: summary (present/absent/late counts, rate %), calendar/list of attendance records.
3. **Verify**: `present + absent + late = total sessions attended so far`.

#### E. Assignments
1. Navigate to Assignments screen.
2. ⚠️ Re-uses grades store — shows grade entries without a score as "pending assignments".
3. **Expected**: items where the student has no score recorded appear as due.

#### F. Messages
1. Navigate to Messages screen.
2. ⚠️ **Pure mock data** — no API. Renders seeded mock message threads from `lib/mockData.ts`.

---

### 4.4 Parent flows

#### A. View parent dashboard
1. Log in as parent → open `/dashboard` with role=parent.
2. **Expected**: child selector (if multiple children linked), child's grade summary, attendance rate, recent payments.
3. ⚠️ Requires at least one `ParentStudentLink` with status=`approved` to be seeded (see §5).

#### B. Child progress
1. Navigate to Progress screen.
2. **Expected**: grade bars per subject, attendance summary for selected child.
3. **Action**: switch child via dropdown.
4. **Expected**: data refreshes for new child.

#### C. Fees
1. Navigate to Fees screen.
2. **Expected**: payment history for selected child.
3. **Verify**: amounts match seeded payments for that student.

#### D. Messages / Meetings
1. ⚠️ Messages is mock only. Meetings renders ParentProgressScreen as placeholder.

---

### 4.5 Enrollment Request flow (API-only — no UI)

This is a key user journey with no frontend:

1. Student or parent sends `POST /enrollment-requests` with `{ courseId }`.
2. Admin sees pending requests at `GET /enrollment-requests?status=pending`.
3. Admin approves: `POST /enrollment-requests/:id/approve` → creates `Enrollment` + triggers payment record.
4. Admin declines: `POST /enrollment-requests/:id/decline` with `{ reason }`.

**Test cases:**
- Enroll student in a course with available capacity → expect 201 + Enrollment created.
- Enroll same student twice → expect 409 ConflictError.
- Enroll when course is full (`enrolledCount >= maxStudents`) → expect 422 BusinessRuleError.
- Blacklisted student tries to enroll → expect 403.

---

### 4.6 Parent–Student linking flow (API-only — no UI)

1. Parent gets their family code: `GET /me/family-code`.
2. Student submits link request: `POST /parent-links` with `{ familyCode }`.
3. Parent approves: `POST /parent-links/:id/approve`.
4. Parent can now see child via `GET /me/children`.

**Test cases:**
- Valid family code → link created in `pending` state.
- Wrong family code → 404 or 422.
- Parent approves → link status = `approved`, child appears in `/me/children`.
- Parent rejects → link status = `rejected`.

---

### 4.7 Notifications flow (API-only — no UI)

1. Admin broadcasts: `POST /notifications/broadcast` with `{ title, body, roles: ["student"] }`.
2. Student reads: `GET /notifications` → see unread count.
3. Mark one read: `POST /notifications/:id/read`.
4. Mark all read: `POST /notifications/read-all`.

---

### 4.8 Reviews flow (API-only — no UI)

1. Student (enrolled in course) posts review: `POST /reviews` with `{ courseId, rating, comment }`.
2. Anyone reads: `GET /reviews?courseId=X`.
3. Author edits/deletes: `PUT /reviews/:id` / `DELETE /reviews/:id`.
4. **Edge case**: non-enrolled student tries to review → expect 403.

---

## 5. Seed Data Notes — Urgent Requirements

The seed script (`scripts/seed.ts`) populates the following. Gaps mean certain flows will always show empty state.

### ✅ Already seeded (by `scripts/seed/*.ts`)
| Entity | Count | Notes |
|---|---|---|
| Center | 1 | "Nile Educational Academy" |
| Rooms | 6 | Hall 101/102/201, Physics Lab, Chemistry Lab, Computer Studio |
| Admin user | 1 | `admin@nile-academy.eg` |
| Teachers | 6 | With `CenterTeacherAffiliation` (active) |
| Students | varies | With `CenterStudentRoster` entries |
| Parents | 2 | `Mona Hassan` (parent of `Lina Hassan`) |
| Courses | 6 | Math, Physics, etc. with `schedulePattern` and generated sessions |
| Sessions | generated | From course schedulePatterns |
| Payments | seeded | Via `finances.ts` |
| Grades | seeded | Via `grades.ts` |
| Reviews | seeded | Via `reviews.ts` |

### ❌ NOT seeded — must be added urgently

**1. `ParentStudentLink` records**
Without these, every parent screen shows "No children linked". The parent portal is completely unusable.
```ts
// Needed: at least one approved link between seeded parent and seeded student
// Parent: Mona Hassan  →  Student: Lina Hassan
ParentStudentLink { parentId, studentId, status: "approved" }
```

**2. `Enrollment` records**
Without enrollments, students have no schedule, no sessions, no attendance, no grades in the dashboard.
The student dashboard will show all zeros and empty schedule.
```ts
// Needed: Lina Hassan enrolled in at least 2 courses (active status)
Enrollment { studentId, courseId, status: "active", enrolledAt }
```

**3. `AttendanceRecord` records**
Without these, attendance rate = 0%, attendance screen is empty.
```ts
// Needed: records for each (student, session) pair
AttendanceRecord { studentId, sessionId, courseId, status: "present"|"absent"|"late" }
```

**4. `EnrollmentRequest` records**
The admin enrollment-requests screen has no data to show without pending requests.
```ts
// Needed: 2-3 requests in "pending" status
EnrollmentRequest { studentId, courseId, centerId, status: "pending" }
```

**5. `Notification` records**
Without these, the notifications inbox (API-only currently) returns empty. When the UI is built it will appear broken.
```ts
Notification { recipientId, title, body, read: false, createdAt }
```

**6. Credentials file / `.env.test`**
Seed user passwords are generated in `scripts/seed/users.ts`. There is no documented list of test credentials. A `docs/test-credentials.md` (gitignored) should be created with:
```
admin@nile-academy.eg   / <password>
teacher1@nile-academy.eg / <password>
student-lina@example.eg  / <password>
parent-mona@example.eg   / <password>
```

---

## 6. Missing Backend Endpoints Summary

| Frontend expects | Actual backend | Severity |
|---|---|---|
| `GET /grades/entries?courseId` | Does not exist | 🔴 Teacher gradebook broken |
| `GET /grades/students?courseId` | Does not exist | 🔴 Teacher gradebook broken |
| `POST /grades/batch-update` | Does not exist (use `POST /grades/:id/scores`) | 🔴 Teacher gradebook can't save |
| `DELETE /courses/:id` | Only `POST /courses/:id/cancel` | 🟡 Admin delete button broken |
| `GET /enrollments?studentId=me` | `"me"` not handled (needs ObjectId) | 🟡 Student schedule shows no courses |
| Any messaging API | No `/messages` resource at all | 🔴 Messages screen is pure mock |
| `courses[].enrolledCount` | Field not returned | 🟡 Enrollment rates in reports = 0 |
| Login UI | No `/login` page | 🔴 Cannot authenticate from browser |

---

## 7. Recommended Fix Priority

1. **Add login page** — blocks all authenticated flows from the UI.
2. **Fix teacher gradebook** — either add the 3 missing sub-paths or rewrite the store to use existing grade endpoints.
3. **Seed `Enrollment` + `ParentStudentLink` + `AttendanceRecord`** — three tables whose absence makes entire portals appear broken.
4. **Fix `enrollments?studentId=me`** — add `"me"` shorthand handling to the enrollments route.
5. **Fix admin course delete** — change store from `DELETE /courses/:id` to `POST /courses/:id/cancel`.
6. **Add `enrolledCount` to courses response** — aggregate enrollment count in the courses GET route.
7. **Add messages API** — minimum viable: threads + messages models and basic CRUD.
8. **Seed `EnrollmentRequest` records** for the admin screen.
