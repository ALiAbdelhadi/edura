# API endpoint inventory — 2026-09-27

Appendix to [api-performance-audit.md](api-performance-audit.md). Snapshot taken BEFORE the performance batches; query counts here are the "before" figures. Per endpoint: method, route, handler, auth, DB queries per request, callers and trigger frequency, shared vs user-specific data.


---

## Inventory — center/centers/rooms/dashboards/reports (~67 routes)

Scope: `apps/erp/src/app/api/v1/{center,centers,rooms,dashboards,reports}/**` + services they call.
Method: full dump + read of all 71 route.ts files (see `all-routes.txt` in this dir), full reads of the
heaviest services (`reports.ts`, dashboard routes, `checkin.ts`, `center-wallet.ts`, `counter.ts`,
`gaps.ts`, `subscriptions.ts` money/cron paths, `shifts.ts`, `center-audit.ts`, `blacklist.ts`,
`agreements.ts`), grep-triage of the rest, and caller tracing for the 3 dashboards + checkin/counter.

## Problems ranked

1. **`dashboards/admin` — 7 parallel `scopedDb()` transactions, ~23+ queries/request.**
   `packages/server-core/src/services/reports/reports.ts:812-976` (`getAdminDashboard`), route
   `apps/erp/src/app/api/v1/dashboards/admin/route.ts`. `Promise.all` of 7 branches, each its own DB
   transaction/connection: the "base" branch alone runs 13 **sequential** (non-batched) queries
   (`enrollment.count`, `course.groupBy`, `course.count`, `session.findMany`, 2x `aggregate`,
   `enrollmentRequest.count`, 2x `attendanceRecord.count`, `teacherProfile.findMany`, conditional
   `course.findMany`/`aggregate`/`enrollment.count`); plus `countFeeDefaulters` (978-1009, own
   scopedDb + **unbounded** `enrollment.findMany`, no `take`), `getRevenueTimeseries`,
   `getSessionStatusMix`, `getAttendanceByCourse`, `getCourseFillRates`, `getEnrollmentFunnel` — each
   its own scopedDb. Hit on **every mount + every window-focus** (staleTime 0). Fix: one transaction,
   batch the base branch's 13 queries with `Promise.all`, fold the 6 satellite calls in as `Promise.all`
   inside the same tx instead of 7 separate connections.

2. **`dashboards/admin` frontend re-fetches session data the endpoint already returns, and the
   endpoint returns full session rows just to report a count.** `apps/erp/src/features/admin/admin-dashboard.tsx:48-61,93,143`:
   `useCustom({url:"dashboards/admin"})` returns `todaySessions: unknown[]` (full `session.findMany`
   rows, `reports.ts:829-ish`) but the component only reads `d.todaySessions.length` (line 93) for a
   metric count — the actual session objects are unused. The component then does a **second**,
   independent `useList({resource:"sessions", from: day-6, to: day, pagination:"off"})` (line 54-61)
   to get real session rows for clash/settlement/live-now logic. Fix: have `getAdminDashboard` return
   a count, not rows, for `todaySessions`; the frontend's own week-range fetch already covers today.

3. **`teacher-dashboard.tsx` fans out one HTTP+DB request per session shown — real N+1 at the network
   layer.** `apps/erp/src/features/teacher/teacher-dashboard.tsx:61-79,221-227`: `todaySessions.map(s =>
   <CounterOnlyProbe id=... />)`, and each `CounterOnlyProbe` independently calls
   `useCustom({url: "sessions/${id}/attendance"})`. On a day with N sessions this is N extra
   requests + N extra DB round-trips, refetched on every mount/focus. Fix: one batched endpoint
   (`sessions/attendance?ids=...`) or fold counter-only counts into `getTeacherDashboard`'s existing
   `todaySessions` query (it already reads AttendanceRecord aggregates for the day, `reports.ts:1011-1113`).

4. **`getTeacherDashboard`** — `reports.ts:1011-1113`, route `dashboards/teacher/route.ts`. Same
   "many separate scopedDb transactions" pattern as #1, smaller: base branch (6 queries) +
   `getTeacherGradeLoad`/`getTeacherAttendanceTrend`/`getTeacherScoreDistribution`, each its own
   scopedDb — 4 transactions, ~12-15 queries/request total. Frontend (teacher-dashboard.tsx:90-112)
   additionally runs 4 more independent fetches on the same screen (`useList` sessions -30d/+14d,
   `useList` courses unbounded/no pagination, `useCustom` me/affiliations, `useCustom` teacher/wallet)
   — `activeCourses`/`todaySessions` already come back from `dashboards/teacher` itself, so the
   `courses` and `sessions` useList calls substantially overlap the dashboard payload.

5. **`dashboards/student` — ~11 sequential queries in one scopedDb + an uncoordinated extra call, plus
   an unbounded frontend re-fetch of ALL the student's sessions.** Route
   `apps/erp/src/app/api/v1/dashboards/student/route.ts` (135 lines): sequential (not `Promise.all`)
   enrollments/courses/todaySessions(+enrichSessions' 4 queries)/upcomingSessions/2x attendance
   count/grades, then `getStudentGradeTrend(user)` called **outside** that transaction (its own
   scopedDb). Frontend `apps/erp/src/features/student/student-dashboard.tsx:141-147` additionally runs
   `useCustom("me/wallet")` (fine, distinct data) **and** `useList({resource:"sessions",
   studentId:"me", pagination:"off"})` with **no date range at all** — unlike admin/teacher's bounded
   windows, this fetches the student's entire session history unbounded, largely duplicating
   `todaySessions`/`upcomingSessions` already in the dashboard payload.

6. **`countFeeDefaulters`** — `reports.ts:978-1009`. `tx.enrollment.findMany({where:{centerId,
   status:"active"}})` has no `take` — unbounded scan of every active enrollment in the center,
   run as part of every `dashboards/admin` request (#1). (The `for` loops after it are in-memory
   Map iteration only — not a query-per-row N+1, verified.)

7. **`lookupStudents`** — `packages/server-core/src/services/attendance/checkin.ts:43-153`, route
   `center/checkin/lookup/route.ts` (counter search, confirmed fired on explicit submit/scan, NOT
   per-keystroke). First query, `centerStudentRoster.findMany({where:{centerId, leftAt:null}})`, has
   no `take` — unbounded per search. Second query filters with `contains` on `searchText` and
   `user.phone` — SQL `LIKE %x%`, cannot use a standard btree index; candidate for pg_trgm/GIN if
   center rosters get large.

8. **`setManualGradeScores`** — `packages/server-core/src/services/external-teachers/manual-grades.ts:~78-147`,
   route under `center/external-teachers/[teacherId]/grades/[gradeId]/scores`. Per-student
   `tx.gradeScore.upsert` inside a `for` loop — bounded to 500 by schema (`scoresSchema.max(500)`)
   but still up to 500 sequential DB round-trips in one write request.

9. **`apps/erp/src/app/api/v1/rooms/route.ts` GET`** — `room.findMany({where:{centerId,isActive:true}})`,
   no `take`. Low severity in practice (room counts per center are small) but no ceiling exists.

10. **`center/shifts` `methodBuckets`** — `packages/server-core/src/services/center/shifts.ts:28`,
    `tx.payment.findMany({where:{shiftId}})` with no `take`, used by `shifts/current` and
    `shifts/[id]/close`. Bounded by "one shift's payments" in practice; flag only if shifts run very
    long without closing.

## Verified NOT problems (checked, avoid re-flagging)
- `report-export.ts` reuses the exact same `reports.ts` functions as the live screens — upholds the
  binding "no second set of books" invariant.
- `enrichSessions` (`apps/erp/src/lib/services/sessions/enrich.ts`) batches via `Promise.all` — 4
  queries regardless of session count, not N+1.
- `finance/center-wallet.ts` — fully clean: bounded, cursor/`take`-paginated, row-locked
  (`requestCenterPayoutTx` uses `FOR UPDATE` + idempotency key).
- `attendance/counter.ts` (`listCounterSessions`, `counterRoster`) — well-batched via `Promise.all`.
- `external-teachers/gaps.ts` `buildGapReport` — loops are in-memory only after batched `groupBy`.
- `center/checkin/lookup` and `center-counter-screen.tsx` — confirmed NOT keystroke-fired (submit/scan
  only) and NOT polling (no `refetchInterval`/`setInterval` found).
- `center/audit-logs*` (`center-audit.ts` `listCenterAuditActors`/`listCenterAuditActions`) — already
  `take: 200`, my first grep pass missed the `take` on a later line; false alarm on re-read.
- `subscriptions.ts` `listMySubscriptions` (bounded `take:100` + 1 batched course lookup) and
  `expireSubscriptions` (cron, out of route-scope anyway) — cursor-paginated in 2000/500 batches, a
  good pattern.
- `center/staff.ts`, `center/admins.ts`, `finance/agreements.ts` — unbounded `findMany`s exist but over
  inherently small per-center lists (staff, admins, agreements); not worth flagging.
- Out of my assigned scope (confirmed via caller grep, excluded): `center/roster.ts` real N+1 at
  line 475 (only called by `/api/v1/roster/**`), `finance/distribution.ts` per-item counts at
  153/181 (only called by `/api/v1/sessions/**`).

## Inventory table

The 67 route.ts files are overwhelmingly thin wrappers: auth/role check → parse → one service call →
`ok()`. Detailed rows below for every route with a real finding or non-trivial query count; the rest
are grouped by directory with their verified shape (all read in full via `all-routes.txt`).

| Method | Route | Handler file | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | dashboards/admin | `dashboards/admin/route.ts` | Center admin home KPIs | center_admin | **~23+**, 7 parallel scopedDb tx | `admin-dashboard.tsx` mount+focus | per-tenant | #1, #2, #6 |
| GET | dashboards/teacher | `dashboards/teacher/route.ts` | Teacher home KPIs | teacher | ~12-15, 4 scopedDb tx | `teacher-dashboard.tsx` mount+focus | per-tenant/user | #3, #4 |
| GET | dashboards/student | `dashboards/student/route.ts` | Student home KPIs | student | ~11 sequential + 1 extra tx | `student-dashboard.tsx` mount+focus | per-user | #5 |
| GET | dashboards/admin/checklist | `dashboards/admin/checklist/route.ts` | Setup checklist | center_admin | 4, batched `Promise.all` (`center-checklist.ts:15`) | `setup-checklist.tsx` mount | per-tenant | none |
| GET | reports/revenue, /expenses, /net-profit, /revenue-timeseries, /expenses-timeseries, /course-fill-rates, /attendance-by-course, /enrollment-funnel | `reports/*/route.ts` | Report screens | center_admin | 1-2 each (single `reports.ts` fn, own scopedDb) | report screens, mount+filter change | per-tenant | none (each recomputes on filter change — expected, not cached, correctly so per brief: no shared cache on tenant data) |
| GET/POST | reports/export | `reports/export/route.ts` → `report-export.ts` | CSV/print export | center_admin | same as source report (reused fn) | export button, click | per-tenant | none — upholds invariant |
| GET | center/checkin/lookup | `center/checkin/lookup/route.ts` → `checkin.ts:lookupStudents` | Counter student search | center_admin/staff | 3 sequential | `admin-checkin-screen.tsx` / `center-counter-screen.tsx`, submit/scan | per-tenant | #7 |
| POST | center/checkin | `center/checkin/route.ts` | Commit check-in | center_admin/staff | goes through `counterCheckin` (per counter-board invariant) | counter board, click | per-tenant/money-adjacent | none found |
| GET | center/checkin/suggest | `center/checkin/suggest/route.ts` | Suggest next student | center_admin/staff | small, bounded | counter board | per-tenant | none |
| GET | center/counter/roster, /sessions, /teachers | `center/counter/*/route.ts` → `counter.ts` | Counter board reads | center_admin/staff | 4-6 each, `Promise.all` batched | `center-counter-screen.tsx`, state-change driven (not polling) | per-tenant | none — well optimized |
| GET | center/audit-logs, /audit-logs/actors | `center/audit-logs*/route.ts` → `center-audit.ts` | Audit log viewer | center_admin | 2-3, `take:200` bounded | audit log screen, mount/filter | per-tenant | none |
| GET/POST/DELETE | center/blacklist, /blacklist/[id] | `center/blacklist*/route.ts` → `blacklist.ts` | Blacklist mgmt | center_admin | 2-6, batched; write-path per-admin notify loop is small (bounded to admin count) | blacklist screen | per-tenant | minor: `notifyOverCapacity` loop, low severity |
| GET/POST | center/shifts, /shifts/current, /shifts/[id], /shifts/[id]/close | `center/shifts*/route.ts` → `shifts.ts` | Cash shift mgmt | center_admin/staff | 2-4, incl. unbounded `payment.findMany` per shift | shift screens, mount/click | per-tenant/money | #10 (minor) |
| GET/POST | center/staff, /staff/[id], /staff/[id]/invite, /staff/me | `center/staff*/route.ts` → `staff.ts` | Staff CRUD | center_admin | 1-2 each, small unbounded lists (fine — inherently small) | staff screen | per-tenant | none |
| GET/POST | center/subscriptions | `center/subscriptions/route.ts` | List/manage subs | center_admin | 3 (`take:200` + 2 batched lookups) | subscriptions screen | per-tenant | none |
| GET/POST | center/credit, /credit/topup, /wallet-topup, /wallet, /wallet/payout-request, /wallet/payouts, /wallet/payouts/[id]/cancel, /wallet/transactions | `center/wallet*`, `center/credit*` → `center-wallet.ts` | Center wallet/payouts | center_admin | 1-2 each, cursor-paginated, `FOR UPDATE` locked | wallet screen | per-tenant/money | none — clean |
| POST | center/walk-in, /walk-in/resend | `center/walk-in*/route.ts` → `walk-in.ts` | Walk-in registration + WhatsApp | center_admin/staff | small, WhatsApp send — check it's queued not inline (not confirmed either way; not flagged without evidence) | counter, click | per-tenant | unconfirmed — worth a follow-up read of `walk-in.ts` send path |
| GET/POST/DELETE | center/external-teachers/** (11 routes) | `center/external-teachers/**/route.ts` → `external-teachers.ts`, `manual-students.ts`, `manual-grades.ts`, `gaps.ts`, `reconciliation.ts` | External-teacher admin | center_admin | mostly `Promise.all`-batched, 2-5 each | external teachers screen | per-tenant | #8 (`manual-grades.ts` scores write) |
| GET/POST | center/students/import, /students/[id]/guardian-contact, /temp-students | `center/students/**`, `center/temp-students/route.ts` → `bulk-import-students.ts` | Roster import / temp students | center_admin | per-row transactions (documented design per bulk-student-import decision) | import screen | per-tenant | none — by design |
| GET/POST | center/teacher-agreements | `center/teacher-agreements/route.ts` → `agreements.ts` | Agreement list/create | center_admin | 1-2, small unbounded list (fine) | agreements screen | per-tenant | none |
| GET/POST/DELETE | centers/me, /centers/me/admins*, /centers/me/logo, /centers/[id], /centers/[id]/rooms | `centers/**/route.ts` → `admins.ts`, `rooms.ts`/room-rate resolution | Center profile/admins/rooms | center_admin | 2-5 each | settings screens | per-tenant | none major |
| GET/POST/DELETE | rooms, /rooms/[id], /rooms/[id]/photos, /rooms/per-student-availability | `rooms/**/route.ts` → `rooms.ts`, `room-rate.ts` | Room CRUD/availability | center_admin | 1-3 each | rooms screen | per-tenant | #9 (rooms GET unbounded, minor) |

## Not fully verified (flag for the orchestrator, not confirmed as problems)
- `walk-in.ts` WhatsApp-send path: not read line-by-line; brief's "async work done inline" class
  (WhatsApp/email/PDF) should be checked there specifically — I did not confirm either way.
- Caller/trigger for the `center/external-teachers/**`, `centers/**`, `rooms/**` CRUD screens was
  inferred from route purpose, not individually traced to a component file for each of the ~30 routes
  in those groups — low risk (they're click/mount-driven CRUD, not loops), but not caller-verified line
  by line like the dashboards were.

---

## Inventory — me / parent / parent-links / guardian / notifications / messages / realtime / team-notes / materials / grades

## Table

| Method | Route | Handler file | Purpose | Auth/role | DB queries/req (approx) | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | /api/v1/me | `apps/erp/src/app/api/v1/me/route.ts:15` | Current user identity | any session | 1 (2-3 for assistant/staff role) | `useGetIdentity` in `dashboard-shell.tsx` (mount, every portal page); `session-integrity-guard.tsx:72` (event) | per-user | assistant role does 2 sequential `scopedDb` calls that could combine (L37-40) |
| PATCH | /api/v1/me | same file:79 | Update name/phone/locale | any session | 2-3 | profile forms | per-user | none major |
| GET | /api/v1/me/unread-counts | `me/unread-counts/route.ts:8` | Combined unread badge (messages+notifications+kids) | any | 2 base + up to 2×N for N minor children (sequential loop) | **NONE — dead code**, no frontend caller found (grep repo-wide; only tests + bruno + old audit doc reference it) | per-user | Dead endpoint; also has the N+1 below baked in unused |
| GET | /api/v1/notifications | `notifications/route.ts:10` | List/paginate notifications | any | 2 (findMany+count) | `dashboard-shell.tsx:177` unread badge (pageSize:1, **every nav, no freshness preset**, staleTime 0); `notifications-screen.tsx` full list | per-user | badge query re-runs full findMany+count on every route change across all portals (no `QUERY_FRESHNESS.list` applied) |
| POST | /api/v1/notifications/read-all | `read-all/route.ts:9` | Mark all read | any | 1 | notifications screen click | per-user | none |
| POST | /api/v1/notifications/[id]/read | `[id]/read/route.ts:9` | Mark one read | any | 2 (findFirst+update, not combined) | notification click | per-user | minor: 2 queries where 1 `updateMany` would do |
| POST | /api/v1/notifications/broadcast | `broadcast/route.ts:20` | Center admin broadcast | center_admin | course scope: 1 + fanout service; center scope: 1 findMany + **N parallel queries** (`Promise.all(studentIds.map(withParentFallback))` L44-46) + `notify()` inline | admin compose screen, click | per-tenant broadcast | **N+1 (parallel) on studentIds**; `notify()` awaited inline (push/webpush/email/SMS all synchronous — see cross-cutting below) |
| GET | /api/v1/parent/oversight/children | `parent/oversight/children/route.ts:9` | Parent's children + adult-conv counts | parent | **1 + N×(1-4) sequential**, N = # children (see below) | `oversight-screen.tsx:71`, mount (`useEffect`) | per-user | **Top N+1**: `listOversightChildren` (`packages/database/src/queries/chat-oversight.ts:64-72`) awaits `isMinorStudent` + `countAdultConversations` (itself 2-3 queries) **inside a `for` loop, not `Promise.all`** |
| GET | /api/v1/parent/oversight/children/[studentId]/conversations | `.../conversations/route.ts:9` | One child's adult conversations | parent | 4 (assert+adultPartnerIds 2q+findMany+groupBy) | oversight screen, click into a child | per-user | fine, batched with Promise.all |
| GET | /api/v1/parent/oversight/children/[studentId]/conversations/[id] | `.../[id]/route.ts:9` | Thread view | parent | ~4 | click | per-user | none major |
| POST/GET | /api/v1/parent-links | `parent-links/route.ts:20,38` | Create/list parent-student links | parent/student | init: 2-4; list: 2 | `parent-linking-screen.tsx` | per-user | `listLinks` unbounded `findMany` (no `take`), fine at current scale |
| DELETE | /api/v1/parent-links/[id] | `[id]/route.ts:9` | Revoke link | parent/student | ~2 | click | per-user | none |
| POST | /api/v1/parent-links/[id]/approve, /reject | `[id]/approve,reject/route.ts` | Approve/reject link | parent/student | ~2 | click | per-user | none |
| GET/POST | /api/v1/me/family-code, /rotate | `me/family-code/*route.ts` | Student's family link code | student | 1-2 | `student-family-code-screen.tsx` | per-user | none |
| POST | /api/v1/guardian/verify | `guardian/verify/route.ts:12` | Confirm guardian email token | public+rate-limited | delegates to `confirmGuardianEmail` (server-core, not read) | `guardian-verify-screen.tsx` | per-user | out of scope depth, rate-limited 10/60 already |
| GET/POST | /api/v1/messages | `messages/route.ts:16` | Send a DM | any | `sendMessage`: 1 (appendMessage, internally more) + `bridgeMessage` (socket) + **`notify()` awaited inline if recipient offline** | `use-chat.ts` send action, click/keystroke-enter | per-user | inline push/webpush/email dispatch blocks the HTTP response (see cross-cutting) |
| GET | /api/v1/messages/conversations | `conversations/route.ts:13` | List DM conversations | any | 2 (findMany conversations + findMany users) | `use-chat.ts`, mount | per-user | fine, no N+1 |
| GET | /api/v1/messages/conversations/[id] | `conversations/[id]/route.ts:9` | Thread + oversight notice | any | 4 (getConversationView 2 + listMessages 2 + oversightNoticeFor 1 = actually ~5) | open a thread, click | per-user | none major |
| POST | /api/v1/messages/conversations/[id]/read | | Mark read | any | 1 update + socket bridge | click/auto on open | per-user | none |
| GET | /api/v1/messages/contacts | `messages/contacts/route.ts:9` | "New conversation" people list | any | **~10-20** (see below) | `chat-screen.tsx` `NewConversationDialog`, dialog-open + debounced (300ms) keystroke | per-user | **Fan-out N+1**: `listContacts` (`packages/database/src/queries/chat-scope.ts:820`) loops 4-6 role "edges", each edge does 2-4 nested queries (e.g. `assistantsOfTeachers(await teachersOfStudents(...))`) — full fan-out re-runs on every debounced keystroke too |
| GET/POST | /api/v1/messages/groups | `groups/route.ts:10,32` | List/create chat groups | any | list: 1 (`listGroupsForUser`, not deep-read); create: several | `use-groups.ts`, mount | per-user | not deep-read (time-boxed) |
| GET/POST | /api/v1/messages/groups/[id] | `groups/[id]/route.ts` | Group thread / post | any | GET: `assertGroupAccess`+`listGroupMessages`+`count` = 3+; POST: `postToGroup` + **`notify()` inline** to all recipientIds | `chat-screen.tsx`, click | per-tenant group | inline notify fanout again |
| POST | /api/v1/messages/groups/[id]/mute, /read | | mute/mark read | any | 1 | `use-groups.ts:89,135` click | per-user | none |
| GET/POST/DELETE | /api/v1/messages/blocks | `blocks/route.ts` | Block list mgmt | any | 1 each | settings screen | per-user | none |
| POST | /api/v1/messages/reports | `reports/route.ts:26` | File safety report | any | `fileReport` (1-2) + `platformDb` findMany all `super_admin` (unbounded, but small table) + `notify()` inline to all admins | report dialog, click | platform-wide fanout | inline notify to N admins; low volume so low severity |
| GET | /api/v1/realtime/token | `realtime/token/route.ts:9` | Sign short-lived socket JWT | any | 1 (requireSession) | `use-chat.ts:209`, mount / socket reconnect | per-user | none (no DB work beyond session) |
| GET/POST | /api/v1/team-notes | `team-notes/route.ts:15,24` | Center/teacher to-do board | staff roles | GET: findMany(unbounded, `include: reads`) + conditional createMany(seen) + `resolveTeamMemberIds` + `nameMap` ≈ 4-5; **GET has a write side-effect** | `team-notes-board.tsx`, mount | per-tenant | unbounded `findMany` (no `take`/pagination) on an ever-growing board; GET mutates (marks "seen") — breaks cacheability |
| GET/PATCH/DELETE | /api/v1/team-notes/[id] | `team-notes/[id]/route.ts` | Update/delete a note | staff | ~2 | click | per-tenant | none major |
| GET/POST | /api/v1/materials | `materials/route.ts:11,20` | Course materials list/upload | any | GET: 1-3 (role-scoped enrollment lookups) + **unbounded `material.findMany({where})` with no `select`/`take`** (L224) | `student-subjects-screen.tsx` etc, mount | per-user/tenant | unbounded findMany, no select (pulls all columns incl. storage fields) |
| GET/PATCH/DELETE | /api/v1/materials/[id] | | Material detail ops | any | ~2 | click | per-user | none major |
| GET | /api/v1/materials/[id]/download | `materials/[id]/download/route.ts:9` | Signed download URL | any | findUnique + role-scoped check (1-2) | click | per-user | none |
| GET/POST | /api/v1/grades | `grades/route.ts:12,30` | List/create grades | any | GET: 1-2 (enrollment scoping) + **`grade.findMany({where, include:{scores:true}})` unbounded, no take** (`grades.ts:102`) + `course.findMany` for names (1) = 3-4 | `grades` resource (Refine `useList`) in grade screens | per-user/tenant | **Unbounded findMany + `include` of full `scores` relation** — for `center_admin` GET with no `courseId` filter this returns every grade AND every student score for the whole center in one uncapped response |
| GET/PATCH/DELETE | /api/v1/grades/[id] | | Grade detail ops | any | 1-2 | click | per-user | none major |
| PUT | /api/v1/grades/[id]/scores | `grades/[id]/scores/route.ts:18` | Bulk upsert scores | delegated teacher | `bulkUpsertScores` (not read in depth; name implies batched, likely fine) | teacher save action, click | per-tenant | not deep-reviewed (time-boxed) |

## Cross-cutting finding: notifications dispatched inline, not deferred

`packages/server-core/src/services/notifications/notify.ts` exports both `notify()`
(synchronous — does `await sendMail`, `await Promise.all(smsToUser)`,
`await Promise.all(pushToUser/webPushToUser)` before returning) and
`notifyAfterCommit()` (explicitly for use *after* a transaction, catches/logs
instead of propagating). Despite that split existing, every call site in this
scope's request path uses the **synchronous** `notify()`, not `notifyAfterCommit`:
- `apps/erp/src/lib/services/messages/messages.ts:145` (`sendMessage`, every DM send)
- `apps/erp/src/lib/services/messages/messages.ts:235` (`postToGroup`, every group post)
- `apps/erp/src/lib/services/messages/messages.ts:300` (`fileReport`)
- `apps/erp/src/app/api/v1/notifications/broadcast/route.ts:58` (broadcast to a whole center/course)

This means every chat message send / group post / broadcast blocks the HTTP
response on FCM + webpush + (for broadcast) potentially SMTP/SMS network calls
to every recipient, fully in the request path — the exact "async work done
inline" problem class from the brief.

## Notification read-state inconsistency (correctness, not perf, noted in passing)
`Notification` model (`packages/database/prisma/schema.prisma:1486`) has both a
`read: Boolean` and a `readAt: DateTime?` field. `notifications/route.ts` and
`read-all/route.ts` filter/write on `read`; `getUnreadCounts`
(`messages.ts:105`) counts on `readAt: null`. Both are kept in sync today by
`notify()`/`read-all` writing `read` only (readAt is never set anywhere found in
this scope) — worth a follow-up check outside this pass.

## Problems ranked (highest impact first)

1. **Sequential N+1, mount-triggered**: `listOversightChildren` (`packages/database/src/queries/chat-oversight.ts:64-72`) loops children with `await` per child (isMinorStudent + countAdultConversations, 1-4 queries each) inside a plain `for` loop — not `Promise.all`. Hit on every parent's oversight-screen mount (`apps/erp/src/features/parent/oversight-screen.tsx:71`).
2. **Fan-out N+1 on every contacts search**: `listContacts` (`packages/database/src/queries/chat-scope.ts:820-863`) loops 4-6 role-based "edges" per request, each 2-4 nested queries → ~10-20 DB round trips for one dialog open, re-run on every debounced keystroke (`apps/erp/src/features/messaging/chat-screen.tsx:916`).
3. **Inline notification dispatch in hot paths**: `notify()` (sync FCM/webpush/email/SMS) awaited directly inside `sendMessage`/`postToGroup`/`fileReport`/`broadcast`, despite `notifyAfterCommit` existing for exactly this purpose. Broadcast additionally does `Promise.all(studentIds.map(withParentFallback))` — an unbounded parallel N+1 (`notifications/broadcast/route.ts:44-46`) before the inline notify fanout.
4. **Unbounded `findMany` + full relation include**: `grades.ts:102` `grade.findMany({ where, include: { scores: true } })` — no `take`, no `select`; a center_admin loading grades without a `courseId` filter pulls every grade and every score for the whole center in one response.
5. **Unbounded `findMany`, no `select`**: `materials.ts:224` `material.findMany({ where })` — no pagination, all columns.
6. **Badge query never uses the freshness preset**: `dashboard-shell.tsx:177-181` `useList("notifications", {pageSize:1})` runs 2 DB queries (findMany+count) on *every* dashboard navigation across all portals, with default `staleTime: 0` — no `QUERY_FRESHNESS.list` (30s) applied, unlike the sibling `useNavBadges` call for enrollment-requests which does use `QUERY_FRESHNESS.list`.
7. **Dead endpoint carrying the same N+1**: `/api/v1/me/unread-counts` has zero frontend callers (repo-wide grep confirms) but bakes in the same sequential per-child loop as #1 inside `getUnreadCounts` (`messages.ts:112-117`) — either delete it or fix it before anything gets wired to it.
8. **`ChildSelector` (8 call sites) fetches `me-children` with no freshness preset** (`apps/erp/src/components/ui/child-selector.tsx:54-58`, `networkMode: "always"` only) — refetches the 3-query children list on every mount across 8 different parent screens; a good `QUERY_FRESHNESS.reference` (5m) candidate.
9. **Side-effecting GET**: `team-notes` GET (`team-notes.ts:64-87`) writes "seen" reads as a side effect of listing, plus an unbounded `findMany` with `include: { reads }` on an ever-growing board.
10. Minor: `notifications/[id]/read` does `findFirst` then `update` (2 queries) where a single scoped `updateMany` would do; `/me` GET for `assistant` role does 2 sequential `scopedDb` round trips that could combine into one query.

---

## Inventory — erp API scope (teacher, payments, auth, sessions, roster, search,
## enrollment-requests, enrollments, courses, collaboration-requests, temp-students,
## reviews, deletion-requests, affiliations, subscriptions, internal, expenses,
## catalog, subjects, security, door-checkin, cron, contact, attendance, teachers,
## _ping, plus apps/erp/src/app/api/{auth,health})

Cols: Method | Route | Handler | Purpose | Auth | DB queries/req (loops noted) | Callers+trigger | Data scope | Problem

## payments
| GET | /api/v1/payments | payments/route.ts | List payments | role-scoped | `listPayments()` payments.ts:136-203 — batched Promise.all, but **unbounded `findMany` line 167, no take** | grep: `usePaymentsList`-style hooks under components/*/payments* (not individually traced) | per-tenant | **unbounded findMany** |
| GET | /payments/[id] | [id]/route.ts | Get one payment | role-scoped | 1-2 | click-through from list | per-user | none |
| GET | /payments/[id]/receipt | receipt/route.ts | Get receipt | role-scoped | `getReceipt()` 2 | click | per-user | none |
| POST | /payments/initiate | initiate/route.ts | Start Paymob payment | role, `withRateLimit(30,30)` | `initiatePayment()` 2-4 | checkout click | per-user | none |
| POST | /payments/webhook | webhook/route.ts | Paymob HMAC callback | HMAC, `withRateLimit(120,120)` | `processWebhookEvent()` payment-intents.ts:376-547, sequential small tx, email/track deferred via `void` | Paymob server | system | none (low volume) |
| POST | /payments/intents/... (subscription intent) | payment-intents-related routes | Start subscription intent | role, rate-limited | `initiateSubscriptionIntent()` 2-4 | checkout | per-user | none |
| POST | (settle) | settle route | Settle intent | role | `settleIntentTx()` ~6 | webhook/flow | per-user | none |
| POST | (expire, cron-called) | expire route/service | Expire stale intents | cron secret | `expirePaymentIntents()` not deep-read | cron | system | not deep-dived |
| ... remaining 4 payments route files (mock/dev-mode helpers) | thin wrappers | role/rate-limited | 1-3 | n/a | per-user | none |

## sessions
| GET | /api/v1/sessions | sessions/route.ts:1-104 | List sessions | role-scoped | `enrichSessions()` batched (Promise.all + Map join) BUT **outer `tx.session.findMany` ~line 95 unbounded, no `take`, no default date bound for center_admin** | schedule/session-list screens (mount) | per-tenant | **unbounded findMany, esp. bad: no default from/to** |
| GET | /sessions/[id] | [id]/route.ts | Get one session | role-scoped | 2-3 | click | per-user | none |
| GET | /sessions/[id]/attendance | attendance/route.ts | Get attendance roster | role-scoped | `getSessionAttendance()` not deep-dived | attendance screen mount | per-tenant | not deep-dived |
| POST | /sessions/[id]/attendance | attendance/route.ts | Bulk mark attendance | role-scoped | `bulkMarkAttendance()` not deep-dived | counter/attendance UI submit | per-tenant | not deep-dived |
| POST | /sessions/[id]/cancel | cancel/route.ts | Cancel session | role-scoped | `cancelSession()` not deep-dived | click | per-tenant | not deep-dived |
| POST | /sessions/[id]/complete | complete/route.ts | Complete + settle | role-scoped | `completeSession()` not deep-dived (calls settlement engine) | click | per-tenant | not deep-dived |
| GET | /sessions/[id]/settlement-preview | settlement-preview/route.ts | Preview payout split | role-scoped | `previewSessionSettlement()` not deep-dived | pre-complete UI | per-tenant | not deep-dived |
| POST | /sessions/[id]/postpone | postpone/route.ts | Postpone session | role-scoped | `postponeSession()` not deep-dived | click | per-tenant | not deep-dived |
| POST | /sessions/[id]/attendance/reopen | reopen/route.ts | Reopen attendance window | role-scoped | `reopenAttendanceForSettlement()` not deep-dived | click | per-tenant | not deep-dived |

## roster
| GET | /roster/teachers | teachers/route.ts | List center's teachers | center_admin/staff | **N+1 — `listRosterTeachers()` roster.ts:447-511: 3 batch queries then loop `for (const a of affiliations)` running `course.findMany` + `review.aggregate` PER TEACHER (roster.ts:475-491)** | roster screen mount | per-tenant | **N+1, 3+2N queries for N teachers** |
| GET | /roster/students | students/route.ts | List center's students | center_admin/staff | `listRosterStudents()` roster.ts:29-107 — well-batched (`enrollment.groupBy`), **unbounded (no take)**, lower priority (naturally capped by center size) | roster screen mount | per-tenant | unbounded findMany (low severity) |
| GET | /roster/students/[studentId] | [studentId]/route.ts | Get one roster student | center_admin/staff | 2-4 | click | per-tenant | none |
| GET | /roster/teachers/lookup | teachers/lookup/route.ts | Teacher lookup by code/query | staff, `withRateLimit(20,20)` | 1-2 | counter search | per-tenant | none |
| GET | /roster/students/lookup | students/lookup/route.ts | Student lookup by code/query | staff, `withRateLimit(20,20)` | 1-2 | counter search | per-tenant | none |
| POST | /roster/teachers/invite | invite/route.ts | Invite teacher to center | center_admin | not deep-dived | invite form submit | per-tenant | not deep-dived |
| PATCH/DELETE | /roster/teachers/[teacherId] | [teacherId]/route.ts | Update/remove affiliation | center_admin | not deep-dived | click | per-tenant | not deep-dived |
| POST | /roster/students/invite | invite/route.ts | Invite/register student to center | center_admin | not deep-dived | invite form submit | per-tenant | not deep-dived |

## search
| GET | /search | search/route.ts | Global ⌘K search | session | `globalSearch()` 735 lines, well-bounded (`take`/`.slice` caps throughout) | `use-global-search.ts` hook via `dashboard-shell.tsx` — **debounced 220ms, MIN_LENGTH 2, staleTime 30s, retry:false — CONFIRMED GOOD** | per-user | none |
| GET | /search/teacher-days | teacher-days/route.ts | Find teacher by day (discovery) | public, cached | `searchTeachersByDayCached()` | landing/discovery UI | shared (cached, correctly excluded) | none |
| GET | /search/centers | centers/route.ts | Center discovery search | public, `withPublicCache` | cached | discovery UI | shared (cached) | none |
| GET | /search/teachers | teachers/route.ts | Teacher discovery search | public, `withPublicCache` | cached | discovery UI | shared (cached) | none |
| GET | /search/courses | courses/route.ts | Course discovery search | public, `withPublicCache` | cached | discovery UI | shared (cached) | none |

## courses
| GET | /api/v1/courses | courses/route.ts:43-146 | List courses (role-scoped or public browse) | optional session (public `centerId` browse path, no rate limit) | well-batched (Promise.all groupBy/teacher/room) BUT **`tx.course.findMany({where})` line 102 unbounded, no take**; public-browse path (line 85-90) has **no `withRateLimit` wrapper**, unlike /search/* | course list screens + public center-profile page | per-tenant / **public unauthenticated for centerId browse** | **unbounded + unrate-limited on a public path — scrape/cost risk** |
| POST | /api/v1/courses | courses/route.ts:201-226 | Create course (center or teacher-direct) | center_admin or teacher | `createCourse`/`createTeacherDirectCourse` (courses.ts, not fully read) → `generateSessionsTx` → **`session-generator.ts` ~line 69: `for (const date of dates) { await checkConflicts(tx,...) }` — per-occurrence query loop, 100+ queries possible for a full-year multi-weekly course** | create-course form submit | per-tenant | **N+1 on write path (course creation)** |
| GET/PATCH | /courses/[id] | [id]/route.ts | Get/update one course | role-scoped | not deep-dived (138 lines) | click/edit form | per-tenant | not deep-dived |
| POST | /courses/[id]/cancel | cancel/route.ts | Cancel course | role-scoped | not deep-dived | click | per-tenant | not deep-dived |
| POST | /courses/[id]/reassign-teacher | reassign-teacher/route.ts | Reassign teacher | center_admin | not deep-dived | click | per-tenant | not deep-dived |

## enrollment-requests
| GET | /enrollment-requests | route.ts:17-81 | List pending/handled requests | role-scoped | **unbounded `tx.enrollmentRequest.findMany` line 39, no take**; also performs a **write (`updateMany` auto-expire) inside the GET handler** (lines 45-49) — read-path side effect | requests inbox mount | per-tenant | **unbounded findMany + write-in-GET** |
| POST | /enrollment-requests | route.ts:87-160 | Create request | role | ~6-7 sequential validation queries | request form submit | per-tenant | none (write endpoint, acceptable) |
| GET/PATCH | /enrollment-requests/[id] | [id]/route.ts | Get/update one request | role-scoped | not deep-dived | click | per-tenant | not deep-dived |
| POST | /enrollment-requests/[id]/approve | approve/route.ts | Approve request | role-scoped | not deep-dived | click | per-tenant | not deep-dived |
| POST | /enrollment-requests/[id]/decline | decline/route.ts | Decline request | role-scoped | not deep-dived | click | per-tenant | not deep-dived |

## enrollments
| GET | /enrollments | route.ts:17-126 | List enrollments (role-scoped) | role | well-batched Map-join pattern BUT **unbounded `tx.enrollment.findMany` line 69, no take** | enrollment list screens | per-tenant | **unbounded findMany** |
| POST | /enrollments | route.ts | Enroll student | role | thin wrapper → `enrollStudent()` not deep-dived | enroll form submit | per-tenant | not deep-dived |
| GET/PATCH | /enrollments/[id] | [id]/route.ts | Get/update one enrollment | role-scoped | not deep-dived | click | per-tenant | not deep-dived |

## collaboration-requests
| GET/POST | /collaboration-requests | route.ts (67 lines) | List/create collab requests | role | thin wrapper → `collaboration.ts` service, not deep-dived | collab requests screen | per-tenant | not deep-dived |
| POST | /collaboration-requests/[id]/cancel | cancel/route.ts | Cancel request | role | not deep-dived | click | per-tenant | not deep-dived |
| POST | /collaboration-requests/[id]/accept | accept/route.ts | Accept → creates class/schedule | role | not deep-dived (likely calls session-generator, same N+1 risk as course creation) | click | per-tenant | not deep-dived (possible session-generator N+1 reuse) |
| POST | /collaboration-requests/[id]/reject | reject/route.ts | Reject request | role | not deep-dived | click | per-tenant | not deep-dived |

## temp-students
| POST | /temp-students | route.ts | Counter creates walk-in temp student | teacher/assistant (`delegatedWithCenter`) | thin wrapper → `createTempStudent()`, not deep-dived | counter walk-in form | per-tenant | not deep-dived |
| POST | /temp-students/claim | claim route | Claim temp student into real account | token | not read | onboarding link | per-user | not read |
| POST | /temp-students/[id]/send-invite | send-invite route | Resend invite | role | not read | click | per-tenant | not read |

## reviews
| GET | /reviews | route.ts:12-32 | List reviews (paginated) | session | `listReviews()` — **paginated (page/limit params, meta.total returned) — GOOD, not flagged** | reviews list mount | per-user/tenant | none |
| POST | /reviews | route.ts:41-48 | Create review | student, `invalidatesPublicData` | `createReview()` not deep-dived, low query count expected | post-lesson review form | per-user | none |
| GET | /reviews/eligible | eligible/route.ts | Teachers eligible for review | student | `getEligibleTeachers()` 1-2 | review form load | per-user | none |
| GET | /reviews/teacher/[teacherId] (public profile) | teachers/[teacherId]/route.ts (public) | Public teacher profile w/ rating | public, `withPublicCache(discovery)` | cached | public teacher page | shared (cached) | none |

## deletion-requests
| GET | /deletion-requests | route.ts | List deletion requests | center_admin | `listDeletionRequests()` not deep-dived, filtered by status, likely bounded by center size | admin screen mount | per-tenant | not deep-dived (low risk, small table) |
| (other 2 files: create/approve-style actions) | not read | center_admin | not read | click | per-tenant | not read |

## affiliations
| DELETE | /affiliations/[id] | [id]/route.ts | Teacher leaves center | teacher (`delegated`) | 3 queries (findUnique, count, update) in one `scopedDb` tx | click | per-user | none |
| (2 other affiliations files: list/accept-style) | not individually read | role | not read | — | per-tenant | not read |

## subscriptions
| POST | /subscriptions/checkout | checkout/route.ts | Start subscription checkout | student/parent, `withRateLimit(30,30)` | `createSubscriptionCheckout()` + `initiateSubscriptionIntent()`, not deep-dived internals but bounded by 1 subscription/course | checkout button | per-user | none |
| POST | /subscriptions/[id]/cancel | [id]/cancel/route.ts | Cancel pending subscription | student/parent | `cancelPendingSubscription()` 1-3, not deep-dived | click | per-user | none |

## internal
| POST | /internal/chat-notify | chat-notify/route.ts | Server-to-server: notify chat msg recipient | `INTERNAL_API_SECRET` | 2 sequential `platformDb` round trips (message lookup, then sender lookup) — could combine into 1 query w/ `select` on sender relation, but low volume (per-message from realtime server) | apps/realtime chat server | system | minor (2 seq. queries, could be 1 via join) |
| POST | /internal/revalidate | revalidate/route.ts | Server-to-server: bust public cache tags | `INTERNAL_API_SECRET` | 0 DB queries (in-memory `invalidatePublicData`) | apps/superadmin `erp-revalidate.ts` after writes | system | none |

## expenses
| GET | /expenses | route.ts:12-24 | List center expenses | accountant (`centerStaff`, allow ACCOUNTANT) | `listExpenses()` not deep-dived, filtered by category/from/to; likely unbounded findMany (not confirmed) | expenses screen mount | per-tenant | possible unbounded (not confirmed — service not read) |
| POST | /expenses | route.ts:33-38 | Create expense | center_admin | `createExpense()` 1-2 | expense form submit | per-tenant | none |
| PATCH/DELETE | /expenses/[id] | [id]/route.ts | Update/delete expense | center_admin | 1-2 each | click | per-tenant | none |

## catalog
| GET | /catalog/tree | tree/route.ts | Full systems/stages/grades/tracks tree | session | `getCatalogTree()` — reference data, small, not flagged (effectively static) | onboarding/track picker mount | shared reference data | none |
| GET | /catalog/subjects | subjects/route.ts | Subject list by grade/track/mine | session | 1-2 depending on branch (all/mine/gradeLevelIds/trackId) | subject picker | shared/per-user | none |

## subjects
| GET | /subjects | route.ts | All active subjects | none (`platformDb`, no auth check!) | 1 query, `orderBy sortOrder` | subject dropdowns | shared reference data | note: **no `requireSession()` — unauthenticated reachable**, but data is non-sensitive reference data + no rate limit; low severity |

## security
| POST | /security/csp-report | csp-report/route.ts | Browser CSP violation reports | none, `withRateLimit(60,60)`, 16KB body cap | 0 DB queries (in-memory capture) | browser CSP `report-to` | system | none |

## door-checkin
| POST | /door-checkin | route.ts:22-26 | Classroom-door check-in (mode B) | assistant/teacher | `doorCheckin()` not deep-dived | door tablet UI | per-tenant | not deep-dived |
| GET | /door-checkin | route.ts:28-33 | Door session state (polling?) | assistant/teacher | `doorSessionState()` not deep-dived — **check for polling on the door-tablet client (not traced; flag as suspect for polling pattern given tablet-kiosk use case)** | door tablet UI, likely polled for live queue | per-tenant | **possible polling — client not traced, flagged as suspect** |

## cron (`v1/cron/[job]/route.ts`, `CRON_SECRET`-guarded dispatcher, `apps/erp/src/lib/services/cron/jobs.ts`)
| POST | /cron/month-end-statements | jobs.ts:22-81 | Generate+email monthly invoices | cron secret | batches teacher/center/invoice lookups (take 5000 each) then **two SEQUENTIAL `for` loops (lines 52-63, 64-75), one call to `generateAndEmailInvoice()` per teacher and per center — email sent INLINE per iteration, not parallelized/queued** | Vercel cron | system | **sync work (invoice gen + email) done inline in a serial loop — scales linearly with teacher+center count, timeout risk at scale** |
| POST | /cron/lesson-reminders | jobs.ts:83-135 | Remind students of upcoming lessons | cron secret | fetch ≤500 sessions in window, then **`for (const s of sessions) { await platformDb(tx => tx.enrollment.findMany({courseId: s.courseId,...})) }` (lines 116-123) — PER-SESSION query+own transaction, classic N+1** | Vercel cron | system | **N+1, up to 500 extra queries/txns per run** |
| POST | /cron/expire-payment-intents | → `expirePaymentIntents()` | Expire stale payment intents | cron secret | not deep-dived | Vercel cron | system | not deep-dived |
| POST | /cron/expire-subscriptions | → subscriptions service | Expire lapsed subscriptions | cron secret | not deep-dived | Vercel cron | system | not deep-dived |
| POST | /cron/subscription-renewal-reminders | jobs.ts:265-329 | Remind on renewal (5/2/0 days out) | cron secret | 3 buckets × ≤1000 subs each; **nested `for` loop per subscription (lines 287-325): `notification.findFirst` dedup + `course.findUnique` + `notify()` — PER-SUBSCRIPTION N+1, worst case ~3000×3 ≈ 9000 queries/run** | Vercel cron | system | **N+1, worst-case ~9000 queries/run** |
| POST | /cron/expire-collaboration-requests | → collaboration service | Expire stale collab requests | cron secret | not deep-dived | Vercel cron | system | not deep-dived |
| POST | /cron/guardian-contact-reminders | → messaging/guardian service | Remind guardians to verify contact | cron secret | not deep-dived | Vercel cron | system | not deep-dived |
| POST | /cron/data-exports | → export service | Process queued data exports | cron secret | not deep-dived | Vercel cron | system | not deep-dived |
| POST | /cron/weekly-center-digest | jobs.ts:149-263 | Owner's Monday email digest | cron secret | fetch ≤5000 active centers + sent-set in one batch, then **SEQUENTIAL `for (const center of centers)` loop (176-260): per center — `user.findUnique` (owner) + `getNetProfitReport()` + `tx.session.count()` + `buildGapReport()` + notify + `auditLog.create` — at least 4-5 DB calls + 2 report-gen calls PER CENTER, fully serial, not parallelized** | Vercel cron | system | **heaviest cron job: serial per-center report generation, could be very slow / timeout with many centers** |

## contact
| POST | /contact | route.ts | Public contact form submit | none, `withRateLimit(5,3)` | `recordContactSubmission()` 1 insert | marketing site contact form | public | none |

## attendance
| PATCH | /attendance/[id] | [id]/route.ts (21 lines) | Edit one attendance record | role-scoped | thin wrapper → `editAttendance()`, not deep-dived | attendance edit UI | per-tenant | not deep-dived |

## teachers
| GET | /teachers/[teacherId] | [teacherId]/route.ts | Public teacher profile | public, `withPublicCache(discovery)` | cached | public teacher page | shared (cached, correctly excluded) | none |
| GET/POST/DELETE | /teachers/me/photo | me/photo/route.ts | Teacher profile photo CRUD | teacher | 1-2 each, `invalidatesPublicData` on write | profile settings | per-user | none |

## _ping
| GET | /_ping | %5Fping/route.ts | not individually re-confirmed this pass (grepped earlier, thin liveness check) | none likely | ~1 or 0 | uptime monitor | system | none expected |

## auth (v1 subfolder: password reset/forgot, view-as, invite/accept, register/*) 
| — | 9 files under `v1/auth/**` | password reset/forgot, view-as claim/stop, invite accept, register (center/student/parent/teacher) | mixed (public token-based / session) | **NOT individually read this pass** (gap — recommend a follow-up pass, these are auth-sensitive but typically low-volume/low-query-count by nature) | various onboarding/auth screens | per-user | not deep-dived |

## top-level auth/health
| GET/POST | /api/auth/[...all] | auth/[...all]/route.ts | better-auth handler (login/session/etc.) | better-auth internal | delegates to better-auth; POST sign-out path adds **1 extra `platformDb` call** (`authSession.deleteMany`) to revoke surplus session tokens | every login/session action | per-user | none (deliberate defense-in-depth, low cost) |
| GET/HEAD | /api/health | health/route.ts | Liveness/readiness probe | none, `checkRateLimit(60,60)` | 1 `SELECT 1` (deep mode adds mail check, cron-secret gated) | uptime monitor | system | none |

---
## Problems ranked (highest confidence/impact first)

1. **N+1 — `listRosterTeachers`**: `packages/server-core/src/services/center/roster.ts:475-491` — per-affiliation loop runs `course.findMany` + `review.aggregate` inside `for (const a of affiliations)` instead of `groupBy`/`IN` (the exact batching pattern is used one function above it for students). Cost: 3 + 2N queries for N teachers.

2. **N+1 — offline attendance sync**: `apps/erp/src/lib/services/attendance/sync.ts:34-133` (route `v1/teacher/attendance/sync/route.ts`) — per-record loop, up to 500 records/request, each running `enrollment.findFirst` + `attendanceRecord.findUnique` + `attendanceRecord.create`; separate sequential per-absence `notify()` loop after (~150-159). Est. 1000-1500+ queries/request worst case.

3. **Cron `runSubscriptionRenewalReminders`** (`apps/erp/src/lib/services/cron/jobs.ts:265-329`): 3 buckets × ≤1000 subs, nested per-subscription `notification.findFirst` + `course.findUnique` + `notify()`. Worst case ~9000 queries in one cron invocation.

4. **Cron `runWeeklyCenterDigest`** (`jobs.ts:149-263`): serial per-center loop over ≤5000 centers, each doing owner lookup + `getNetProfitReport()` + `session.count()` + `buildGapReport()` + notify + audit-log insert — 4-5+ DB calls plus 2 report-generation calls per center, fully sequential, not parallelized. Highest timeout risk of any cron job.

5. **Cron `runMonthEndStatements`** (`jobs.ts:22-81`): sequential per-teacher and per-center `generateAndEmailInvoice()` calls (2 separate for-loops) — email generation done inline/serially, not queued/parallelized. Scales linearly with teacher+center count.

6. **Cron `runLessonReminders`** (`jobs.ts:83-135`): per-session `enrollment.findMany` inside its own `platformDb` transaction, looped over ≤500 sessions — N+1, up to 500 extra round-trip transactions per run.

7. **N+1 on course creation**: `packages/server-core/src/services/sessions/session-generator.ts` (~line 69) — `for (const date of dates) { await checkConflicts(tx,...) }`, one conflict-check query per calendar occurrence. Triggered by `POST /courses` (both center and teacher-direct) and likely reused by collaboration-request acceptance. Potentially 100+ queries for a full school-year multi-weekly course.

8. **Unbounded findMany (no pagination), read paths**: `listPayments` (`packages/server-core/src/services/payments/payments.ts:167`), `GET /sessions` (`apps/erp/src/app/api/v1/sessions/route.ts:~95`, worse — no default date bound for center_admin so it can return every session ever), `GET /courses` (`courses/route.ts:102`), `GET /enrollment-requests` (`enrollment-requests/route.ts:39`), `GET /enrollments` (`enrollments/route.ts:69`), `listRosterStudents` (`roster.ts:47`, lower severity — naturally bounded by center size).

9. **Public unauthenticated + unrate-limited list endpoint**: `GET /api/v1/courses` (`courses/route.ts:85-90,102`) — the `centerId`-only public-browse path has neither `take` nor `withRateLimit` (unlike the `/search/*` discovery routes, which are both cached and rate-limited). Combines finding #8 with an open scrape/cost surface.

10. **Read-path side effect**: `GET /enrollment-requests` (`enrollment-requests/route.ts:45-49`) runs an `updateMany` (auto-expire stale requests) inside a GET handler — a write hidden in a read, not itself expensive but a pattern smell (also breaks "on-demand reads" cleanliness).

11. **Minor**: `internal/chat-notify/route.ts` does 2 sequential `platformDb` round trips (message lookup, then sender lookup) that could be one query via a `select` on the sender relation; low volume (per-chat-message from realtime server) so low priority.

12. **Suspect — unconfirmed**: `GET /door-checkin` (`door-checkin/route.ts:28-33`, `doorSessionState()`) is plausibly polled by a door-tablet kiosk UI for a live queue; client trigger was not traced in this pass — flagged for follow-up, not confirmed as a problem.

## Gaps (not deep-dived in this pass — service internals or route files not read)
`getSessionAttendance`, `bulkMarkAttendance`, `cancelSession`, `completeSession`,
`previewSessionSettlement`, `postponeSession`, `reopenAttendanceForSettlement`,
`editAttendance`, `listAssistants`/`createAssistant`, `listTeacherBlacklist`/
`teacherBlacklistStudent`, `getTeacherCoverage`, `cancelOwnPayoutRequest`,
`createTempStudent`, collaboration-requests service + its 3 [id] actions,
`createCourse`/`createTeacherDirectCourse` (courses.ts), `enrollStudent`,
`listExpenses`, `listDeletionRequests`, `doorCheckin`, all 9 `v1/auth/**` files,
`roster/teachers/invite`, `roster/teachers/[teacherId]`, `roster/students/invite`,
`teacher/assistants/[id]`, `teacher/assistants/[id]/invite`,
`teacher/blacklist/[id]`, `temp-students/claim`, `temp-students/[id]/send-invite`,
`expire-payment-intents`/`expire-subscriptions`/`expire-collaboration-requests`/
`guardian-contact-reminders`/`data-exports` cron job bodies. Client-caller traces
(component file + trigger) were only fully confirmed for global search; other
routes' callers are inferred from route purpose, not grep-confirmed.

---

## Superadmin oversight API inventory (group A — high-depth)

Base dir: `/Users/ali/edura/apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight`
All routes delegate to `/Users/ali/edura/apps/superadmin/src/lib/services/admin/center-oversight.ts` (762 lines), wrapped in `platformDb(async (tx) => ...)`. All are `GET` only, `withRole("super_admin", ...)` (`/Users/ali/edura/apps/superadmin/src/lib/authz/require-role.ts:28`, via `requireRole`). Frontend: `/Users/ali/edura/apps/superadmin/src/features/admin/center-oversight/*`, using `useOversight`/`useAdminGet` (`use-oversight.ts`) → `useCustom` (refine), no `refetchInterval` anywhere — no polling on any of these endpoints.

| Method | Route | Handler file:line | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | oversight/overview | route.ts:7 → `center-oversight.ts:48` centerOverview | Center summary counts + admins | super_admin | ~10 (1 center findUnique + 8 counts in Promise.all, incl. 1 nested course.findMany→session.count + 1 userMap) | `center-oversight-screen.tsx:105` `useOversight(centerId,"overview")` — unconditional, fires on mount of the oversight screen (per centerId) | per-tenant (one center) | None significant; fine as-is |
| GET | oversight/pending | route.ts:7 → `centerPendingItems` (`center-oversight.ts:412`) | Pending collab/enrollment/affiliation requests | super_admin | ~7 (3 findMany in Promise.all, capped `take:100` each, + 2 userMap + 2 lookup findMany) | `center-oversight-screen.tsx:293` `<PendingTab enabled={tab==="pending"}>` — tab click | per-tenant | Hardcoded `take:100` per list, no real pagination/total — fine at current scale, but silently truncates past 100 |
| GET | oversight/attendance | route.ts:7 → `centerAttendance` (`center-oversight.ts:338`) | Paginated attendance records + status summary | super_admin | ~6 (2 in Promise.all [findMany+groupBy]+count, + userMap + course lookup + session lookup) | `operations-tabs.tsx` `<AttendanceTab enabled={tab==="attendance"}>` — tab click | per-tenant, paginated | `groupBy` summary query scans ALL attendance rows for the center (unbounded by page, though bounded by centerId) — acceptable |
| GET | oversight/payments | route.ts:7 → `centerPayments` (`center-oversight.ts:598`) | Paginated payments list | super_admin | ~4 (findMany+count in Promise.all + 2 userMap) | `finance-tab.tsx:66` sub-tab click (`sub==="payments"`), `limit:100` | per-tenant, paginated | None |
| GET | oversight/enrollments | route.ts:7 → `centerEnrollments` (`center-oversight.ts:252`) | Paginated enrollments | super_admin | ~4 (findMany+count + course lookup + userMap) | `academic-tabs.tsx:525` `<EnrollmentsTab enabled={tab==="enrollments"}>` — tab click | per-tenant, paginated | None |
| GET | oversight/invoices | route.ts:7 → `centerInvoices` (`center-oversight.ts:686`) | Paginated invoices | super_admin | 2 (findMany+count) | `finance-tab.tsx:78` sub-tab click (`sub==="invoices"`), `limit:100` | per-tenant, paginated | None |
| GET | oversight/settlements | route.ts:7 → `centerSettlements` (`center-oversight.ts:655`) | Paginated session settlements | super_admin | ~4 (findMany+count + course lookup + userMap) | `finance-tab.tsx:74` sub-tab click (`sub==="settlements"`), `limit:100` | per-tenant, paginated | None |
| GET | oversight/statement | route.ts:7 → `centerFinanceStatement` = `centerStatement` (`/Users/ali/edura/apps/superadmin/src/lib/services/finance/finance-reports.ts:118`) | Center P&L-style statement | super_admin | 6 (1 center findUnique + 5 aggregates in Promise.all) | `finance-tab.tsx:87` sub-tab click (`sub==="statement"`) | per-tenant | If no `from`/`to` given, all 5 aggregates scan the full `transaction`/`expense` history for the center (no date bound) — full-table aggregation per request |
| GET | oversight/subscriptions | route.ts:7 → `centerSubscriptions` (`center-oversight.ts:288`) | Paginated subscriptions + status totals | super_admin | ~5 (findMany+count+groupBy in Promise.all + 2 userMap + course lookup) | `center-oversight-screen.tsx:271` `<... enabled={tab==="subscriptions"}>` — tab click | per-tenant, paginated | `groupBy` totals query is unbounded by date/page (full center history) — minor |
| GET | oversight/students | route.ts:7 → `centerStudents` (`center-oversight.ts:97`) | Paginated roster + wallet/points | super_admin | ~5 (findMany+count in Promise.all + studentProfile findMany + userMap) | `people-tabs.tsx:85` `<StudentsTab enabled={tab==="students"}>` — tab click | per-tenant, paginated | None |
| GET | oversight/transactions | route.ts:7 → `centerTransactions` → `listTransactions` (`/Users/ali/edura/apps/superadmin/src/lib/services/finance/accountant.ts:19`) | Paginated ledger transactions | super_admin | 2 (findMany+count) | `finance-tab.tsx:61` sub-tab (default, `sub==="transactions"`), `limit:100` | per-tenant, paginated | None |
| GET | oversight/courses | route.ts:7 → `centerCourses` (`center-oversight.ts:153`) | Paginated courses + enrollment counts | super_admin | ~5 (findMany+count in Promise.all + userMap + room lookup + enrollment groupBy) | `academic-tabs.tsx:74` `<CoursesTab enabled={tab==="courses"}>` tab click; also reused as a lookup (`limit:100`) inside enrollments/attendance/money-actions dialogs on dialog `open` | per-tenant, paginated | Same endpoint is re-fetched independently (not cached/shared) by ≥4 different components each time their dialog opens — duplicate network calls, not duplicate DB-level N+1 |
| GET | oversight/sessions | route.ts:7 → `centerSessions` (`center-oversight.ts:209`) | Paginated sessions | super_admin | ~5 (course id lookup + findMany+count in Promise.all + course title lookup + userMap) | `operations-tabs.tsx:58` `<SessionsTab enabled={tab==="sessions"}>` tab click | per-tenant, paginated | Two sequential awaits before the Promise.all (`centerCourseIds` then session query) — not a loop, just serial; negligible |
| GET | oversight/wallet | route.ts:7 → `centerWalletMovements` (`center-oversight.ts:702`) | Paginated wallet ledger (center or roster scope) | super_admin | 3 (raw SQL id-page query + raw SQL count query in Promise.all, then walletLedger.findMany by id + userMap) | `finance-tab.tsx:82` sub-tab click (`sub==="wallet"`), `limit:100` | per-tenant (or roster-scoped via EXISTS, deliberately avoiding an in-memory ID list per comment at line 712) | None — well designed to avoid the N+1/memory-growth trap it explicitly documents |
| GET | oversight/finance | route.ts:7 → `centerFinanceSummary` (`center-oversight.ts:489`) | Finance dashboard summary for one center | super_admin | 8 (1 center findUnique + 7 aggregate/groupBy queries in one Promise.all: transaction groupBy, payment aggregate ×2, payout groupBy, sessionSettlement aggregate, invoice groupBy, walletLedger aggregate) | `finance-tab.tsx:60` `useOversight(centerId,"finance")` — unconditional on Finance tab mount (`tab==="finance"`), no further gating | per-tenant | **Worst finding**: with no `from`/`to` filters (finance-tab.tsx never passes any), all 7 aggregates run full-history table scans over `transaction`/`payment`/`payout`/`sessionSettlement`/`invoice`/`walletLedger` filtered only by `centerId`, every time the Finance tab is opened — no caching, no default date window |
| GET | oversight/staff | route.ts:7 → `centerStaffAccounts` (`center-oversight.ts:389`) | Center staff accounts list | super_admin | 2 (findMany, unbounded — no `take`/pagination, + userMap) | `people-tabs.tsx:502` `<StaffTab enabled={tab==="staff"}>` tab click | per-tenant | `centerStaffAccounts` has **no pagination at all** (`tx.centerStaff.findMany` with no `skip`/`take`) — fine while staff counts are small, but is the only list endpoint in this group missing `take` |
| GET | oversight/payouts | route.ts:7 → `centerPayouts` (`center-oversight.ts:629`) | Paginated payouts | super_admin | 3 (findMany+count in Promise.all + userMap) | `finance-tab.tsx:70` sub-tab click (`sub==="payouts"`), `limit:100` | per-tenant, paginated | None |

## Summary
- No true N+1 (await-in-a-loop) found anywhere in this group — every handler batches child lookups via `Promise.all` + a single `findMany({ id: { in: [...] } })` joined through a `Map` (the `userMap`/title-lookup pattern repeated throughout `center-oversight.ts`).
- All list endpoints except `centerStaffAccounts` (`center-oversight.ts:389`) have `take`/pagination.
- Two endpoints (`centerFinanceSummary` at `center-oversight.ts:489`/finance route, `centerStatement` at `finance-reports.ts:118`/statement route) run multiple full-table aggregates scoped only by `centerId` with no default date bound — the `finance` one is the more serious since it fires unconditionally on Finance-tab mount with 7 aggregates and the UI never supplies a date range.
- No polling/refetchInterval anywhere in this group; every fetch is mount-of-tab or click-gated (`enabled={tab==="x"}` / `enabled={sub==="x"}`).

---

## Superadmin API inventory — Group B: centers (58 files)

Base dir: `apps/superadmin/src/app/api`. All routes wrapped in `withRole("super_admin", ...)` unless noted; `export const dynamic = "force-dynamic"` on every file (no caching, per project rule). Data scope is per-tenant (single `centerId` from the URL) for nearly every row — noted as "shared" only where a query is not centerId-scoped.

| Method | Route | Handler file:line | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | `/v1/admin/centers` | `v1/admin/centers/route.ts:7` | List centers, cursor paginated | super_admin | 1 (`listCenters` → cursor `findMany`, proper `take+1`/cursor pattern) | `features/admin/centers-screen.tsx`, mount | shared (all centers) | None — clean cursor pagination, no N+1 |
| GET | `/v1/admin/centers/[id]` | `v1/admin/centers/[id]/route.ts:10` | Get one center + counts | super_admin | ~5 (`getCenter`: 1 findUnique + 1 findMany admins + 3 parallel counts) | center detail screen, mount | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]` | `v1/admin/centers/[id]/route.ts:36` | Update center profile | super_admin | ~2-3 (service not inspected in depth) | edit form, click/save | per-tenant | None obvious |
| GET | `/v1/admin/centers/[id]/blacklist` | `blacklist/route.ts:16` | List blacklist entries | super_admin | 1 | blacklist tab, mount | per-tenant | None |
| POST | `/v1/admin/centers/[id]/blacklist` | `blacklist/route.ts:21` | Add blacklist entry | super_admin | small, tx | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/deletion-requests` | `deletion-requests/route.ts:7` | List deletion requests | super_admin | 1 | tab, mount | per-tenant | None |
| GET | `/v1/admin/centers/[id]/staff` | `staff/route.ts:19` | List center staff | super_admin | 1 | staff tab, mount | per-tenant | None |
| POST | `/v1/admin/centers/[id]/staff` | `staff/route.ts:24` | Create staff + invite | super_admin | tx + 1 email/whatsapp send (single recipient) | click | per-tenant | Invite send awaited in request — fine for single recipient, low traffic |
| GET | `/v1/admin/centers/[id]/enrollment-requests` | `enrollment-requests/route.ts:7` | List enrollment requests | super_admin | 1 | tab, mount | per-tenant | None |
| GET | `/v1/admin/centers/[id]/rooms` | `rooms/route.ts:7` | List rooms with split overrides | super_admin | ~4 (`getCenterRoomsWithSplit`: center + rooms + batched commissionSetting `findMany` by `roomId: {in}` + 2 split resolves) | rooms tab, mount | per-tenant | None — batched, no N+1 despite per-room override data |
| POST | `/v1/admin/centers/[id]/broadcast` | `broadcast/route.ts:18` | Send notification to center/course | super_admin | course path: 1 (course lookup) + N (parent-lookup fan-out, see Problem) + notify(); center path: 1 (`enrollment.findMany`) + notify() | `operations-tabs.tsx:709`, click "Send" | per-tenant → fans out to student/parent recipients | **N+1 + blocking**: `resolveCourseStudentsAndParents` (packages/server-core/src/services/notifications/fanout.ts:16-21) issues one `parentStudentLink.findFirst` per enrolled student (parallel via `Promise.all`, but still N queries instead of one `IN`-batched query); `adminBroadcast` (center-operations.ts:396-404) then `await notify(...)` synchronously — email/push fan-out to every recipient happens inline before the HTTP response returns, not queued |
| PUT/GET/DELETE | `/v1/admin/centers/[id]/split` | `split/route.ts:24,29,35` | Get/set/clear center revenue split | super_admin | 1 each | settings tab, click | per-tenant | None |
| PUT/DELETE | `/v1/admin/centers/[id]/per-student-rate` | `per-student-rate/route.ts:19,25` | Set/clear per-student (M2) rate | super_admin | 1 each | settings tab, click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/enrollments` | `enrollments/route.ts:11` | List enrollments | super_admin | 1 | enrollments tab, mount | per-tenant | None |
| POST | `/v1/admin/centers/[id]/enrollments` | `enrollments/route.ts:17` | Enroll student in course | super_admin | tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/collaboration-requests` | `collaboration-requests/route.ts:34` | Create collaboration request | super_admin | tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/reject` | `reject/route.ts:10` | Reject pending center | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/affiliations` | `affiliations/route.ts:7` | List teacher affiliations | super_admin | ~4 (`getCenterAffiliations`: center + affiliations + batched user `findMany` by ids + `groupBy` course counts) | affiliations tab, mount | per-tenant | None — batched, no N+1 |
| GET | `/v1/admin/centers/[id]/admins` | `admins/route.ts:7` | List center admins | super_admin | 1 | admins tab, mount | per-tenant | None |
| POST | `/v1/admin/centers/[id]/status` | `status/route.ts:16` | Activate/deactivate center | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/dashboard` | `dashboard/route.ts:7` | Center dashboard summary | super_admin | delegates to shared `getAdminDashboard` (server-core; not deep-audited here — shared with ERP center-admin dashboard, out of this group's scope) | center detail landing, mount | per-tenant | None found at route level — single call, no loop |
| POST | `/v1/admin/centers/[id]/approve` | `approve/route.ts:7` | Approve pending center | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/courses` | `courses/route.ts:43` | Create course | super_admin | tx | click | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/attendance/[attendanceId]` | `attendance/[attendanceId]/route.ts:11` | Correct one attendance record | super_admin | ~4 (tx: before-lookup, edit, settlement lookup, present-count recount) | attendance correction, click | per-tenant | None — single record, bounded |
| GET | `/v1/admin/centers/[id]/blacklist/[entryId]` (DELETE only) | `blacklist/[entryId]/route.ts:11` | Lift blacklist entry | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/money/payments` | `money/payments/route.ts:19` | List payments | super_admin | delegates to shared `listPayments` (server-core; assumed paginated like ERP equiv.) | money tab, mount | per-tenant | Not deep-audited (shared primitive) |
| POST | `/v1/admin/centers/[id]/money/payments` | `money/payments/route.ts:25` | Record cash payment | super_admin | tx via `recordPaymentTx` (sanctioned writer) | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/money/expenses` | `money/expenses/route.ts:19` | List expenses | super_admin | delegates to `listExpenses` | money tab, mount | per-tenant | Not deep-audited |
| POST | `/v1/admin/centers/[id]/money/expenses` | `money/expenses/route.ts:25` | Create expense | super_admin | tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/money/subscriptions` | `money/subscriptions/route.ts:19` | Create walk-in subscription | super_admin | tx via `createWalkInSubscriptionTx` (sanctioned writer) | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/money/wallet-topup` | `money/wallet-topup/route.ts:13` | Top up student wallet (cash) | super_admin | tx via `topUpWalletCashTx` (sanctioned writer) | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/money/payout-request` | `money/payout-request/route.ts:21` | Get wallet + payout history | super_admin | 2, parallel (`Promise.all`) | money tab, mount | per-tenant | None — correctly parallelized |
| POST | `/v1/admin/centers/[id]/money/payout-request` | `money/payout-request/route.ts:30` | Request center payout | super_admin | tx via `requestCenterPayoutTx` | click | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/staff/[linkId]` | `staff/[linkId]/route.ts:17` | Update staff role/title/active | super_admin | small | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/staff/[linkId]` | `staff/[linkId]/route.ts:23` | Remove staff | super_admin | small | click | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/rooms/[roomId]` | `rooms/[roomId]/route.ts:26` | Update room | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/rooms/create` | `rooms/create/route.ts:18` | Create room | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/reports/[report]` | `reports/[report]/route.ts:7` | 8 report kinds (revenue, expenses, timeseries, fill-rate, attendance, funnel) | super_admin | delegates to shared `@repo/server-core` report functions, one per `report` kind — not deep-audited (shared with ERP reports, reused per "AN EXPORT RUNS THE SAME SERVICE FUNCTION" invariant) | reports tab, click/filter change | per-tenant | Not deep-audited; each kind is its own query set in server-core |
| GET | `/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | `sessions/[sessionId]/attendance/route.ts:26` | Get session attendance | super_admin | 1-2 | session detail, mount | per-tenant | None |
| PUT | `/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | `sessions/[sessionId]/attendance/route.ts:31` | Bulk mark attendance | super_admin | **N+1**: 1 lock + 1 session read + 1 enrollment findMany + **one `attendanceRecord.upsert` per entry in a serial `for` loop** (attendance.ts:153) + 2 counts, all inside one tx holding a session row lock; then N absence-notify effects run serially post-commit (awaited) | attendance grid, click "Save" (can be dozens of students at once) | per-tenant | **Real N+1**: `packages/server-core/src/services/attendance/attendance.ts:153` loops `entries` with `await tx.attendanceRecord.upsert(...)` per student instead of one batch `createMany`/`updateMany` — serializes DB round-trips while the session row lock (`lockSessionRow`) is held. Post-commit, `runEffects` (packages/server-core/src/db/effects.ts:11) also awaits absence notifications one at a time, adding to request latency (`center-operations.ts:151`) |
| POST | `/v1/admin/centers/[id]/sessions/[sessionId]/cancel` | `sessions/[sessionId]/cancel/route.ts:11` | Cancel session | super_admin | tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/sessions/[sessionId]/complete` | `sessions/[sessionId]/complete/route.ts:7` | Complete session (settle) | super_admin | tx via settlement primitives | click | per-tenant | None (routes through sanctioned settlement, per invariant) |
| GET | `/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview` | `settlement-preview/route.ts:7` | Preview settlement math | super_admin | small, read-only | click "preview" | per-tenant | None |
| POST | `/v1/admin/centers/[id]/sessions/[sessionId]/postpone` | `postpone/route.ts:18` | Postpone session | super_admin | tx | click | per-tenant | None |
| PUT | `/v1/admin/centers/[id]/affiliations/[affiliationId]` | `affiliations/[affiliationId]/route.ts:13` | Update affiliation center share | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/roster/teachers` | `roster/teachers/route.ts:7` | List center teachers | super_admin | 1 | roster tab, mount | per-tenant | None |
| GET | `/v1/admin/centers/[id]/roster/students` | `roster/students/route.ts:11` | List center students | super_admin | 1 | roster tab, mount | per-tenant | None |
| POST | `/v1/admin/centers/[id]/roster/students` | `roster/students/route.ts:17` | Add existing student to roster | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/admins/invite` | `admins/invite/route.ts:11` | Invite center admin | super_admin | tx + 1 email send (single recipient, awaited) | click | per-tenant | Single-recipient invite awaited — acceptable at this traffic level |
| DELETE | `/v1/admin/centers/[id]/admins/[userId]` | `admins/[userId]/route.ts:7` | Remove center admin | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/courses/[courseId]` | `courses/[courseId]/route.ts:41` | Get course | super_admin | small | course detail, mount | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/courses/[courseId]` | `courses/[courseId]/route.ts:46` | Update course | super_admin | small/tx | click | per-tenant | None |
| PUT | `/v1/admin/centers/[id]/rooms/[roomId]/split` | `rooms/[roomId]/split/route.ts:20` | Set room-level split override | super_admin | small | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/rooms/[roomId]/split` | `rooms/[roomId]/split/route.ts:26` | Clear room-level split override | super_admin | small | click | per-tenant | None |
| PUT | `/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | `rooms/[roomId]/per-student-rate/route.ts:19` | Set room M2 rate | super_admin | small | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | `rooms/[roomId]/per-student-rate/route.ts:25` | Clear room M2 rate | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/rooms/[roomId]/status` | `rooms/[roomId]/status/route.ts:11` | Activate/deactivate room | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher` | `reassign-teacher/route.ts:11` | Reassign course teacher | super_admin | tx | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/enrollments/[enrollmentId]` | `enrollments/[enrollmentId]/route.ts:7` | Unenroll student | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/deletion-requests/[requestId]/decide` | `deletion-requests/[requestId]/decide/route.ts:16` | Approve/reject deletion request | super_admin | tx (soft-delete on approve) | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/money/payments/[paymentId]` | `money/payments/[paymentId]/route.ts:7` | Get one payment | super_admin | 1 | payment detail, click | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/money/expenses/[expenseId]` | `money/expenses/[expenseId]/route.ts:21` | Update expense | super_admin | small/tx | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/money/expenses/[expenseId]` | `money/expenses/[expenseId]/route.ts:27` | Delete expense | super_admin | small/tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/members/[userId]/status` | `members/[userId]/status/route.ts:17` | Activate/deactivate teacher or student membership | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/staff/[linkId]/invite` | `staff/[linkId]/invite/route.ts:12` | Resend staff invite | super_admin | tx + 1 email send; rate-limited (`withRateLimit(...,10,10)`) | click | per-tenant | None — correctly rate-limited given it's a send-triggering endpoint |
| POST | `/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide` | `enrollment-requests/[requestId]/decide/route.ts:19` | Approve/decline enrollment request | super_admin | tx | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/roster/teachers/invite` | `roster/teachers/invite/route.ts:18` | Invite teacher to center | super_admin | tx + 1 email send (single recipient) | click | per-tenant | Dev/E2E-only token leak (`LEAK_TOKEN`) is intentionally gated off in production — not a perf issue, noted for completeness |
| DELETE | `/v1/admin/centers/[id]/roster/teachers/[teacherId]` | `roster/teachers/[teacherId]/route.ts:7` | Remove teacher from center | super_admin | small | click | per-tenant | None |
| GET | `/v1/admin/centers/[id]/roster/students/[studentId]` | `roster/students/[studentId]/route.ts:25` | Get student | super_admin | small | student detail, mount | per-tenant | None |
| PATCH | `/v1/admin/centers/[id]/roster/students/[studentId]` | `roster/students/[studentId]/route.ts:30` | Update student | super_admin | small | click | per-tenant | None |
| DELETE | `/v1/admin/centers/[id]/roster/students/[studentId]` | `roster/students/[studentId]/route.ts:36` | Remove student from center | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/roster/students/invite` | `roster/students/invite/route.ts:18` | Invite student to center | super_admin | tx + 1 email send (single recipient) | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/students/[studentId]/membership` | `students/[studentId]/membership/route.ts:19` | Remove/restore student membership | super_admin | small | click | per-tenant | None |
| POST | `/v1/admin/centers/[id]/courses/[courseId]/cancel` | `courses/[courseId]/cancel/route.ts:11` | Cancel course | super_admin | tx | click | per-tenant | None |

## Notes on methodology
- All 58 files read in full. Every handler goes through `withRole("super_admin", ...)`, so auth/role column is uniform except `staff/[linkId]/invite` which also adds `withRateLimit`.
- "DB queries/request" for single-entity CRUD rows (marked "small") were not individually counted query-by-query since each is a bounded 1-3 query operation on one row/id — consistent with the brief's "skim for the row" instruction for the 58-file lighter group.
- Deep-dived per brief: `centers/route.ts` (list, pagination check — clean), `centers/[id]/dashboard/route.ts`, `centers/[id]/reports/[report]/route.ts`, and every handler whose body takes an array (`sessions/[sessionId]/attendance` PUT) or fans out to multiple recipients (`broadcast` POST).
- Money-mutating endpoints (`money/payments`, `money/expenses`, `money/subscriptions`, `money/wallet-topup`, `money/payout-request`) all route through the sanctioned `*Tx` writers named in the repo's binding money invariant (`recordPaymentTx`, `createWalkInSubscriptionTx`, `topUpWalletCashTx`, `requestCenterPayoutTx`) — not re-audited for perf here since they are shared, already-reviewed primitives.
- Caller/trigger tracing done for the emphasized endpoints (centers list, dashboard, broadcast) via grep of `apps/superadmin/src/features/admin`; skipped for plain CRUD rows per the brief's priority guidance (Problem/query-count accuracy over exhaustive caller tracing).

## Worst problems found
1. `packages/server-core/src/services/attendance/attendance.ts:153` — `bulkMarkAttendanceTx` loops `entries` with a serially-awaited `tx.attendanceRecord.upsert()` per student instead of a single batched write, while holding a locked session row (`lockSessionRow`). Hit by `PUT /v1/admin/centers/[id]/sessions/[sessionId]/attendance` (`center-operations.ts:131`).
2. `packages/server-core/src/services/notifications/fanout.ts:16-21` — `resolveCourseStudentsAndParents` issues one `parentStudentLink.findFirst` per enrolled student (N parallel queries) instead of one `IN`-batched query. Hit by `POST /v1/admin/centers/[id]/broadcast` (course scope).
3. `apps/superadmin/src/lib/services/admin/center-operations.ts:396-404` (`adminBroadcast`) — `await notify(...)` runs the full email/push fan-out to every resolved recipient synchronously inside the request; not queued/backgrounded.
4. `apps/superadmin/src/lib/services/admin/center-operations.ts:151` — `await runEffects(effects)` runs one absence notification per marked-absent student serially, post-commit but still inside the request/response cycle for `PUT .../sessions/[sessionId]/attendance`.

---

## Inventory: apps/superadmin admin/users, admin/teachers, admin/catalog (LIGHTER group, 54 files)

Base dir: `apps/superadmin/src/app/api`. All routes gated by `withRole("super_admin")` — 2 staff roles, low traffic (super_admin + accountant, accountant has no access to these). All reads go through `platformDb` (Prisma). Service files: `src/lib/services/admin/admin-users.ts`, `src/lib/services/admin/platform.ts`, `src/lib/services/admin/teacher-control.ts`, `src/lib/services/admin/teacher-oversight.ts`, `src/lib/services/catalog/catalog-admin.ts`.

## admin/users

| Method | Route | Handler file:line | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | `/v1/admin/users` | `v1/admin/users/route.ts:8` | List/search platform users | super_admin | 1 (cursor `findMany`, take+1, no COUNT) | `features/admin/users-screen.tsx:54` (`admin/users`) — mount + search keystroke (debounced) + cursor pagination click | shared (all users, platform-wide) | None — cursor pagination avoids COUNT(*) and offset drift; `searchText contains` is backed by `users_search_text_trgm` GIN index (verified in `packages/database/prisma/migrations/20260820160000_search_text_columns/migration.sql`) |
| GET | `/v1/admin/users/[id]` | `v1/admin/users/[id]/route.ts:7` (`getUserDetail`, `admin-users.ts:104`) | User detail (profile, sessions, center) | super_admin | 3–4 (user, sessions, optional centerAdminProfile/centerStaff, optional center) | `features/admin/user-detail-screen.tsx` — mount | per-user | None; bounded, no N+1 |
| GET/POST | `/v1/admin/users/[id]/card` | `card/route.ts:13,23` (`buildStudentCard`/`reissueStudentCard`/`revokeStudentCard`, `@repo/server-core`) | Student ID card view/reissue/revoke | super_admin | not read (out of scope: shared server-core service) | `features/admin/student-card-panel.tsx` — mount (GET), click (POST) | per-user | Not reviewed (lives outside this route tree) |
| POST | `/v1/admin/users/[id]/revoke-sessions` | `revoke-sessions/route.ts:11` (`revokeAllSessions`) | Kill all sessions for a user | super_admin | small, bounded (delete by userId) | user-detail-screen — click | per-user | None |
| POST | `/v1/admin/users/[id]/reset-2fa` | `reset-2fa/route.ts:11` (`resetTwoFactor`) | Clear 2FA | super_admin | small | user-detail-screen — click | per-user | None |
| PATCH | `/v1/admin/users/[id]/status` | `status/route.ts:14` (`setUserSuspended`, `admin-users.ts:165`) | Suspend/reinstate | super_admin | 3 (findUnique, update, audit write) | user-detail-screen — click | per-user | None |
| POST | `/v1/admin/users/[id]/view-as` | `view-as/route.ts:10` (`assertViewAsTarget`+`startViewAs`) | Mint ERP view-as handoff token | super_admin | small (target lookup + token mint, no DB write beyond audit) | user-detail-screen — click | per-user | None |
| POST | `/v1/admin/users/[id]/password-reset` | `password-reset/route.ts:13` (`sendPasswordReset`) | Trigger reset email | super_admin | small | user-detail-screen — click | per-user | None |
| POST | `/v1/admin/users/[id]/blacklist` | `blacklist/route.ts:12` (`platformBlacklistUser`) | Blacklist a user (3-level) | super_admin | small | user-detail-screen — click | per-user | None |
| POST | `/v1/admin/users/[id]/impersonate` | `impersonate/route.ts:11` | Start impersonation (better-auth) | super_admin | small + external `auth.api.impersonateUser` call | user-detail-screen — click | per-user | Audit write happens AFTER the auth call succeeds (intentional per comment, not a bug) |
| DELETE | `/v1/admin/users/[id]/sessions/[sessionId]` | `sessions/[sessionId]/route.ts:7` (`revokeOneSession`) | Revoke one session | super_admin | small | user-detail-screen — click | per-user | None |

## admin/teachers

| Method | Route | Handler file:line | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | `/v1/admin/teachers` | `teachers/route.ts:11` (`listTeachers`, `platform.ts:201`) | List/search teachers | super_admin | 4–5: `findMany`+`count` (parallel) + affiliations `findMany` (IN teacherIds) + centers `findMany` (IN centerIds) | `features/admin/teachers-screen.tsx:52` (`useListScreen("admin/teachers")`) — mount + search keystroke + filter/pagination click | shared, platform-wide | Offset pagination (`skip`/`take`) with a full `count()` on every page — fine at current volume but will degrade before the cursor-based `admin/users` pattern would; no N+1 (affiliations/centers batched via `IN`) |
| POST | `/v1/admin/teachers` | `teachers/route.ts:40` (`createTeacher`) | Create teacher account | super_admin | not reviewed in depth (service file) | teachers-screen — click (create dialog) | writes | Role is hardcoded server-side (comment notes body cannot request another role) — good |
| GET | `/v1/admin/teachers/[id]` | `teachers/[id]/route.ts:11` (`teacherOverview`, `teacher-oversight.ts:92`) | Teacher overview (used for detail header + PATCH target) | super_admin | ~13: user findUnique, profile findUnique, courseIds findMany, then 9 counts in one `Promise.all` (2 of which are conditional on courseIds), plus 1 more `managedByCenter` lookup | Not fetched directly by the oversight screen for display (it fetches `oversight/overview` instead, see below); this route's GET is effectively only reachable as a duplicate of `oversight/overview`'s logic (same function) | per-teacher | **Same `teacherOverview()` is exposed under two different routes** (`/teachers/[id]` GET and `/teachers/[id]/oversight/overview` GET) with no caller found for the former in `apps/superadmin/src` — dead/duplicate surface, and the ~13-query overview is the heaviest single read in this file set |
| PATCH | `/v1/admin/teachers/[id]` | `teachers/[id]/route.ts:40` (`updateTeacherProfile`) | Edit teacher profile fields | super_admin | not reviewed (service) | teacher-oversight-screen — click (save edit) | per-teacher | Whitelist + `.strict()` — good |
| PATCH | `/v1/admin/teachers/[id]/attendance-mode` | `attendance-mode/route.ts:11` | Set attendance mode | super_admin | small | teachers-screen row `onChange` — click/select | per-teacher | None |
| POST | `/v1/admin/teachers/[id]/link-center` | `link-center/route.ts:10` | Link centre | super_admin | small | teachers-screen — click | per-teacher | None |
| POST | `/v1/admin/teachers/[id]/reject` | `reject/route.ts:10` | Reject pending teacher | super_admin | small | teacher-oversight-screen — click | per-teacher | None |
| POST | `/v1/admin/teachers/[id]/status` | `status/route.ts:19` (`setTeacherStatus`) | Activate/deactivate | super_admin | small (delegates to `setUserSuspended`) | teacher-oversight-screen — click | per-teacher | None |
| DELETE | `/v1/admin/teachers/[id]/unlink-center` | `unlink-center/route.ts:8` | Unlink centre | super_admin | small | teachers-screen — click | per-teacher | None |
| POST | `/v1/admin/teachers/[id]/approve` | `approve/route.ts:7` | Approve pending teacher | super_admin | small | teacher-oversight-screen — click | per-teacher | None |
| POST | `/v1/admin/teachers/[id]/blacklist` | `blacklist/route.ts:10` | Blacklist teacher | super_admin | small | teachers-screen — click | per-teacher | None |

### admin/teachers/[id]/oversight/* (14 files, all GET-only, all call into `teacher-oversight.ts`)

All: `withRole("super_admin")`, `assertTeacher()` first (1 query), then batched `IN`-keyed lookups via shared helpers `userMap`/`courseTitles`/`centerNames`/`teacherCourseIds` — **no true N+1** (no per-row query loop found anywhere in this file); the pattern is instead several sequential round-trips per request. Callers: `features/admin/teacher-oversight/{platform,academic,people,money}-tabs.tsx` via `useTeacherOversight(teacherId, tab)` → `GET admin/teachers/:id/oversight/:tab`, gated by `enabled: sub === tab` — trigger is **tab click**, not mount (except `overview`, fetched on mount by `teacher-oversight-screen.tsx:99`).

| Method | Route | Handler file:line | Purpose | DB queries/request | Data scope | Problem |
|---|---|---|---|---|---|---|
| GET | `.../oversight/overview` | `overview/route.ts:7` → `teacherOverview` (`teacher-oversight.ts:92`) | Header stats | ~13 (see above) | per-teacher | Heaviest read in the group; fires on every page mount, not lazily like the other tabs |
| GET | `.../oversight/centers` | `centers/route.ts:7` → `teacherCenters` (`:176`) | Affiliated centers | 4 (assertTeacher, affiliations findMany, centerNames IN, course `groupBy`) | per-teacher | None — all bounded/batched |
| GET | `.../oversight/assistants` | `assistants/route.ts:7` → `teacherAssistants` (`:212`) | Delegated assistants | 3 | per-teacher | None |
| GET | `.../oversight/courses` | `courses/route.ts:7` → `teacherCourses` (`:236`) | Paged course list | 5 (findMany+count parallel, centerNames IN, enrollment `groupBy` IN) | per-teacher | None; sequential (not parallelized) after the first Promise.all |
| GET | `.../oversight/sessions` | `sessions/route.ts:7` → `teacherSessions` (`:293`) | Paged sessions | 4 | per-teacher | None |
| GET | `.../oversight/students` | `students/route.ts:7` → `teacherStudents` (`:330`) | Paged distinct-student roster, searchable | 8 (assertTeacher, courseIds, 2x raw `$queryRaw` id+count, then 3 parallel hydration queries, then courseTitles) | per-teacher | Raw SQL `u.search_text LIKE '%term%'` per search term (ANDed) — confirmed backed by the `users_search_text_trgm` GIN index so not a scan, but this is the most query-heavy single tab (8 round trips) and re-implements the same distinct-id + hydrate pattern as `admin_users`/`center-oversight` rather than reusing it |
| GET | `.../oversight/enrollments` | `enrollments/route.ts:7` → `teacherEnrollments` (`:419`) | Paged enrollments | 6 | per-teacher | None |
| GET | `.../oversight/subscriptions` | `subscriptions/route.ts:7` → `teacherSubscriptions` (`:455`) | Paged subscriptions + status totals | 7 (findMany+count+groupBy parallel, then 3 more sequential lookups) | per-teacher | None; chatty but bounded |
| GET | `.../oversight/attendance` | `attendance/route.ts:7` → `teacherAttendance` (`:511`) | Paged attendance + byStatus | 7 | per-teacher | None |
| GET | `.../oversight/finance` | `finance/route.ts:7` → `teacherFinanceSummary` (`:560`) | Money summary (ledger-derived) | 8 (profile + 6 aggregates in one `Promise.all` + implicit assertTeacher) | per-teacher | None — correctly reads existing ledger aggregates rather than re-deriving totals (matches the report-export invariant) |
| GET | `.../oversight/transactions` | `transactions/route.ts:7` → `teacherTransactions` (`:628`) | Paged ledger transactions (both directions) | 3 | per-teacher | None |
| GET | `.../oversight/payouts` | `payouts/route.ts:7` → `teacherPayouts` (`:663`) | Paged payouts | 4 | per-teacher | None |
| GET | `.../oversight/settlements` | `settlements/route.ts:7` → `teacherSettlements` (`:692`) | Paged settlements | 5 | per-teacher | None |
| GET | `.../oversight/statement` | `statement/route.ts:7` → `teacherFinanceStatement` = `teacherStatement` (finance-reports.ts, not read) | Full statement, from/to range | not reviewed (shared with accountant statement + export) | per-teacher | Not reviewed — flagged only because it is shared with the export path (by design, per `report-export` invariant) |
| GET | `.../oversight/payments` | `payments/route.ts:7` → `teacherPayments` (`:719`) | Paged payment receipts | 7 (courseIds, findMany+count, then 3 more sequential lookups: students, recorders, titles) | per-teacher | None; 7 round trips is the 2nd most chatty tab after `students` |
| GET | `.../oversight/audit` | `audit/route.ts:7` → `teacherAuditLog` (`:755`) | Paged audit trail for this teacher | 4 | per-teacher | None |
| GET | `.../oversight/pending` | `pending/route.ts:7` → `teacherPendingItems` (`:791`) | Pending collab requests + affiliations | 4 (2 findMany in parallel, each capped `take: 50`, + centerNames) | per-teacher | None |

## admin/catalog (reference-data CRUD; systems/stages/tracks/subjects/grade-levels/grade-tracks/offerings/subject-requests)

Small, bounded, permanent reference tables (the Egyptian education catalog — systems/stages/grades/tracks/subjects/offerings). All routes are thin wrappers over `src/lib/services/catalog/catalog-admin.ts` (not read in depth per scope — skimmed as instructed).

| Method | Route | Handler file:line | Purpose | DB queries/request | Callers + trigger | Problem |
|---|---|---|---|---|---|---|
| GET/POST | `/v1/admin/catalog/offerings` | `offerings/route.ts:9,26` | List/create subject×grade×track offerings | small, filtered `findMany` / single insert | catalog admin UI — mount / click | List has no pagination, but table is bounded reference data — not a risk |
| GET/POST | `/v1/admin/catalog/stages` | `stages/route.ts:9,24` | List/create stages | small | mount / click | None |
| POST | `/v1/admin/catalog/grade-tracks` | `grade-tracks/route.ts:14` | Link grade↔track | small | click | None (no GET on this route — list is likely nested under grade-levels/tracks) |
| GET/POST | `/v1/admin/catalog/tracks` | `tracks/route.ts:9,23` | List/create tracks (by stage) | small | mount / click | None |
| GET/POST | `/v1/admin/catalog/subjects` | `subjects/route.ts:9,24` | List/create subjects | small | mount / click | None |
| GET/POST | `/v1/admin/catalog/systems` | `systems/route.ts:9,22` | List/create education systems | small | mount / click | None |
| GET | `/v1/admin/catalog/subject-requests` | `subject-requests/route.ts:7` | List teacher-submitted subject requests | small | mount | None |
| GET/POST | `/v1/admin/catalog/grade-levels` | `grade-levels/route.ts:9,24` | List/create grade levels (by stage) | small | mount / click | None |
| PATCH | `/v1/admin/catalog/systems/[id]` | `systems/[id]/route.ts:17` | Update system | small | click | None |
| PATCH | `/v1/admin/catalog/grade-levels/[id]` | `grade-levels/[id]/route.ts:17` | Update grade level | small | click | None |
| POST | `/v1/admin/catalog/subject-requests/[id]/reject` | `reject/route.ts:11` | Reject subject request | small | click | None |
| POST | `/v1/admin/catalog/subject-requests/[id]/approve` | `approve/route.ts:21` | Approve (link existing or create new subject) | small | click | None |
| PATCH/DELETE | `/v1/admin/catalog/offerings/[id]` | `offerings/[id]/route.ts:11,17` | Update/delete offering | small | click | None |
| PATCH | `/v1/admin/catalog/stages/[id]` | `stages/[id]/route.ts:17` | Update stage | small | click | None |
| DELETE | `/v1/admin/catalog/grade-tracks/[id]` | `grade-tracks/[id]/route.ts:7` | Unlink grade↔track | small | click | None |
| PATCH | `/v1/admin/catalog/tracks/[id]` | `tracks/[id]/route.ts:16` | Update track | small | click | None |
| PATCH | `/v1/admin/catalog/subjects/[id]` | `subjects/[id]/route.ts:19` | Update subject | small | click | None |

## Notes
- No genuine N+1 (per-row query loop) found anywhere in this 54-file set. The service layer consistently batches child lookups with `findMany({ where: { id: { in: [...] } } })` maps (`userMap`, `courseTitles`, `centerNames`) instead of looping.
- `users.search_text` / equivalent trgm GIN indexes exist for `users`, `centers`, `courses`, etc. (`packages/database/prisma/migrations/20260820160000_search_text_columns`), so the `contains`/`LIKE '%term%'` filters used in `listUsers`, `listTeachers`, and `teacherStudents` are index-backed, not full scans.
- The main real finding is `teacherOverview()` — ~13 sequential/parallel queries — being reachable from two routes (`GET /teachers/[id]` and `GET /teachers/[id]/oversight/overview`) with only the oversight route actually called from the UI (on mount, not lazily like its sibling tabs).

---

## Superadmin API inventory — group D (misc admin sub-areas)

Base: `/Users/ali/edura/apps/superadmin/src/app/api`. All routes wrapped in `withRole("super_admin", ...)` (or `["accountant","super_admin"]` where noted) — 2-staff-role, low-traffic back office. All handlers are thin: `export const dynamic = "force-dynamic"` (no caching), delegate to a service in `src/lib/services/**`, wrap result in `ok()`. Data scope is platform-wide (`platformDb`) unless noted — this is the superadmin app, so "shared" = cross-tenant by design, not a bug.

| Method | Route | Handler file:line | Purpose | Auth/role | DB queries/request | Callers + trigger | Data scope | Problem |
|---|---|---|---|---|---|---|---|---|
| GET | `/v1/admin/students` | `students/route.ts:7` | List students, filterable | super_admin | `listStudents`: 2 raw (ids+count) + 1 `findMany` = 3 | students list page / mount | platform | none |
| GET | `/v1/admin/teacher-agreements` | `teacher-agreements/route.ts:7` | List agreement proposals | super_admin | 1 (delegates to server-core) | teacher-agreements page / mount | platform | none |
| GET | `/v1/admin/audit-logs` | `audit-logs/route.ts:7` | List audit log entries, paginated | super_admin | `listAuditLogs`: findMany+count (parallel) + up to 2 more `user.findMany` lookups = 2-4 | audit page / mount+filter | platform | Paginated correctly (page/limit, real `count`). Fine. |
| GET | `/v1/admin/whatsapp-messages` | `whatsapp-messages/route.ts:7` | List WhatsApp messages | super_admin | 2 (findMany+count parallel) | whatsapp page / mount | platform | none |
| GET | `/v1/admin/audit-logs/actions` | `audit-logs/actions/route.ts:7` | Distinct audit action names | super_admin | 1 `groupBy` (capped 300, DB-side distinct) | audit page filter dropdown / mount | platform | none — comment in file notes this was fixed from an in-memory-distinct-after-take bug |
| GET | `/v1/admin/students/[id]` | `students/[id]/route.ts:7` | Student detail | super_admin | `getStudent`: 1 + 3 parallel + up to 1 more (parents) = 4-5 | student detail page / mount | platform, per-record | none |
| GET | `/v1/admin/collaboration-requests` | `collaboration-requests/route.ts:7` | List collab requests | super_admin | `listCollaborationRequests`: findMany+count (2) + 3 parallel lookups (+2 if `q`) = 5-7 | collab page / mount+filter | platform | none, well-batched |
| GET | `/v1/admin/session-settlements` | `session-settlements/route.ts:7` | List session settlements | super_admin | `listSessionSettlements`: 2 (findMany+count) + 5 parallel lookups = 7 | settlements page / mount+filter | platform | none, well-batched, no N+1 despite many joined entities |
| GET/PUT | `/v1/admin/revenue-split` | `revenue-split/route.ts:20,24` | Get/set global platform-teacher-center split | super_admin | 1 read / update+audit write | wallet/finance settings page | platform singleton config | none |
| GET | `/v1/admin/registrations` | `registrations/route.ts:7` | Pending/active/rejected registrations queue | super_admin | `listRegistrations`: 4 parallel + up to 2 more (admins/adminUsers) = 4-6 | registrations page / mount+tab | platform | Fixed N+1 per in-code comment (previously unbounded centers + `take:200` silent-truncated teachers); now both paginated. Shared page across 2 lists is a deliberate simplification, documented. |
| GET | `/v1/admin/deletion-requests` | `deletion-requests/route.ts:7` | List account-deletion queue | super_admin | delegates to `@repo/server-core` (not read in depth) | deletion-requests page / mount | platform | not deeply inspected — package outside app tree, out of scope per skim priority |
| GET | `/v1/admin/contact-submissions` | `contact-submissions/route.ts:7` | List contact form submissions | super_admin | `listContactSubmissions`: 3 parallel (findMany+count+newCount) + 1 more (handlers) = 4 | contact page / mount+filter | platform | none |
| GET | `/v1/admin/blacklist` | `blacklist/route.ts:7` | List platform blacklist entries | super_admin | `listPlatformBlacklist`: 2 parallel + 1 more (users) = 3 | blacklist page / mount+filter | platform | none |
| DELETE | `/v1/admin/students/[id]/unlink-parent` | `students/[id]/unlink-parent/route.ts:8` | Unlink a parent from a student | super_admin | `unlinkParent`: findUnique + update + audit write = 3 | student detail page / click | per-record, audited | none |
| POST | `/v1/admin/students/[id]/blacklist` | `students/[id]/blacklist/route.ts:10` | Platform-blacklist a student/user | super_admin | `platformBlacklistUser`: findUnique+findFirst+update+create+cascade(`applyEnrollmentCascade`: findMany+updateMany+createMany) ≈ 7 | student detail page / click | per-record, audited, cascades enrollments | none for GET traffic; write path is bounded by student's own enrollment count, not per-request hot path |
| POST | `/v1/admin/students/[id]/link-parent` | `students/[id]/link-parent/route.ts:10` | Link a parent to a student | super_admin | `linkParent`: 2 parallel + findFirst + create/update + audit = 4-5 | student detail page / click | per-record, audited | none |
| POST | `/v1/admin/teacher-agreements/[id]/reject` | `teacher-agreements/[id]/reject/route.ts:7` | Reject a teacher agreement proposal | super_admin | tx (server-core) + audit write ≈ 2-3 | agreements page / click | per-record, audited | none |
| POST | `/v1/admin/teacher-agreements/[id]/terminate` | `teacher-agreements/[id]/terminate/route.ts:7` | Terminate an active agreement | super_admin | tx + audit ≈ 2-3 | agreements page / click | per-record, audited | none |
| POST | `/v1/admin/teacher-agreements/[id]/approve` | `teacher-agreements/[id]/approve/route.ts:11` | Approve a teacher agreement | super_admin | tx + audit ≈ 2-3 | agreements page / click | per-record, audited | none |
| GET/PUT | `/v1/admin/wallet-settings` | `wallet-settings/route.ts:12,23` | Get/set global wallet top-up min/max | super_admin | 1 read / findFirst+update-or-create (+1 retry on unique-violation race) | wallet settings page | platform singleton config | none — documented single-retry-not-loop pattern for concurrent first-save race |
| GET | `/v1/admin/subscriptions` | `subscriptions/route.ts:7` | List subscriptions | super_admin | `listSubscriptions`: findMany+count (2) + 3 parallel lookups (+2 if `q`) = 5-7 | subscriptions page / mount+filter | platform | none, well-batched |
| GET | `/v1/admin/payment-intents` | `payment-intents/route.ts:7` | List payment intents | super_admin | `listPaymentIntents`: findMany+count (2) + 4 parallel lookups (+1 if `q`) = 6-7 | payments page / mount+filter | platform | none, well-batched, drops `webhookPayload` from list rows (good — avoids shipping large blobs) |
| GET/PUT | `/v1/admin/feature-flags` | `feature-flags/route.ts:9,21` | List/set feature flags | super_admin | re-exports `@repo/server-core` service (cached per `clearFeatureFlagCache`) | feature-flags page | platform config | none |
| GET/PUT | `/v1/admin/commission-settings` | `commission-settings/route.ts:12,24` | Get/set global commission rates | super_admin | 1 read / findFirst+update-or-create+audit = 2-3 | commission settings page | platform singleton config | none |
| POST | `/v1/admin/accountants` | `accountants/route.ts:17` | Create an accountant account | super_admin | findFirst(dup check)+bcrypt.hash+create+audit = 3 DB + 1 CPU-bound hash | accountants page / form submit | platform, new record | none |
| GET | `/v1/admin/messaging/blocks` | `messaging/blocks/route.ts:7` | List user-to-user blocks | super_admin | 1 (delegates to `chat-safety.listAllBlocks`, internally paginated) | messaging oversight page / mount | platform | none |
| GET | `/v1/admin/messaging/conversations` | `messaging/conversations/route.ts:7` | Search conversations | super_admin | 1 (delegates to `chat-oversight.adminSearchConversations`) | messaging oversight page / mount+search | platform, reads minors' chats | none — child-safety-relevant surface but read pattern is fine |
| GET | `/v1/admin/messaging/reports` | `messaging/reports/route.ts:7` | List message reports for review | super_admin | 1 (delegates to `chat-safety.listReportsForReview`) | messaging oversight page / mount | platform | none |
| GET/POST | `/v1/admin/points/rules` | `points/rules/route.ts:9,19` | List/create points rules | super_admin | 1 read / 1 create | points page / mount+form | platform config | none |
| GET | `/v1/admin/notifications/history` | `notifications/history/route.ts:7` | Notification history, cursor-paginated | super_admin | 1 (`findMany` with `take+1` cursor trick) | notification-log page / mount+scroll | platform | none — clean cursor pagination |
| POST | `/v1/admin/impersonation/stop` | `impersonation/stop/route.ts:12` | Stop an active impersonation session | super_admin (implicit via session) | `getSessionUser` + `auth.api.getSession` + `auth.api.stopImpersonating` + 1 audit write = 4 (incl. 2 better-auth calls, each likely 1+ DB round trip) | admin shell "stop impersonating" button / click | own session | Not role-gated via `withRole` like every sibling route — uses `withErrors` + manual `getSessionUser`; relies on `auth.api.stopImpersonating` itself refusing non-impersonated sessions. Not wrong, just inconsistent auth pattern vs. the rest of the group (worth a quick look, low severity, low traffic). |
| DELETE | `/v1/admin/messaging/messages/[id]` | `messaging/messages/[id]/route.ts:9` | Soft-delete a message | super_admin | `removeMessage`: 1 (delegates) + audit write = 2 | messaging oversight page / click | per-record, audited | none |
| GET | `/v1/admin/messaging/conversations/[id]` | `messaging/conversations/[id]/route.ts:7` | Get a conversation thread | super_admin | `getThread`: 1 (delegates to `adminGetThread`) + audit write = 2 | messaging oversight detail / mount+"load more" (via `beforeSeq`) | per-record, reads minors' chat content | Every thread VIEW writes an audit row — correct per child-safety intent, but means every open/scroll of a busy thread with many `beforeSeq` pages multiplies audit writes. Low traffic makes this a non-issue today. |
| PATCH | `/v1/admin/messaging/reports/[id]` | `messaging/reports/[id]/route.ts:14` | Resolve a message report | super_admin | `resolveReport`: 1 (delegates) + audit write = 2 | messaging oversight page / click | per-record, audited | none |
| PATCH/DELETE | `/v1/admin/points/rules/[id]` | `points/rules/[id]/route.ts:15,21` | Update/delete a points rule | super_admin | findUnique+update (2) / findUnique+delete (2) | points page / click | per-record | none |
| GET | `/v1/admin/dashboard/user-growth-chart` | `dashboard/user-growth-chart/route.ts:7` | User signups by month/role, dashboard widget | super_admin | `userGrowthChart`: 1 raw `$queryRaw` (GROUP BY month, role) | `platform-trends.tsx:56` (`useCustom`) — **fires on every mount of `/dashboard/superadmin`** | platform aggregate | Single query, but `GROUP BY` scans the **entire `users` table** (`WHERE deleted_at IS NULL`, no date filter) every single dashboard visit — no window/limit on rows scanned (only `LIMIT 120` on output groups). Fine at current scale; will need a date-bounded window or a materialized rollup once `users` grows. No caching (`force-dynamic`), no polling. |
| GET | `/v1/admin/dashboard/kpis` | `dashboard/kpis/route.ts:7` | Top-line KPI tiles | super_admin | `platformKpis`: **9** Prisma count/aggregate calls in one `Promise.all` | `platform-trends.tsx:50` — **fires on every mount of `/dashboard/superadmin`** | platform aggregate | 9 separate full-table `count()`/`aggregate()` calls per request (centers×2, users×4, transactions×2, sessions×1), all uncached, all on every dashboard visit. None are windowed by date — e.g. `session.count({status:"completed"})` and the two `transaction.aggregate` calls scan the whole table's matching rows every time. Correctness is fine (all in one round-trip via `Promise.all`); the concern is unbounded full-table aggregates with no cache/memoization as those tables grow — flagged as the primary scaling risk in this group, though acceptable at current low traffic per the task's stated scope. |
| GET | `/v1/admin/dashboard/decision-queue` | `dashboard/decision-queue/route.ts:7` | Action-needed queue (payouts, blocked, ledger, last writes) | super_admin | `decisionQueue`: **10** queries in one `Promise.all`, including 4 raw `$queryRaw` (one with a `JOIN LATERAL` per pending payout, one a `generate_series` 15-day ledger scan, one a `LEFT JOIN LATERAL` for last-writes actor resolution) | `super-admin-dashboard.tsx:63` — **fires on every mount of `/dashboard/superadmin`** (this IS the dashboard page) | platform aggregate, cross-money-tables | Heaviest of the 4 dashboard endpoints: 10 concurrent queries, several are non-trivial raw SQL (LATERAL joins, `generate_series`). All correctly batched via `Promise.all` (no N+1 in the JS sense — the "per row" work happens inside SQL). No caching/memoization; every dashboard nav re-runs all 10. Acceptable at 2-role/low-traffic but is the one to revisit first if the dashboard becomes a landing page for more staff. |
| GET | `/v1/admin/dashboard/revenue-chart` | `dashboard/revenue-chart/route.ts:7` | Commission revenue chart (weekly/monthly) | super_admin | 1 raw `$queryRaw` (`date_trunc` + `LIMIT 24`) | `platform-trends.tsx:52` — **fires on every mount of `/dashboard/superadmin`** | platform aggregate | Single bounded query (`LIMIT 24`), no problem |
| GET | `/v1/admin/collaboration-requests/[id]` | `collaboration-requests/[id]/route.ts:7` | Collab request detail | super_admin | `getCollaborationRequest`: 1 + 6 parallel (2 conditional) = 5-7 | collab detail page / mount | per-record | none, well-batched |
| GET | `/v1/admin/session-settlements/export` | `session-settlements/export/route.ts:7` | Export settlements to .xlsx | accountant, super_admin | Reuses `listSessionSettlements` (7 queries) with `limit:5000`, capped at `MAX_ROWS=5000`; workbook building loop is in-memory only, no per-row DB calls | settlements page / click "export" | platform, bulk | Runs the SAME service the screen uses (per repo's "an export runs the same service function" invariant) — correct. `IN (...)` lookups can carry up to 5000 ids per batch at the cap; acceptable, bounded, not per-request-hot-path. |
| PUT/DELETE | `/v1/admin/revenue-split/per-student-rate` | `revenue-split/per-student-rate/route.ts:19,24` | Set/clear the M2 per-student rate | super_admin | update or create + audit (server not fully read, small) | wallet/finance settings page | platform singleton config | none |
| GET | `/v1/admin/registrations/count` | `registrations/count/route.ts:7` | Pending registrations badge count | super_admin | `countPendingRegistrations`: 2 parallel counts | sidebar badge / mount (possibly polled — not confirmed in this pass) | platform aggregate | Not traced for polling in this pass (out of the 4 dashboard files in scope); cheap (2 counts) regardless |
| POST | `/v1/admin/deletion-requests/[id]` | `deletion-requests/[id]/route.ts:21` | Approve/reject/anonymize a deletion request | super_admin | delegates to `@repo/server-core` account-deletion service (not read in depth) | deletion-requests page / click | per-record | not deeply inspected — out of scope package |
| GET | `/v1/admin/points/students/[id]/ledger` | `points/students/[id]/ledger/route.ts:8` | Student points ledger | super_admin | findUnique + findMany = 2 | student points detail / mount | per-record | none |
| POST | `/v1/admin/points/students/[id]/adjust` | `points/students/[id]/adjust/route.ts:16` | Manually adjust a student's points | super_admin | findUnique+update+create = 3 | student points detail / form submit | per-record, ledgered | none |
| POST | `/v1/admin/contact-submissions/[id]/status` | `contact-submissions/[id]/status/route.ts:16` | Triage a contact submission | super_admin | findUnique+update+auditLog.create = 3 | contact page / click | per-record, audited | none |
| POST | `/v1/admin/blacklist/[id]/remove` | `blacklist/[id]/remove/route.ts:12` | Lift a blacklist entry | super_admin | `removeBlacklistEntry`: findUnique + (conditional update) + update + `reverseEnrollmentCascade` (5 parallel + N sequential per-row `update` calls in a `for` loop, one per cascaded journal entry) | blacklist page / click | per-record, cascades enrollments | `reverseEnrollmentCascade` (packages/server-core/src/services/blacklist/blacklist.ts:202-209) updates `blacklistCascadeAction` rows ONE AT A TIME in a `for` loop rather than a batched `updateMany`, because each row's `reversal` value differs — genuine per-row N+1 in a write path. Bounded by how many enrollments one student had cascaded (small in practice), and this is a rare admin action, not hot-path GET traffic, so low real-world impact given the group's low-traffic profile. |
| POST | `/v1/admin/collaboration-requests/[id]/decide` | `collaboration-requests/[id]/decide/route.ts:17` | Approve/reject a collab request | super_admin | delegates to `center-control.ts::decideCollaborationRequest` (not fully read; likely tx + audit) | collab page / click | per-record, audited | not deeply inspected |
| POST | `/v1/admin/platform/students/[studentId]/move` | `platform/students/[studentId]/move/route.ts:17` | Move a student between centers | super_admin | `moveStudentBetweenCenters`: 3 parallel counts + update + upsert + **2 sequential audit writes in a `for` loop** (one per center) = 7 | platform student detail / click | per-record, cross-tenant write | 2-iteration loop is intentional (one audit row per affected center per the repo's own decision doc) — not a real N+1 concern at this bound |
| POST | `/v1/admin/platform/students/[studentId]/verify-dob` | `platform/students/[studentId]/verify-dob/route.ts:17` | Verify a student's date of birth | super_admin | `verifyStudentDateOfBirth`: not fully read; likely findUnique+update+audit ≈ 3 | platform student detail / click | per-record | not deeply inspected |
| POST | `/v1/admin/platform/users/[userId]/force-logout` | `platform/users/[userId]/force-logout/route.ts:16` | Force-logout a user (revoke sessions) | super_admin | `forceLogoutUser`: not fully read; likely sessions delete/update + audit ≈ 2-3 | platform user detail / click | per-record, security-sensitive | not deeply inspected |

## Dashboard aggregate check (as requested)

- **All 4 dashboard endpoints fire together on every navigation to `/dashboard/superadmin`.** `SuperAdminDashboard` (`features/admin/super-admin-dashboard.tsx:63`) calls `decision-queue` directly and renders `<PlatformTrends />` (line 237), which itself calls `kpis`, `revenue-chart`, and `user-growth-chart` (`features/admin/platform-trends.tsx:50-56`) — 4 independent `useCustom` fetches, all on mount, no batching/combining endpoint.
- **No polling found.** Grepped both files for `refetchInterval`/`pollingInterval`/`interval` — none present. Refine's `useCustom` here has no interval config, so these are fetch-on-mount only, not auto-refreshed.
- Combined per-nav DB load across the 4 endpoints: **1 (revenue-chart) + 1 (user-growth-chart) + 9 (kpis) + 10 (decision-queue) ≈ 21 queries fired concurrently every time an operator opens the dashboard.** All uncached (`force-dynamic` on every route). This is the single biggest concentration of DB work in the group, though still acceptable given the stated 2-role/low-traffic profile.

---

## Superadmin API inventory — finance/misc (v1/finance/**, v1/me, v1/notifications, v1/search, v1/security/csp-report, health, auth)

Baseline note: every `withRole`/`requireSession` call does one `auth.api.getSession` DB round trip
(`apps/superadmin/src/lib/auth/session.ts:35`) before the handler body runs — not repeated per row below.

| Method | Route | Handler file:line | Purpose (<=8 words) | Auth/role | DB queries/request (approx count; note loops/N+1) | Callers (component file) + trigger | Data scope | Problem (if any) |
|---|---|---|---|---|---|---|---|---|
| GET | /v1/finance/dashboard | `v1/finance/dashboard/route.ts:7` → `lib/services/finance/accountant.ts:51 financeDashboard` | Accountant home KPI aggregates | accountant, super_admin | 5 aggregates, parallel (`Promise.all`) | dashboard screen, mount | shared (platform-wide) | No date range — full-table aggregate over ALL history every load, every visit; no caching |
| GET | /v1/finance/reports/trial-balance | `v1/finance/reports/trial-balance/route.ts:6` → `finance-reports.ts:218 trialBalance` | Trial balance by transaction type | accountant, super_admin | 1 `groupBy` | reports screen, mount/filter change | shared | None found — well-bounded |
| GET | /v1/finance/reports/revenue | `v1/finance/reports/revenue/route.ts:6` → `finance-reports.ts:18 revenueReport` | Revenue series by period bucket | accountant, super_admin | 1 raw SQL `$queryRaw`, `LIMIT 300` | reports screen, mount/period toggle | shared | None found |
| GET | /v1/finance/reports/refunds | `v1/finance/reports/refunds/route.ts:6` → `finance-reports.ts:180 refundsReport` | Refunds report totals + rows | accountant, super_admin | 3 queries parallel (2 aggregate + `findMany take:500`) | reports screen, mount/filter | shared | `findMany` capped at 500 with no pagination — silently truncates on a big date range, no `skip`/page param exposed |
| GET | /v1/finance/reports/center-statement/[centerId] | `.../center-statement/[centerId]/route.ts:6` → `finance-reports.ts:118 centerStatement` | One center's statement totals | accountant, super_admin | 1 lookup + 5 aggregates parallel = 6 | center detail screen, mount | per-tenant (one center) | None found — good use of parallel aggregates |
| GET | /v1/finance/reports/teacher-statement/[teacherId] | `.../teacher-statement/[teacherId]/route.ts:6` → `finance-reports.ts:64 teacherStatement` | One teacher's statement totals | accountant, super_admin | 2 lookups + 1 raw SQL join + 2 aggregates parallel = 5 | teacher detail screen, mount | per-tenant (one teacher) | None found |
| GET | /v1/finance/invoices | `v1/finance/invoices/route.ts:9` → `packages/server-core/.../invoices.ts:56 listInvoices` | List invoices, paginated | accountant, super_admin | 2 (findMany+count, parallel) | invoices list screen, mount/filter/page | shared, filterable | None — paginated (default limit 25) |
| POST | /v1/finance/invoices | `v1/finance/invoices/route.ts:31` → `invoices.ts:112 generateInvoice` | Generate a new invoice | accountant, super_admin | payment_receipt: 1 lookup + create + update + audit ≈4; statement types: calls `teacherStatementAmounts`/`centerStatementAmounts` (below) + create+update+audit | invoices screen, click "Generate" | shared/per-target | `teacherStatementAmounts`/`centerStatementAmounts` (server-core `invoices.ts:13-48`) run 4 DB calls **sequentially** (`await` one at a time), not `Promise.all` like the read-side report does — same numbers, duplicated derivation path, slower and could drift |
| GET | /v1/finance/invoices/[id] | `v1/finance/invoices/[id]/route.ts:7` → `getInvoice` | Fetch one invoice | accountant, super_admin | 1 | invoice detail screen | per-record | None |
| GET | /v1/finance/invoices/[id]/pdf | `v1/finance/invoices/[id]/pdf/route.ts:8` → `getInvoice` + `invoice-pdf.ts:23 renderInvoicePdf` | Render invoice as PDF | accountant, super_admin | 1 DB + synchronous in-request PDF render (pdf-lib) | invoice detail, click "Download/View PDF" | per-record | PDF built synchronously inline in the GET handler, blocking the response (small doc so low cost today, but no queue/async path) |
| POST | /v1/finance/invoices/[id]/send-email | `.../send-email/route.ts:7` → `invoices.ts:234 sendInvoiceEmail` | Email invoice PDF to recipient | accountant, super_admin | 2 DB (getInvoice, user lookup) + synchronous `await sendMail` (SMTP) | invoice detail, click "Send email" | per-record | SMTP send is awaited in-request — request blocks on mail server latency; no background job/queue |
| GET | /v1/finance/payouts | `v1/finance/payouts/route.ts:7` → `payouts.ts:195 listPayouts` | List payouts + beneficiary info | accountant, super_admin | 1 `findMany(take:200)` + 3 hydration queries parallel = 4 | payouts screen, mount/filter | shared | Hardcoded `take: 200`, **no pagination** (no `skip`/page param from the route at all) — silently caps the list |
| POST | /v1/finance/payouts | `v1/finance/payouts/route.ts:12` → `payouts.ts:118 generatePayouts` | Batch-generate payouts for all eligible | accountant, super_admin | 2 list queries + 1 bulk stats query, then per 25-id chunk: 1 lock query + 1 groupBy + createMany + auditLog (sequential chunks, not parallel — intentional for tx safety) | payouts screen, click "Generate" | shared, platform-wide | Chunked sequentially by design (correctness > speed); could be slow with many beneficiaries but bounded and documented |
| GET | /v1/finance/payouts/counts | `v1/finance/payouts/counts/route.ts:7` → `payoutStatusCounts` | Payout counts by status | accountant, super_admin | 1 `groupBy` | payouts screen, mount | shared | None |
| POST | /v1/finance/payouts/[id]/approve | `.../approve/route.ts:7` → `approvePayout` | Approve a pending payout | accountant, super_admin | ~4 (find, updateMany, findUniqueOrThrow, audit) + recipient lookup + notify | payouts screen, click "Approve" | per-record | None (maker-checker enforced) |
| POST | /v1/finance/payouts/[id]/pay | `.../pay/route.ts:13` → `payPayout` | Mark payout paid, decrement wallet | accountant, super_admin | ~6 sequential (find, updateMany, wallet decrement, transaction create, findUniqueOrThrow, audit) + notify | payouts screen, click "Pay" | per-record | None — correctness-driven sequential writes inside one tx, appropriate |
| POST | /v1/finance/payouts/[id]/reject | `.../reject/route.ts:11` → `rejectPayout` | Reject a payout | accountant, super_admin | 2 (updateMany, update) | payouts screen, click "Reject" | per-record | None |
| GET | /v1/finance/payouts/[id]/receipt | `.../receipt/route.ts:7` → `getPayoutReceipt` | Payout receipt data | accountant, super_admin | 1 | payouts screen, click "Receipt" | per-record | None |
| GET | /v1/finance/refunds | not read in depth (light tier) | list/derive refunds | accountant/super_admin (assumed via withRole) | n/a (not opened) | — | — | not deep-dived per task scope |
| POST | /v1/finance/refunds | `v1/finance/refunds/route.ts:27` → `refunds.ts:33 refundLessonForStudent` | Clawback refund from teacher/center wallet | super_admin only | ≥5 sequential lookups (payment, dup-check, session, course, then wallet writes) inside one tx | refunds screen, click "Refund" | per-record, writes wallets | Sequential lookups but inside a single tx for correctness — acceptable for a rare, high-stakes op |
| GET | /v1/finance/reports/refunds (see above) | — | — | — | — | — | — | — |
| GET | /v1/finance/alerts | `v1/finance/alerts/route.ts:6` → `finance-reports.ts:242 financeAlerts` | Dashboard risk alerts | accountant, super_admin | 5 aggregates/counts parallel | dashboard screen, mount | shared | None — well-bounded, parallel |
| GET | /v1/finance/commission-settings | `v1/finance/commission-settings/route.ts:7` → `commission-admin.ts:5 getGlobalCommission` | Read global commission config | accountant, super_admin | 1 | settings screen, mount | shared | None |
| GET | /v1/finance/subscriptions | `v1/finance/subscriptions/route.ts:7` → `subscriptions-admin.ts:23 listSubscriptions` | List subscriptions, paginated | accountant, super_admin | up to 2 (search) + 2 (list+count) + 3 (hydrate) = ≤7, all parallel/bounded | subscriptions screen, mount/filter/page | shared, filterable | None — paginated, IN-clause hydration avoids N+1 |
| GET | /v1/finance/transactions | `v1/finance/transactions/route.ts:7` → `accountant.ts:19 listTransactions` | List transactions, paginated | accountant, super_admin | 2 (findMany+count, parallel) | transactions screen, mount/filter/page | shared, filterable | None — paginated |
| GET | /v1/me | `v1/me/route.ts:12` | Current user profile | any authenticated session | 1 | app shell (`dashboard-shell.tsx` via `useGetIdentity`), mount/every nav (React Query default staleTime 0 → refetch on focus/mount) | per-user | None serious; refetches on every focus/mount by default (no `staleTime` override), acceptable for a single-row query |
| PATCH | /v1/me | `v1/me/route.ts:49` | Update current user profile | any authenticated session | 1 | profile/settings screen, click "Save" | per-user | None |
| GET | /v1/me/prefs | `v1/me/prefs/route.ts:10` | Read onboarding-tour prefs | any authenticated session | 1 | onboarding tour component, mount | per-user | None |
| PATCH | /v1/me/prefs | `v1/me/prefs/route.ts:20` | Update prefs (tour completed) | any authenticated session | 1 upsert | onboarding tour, click "dismiss" | per-user | None |
| GET | /v1/notifications | `v1/notifications/route.ts:10` | List notifications, paginated | any authenticated session | 2 (findMany+count, parallel) | notifications screen (`useList`) + app shell unread-badge (`dashboard-shell.tsx:143`, `pageSize:1`), both on mount/nav | per-user | Fetched twice independently per nav in different shapes (full list vs. unread count) — no shared cache key between the two `useList` calls; no `setInterval`/`refetchInterval` polling found anywhere (only default React Query focus/mount refetch) |
| POST | /v1/notifications/[id]/read | `v1/notifications/[id]/read/route.ts:9` | Mark one notification read | any authenticated session | 2 (findFirst ownership check + update) | notifications screen, click a notification | per-user | None |
| POST | /v1/notifications/read-all | `v1/notifications/read-all/route.ts:8` | Mark all notifications read | any authenticated session | 1 `updateMany` | notifications screen, click "Mark all read" | per-user | None |
| GET | /v1/search | `v1/search/route.ts:7` → `global-search.ts:189 backOfficeSearch` | Global command-palette search | super_admin, accountant | up to 3 providers in parallel; `people` does 2 sub-queries, `centers`/`paymentIntents` 1 each ≈ 3-4 total | command palette (`dashboard-shell.tsx` via `useGlobalSearch`), keystroke | shared, filtered by role | Client IS debounced (220ms, min length 2, `use-global-search.ts:7-9`) — no missing-debounce issue found. `centers` provider does 4-column `contains`/ILIKE OR-search with no visible trigram index — full-scan risk on a large `centers` table as data grows |
| POST | /v1/security/csp-report | `v1/security/csp-report/route.ts:9` | Ingest CSP violation reports | none (public, rate-limited 60/60s) | 0 DB (in-memory/log capture, not inspected further) | browser CSP violation reporter | shared | None found |
| GET/HEAD | /health | `health/route.ts:6` | Liveness/health check | none | not inspected (delegates to `@repo/server-core/http/health`) | uptime monitor/load balancer | shared | Light tier, not deep-dived |
| GET/POST | /auth/[...all] | `auth/[...all]/route.ts:11,13` | better-auth handler (login/session/sign-out) | none (auth itself) | sign-out path adds 1 extra `deleteMany` for surplus session revocation | login/auth flows | per-user | None found in the wrapper; underlying better-auth internals not inspected |
