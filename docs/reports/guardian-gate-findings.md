# Guardian channel — findings for the workstream owner

**Date:** 2026-07-26
**Status:** read-only findings. No code changed. Nothing implemented.
**Audience:** whoever picks up the guardian workstream.
**Subject:** the child-safety guardian-email gate built 2026-07-25, still
uncommitted at the time of writing.

> **File paths are as of this document's date.** The tree moved *during* this
> investigation: `walk-in.ts` relocated from
> `apps/www/src/lib/services/walk-in/` into
> `packages/server-core/src/services/walk-in/` (the app path is now a re-export
> shim) between two searches minutes apart. Verify paths before relying on them.

## The four questions

### 1. Does the guardian reminder sweep run today?

**No. Nothing invokes it, in any environment.**

There is no `vercel.json`, no `.github/`, no CI, no scheduler config, no
`package.json` script, and no external caller documented in
`docs/guides/deployment.md` or `docs/guides/runbook.md`. The only callers of
`/api/v1/cron/[job]` anywhere in the repo are two test files and one Bruno
manual-request file.

This is not specific to this feature — it is true of all six jobs. Written up
separately in **[cron-jobs-unscheduled.md](cron-jobs-unscheduled.md)**, which
also ranks the other jobs by severity (`expire-subscriptions` is the serious
one; it means paid access never lapses).

### 2. Every cron route, and what invokes each

See the table in [cron-jobs-unscheduled.md](cron-jobs-unscheduled.md#the-surface).
Short version: one route, six jobs, and the "invoked by" column reads `nothing`
for all six. `apps/superadmin` has no cron route.

### 3. Does the lock hold when the ladder is broken?

**Yes. The gate is structurally independent of the reminder ladder, and a minor
with `guardian_contact_due_at = NULL` is locked out of adult-facing messaging.**

The decision, in [chat-guardian.ts:107](../../packages/database/src/queries/chat-guardian.ts:107):

```
locked: minor && !hasGuardianChannel
```

`dueAt` is read one line above (`:102`) and used **only** to populate the
reported `dueAt` and `overdue` fields (`:110-111`). It is not an input to
`locked`, so no value of `guardian_contact_due_at` — `NULL`, future, or past —
can unlock adult messaging. `hasGuardianChannel` is satisfied only by an
approved parent link whose parent has an email, or by
`student_profiles.guardian_email`.

Default-closed holds at both ends: a student with no profile row at all resolves
through `decide(null, …)` → minor, no channel → locked; and
`guardianLockedStudentIds` includes unknown ids rather than dropping them.

Enforcement points, both from the same predicate:
- single pair — [chat-scope.ts:936](../../packages/database/src/queries/chat-scope.ts:936), throws `guardian_required`;
- directory — `guardianFilter`, [chat-scope.ts:808](../../packages/database/src/queries/chat-scope.ts:808), so search cannot offer a contact the gate would refuse.

**Conclusion: gaps 1–3 are an operations and welfare problem, not a safety one.**
A minor whose clock never starts is still locked out of adult messaging; what
they lose is the reminder that would tell them how to fix it, and the escalation
that would put a human on it.

#### Caveat on the proof — read this before treating §3 as proven

The existing assertions cover locked-with-a-due-date and
locked-past-the-deadline, **not** locked-with-`NULL`:

- [invite-claim.test.ts:364](../../apps/erp/tests/db/invite-claim.test.ts:364) — `guardian channel LOCKED`
- [invite-claim.test.ts:378](../../apps/erp/tests/db/invite-claim.test.ts:378) — `student -> teacher DENIED with guardian_required`
- [invite-claim.test.ts:545](../../apps/erp/tests/db/invite-claim.test.ts:545) — `passing the deadline does NOT unlock adult messaging`

All three run against a walk-in student whose due date **is set** — asserted at
`:326`. The `NULL` case is a code-reading guarantee, not an asserted one. It is
a one-line assertion to add (a student profile with no guardian fields at all →
`guardianChannelState(...).locked === true`) and it should be added, because the
whole scheduling argument rests on it.

#### Open verification item

`apps/www/tests/db/messaging-scope.test.ts` (87/87) contains **zero** guardian
references, but the new gate now sits in the path it exercises. Its fixtures
give every user an email (`mkUser`, `:118`) and link `studentA` to `parentA`
with an approved link, so that student satisfies rule (a) and is unaffected —
but any student in that suite **without** an approved parent link is now locked,
and assertions that such a student can reach a teacher would fail. The suite
needs a re-run against a live DB to confirm the gate did not silently invalidate
it. Not run here (requires the live test DB).

### 4. The friend's-email bypass, reassessed with no scheduler

**Partly defensible — and the part that holds does not depend on the scheduler,
which is the opposite of what we assumed.**

The human-review path for this specific bypass is **inline, not cron**. When a
student supplies their own guardian email, `setGuardianContact` notifies the
center immediately in the same call —
[guardian-contact.ts:140](../../packages/server-core/src/services/invites/guardian-contact.ts:140),
titled "Guardian email added by the student … Please confirm it with the family."
That fires today, with no scheduler, on every self-supplied address. So the
reassessment does not collapse: a student typing a friend's address still
surfaces to a human.

Two real holes remain, and neither is about verification-in-general:

1. **Teacher-direct students surface to nobody.** The notification is sent only
   when `centerIds.length > 0` — derived from `center_student_rosters`
   (`:125-128`, `:140`). A student enrolled only with an independent teacher
   (nullable `Course.centerId`, per roadmap decision #2) has no roster row, so
   the inline notification is skipped entirely and no human is ever told. For
   that population the bypass is unsupervised.
2. **The recipient set excludes the teacher.** `notifyCenters` targets center
   admins and `manager` staff (`:158-173`). The adult who actually teaches the
   child is never notified, even when a center exists.

**Recommendation — scoped, not "add verification everywhere":** close hole 1
before adding confirm-by-click. Extend the inline notification to the teachers
of the student's active enrollments when there is no center. That restores the
"a human sees it" property for every student, costs one query, and is
independent of the scheduler. Confirm-by-click verification of the guardian
address remains the stronger fix and is the right follow-up, but it is not what
makes today's behaviour defensible or not — reachability of a human is.

## Gaps carried forward (unchanged, not implemented)

**Gap 1 — the clock never starts for online-registered minors.** The only
writers of `guardian_contact_due_at` are the walk-in counter
(`packages/server-core/src/services/walk-in/walk-in.ts:85-92,144`) and
`setGuardianContact` when the write carries a phone but no email
(`guardian-contact.ts:110`). A student who registers online and never passes a
counter keeps `NULL` forever; the sweep filters `guardianContactDueAt: { not: null }`
(`:196`), so they are never reminded and never escalate. Messaging is still
correctly locked. **Gated behind the scheduler — fixing this before a scheduler
exists changes nothing observable.**

**Gap 2 — silent cap in the sweep.** `take: 2000` (`:203`) with no ordering and
no paging; past 2000 owing students the tail is dropped while the return value
still reports `scanned` as if complete. Order by `guardianContactDueAt` and log
when the cap is hit.

**Gap 4b — banner dismissal is not persisted.** `dismissed` is React state
(`guardian-contact-notice.tsx:38`), so a dismissable notice returns on the next
page load anyway. Harmless; noted so it is not mistaken for a bug later.

## Recommended order

1. Scheduler (the separate finding) — until then the ladder is theoretical.
2. The one-line `NULL`-due-date assertion in §3, plus the messaging-scope re-run.
3. Gap 4 hole 1 — teacher notification for center-less students.
4. Gaps 1 and 2 — only once a scheduler drains the queue.

## What was verified as sound

Stated plainly so it is not re-litigated: the lock itself matches the approved
policy. It never suspends an account (asserted, `invite-claim.test.ts:539`), it
locks adult-facing messaging from the start independently of any timer, `parent`
is not an adult role so a child is never cut off from their own guardian, the
timeout escalates only, and the sweep is idempotent within its window. The
weakness is entirely in delivery and reach, not in the gate.
