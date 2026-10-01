# Off-system ("external") teachers (built 2026-08-02 — awaiting review)

A center runs on the platform while one or more of its teachers refuses to (or
keeps their own system). The center keeps a 100% complete picture — students,
groups, attendance, grades, money — by MANUAL ENTRY, and all of it lands in the
center's ordinary reports beside everyone else.

1. **AN EXTERNAL TEACHER IS A `users` ROW, NOT A NEW ENTITY** (binding). Role
   `teacher`, `status='shell'`, `password_hash NULL`, plus
   `teacher_profiles.system_status='external'` and `managed_by_center_id`.
   Every operational table already keys on the teacher's USER id
   (courses/sessions/subscriptions/session_settlements/transactions), so
   supporting them changed NONE of them. Three consequences, each a
   requirement: no login is enforced by the door that already exists (status +
   no hash — no second gate, same reasoning as ONE SUSPENSION MECHANISM);
   converting to `enrolled` is a flip of ONE column on the SAME id, so no row
   is copied, re-pointed or re-parented and nothing CAN be lost; and
   `access_level` models a future read-only tier without pretending to enforce
   one (see #7).
2. **THE SHARED STUDENT IS ONE ROW.** The same child studying with an
   on-platform teacher AND an off-system one keeps ONE `users` row and gets a
   second Enrollment. The student↔teacher relation is `enrollments -> courses.
   teacher_id` — already many-to-many — so NO join table was added; a second
   answer to "who teaches this child" could disagree with the one attendance
   and money already run on. Dedup is two layers: `resolveOrCreateStudent`
   looks up by phone then by the new `student_profiles.national_id` BEFORE
   creating (and has no "create anyway" flag), and both keys are UNIQUE at the
   DB level as the backstop under a race.
3. **PROVENANCE IS INHERITED, NEVER PASSED BY HAND.** `data_source`
   (`system` default | `manual`) is on courses, sessions, enrollments,
   attendance_records, grades, payments, transactions, subscriptions, rosters
   and affiliations. A group created for an external teacher derives `manual`
   from the TEACHER (in `createCourse`), and subscription → payment → ledger →
   enrollment → attendance each inherit from their parent. So the ordinary
   Classes screen labels an off-system group correctly without knowing this
   feature exists. `systemStatus` and `dataSource` are SEPARATE filters on
   purpose: a teacher who joins keeps the groups the center keyed in, so those
   rows stay `manual` while their teacher is now `enrolled`.
4. **NO SECOND MONEY ENGINE.** Manual payments run through the existing
   `createWalkInSubscription` (Payment + Transaction + receipt + points +
   parent notification); lessons settle through the unchanged
   `distributeSessionRevenue`, so the center's cut is whatever the group's own
   pricing says (hall %, per-student rate, or the flat affiliation share) and
   the teacher's wallet accrues what they are owed. The ONE addition is a
   CENTER-side cash settlement (`settleWithTeacher`) — an external teacher has
   no account to request a payout with — using the same H2 conditional
   decrement every payout uses, writing a `payout` row to the same ledger, in
   the same transaction as the append-only `external_teacher_settlements`
   statement. It is NOT routed through the `payouts` queue: that is the
   platform paying out of platform-held funds, this is a center paying out of
   its own drawer.
5. **MANUAL ENTRY FAILS SILENTLY, so `buildGapReport` complains.** Seven
   findings (lesson without attendance, partial attendance, past lesson never
   completed, enrolled-unpaid, group without schedule / price / students), each
   naming the exact row to open and separated into blocking vs warning. The
   `session_not_completed` finding is the one that matters most: an uncompleted
   lesson never runs distribution, so the teacher is silently under-paid.
6. **REPORTS COMBINE BOTH KINDS BY DEFAULT.** `?systemStatus=` / `?dataSource=`
   narrow only when asked (one parser, `lib/http/provenance.ts`), and the center
   home ALWAYS reports the off-system split beside the headline whether or not a
   filter is set — a center that must change a setting to discover how much of
   its business runs off-system will not think to look.
7. **`access_level` IS MODELLED, NOT ENFORCED — stated plainly.** Taking a
   teacher off-system closes their login through `users.status` (which fires
   `sessionRevocationExtension` → the `users_revoke_sessions` trigger), and is
   REFUSED when the teacher also works with another center. `read_only` is
   where a future "let them look, not touch" goes; nothing writes it today,
   because a column claiming a restriction nothing enforces is worse than no
   column.
8. **Grades are the ONE surface that needed new code.** `createGrade` demands
   `course.teacherId === caller.id` — right for a teacher who signs in,
   impossible for one who never will. That gate was NOT loosened; a narrow
   center-side path (`manual-grades.ts`) can only reach a group belonging to an
   off-system teacher this center manages, writes the assessment owned by the
   TEACHER, and fires the same `grade_entered` notification. Everything else
   (groups, schedules, enrolment, attendance, counter check-in, cash, session
   completion) already worked for a center actor with zero changes.
9. **Ownership never leans on RLS.** `teacher_profiles` has no `center_id`, so
   `assertManagedExternalTeacher` demands BOTH the profile pointer and a live
   affiliation, explicitly, on every entry point. The one function that runs
   under platform context is `convertToExternal` — "does this teacher also work
   with another center?" is inherently cross-tenant, and under `scopedDb` the
   RLS policy hides exactly the rows that would answer yes.

Migrations (additive only): `20260803100000_teacher_invite_purpose` (enum value,
own file — Postgres cannot USE a new enum value in the transaction that adds it)
and `20260803100100_external_teachers` (3 new types, `data_source` columns with
DEFAULT `'system'` so no existing row or write changes, `student_profiles.
national_id` UNIQUE, and two append-only RLS tables:
`teacher_system_status_changes` + `external_teacher_settlements`). Each ships a
companion `rollback.sql` stating honestly what a reversal costs.
**[dev + test, applied 2026-08-02] — 47 migrations, 79 tables, verify-db 27/27
(the baseline in `expected-db-shape.json` and the `APPEND_ONLY` map in
`verify-db.ts` were updated to match).
[production, APPLIED — observed 2026-08-02] both migrations are present there
(`_prisma_migrations` carries `20260803100000_teacher_invite_purpose` and
`20260803100100_external_teachers`; production stood at 47 migrations / 79
tables before the student-code migration landed on top). The line that used to
stand here said "NOT applied" and was STALE — exactly the failure the
environment-labelling convention at the top of this file exists to catch.**

Proof: `apps/erp/tests/db/external-teachers.test.ts` **102/102** (live DB, real
center-actor authorization, real services, real money engine) — including the
shared-student scenario and a conversion that asserts eight record counts are
byte-identical before and after, against the counts the journal itself froze in
the same transaction. Regressions green: full `test:db:ci` **27 suites / 839
assertions**, root check-types 9/9, www unit 214 pass/1 skip, `bun run build`
both apps, lint error-parity with main (the 12 errors are pre-existing
privacy/terms/use-chat files). Verified live in the browser on dev: created an
off-system teacher, re-typed the same phone and watched it REUSE the child,
enrolled, took cash (receipt `RCP-NILE-2026-00002`), and read the statement,
provenance labels and gap findings on screen in Arabic/RTL. Demo data:
`prisma/external-teachers-demo-seed.ts` (`bun run seed:extteachers-demo`,
`--purge` to remove) — one center, one on-platform + two off-system teachers, a
child shared between two of them, and deliberately-broken groups so the gaps
report has real findings. ZERO money rows seeded (per the Conventions rule):
take a payment and settle it in the preview, which is the part worth seeing.
