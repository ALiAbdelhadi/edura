# Superadmin ↔ Center parity — plan

**Status:** ALL FIVE PHASES DELIVERED 2026-07-26 — awaiting review · drafted 2026-07-26
**Goal (Ali, 2026-07-26):** a super admin should be able to do, on **any**
center, everything that center can do for itself — add / remove / edit students,
teachers, courses, and the rest — plus the platform-only operations no center
can perform.

This document is the authoritative capability list. It replaces the ad-hoc
4-phase sketch discussed in chat, which was built from an inventory that caught
only 33 of the **70** center-reachable routes in `apps/www`.

---

## 1. Why this is not a small addition

Two structural facts set the cost:

1. **The center's logic lives inside its route handlers, not in reusable
   services.** `courses/route.ts` calls `scopedDb` and `tx.course.create`
   directly. ~3,451 lines across ~30 route files are shaped this way.
2. **`apps/www` is closed to `super_admin` by construction.** Its `requireRole`
   is a positive allowlist with no bypass, and `canSignIn` (C-04) maps
   `super_admin` to the `superadmin` app only. That is deliberate — CLAUDE.md
   decision #1: *"No superadmin functionality may ever exist in the www app."*

So the work is: **extract each capability out of its route into
`@repo/server-core`, leave the www route as a thin caller, and let
`apps/superadmin` call the same function** with an acting user shaped for the
target center.

### The mechanism already exists and is proven

`apps/www/src/lib/authz/center-actor.ts` already does exactly this for center
staff: it shapes the acting user as `center_admin` carrying the **target**
`centerId`, so `scopedDb(acting)` → `withTenant(centerId)` → RLS binds every
query to that center, while the **real** actor id stays the audit `actorId`.
Proven by `center-staff-delegation.test.ts` (55/55).

Superadmin gets the same shaping via a new `superadminAsCenter(centerId)`:

```ts
// apps/superadmin/src/lib/authz/center-actor.ts  (new)
{ id: <the super admin's own id>, role: "center_admin", centerId: <target> }
```

Audit for every such call: `actorId` = the super admin, `centerId` = the target,
`action` = the named operation, plus before/after — the pattern already shipped
in `center-control.ts`.

### Rejected alternative — an internal HTTP bridge

Having `apps/superadmin` call www server-to-server (`INTERNAL_API_SECRET`, as
`internal/chat-notify` does) looks cheaper. It is not: because the logic is in
the routes, the bridge degenerates into a **generic path proxy**, which
*bypasses* each route's own guard instead of using it. A door that can act as
any center, reachable by path string, is a worse thing to own than a refactor.
Not proposed.

---

## 2. Complete capability inventory (70 routes)

Legend — **Have**: superadmin can do it today. **Add**: this plan.
**Named**: added, but as an explicitly-named action with a confirmation and a
mandatory reason, never a plain row button.

### 2.1 People

| Capability | www route | Status |
|---|---|---|
| List / search students | `roster/students` GET, `lookup` | Add |
| **Add a student to the center** | `roster/students` POST | Add |
| Edit a student (name, phone, grade, track, contact) | `roster/students/[id]` PATCH | Add |
| Remove a student from the roster | `roster/students/[id]` DELETE | Have (via H-04 journal) |
| Invite a student | `roster/students/invite` POST | Add |
| Guardian contact | `center/students/[id]/guardian-contact` GET POST | Add |
| List teachers | `roster/teachers` GET, `lookup` | Have (read) |
| Invite a teacher | `roster/teachers/invite` POST | Add |
| Remove a teacher from the center | `roster/teachers/[id]` DELETE | Add |
| Activate / deactivate a teacher or student | — (superadmin-only) | Have |
| Center staff: list / add / edit role / remove / invite | `center/staff/**` | Add |
| Co-owner admins: list / invite / remove | `centers/me/admins/**` | Add |

### 2.2 Academic

| Capability | www route | Status |
|---|---|---|
| Create a course | `courses` POST | Add |
| Edit a course | `courses/[id]` PATCH | Add |
| Cancel a course | `courses/[id]/cancel` POST | **Named** |
| Reassign a course's teacher | `courses/[id]/reassign-teacher` POST | **Named** |
| Enroll / unenroll a student | `enrollments` POST, `[id]` DELETE | Add |
| Approve / decline enrollment requests | `enrollment-requests/[id]/**` | Add |
| Rooms: create / edit / delete / photos | `rooms/**` | Have (API) — wire the UI |
| Collaboration requests: accept / reject / cancel | `collaboration-requests/**` | Have |

### 2.3 Operations

| Capability | www route | Status |
|---|---|---|
| Correct an attendance record | `attendance/[id]` PATCH | Add |
| Bulk session attendance | `sessions/[id]/attendance` PUT | Add |
| Cancel / postpone a session | `sessions/[id]/{cancel,postpone}` | Add (blocked once settled) |
| **Complete a session** — triggers settlement | `sessions/[id]/complete` | **Named** — see §3 |
| Counter check-in (+ lookup, suggest) | `center/checkin/**` | Add |
| Walk-in registration (+ resend) | `center/walk-in/**` | Add |
| Temp students (+ send invite) | `center/temp-students`, `temp-students/**` | Add |
| Deletion requests: approve / reject | `deletion-requests/**` | Add — **needs a new tab** |
| Broadcast a notification to the center | `notifications/broadcast` POST | Add |
| Center blacklist: list / add / lift | `center/blacklist/**` | Add |

### 2.4 Money — the sanctioned flows only

| Capability | www route | Status |
|---|---|---|
| Record a cash payment | `payments` POST | Add |
| Refund a payment | `payments/[id]` PATCH | **Named** |
| Top up a student wallet (cash) | `center/wallet-topup` POST | Add |
| Create a subscription (walk-in) | `center/subscriptions` POST | Add |
| **Cancel a subscription** | — *the center cannot do this* | **Named** — see §3 |
| Expenses: list / add / edit / delete | `expenses/**` | Add |
| Center wallet + transactions + payouts (read) | `center/wallet/**` | Have (Finance tab) |
| Request a payout | `center/wallet/payout-request` POST | Add |
| **Edit a balance or a ledger row** | — | **NEVER.** See §4 |

### 2.5 Reporting

| Capability | www route | Status |
|---|---|---|
| Center dashboard | `dashboards/admin` GET | Add |
| Revenue, net profit, expenses (+ timeseries) | `reports/{revenue,net-profit,expenses}*` | Add |
| Attendance by course, fill rates, enrollment funnel | `reports/**` | Add |
| Center profile + logo | `centers/me` PATCH, `centers/me/logo` | Have / Add (logo) |

### 2.6 Platform-only — no center has these

My judgement on what a platform operator additionally needs. Not parity;
genuinely new, and each one audited.

| Capability | Why | Verdict |
|---|---|---|
| Move a student between centers | No center can; real support case | **Add** (phase 5) |
| Force-logout a user (bump `token_version`) | Compromised account response | **Add** (phase 5) |
| Verify a student's date of birth | `super_admin`-only per schema | **Named**, phase 5 — see §3 |
| Merge duplicate accounts | Real, but large and destructive | **Defer** — own plan |
| Move a course to a different center | Re-parents settled money | **Refuse** — use cancel + recreate |

---

## 3. The four judgement calls

Ali asked me to decide these. Stated plainly, with the reasoning.

### 3.1 `sessions/[id]/complete` — the settlement trigger

This is the single most money-consequential action in the product: completing a
session runs `distributeSessionRevenue`, writing the platform / center / teacher
split into the ledger and the points engine (C-01).

**Decision: give it, as a Named action.** A session the teacher never completed
is a real support case that today has no fix. It is a *sanctioned* flow, not a
ledger edit — and it is already exactly-once by construction (`distributedAt` +
`UNIQUE(session_id)` on `session_settlements`). The UI must show the exact
amounts that will be distributed before confirming, and the action is refused
outright when `distributedAt IS NOT NULL`.

### 3.2 Cancelling a subscription

`subscriptions/[id]/cancel` is guarded `requireRole("student")` — **the center
itself cannot cancel one.** So this is an *addition*, not parity.

**Decision: give it, as a Named action, with the money warning on the dialog.**
Cancelling ends coverage; it does **not** refund. The confirm must say so and
link to the refund flow. Without this, support has no way to end a subscription
created in error.

### 3.3 Attendance correction after settlement

Editing attendance for a session that has already settled desynchronises the
`present_count` frozen in `session_settlements` — which that column exists
precisely to make detectable.

**Decision: allow the correction, never silently.** The edit is permitted (the
attendance record is the truth about a student), but a settled session's
correction is flagged in the UI and recorded in the audit row as a
settlement-divergence, so the mismatch is visible rather than discovered later.
The settlement itself is **not** recomputed — that would be a retroactive
re-rate, which M4.5 forbids.

### 3.4 Verifying a date of birth

`dateOfBirthVerifiedAt/By` is `super_admin`-only by schema. It is not money —
but it flips a student from **minor** to **adult** and thereby **switches off
parent oversight** of their conversations.

**Decision: Named action, mandatory reason, its own confirmation** describing
exactly what oversight is being removed. Never a field in a profile form.

---

## 4. The money boundary — unchanged

Everything in §2.4 is a *sanctioned flow* (settlement, refund, payout, recorded
payment). None of it is a manual balance edit, and this plan opens **no** new
money-mutation path.

Specifically preserved, and re-proven in every phase:

- `REVOKE UPDATE, DELETE` on `transactions`, `points_ledger`,
  `session_settlements`, `audit_logs`; `REVOKE DELETE` on `invoices`, `payouts`
  — all still apply to `super_admin`, because both apps connect as the same
  `edura_app` role and `platformDb` only sets the `app.bypass_rls` GUC, which
  RLS policies read and table GRANTs do not.
- `immutableExtension` still refuses update/delete on the four append-only
  models at the Prisma layer.
- The `CHECK (wallet_balance >= 0)` floors stay.
- The frozen per-course pricing snapshot (`splitPlatformBp` &c.) stays
  **non-editable everywhere** — M4.5, new courses only.
- Revenue split / commission percentages keep their dedicated pricing screen
  and are absent from every edit form built here (decided 2026-07-25).

Known and unchanged: `wallet_ledger` has no DB-level REVOKE yet (deliberate, see
migration `20260722000100_student_wallet`); it is held by `immutableExtension`
at runtime. Adding the REVOKE remains a separate launch-hardening migration.

---

## 5. Phases

Each phase: extract → move to `@repo/server-core` → www re-export shim →
`superadminAsCenter` wrapper + routes → UI tab → proof → **stop for review**.
No phase begins before the previous one is reviewed.

| # | Phase | Tabs affected | Covers |
|---|---|---|---|
| **1** | **People** ✅ **DONE 2026-07-26 — awaiting review** | Students · Teachers · Staff · Overview (admins) | §2.1 in full |
| **2** | **Academic** ✅ **DONE 2026-07-26 — awaiting review** | Courses · Enrollments · Pending · Rooms | §2.2 in full |
| **3** | **Operations** ✅ **DONE 2026-07-26 — awaiting review** | Attendance · Sessions · **Deletion requests (new tab)** | §2.3, incl. the §3.1 and §3.3 calls |
| **4** | **Money flows** ✅ **DONE 2026-07-26 — awaiting review** | Finance (counter actions + expenses) | §2.4 |
| **5** | **Platform-only + reports** ✅ **DONE 2026-07-26 — awaiting review** | Overview · Reports (new tab) | §2.5, §2.6, incl. the §3.4 call |

Phases 1 and 2 are what Ali asked for by name (students, teachers, courses) and
are the largest share of the value.

### Per-phase proof obligations

Every phase must re-prove, not merely re-run:

1. the moved code is byte-equivalent in behaviour for www (its existing tests
   pass unchanged through the shim);
2. every new superadmin operation writes exactly one audit row with
   actor / action / target / center / before / after;
3. cross-center isolation: acting on center A never touches center B;
4. the money witness — zero rows created, modified or deleted across the nine
   ledger tables — for every operation that is not itself a sanctioned money
   flow;
5. the DB-level REVOKEs still refuse a super admin.

---

## 6. Open risk

The refactor touches code that has already been security-reviewed (the money
engine, the RLS scoping, the C-02/H-05/M-series fixes). The mitigation is that
each move is **mechanical and shim-backed**: www keeps its exact import paths
and its existing test suites are the regression gate. Any phase whose www tests
do not pass unchanged is a phase that changed behaviour, and gets reverted
rather than patched.

---

## 7. Phase 1 — delivered (2026-07-26, awaiting review)

**Moved to `@repo/server-core` (mechanical, shim-backed):** `utils/random`,
`services/whatsapp/**` (7 files), `services/invites/**` (4 files),
`services/center/staff.ts`. Every www import path is unchanged — each old file
is now a one-line re-export.

**Extracted out of the www route handlers into the kernel:**
`services/center/roster.ts` (students + teachers) and
`services/center/admins.ts` (co-owners). The www routes are now thin callers
keeping their exact guards, schemas and response shapes — including the
`centerStaff` sub-role matrix (receptionist vs manager vs owner-only), which
this move did not touch.

**New in `apps/superadmin`:** `lib/authz/center-actor.ts` (`superadminAsCenter`),
`lib/services/admin/center-people.ts` (18 audited operations), 14 routes under
`/api/v1/admin/centers/[id]/{roster,staff,admins}/**`, and the Students /
Teachers / Staff tabs plus the Overview admins card.

**Proof:** `apps/superadmin/tests/db/center-people.test.ts` **66/66** — every
capability on any center, one audit row per mutation with before/after, write-
and read-isolation between centers, the center's own business rules still
refusing (registered teacher, teacher with active courses, last admin), the raw
invite token never written to the audit log, and the money witness.

**Regressions green:** check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · center-staff-delegation 55/55 · rbac-isolation 11/11 ·
registration-doors 17/17 · h04 44/44 · c04 72/72 + 26/26 · c03 15/15 ·
center-oversight 119/119 · refund 13/13.

### Two things worth recording

1. **The money witness was wrong before the code was.** Asserting byte-identity
   over the whole affiliation list failed, because inviting a teacher legitimately
   creates an affiliation. The fix was to sharpen the claim, not drop it: no
   pre-existing share moves, and every affiliation created during the run carries
   a zero share.
2. **One www unit test needed its mock widened.** `l4-lookup-enumeration`
   mocked `@/lib/db/scope`; the lookup now reaches the database through the
   kernel's own specifier, so the mock no longer intercepted it. Both specifiers
   are now mocked with one shared fixture. The route, the service and the rate
   limiter under test are unchanged — this was a test-harness consequence of the
   move, and the only one across ~400 www tests.

---

## 8. Phase 2 — delivered (2026-07-26, awaiting review)

**Moved to `@repo/server-core`:** `authz/center-scope.ts` (`requireCenterScope`).

**Extracted out of the www route handlers into the kernel:**
`services/center/courses.ts` (create / edit / cancel / reassign teacher / read)
and `services/center/enrollments.ts` (enrol / unenrol / list + enrollment
requests approve / decline / list). The www routes are thin callers with their
guards, schemas and response shapes unchanged. Two www routes kept their GET
bodies deliberately — `courses` GET and `enrollments` GET are multi-role
discovery (student / parent / teacher / admin), not a center capability, so
only their `center_admin` POSTs moved.

**New in `apps/superadmin`:** `lib/services/admin/center-academic.ts` (12
audited operations), 8 routes under
`/api/v1/admin/centers/[id]/{courses,enrollments,enrollment-requests}/**`, and
manageable Courses / Enrollments / Rooms tabs plus an approve-decline card on
Pending. The read-only enrollment-request list previously shown under "Other
pending items" was replaced by that card — the same rows, now with actions.

**Proof:** `apps/superadmin/tests/db/center-academic.test.ts` **54/54**.

### The money claim this phase had to earn

A course carries a pricing snapshot — method, the three split bps, and the
Method-2 rate — frozen at creation from superadmin config, which settlement
later reads. The proof therefore captures that snapshot at creation and asserts
it is **byte-identical** after every subsequent operation: after an edit, after
a refused hall swap, after a teacher reassignment, and after a cancel. It is
unreachable by construction, not by convention: `CoursePatch` has no field for
any of those columns, and the kernel refuses attaching or swapping a hall
because the snapshot was taken from it.

Also asserted: enrolling creates **no** subscription (a seat is not paid
coverage), unenrolling and cancelling refund nothing, `enrolled_by` records the
super admin rather than the center, and the money witness across six tables.

**Regressions green:** check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · center-people 66/66 · center-oversight 119/119 ·
rbac-isolation 11/11 · room-ownership 5/5 · h04 44/44 ·
center-staff-delegation 55/55 · registration-doors 17/17 · c04 72/72 + 26/26 ·
c03 15/15 · messaging-scope 87/87 · refund 13/13 · room-pricing 47/47.

### Known, and NOT caused by this phase

`apps/www/tests/db/c01-lesson-settlement.test.ts` fails in the current working
tree (0 students present → 0 ledger rows written). It drives the live www HTTP
API, so it needs `bun run --filter edura dev` on :3002 to run at all. With the
server up it still fails — **and it fails identically with this phase's www
route changes stashed**, which is how it was ruled out as a regression from the
extraction. It touches door-check-in / subscription, which Phase 2 did not
change. Worth its own look before launch.

---

## 9. Phase 3 — delivered (2026-07-26, awaiting review)

Most of this phase's logic was already in services rather than routes, so it
was largely a move. `distribution`, `notify`/`fanout` and `blacklist` were
already in the kernel and needed nothing.

**Moved to `@repo/server-core`:** `services/attendance/{attendance,checkin}`,
`services/session-actions`, `services/walk-in`, `services/temp-students`, plus
two surgical extractions rather than whole-module moves —
`services/subscriptions/coverage.ts` (`coveredStudentIds`, so the attendance
code could move without dragging the payment engine) and
`authz/acting-teacher.ts` (`resolveActingTeacher`, whose module's other exports
are HTTP-layer wrappers that do not belong in the kernel).

**Extracted from routes:** `services/center/deletion-requests.ts` — the last
Phase-3 logic still living inline.

**New in `apps/superadmin`:** `lib/services/admin/center-operations.ts` (18
audited operations), 18 routes, and two NEW tabs — **Sessions** and
**Deletions** — plus a correctable Attendance tab, a Broadcast action in the
header and a center-blacklist card on Students.

**Proof:** `apps/superadmin/tests/db/center-operations.test.ts` **47/47**.

### The three boundaries this phase had to earn

**§3.1 — completing a session really does settle.** It is not stubbed or
mocked in the proof: a room-based session is completed for real, **6 ledger
rows** are written and read back, and the audit row records the actual rows
rather than the intention. It is exactly-once (a second attempt is refused and
writes nothing further), it distributes at the course's frozen rates, and the
UI never fires it from a bare row button — `…/settlement-preview` shows the
headcount, the per-session price and the frozen split before the operator
confirms.

**Settled sessions are locked.** Cancel and postpone are both refused once
`distributedAt` is set. `postponeSession` originally had **no** such guard where
`cancelSession` did — found while building this surface, flagged rather than
changed silently mid-phase, and **closed in the kernel on 2026-07-26 once
approved**, so www refuses identically. The wrapper keeps its own check as
defence in depth, and the proof now exercises the kernel path directly so the
wrapper can never be the only guard.

**§3.3 — correcting attendance after settlement.** Allowed, because the record
is the truth about a student. But the settlement is not recomputed, the frozen
`present_count` is unchanged, no ledger row moves, and the divergence is
written into the audit row so it surfaces in the log instead of being
discovered later.

**Regressions green:** check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · center-academic 54/54 · center-people 66/66 ·
center-oversight 119/119 · rbac-isolation 11/11 · offline-sync 16/16 ·
h04 44/44 · center-staff-delegation 55/55 · registration-doors 17/17 ·
c03 15/15 · refund 13/13 · room-pricing-methods 47/47.

### One thing the proof caught about itself

The first run reported the §3.3 divergence check as passing when it had in fact
been skipped: `session_settlements` rows are written for **room-based** courses
only, and the fixture course had no hall, so there was no settlement to diverge
from. The fixture was changed to a room-based course so the path is genuinely
exercised — and the no-settlement branch now asserts that the service reports
*no* divergence, rather than letting an absent record read as a pass.

---

## 10. Phase 4 — delivered (2026-07-26, awaiting review)

All of this phase's logic was already in services, so it was a pure move —
with one seam that had to be redesigned rather than copied.

**Moved to `@repo/server-core`:** `services/payments/payments`,
`services/expenses/expenses`, `services/finance/center-wallet`,
`services/subscriptions/subscriptions`, plus a surgical extraction of
`topUpWalletCash` into `services/wallet/cash-topup.ts` (its module's other
exports drive the ONLINE top-up and need the Paymob gateway, which stays in
www) and a shared `SettleNotification` type.

**The seam that changed.** `createSubscriptionCheckout` reached
`initiateSubscriptionIntent` through a *dynamic* import that existed only to
dodge an import cycle. The kernel cannot import from www, and dragging the
Paymob gateway — its drivers, HMAC verification and C1 fail-closed env checks —
into the kernel would have been the wrong trade. The initiator is now **injected
by the caller**: apps/www's checkout route passes it, the gateway stays where it
is, and the subscription logic stays in one place. The dynamic import is gone.

**New in `apps/superadmin`:** `lib/services/admin/center-money.ts` (13 audited
operations), 8 routes under `…/money/**`, counter actions and an expenses card
on the Finance tab.

**Proof:** `apps/superadmin/tests/db/center-money.test.ts` **48/48**, in two
halves.

*Positive* — the flows genuinely work: a recorded payment writes a Payment with
a center receipt **and** its mirrored ledger transaction, `recorded_by` naming
the super admin; a cash top-up writes the Payment/Transaction/WalletLedger trio
and moves the balance by exactly the amount, with the running snapshot matching
the cached balance; a walk-in subscription charges the **course's** configured
plan price; a payout request raises a pending payout.

*Negative* — the boundary is unchanged: `UPDATE`/`DELETE` on `transactions`,
`points_ledger`, `payouts` and `audit_logs` all fail with `permission denied`
for the super admin at the DB layer; the runtime extension refuses
`Transaction.update` and `WalletLedger.update`; both wallet-balance floors still
reject a negative; a negative "payment" is refused; and a student off the
center's roster cannot be charged.

### Three things stated where they can be misread

1. **"Mark refunded" is a status flag.** The center-side transition
   (paid → refunded) writes **no** ledger reversal and returns no money — the
   proof asserts the ledger is byte-identical across it, and the audit row says
   `ledgerReversalWritten: false`. The real refund is the finance surface's
   `refundLessonForStudent`, guarded to one refund per payment (H3). The UI says
   so on the payments table.
2. **There is no wallet debit.** Not merely absent — the proof enumerates the
   money module's exports and asserts none matches
   `debit|withdraw|deduct|setBalance|adjustBalance`.
3. **A payout request pays nothing.** It raises a pending row; the wallet is
   asserted unchanged. Approval and settlement stay with the accountant, where
   the H1 lock and H2 floor live.

**The Finance banner was corrected, not left flattering.** It used to claim
nothing on that screen could move money. That stopped being true the moment the
counter actions landed, so it now says the ledger below is append-only history
while the actions above *add* to it through the real flows.

**Regressions green:** check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · wallet 20/20 · wallet-no-cap 7/7 · M1 9/9 · H1 PASS ·
H2 7/7 · H3 6/6 · refund 13/13 · rbac-isolation 11/11 · center-operations
47/47 · center-academic 54/54 · center-people 66/66 · center-oversight 119/119 ·
room-pricing-methods 47/47.

---

## 11. Phase 5 — delivered (2026-07-26, awaiting review)

**Moved to `@repo/server-core`:** `services/reports/reports.ts` (977 lines,
self-contained) and `analytics/contracts.ts` (pure types).

**New in `apps/superadmin`:** `lib/services/admin/center-platform.ts`, 5 routes,
a **Reports** tab (the center dashboard plus its eight reports, read for any
center) and a Platform-actions card on Overview.

**Proof:** `apps/superadmin/tests/db/center-platform.test.ts` **44/44**.

### The platform operations, and their limits

**Move a student between centers — ROSTER ONLY.** Enrollments, subscriptions,
payments and wallet history stay at the old center: they are facts about what
happened there and some have already settled into its books. The proof asserts
both lists are byte-identical after the move, the operation *reports* what it
left behind rather than implying a clean transfer, and the audit row is written
against **both** centers so it appears in either log.

**Force logout.** Bumps the session epoch only. Status is unchanged, so the
person can sign straight back in — the proof asserts the old token dies, the
new one is accepted, and `status` still reads `active`. Deactivation is a
different, named operation.

**§3.4 Verify a date of birth — a child-safety decision.** Reason mandatory
(what evidence was seen), super-admin only, future dates refused. Both
directions are proven: a 12-year-old verifies as a minor with oversight **on**,
a 22-year-old as an adult with oversight **off** — and the audit row records
which, alongside the evidence.

**Move a course between centers — REFUSED.** Implemented as a function that
only ever throws, so the refusal is discoverable rather than an absence someone
re-adds. Its pricing snapshot was frozen from its own center's configuration and
its completed sessions have settled to that center's wallet.

### Two harness defects this proof caught in itself

1. **A vacuous C-03 assertion.** The hand-built session token used `id`, but the
   jwt callback keys on `uid`. The token was therefore ignored outright, so
   "the old token is rejected" was passing for the wrong reason and would have
   passed even with the epoch check removed. Fixed to `uid`, and a *harness
   check* was added first — the current token must be accepted before any
   later rejection means anything.
2. **The wrong gate.** The round trip was first written against a
   `center_staff` user, but it runs through the **superadmin** app's callback,
   which refuses every www role regardless of epoch (C-04). Switched to an
   accountant so the test measures the epoch, not the login boundary.

**Regressions green:** check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · center-money 48/48 · center-operations 47/47 ·
center-academic 54/54 · center-people 66/66 · center-oversight 119/119 ·
rbac-isolation 11/11 · c03 26/26 + 15/15 · l1 12/12 · h04 44/44 ·
center-staff-delegation 55/55 · c04 26/26.

---

## 12. Where this leaves things

All five phases are delivered. A super admin can now do, on any center,
everything that center can do for itself — people, academic, operations, the
sanctioned money flows and reporting — plus the platform-only operations.

**Open items, none of them blocking:**

- **`wallet_ledger` still has no DB-level REVOKE** (deliberate, see migration
  `20260722000100_student_wallet`); it is held by `immutableExtension` at
  runtime. A launch-hardening migration.
- **`c01-lesson-settlement` fails in the working tree** — pre-existing, ruled
  out as a regression by re-running with the phase's changes stashed. It touches
  door check-in and subscriptions.
- **Merging duplicate accounts** stays deferred — large, destructive, and it
  deserves its own plan.

---

## 13. Follow-up — the postpone guard, closed (2026-07-26)

`postponeSession` in `@repo/server-core/services/session-actions` now refuses a
session whose revenue has already been distributed, matching the guard
`cancelSession` always had. Both apps are affected, which was the point: a
teacher postponing their own class in www could previously move a settled
session and detach the distributed money — including the `present_count` frozen
on its settlement — from the lesson it paid for.

The superadmin wrapper keeps its own identical check, deliberately: it runs
before any work and returns a message specific to that surface. It is defence in
depth, no longer the only guard.

Proof extended in `center-operations.test.ts` (**50/50**, was 47): the settled
session is now attacked through the **kernel directly**, bypassing the wrapper —
both `postponeSession` and `cancelSession` refuse, and the session is asserted
untouched afterwards. Without that, a wrapper-only guard would have looked
identical from the back office while leaving www open.

Regressions green: check-types 5/5 · `bun run build` both apps · www unit
111 pass / 1 skip · offline-sync 16/16 · rbac-isolation 11/11 ·
center-money 48/48 · center-platform 44/44 · center-academic 54/54 ·
center-people 66/66.
