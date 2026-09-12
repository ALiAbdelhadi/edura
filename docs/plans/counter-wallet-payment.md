# Plan for approval — let the counter accept a student's wallet balance

Date: 2026-09-05. Status: **NOT IMPLEMENTED — awaiting Ali's decision.**
Context: [WALLET_SPENDABILITY.md](../audits/WALLET_SPENDABILITY.md) item 3.

## What it is

Today a family can put cash **into** a student's platform wallet at the counter
(`center/wallet-topup`, receptionist/manager) but the counter cannot take money
back **out** of it. Every counter money path is typed `CounterMethod`
(`["cash","instapay","pos_card","mobile_wallet"]`,
[subscriptions.ts:111-114](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L111)),
and `"wallet"` is a `FundingMethod` but deliberately not one of those four.

This plan would add a fifth counter settlement method: **pay from the student's
balance**, so a family that topped up in cash can use it where they actually
buy — at the desk.

## Why it is larger than the two changes already shipped

The student-side button was one field and one button because the service, the
role guard and the route schema already existed. None of that is true here.

### 1. It widens a type that gates four money paths

`CounterMethod` is the allow-list for `recordPayment`
([payments.ts:18](../../packages/server-core/src/services/payments/payments.ts#L18)),
`recordCounterSubscription` and `createWalkInSubscriptionTx`
([subscriptions.ts:505, :527](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L505)),
and the `POST /api/v1/payments` schema
([route.ts:32](../../apps/erp/src/app/api/v1/payments/route.ts#L32)). Adding a
member to it silently widens all four at once — including the raw payment path,
which must **not** accept `wallet` (a raw payment records cash movement, and
there is no balance to debit against a free-form amount). So the change is not
"add a string to the union": it is splitting the union into
`CashDrawerMethod` (the four, for `recordPayment` and the shift) and
`CounterSettlementMethod` (those plus `wallet`, for subscription settlement
only), and re-typing every call site so the compiler enforces the split.

### 2. The money legs

Two are already correct and need no work — worth stating so they are not
re-litigated:

- **`credit_balance`**: `fundingOfMethod("wallet")` returns `platform_held`
  ([center-credit.ts:6-10](../../packages/server-core/src/services/finance/center-credit.ts#L6)),
  so the centre is paid its share through settlement rather than holding cash,
  exactly as an online payment already works.
- **The shift**: `cashNetOf` reads only the `cash` bucket
  ([shifts.ts:48-50](../../packages/server-core/src/services/center/shifts.ts#L48)),
  so a wallet-settled subscription would correctly leave `expectedCash`
  unchanged and not create a phantom drawer variance.

The leg that **does** need work is the wallet debit itself. It must be inside
the same transaction as the subscription activation, using `walletDebit`'s
existing conditional `updateMany` so an insufficient balance is a clean 422 and
never a partial settlement. `settleSubscriptionMoney` already does this for the
online path ([:180-199](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L180)) —
the work is routing the counter path through the same branch rather than
duplicating it.

### 3. A receipt method outside the drawer

`formatCenterReceipt` is fine, but the printed receipt and the shift breakdown
both key off `paymentMethod`. A `wallet` receipt has to read as *"paid from
balance — no cash taken"*, in both languages, or a parent will read a normal
receipt and expect the drawer to have their money. New `PaymentMethod` enum
value handling in `receipt-document.ts`, `receipt-sheet.tsx`, `shift-card.tsx`,
and the Arabic/English message files.

### 4. The real risk: consent

**This is the reason to think before building it, not the type work.** Every
other counter method requires the family to physically hand something over —
cash, a card, a phone. Spending a wallet balance requires nothing from them. A
receptionist could settle a subscription against a child's balance with the
family not present and no artefact proving they agreed.

The mitigations available, in increasing strength:

| Mitigation | Cost | Strength |
|---|---|---|
| Audit row naming the staff member (already automatic via `centerStaff`) | free | after-the-fact only |
| Require the student code to be typed, as `readStudentScan` already does at check-in | small | proves the card was present |
| Require the card QR to be scanned | small | proves the card was present, and it is signed |
| Push notification to student + guardians on every wallet debit | small | the family finds out immediately |
| A per-student "allow counter to spend my balance" opt-in | medium | genuine consent, but another setting to explain |

My recommendation if this is built: **student code required + notification on
every debit**, matching how the counter already proves a student is present at
check-in. The opt-in is the honest maximum but adds a setting to a screen the
operator audience (see [edura-operator-audience]) will not read.

## Effort

| Piece | Estimate |
|---|---|
| Split `CounterMethod` into two unions, re-type call sites | 0.5 day |
| Route the counter subscription path through the wallet debit branch | 0.5 day |
| Receipt / shift / i18n handling for the new method | 0.5 day |
| Consent mechanism (student code + notification) | 0.5 day |
| Counter UI: balance shown, method picker, insufficient-balance state | 0.5 day |
| DB suite: settles once, refuses when short, no drawer variance, audit + notification | 0.5 day |
| **Total** | **≈3 days** |

No migration is needed — `PaymentMethod` already contains `wallet`
([schema.prisma](../../packages/database/prisma/schema.prisma)), and both the
wallet balance and its ledger exist.

## Risk

**Medium.** Nothing here invents a money engine — every leg routes through
`walletDebit` / `settleSubscriptionMoney` / `distribution`, which are built and
tested. The two things that could bite:

1. **The type split touching `recordPayment`.** If `wallet` leaks into the raw
   payment path, the counter could record a wallet "payment" with no debit —
   money recorded that never moved. The split exists to make that a compile
   error; the DB suite should assert it as well.
2. **Consent.** A capability to spend a family's balance without them present is
   new in this product, and it is the kind of thing that is discovered by a
   parent, not by a test.

## The alternative, if this is not built

Do not leave cash going in with no way out. See the recommendation in the
session summary: gate or disable counter **cash** top-up until this ships. A
top-up the family cannot reach is worse than a top-up they cannot make.
