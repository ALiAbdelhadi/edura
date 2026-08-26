# Revenue & Operations Spec — compliance audit and implementation plan (Rev 2)

Source: `Edura_Revenue_Operations_Spec.docx` ("مواصفات وتفاصيل نظام السناتر المالي
والتشغيلي"), read 2026-08-25. Every verdict was checked against the code on `main`
at `b5c1e2f`, not against memory or the decision docs.

**Rev 2 (same day).** The plan was re-examined end-to-end because it touches the
money engine. The re-examination changed four things, each grounded in code that
was re-read for this revision:

1. **Phase 0 was too narrow.** The settled-lesson hole has **five** attendance
   writers, not two. `counterCheckin` guards only `cancelled`
   (`packages/server-core/src/services/attendance/checkin.ts:370`);
   `doorTransitionTx` (used by both the door route and offline sync) has **no**
   session-status guard at all (`checkin.ts:501`); and `syncOfflineAttendance`'s
   raw-status branch checks enrollment and nothing else
   (`apps/erp/src/lib/services/attendance/sync.ts`). The door path is the worst
   of the five: it flips a `counter_only` student — deliberately excluded from
   distribution — to `present` *after* the money settled without them. Phase 0
   now covers all five writers plus the concurrency window between check-in and
   settlement.
2. **A structural money finding was upgraded to a decision (D5).** Settlement
   credits `centers.wallet_balance` with `centerNet` **regardless of how the
   students paid** (`distribution.ts:451`), and `requestCenterPayout` →
   `settlePayout` will pay that balance out. For a cash lesson the gross is
   physically in the center's own drawer — the platform never held it — so a
   payout of cash-funded credit is the platform transferring money it never
   received. Symmetrically, the platform's commission on that same cash lesson
   is a ledger row with no collection mechanism. These are one missing concept
   (funding source), not two bugs, and fixing it pre-launch is cheap:
   production holds **0 payments / 0 transactions** today.
3. **Phase 4 (teacher agreements) had an undefined precedence** against room
   Methods 1/2 — "ONE rule per course (never both)" is the engine's own header
   comment, and the original plan would have violated it. Now defined, with the
   clamp order for the `residual='center'` case spelled out (H2 depends on it).
4. **Phase 7 (online attendance) is cut from the roadmap.** Its only purpose in
   the spec is live-stream attendance, and video is permanently descoped. What
   remains of it is a small product question (no-show forfeiture) recorded under
   D6, not a build phase.

---

## 1. Compliance matrix

Legend — ✅ built and matches · ⚠️ partly built / differs in a way that matters ·
❌ not built.

### §2 Offline module (مسار الدفع والتشغيل الأوفلاين)

| # | Spec clause | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Counter staff picks the student and records the collection | ✅ | Counter board + `counterCheckin` (`packages/server-core/src/services/attendance/checkin.ts`), walk-in cash-for-one-session and check-in in a single step (`apps/erp/src/app/api/v1/center/subscriptions/route.ts`) |
| 2.2 | Payment methods: cash, **InstaPay**, **POS/Visa machine**, **Vodafone Cash / e-wallets** | ❌ | `PaymentMethod` is `cash · online_paymob · online_fawry · wallet · unknown` (`packages/database/prisma/schema.prisma:353`). The walk-in body schema carries no method at all and the service hardcodes `paymentMethod: "cash"` (`packages/server-core/src/services/subscriptions/subscriptions.ts:646`) |
| 2.3 | Optional printed receipt | ✅ | `apps/erp/src/features/receipts/receipt-sheet.tsx` + `receipt-print-button.tsx`, per-center receipt sequence (`centers.receipt_seq`) |
| 2.4 | **Shift / drawer tracking** — reconcile cash and bank collections at the end of each receptionist's shift | ❌ | No shift entity, no open/close, no expected-vs-counted, no per-staff totals anywhere in the repo. The only raw material is `payments.payment_method` (MC-3) and `payments.recorded_by` |
| 2.5 | "End session" button → locks the register **immediately** and starts automatic distribution | ⚠️ | Distribution is built and exactly-once (`completeSession` → `distributeSessionRevenue`, `sessions.distributed_at` claim). **The immediate lock is not** — see Phase 0: five writers, four of which ignore settlement entirely |
| 2.6 | The **counter employee** presses "end session" | ❌ | The route is `delegatedWithCenter(...)` with no `staffAllow`, which defaults to `[]` (`apps/erp/src/lib/authz/teacher-actor.ts:166`), so only teacher / assistant / `center_admin` can end a lesson — never a receptionist |

### §3 Online module (مسار الدفع والتشغيل الأونلاين)

| # | Spec clause | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Student pays online through Paymob | ⚠️ | Foundation only. The gateway abstraction, `payment_intents`, the initiate route and the mock driver all work; the **Paymob driver itself is an empty stub that throws** `"Paymob driver not implemented yet"` (`apps/erp/src/lib/services/payments/gateway/paymob-driver.ts:22`). Only `PAYMENTS_MODE=mock` is functional |
| 3.2 | Money lands **directly in the center's own Paymob account** | ❌ | Not the architecture. Paymob credentials are platform-wide env vars; `centers` has no `paymob_credentials` column. All online money lands in one platform merchant account, and the center is paid afterwards through the wallet/payout path |
| 3.3 | Webhook received and HMAC verified | ⚠️ | The route, the 401-on-bad-signature branch, replay idempotency and "never read the amount from the callback" are built and tested. The HMAC computation itself is a TODO inside the stub — `verifyWebhook` currently returns `{ valid: false }` unconditionally |
| 3.4 | Student is auto-recorded as **"present online"** | ❌ | No online attendance status or mode exists. A paid subscription creates coverage and an enrollment, never an `attendance_records` row |
| 3.5 | Live stream / recorded content unlocked | ❌ (descoped) | Video lessons and any recorded-content library are permanently descoped (`CLAUDE.md`, 2026-07-21). Not a gap — a deliberate exclusion |
| 3.6 | Attachments unlocked immediately | ✅ (with a caveat) | Paying activates a subscription which creates/reuses the enrollment, and `listMaterials` gates students on active enrollment (`apps/erp/src/lib/services/materials/materials.ts:196`). Caveat: gated on **enrollment**, not live coverage, so access does not lapse when the subscription does |

### §4 Financial engine (محرك الحسابات وتوزيع الأرباح)

| # | Spec clause | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Total revenue = offline attendance + online attendance | ⚠️ | Distribution sums only `attendance_records` with `status = present`. With no online-attendance concept (3.4), an online-paying student contributes nothing unless physically checked in |
| 4.2 | Order: platform commission → **then teacher's share** → **remainder = center's net** | ❌ **inverted** | `computeLessonSplit` is `teacherNet = price − platformFee − centerShare` (`packages/server-core/src/services/finance/fees.ts:7`). The **center** takes the configured share and the **teacher** is the residual — the exact opposite of the spec |
| 4.3 | Teacher agreement: **percentage of net** (e.g. 60%) | ⚠️ | Expressible only as room pricing Method 1 (`splitTeacherBp`), room-scoped and superadmin-only — not a per-teacher contract |
| 4.4 | Teacher agreement: **fixed amount per attending student** (e.g. 50 EGP/student) | ❌ | Method 2 gives the fixed per-student amount to the **center**, not the teacher. No teacher-side equivalent; `teacher_profiles` has no `pricing_type` / `rate_value` |
| 4.5 | The center configures its teachers' agreements | ❌ (deliberate) | Every rate surface lives in `apps/superadmin`. A rate sent from the ERP side is stored as `0` on purpose — proven by `center-share-governance.test.ts` VP1/VP2 and `hall-booking.test.ts` A15 |
| 4.6 | **Center prepaid wallet** — center tops it up in advance | ❌ | `centers.wallet_balance` is only ever incremented by settlement. No center top-up path; `wallet_ledger` is student-only |
| 4.7 | Platform commission auto-debited **at each attendance check-in** | ❌ | Commission is taken at **settlement**, as a ledger row netted out of what is credited — never debited from a prepaid balance, never at check-in |
| 4.8 | The wallet guarantees the platform self-collects its dues | ❌ | Structural — see D5. On cash lessons the platform's commission is a ledger row with no collection mechanism, **and** the center is credited a withdrawable balance for money the platform never held |

### §5 Database architecture

| Spec table | Verdict | Actual |
|---|---|---|
| `Users` | ✅ | `users` — roles include `center_staff` with `receptionist` sub-role |
| `Centers` — `wallet_balance` | ✅ | `centers.wallet_balance` (piasters, `CHECK >= 0`, validated on dev and production) — but see D5: its meaning is "receivable", not the spec's "prepaid float" |
| `Centers` — `paymob_credentials` | ❌ | No such column; credentials are platform env vars |
| `Teachers` — `pricing_type` / `rate_value` | ❌ | Not on `teacher_profiles`. Nearest: `center_teacher_affiliations.center_share` (flat piasters, superadmin-written) and the `commission_settings` split rows |
| `Sessions` | ✅ | `sessions` — plus `distributed_at`, `attendance_reopened_at` |
| `Attendance_Payments` | ⚠️ | Split across `attendance_records` (the fact) and `payments` / `subscriptions` (the money). `payments.payment_method` exists since MC-3 but with the narrow enum of 2.2 |
| `Session_Financials` | ⚠️ | `session_settlements` exists with exactly the right columns — but written **only for room-based courses** (`if (course.pricingMethod != null)`, `distribution.ts:417`). A no-room course settles with no financial record |
| `Wallet_Transactions` (center) | ❌ | `wallet_ledger` is student-only. A center has a balance and `transactions` rows, but no per-move ledger with `balance_after` |

---

## 2. Summary

Of 23 checkable clauses: **7 built as specified**, **7 built but materially
different**, **9 not built** (one a deliberate descope).

Two findings stand on their own, independent of the spec:

> **F1 — a settled lesson's attendance is still editable, through five doors.**
> `isLocked()` locks only past a 7-day window and ignores `distributed_at`
> (`attendance.ts:35`) — that covers `bulkMarkAttendance` and `editAttendance`.
> `counterCheckin` guards only `cancelled`. `doorTransitionTx` — reached from
> the door route AND the offline sync — has no session-status guard at all, and
> can flip a `counter_only` student to `present` after the lesson settled
> without them. `syncOfflineAttendance`'s raw branch checks enrollment only.
> Money moved; the facts it was computed from can still move afterwards, with
> no re-settlement and no reversal. `session_settlements.present_count` makes
> the drift *detectable*; nothing makes it *impossible*.

> **F2 — `wallet_balance` conflates "money the platform holds for the center"
> with "money the center already holds in its own drawer".** Settlement credits
> `centerNet` identically whether the students paid online (platform holds the
> gross) or cash at the counter (the center holds the gross). The payout path
> (`requestCenterPayout` → accountant approve → `settlePayout`) then treats all
> of it as payable. Nothing in the schema records the funding source of settled
> money. The mirror image is spec §4.8: commission on cash lessons is
> uncollectable. One missing concept, two symptoms — see D5.

---

## 3. Decisions required before code (D1–D6)

Per the working rule, each comes with the boundary I would build if told to
proceed — none of these is handed back as "risky, you decide" without a
recommendation. But all of them change money semantics, so they are stated as
decisions, not assumptions.

### D1 — Who is the residual, the teacher or the center?

Spec: teacher takes a defined share, center keeps the remainder. Engine: center
takes a defined share, teacher keeps the remainder (`fees.ts:7`). The engine's
direction fits a teacher-owned class renting a hall; the spec's fits a
center-owned class employing a teacher. Egyptian centers run both.

**Build:** do not flip the engine. `teacher_agreements.residual` ∈
`teacher | center`, default `teacher` (today's behaviour — no live course
re-rates). For `residual='center'` the clamp order is fixed and mirrors
`computeNoRoomLessonSplit`: (1) platform fee off the top, capped at the price;
(2) the teacher's fixed/percent amount capped at what remains — `centerNet >= 0`
by construction; (3) center-side fee capped at the center's remainder. Both nets
non-negative before H2 is ever consulted.

### D2 — Who may set a teacher agreement?

`center-share-governance` is deliberate and tested: a rate arriving from the ERP
stores `0`. The spec assumes the center sets rates.

**Build:** proposals. The center proposes (`status='proposed'`), superadmin
approves, and only the approval writes a rate. The governance tests keep passing
byte-identical, which is the proof the invariant survived.

### D3 — Whose Paymob account receives online money?

Spec: the center's own account. Build: one platform merchant. Per-center
credentials mean storing every center's Paymob secret (an encrypted-secrets
capability the codebase lacks), per-center Meta/Paymob onboarding, and a webhook
that must resolve which center's HMAC key to verify against.

**Build:** single platform merchant for launch — it is what the intents, the
webhook and the ledger already assume. This is the one clause to push back on
rather than implement. Revisit only if Paymob's sub-merchant product is actually
available on the account.

### D4 — Is the center wallet a receivable or a prepaid float?

Both — as **two columns**, never one. `centers.wallet_balance` keeps meaning
"platform-held money owed to the center" (H2 CHECK untouched).
`centers.credit_balance` + `center_wallet_ledger` is the center↔platform
position: top-ups credit it, obligations debit it, and it MAY go negative
(arrears the platform can see and chase). One column per meaning; separate CHECK
constraints; the H2 floor is never weakened.

### D5 — The funding-source (clearing) model ← new in Rev 2, and the core one

Every present student's coverage is a subscription (`coveredStudentIds` reads
nothing else), and every subscription records `paymentMethod` at activation. So
settlement CAN know, per student, whether the gross is platform-held
(`online_paymob`, `wallet`) or center-held (`cash`). Today it does not look.

**Build — settlement branches by funding leg, same tx, same primitives:**

- **Platform-held student:** exactly today's writes. Teacher wallet +=
  teacherNet, `wallet_balance` += centerNet, platform keeps its fee. All of it
  genuinely payable.
- **Center-held (cash) student:** the center already physically holds the gross.
  `wallet_balance` is **not** credited (crediting it is the F2 double-pay).
  Teacher wallet is still credited teacherNet — the platform owes the teacher —
  and the center's `credit_balance` is debited (teacherNet + platform fee): the
  center holds money that belongs to the teacher and the platform. This is the
  §4.8 fix: arrears become a visible, chaseable number instead of an invisible
  ledger row.
- **Cash wallet top-ups at a center** debit that center's `credit_balance` at
  top-up time — the drawer took cash that became a platform liability to the
  student — which is what makes "wallet = platform-held" true uniformly.
- Commission is debited at **settlement**, not at check-in as the spec asks:
  check-in is not the moment the amount is known (price and attendee set are
  final only at settlement), and debiting earlier means reversing on every
  correction. Same money, one write, no reversal traffic. Deliberate deviation,
  recorded here.

Why now: this changes what settlement writes, and production currently holds
**zero** money rows. The identical change after launch means migrating live
balances whose meaning is ambiguous row by row. Pre-launch it is a code change
plus tests.

### D6 — Online no-shows (replaces the old Phase 7)

With video descoped, "حاضر أونلاين" has no product meaning — an online payer
attends physically or not at all. The only residue: a per-session pass paid
online whose holder never shows. Today that money stays undistributed (the
student's contribution is 0 at settlement). Options: forfeit-to-center,
forfeit-split-as-if-present, or stay-undistributed-refundable.

**Build:** keep today's behaviour (undistributed; refundable through the
existing H3-guarded refund path) and decide forfeiture as a product rule later.
No code phase.

---

## 4. Implementation plan (Rev 2 order)

Every phase ends with proofs and stops for review. No phase weakens the
exactly-once claim, the H2 floor, or the H1/H3 guards. All migrations are
additive. Money suites run against dev — check for concurrent sessions before
trusting a red run (known interference), and keep fixtures on `test-cleanup`
tagging.

### Phase 0 — Close the settled-lesson hole, all five doors (no decision needed)

1. **One predicate**, not five copies: `lessonSettled(session)` reads
   `status`/`distributedAt`; every attendance writer consults it.
   - `isLocked()` gains the `distributedAt` clause (bulk/edit refuse with a
     BusinessRuleError naming settlement as the reason).
   - `counterCheckin` refuses on completed/settled (today: only `cancelled`).
   - `doorTransitionTx` returns a new `settled` outcome; the door route maps it
     to a clear refusal.
   - `syncOfflineAttendance` maps it to a per-record
     `{ result: "conflict", reason: "session_settled" }` — the batch endpoint
     must degrade per record, never die on one. This is the honest server-wins
     answer for a device that was offline while the counter closed the lesson.
2. **The concurrency window.** A check-in and a settlement can interleave: the
   check-in reads `distributedAt IS NULL`, settlement reads the present set,
   both commit — a student exists on a settled lesson that never counted them.
   Fix: (a) move the `distributedAt` claim in `distributeSessionRevenue` to
   immediately after loading session+course, BEFORE reading attendance — the
   claim's row lock is then held for the rest of the settlement tx, and
   behaviour is unchanged (early-exit earlier; any throw still rolls the claim
   back); (b) check-in paths read the session row `FOR UPDATE`, so a check-in
   racing a settlement blocks briefly, then sees the claim and refuses. Both
   transactions are short; the serialization is per-session and harmless.
3. The reopen door (`reopenAttendanceForSettlement`) still refuses settled
   lessons, and now ALSO covers a register completed prematurely (ended with
   nobody marked, or by mistake): reopen — audited — correct, complete again.
   Without this, "locks immediately" would have deleted the only repair path
   for an accidental end-session.
4. **The §3.3 carve-out (found by the suite run, kept by decision):**
   `adminEditAttendance` in the back office deliberately corrects a record on
   a SETTLED lesson — reviewed capability, superadmin-center-oversight §3.3:
   the record is the truth about the student, the divergence from the frozen
   `present_count` is measured and audited, the money is never recomputed.
   Phase 0 preserves it through an explicit `overrideSettledLock` flag on
   `editAttendance` that ONLY that audited caller passes — every ERP door
   stays closed, and the 7-day window still binds even the override.

**Proof (DONE 2026-08-25, `settled-lesson-lock.test.ts`, 19/19):** a lesson
settled through the real `completeSession` refuses all five writes, each with
its own signal (message naming settlement / `session_closed` code / door
outcome `settled` / per-record sync `conflict: session_settled`); the excluded
`counter_only` student stays excluded; a mixed sync batch degrades per record;
a completed-with-nobody lesson is locked in-window and repaired through the
audited reopen → correct → complete-again loop, then locked for good.
Neighbours re-run green: t9-attendance-reopen 18/18, offline-sync 27/27,
c01-lesson-settlement 36/36, counter-board 39/39, external-teachers 104/104,
rbac-isolation 11/11, superadmin center-operations 50/50, refund suites 36/36,
center-share-admin 11/11, erp unit 1418 pass. The two failures in
`room-pricing-methods` / `room-revenue-split` are the pre-existing dev-DB
demo-ledger census (434 demo transactions dated 2026-08-16→18; reproduced
identically on unmodified HEAD) — not Phase 0.

### Phase 1 — Payment methods at the counter (spec 2.2)

1. Extend `PaymentMethod` with `instapay`, `pos_card`, `mobile_wallet`.
   Migration hazard, named now: `ALTER TYPE … ADD VALUE` cannot be *used* in the
   same transaction that adds it — the migration adds values only, no backfill
   or seed in the same file.
2. `paymentMethod` joins the walk-in body schema and threads through
   `createWalkInSubscription` → `Payment` → `Transaction`. Absent still means
   `cash` — explicit at the one call site, because that route IS the cash desk.
3. Counter UI method picker — large, labeled, plain (the operator is counter
   staff; see the operator-audience rule). Receipt renders the method. `ar`/`en`
   labels in the existing `methods.*` namespace.
4. **Reconciliation semantics decided here, consumed by Phase 2:** `cash` is the
   only drawer method; `instapay`, `pos_card`, `mobile_wallet` are bank-side;
   `wallet` moves no physical money; `unknown` stays its own bucket (MC-3 rule —
   never folded into cash).

**Proof (DONE 2026-08-25):** `counter-payment-methods.test.ts` 20/20 against
the real services — each method round-trips identically across subscription +
Payment + ledger Transaction; the cash default and its note stay byte-identical
to pre-Phase-1; every counter channel lands as an in-person `cash_payment`
points event; the printable receipt states the method (first-class from MC-3's
`payments.payment_method` — the stale "no method on receipts" header was
retired). `route-center-subscriptions-method.test.ts` 10/10 — unknown or
non-counter methods (`online_paymob`, `wallet` included) 400, never a fallback.
Neighbours green: mc3 7/7, counter-board 39/39, teacher-direct-pricing 7/7,
wallet 27/27, parent-pay 60/60, erp unit 1428. Browser proof: the receipt
preview renders the طريقة الدفع row.
Also extended, same rules: the manual desk (`recordPayment` behind
POST /api/v1/payments + the fees screen) takes the same four channels with the
same cash default; counter REFUNDS stay recorded as cash deliberately — a
counter refund is handed back out of the drawer whatever channel the money
arrived by.

### Phase 2 — Shift / drawer reconciliation (spec 2.4)

Self-contained; writes no money.

1. `center_shifts`: `id, center_id, staff_user_id, opened_at, opened_by,
   closed_at, closed_by, opening_float, counted_cash, expected_cash, variance,
   note, status`.
2. `payments.shift_id` (nullable) — stamped by counter routes while a shift is
   open; a center that never opens one keeps working exactly as today.
3. `openShift` / `closeShift` / `getShiftSummary`. Close computes expected **per
   method** from the shift's signed payments — cash against the drawer count
   (variance recorded), bank methods listed for statement matching, `wallet`
   excluded from physical expectations.
4. Counter-board open/close card + shift summary screen, cash variance
   prominent.
5. `shift-reconciliation` registered in `REPORT_EXPORTS` — the export runs the
   same service the screen runs, per the invariant.

**Proof (DONE 2026-08-25, `shift-reconciliation.test.ts`, 15/15):** the stamp
derives from the recorder's open shift (NULL before open and after close, and
nothing else about the writes changes); methods land in their own buckets and
only cash shapes `expected = float + Σ signed cash` (instapay reported
bank-side, absent from the expectation); a refund reduces expected by plain
signed summation; a short count freezes `variance = −10 EGP` and a
post-close payment moves nothing; one open shift per staff member, only the
drawer's owner closes, double close refuses; and the CSV export's rows equal
`listShiftReconciliation`'s — one service function, two renderings.
Neighbours green: counter-payment-methods 20/20, mc3 7/7, wallet 27/27,
report-export 39/39, erp unit 1428, superadmin tsc clean. Schema moved
(80 tables / 39 RLS / 60 policies / 65 migrations): `expected-db-shape.json`
re-baselined per its own rule, verify-db 28/28 on dev. Applied to dev only —
production deploy carries migrations 20260825120000 + 20260825140000
together.

### Phase 3 — End-session by the counter + a settlement record for every lesson

1. The complete **and** settlement-preview routes gain
   `staffAllow: ["receptionist", "manager"]` — they share `assertMaySettle`, so
   the guard widens in one place; the preview is not a lesser permission (it
   shows money) and must not diverge. Staff actions audited on-behalf-of, as
   everywhere.
2. The preview response gains `counterOnlyCount`, and the confirm dialog warns
   when students passed the counter but never the door (`counter_and_door`
   mode) — a receptionist has less context than the teacher; the warning is the
   difference between "excluded by design" and "excluded by surprise".
3. `session_settlements` written for **every** settled lesson: drop the
   `pricingMethod != null` gate, relax the column to nullable. This is the
   spec's `Session_Financials`, and the only way a center sees what a no-room
   lesson produced.

**Proof (DONE 2026-08-25):** `settlements-for-all.test.ts` 13/13 — a no-room
lesson files a `session_settlements` row (`pricing_method NULL`) whose totals
equal its own ledger rows and wallet deltas exactly (gross = Σ payments,
platform = Σ commissions, teacher/center = the wallet deltas, and the three
conserve to the gross); the preview's new `counterOnlyCount` names the
excluded student while the frozen `present_count` and the money never see
them; replay files no second row. `route-session-complete-staff.test.ts` 3/3 —
a receptionist reaches `completeSession` through the staff gate and an
on-behalf-of audit row (`session.completed`) is written after the money, a
`center_accountant` stays refused, and a teacher's own completion writes no
staff audit. Both routes (complete + settlement-preview) widened together —
the preview shows money and is not a lesser permission. Neighbours green:
c01 36/36 byte-identical, settled-lesson-lock 19/19, external-teachers
104/104, superadmin center-operations 50/50, all four refund suites, erp unit
1431. Migration `20260825160000` (pricing_method → nullable) applied to dev;
shape re-baselined at 66 migrations, verify-db 28/28.

### Phase 4 — Funding legs + center credit wallet (D4 + D5) ← moved before agreements

The launch-blocking phase: cash is day-one reality, and this is what makes cash
lessons honest.

1. Schema: `centers.credit_balance` (signed) + `center_wallet_ledger`
   (mirrors `wallet_ledger`: signed `delta`, `balance_after`, `method`,
   `ref_number`, `related_txn_id`, `recorded_by`); `session_settlements` gains
   `platform_held_gross` / `center_held_gross` so every settlement records its
   funding split; a separate CHECK for `credit_balance` (H2's own CHECK and
   column untouched).
2. `distributeSessionRevenue`: resolve each present student's covering
   subscription (the `coveredStudentIds` query shape, in-tx) → funding leg →
   the D5 writes. For an all-online lesson the output is byte-identical to
   today, which is the regression anchor.
3. Top-ups: online via the existing intent/webhook machinery
   (`purpose: "center_credit_topup"` — same claim-in-one-tx path, no second
   engine); cash top-up recordable by superadmin, audited.
4. Cash student-wallet top-ups debit the receiving center's `credit_balance` in
   the same tx (`cash-topup.ts` gains one write).
5. Payouts already only pay `wallet_balance`, which after this phase contains
   only platform-held money — F2 closes without touching the payout code path's
   H1/H2 guards.
6. Superadmin: credit balances, arrears list, top-up history. Center portal:
   its own credit position and ledger (read-only — money stays read-only in the
   back office per the standing invariant; the top-up *initiation* lives in the
   ERP center portal).

**Proof (DONE 2026-08-25):** `center-credit-clearing.test.ts` 20/20 — an
all-online lesson settles byte-identical to pre-phase (wallet += centerNet,
credit untouched, rows stamped `platform_held`); an all-cash lesson credits
the teacher their full net, moves `wallet_balance` NOTHING, and debits
`credit_balance` (teacherNet + fees) through two lesson-referenced ledger
rows; a mixed lesson splits exactly per student's coverage; a cash wallet
top-up debits the collecting center (`wallet_cash_collection`) which is what
makes wallet coverage platform-held; the credit top-up settler credits with a
running-balance ledger row and a platform-held Transaction.
`center-held-refund.test.ts` 11/11 (superadmin) — a platform-held refund is
byte-identical to pre-Phase-4; a center-held refund reverses the teacher,
never touches the center wallet in either direction, makes the student whole,
and lands the position at exactly −price via a `refund_reversal` row of
−centerNet: settlement −(tN+f) + refund −centerNet = −price, the gross the
center still physically holds.
**Uncovered students now settle center-held by design** (no coverage = the
platform holds nothing) — three pre-Phase-4 suites whose intent is split MATH
measured via wallet deltas were given explicit platform-held coverage
(`c01-lesson-settlement`, `settlements-for-all`, `refund`), each with a
comment naming this decision. Sweep green: c01 36/36, refund family 47/47
across 5 suites, wallet 27, parent-pay 60/60, external-teachers 104/104,
counter-payment-methods 20/20, settled-lesson-lock, shift-reconciliation
15/15, superadmin center-operations 50/50, erp unit 1431, superadmin unit 106.
Migrations `20260825180000` + `20260825180100` applied to dev; shape
re-baselined 81 tables / 40 RLS / 61 policies / 68 migrations, verify-db
28/28. Deviations recorded: top-ups are ONLINE-only (no back-office money
write — the invariant outranks the plan's "cash recorded by superadmin"
line); `transactions.funding` was added beyond the plan so refunds read the
stamped leg instead of re-deriving it.

### Phase 5 — Teacher agreements (D1 + D2; formerly Phase 4)

1. `teacher_agreements`: `id, center_id, teacher_id, basis
   ('percent_of_net' | 'fixed_per_student'), rate_bp, rate_flat, residual
   ('teacher' | 'center'), status ('proposed' | 'active' | 'ended'),
   proposed_by, approved_by, effective_from, ended_at`. Append-only in effect: a
   change ends the old row and opens a new one, so any settled lesson is
   explained by the agreement live on its date (the same live-resolution
   precedent as `resolveCommission`).
2. **Precedence, explicit (the Rev 1 gap):** a room-based course (Method 1 or 2)
   is governed by its frozen room economics — an agreement does NOT apply, and
   creating one for a teacher whose courses are all room-based warns at
   creation. A no-room course resolves: active agreement → else
   `affiliation.centerShare` fallback → else commission defaults. "ONE rule per
   course" stays true.
3. `economicsAt()` gains the one branch; D1's clamp order for
   `residual='center'`; every other branch untouched.
4. ERP proposes, superadmin approves (D2). The ERP write path stores a proposal,
   never a rate.

**Proof (DONE 2026-08-25):** `teacher-agreements.test.ts` 13/13 — a pending
proposal has NO force (the affiliation math held while it waited); 60%-of-net
to the teacher, 50 EGP/student to the teacher, and rate-prices-the-center all
settle to exact piasters and conserve to the gross; a lesson DATED under
agreement #1 settles under #1 even after #2 activated (effective dating by
the lesson's date, not today's); a Method-1 room course with a live agreement
settles by its frozen split, ignoring it ("ONE rule per course"); rate-shape
and duplicate-proposal refusals hold. `agreement-refund-mirror.test.ts` 10/10
(superadmin) — approval activates in one tx ending the superseded row at the
new effectiveFrom under the one-active-per-pair partial unique, each decision
audited; reject/terminate guards; and refunding an agreement-settled lesson
reverses both wallets EXACTLY to zero — settlement and refund share one
derivation (`computeAgreementSplit` + `resolveTeacherAgreement`, both fed the
actually-charged fees). Sweep green: center-share-governance 6/6 UNCHANGED
(the proof D2 survived), c01 36/36, center-credit-clearing 20/20, erp unit
1431, superadmin unit 106. Migration `20260825200000` applied to dev; shape
82/41/62/69, verify-db 28/28. UI: propose dialog on the center's teachers
screen (proposal-only, says so); approval queue on the superadmin commission
screen (absent, not disabled, for the accountant). Deviation recorded: a
`rejected` status was added beyond the plan's three — an audit-honest refusal
instead of overloading `ended`.

### Phase 6 — Real Paymob driver (D3)

Only after `PAYMOB_*` credentials exist; the stub's four TODOs already specify
the call sequence and the exact 20-field HMAC order.

1. `createCheckout`: auth token → order → payment key → iframe (card) /
   redirect (wallet). Amount from the intent row only.
2. `verifyWebhook`: HMAC-SHA512 over the documented field order,
   `timingSafeEqual`, secret required with no fallback.
3. Refund/chargeback callbacks: out of scope for the driver's first cut —
   refunds stay platform-initiated through the H3-guarded path; a gateway-side
   refund callback is logged and surfaced, not auto-settled.
4. Sandbox end-to-end, then `PAYMENTS_MODE=live`.

**Proof:** recorded sandbox callback verifies; tampered payload 401s; replay
returns 200 without re-settling; a mismatched `amount_cents` is flagged, never
settled from.

### Cut from the plan

**Online attendance (spec 3.4, old Phase 7)** — see D6. No build; the no-show
question is a product decision recorded there, and revisiting it belongs to the
same future moment as the video descope, if that ever reopens.

---

## 5. What this plan deliberately does not do

- **Does not flip the split direction** (D1) — adds a residual side, default =
  today, so no live course re-rates on deploy.
- **Does not build per-center Paymob accounts** (D3) — pushed back for launch.
- **Does not debit commission at check-in** (D5) — settlement is the only
  moment the amount is known; deviation recorded.
- **Does not let the ERP write a rate** (D2) — proposals only; the governance
  tests staying green unchanged is the point.
- **Does not build any video/live-stream surface** (spec 3.5) — permanently
  descoped; absence intentional.
- **Does not touch `wallet_balance`'s meaning or its H2 CHECK** (D4/D5) — the
  new semantics live in a new column with its own ledger and its own CHECK.
