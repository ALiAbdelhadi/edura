# Is the student wallet real money? — verification before committing to Option A

Date: 2026-09-05. Read-only. **No code was changed.**

Follows [REFUND_DECISION.md](REFUND_DECISION.md), which offered Option A (refund →
student wallet credit). This document tests the premise that option rests on: that
a wallet credit is money the family can actually use.

**Two wallets exist and they are not the same thing.** Every answer below splits
on this, because the distinction decides the verdict:

| | Column | Ledger | Fed by | Spent by |
|---|---|---|---|---|
| **Student wallet** | `student_profiles.wallet_balance` | `wallet_ledger` | online top-up **and** cash at the counter | `walletDebit` — **one caller, no UI reaches it** |
| **Parent wallet** | `parent_profiles.wallet_balance` | `parent_wallet_ledger` | online top-up **only** | `parentWalletDebit` — wired to a real button |

---

## 1. Can a student or parent actually SPEND wallet balance?

**Every production caller of `walletDebit` / `parentWalletDebit`, exhaustively.**
`grep` across `apps/**` and `packages/**` (excluding `node_modules` and the
generated client) returns **two** non-test call sites, both inside the same
function:

| Caller | Which wallet | Reached when |
|---|---|---|
| [subscriptions.ts:182-189](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L182) `parentWalletDebit` | **parent** | `settleSubscriptionMoney(..., method="wallet")` **and** a `payerUserId` is present |
| [subscriptions.ts:191-197](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L191) `walletDebit` | **student** | same, with **no** `payerUserId` |

Both sit inside [`settleSubscriptionMoney` :172-199](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L172),
whose `method === "wallet"` branch is entered from exactly one place:
[`createSubscriptionCheckout` :356-419](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L356),
gated on `payFrom` ([:349](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L349)):

```
:351  if (payFrom === "wallet"        && user.role !== "student") throw Forbidden
:354  if (payFrom === "parent_wallet" && user.role !== "parent")  throw Forbidden
```

`payFrom` is accepted by the API — [checkout/route.ts:19](../../apps/erp/src/app/api/v1/subscriptions/checkout/route.ts#L19)
`z.enum(["gateway","wallet","parent_wallet"]).default("gateway")`.

### Now the decisive part — who *sends* `payFrom`

`grep -rn "payFrom"` across `apps/erp/src`, `apps/superadmin/src` and `packages`
returns **12 hits**. Discounting the schema, the service and two emulator/demo
files, the client hits are:

| Value | Sent from | Status |
|---|---|---|
| `"parent_wallet"` | [parent-pay-screen.tsx:314](../../apps/erp/src/features/parent/parent-pay-screen.tsx#L314) `pay("parent_wallet")`, wired to a real button at [:551-559](../../apps/erp/src/features/parent/parent-pay-screen.tsx#L551) | **LIVE** |
| `"gateway"` | same file, and the default everywhere else | LIVE |
| **`"wallet"`** (the student wallet) | **nowhere** | **NO CALLER** |

The student's own subscribe path never sends it:
[student-subjects-screen.tsx:103-131](../../apps/erp/src/features/student/student-subjects-screen.tsx#L103)
`handleSubscribe` posts `method: "card"` ([:118](../../apps/erp/src/features/student/student-subjects-screen.tsx#L118))
and omits `payFrom` entirely, so the route's `.default("gateway")` applies. There
is no `payFrom` and no `wallet` token anywhere in that file.

**And there is no other student-side spend surface.** `grep -rn "wallet"` across
`apps/erp/src/features/student/*.tsx`, excluding the wallet screen itself,
returns only the dashboard **balance tile** and a link to that screen
([student-dashboard.tsx:142, 316-326](../../apps/erp/src/features/student/student-dashboard.tsx#L142)).
The wallet screen itself ([student-wallet-screen.tsx](../../apps/erp/src/features/student/student-wallet-screen.tsx))
has exactly one action — `startTopup` ([:94-125](../../apps/erp/src/features/student/student-wallet-screen.tsx#L94)),
rendered as the single header button ([:166-169](../../apps/erp/src/features/student/student-wallet-screen.tsx#L166)).
No pay button, no transfer, no withdraw.

**The counter cannot spend it either.** `createWalkInSubscriptionTx`
([:515-590](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L515))
and `recordCounterSubscription` ([:505](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L505))
accept only `CounterMethod` — `["cash","instapay","pos_card","mobile_wallet"]`
([:111-114](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L111)).
`"wallet"` is a `FundingMethod` but **not** a `CounterMethod`, so no counter
route can settle against the platform wallet. Nor can it be reached through the
raw payment path — [payments/route.ts:32](../../apps/erp/src/app/api/v1/payments/route.ts#L32)
takes the same four counter methods.

> ### Plain answer
> **`walletDebit` exists and is correct, and no user-reachable path calls it.**
> The student wallet is spendable in the service layer and unspendable in the
> product. The only way to trigger it today is a hand-crafted `POST
> /api/v1/subscriptions/checkout` with `payFrom:"wallet"` from a student session —
> the API would honour it; nothing in the UI ever emits it.
>
> **The parent wallet is genuinely spendable** — one button, one flow, one child's
> subscription at a time.

---

## 2. If it can be spent — for the same things the refunded payment bought?

Answered separately per wallet, because they diverge sharply.

### Parent wallet — mostly yes

- **Re-buy the same subscription:** yes. `pay("parent_wallet")`
  ([parent-pay-screen.tsx:314-341](../../apps/erp/src/features/parent/parent-pay-screen.tsx#L314))
  posts the same `courseId` / `plan` / `sessionId` the gateway path posts, so any
  course a parent can pay for by card, they can pay for from the wallet.
- **Center-held vs platform-held:** works for both, and correctly.
  `settleSubscriptionMoney` branches on `sub.centerId`
  ([:233-291](../../packages/server-core/src/services/subscriptions/subscriptions.ts#L233)),
  writing a center-facing `payment` transaction for a center course and a
  `payment` + `commission` pair with a teacher-wallet credit for a teacher-direct
  one. Funding is derived, not assumed: `fundingOfMethod("wallet")` →
  `platform_held` ([center-credit.ts:6-10](../../packages/server-core/src/services/finance/center-credit.ts#L6)),
  so the centre is later paid its share through settlement rather than holding
  cash it never received.
- **Works even with no payment gateway:** yes, and this matters. The wallet branch
  returns before `initiateIntent` and never calls `onlineCheckoutAvailable()`. In
  the UI the card button is gated on `onlineCheckout` ([:545](../../apps/erp/src/features/parent/parent-pay-screen.tsx#L545))
  while the wallet button is **not** ([:551](../../apps/erp/src/features/parent/parent-pay-screen.tsx#L551)) —
  deliberate, and it means parent-wallet spending survives `PAYMENTS_MODE=mock`.

**The one real gap:** a parent wallet can only be **funded online**.
`parentWalletCredit` has a single production caller — the gateway intent settle at
[parent-wallet.ts:161](../../apps/erp/src/lib/services/wallet/parent-wallet.ts#L161) —
and `cash-topup.ts` contains no parent branch at all. So with
`PAYMENTS_MODE=mock` in production, a parent wallet cannot be topped up by
anyone; a **refund credit would be the only way money ever enters it.**

### Student wallet — moot, but worse than moot

Because §1 shows nothing spends it, "for the same things" does not arise. Two
further facts matter for the decision:

- **The counter is where these refunds happen, and the counter cannot take
  wallet money** (`CounterMethod` excludes `"wallet"`). A student refunded at
  the counter for a cash payment could not re-buy at that same counter even if
  the student-side pay-from-wallet button existed.
- **Self-service subscribe is itself hidden without a gateway.** The subscribe
  CTA renders only when `onlineCheckout` is true ([student-subjects-screen.tsx:240-245](../../apps/erp/src/features/student/student-subjects-screen.tsx#L240));
  otherwise the student is shown "subscribe at the centre"
  (`studentSubjects.subscribeAtCenter`). `onlineCheckoutAvailable()` is
  `!(mode === "mock" && NODE_ENV === "production")`
  ([gateway/types.ts:47-49](../../apps/erp/src/lib/services/payments/gateway/types.ts#L47)).
  So with `PAYMENTS_MODE=mock` in production, the *entire screen* on which a
  future pay-from-wallet button would live is not shown.

### The cross-wallet trap, which is the sharpest finding in this document

REFUND_DECISION.md §2 Option A credits the **student** wallet — following
`refundLessonForStudent` ([refunds.ts:190-200](../../apps/superadmin/src/lib/services/finance/refunds.ts#L190)),
which always credits `studentId` regardless of who paid, itself following the
binding invariant that *money direction is unchanged by who paid*
(`CLAUDE.md`, [parent-pays-lesson](../decisions/parent-pays-lesson.md)).

But the payer is very often the **parent** — `payments.payer_user_id`,
`Subscription.createdBy` and the whole parent-pay screen exist precisely for that.
So the ordinary case is:

> A parent pays 500 EGP cash at the counter. The counter refunds it under Option A.
> The 500 lands in the **child's** `student_profiles.wallet_balance` — the wallet
> that **nothing can spend** — while the parent's own wallet, the one with a
> working spend button, is untouched. The parent cannot spend it, cannot see it
> (§4), and cannot move it across.

There is no transfer path between the two wallets. `grep` finds no service that
debits one and credits the other.

---

## 3. Can wallet balance be withdrawn or converted back to cash?

**No. By any flow. For either wallet.**

- **Payouts are structurally closed to families.** `BeneficiaryType` is
  `teacher | center` ([schema.prisma:328-333](../../packages/database/prisma/schema.prisma#L328)),
  and `generatePayouts` sweeps only `teacherProfile` and `center`
  ([payouts.ts:116-126](../../apps/superadmin/src/lib/services/finance/payouts.ts#L116)).
  A student or parent profile can never be a payout beneficiary.
- **No route exists.** The complete family-wallet API surface is four endpoints:
  `GET me/wallet`, `GET me/wallet/history`, `GET me/parent-wallet`,
  `GET me/parent-wallet/history`, plus two top-up *initiate* endpoints. There is
  no `me/wallet/payout-request` — compare `center/wallet/payout-request` and
  `teacher/wallet/payout-request`, which exist for the roles that can withdraw.
- **No back-office escape hatch.** `adminTopUpWallet`
  ([center-money.ts:122](../../apps/superadmin/src/lib/services/admin/center-money.ts#L122))
  credits only; no service anywhere decrements a student or parent wallet except
  the checkout debit in §1.
- **Money-read-only in the back office** ([superadmin-center-oversight](../decisions/superadmin-center-oversight.md))
  means a superadmin cannot hand-fix it either, other than by "view as" into an
  ERP session — which reaches the same UI that has no spend or withdraw button.

**This is the trade-off the operator must understand:** under Option A, a wallet
credit is a **one-way door**. Money can enter the platform wallet from cash
(counter top-up) or card, and it can only leave as *tuition on this platform* —
and today, only through the parent's button. If the family leaves, the balance
stays behind. There is no code path that turns it back into cash, and building
one is a payouts-to-individuals feature with its own KYC/fraud surface, not a
small addition.

---

## 4. Does the UI show a refunded parent their money?

### Student wallet screen — well built, and shows the wrong person

[student-wallet-screen.tsx](../../apps/erp/src/features/student/student-wallet-screen.tsx)
is genuinely good, and is already refund-aware:

- Balance in large type with the derivation line ([:174-197](../../apps/erp/src/features/student/student-wallet-screen.tsx#L174))
- Full ledger — date, type chip, reason, `refNumber`, signed delta, running
  `balanceAfter`, closing total ([:222-320](../../apps/erp/src/features/student/student-wallet-screen.tsx#L222))
- **`refund` is already a first-class entry type** with a teal (credit) tone
  ([:50, :59-64](../../apps/erp/src/features/student/student-wallet-screen.tsx#L59))
  and a translated label — `studentWallet.type_refund` = «استرداد»
  ([ar/student.json:163](../../apps/erp/src/messages/ar/student.json#L163))
- A reconciliation warning when the cached balance disagrees with the last
  `balanceAfter` ([:153, :199-207](../../apps/erp/src/features/student/student-wallet-screen.tsx#L153))
- Reachable from the student sidebar ([portal-chrome.tsx:31](../../apps/erp/src/app/[locale]/dashboard/student/portal-chrome.tsx#L31))

A refund would render correctly here **for the student**, with no UI work.

### The parent — cannot see it at all

- `GET /me/wallet` and `GET /me/wallet/history` are both
  `requireRole("student")` ([route.ts:9](../../apps/erp/src/app/api/v1/me/wallet/route.ts#L9),
  [history/route.ts:9](../../apps/erp/src/app/api/v1/me/wallet/history/route.ts#L9)).
  A parent calling either gets `ForbiddenError`, linked child or not.
- `grep -rn "wallet"` across `apps/erp/src/features/parent/*.tsx`, excluding the
  parent's own wallet and pay screens, returns **nothing** — no parent surface
  displays a child's balance or ledger.
- The parent sidebar entry is labelled **"My Wallet"**
  ([portal-chrome.tsx:29](../../apps/erp/src/app/[locale]/dashboard/parent/portal-chrome.tsx#L29))
  and shows `me/parent-wallet` — a different balance.
- The parent wallet screen ([parent-wallet-screen.tsx](../../apps/erp/src/features/parent/parent-wallet-screen.tsx))
  is a thinner version of the student's: balance ([:155-156](../../apps/erp/src/features/parent/parent-wallet-screen.tsx#L155)),
  history ([:163](../../apps/erp/src/features/parent/parent-wallet-screen.tsx#L163)),
  top-up ([:146](../../apps/erp/src/features/parent/parent-wallet-screen.tsx#L146)). It also
  carries a `refund` entry type ([:44](../../apps/erp/src/features/parent/parent-wallet-screen.tsx#L44))
  that nothing currently writes.
- **Nor can the counter answer the question.** The centre's student detail screen
  has a wallet **top-up** button ([admin-student-detail-screen.tsx:482-485](../../apps/erp/src/features/admin/admin-student-detail-screen.tsx#L482))
  but never displays the balance — there is no `me/wallet` equivalent for staff.
  A parent asking "where did my 500 go?" cannot be shown it by the person who
  refunded them.

So: **excellent for a student who logs in; invisible to the parent who paid, and
invisible to the staff member standing in front of them.**

---

## 5. Expiry, forfeiture, or centre-scoping?

**None. This is the one dimension where the wallet is clean.**

- **No expiry.** The nine cron jobs are `month-end-statements`,
  `lesson-reminders`, `expire-payment-intents`, `expire-subscriptions`,
  `subscription-renewal-reminders`, `expire-collaboration-requests`,
  `guardian-contact-reminders`, `data-exports`, `weekly-center-digest`
  ([cron/[job]/route.ts:33-49](../../apps/erp/src/app/api/v1/cron/[job]/route.ts#L33)).
  None touches a wallet balance or `wallet_ledger`. No `expiresAt` column exists
  on either wallet.
- **No forfeiture.** No service decrements a student or parent wallet outside the
  checkout debit (§1). Blacklisting, suspension and roster removal do not touch
  the balance.
- **Not centre-scoped.** `student_profiles.wallet_balance` is a single column on
  the profile with no `center_id`. `getWalletForStudent`
  ([wallet.ts:190-205](../../apps/erp/src/lib/services/wallet/wallet.ts#L190)) reads it
  with no centre filter, and the checkout debit applies it to any active course.
  `wallet_ledger.center_id` exists **for audit only** — the field is documented
  as "crediting center for cash top-ups (audit)"
  ([wallet.ts:18](../../packages/server-core/src/services/wallet/wallet.ts#L18)) and is
  never read as a filter.
- **Non-negative floor is armed:** `student_profiles_wallet_balance_nonneg`
  ([migration 20260722000100:11-12](../../packages/database/prisma/migrations/20260722000100_student_wallet/migration.sql#L11)),
  matching `parent_profiles` ([20260727110100:21-22](../../packages/database/prisma/migrations/20260727110100_parent_wallet/migration.sql#L21)),
  with `balance_after >= 0` on both ledgers.

**So a refund is not partially worthless — it is portable across centres and it
never evaporates. It is simply not spendable by the person who is owed it.** A
student leaving Centre A keeps the balance and could, if the button existed, spend
it at Centre B. That is the *good* half of the design, and it is what makes the
fix worth doing rather than abandoning.

---

## Verdict

**A student-wallet credit is a trapped balance today, not a real refund — so
Option A must not be chosen as written.** `walletDebit` has no user-reachable
caller, the counter cannot accept wallet money at all, nothing converts it back to
cash, and in the ordinary case the payer is a parent who can neither see nor spend
what lands in their child's wallet.

**It is close to real, though, and the gap is UI-shaped rather than
engine-shaped** — the debit, the ledger, the floors and the reconciliation all
exist and are tested. Minimum work to make Option A honest, in dependency order:

1. **Credit the payer, not always the student.** When `payments.payer_user_id` is
   a parent, `parentWalletCredit`; otherwise `walletCredit`. This alone converts
   the most common refund into money that is spendable *today*, and it does **not**
   breach the ledger-direction invariant — that invariant governs the `transactions`
   row (`student → centre`), which stays exactly as it is; the wallet credit is a
   separate leg naming who is owed. Worth writing down as a decision, since it is a
   deliberate divergence from `refundLessonForStudent`.
2. **Wire `payFrom: "wallet"` in the student UI** — a "pay from balance" button in
   `student-subjects-screen.tsx` alongside the card button, ungated by
   `onlineCheckout` (mirroring how the parent screen already treats its wallet
   button). The service, the guard and the route schema are already there;
   this is one button and one field.
3. **Let the counter accept wallet balance** — add `"wallet"` to the counter
   subscription path so a refunded family can re-buy where they were refunded.
   Larger: it needs the `credit_balance` leg (`wallet_cash_collection` in reverse)
   and a receipt method that is not one of the four cash-drawer methods.
4. **Show the family the money** — expose a child's balance and ledger to a linked
   parent (a `parent`-role read of `me/wallet` scoped by `parentStudentLink`), and
   show the balance next to the counter's existing top-up button.

Items 1 and 2 are small and together make a wallet refund genuinely usable by
online self-service. Item 3 is what makes it usable *at the counter*, which is
where these refunds actually happen — and until item 3 exists, Option A is only
honest for families who buy online.

**If items 1–4 are not in scope for this change, choose Option B.** The cash the
family is owed should leave the way it arrived.
