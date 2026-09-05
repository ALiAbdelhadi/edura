# Refund — investigation and decision

Date: 2026-09-05. Scope: `apps/erp` refund/cancel-with-money-back, plus the
shared kernel (`packages/server-core`, `packages/database`) and the equivalent
surface in `apps/superadmin`.

Read-only. **No code was changed.** Part 1 is what the code does today; Part 2 is
the two options, with consequences. Nothing is implemented.

Prior work read first: [ERP_AUDIT_PLAN.md](ERP_AUDIT_PLAN.md) §5 and §8 Q4,
[AUDIT_REPORT.md](AUDIT_REPORT.md) H-9 / L-6 / L-9, and the money invariants in
`CLAUDE.md`.

> **The mapping was right but incomplete.** ERP_AUDIT_PLAN.md:237 records ERP's
> refund as "status transition only". That is true of the `PATCH` route — which
> turns out to have **no caller at all**. The refund the operator actually presses
> is a *different* surface the mapping did not connect: a **negative-amount
> payment**, which *does* write a ledger row. So the defect is not "no ledger
> entry"; it is a ledger entry that is unlinked, unbounded, unaudited and
> non-idempotent, next to a dead status-flip route that reports and revenue
> deliberately ignore.

---

## Part 1 — the refund story, end to end

### 1.1 Every entry point that can refund or return money

| # | Surface | Entry point (file:line) | Reachable today? | Moves money? |
|---|---|---|---|---|
| **E1** | **Counter refund from a receipt** (the real one) | UI [admin-fees-screen.tsx:598-611](apps/erp/src/features/admin/admin-fees-screen.tsx#L598) (button on every non-refund row) → [:373-411](apps/erp/src/features/admin/admin-fees-screen.tsx#L373) `handleRefund` → `postMoney("payments", { amount: -X })` [:387-393](apps/erp/src/features/admin/admin-fees-screen.tsx#L387) → API [payments/route.ts:35-40](apps/erp/src/app/api/v1/payments/route.ts#L35) → [payments.ts:38-151](packages/server-core/src/services/payments/payments.ts#L38) `recordPaymentTx` | **YES** — `center_admin` only | Records an outflow. Returns nothing to any balance. |
| **E2** | **Payment status flip** `paid → refunded` | [payments/[id]/route.ts:22-52](apps/erp/src/app/api/v1/payments/[id]/route.ts#L22) `PATCH` | **Route live, ZERO callers** — no `useUpdate` on `payments`, no `PATCH` fetch anywhere in `apps/erp/src` | **No.** Pure flag. |
| **E3** | **Cancel an unpaid subscription** | [subscriptions/[id]/cancel/route.ts:11](apps/erp/src/app/api/v1/subscriptions/[id]/cancel/route.ts#L11) → [subscriptions.ts:639-657](packages/server-core/src/services/subscriptions/subscriptions.ts#L639) | YES (student/parent) | **Correct by construction** — refuses anything but `pending_payment`, so no money exists yet. Not a refund path. |
| **E4** | **Cron expiry / stale-pending cancel** | [subscriptions.ts:660-701](packages/server-core/src/services/subscriptions/subscriptions.ts#L660) | YES (cron) | No. Status only, on unpaid or elapsed rows. |
| **E5** | **Superadmin: lesson refund with clawback** | [refunds.ts:30-256](apps/superadmin/src/lib/services/finance/refunds.ts#L30) `refundLessonForStudent` | **Service exists, NO route** — the `finance/refunds` route was deleted in the L-9 cleanup ([AUDIT_REPORT.md:326-330](AUDIT_REPORT.md#L326)). 5 DB suites still cover it. | Would: full ledger + wallet credit + teacher/center clawback. |
| **E6** | **Superadmin: mark a center payment refunded** | [center-money.ts:72-119](apps/superadmin/src/lib/services/admin/center-money.ts#L72) `adminMarkPaymentRefunded` | **Service exists, NO route** — `.../money/payments/[paymentId]/route.ts` is GET-only | No. Flag + audit that *says* `moneyReturned: false`. |
| **E7** | **Superadmin "view as" → ERP center_admin** | [superadmin-view-as](docs/decisions/superadmin-view-as.md) | YES | Reaches **E1** with the target's own ERP session; the write carries `impersonated_by`. It adds no separate refund surface. |
| **E8** | Bulk / import / counter / shift close | — | — | **None exist.** `grep` for a negative amount across `apps/erp/src` returns exactly one hit: [admin-fees-screen.tsx:389](apps/erp/src/features/admin/admin-fees-screen.tsx#L389). |

**The whole live refund capability of the ERP is E1.** E2 is dead; E5/E6 are
services without doors.

**Direct contradiction between the two apps, on the same shared function.**
`apps/superadmin` refuses the very write ERP's refund button makes:

```
center-money.ts:41-45   if (data.amount <= 0) throw new BusinessRuleError(
  "Amount must be positive — use the refund flow to return money, not a negative payment")
```

ERP calls the same `recordPaymentTx` with `-X` and no such guard. One app's
"sanctioned flow" is the other app's only flow.

---

### 1.2 What E1 writes today, field by field

One transaction ([payments.ts:38-151](packages/server-core/src/services/payments/payments.ts#L38)),
three writes and one skipped:

**(a) `payments` row** — a *new* row, not an update of the original:

| Field | Value | Note |
|---|---|---|
| `amount` | `-refundPiasters` | the sign is the only marker that this is a refund |
| `status` | `paid` (schema default) | **a refund is stored as "paid"** |
| `paymentMethod` | `cash` | the client sends none → `data.paymentMethod ?? "cash"` (:31, :50). **Refunding a card/wallet payment still records cash.** |
| `receiptNumber` | fresh `RCP-…-NNNNN` | burns a receipt sequence number (:88) |
| `note` | `"استرداد للإيصال {receipt} — {reason}"` | the **only** link to the original — free text |
| `shiftId` | `openShiftIdFor(...)` (:100) | correctly lands in the open till |
| `courseId` | **null** | the client never sends it (:387-393) — the refund is not attributed to the class the payment was for |
| *link to original* | **ABSENT** | no `reversal_of_id`, no FK, no column exists |
| *idempotency key* | **ABSENT** | no `client_request_id`; `postMoney` ([money-write.ts:45-50](apps/erp/src/features/admin/ledger/money-write.ts#L45)) sends none |

**(b) `transactions` row** ([:105-121](packages/server-core/src/services/payments/payments.ts#L105)):

```
type          = "refund"                    // because amount < 0
amount        = |data.amount|
fromEntityId  = centerId                    // direction flipped: center -> student
toEntityId    = studentId
status        = "completed"
paymentMethod = "cash"
notes         = "Cash payment at center (receipt RCP-…)"   // says PAYMENT, on a refund row
reversalOfId  = NULL                        // <-- the load-bearing omission
lessonId      = NULL
funding       = NULL
```

**(c) `points_ledger`** — `awardPoints` runs only when `amount > 0` ([:123-127](packages/server-core/src/services/payments/payments.ts#L123)).
Points awarded by the original payment are **never reversed**; no reversal
function exists ([points.ts](packages/server-core/src/services/points/points.ts)
exports only `awardPoints`, `getStudentPoints`, `listStudentPointsHistory`).

**(d) `audit_logs`** — **nothing.** `recordPaymentTx` writes no audit row. The
superadmin wrapper adds one ([center-money.ts:50-66](apps/superadmin/src/lib/services/admin/center-money.ts#L50));
the ERP route does not. So the live refund path is the *only* one of the two
that is unaudited.

**Not written at all:** `student_profiles.wallet_balance`, `wallet_ledger`,
`centers.wallet_balance`, `centers.credit_balance`, `center_wallet_ledger`,
`teacher_profiles.wallet_balance`, `subscriptions.*`, `enrollments.*`.

---

### 1.3 What the reader sees after a refund — today vs what it should be

Take the ordinary case: a student paid **500 EGP** cash at the counter for a
monthly subscription; the counter refunds the full 500.

| Reader | Source | **Today** | **Should be** | Verdict |
|---|---|---|---|---|
| Center takings (today card) | [takings.ts:19-33](apps/erp/src/features/admin/takings.ts#L19) | `received 500, refunded 500, net 0` | same | **correct** |
| Shift / till | [shifts.ts:30-38](packages/server-core/src/services/center/shifts.ts#L30), `expectedCash` [:113-114](packages/server-core/src/services/center/shifts.ts#L113) | expected cash drops by 500 → drawer must be 500 lighter at close | same | **correct**, and this is the one existing reconciliation hook |
| Center revenue report / timeseries | [reports.ts:184-196, 240-266](packages/server-core/src/services/reports/reports.ts#L184) via `paymentWhereBase` | net 0 | same | **correct** |
| Parent payment trend | [reports.ts:656-688](packages/server-core/src/services/reports/reports.ts#L656) | `paid 500, refunded 500, net 0` | same | **correct** |
| Outstanding fees count | [reports.ts:995-1006](packages/server-core/src/services/reports/reports.ts#L995) | student re-appears as owing 500 | same | **correct** |
| **Student wallet** | `student_profiles.wallet_balance` / `wallet_ledger` | **unchanged — 0** | +500 (Option A) or an explicit external-payout record (Option B) | **BROKEN — the money is nowhere** |
| **Student wallet screen** | [student-wallet-screen.tsx:50-61](apps/erp/src/features/student/student-wallet-screen.tsx#L50) renders a `refund` entry type | **the student is told nothing; no wallet row exists** | a `refund` row with `balance_after` | **BROKEN** |
| **Center/teacher statement gross** | [invoices.ts:24-39](packages/server-core/src/services/finance/invoices.ts#L24) aggregates `type: "payment"` only | gross still **500** — refunds never subtracted | gross net of refunds, or refunds shown as a separate line | **BROKEN — statements overstate** |
| **Original payment row** | `payments` | still `status = paid`, `amount = 500` | marked as reversed, or carrying `refunded_total` | **BROKEN — nothing on the receipt says it was refunded** |
| Receipt PDF | [receipt-document.ts:70](packages/server-core/src/services/payments/receipt-document.ts#L70) `isRefund: amount < 0` | prints a valid *refund* receipt | same | correct for the new row; the **original** receipt still prints as fully paid |
| Superadmin refunds report | [finance-reports.ts:157-178](apps/superadmin/src/lib/services/finance/finance-reports.ts#L157) `type: "refund"` | sees it (500) | same | **correct** — this is the one place ERP refunds surface platform-side |
| Accountant dashboard | [accountant.ts:63-66](apps/superadmin/src/lib/services/finance/accountant.ts#L63) | sees it | same | correct |
| Superadmin decision queue | [platform-dashboard.ts:51-54](apps/superadmin/src/lib/services/admin/platform-dashboard.ts#L51) `type:"refund", status:"pending"` | **always 0** — every writer sets `status:"completed"` | either drop the tile or introduce a pending state (Option B needs one) | dead counter |
| Backup restore-proof | [restore-test.ts:160-172](packages/database/scripts/restore-test.ts#L160) — orphan-refund check skips `reversal_of_id IS NULL` | **passes vacuously** on every ERP refund | should be covered | the integrity check does not see these rows |

**The exact discrepancy, in one sentence:** the center's books balance to zero,
the till reconciles, and the student's balance never moves — the refund is
recorded as *cash left the drawer* and nothing records *whether the student
received it*, nor is the original charge marked as reversed.

**And a second, sharper one.** The refund button is rendered on **every**
non-refund row ([:598-611](apps/erp/src/features/admin/admin-fees-screen.tsx#L598)),
including subscription payments made **online** (card/wallet). Those carry
`centerId = sub.centerId` ([subscriptions.ts:211-231](packages/server-core/src/services/subscriptions/subscriptions.ts#L211))
so they appear in the center's fee log — but the money is **platform-held**
([center-credit.ts:6-10](packages/server-core/src/services/finance/center-credit.ts#L6)),
never in the drawer. Refunding one writes a **cash outflow the center never took
in**: the till's expected cash drops by money that was never there, the shift
closes with a phantom surplus, and the platform still holds the student's funds.

---

### 1.4 Downstream consumers — does each read the refunded amount correctly?

| Consumer | Reads | Correct? |
|---|---|---|
| `takingsOf` / today card / shift buckets | `payments.amount` signed | **Yes** |
| `getPaymentsReport`, `getRevenueTimeseries` | `payments.amount` under `status notIn [failed,pending]` ([reports.ts:127-132](packages/server-core/src/services/reports/reports.ts#L127)) | **Yes** for E1. **No** for E2 — a `refunded` status is *not* excluded, so a status flip changes no total anywhere. E2 is invisible to every report by design. |
| `getParentPaymentTrend`, outstanding-fees | signed `payments.amount` | **Yes** |
| Report **exports** | same service functions ([report-export](docs/decisions/report-export.md) invariant) | **Yes** — inherits whatever the screen has |
| **`teacherStatementAmounts` / `centerStatementAmounts`** ([invoices.ts:24-39](packages/server-core/src/services/finance/invoices.ts#L24)) | `transactions type:"payment"` for gross; **never** `type:"refund"` | **NO — ignores refunds.** Every issued statement overstates gross by the refunded total. |
| **Session settlement / revenue share** ([distribution.ts](packages/server-core/src/services/finance/distribution.ts)) | attendance + `coveredStudentIds` → `subscriptions.status = "active"` ([coverage.ts:9-24](packages/server-core/src/services/subscriptions/coverage.ts#L9)) | **NO — ignores refunds, and keeps paying out.** A refund leaves the subscription `active`, so every later lesson still distributes teacher/center net for a student who was refunded. Not a double-count of the refund; a **continuing** overpayment funded by money that was returned. |
| **Payouts** ([teacher-wallet.ts](apps/erp/src/lib/services/finance/teacher-wallet.ts), [center-wallet.ts](packages/server-core/src/services/finance/center-wallet.ts)) | `wallet_balance` minus open payouts | **Indirectly wrong** — the wallet was credited by settlement (above) and a refund never claws any of it back, so the beneficiary can withdraw money the platform gave back to the student. |
| `refundsReport`, accountant dashboard | `transactions type:"refund"` | **Yes** |
| Decision queue refund tile | `type:"refund", status:"pending"` | **Dead** — always zero |
| `restore-test` orphan-refund check | `reversal_of_id IS NOT NULL` | **Blind** to ERP refunds |

**Nothing double-counts a refund. Two things ignore it** (statements, and
settlement/payout via the still-active subscription), and one platform tile is
dead.

---

### 1.5 Does a refund touch the enrollment / seat? Is it atomic?

**No, and the question of atomicity does not arise — there is nothing to be
atomic with.**

- `enrollments` — untouched. The student keeps the roster seat.
- `subscriptions` — untouched. `status` stays `active`, `cancelledAt` stays null.
  The refund cannot even *find* the subscription: `Subscription.paymentId`
  ([schema.prisma:2174](packages/database/prisma/schema.prisma#L2174)) points at
  the original payment, and the refund row has no link back to it.
- Consequence, via [coverage.ts:9-24](packages/server-core/src/services/subscriptions/coverage.ts#L9):
  a refunded student is **still covered**, still attends, and still triggers a
  revenue distribution at every lesson in the period.

So the coupling is not "non-atomic" — it is **absent**. Whatever we build has to
decide the coupling for the first time. The transaction boundary itself is sound
(`scopedDb` → `withTenant`, one interactive tx with COMMIT-window-safe retry),
so adding the subscription write into the same tx is mechanically easy.

---

### 1.6 The superadmin refund service — compare, and should ERP reuse it?

[`refundLessonForStudent`](apps/superadmin/src/lib/services/finance/refunds.ts)
(226 lines) is the reference implementation. In one `platformDb` transaction it:

1. finds the original `transactions` row (`type:"payment"`, `status:"completed"`) — :42-46
2. refuses if a refund already reverses it — :48-52
3. re-derives the split from the **charged** commission rows, falling back to
   `resolveCommission` / `resolveTeacherAgreement` — :95-120
4. writes **three** ledger rows: the `refund` with `reversalOfId`, plus two
   `adjustment` rows returning the platform fees — :125-161
5. claws back the teacher's net with a **conditional** `updateMany … walletBalance: { gte: teacherNet }` and throws `BusinessRuleError` (422) if it can't cover — :163-169 (this is the H-9 fix)
6. claws back the center side — `creditMove(type:"refund_reversal")` for `center_held`, conditional wallet decrement for platform-held — :170-188
7. **credits the student's wallet** via `walletCredit(type:"refund")` — :190-200
8. writes an `audit_logs` row with the actor, in the same tx — :202-221
9. maps the DB unique violation (P2002 on `transactions_one_refund_per_payment`) to a clean 422 — :24-28, :236
10. notifies student + guardians **after** commit — :240-253

It satisfies every non-negotiable on the list except that its idempotency key is
the *charge* (one refund per lesson charge, no partials).

**Should ERP reuse it? No — not as-is. Reuse its shape, not its body.**

- **It answers a different question.** It refunds a **lesson charge** — a
  `transactions` row minted by `distribution.ts` at settlement, keyed by
  `(lessonId, studentId)`. ERP's refund starts from a **`payments` receipt** the
  counter issued. Different object, different key, different arithmetic.
  `refundLessonForStudent` would throw `NotFoundError("No completed charge found
  for this student and lesson")` on every ERP refund, because there is no
  `lessonId`.
- **It is the wrong tenancy.** It runs on `platformDb` (no RLS tenant) and
  reaches teacher wallets and platform commission — both **forbidden in ERP**
  under the money-read-only / no-second-engine invariants read the other way:
  ERP must not reach *platform* money. `scopedDb` for a `center_admin` binds to
  `withTenant(centerId)` and the DB role has UPDATE/DELETE **revoked** on
  `transactions` ([migration 00000000000003:83-89](packages/database/prisma/migrations/00000000000003_integrity_sequences_indexes/migration.sql#L83)).
- **It is currently unreachable** (E5) — reusing it means also deciding to
  re-expose it, which is a separate decision.

**What ERP should reuse — and this is the "no second money engine" answer:**

| Reuse | Not reuse |
|---|---|
| `walletCredit` / `walletDebit` ([wallet.ts:38-84](packages/server-core/src/services/wallet/wallet.ts#L38)) — the balance+ledger pair, unchanged | `refundLessonForStudent` body |
| The conditional-`updateMany` clawback idiom (H2/H-9) | teacher-wallet or commission reach from ERP |
| `reversalOfId` + the existing partial unique `transactions_one_refund_per_payment` ([migration 20260720170000](packages/database/prisma/migrations/20260720170000_refund_unique/migration.sql)) | a new idempotency mechanism invented for this |
| `creditMove` ([center-credit.ts:63-89](packages/server-core/src/services/finance/center-credit.ts#L63)) for the center↔platform leg | |
| The `client_request_id` + composite-unique pattern from `payouts` ([migration 20260831090000](packages/database/prisma/migrations/20260831090000_payout_client_request_id/migration.sql)) | |
| P2002 → 422 mapping, in-tx audit, notify-after-commit | |

**The correct shape is a new `refundPayment(paymentId, …)` in
`packages/server-core/src/services/payments/`** — one kernel function, called by
ERP under `scopedDb` and (if the door is ever reopened) by superadmin under
`platformDb`, exactly as `recordPaymentTx` is shared today. The lesson-level
`refundLessonForStudent` stays as the *settled-lesson* refund and remains
superadmin-only, because only it may touch teacher wallets and platform
commission.

---

### 1.7 Non-negotiables — scoreboard against today's E1

| Requirement | E1 today |
|---|---|
| Ledger entry in the **same transaction** as the status change | **Partial.** A `transactions` row *is* written in the same tx — but there is no status change to pair it with, and the row has `reversal_of_id = NULL`, so it reverses nothing. |
| Balance counters and ledger cannot diverge | **Vacuously true, wrongly.** No counter moves at all, so nothing can diverge — because nothing is tracked. |
| Idempotent, **DB-enforced** | **NO.** No `client_request_id`, no `reversal_of_id`, so `transactions_one_refund_per_payment` never fires. Only `TwoStepCommit` + a `refundBusy` flag ([:987-997](apps/erp/src/features/admin/admin-fees-screen.tsx#L987)) — pure client state. A retry after a 45s timeout mints a second refund with a second receipt. |
| Audited with an actor, in-transaction | **NO.** Zero audit rows. Only `payments.recorded_by`. |
| Cannot drive a balance negative silently | **Vacuously true** — no balance is touched. (Note `centers.credit_balance` has **no** non-negative CHECK by design — it is a signed position, negative = arrears — while `student_profiles`, `parent_profiles`, `teacher_profiles` and `centers.wallet_balance` all do.) |
| Amount bounded by amount actually paid | **NO.** `refundExceeds` ([:358](apps/erp/src/features/admin/admin-fees-screen.tsx#L358)) is **client-side only**; the server takes any value down to `-99,999,900` piasters ([common.ts:32-36](packages/server-core/src/validation/common.ts#L32)). And the bound compares against **one row**, not against what has already been refunded — so N refunds of the full receipt amount are all individually "valid". |

**Six requirements, zero met.**

---

## Part 2 — the two options

### 2.0 The foundation both options need (identical in A and B)

Neither option works without this, so it is not a differentiator — it is the
price of entry, and it is where every DB-level guarantee comes from.

**Schema (one migration, all additive):**

```sql
-- 1. the refund row points at what it reverses
ALTER TABLE payments ADD COLUMN reversal_of_id uuid REFERENCES payments(id);
ALTER TABLE payments ADD CONSTRAINT payments_reversal_is_negative
  CHECK (reversal_of_id IS NULL OR amount < 0);
CREATE UNIQUE INDEX payments_one_refund_per_payment
  ON payments (reversal_of_id) WHERE reversal_of_id IS NOT NULL;

-- 2. over-refund bounded on the SAME ROW, so a CHECK can enforce it
ALTER TABLE payments ADD COLUMN refunded_total int NOT NULL DEFAULT 0;
ALTER TABLE payments ADD CONSTRAINT payments_refunded_within_amount
  CHECK (refunded_total >= 0 AND refunded_total <= GREATEST(amount, 0));

-- 3. retry-safe, mirroring payouts_client_request_unique
ALTER TABLE payments ADD COLUMN client_request_id text;
CREATE UNIQUE INDEX payments_client_request_unique
  ON payments (center_id, client_request_id);

-- 4. let the refund's ledger row find the charge's ledger row,
--    which re-arms the EXISTING transactions_one_refund_per_payment index
ALTER TABLE transactions ADD COLUMN payment_id uuid REFERENCES payments(id);
CREATE INDEX transactions_payment_id_idx ON transactions (payment_id);
```

Why `refunded_total` and not a cross-row `SUM` guard: a `CHECK` cannot look at
other rows, and a trigger would be a second money engine. Same-row is the only
shape Postgres can enforce, and the conditional update
`UPDATE payments SET refunded_total = refunded_total + X WHERE id = $1 AND refunded_total + X <= amount`
gives us the H2 idiom — zero rows affected means a clean 422, never a 500.

`payments_one_refund_per_payment` makes today's shape **one refund per receipt**
(full or partial, once). `refunded_total` is what makes *multiple* partial
refunds a later additive change (drop that one index) rather than a redesign.

**Prisma:** `prisma migrate dev` cannot model the partial unique index or the
`CHECK`s and **will offer to drop them** — refuse, and assert them in a
`c06-refund-guards` DB suite, exactly as `c04`/`c05` do
(`CLAUDE.md` — dedupe-guards).

**Service:** one new kernel function
`packages/server-core/src/services/payments/refund-payment.ts`, in a single
transaction:

1. `findUnique` the original payment; refuse if `amount <= 0`, if it belongs to
   another center (`requireCenterScope`), or if already reversed
2. **gate on settlement** — if the payment activated a subscription
   (`subscriptions.paymentId = original.id`) and any covered `sessions.distributedAt`
   is non-null, refuse with a domain error naming the settled lesson. That money
   is already in a teacher/center wallet and clawing it back is
   `refundLessonForStudent`'s job, not ERP's. This is what stops the
   §1.4 "continuing overpayment".
3. conditional `refunded_total` bump (bounds the amount, in the DB)
4. create the negative `payments` row with `reversal_of_id`, `client_request_id`,
   the **original's `payment_method` and `course_id`** (not a hardcoded `cash`)
5. create the `transactions` row: `type "refund"`, `reversal_of_id` = the
   original charge's transaction id (found via the new `transactions.payment_id`),
   `funding` copied from the original, and a `notes` string that says *refund*
6. **the money leg — this is the only part where A and B differ**
7. cancel the subscription + release the seat if the refund is full
   (`status:"cancelled"`, `cancelledAt`), in the same tx
8. `tx.auditLog.create` with `actorId` / `onBehalfOf`, in the same tx
   (pattern: [attendance.ts:240-254](packages/server-core/src/services/attendance/attendance.ts#L240))
9. catch `P2002` → `BusinessRuleError` "already refunded" (422)
10. notify student + guardians **after** commit

**UI:** `handleRefund` sends a `clientRequestId` from a `useRef` (pattern already
in this same file at [:202](apps/erp/src/features/admin/admin-fees-screen.tsx#L202)),
and the refund button is hidden on rows that are already fully refunded.

**Also fixed by the foundation, for free:** `invoices.ts` gross must subtract
`type:"refund"` (§1.4); delete or wire the dead `PATCH` route (E2); decide E5/E6.

---

## Option A — money returns INSIDE the system (wallet credit)

The refund credits the student's platform wallet. The center keeps the cash it
collected; the platform's obligation to the student increases.

### What changes

**Schema:** the foundation, **plus nothing.** `wallet_ledger` and
`student_profiles.wallet_balance` already exist, with the non-negative CHECK
([migration 20260722000100](packages/database/prisma/migrations/20260722000100_student_wallet/migration.sql)),
`balance_after >= 0`, and `reconcileWallet` ([wallet.ts:120-143](packages/server-core/src/services/wallet/wallet.ts#L120))
already proves counter == ledger sum == last `balance_after`.

**Step 6 becomes one line:**

```ts
const { balanceAfter } = await walletCredit(tx, studentId, amount, {
  type: "refund", method: original.paymentMethod, refNumber,
  paymentId: refundPayment.id, relatedTxnId: original.transactionId,
  reason: `Refund of receipt ${original.receiptNumber}: ${reason}`,
  recordedBy: user.id,
});
```

**Plus the center↔platform leg.** Cash the center holds is now owed to the
platform, which is exactly what `credit_balance` is for
([migration 20260825180100:90](packages/database/prisma/migrations/20260825180100_center_credit_clearing/migration.sql#L90)):

```ts
await creditMove(tx, { centerId, type: "refund_reversal", delta: -amount, ... });
```

`credit_balance` is *deliberately* signed with no floor — negative means arrears —
so this cannot 500, and it lands in `center_wallet_ledger` with a running
`balance_after`. **If the original was online (platform-held), skip this leg
entirely** — the platform already holds the money. That single branch is what
fixes the phantom-cash bug in §1.3.

**Files touched:** the migration; new `refund-payment.ts`; `payments/[id]/refund/route.ts`
(new POST) or the existing `[id]` route; `admin-fees-screen.tsx` (`clientRequestId`,
hide-when-refunded, wallet-balance copy); `invoices.ts` (subtract refunds);
`messages-ar.ts` + `ar/admin-manage.json` + `en` (new domain errors, and
`refundFinality` must stop saying "negative entry" and start saying "credited to
the student's wallet"); a new `apps/erp/tests/db/refund-payment.test.ts` and
`c06-refund-guards.test.ts`. ~9 files.

### How the ledger records it

Four rows, one transaction, all linked:

| Table | Row |
|---|---|
| `payments` | negative, `reversal_of_id` → original, `client_request_id` |
| `payments` (original) | `refunded_total += amount`, conditionally |
| `transactions` | `type:"refund"`, `reversal_of_id` → the charge's txn |
| `wallet_ledger` | `type:"refund"`, `delta:+amount`, `balance_after` |
| `center_wallet_ledger` | `refund_reversal`, `delta:-amount` (center-held only) |
| `audit_logs` | `payment.refunded`, actor, before/after |

### If the beneficiary's wallet was already paid out

**This is why step 2 exists.** At the *payment* level the beneficiary has been
paid nothing — a counter cash payment credits **no** wallet (`recordPaymentTx`
touches no `wallet_balance`); teacher and center wallets are fed only by
`distribution.ts` at settlement ([:378-384](packages/server-core/src/services/finance/distribution.ts#L378)).
So **no clawback is needed, provided nothing has settled yet** — and step 2's
`distributedAt` gate is what guarantees that.

When a lesson *has* settled, ERP refuses. The operator sees a domain error, not
a partial refund:

> "درس واحد أو أكثر من هذا الاشتراك تمت تسويته بالفعل ووُزّعت حصصه على المدرّس
> والسنتر. لا يمكن ردّ هذا الإيصال من هنا — استخدم استرداد الدرس."
> *(One or more lessons under this subscription have already been settled and
> distributed to the teacher and the centre. This receipt cannot be refunded
> here — use the lesson refund.)*

`BusinessRuleError` → 422, never a 500. If the door to `refundLessonForStudent`
is reopened, that path already handles the clawback and already returns H-9's
clean 422 when the beneficiary wallet cannot cover it.

### Non-negotiables

| Requirement | How A satisfies it |
|---|---|
| Ledger row in the same tx as the status change | All six writes are inside one `scopedDb` interactive tx; `refunded_total` (the status change) and the `transactions` row commit together or not at all |
| Counters and ledger cannot diverge | `walletCredit` is the *only* writer of `wallet_balance` and always writes its `wallet_ledger` row with `balance_after` in the same statement pair; `reconcileWallet` asserts the three-way equality and `wallet.test.ts` already runs it |
| Idempotent, DB-backed | Two independent constraints: `payments_client_request_unique` (retry) and `payments_one_refund_per_payment` (double-submit), plus the existing `transactions_one_refund_per_payment`. P2002 → 422 |
| Audited with an actor, in-tx | `tx.auditLog.create` inside the tx; `audit_logs` has UPDATE/DELETE revoked, so it is append-only |
| No silent negative balance | `walletCredit` only increments. `credit_balance` is signed by design and ledgered. Wallet CHECKs remain armed |
| Bounded by what was paid | `payments_refunded_within_amount` CHECK + the conditional `refunded_total` update — enforced **in the DB** |

### What breaks if we pick A and later switch to B

**Little, and nothing dangerous.** The wallet is a real liability that has
already been credited, so a later switch means adding a **withdrawal** path
(wallet → cash out), not undoing anything: the wallet ledger stays honest, and
`refund-payment.ts` step 6 becomes a branch instead of a single call. Cost: a
`payments.refund_channel` column added later, and every already-refunded student
keeps a wallet balance that the new flow would have paid out in cash — an
operational backlog, not a data problem. **Reversible.**

### The real cost of A

It changes the product promise: money the student paid **stays on the platform**.
For an Egyptian centre where a parent hands over cash and expects cash back when a
child withdraws, "your 500 EGP is in the app" may be the wrong answer, and the
counter will end up doing an off-books cash handover anyway — at which point the
wallet balance is a lie in the other direction. A is technically cleaner and
commercially stickier; it is only correct if the wallet is genuinely spendable
and, ideally, withdrawable.

---

## Option B — money returns OUTSIDE the system, and the system records it

The cash leaves the drawer (or the gateway reverses the charge). The platform
records an outflow it did **not** execute, and reconciles it against evidence.

### What changes

**Schema:** the foundation, **plus a four-column proof block:**

```sql
CREATE TYPE refund_channel AS ENUM ('cash_drawer','bank_transfer','gateway','wallet');
ALTER TABLE payments ADD COLUMN refund_channel    refund_channel;
ALTER TABLE payments ADD COLUMN refund_external_ref text;
ALTER TABLE payments ADD COLUMN refund_confirmed_at timestamptz;
ALTER TABLE payments ADD COLUMN refund_confirmed_by uuid REFERENCES users(id);

-- a refund row must declare its channel; a non-refund row must not
ALTER TABLE payments ADD CONSTRAINT payments_refund_channel_shape
  CHECK ((reversal_of_id IS NULL AND refund_channel IS NULL)
      OR (reversal_of_id IS NOT NULL AND refund_channel IS NOT NULL));
-- confirmation requires evidence and an actor, together
ALTER TABLE payments ADD CONSTRAINT payments_refund_confirmation_complete
  CHECK ((refund_confirmed_at IS NULL AND refund_confirmed_by IS NULL)
      OR (refund_confirmed_at IS NOT NULL AND refund_confirmed_by IS NOT NULL
          AND refund_external_ref IS NOT NULL));
-- one gateway reversal per provider reference
CREATE UNIQUE INDEX payments_refund_external_ref_unique
  ON payments (refund_channel, refund_external_ref)
  WHERE refund_external_ref IS NOT NULL AND refund_channel <> 'cash_drawer';
```

**Step 6 becomes a two-phase state**, not a money move:

- **Phase 1 — `refund_pending`.** The negative `payments` row is written with
  `refund_channel` and `refund_confirmed_at = NULL`; the `transactions` row is
  written with `status = "pending"` (which is what finally makes the
  [decision-queue tile](apps/superadmin/src/lib/services/admin/platform-dashboard.ts#L51)
  a live counter instead of a permanent zero). `refunded_total` is bumped now —
  the seat is released and the amount reserved, so no second refund can be armed
  against the same receipt while this one is outstanding.
- **Phase 2 — confirmation.** `refund_external_ref` + `refund_confirmed_at` +
  `refund_confirmed_by` are set and the transaction flips to `completed`. Because
  `transactions` has **UPDATE revoked** from `edura_app`
  ([migration 00000000000003:83](packages/database/prisma/migrations/00000000000003_integrity_sequences_indexes/migration.sql#L83)),
  the flip cannot be an `UPDATE` — it must be a **second, append-only
  `adjustment` row** carrying the reference, with the pending row left standing.
  That is a real constraint, and it is a point in B's favour: the evidence trail
  is immutable by construction.

**Files touched:** everything in A, **plus** a confirmation route
(`payments/[id]/refund/confirm`), a "refunds awaiting confirmation" list on the
fees screen with its own query + empty/error states, the paymob webhook
([paymob/webhook](apps/erp/src/app/api/v1/payments/paymob/)) extended to accept
reversal events, and a shift-close warning. ~15-17 files, plus the enum
migration. Roughly **double A's surface**.

### How the ledger records an outflow it did not execute

Honestly: as an **obligation**, not a settlement. `type:"refund", status:"pending"`
is a promise to pay; only the confirmation row makes it a completed movement.
The refunds report ([finance-reports.ts:157-178](apps/superadmin/src/lib/services/finance/finance-reports.ts#L157))
and the accountant dashboard ([accountant.ts:63](apps/superadmin/src/lib/services/finance/accountant.ts#L63))
both currently aggregate **all** `type:"refund"` regardless of status and would
need a `status:"completed"` filter, or the platform books an unpaid promise as a
paid refund — the exact failure B exists to prevent.

### The proof/reference field, per channel

| Channel | `refund_external_ref` | Who may confirm |
|---|---|---|
| `cash_drawer` | the paper voucher / receipt number the student signs | the counter, at the moment of handover |
| `bank_transfer` | bank transaction reference | centre manager |
| `gateway` | the provider's refund id | **only the webhook** — never a human |
| `wallet` | n/a (this is Option A, kept in the enum so both can coexist) | — |

### How reconciliation works, and how an operator cannot fake it

Three independent mechanisms, in order of strength:

1. **The till, automatically.** A `cash_drawer` refund reduces `expectedCash`
   ([shifts.ts:113-114](packages/server-core/src/services/center/shifts.ts#L113),
   via `cashNetOf(buckets)`). If the operator marks a refund paid and keeps the
   cash, the drawer at close is **500 EGP heavier than expected** and
   `variance` is positive and non-zero. This already exists and needs no new
   code — it just needs the shift-close screen to name the cause.
2. **Gateway refunds cannot be self-confirmed.** The confirm route rejects
   `refund_channel = 'gateway'` from any human session; only the webhook path,
   which already verifies HMAC with `timingSafeEqual` (C1), may set
   `refund_confirmed_at`. `payments_refund_external_ref_unique` stops the same
   provider reference confirming two refunds.
3. **The evidence CHECK.** `payments_refund_confirmation_complete` makes it
   impossible to record a confirmation without a reference *and* a named actor —
   there is no "confirmed, no proof" state the DB will accept.

What none of this prevents: a determined operator writing a fake voucher number
and pocketing cash. **That is a cash-handling control, not a software control** —
the honest answer is that B makes it *visible* (an unexplained shift variance
plus a named `refund_confirmed_by`), not impossible. Two-person confirmation
(the arming staff member cannot be `refund_confirmed_by`) is available as a
later tightening and is worth stating as such rather than pretending the DB
solves it.

### Non-negotiables

| Requirement | How B satisfies it |
|---|---|
| Ledger row in the same tx as the status change | Phase 1 writes `payments` + `transactions(pending)` + `refunded_total` + audit in one tx. Phase 2 appends the `adjustment` row + confirmation columns in a second, self-contained tx |
| Counters and ledger cannot diverge | No cached counter moves at all — the balance of record is the **till**, and the shift already recomputes `expectedCash` from the payment rows rather than caching it. Divergence is structurally impossible; the trade is that the student's position is not tracked anywhere. |
| Idempotent, DB-backed | Phase 1: same two indexes as A. Phase 2: `payments_refund_external_ref_unique` + the `refund_confirmed_at IS NULL` guard in the conditional update |
| Audited with an actor, in-tx | Two audit rows — `payment.refund_initiated` and `payment.refund_confirmed` — each with its own actor, each in its own tx. Strictly more audit than A |
| No silent negative balance | Nothing is decremented. `credit_balance` is *not* touched — B's whole premise is that the money left the centre, not the platform |
| Bounded by what was paid | Same `payments_refunded_within_amount` CHECK, applied at phase 1 |

### What breaks if we pick B and later switch to A

**More, and some of it needs a data decision.** Every already-refunded receipt
carries a `refund_channel` and a claim that cash left the building. Switching to
wallet credit means:

- new refunds branch to `walletCredit` — easy, additive;
- but old refunds **must not** be retro-credited, or every historical refund pays
  twice. So the two shapes must coexist permanently, keyed by `refund_channel` —
  which is fine, and is why the enum includes `wallet` from day one;
- the `refund_pending` state, the confirmation route, the webhook branch and the
  awaiting-confirmation list stay in the codebase forever, serving only history;
- the `status:"completed"` filters added to the refunds report and the accountant
  dashboard must stay, because pending rows still exist.

**Reversible, but it leaves permanent scar tissue.** A→B is a clean addition;
B→A is a fork you carry.

---

## Side by side

| | **A — wallet credit** | **B — external, recorded** |
|---|---|---|
| Where the money ends up | student's platform wallet | student's hand / card |
| Matches the Egyptian counter reality | Partly — parents often want cash | Yes |
| Matches what the UI promises today ("قيد بالسالب في الدفتر") | needs new copy | yes |
| New schema | 4 columns, 3 indexes, 2 CHECKs (foundation only) | + 1 enum, 4 columns, 2 CHECKs, 1 index |
| Files touched | ~9 | ~16 |
| New states to operate | none | `refund_pending` → confirmed, and a queue to work |
| Fraud surface | none new — the money never leaves | cash handover; mitigated, not eliminated |
| Reconciliation | `reconcileWallet`, already built and tested | shift variance + gateway webhook |
| Reversibility | **A→B is clean** | **B→A forks permanently** |
| Fixes the phantom-cash bug (§1.3) | yes, via the `funding` branch | yes, via `refund_channel` |
| Fixes the settlement overpayment (§1.4) | yes, via the `distributedAt` gate | yes, same gate |

Both options satisfy all six non-negotiables. Both require the §2.0 foundation,
which is where every DB-level guarantee lives. The choice between them is a
**product** choice about where a refunded pound sits — not a technical one.

**One thing to settle either way:** E2 (the dead `PATCH` route) should be deleted
or wired, and E5/E6 (the two superadmin services with no doors) should be given
routes or removed. Leaving a live route that silently changes nothing next to a
proven service nobody can call is how the next reader concludes the wrong thing —
as this investigation's own starting premise shows.

---

**Nothing has been implemented. Pick A or B and I will build it.**
