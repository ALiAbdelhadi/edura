# Fee-distribution & Points engine (PRD §5.1 / §5.7)

Implemented 2026-07-12. Verified end-to-end against production data.

## Trigger

`POST /api/v1/sessions/:id/complete` — the session's **teacher** or a
**center_admin** of its center marks the session completed. This:
1. Sets `session.status = "completed"`.
2. Runs `distributeSessionRevenue` (idempotent).

Files: `lib/services/finance/distribution.ts`, `lib/services/points/points.ts`.

## Money distribution (`distributeSessionRevenue`)

PRD §5.1 is a per-lesson marketplace; Edura prices per **course** and runs
recurring **sessions**. Reconciliation decisions (⚠️ **money logic — please
confirm these are the intended business rules**):

- A **"booked lesson" = one PRESENT student** in a completed session.
- **lessonPrice** per present student = `round(course.price / plannedSessions)`.
- **centerShare** per lesson = the active `CenterTeacherAffiliation.centerShare`
  for (center, teacher), default `0`. *(no data import ever populated this —
  set per-teacher shares via the affiliation to make center margins non-zero.)*
- **Platform fee = EGP 2 from teacher + EGP 2 from center per booked lesson**
  (200 + 200 piasters), exactly per PRD §5.1.

Per present student:
```
teacherNet = lessonPrice − 200 − centerShare
centerNet  = centerShare − 200
```
Effects (all in one platform-context transaction, integer piasters):
- 3 append-only `transactions` rows: `payment` (student→center, lessonPrice),
  `commission` (teacher→platform, 200), `commission` (center→platform, 200).
- `teacher_profiles.wallet_balance += teacherNet`; `centers.wallet_balance += centerNet`.
- Awards `attendance` points to the student.

**Idempotent:** if any `commission` transaction already exists for the session,
it returns `{distributed:false, reason:"already_distributed"}` and does nothing.
Ledgers are append-only — corrections happen via reversal inserts, never edits.

### Verified example (real data)
Session with price 45,000 / 16 planned sessions (→ 2,813/lesson), 13 present,
centerShare 0: teacher wallet **+33,969**, center wallet **−2,600**, platform
**+5,200**, 39 transactions, each student **+10** points. Re-run: no-op. ✓

## Points engine (`awardPoints`)

Runs inside the triggering event's transaction (no nesting). No-op when no
active `points_rules` row exists for the event. Students keyed by User id;
`points_ledger` append-only; balance on `student_profiles.points_balance`.

Wired events → default rule values (seeded, editable):

| Event | Points | Trigger |
|---|---|---|
| `attendance` | 10 | session completion (present students) |
| `online_payment` | 20 | `recordPayment` (amount > 0) |
| `teacher_rating` | 15 | `createReview` |
| `first_booking` | 50 | *(rule seeded; wire on enrollment when built)* |
| `lesson_booking` | 5 | *(rule seeded; wire on enrollment when built)* |
| `streak_bonus` | 25 | *(rule seeded; needs streak logic)* |

Student self-service endpoints: `GET /me/points`, `GET /me/points/history`
(internal_note hidden). Points-rule CRUD + manual adjustment are super_admin-only
per PRD and await the super_admin role.
