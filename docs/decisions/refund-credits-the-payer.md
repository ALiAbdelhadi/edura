# A refund credits the payer, not always the student

Date: 2026-09-05. Status: implemented in `packages/server-core/src/services/wallet/refund-target.ts`.

## The decision

When money is returned, it goes to **whoever parted with it**. Where a parent
funded a child's lesson or subscription, the refund credits the **parent's**
wallet; in every other case it credits the **student's**.

This is a deliberate divergence from `refundLessonForStudent`
(`apps/superadmin/src/lib/services/finance/refunds.ts`), which credited
`studentId` unconditionally. That service now uses this rule too, so there is
exactly one definition of whose wallet is owed — not two.

## Why

The wallets are separate balances with separate spendability
(see [WALLET_SPENDABILITY.md](../../WALLET_SPENDABILITY.md)):

| | Column | Ledger |
|---|---|---|
| Student | `student_profiles.wallet_balance` | `wallet_ledger` |
| Parent | `parent_profiles.wallet_balance` | `parent_wallet_ledger` |

There is **no transfer path between them**. So crediting the wrong one is not a
cosmetic mis-attribution — it puts the money somewhere the person who is owed it
cannot reach. The ordinary Egyptian-centre case is exactly this one: a parent
hands over cash at the counter for their child.

Three further reasons:

1. **The child could spend money the parent did not authorise.** A parent's
   refund landing in a child's spendable balance hands a minor a purchasing
   decision the parent made and then reversed.
2. **A leaving student strands a parent's money.** The balance follows the
   student account. If the family leaves that student's account behind, a
   parent-funded refund goes with it.
3. **The payer is already recorded, deliberately.** `payments.payer_user_id` and
   `Subscription.createdBy` exist precisely so the system knows who paid — see
   [parent-pays-lesson](parent-pays-lesson.md). Ignoring them at refund time
   discards information the schema was extended to carry.

## This does NOT breach the ledger-direction invariant

The binding invariant reads:

> **MONEY DIRECTION IS UNCHANGED BY WHO PAID.** A parent-funded subscription
> still moves `student -> center/teacher` (`fromEntityId = studentId`); who paid
> is recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
> redirecting the ledger.

That invariant governs the **`transactions` row**, and this change does not touch
it. A refund still writes `type: "refund"` with `fromEntityId = centerId`,
`toEntityId = studentId` — centre back to student — whichever wallet is credited.
`refund-payer-wallet.test.ts` asserts that row explicitly, so a future change
that redirected the ledger to the parent would be a red test.

What this decision governs is the **wallet leg**, a different thing: not
"between which parties did the obligation move" but "whose balance now holds the
returned money". The invariant's own sentence names the payer columns as the
correct place to record who paid — this reads them, exactly as intended.

## How the target is resolved

`resolveRefundTarget(tx, { studentId, paymentId?, session? })`:

1. If a `paymentId` is given, read `payments.payer_user_id`.
2. Otherwise, if a `session` is given, find the subscription that **funded** that
   lesson for that student, and take its payment's payer, falling back to
   `Subscription.createdBy`.
3. A payer only wins if **all three** hold: the account's role is `parent`, a
   `parent_profiles` row exists to credit, and there is an `approved`
   `parent_student_links` row for that child.
4. Anything missing falls back to the student.

**Failures fall back, they do not throw.** A refund must never be blocked by a
broken link on the payer's side — the family is owed the money either way. The
resolved target is recorded on the audit row (`creditedTo`, `creditedUserId`) and
returned to the caller, so a fallback is visible after the fact rather than
silent.

### Why "funded" is not "covered"

`coverage.ts` answers *"is this student covered for this lesson"* and requires
`status: "active"`. This resolver answers *"who paid for this lesson"* and
deliberately accepts any status except `pending_payment`: refunds are routinely
issued after a subscription has expired or been cancelled, and the identity of
the payer does not change when it does. The two predicates look similar and mean
different things — hence two functions, each documented, rather than one shared
one that would be wrong for one of its callers.

## What was considered and rejected

- **Always credit the student** (the previous behaviour). Rejected: it is the
  wrong person in the most common case, and there is no transfer path to correct
  it afterwards.
- **Split the refund across both wallets** by who paid which part. Rejected: no
  payment is ever split across payers today, so it would be machinery for a case
  that does not exist.
- **Ask the operator at refund time.** Rejected: the system already knows, and a
  question the operator can answer wrongly is worse than a fact read from the
  row. If a genuine override is ever needed it can be added later as an explicit,
  audited choice on top of this default.

## Proof

`apps/superadmin/tests/db/refund-payer-wallet.test.ts` — a parent-funded lesson
credits the parent wallet with the ledger row naming the child, leaves the
student wallet at zero, and still writes a centre → student `transactions` row;
a lesson with no parent falls back to the student. The five existing refund
suites build students with no parent link and are unchanged by this, which is
the intended behaviour-preserving outcome for that case.
