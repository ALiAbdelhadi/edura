# Migration plan — Option B: the refund channel and its evidence

Status: **APPROVED AND WRITTEN (2026-09-06).** The migration is
`packages/database/prisma/migrations/20260907120000_refund_channel/migration.sql`,
byte-identical to §2 below.

| env | endpoint | applied | notes |
|---|---|---|---|
| dev | `ep-withered-field-b23csnyq` | ✅ 2026-09-06 | 0 reversing rows, both CHECKs validated |
| test | `ep-morning-snow-b269im2n` | ✅ 2026-09-06 | `c06-refund-guards` 20/20 |
| production | `ep-mute-rice-b2s8gg42` | ⏳ pending | after migration 73, which is also pending there |

**Applying this migration forces the Option B code with it.**
`payments_refund_channel_shape` requires every row carrying `reversal_of_id` to
declare a channel, and the foundation's `refundPayment` wrote the link without
one — so the moment 74 lands, every refund through the new door fails at the
CHECK until the service sets a channel. Production is the exception and is safe
to migrate ahead of the code: the deployed build still uses the old
negative-amount path, which never sets `reversal_of_id`, so its rows fall in the
CHECK's `NULL/NULL` branch untouched.

Follows [REFUND_DECISION.md](REFUND_DECISION.md) §Option B and the foundation in
migration 73 (`20260906120000_refund_foundation`), which is applied to dev and test.

**Why B and not A**, in one line, because the reasoning belongs with the migration:
[WALLET_SPENDABILITY.md](WALLET_SPENDABILITY.md) verified Option A's premise and
found `walletDebit` has no user-reachable caller, `CounterMethod` excludes `wallet`
so the counter cannot take the money back, nothing converts a balance to cash, and
the payer is usually a parent who can neither see nor spend what lands in their
child's wallet. Its verdict: *"If items 1–4 are not in scope for this change,
choose Option B."* They are not.

---

## 1. Pre-flight census — measured 2026-09-06, read-only

The `payments_refund_channel_shape` CHECK below demands that **every** row with
`reversal_of_id IS NOT NULL` carries a channel. So the only question that can
fail this migration is: how many such rows exist?

| env | endpoint | label | `payments` | rows with `reversal_of_id` | `refund_channel` type |
|---|---|---|---|---|---|
| dev | `ep-withered-field-b23csnyq` | `edura-env:dev` | 0 | **0** | absent |
| test | `ep-morning-snow-b269im2n` | `edura-env:test` | 10 | **0** | absent |
| production | `ep-mute-rice-b2s8gg42` | `edura-env:production` | 0 | **0** | absent (migration 73 not yet applied) |

**Zero everywhere, so both CHECKs are added VALIDATED — no `NOT VALID`, no backfill.**

That matters more than it looks. A backfill here would have to *invent* a channel
for refunds recorded before channels existed, and the only inputs available are
the original's payment method — which says how the money came IN, not how it went
BACK. Guessing `cash_drawer` because the charge was cash would be fabricating the
exact evidence this migration exists to demand. There is nothing to backfill, so
the question does not arise; and if a reversing row without a channel somehow
exists at apply time, the migration aborts inside its own transaction. A loud
failure is the correct outcome for a constraint that encodes evidence.

`NOT VALID` is also avoided on principle: `centers_wallet_balance_nonneg` sat
unvalidated in production for weeks (`CLAUDE.md`), and `verify-db`'s 28th check
exists because of it.

---

## 2. The migration

`packages/database/prisma/migrations/20260907120000_refund_channel/migration.sql`

```sql
-- REFUND_DECISION.md Option B, on top of migration 73's foundation.
--
-- The foundation records that a receipt WAS reversed and how much. This records
-- WHERE the money went and demands evidence that it arrived. Under B the cash
-- leaves the drawer (or the gateway reverses the charge); the platform records
-- an outflow it did not itself execute, so the only honest way to book it is as
-- an OBLIGATION first and a settled movement second.
--
-- Additive only: one enum type, four columns on `payments`, two CHECKs, one
-- partial unique index. No table created, no row rewritten, no column dropped.
-- Tables stay 82 -- a type is not a table.
--
-- Measured immediately before applying (MIGRATION_PLAN_B.md §1): every
-- environment holds ZERO rows with `reversal_of_id IS NOT NULL`, so both CHECKs
-- are added VALIDATED and nothing is backfilled.
--
-- CREATE TYPE is transaction-safe, so this runs inside `migrate deploy`'s
-- wrapper. Note for later: `ALTER TYPE ... ADD VALUE` is NOT, so adding a fifth
-- channel needs its own migration written to run outside a transaction.

CREATE TYPE "refund_channel" AS ENUM ('cash_drawer', 'bank_transfer', 'gateway', 'wallet');

-- `wallet` is in the enum from day one even though Option A was rejected: a
-- wallet refund is a legitimate channel if the spendability gaps in
-- WALLET_SPENDABILITY.md §Verdict are ever closed, and having the value present
-- means the two shapes can coexist rather than fork.
ALTER TABLE "payments" ADD COLUMN "refund_channel"      "refund_channel";
ALTER TABLE "payments" ADD COLUMN "refund_external_ref" text;
ALTER TABLE "payments" ADD COLUMN "refund_confirmed_at" timestamptz(6);
ALTER TABLE "payments" ADD COLUMN "refund_confirmed_by" uuid REFERENCES "users"("id");

-- A refund row must declare its channel; a non-refund row must not have one.
-- Paired with migration 73's `payments_reversal_is_negative`, this makes the
-- three refund facts -- negative, linked, channelled -- inseparable.
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_channel_shape"
  CHECK (("reversal_of_id" IS NULL     AND "refund_channel" IS NULL)
      OR ("reversal_of_id" IS NOT NULL AND "refund_channel" IS NOT NULL));

-- Confirmation requires a reference AND a named actor, together or not at all.
-- There is no "confirmed, no proof" state the database will accept, which is the
-- single strongest control B has: an operator can still lie about a voucher
-- number, but cannot record a confirmation without writing one down and signing
-- it.
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_confirmation_complete"
  CHECK (("refund_confirmed_at" IS NULL AND "refund_confirmed_by" IS NULL)
      OR ("refund_confirmed_at" IS NOT NULL
          AND "refund_confirmed_by" IS NOT NULL
          AND "refund_external_ref" IS NOT NULL));

-- One external reference per channel. `cash_drawer` is EXCLUDED on purpose: a
-- paper voucher number is centre-local stationery and two centres will
-- legitimately both write "0001". A gateway refund id and a bank reference are
-- globally unique, and reusing one to confirm a second refund is the fraud this
-- index makes impossible.
CREATE UNIQUE INDEX "payments_refund_external_ref_unique"
  ON "payments" ("refund_channel", "refund_external_ref")
  WHERE "refund_external_ref" IS NOT NULL AND "refund_channel" <> 'cash_drawer';
```

---

## 3. What Prisma can and cannot see

Modelled in `schema.prisma`: the enum (`enum RefundChannel { … @@map("refund_channel") }`)
and all four columns, `refundConfirmedBy` as a bare uuid like every other actor column.

**Not modelled, and `prisma migrate dev` will offer to drop all three:** both CHECKs
and the partial unique index. Refuse. `c06-refund-guards.test.ts` grows three
assertion groups that check the *definitions*, not the names — a partial index
silently rebuilt without its `WHERE` would still be present under the same name
and would still be wrong, and a confirmation CHECK relaxed to drop the
`refund_external_ref IS NOT NULL` clause would silently permit exactly the
"confirmed, no proof" state it exists to forbid.

---

## 4. One thing the Option B sketch gets wrong, which this plan corrects

REFUND_DECISION.md says the refunds report and the accountant dashboard "would
need a `status:"completed"` filter, or the platform books an unpaid promise as a
paid refund."

**That filter would show zero refunds, forever.** `transactions` has UPDATE
revoked from `edura_app` (migration `00000000000003`), which the same section
correctly notes — so a refund ledger row written `pending` at phase 1 can never
be flipped to `completed`. It stays `pending` for the life of the row, confirmed
or not.

So the truth about whether a refund was actually paid lives in
**`payments.refund_confirmed_at`**, not in `transactions.status`, and every
reader must key off the payment:

- `refundsReport` and the accountant dashboard filter on the refund's payment
  having `refund_confirmed_at IS NOT NULL` — an unconfirmed refund is an
  obligation and must not be booked as a paid one;
- the superadmin decision-queue tile (`type:"refund", status:"pending"`), dead
  since it was written because every writer sets `completed`, becomes a live
  count of refunds **awaiting confirmation** — which is what it should always
  have meant;
- the phase-2 `adjustment` row carries the reference into the append-only ledger,
  but it is the evidence trail, not the state. The state is on the payment.

This is code, not schema — but it is *caused* by the schema, so it belongs here
rather than being discovered later.

---

## 5. Deliberately NOT in this migration

**Two-person confirmation.** REFUND_DECISION.md says the database cannot solve
the fake-voucher case and offers two-person confirmation "as a later tightening".
The first half is not quite right: `CHECK (refund_confirmed_by <> recorded_by)`
is a same-row constraint and Postgres *can* enforce it.

I am still leaving it out, and this is a judgement worth recording. An Egyptian
centre counter is very often one person on an evening shift. A constraint that
refuses their confirmation does not produce a second witness; it produces a
refund handled off the books entirely, which is strictly worse than a recorded
self-confirmation with a named actor and a shift variance. It is one line to add
once staffing makes it realistic, and nothing here forecloses it.

**Gateway self-confirmation.** Only the webhook may set `refund_confirmed_at`
when `refund_channel = 'gateway'`. No CHECK can express this — the database does
not know who the actor is — so it is enforced in the confirm route, and
`payments_refund_external_ref_unique` is the backstop that stops one provider
reference confirming two refunds.

---

## 6. Order of application, on approval

Same discipline as C-4 and C-5, each step preceded by its own read-only pre-flight
(read the `Datasource "db": … at "<host>"` line, confirm the label, confirm exactly
one pending migration with no sibling riding along, re-run the §1 census):

1. dev → `verify-db` 28/28, `c06-refund-guards` green
2. test → `verify-db` 28/28, full erp + superadmin DB suites green
3. production → `verify-db` 28/28, row counts identical before and after
4. `expected-db-shape.json` migrations 73 → 74 (tables stay 82)

`EDURA_ENV=production npx prisma migrate deploy`, never `bun run` — bun injects
the CWD's `.env.local` and reaches dev while printing that it is production.

**Migration 73 must be applied to production first.** It is the parent: every
CHECK here references `reversal_of_id`, which 73 adds.

---

## 7. The code that follows, so the size is not a surprise

Phase 1 (arming) is a small delta on the service that already exists — the
`MONEY LEG` marker in `refund-payment.ts` is where `refund_channel` and the
pending ledger status go. Phase 2 is new surface:

- a confirm route (`payments/[id]/refund/confirm`) with the gateway refusal;
- an "awaiting confirmation" list on the fees screen, with its own query and
  empty/error states;
- the paymob webhook extended to accept reversal events;
- the reader changes in §4;
- a shift-close warning naming an unexplained variance as a possible unconfirmed
  cash refund;
- Arabic and English copy for the channel picker, the evidence field and the
  queue.

Roughly **15–17 files**, against the ~9 the foundation took. That is the cost B
was always going to carry, and it buys the thing A cannot give: the family gets
their money in the form they handed it over.
