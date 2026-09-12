# Delivery mode, and finding a teacher by day

Built 2026-09-08 — awaiting review. Two asks, one shape of change:

1. a student choosing a class can say whether they want it **online, in person,
   or either**;
2. a student can pick a **day** — "who is teaching on Wednesday?" — optionally
   narrowed by subject, and subscribe from that answer.

## What a course now carries

`courses.delivery_mode` (`onsite` | `online` | `hybrid`, default `onsite`) and
`courses.online_url`. Migration `20260910120000_course_delivery_mode`.

The default is the point: every course that existed before this migration was an
onsite course, so `onsite` is not a guess — it is what those rows already meant.
Nothing is backfilled and no row changes meaning.

**The database enforces one thing only:** an onsite course carries no meeting
link (`courses_delivery_mode_shape`). Prisma cannot model that CHECK and
`prisma migrate dev` will offer to drop it — refuse. The rule the DB
deliberately does NOT enforce is "an online course must have a link": a teacher
routinely creates the group before the Zoom room exists, and a link added later
must not be blocked by a constraint. That half lives in `resolveDelivery()`
(`packages/server-core/src/services/center/courses.ts`), where it can be relaxed
without a migration.

`resolveDelivery` is the single derivation, shared by all three writers — the
centre create path, the teacher-direct create path, and both patch paths — so no
writer can invent its own idea of what a delivery shape is.

## The meeting link is money

A link is the thing being paid for: anyone holding it sits in the lesson for
free. So it is **not** returned by discovery at all — not by `searchCourses`,
not by `searchTeachersByDay` — and `GET /api/v1/courses/[id]`, which is readable
with no session, returns it only to the teacher, the course's centre staff, a
student with an ACTIVE enrollment, or that student's approved parent. Everyone
else gets `onlineUrl: null` and a `hasOnlineUrl` boolean. `GET /api/v1/courses`
does the same on its one signed-out-reachable arm (`?centerId=`).

Both suppressions are asserted by the suite, not left to reviewer memory.

## "Who teaches on Wednesday" adds no reach

`searchTeachersByDay` is the same active-course rows `searchCourses` reads,
pivoted onto the teacher. It builds its WHERE from the same arms — the same
student grade/track scoping, the same active-centre arm — so a course that would
not appear in the course search for a given student cannot appear in the teacher
search either. This is the global-search rule (a new surface offers nothing the
role could not already open) applied to discovery.

A teacher whose user row is suspended or gone is dropped from the answer even
though their course rows survive.

## The day filter changed meaning: any-of, not all-of

`daysOfWeek` was already accepted by `/api/v1/search/courses` and was
implemented as `hasEvery` — "runs on ALL these days". No caller passed it, so
nothing depended on that reading. A student ticking Wednesday and Thursday means
"either", so it is now `hasSome`. Anything reasoning about that parameter before
2026-09-08 was reasoning about a filter with no UI.

## One checkout, not two

The new screen subscribes with the same buttons the subjects screen uses, because
they are literally the same component: `CourseSubscribeActions` was extracted out
of `student-subjects-screen.tsx` and is now rendered by both. Same endpoints,
same idempotency-key shape, same wallet rule. NO SECOND MONEY ENGINE, applied to
the UI layer: a second discovery surface must not grow a second way to pay.

## What was deliberately NOT built

**A student cannot choose, per subscription, whether THEY attend a hybrid class
online or in person.** That is the other half of the original ask and it is
money-touching, not cosmetic: an online attendee cannot do a counter or door
check-in, so `AttendanceStatus`, the counter board and `distribution.ts` (who
counts as present; per-attending-student pricing) would all have to be
re-decided. It is written up separately in
[plans/per-student-attendance-mode.md](../plans/per-student-attendance-mode.md)
and needs its own approved plan. Until then the choice belongs to the course, and
a hybrid class means the teacher runs both — which is what centres do today.

## Proofs

`apps/erp/tests/db/course-delivery-and-teacher-day.test.ts` — 20/20 against the
local test database, including: the service and the DATABASE each refusing a link
on an onsite class; `online` matching hybrid; `hybrid` being literal; the day
filter answering either-of; the Wednesday teacher appearing and the Sunday-only
teacher not; `matchedDays` naming only the requested day; a suspended teacher
vanishing; another year's class staying invisible; and the meeting link absent
from both search shapes.

Full erp local DB set after the change: 82 suites, 1939 assertions, 0 failed.
check-types 10/10.

**[local test DB, dev, Neon test AND production — 2026-09-08] migration 79 is
applied to all four; verify-db 32/32 on each.** `expected-db-shape.json` is at 79
(tables stay 83 — a column is not a table). Each Neon apply followed a read-only
pre-flight: label read from the database itself, datasource host line checked,
`migrate status` proving exactly one pending migration with no sibling riding
along, and a row census before and after. Production
(`ep-mute-rice-b2s8gg42`) held **0 courses, 0 payments, 0 transactions** on both
sides of the apply, so the `ADD COLUMN ... DEFAULT` rewrote nothing. Schema is
ahead of the code, which is the 2026-08-02 ordering lesson.

| env | endpoint | rows before → after |
|---|---|---|
| local test | localhost:5432/edura_test | fixtures only |
| dev | `ep-withered-field-b23csnyq` | 19 users / 1 course → unchanged |
| test | `ep-morning-snow-b269im2n` | 23 users / 6 courses / 33 payments / 141 transactions → unchanged |
| production | `ep-mute-rice-b2s8gg42` | 2 users / 0 courses / 0 payments / 0 transactions → unchanged |
