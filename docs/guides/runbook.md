# Edura — Complete Runbook

> ## ⚠️ STALE — DO NOT TREAT AS CURRENT
>
> **Last accurate: 2026-05-07.** This runbook describes a stack the project no
> longer uses. Specifically outdated:
>
> - **MongoDB Atlas** — the database is now **Neon Postgres via Prisma** with
>   row-level security (`packages/database`). Every Mongo collection, query,
>   connection-string, and backup instruction below is obsolete.
> - **DaisyUI 5** — the UI migrated to **shadcn/ui** (Radix + Tailwind v4)
>   via `@repo/ui`.
> - **Zustand** — no longer the state layer described here.
> - Setup, deploy, and troubleshooting steps predate the `apps/superadmin`
>   extraction, the money/ledger engine, and the PWA work.
>
> - **Seeding** (added 2026-07-26) — every seeding instruction here predates the
>   `edura-env:` database-label guard. `prisma/seed.ts` now refuses an unlabelled
>   database and refuses a production-labelled one without explicit `SEED_*`
>   credentials. Nothing below reflects that.
>
> Kept for historical reference and for the sections that are still
> stack-independent. For anything current, use
> [../guides/deployment.md](deployment.md) — **except its Seeding section, which
> is stale too and carries its own warning** —
> [../architecture/architecture-review.md](../architecture/architecture-review.md),
> and [CLAUDE.md](../../CLAUDE.md). Verify against the codebase before acting on
> anything in this file.

> Last updated: 2026-05-07
> Stack: Next.js 14 · MongoDB Atlas · NextAuth JWT · Zustand · DaisyUI 5 · Tailwind 4

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Environment Setup](#2-environment-setup)
3. [Running the App](#3-running-the-app)
4. [Seeding the Database](#4-seeding-the-database)
5. [Demo Credentials — All Accounts](#5-demo-credentials--all-accounts)
6. [Demo Center Data](#6-demo-center-data)
7. [Demo Courses & Schedule](#7-demo-courses--schedule)
8. [Screen Map — What Each Role Can Access](#8-screen-map--what-each-role-can-access)
9. [API Reference Summary](#9-api-reference-summary)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Backend Architecture](#11-backend-architecture)
12. [Known Gaps & Deferred Work](#12-known-gaps--deferred-work)
13. [Deployment (Netlify)](#13-deployment-netlify)
14. [Testing](#14-testing)

---

## 1. Project Overview

Edura is a multi-tenant tutoring-centre management platform for the Egyptian secondary education market (Thanaweya Amma preparation). It serves four user roles from a single Next.js application:

| Role | Arabic | What they do |
|---|---|---|
| `center_admin` | مدير المركز | Manage students, teachers, courses, fees, reports |
| `teacher` | معلم | View classes, take attendance, manage gradebook |
| `student` | طالب | View schedule, grades, attendance, enroll in courses |
| `parent` | ولي أمر | Monitor child progress, attendance, fees |

The demo instance is pre-seeded with **Nile Educational Academy** (أكاديمية النيل التعليمية), a fictional Cairo tutoring centre.

---

## 2. Environment Setup

### Prerequisites

- Bun 1.3.12 (`curl -fsSL https://bun.sh/install | bash`)
- MongoDB Atlas cluster (or local `mongod --replSet rs0` for transactions)

### Install

```bash
git clone <repo>
cd edura
bun install
```

### Environment variables

Create `.env.local` in the project root:

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?appName=<app>
MONGODB_DB=edura

# NextAuth — generate secret with: openssl rand -base64 32
NEXTAUTH_SECRET=<your-secret>
NEXTAUTH_URL=http://localhost:3002

# Email (use "console" to print to stdout in dev)
MAIL_PROVIDER=console
MAIL_FROM=no-reply@edura.local

# App
APP_BASE_URL=http://localhost:3002

# Seed password for all demo accounts
SEED_PASSWORD=Passw0rd!
```

#### Current `.env.local` (dev / demo)

```env
MONGODB_URI=mongodb+srv://<REDACTED>
MONGODB_DB=edura
NEXTAUTH_SECRET=KtaKlwLYhfgqY7EM9APZmjH12I_Y8HpDBPjOrK-ENkQ
NEXTAUTH_URL=http://localhost:3002
MAIL_PROVIDER=console
MAIL_FROM=no-reply@edura.local
APP_BASE_URL=http://localhost:3002
SEED_PASSWORD=Passw0rd!
```

> **Note:** The Atlas cluster has IP whitelisting. Run `bun run seed` from a machine whose IP is whitelisted, or add `0.0.0.0/0` in Atlas Network Access for dev.

---

## 3. Running the App

```bash
# Development (hot reload)
bun run dev          # starts on http://localhost:3002

# Production build + start
bun run build
bun run start

# Type check only
bun run typecheck

# Lint
bun run lint
```

The app opens at `http://localhost:3002` which redirects to `/login`.

---

## 4. Seeding the Database

The seed script is **idempotent** — safe to run multiple times. It uses upsert operations so re-running converges to the same state.

```bash
# Full seed (requires MONGODB_URI)
bun run seed
# or
bun run tsx --env-file .env.local scripts/seed.ts

# Deploy-safe variant (exits 0 if MONGODB_URI not set)
bun run seed:deploy
```

### What the seed creates

| Step | Data |
|---|---|
| 1. Center + Rooms | 1 center, 6 rooms |
| 2. Users | 1 admin, 6 teachers, 10 students, 2 parents |
| 3. Courses + Enrollments | 6 courses, ~35 enrollments |
| 4. Sessions + Attendance | 8 sessions/course, 5 past (attendance marked), 3 future |
| 5. Grades | Grade entries with scores per enrolled student |
| 6. Payments + Expenses | Fee payments + center expenses |
| 7. Reviews | Teacher reviews from students |
| 8. Relational | 3 pending EnrollmentRequests, 2 Notifications per user |

---

## 5. Demo Credentials — All Accounts

**All accounts share the same password:** `Passw0rd!`

### Admin

| Field | Value |
|---|---|
| Email | `admin@nile-academy.eg` |
| Password | `Passw0rd!` |
| Name | Mostafa Khaled Abdelfattah |
| Phone | +201112345001 |
| Role | `center_admin` |

### Teachers (6)

| Name | Email | Subjects | Experience |
|---|---|---|---|
| Hossam Abdel-Aziz | `hossam.aziz@nile-academy.eg` | Math | 12 years |
| Hana Al-Rashidi | `hana.rashidi@nile-academy.eg` | Physics, Chemistry | 9 years (Ph.D.) |
| Nourhan Mostafa | `nourhan.mostafa@nile-academy.eg` | Arabic | 7 years |
| Kareem Salah | `kareem.salah@nile-academy.eg` | Computer Science | 5 years |
| Rasha Ibrahim | `rasha.ibrahim@nile-academy.eg` | English | 11 years |
| Ahmed Ibrahim | `ahmed.ibrahim@nile-academy.eg` | Biology | 14 years (Ph.D.) |

**Password for all teachers:** `Passw0rd!`

### Students (10)

| Name | Email | City |
|---|---|---|
| Lina Hassan ⭐ | `lina.hassan@student.nile-academy.eg` | Cairo |
| Ahmed Mostafa ⭐ | `ahmed.mostafa@student.nile-academy.eg` | Giza |
| Sara El-Sayed | `sara.elsayed@student.nile-academy.eg` | Cairo |
| Omar Khaled | `omar.khaled@student.nile-academy.eg` | Alexandria |
| Yousef Tarek | `yousef.tarek@student.nile-academy.eg` | Cairo |
| Fatima Al-Zahraa | `fatima.zahraa@student.nile-academy.eg` | Giza |
| Mariam Adel | `mariam.adel@student.nile-academy.eg` | Cairo |
| Youssef Magdy | `youssef.magdy@student.nile-academy.eg` | Cairo |
| Habiba Sherif | `habiba.sherif@student.nile-academy.eg` | Mansoura |
| Karim Wael | `karim.wael@student.nile-academy.eg` | Cairo |

⭐ = best accounts to demo (most courses enrolled, have parent links)
**Password for all students:** `Passw0rd!`

### Parents (2)

| Name | Email | Linked Child |
|---|---|---|
| Mona Hassan | `mona.hassan@email.eg` | Lina Hassan |
| Tarek Mostafa | `tarek.mostafa@email.eg` | Ahmed Mostafa |

**Password for all parents:** `Passw0rd!`

---

## 6. Demo Center Data

**Center:** Nile Educational Academy
**Arabic:** أكاديمية النيل التعليمية
**Short ID:** NILE01
**Address:** 12 Tahrir Street, Downtown, Cairo
**Phone:** +20223931234
**WhatsApp:** +201001234567
**Email:** info@nile-academy.eg
**Location:** Tahrir Square [31.2357, 30.0444]

### Rooms

| Room | Capacity |
|---|---|
| Hall 101 | 35 |
| Hall 102 | 35 |
| Hall 201 | 30 |
| Physics Lab | 25 |
| Chemistry Lab | 25 |
| Computer Studio | 28 |

---

## 7. Demo Courses & Schedule

Term runs 8 weeks back → 8 weeks from today (rolling window on each seed).

| Course | Teacher | Room | Days | Time | Price (EGP) | Max | Enrolled |
|---|---|---|---|---|---|---|---|
| Mathematics — Grade 12 (Scientific) | Hossam Abdel-Aziz | Hall 101 | Mon/Wed | 08:30–10:00 | 800 | 35 | 7 |
| Physics — Grade 12 (Scientific) | Hana Al-Rashidi | Physics Lab | Mon/Thu | 10:15–11:45 | 750 | 25 | 6 |
| Arabic Literature — Secondary | Nourhan Mostafa | Hall 102 | Tue/Wed | 12:00–13:30 | 500 | 30 | 5 |
| Computer Science — Grade 11 | Kareem Salah | Computer Studio | Wed/Fri | 14:00–15:30 | 950 | 28 | 4 |
| English Literature — Grade 12 | Rasha Ibrahim | Hall 201 | Mon/Fri | 14:00–15:30 | 600 | 30 | 9 |
| Biology — Grade 11 | Ahmed Ibrahim | Chemistry Lab | Tue/Thu | 10:00–11:30 | 700 | 25 | 3 |

### Lina Hassan's courses (best student demo account)
- Mathematics — Grade 12
- Physics — Grade 12
- Arabic Literature
- English Literature

### Ahmed Mostafa's courses
- Mathematics — Grade 12
- Physics — Grade 12
- English Literature

---

## 8. Screen Map — What Each Role Can Access

### Admin portal
| Screen | Nav ID | Backend | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | `GET /dashboards/admin` | Stats: students, teachers, courses, revenue, today's sessions |
| Students | `students` | `GET /roster/students` | Blacklist/un-blacklist |
| Teachers | `teachers` | `GET /roster/teachers` | Invite, remove |
| Classes | `classes` | `GET /courses` | Cancel course |
| Fees | `fees` | `GET /payments` + `GET /reports/net-profit` | Record payments |
| Reports | `reports` | `GET /reports/net-profit` + `GET /courses` | Revenue chart, course breakdown |
| Enrollment Requests | `requests` | `GET /enrollment-requests` | Approve / decline pending requests |
| Notifications | `notifications` | `GET /notifications` | Mark read |

### Teacher portal
| Screen | Nav ID | Backend | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | `GET /dashboards/teacher` | Active students, today's sessions, pending grades |
| My Classes | `classes` | `GET /courses` + `GET /sessions` | Cancel/postpone sessions |
| Gradebook | `grades` | `GET /grades` + `PUT /grades/:id/scores` | Edit and save student scores |
| Attendance | `attendance` | `GET /me/attendance` | Student-scoped view (teacher attendance UI is API-only) |
| Messages | `messages` | Mock data | Demo only — no backend |
| Notifications | `notifications` | `GET /notifications` | Mark read |

### Student portal
| Screen | Nav ID | Backend | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | `GET /dashboards/student` | GPA, attendance %, today's sessions, due assignments |
| Schedule | `schedule` | `GET /enrollments` + `GET /sessions` | Course list + calendar |
| Assignments | `assignments` | `GET /grades` | Shows grade entries without a score as "pending" |
| Grades | `grades` | `GET /grades` | Scores per subject |
| Attendance | `attendance` | `GET /me/attendance` | Present/absent/late summary |
| Messages | `messages` | Mock data | Demo only — no backend |
| Notifications | `notifications` | `GET /notifications` | Mark read |

### Parent portal
| Screen | Nav ID | Backend | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | `GET /me/children` | Child selector, grade summary |
| Child Progress | `progress` | `GET /grades` + `GET /me/attendance` | Per-subject grades, attendance rate |
| Fees | `fees` | `GET /payments` | Payment history per child |
| Notifications | `notifications` | `GET /notifications` | Mark read |

---

## 9. API Reference Summary

Base URL: `/api/v1`
Auth: NextAuth session cookie (`next-auth.session-token`)
Response envelope: `{ data: T }` or `{ error: { code, message } }`

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login, sets session cookie |
| POST | `/auth/register/center` | Public | Register new center + admin |
| POST | `/auth/register/student` | Public | Student self-registration |
| POST | `/auth/register/parent` | Public | Parent self-registration |
| POST | `/auth/invite/accept` | Public | Accept invite token |

### Current User

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | Any | Current user profile |
| GET | `/me/children` | parent | Linked students |
| GET | `/me/attendance` | student/parent/admin | Attendance summary |
| GET | `/me/family-code` | student | Family link code |
| POST | `/me/family-code/rotate` | student | Generate new code |
| POST | `/me/device-tokens` | Any | Register FCM token |
| DELETE | `/me/device-tokens/:token` | Any | Remove FCM token |

### Center

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/centers/me` | center_admin | Center details |
| GET | `/centers/me/admins` | center_admin | List admins |
| POST | `/centers/me/admins/invite` | center_admin | Invite admin |
| PATCH | `/centers/me/admins/:userId` | center_admin | Update admin |
| DELETE | `/centers/me/admins/:userId` | center_admin | Remove admin |

### Rooms

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/rooms` | center_admin | List rooms |
| POST | `/rooms` | center_admin | Create room |
| GET | `/rooms/:id` | center_admin | Get room |
| PATCH | `/rooms/:id` | center_admin | Update room |

### Courses

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/courses` | Any | List courses (filter: centerId, teacherId, subject, status). Returns `enrolledCount`. |
| POST | `/courses` | center_admin | Create course + auto-generate sessions |
| GET | `/courses/:id` | Any | Get course |
| PATCH | `/courses/:id` | center_admin | Update course |
| POST | `/courses/:id/cancel` | center_admin | Cancel course |
| POST | `/courses/:id/reassign-teacher` | center_admin | Change teacher |

### Sessions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sessions` | Any | List sessions (filter: courseId, studentId=me) |
| GET | `/sessions/:id` | Any | Get session |
| POST | `/sessions/:id/cancel` | teacher/center_admin | Cancel with reason |
| POST | `/sessions/:id/postpone` | teacher/center_admin | Reschedule |
| POST | `/sessions/:id/attendance` | teacher | Bulk mark attendance |
| PUT | `/sessions/:id/attendance` | teacher | Bulk update attendance |

### Enrollments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/enrollments` | Any | List (student: own; admin: by centerId; supports `?studentId=me`). Returns `courseName` + `schedulePattern`. |
| POST | `/enrollments` | center_admin | Direct enroll student |
| GET | `/enrollments/:id` | Any | Get enrollment |
| DELETE | `/enrollments/:id` | center_admin | Remove enrollment |

### Enrollment Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/enrollment-requests` | center_admin/student | List (filter: status) |
| POST | `/enrollment-requests` | student | Submit request |
| GET | `/enrollment-requests/:id` | Any | Get request |
| POST | `/enrollment-requests/:id/approve` | center_admin | Approve → creates Enrollment |
| POST | `/enrollment-requests/:id/decline` | center_admin | Decline with reason |

### Roster

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/roster/students` | center_admin | Center's students |
| PATCH | `/roster/students/:id` | center_admin | Update (blacklist, etc.) |
| POST | `/roster/students/invite` | center_admin | Pre-create shell student |
| POST | `/roster/students/lookup` | center_admin | Find by email |
| GET | `/roster/teachers` | center_admin | Center's teachers |
| POST | `/roster/teachers/invite` | center_admin | Invite teacher |
| DELETE | `/roster/teachers/:id` | center_admin | Remove affiliation |
| POST | `/roster/teachers/lookup` | center_admin | Find by email |

### Grades

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/grades` | Any | List (filter: courseId, studentId) |
| POST | `/grades` | teacher | Create grade entry |
| GET | `/grades/:id` | Any | Get grade |
| PATCH | `/grades/:id` | teacher | Update name/maxScore/date |
| DELETE | `/grades/:id` | teacher | Delete grade |
| PUT | `/grades/:id/scores` | teacher | Bulk upsert student scores |

### Attendance Records

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/attendance/:id` | Any | Get record |
| PATCH | `/attendance/:id` | teacher/center_admin | Edit (locked after 7 days) |

### Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/payments` | center_admin | List (filter: studentId, courseId, from, to) |
| POST | `/payments` | center_admin | Record payment |
| GET | `/payments/:id` | center_admin | Get payment |
| DELETE | `/payments/:id` | center_admin | Remove payment |
| GET | `/payments/:id/receipt` | center_admin | Download receipt |

### Expenses

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/expenses` | center_admin | List expenses |
| POST | `/expenses` | center_admin | Record expense |
| GET | `/expenses/:id` | center_admin | Get expense |
| PATCH | `/expenses/:id` | center_admin | Update |
| DELETE | `/expenses/:id` | center_admin | Delete |

### Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reports/revenue` | center_admin | Revenue report |
| GET | `/reports/expenses` | center_admin | Expense report |
| GET | `/reports/net-profit` | center_admin | Net profit (filter: from, to) |

### Dashboards

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboards/admin` | center_admin | Center overview stats |
| GET | `/dashboards/teacher` | teacher | Class/session/grade summary |
| GET | `/dashboards/student` | student | GPA, attendance, schedule, due |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | Any | List (unread first) |
| POST | `/notifications/:id/read` | Any | Mark one read |
| POST | `/notifications/read-all` | Any | Mark all read |
| POST | `/notifications/broadcast` | center_admin | Broadcast to roles |

### Reviews

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reviews` | Any | List (filter: courseId, teacherId) |
| POST | `/reviews` | student | Post review (requires ≥1 attendance) |
| PATCH | `/reviews/:id` | student | Edit own review |
| DELETE | `/reviews/:id` | student | Delete own review |

### Materials

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/materials` | Any | List course materials |
| POST | `/materials` | teacher | Upload material |
| DELETE | `/materials/:id` | teacher | Remove |
| GET | `/materials/:id/download` | Any | Cloudinary redirect |

### Parent Links

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/parent-links` | parent | List links |
| POST | `/parent-links` | parent | Link via family code |
| POST | `/parent-links/:id/approve` | parent | Approve |
| POST | `/parent-links/:id/reject` | parent | Reject/revoke |

### Teacher Affiliations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/affiliations/:id` | Any | Get affiliation |
| POST | `/affiliations/:id/accept` | teacher | Accept center invite |
| POST | `/affiliations/:id/decline` | teacher | Decline invite |

### Search & Discovery

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/search/centers` | Public | Search centers by location/subject |
| POST | `/search/courses` | Public | Search courses |
| POST | `/search/teachers` | Public | Search teachers |
| GET | `/teachers/:teacherId` | Public | Public teacher profile |

### Misc

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/subjects` | Public | List all subjects |
| GET | `/_ping` | Public | Health check → `{ data: "pong" }` |

---

## 10. Frontend Architecture

```
app/
  login/page.tsx          — Login form + quick-demo buttons
  page.tsx                — Root redirect (→ /login or /dashboard)
  dashboard/page.tsx      — Main SPA shell with sidebar + screen router
  api/                    — All Next.js Route Handlers
  layout.tsx              — Root HTML layout (fonts, metadata)

src/features/  (role/domain feature modules)
  ui.tsx                  — Shared primitives: Icon, Avatar, Badge, StatCard,
                            ProgressBar, ErrorState, SectionHeader
  admin-dashboard.tsx
  admin-students-screen.tsx
  admin-teachers-screen.tsx
  admin-classes-screen.tsx
  admin-fees-screen.tsx
  admin-reports-screen.tsx
  admin-enrollment-requests-screen.tsx   ← new
  teacher-dashboard.tsx
  teacher-classes-screen.tsx
  teacher-gradebook-screen.tsx
  student-dashboard.tsx
  schedule-screen.tsx
  assignments-screen.tsx
  grades-screen.tsx
  attendance-screen.tsx
  messages-screen.tsx                  ← mock data only
  parent-dashboard.tsx
  parent-progress-screen.tsx
  parent-fees-screen.tsx
  notifications-screen.tsx             ← new

lib/
  api/client.ts           — Ky HTTP client (prefix /api/v1, 401→/login hook)
  auth/
    options.ts            — NextAuth CredentialsProvider config (JWT, 30-day)
    session.ts            — getSessionUser() / requireSession()
  authz/
    require-role.ts        — Role guard (throws 403 if wrong role)
    require-center-scope.ts — Center tenancy guard
  db/
    connect.ts            — Mongoose singleton connection
    models/               — 23 Mongoose models (see §11)
  errors/
    classes.ts            — AuthError, NotFoundError, ForbiddenError, etc.
    http.ts               — AppError → HTTP response mapper (withErrors wrapper)
  http/envelope.ts        — ok() / fail() response helpers
  store/                  — 16 Zustand stores (one per screen/domain)
  services/               — Business logic layer
  mock-data.ts             — Nav config, role colors, mock fallback data
  constants/subjects.ts   — Subject list
```

### State management pattern

Each screen has a matching Zustand store in `lib/store/`. Stores:
- Call `lib/api/client.ts` (ky) against `/api/v1/*`
- Manage `{ data/items, isLoading, error }` state
- Provide action methods (`fetch*`, `create*`, `update*`, `delete*`)

```typescript
// Example
const { students, isLoading, error, fetchStudents } = useStudentsStore();
useEffect(() => { fetchStudents(); }, [fetchStudents]);
```

### Auth flow

```
1. User opens /           → redirects to /login (or /dashboard if cached)
2. /login                 → POST /api/v1/auth/login
3. On success             → cookie set + localStorage.edura_state = {role, name, email}
                          → router.push("/dashboard")
4. /dashboard             → reads localStorage for instant render
                          → calls GET /api/v1/me to verify + refresh real name
                          → on 401 → redirects to /login
5. Any API call 401       → api client hook clears cache, redirects to /login
6. Sign Out               → POST /api/auth/signout + clear localStorage → /login
```

### Role → UI mapping

```typescript
// lib/mock-data.ts
ROLES = {
  student:  { nav: [dashboard, schedule, assignments, grades, attendance, messages, notifications] }
  teacher:  { nav: [dashboard, classes, attendance, grades, assignments, messages, notifications] }
  parent:   { nav: [dashboard, progress, attendance, fees, notifications] }
  admin:    { nav: [dashboard, students, teachers, classes, fees, reports, requests, notifications] }
}
```

---

## 11. Backend Architecture

### Database models (23 collections)

| Model | Collection | Key fields |
|---|---|---|
| User | users | email, role, passwordHash, status (active/shell/suspended/deleted), locale |
| StudentProfile | studentprofiles | userId, familyLinkCode |
| TeacherProfile | teacherprofiles | userId, subjects[], ratingAvg, ratingCount |
| ParentProfile | parentprofiles | userId |
| CenterAdminProfile | centeradminprofiles | userId, centerId |
| Center | centers | name, shortId, address, location (GeoJSON), receiptSeq |
| Room | rooms | centerId, name, capacity |
| Course | courses | centerId, teacherId, title, subject, schedulePattern, price, maxStudents, status |
| Session | sessions | courseId, date, startTime, endTime, status (scheduled/completed/cancelled/postponed) |
| Enrollment | enrollments | studentId, courseId, centerId, status (active/unenrolled) |
| EnrollmentRequest | enrollmentrequests | studentId, courseId, status (pending/approved/declined/expired), expiresAt (+14d) |
| CenterStudentRoster | centerstudentrosters | centerId, studentId, blacklisted, blacklistReason |
| CenterTeacherAffiliation | centerteacheraffiliations | centerId, teacherId, status (pending/active/declined/removed) |
| ParentStudentLink | parentstudenlinks | parentId, studentId, status (pending/approved/rejected/revoked) |
| AttendanceRecord | attendancerecords | sessionId, studentId, status (present/absent/excused) — locked after 7 days |
| Grade | grades | courseId, teacherId, name, maxScore, date, scores[{studentId, score}] |
| Payment | payments | centerId, studentId, courseId, amount (piastres), receiptNumber |
| Expense | expenses | centerId, amount (piastres), category, expenseDate |
| Material | materials | courseId, title, type, cloudinaryPublicId, cloudinaryUrl |
| Review | reviews | studentId, teacherId, rating (1-5), text — unique (studentId, teacherId) |
| Notification | notifications | userId, type, title, body, read |
| InviteToken | invitetokens | email, tokenHash, purpose, centerId, expiresAt |
| UserDeviceToken | userdevicetokens | userId, token (FCM), platform |

### Money convention

All monetary values are stored as **signed integers in piastres** (1 EGP = 100 piastres).
`price: 80000` = EGP 800.00. Never use floats.

### Time convention

Session times stored as `"HH:mm"` strings (e.g. `"08:30"`). Lexicographically sortable. Never parse to Date.

### Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `validation_error` | Zod parse failure |
| 401 | `unauthenticated` | No/expired session |
| 403 | `forbidden` | Wrong role or center scope |
| 404 | `not_found` | Resource missing |
| 409 | `conflict` | Duplicate enrollment, etc. |
| 410 | `expired` | Token/request expired |
| 422 | `business_rule` | Blacklisted, over capacity, etc. |
| 429 | `rate_limited` | Too many login attempts |
| 500 | `internal` | Unexpected error |

### Route conventions

- Every handler wrapped in `withErrors()` — maps AppError subclasses to HTTP
- Every handler exports `const dynamic = "force-dynamic"` (MongoDB per-request)
- Response always: `ok(data)` or `fail(status, code, message)`
- Auth guards: `requireRole("center_admin")` or `getSessionUser()` + manual check

---

## 12. Known Gaps & Deferred Work

### No backend (mock-only screens)
- **Messages** — all 4 roles have a Messages nav item backed by `lib/mock-data.ts`. No messages API exists. Keep for visual demo; hide or build post-demo.

### API-only (no frontend screen)
These endpoints exist and work but have no UI:
- Teacher attendance marking per session (`POST /sessions/:id/attendance`)
- Materials upload/download
- Center registration flow (`POST /auth/register/center`)
- Teacher self-invite acceptance (`POST /affiliations/:id/accept`)
- Expenses management
- Parent–student manual linking via family code (needs UI flow)
- Center admin management (`/centers/me/admins`)

### Minor data shape notes
- `GET /courses` now returns `enrolledCount` (added)
- `GET /enrollments` now supports `?studentId=me` and populates `courseName` + `schedulePattern` (fixed)
- Gradebook: `GradeEntry.title` mapped from `Grade.name` (backend uses `name`, UI uses `title`)
- `schedulePattern.daysOfWeek` is `number[]` (0=Sun…6=Sat) — not string[]

---

## 13. Deployment (Netlify)

```toml
# netlify.toml
[build]
  command = "bun run build && bun run seed:deploy"
  publish = ".next"

[build.environment]
  BUN_VERSION = "1.3.12"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### Required Netlify environment variables

Set these in Netlify UI → Site Settings → Environment Variables:

```
MONGODB_URI        = <Atlas connection string>
MONGODB_DB         = edura
NEXTAUTH_SECRET    = <32-byte random string>
NEXTAUTH_URL       = https://<your-netlify-domain>
APP_BASE_URL       = https://<your-netlify-domain>
MAIL_PROVIDER      = console
MAIL_FROM          = no-reply@yourdomain.com
SEED_PASSWORD      = Passw0rd!
```

`seed:deploy` runs automatically after each build. It's idempotent — safe.

---

## 14. Testing

### Quick smoke test (manual)

```bash
# 1. Confirm server is healthy
curl http://localhost:3002/api/v1/_ping
# → {"data":"pong"}

# 2. Login as admin
curl -s -c cookies.txt -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nile-academy.eg","password":"Passw0rd!"}' | jq .

# 3. Use the cookie for authenticated requests
curl -s -b cookies.txt http://localhost:3002/api/v1/dashboards/admin | jq .
curl -s -b cookies.txt http://localhost:3002/api/v1/roster/students | jq .
curl -s -b cookies.txt "http://localhost:3002/api/v1/reports/net-profit" | jq .
```

### E2E & integration tests

```bash
# Playwright UI/e2e suite (tests/playwright/*.spec.ts)
bun run test:pw
bun run test:pw:headed          # watch it drive a browser
bun run test:pw:ui              # Playwright UI mode

# Live-DB integration suites (money distribution, refund, offline-sync,
# RBAC/RLS isolation) — needs DATABASE_URL + ADMIN_URL/DIRECT_URL
bun run test:db:all

# Money-math unit tests (vitest)
bun run test:unit

# Role-based API smoke test (bash + curl)
bun run smoke:api
```

### Portal smoke checklist

After seeding, verify each portal end-to-end:

**Admin (`admin@nile-academy.eg`)**
- [ ] Dashboard: student/teacher/course counts are non-zero
- [ ] Students: list loads, blacklist a student and un-blacklist
- [ ] Teachers: list loads, invite button shows form
- [ ] Classes: list loads with `enrolledCount`, cancel a course → status changes
- [ ] Fees: payments table loads, revenue/expenses summary shows numbers
- [ ] Reports: chart renders with 6 months of data, course breakdown shows percentages
- [ ] Enrollment Requests: 3 pending requests shown, approve one, decline one with reason
- [ ] Notifications: 2 unread items, mark one read, mark all read

**Teacher (`hossam.aziz@nile-academy.eg`)**
- [ ] Dashboard: stats load (active students, today's sessions)
- [ ] My Classes: courses list loads, expand to see sessions
- [ ] Cancel session: pick a scheduled session, cancel with reason → status updates
- [ ] Gradebook: table loads without error, student scores visible, edit and save
- [ ] Notifications: items show

**Student (`lina.hassan@student.nile-academy.eg`)**
- [ ] Dashboard: GPA > 0, attendance % > 0, today's schedule has items
- [ ] Schedule: courses listed, sessions visible
- [ ] Grades: grade entries with scores shown
- [ ] Attendance: summary shows present/absent counts
- [ ] Notifications: items show

**Parent (`mona.hassan@email.eg`)**
- [ ] Dashboard: child selector shows "Lina Hassan"
- [ ] Child Progress: grades by subject visible, attendance rate > 0
- [ ] Fees: payment history for Lina
- [ ] Notifications: items show

**All roles**
- [ ] Sign Out → lands on `/login`
- [ ] Refresh `/dashboard` without logging in → redirects to `/login`
