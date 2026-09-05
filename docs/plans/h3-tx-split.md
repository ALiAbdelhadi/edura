# H-3 — moving the back-office audit row into the mutation's transaction

Audit reference: `AUDIT_REPORT.md` → **H-3** (and **M-9**, already closed).

## The problem this solves

`docs/decisions/superadmin-center-oversight.md` §3 promises "a write cannot commit
without its audit row (same transaction)". For 39 of the 46 back-office wrapper
call sites that is false: the wrapper delegates the mutation to a
`@repo/server-core` service which opens **its own** transaction and commits, and
only then does the wrapper write the audit row in a second transaction. A crash,
a timeout or a dropped Neon socket between the two leaves an unaudited superadmin
mutation — including on money paths.

## Why the obvious fix is wrong

The tempting fix is to have the wrapper open one transaction that the delegated
service joins. **Measured 2026-09-01: 24 of the 42 delegated services perform
awaited network I/O after their transaction commits** — `notify()` (which awaits
SMTP, SMS, FCM push and web-push), `sendMail`, `deliverInviteWhatsApp`,
`sendStaffInvite`. Joining would put every one of those inside an open Postgres
transaction, on `recordPayment`, `counterCheckin`, `topUpWalletCash` and
`createWalkInSubscription` — the counter's hot path — against a 20 s transaction
timeout and a pooled Neon connection. It would pass every local test, because
mail and push are in mock mode, and fail in production.

## The shape being built

The pattern the repo already uses (`approveAgreementTx`,
`settleSubscriptionFromIntentTx`, `generateSessionsTx`, `doorTransitionTx`):
split each service into a pure-DB `fooTx(tx, …)` and a thin `foo(acting, …)` that
opens the transaction and then runs the I/O **after commit**.

Post-commit I/O is expressed as *deferred effects* so both callers run it in the
same place — after the transaction, never inside it:

```ts
// packages/server-core/src/db/effects.ts
export type DeferredEffect = () => Promise<void>;
export type WithEffects<T> = { value: T; effects: DeferredEffect[] };
export async function runEffects(effects: DeferredEffect[]): Promise<void>;
```

A service with post-commit I/O:

```ts
export async function addRosterStudentTx(tx, acting, studentId): Promise<WithEffects<Entry>> {
  /* …db work only… */
  return { value: entry, effects: [() => notify({ … })] };
}

export async function addRosterStudent(acting, studentId) {          // unchanged signature
  const { value, effects } = await scopedDb(acting, (tx) => addRosterStudentTx(tx, acting, studentId));
  await runEffects(effects);
  return value;
}
```

A pure-DB service needs no effects, only the `tx` parameter.

The back-office wrapper then gets the guarantee for free:

```ts
export async function adminAddStudent(actor, centerId, studentId) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const r = await addRosterStudentTx(tx, acting, studentId);
    await writeAdminAudit(tx, actor, { … });        // SAME transaction
    return r;
  });
  await runEffects(effects);                         // still after commit
  return value;
}
```

**`foo(acting, …)` keeps its exact signature and return value**, so every ERP
caller is untouched. That is what bounds the blast radius of a change that
reaches the money, attendance and enrollment engines.

## Rules this refactor must not break

- **The transaction context stays the same per service.** A service written
  against `scopedDb(acting, …)` runs under tenant RLS; one written against
  `platformDb` runs under the bypass flag. The wrapper opens *the same kind* of
  transaction the service already used — never a platform transaction around
  tenant-scoped work, which would silently widen RLS.
- **No I/O inside a transaction.** Every `notify` / `sendMail` /
  `deliverInviteWhatsApp` / `sendStaffInvite` call becomes a deferred effect.
  A `fooTx` that still awaits network I/O is a bug.
- **No second money engine.** `recordPayment`, `topUpWalletCash`,
  `createWalkInSubscription`, `completeSession` and `requestCenterPayout` are
  split, not rewritten: the same statements, in the same order, in the same
  transaction — only the transaction's *opener* moves out one level.
- **The audit row's `centerId` equals the tenant.** Under a tenant transaction
  the `audit_logs` RLS policy requires `center_id = current_center_id()`; every
  back-office wrapper already passes the same `centerId` it scoped to.

## Inventory (measured 2026-09-01)

42 delegated services behind the 39 open call sites.

**Post-commit I/O — need `WithEffects` (24):**
`addRosterStudent`, `approveEnrollmentRequest`, `bulkMarkAttendance`,
`cancelCourse`, `cancelSession`, `counterCheckin`, `createCollaborationRequest`,
`createWalkInSubscription`, `declineEnrollmentRequest`, `editAttendance`,
`enrollStudent`, `postponeSession`, `recordPayment`, `topUpWalletCash`
(`notify`); `inviteCenterAdmin`, `inviteTeacher` (`notify` + `sendMail`);
`inviteStudent`, `sendTempStudentInvite` (`sendMail`); `createStaff`,
`resendStaffInvite` (`sendStaffInvite`); `registerWalkIn`, `resendWalkIn`
(`deliverInviteWhatsApp` + `sendStudentClaim`); plus the two blacklist services
in `apps/superadmin`.

**Pure DB — need only a `tx` parameter (18):**
`approveDeletionRequest`, `completeSession`, `createCourse`, `createExpense`,
`createTempStudent`, `deleteExpense`, `reassignCourseTeacher`,
`rejectDeletionRequest`, `removeCenterAdmin`, `removeRosterStudent`,
`removeRosterTeacher`, `removeStaff`, `requestCenterPayout`, `unenrollStudent`,
`updateCourse`, `updateExpense`, `updateRosterStudent`, `updateStaff`.

## Order of work — one commit per group, suites run per group

| # | Group | Services | Wrapper | Suite |
|---|---|---|---|---|
| 0 | `effects.ts` + this plan | — | — | type-check |
| 1 | courses | 4 | `center-academic` (4 sites) | `center-academic` |
| 2 | enrollments | 4 | `center-academic` (4 sites) | `center-academic` |
| 3 | expenses + center-wallet | 4 | `center-money` (4 sites) | `center-money` |
| 4 | roster + staff + admins + collaboration | 13 | `center-people` (13 sites) | `center-people` |
| 5 | attendance + checkin + session-actions + distribution + walk-in + temp-students + deletion-requests + blacklist | 14 | `center-operations` (14 sites) | `center-operations` |
| 6 | payments + cash-topup + subscriptions | 3 | `center-money` (3 sites) | `center-money`, `refund`, `wallet-refund` |

Money paths are deliberately last, when the pattern is settled and proven on
four lower-risk groups.

## Proof

Per group: `check-types`, the group's DB suite, and — at the end — the five
center-parity suites together (263 assertions), the refund/wallet suites, both
unit suites and `bun run build`.

The guarantee itself is proven by a suite that forces the audit insert to fail
inside the wrapper's transaction and asserts the mutation is **not** present
afterwards — the property that does not hold today.

---

## Outcome (2026-09-01) — DONE

`apps/superadmin/tests/db/h3-audit-atomicity.test.ts` (16/16) installs a
`BEFORE INSERT` trigger on `audit_logs` that raises, then proves per wrapper that
the mutation is **absent** afterwards — for a roster write, a money-adjacent
expense, and a multi-write course creation (course + generated sessions). It also
carries a **negative control**: the same student added through the OLD shape
(`addRosterStudent` then a separate audit transaction) leaves the roster row
behind, unaudited. That is the hole, reproduced on demand, next to its fix.

Final state, by wrapper:

| wrapper | audit rows in the mutation's tx |
|---|---|
| `center-academic.ts` | **8 / 8** |
| `center-people.ts` | **13 / 13** |
| `center-money.ts` | **8 / 8** |
| `center-platform.ts` | **3 / 3** |
| `center-control.ts` | **10 / 10** |
| `teacher-agreements-admin.ts` | **3 / 3** |
| `center-operations.ts` | **11 / 14** |

**The three that remain, and why they are not a shortfall:**

- `adminRegisterWalkIn` and `adminResendWalkIn` — `registerWalkIn` is an
  orchestrator, not a write. It spans at least four separate transactions
  (existing-student lookup, `createTempStudent`, the guardian-contact row,
  `sendStudentClaim`'s own transaction, and `issueInvite`'s) with WhatsApp and
  email delivery interleaved between them. There is no single transaction for an
  audit row to join; making one would be a redesign of counter walk-in
  registration, not an audit change.
- `adminBroadcast` — it has no database mutation of its own. It resolves
  recipients and calls `notify()`; the "write" *is* the fan-out. There is nothing
  to be atomic with.

**Two fixes fell out of the refactor:**

- `sendTempStudentInvite` was awaiting `sendMail` **inside** its transaction.
  It is now a deferred effect, like every other outbound channel.
- Snapshot reads that an audit's `after` state depends on (`adminUpdateCourse`,
  `adminEditAttendance`, `adminBulkAttendance`) were being taken on a separate
  connection, so they could read the pre-write row and record a wrong `after`.
  They now read on the mutation's own transaction.

Verified: `check-types` 9/9 · eslint 0 new errors · unit 106/106 (superadmin) and
1488 passed / 1 skipped (erp) · `bun run build` 3/3 · superadmin DB parity 263/263
· `h3-audit-atomicity` 16/16 · ERP regression sweep across counter, courses,
attendance, walk-in, blacklist, wallet, staff, invites and messaging — 26 suites,
all green when run without cross-suite census interference.
