# Parent pays for a child's lesson (built 2026-07-27 — awaiting review)

A PARENT can activate and pay for a specific lesson (or a month) for their own
child, from their own money. Built by WIDENING THE ACTOR on the Step 4
subscription engine — not by adding a second money path. Nothing was rebuilt.

1. **One gate, one implementation.** `assertApprovedChild` in
   `packages/server-core/src/services/wallet/parent-wallet.ts` is the only place
   "is this my child?" is decided; every parent money and browse path calls it.
   `pending`, `rejected` and `revoked` links all fail — approval is the point of
   the link, and a revoked one stops working immediately.
2. **MONEY DIRECTION IS UNCHANGED BY WHO PAID (binding).** A parent-funded
   subscription still moves `student -> center/teacher` in the Transaction
   ledger (`fromEntityId = studentId`), so every split, statement, payout,
   distribution and report behaves exactly as for a self-funded one. Who paid is
   recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
   redirecting the ledger. Proven, not asserted (proof 3).
3. **Each wallet belongs to exactly one role, and neither reaches across.**
   `payFrom: "wallet"` stays student-only — a parent spending their CHILD's
   balance is not "paying for their child", it is spending the child's money, so
   it is REFUSED. `payFrom: "parent_wallet"` is parent-only. Both directions are
   proven (proof 8).
4. **Parent wallet = the student wallet's deliberate MIRROR.** Same invariants:
   append-only `parent_wallet_ledger` as source of truth (added to
   `IMMUTABLE_MODELS`), `ParentProfile.walletBalance` as the reconciled cache,
   H2 conditional decrement for all-or-nothing debits, DB `CHECK (>= 0)` floor,
   `reconcileParentWallet`. A SIBLING table rather than a nullable owner on
   `wallet_ledger`, whose `student_id` is NOT NULL and whose queries are proven
   money code — widening it would have changed the meaning of every one of them.
   One extra column the student ledger has no use for: `beneficiary_student_id`,
   naming WHICH child a spend was for.
5. **A parent top-up writes NO Payment row** — it is a float deposit by a
   guardian, not a center/teacher receipt. Its receipt number lives on the
   Transaction and the ledger row's `ref_number`. That is why
   `payments.student_id` stayed NOT NULL while `payment_intents.student_id`
   became nullable (guarded by CHECK `payment_intents_student_required` so the
   NULL can only ever mean `purpose = 'parent_wallet_topup'`).
6. **Ownership of an intent = who is PAYING it.** A student for their own, a
   parent for the ones they funded. A parent is deliberately NOT given their
   child's own checkout intents — that is the child's, and parent oversight is a
   separate read surface with its own rules. Same rule in `getIntentForStudent`
   and in `mock-complete`, so no entry point disagrees.
7. **Browse widening is filtering, not authorization.** `search/courses` and
   `catalog/subjects` accept `?studentId=` and resolve the CHILD's grade/track
   after the link check; an unapproved id resolves NO scope, landing on the same
   unnarrowed list an anonymous browser already sees. No course row exposes
   anything new.
8. **The student path is byte-for-byte unchanged** — `payerUserId` and
   `createdBy` stay NULL on a self-checkout, and the existing suites confirm it
   (proof 12 + wallet 20/20, m1 9/9).

Migrations (additive only): `20260727110000_parent_wallet_topup_purpose` (enum
value, own file — Postgres cannot USE a new enum value in the transaction that
adds it) and `20260727110100_parent_wallet`.
**[dev + test, verified 2026-07-27] APPLIED — 40 migrations. [production, 2026-07-31] APPLIED — bootstrap executed, 40 migrations, verify-db 25/25.**
The `parent_profiles_wallet_balance_nonneg` CHECK is `convalidated = true` from
birth in dev and test (every row was 0), unlike the centers wallet CHECK.

Proof: `apps/www/tests/db/parent-pay.test.ts` **60/60** (live DB, real services,
real webhook + HMAC path). Regressions green: `bun run build` both apps, www unit
111 pass/1 skip, wallet 20/20, wallet-no-cap 7/7, m1-webhook-atomicity 9/9,
c04-login-parity 72/72, messaging-scope 87/87, rbac-isolation 11/11 (206
assertions across 6 suites). Typecheck is clean for every package this touched;
the repo-wide `bun run check-types` fails only in the untracked
`packages/ui/src/components/charts/` work in progress (`ChartLegendItem` expects
`key`, line-chart passes `id`) — unrelated, and surfaced only because `recharts`
was declared in `packages/ui/package.json` but never installed until now.

Demo data: `prisma/parent-pay-demo-seed.ts` (`bun run seed:parentpay-demo`,
`--purge` to remove) — one parent, two linked children, one center, two courses
with BOTH plans priced and 8 upcoming sessions, and a 750 EGP opening parent
wallet balance written through the REAL credit primitive so it reconciles like
real data. It deliberately seeds NO paid subscription / Payment / Transaction:
those are append-only and would be demo rows the purge cannot remove. Pay them
yourself in the preview — that is the point.
