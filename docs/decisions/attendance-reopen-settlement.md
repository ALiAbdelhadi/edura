# The edit window yields to an unsettled lesson — reopen-for-settlement (T-9)

**Date:** 2026-08-21 · **Decided by:** Ali (API session 2 approval) · **Status:** shipped (server)

## The problem, as measured

`EDIT_WINDOW_DAYS = 7` froze attendance editing, while settlement had no
deadline and `completeSession` never consulted the lock. For a lesson older
than 7 days with **no attendance recorded**, the product said three things in a
row that could not all be satisfied: the group list said the lesson is *not
closed*, the register said *"التعديل مغلق"*, and the settle card said *"سجّل
الحضور الأول"*. Close it → record attendance first → you may not record
attendance. The teacher's share of that lesson could never be credited.
Measured on dev (`showcasedemo-hossam`'s 8 August lesson) before this change.

Worse, found during the 2026-08-21 re-verification: the lock was not even
consistent. `bulkMarkAttendance` — the register's own PUT — never consulted
`isLocked`, so the GET reported `locked: true` while the bulk write path was
open. The lock was decorative exactly where it claimed to bind.

## The decision

Two halves, approved together, because either alone is wrong:

1. **The lock becomes real.** `bulkMarkAttendance` now enforces the same
   predicate the GET reports and `editAttendance` enforces. One predicate,
   `isLocked(session)`, in one place.

2. **The lock yields — through a door, not a hole.** A session past the window
   that has **never been settled** can be *reopened* by its teacher (or their
   delegated assistant — the register is a delegated surface) **or by the
   centre that runs it** (owner, or a MANAGER):
   `POST /api/v1/sessions/[id]/attendance/reopen`. The reopen is a fact on the
   row (`attendance_reopened_at/_by`) plus an `audit_logs` row
   (`attendance.reopen`, with on-behalf-of when an assistant did it).
   Attendance gets recorded, the lesson settles normally, and `distributed_at`
   **re-arms the lock permanently**.

## The invariant that makes it safe

**Settled attendance never moves.** The reopen is honoured by the lock
predicate only while `distributed_at IS NULL`. The moment settlement runs, the
attendance facts are what the money was computed from, and the lock closes for
good — there is deliberately no force path, no superadmin override, and no way
to reopen a completed or cancelled lesson. Money correctness outranks
operational convenience, in both directions: the stranded case is now
reachable, and the settled case is now *actually* frozen (it wasn't, via the
bulk bypass).

## Rejected alternatives

- **A settlement deadline** (expire unsettled lessons after N days): destroys
  real money — the teacher taught the lesson; the platform refusing to ever
  credit it because paperwork was late is confiscation with a timer.
- **Silently exempting old-but-unsettled sessions from the lock**: reopens the
  register with no record of who chose to, on a surface whose facts decide
  money. An invisible exemption is the bulk-bypass bug re-implemented on
  purpose.
- ~~**Center-side reopen**~~ — **THIS REJECTION WAS WRONG, and the test suite
  caught it before merge.** It assumed a teacher account always exists to act
  with. For an **external (off-system) teacher there is none** —
  `docs/decisions/external-teachers.md` builds the entire module on the centre
  entering those lessons manually, and `buildGapReport` actively prompts a
  centre to fix "lesson without attendance" and "past lesson never completed".
  Binding the lock without a centre door therefore did not guard that
  capability, it deleted it: `external-teachers.test.ts` began failing at the
  exact line where a centre records attendance for a six-week-old
  external-teacher lesson. The centre door now exists, scoped to sessions whose
  course belongs to that centre (a teacher-direct course, `centerId IS NULL`,
  still refuses it), audited identically with `by: "center"` in the audit row
  so the two doors stay distinguishable. The rule kept is the real one: **no
  past-window write happens without an audited reopen** — not "only teachers
  may reopen".

## Proof

`apps/erp/tests/db/t9-attendance-reopen.test.ts` (18/18) — the bulk bypass is
closed, the reopen unlocks exactly the stranded case, refusals hold (in-window,
settled, double-reopen, rival teacher), the audit row lands, and a reopened
lesson re-locks after `distributedAt` is set. Section [5] covers the centre
door: a 30-day-old external-teacher lesson is locked for the centre too, the
centre reopens **its own** course's lesson (a teacher-direct one is NotFound),
records the attendance, and the audit names which door was used.

`apps/erp/tests/db/external-teachers.test.ts` (104/104) is the regression
witness for the correction above: it now opens the door before its manual
catch-up entry, which is what a real centre does.
