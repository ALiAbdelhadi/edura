# Per-student online / in-person attendance — plan, NOT built

Deferred 2026-09-08, at the same time `delivery_mode` shipped on the course
(see [decisions/course-delivery-and-teacher-day.md](../decisions/course-delivery-and-teacher-day.md)).

## The ask

A hybrid class runs both ways at once. Today the course declares that, and the
student subscribes to the course. The remaining half of the ask is for the
STUDENT to declare how they personally attend, and for the platform to hold them
to it.

## Why it is not a UI change

The moment a student is marked "attending online", four things that currently
have one answer get two:

1. **Attendance.** `counterCheckin` and the door check-in both assume a body at a
   desk. An online attendee has neither, so "present" for them must be minted by
   something else — a join event, a teacher's manual mark, or nothing at all. A
   `counter_only` status already exists for "checked in but not present"; an
   online student is the mirror case and must not silently reuse it.
2. **Money.** `distribution.ts` pays teacher and centre from the number of
   students PRESENT, and `per_attending_student` room pricing charges the centre
   fee per attending head. A student attending online occupies no seat in the
   hall. Whether the centre is owed its per-student fee for them is a commercial
   decision, not an implementation detail, and it changes what a settled lesson
   is worth.
3. **The counter board.** It shows who is expected today. An online cohort either
   belongs on it (and must be visually separated) or does not appear at all.
4. **Capacity.** `maxStudents` is currently one number. A hybrid class has a hall
   capacity and an online capacity, and they are not the same number.

## What would have to be decided before any code

- Is the online seat priced the same as the hall seat?
- Does the centre earn its per-student fee on an online attendee?
- Who marks an online student present, and from what evidence?
- Can a student switch mid-month, and does that re-price anything?
- One capacity or two?

## Sketch, once those are answered

- `subscriptions.attendance_mode` (`onsite` | `online`), constrained to be
  non-null only where the course is `hybrid`, defaulting to the course's own mode
  otherwise. It belongs on the subscription, not the enrollment: decision #2 says
  the subscription is the payment coverage and the enrollment is the roster link,
  and this is a coverage property.
- A new `AttendanceStatus` arm, or an `attended_online` flag on
  `attendance_records` — NOT an overload of `counter_only`, whose whole point is
  that it does not count as present.
- `resolveLessonPrice` and `distribution.ts` take the mode as an input rather
  than inferring it, so there stays exactly one derivation of what a lesson is
  worth.
- Two capacity columns, or an explicit decision that online is uncapped.

Nothing above is built. Do not start it from this sketch alone — the five
questions come first.
