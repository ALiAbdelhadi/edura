# Edura — Live API Verification Sweep

> Produced 2026-07-23 by exercising the **running applications against the live
> Neon database** — not by reading code. Every row below is an actual HTTP
> request/response. Companion documents: [architecture-review.md](architecture-review.md),
> [security-audit.md](security-audit.md), [CLAUDE.md](../CLAUDE.md).
>
> **PHASE 1 — REPORT ONLY. Nothing was fixed.**

---

## 1. Scope, method, and honesty notes

### 1.1 What was exercised

| | |
|---|---|
| Apps under test | `apps/www` (dev :3002), `apps/superadmin` (dev :3004), `apps/realtime` (:3005) |
| Database | the live Neon DB (`ADMIN_URL` for assertions, the app's own pooled `DATABASE_URL` for the requests) |
| Route files | 276 (`172` www + `104` superadmin) |
| **Exported endpoint-methods** | **340** |
| Endpoint-methods reached with an anonymous probe | **340 / 340** |
| Endpoint-methods reached with a **wrong-role** session | **331 / 340** (the 9 skipped are the public/secret-guarded routes) |
| Endpoint-methods reached with a **correct-role happy path** | **331 / 340** |
| Total recorded request/assertion pairs | **1,485** |
| Verdicts | **1,355 PASS · 93 FAIL · 33 SUSPICIOUS · 4 SKIP** |

Sessions were minted directly as NextAuth v4 JWE cookies (`next-auth.session-token`
for www, `edura-superadmin.session-token` for superadmin) signed with each app's
real secret, so every request went through the genuine `jwt`/`session` callbacks,
`requireSession`, `requireRole`, `scopedDb`, and the RLS wrappers. **No guard was
weakened, stubbed, or bypassed to make anything pass.**

19 actors were used: `super_admin`, `accountant`, `center_admin` (×2, different
centers), `center_staff` ×3 (receptionist / manager / center_accountant),
`teacher` (×2, different centers), `assistant`, `parent` (×2), `student` (×2),
a `pending` teacher, and anonymous.

### 1.2 Money-path disclosure (per the testing rules)

The ledger **was** exercised, deliberately and only through `is_demo` seed
entities (the NILE preview center, its demo teacher/assistant/receptionist, and
demo student *Lina Hassan*), plus throwaway courses created by the suite itself.
Everything created was deleted and every balance restored. Table counts were
snapshotted before and after each money suite and asserted back to baseline:

```
transactions 254 → 254   payments 4 → 4   wallet_ledger 42 → 42
payment_intents 2 → 2    subscriptions 0 → 0   session_settlements 15 → 15
payouts 0 → 0            conversations 8 → 8   conversation_messages 24 → 24
```

Final reconciliation of `users` by role/status is **byte-identical to the
session-start snapshot** (super_admin 21, accountant 1, center_admin 16,
center_staff 10, teacher 64 active + 1 pending, assistant 9, parent 8,
student 103).

Two blacklist tests caused **collateral demo-data damage that had to be repaired
by hand** — that damage is itself finding **H-04** below.

### 1.3 What "FAIL" means in the table

The 93 FAIL rows are **not** 93 defects. They break down as:

* **~14 genuine product defects** — itemised in §2 and §3.
* **~30 harness-side expectation errors** — the request payload or the expected
  status I supplied was wrong (e.g. `mock-complete` needs `{outcome}`,
  `catalog/stages` needs `code`, `catalog/grade-levels` needs `level`,
  `parent-links` uses `code` not `familyCode`, several `DELETE`s require a JSON
  body). These were corrected and re-run; the corrected result is the one that
  counts, and both appear in the table.
* **~30 "wrong role ALLOWED (200)"** rows from the automated sweep where my
  `wrong role` heuristic was simply wrong — `/api/v1/me`, `/notifications`,
  `/messages/*`, `/reviews`, `/grades`, `/sessions` etc. legitimately serve
  students. These are **not** authorization failures.
* **~19 state-dependent rows** on the re-run (a fixture the first pass had
  consumed, a review older than its 24-hour edit window, and so on).

Where I could not distinguish, I marked the row **SUSPICIOUS** rather than
FAIL. Everything in §2/§3 was individually re-verified with a dedicated probe.

---

## 2. Prioritised findings

### 2.1 CRITICAL — money, auth, data isolation, child safety

---

#### **C-01 · Session completion returns 500 and can never settle — `centers_wallet_balance_nonneg` violated**

`POST /api/v1/sessions/[id]/complete` · **money engine** · reproduced 3×

**Exact request**

```
POST /api/v1/sessions/<sessionId>/complete
Cookie: next-auth.session-token=<teacher session>
{}
```

**Actual**

```
HTTP 500
{"error":{"code":"internal","message":"new row for relation \"centers\"
 violates check constraint \"centers_wallet_balance_nonneg\""}}
```

**Expected** `200` with the distribution ledger written.

**Diagnosis.** In `packages/server-core/src/services/finance/distribution.ts`
the beneficiary credit is

```ts
const centerNetTotal = centerNet * present.length;   // centerNet = centerShare − fees.platformCenterFee
await tx.center.update({ where: { id: centerId }, data: { walletBalance: { increment: centerNetTotal } } });
```

For a **course with no room** the center's share is `0` (collaboration requests
force `proposedCenterShare = 0` by design — decision #3 — and `POST /api/v1/courses`
never sets one), while the global config charges `platformCenterFee = 200`.
So `centerNet = 0 − 200 = −200` and the engine tries to *decrement* a wallet.
The H2 hardening added `CHECK (wallet_balance >= 0)` on `centers`, so the
statement aborts, **the whole settlement transaction rolls back**, and the
lesson can never be completed — the teacher is never paid and no ledger row is
written.

**Blast radius, measured.** Three variants run against the same demo center:

| Variant | Center wallet before | Result |
|---|---|---|
| **V1** no-room course, `centerShare = 0` | `0` | **HTTP 500**, `centers_wallet_balance_nonneg`, 0 ledger rows |
| **V2** room-based course (`whole_room_percent`) | `0` | **HTTP 200** — 3 ledger rows, center +375, teacher +1750 |
| **V3** no-room course, wallet pre-funded to `100000` | `100000` | **HTTP 200** — center 100000 → 99800 (−200 fee) |

So the failure fires **exactly when a no-room course settles while the center's
wallet is smaller than `platformCenterFee × present students`.** A brand-new
center has a wallet of `0`, so **it fails on that center's very first lesson**,
and it is the default shape of every teacher-at-center course created through
`POST /api/v1/courses` without a `defaultRoomId`.

V3 also exposes the underlying business question: with `centerShare = 0` the
center is charged a platform fee out of its own money for revenue it never
received.

---

#### **C-02 · Payout generation is unusable — 500 after a 20 s transaction timeout**

`POST /api/v1/finance/payouts` · **money engine** · reproduced 4× (accountant and super_admin)

**Exact request**

```
POST /api/v1/finance/payouts
Cookie: edura-superadmin.session-token=<accountant session>
{}
```

**Actual** (after `20 754 ms`, `21 121 ms`, `22 417 ms` on separate runs)

```
HTTP 500
{"error":{"code":"internal","message":"Invalid `prisma.$queryRaw()` invocation:
 Transaction API error: A query cannot be executed on an expired transaction.
 The timeout for this transaction was 20000 ms, however 20323 ms passed since
 the start of the transaction."}}
```

**Expected** `201` with the generated payout batch.

**Diagnosis.** `generatePayouts()` in
`apps/superadmin/src/lib/services/finance/payouts.ts` wraps the **entire batch**
in one `platformDb` interactive transaction (20 s cap) and issues **four
sequential round-trips per beneficiary**: the H1 `SELECT … FOR UPDATE`
`$queryRaw`, `payout.aggregate`, `transaction.aggregate`, and a
`transaction.findMany({ distinct })`. The live DB currently has **25 teachers
and 20 centers with a positive wallet** — 45 beneficiaries × 4 serial
round-trips ≈ 180 sequential queries over the Neon serverless WebSocket, which
exceeds 20 s. The accountant's payout screen therefore cannot generate a batch
at all, and this gets *worse* with real volume, not better.

---

#### **C-03 · Suspending or blacklisting a user does not revoke their live session**

`PATCH /api/v1/admin/users/[id]/permissions`, `POST /api/v1/admin/users/[id]/blacklist` · **auth**

**Exact sequence**

```
1. GET  /api/v1/me                      (teacher session)          -> 200
2. PATCH /api/v1/admin/users/<teacher>/permissions {"status":"suspended"}  -> 200
   (DB now reads users.status = 'suspended')
3. GET  /api/v1/me                      (SAME teacher cookie)      -> 200   ← still authenticated
4. POST /api/v1/grades {...}            (SAME teacher cookie)      -> 201   ← privileged WRITE succeeded
```

The same holds for a platform blacklist: after
`POST /api/v1/admin/users/<student>/blacklist` the row reads
`status = 'blacklisted'` and `GET /api/v1/me` still answers **200**.

**Diagnosis.** `requireSession()` / `requireRole()`
(`apps/www/src/lib/authz/require-role.ts`) read the role **from the JWT only**
and never re-read `users.status`. The L1 hardening added a per-request DB check,
but it compares **only `token_version`** — and neither a suspension nor a
blacklist bumps that column. Sessions are 30-day JWTs, so a suspended or
blacklisted account keeps full API access, including writes, for up to 30 days.
The only enforcement point today is login.

**✅ FIXED (2026-07-23)** — no parallel session system; both halves reuse L1.

1. *Authoritative gate.* Both apps' NextAuth `jwt` callback already did one
   per-request `users` lookup for L1. That SAME query now also selects
   `status` + `deleted_at` and strips every claim unless the account is live
   (`status='active' AND deleted_at IS NULL`). Every login door already
   requires `active`, so anything else means a deactivation that happened
   mid-session → the very next request is unauthenticated. No extra query, and
   it holds even for a status change made outside Prisma.
2. *Epoch bump.* A new `sessionRevocationExtension`
   (`packages/database/src/extensions/index.ts`, applied first in the client
   chain) folds `token_version += 1` into any `user.update`/`updateMany` whose
   `data` sets a non-`active` status or a non-null `deletedAt` — inside the
   caller's own statement, so it commits atomically with the status change.
   That covers `updateUserStatus`, `platformBlacklistUser`, `rejectTeacher`,
   the `rejectCenter`/`blacklistCenter`/`toggleCenter` center-admin cascades
   (`updateMany`), the deletion-request approver and temp-student cleanup —
   and a future call site cannot forget it. Reactivation does not bump (nothing
   to revoke), and a caller already managing the epoch (`resetPassword`) wins.

Proofs (live DB, real authorize + jwt/session callbacks + real services):
`apps/www/tests/db/c03-status-revocation.test.ts` **26/26** and
`apps/superadmin/tests/db/c03-status-revocation.test.ts` **15/15** — suspend →
next request rejected; blacklist → next request rejected; both reversals log in
cleanly; an unrelated active session is never logged out; cascade `updateMany`
and soft-delete revoke too; C2/H5/L1 guards re-asserted intact.

Out of scope, unchanged: an already-open realtime socket keeps its connection
until it drops (its handshake token is short-lived and minted behind a session
guard, so a revoked user cannot get a new one).

---

#### **C-04 · `POST /api/v1/auth/login` rejects every `center_staff` account**

`POST /api/v1/auth/login` · **auth / access**

**Exact requests** (correct seed password `Passw0rd!` in every case)

| Email | Role | `/api/v1/auth/login` | NextAuth `/api/auth/callback/credentials` |
|---|---|---|---|
| `lina.hassan@student.nile-academy.eg` | student | **200** | 200, cookie set |
| `hossam.aziz@nile-academy.eg` | teacher | **200** | — |
| `sara.fawzy@nile-academy.eg` | assistant | **200** | — |
| `admin@nile-academy.eg` | center_admin | **200** | — |
| `mona.hassan@email.eg` | parent | **200** | — |
| `reception@nile-academy.eg` | **center_staff** | **401** | **200, cookie set** |
| `manager@nile-academy.eg` | **center_staff** | **401** | — |
| `accountant@nile-academy.eg` | **center_staff** | **401** | — |

**Diagnosis.** Two login doors disagree. `apps/www/src/lib/auth/options.ts`
lists `center_staff` in `WWW_ROLES`; the manual endpoint
`apps/www/src/app/api/v1/auth/login/route.ts` declares its **own** copy of the
allowlist and omits it:

```ts
const WWW_ROLES = new Set(["center_admin", "teacher", "parent", "student", "assistant"]);
```

Any client that authenticates through the REST endpoint rather than NextAuth
locks out the entire Center Staff feature with a message that says the password
is wrong.

---

### 2.2 HIGH

---

#### **H-01 · `platformNet` in the trial balance subtracts *gross* refunds**

`GET /api/v1/finance/reports/trial-balance` · **money reporting**

**Actual response (live data)**

```json
{"lines":[{"type":"payment","count":63,"total":1254000},
          {"type":"commission","count":116,"total":165200},
          {"type":"refund","count":25,"total":500000},
          {"type":"adjustment","count":50,"total":55400}],
 "platformNet":-334800}
```

**Diagnosis.** `finance-reports.ts` computes

```ts
const platformNet = get("commission") - get("payout") - get("refund");
```

But a `refund` transaction carries the **full student amount** (`perSessionPrice`)
— money that flowed out of the center/teacher wallets, not out of platform
commission. The platform's actual give-back is the pair of `adjustment` rows
`refunds.ts` writes ("Platform fee returned (teacher side / center side)"),
totalling **55 400**. The correct figure is therefore ≈ `165 200 − 55 400 =
+109 800`; the accountant's headline number instead reads **−334 800**, i.e. the
platform looks deeply unprofitable. Subtracting `payout` as well double-counts a
third, unrelated leg. (Despite the name, the endpoint also never checks that
debits equal credits.)

---

#### **H-02 · The 20 s interactive-transaction ceiling is systemic, not just payouts**

`GET /api/v1/messages/groups/[id]`, `GET /api/v1/parent/oversight/children` · **availability**

Both endpoints returned **200** on the first pass and **500** on a later pass
under identical inputs:

```
GET /api/v1/messages/groups/225522a5-…  -> 500
 "Invalid `prisma.teacherAssistant.findMany()` invocation: Transaction API error:
  A query cannot be executed on an expired transaction. The timeout … was 20000 ms,
  however 28946 ms passed since the start of the transaction."

GET /api/v1/parent/oversight/children   -> 500
 "Transaction API error: A commit cannot be executed on an expired transaction.
  … however 21691 ms passed since the start of the transaction."
```

**Diagnosis.** `platformDb`/`scopedDb` run every handler body inside one Prisma
**interactive transaction** with `timeout: 20_000` (`packages/database/src/client.ts`).
Handlers that issue many *sequential* queries — the group membership derivation,
the oversight child scan, `generatePayouts` — accumulate Neon WebSocket latency
until they blow the ceiling and 500. This is a read path on a **child-safety
surface**, so it is not merely cosmetic.

---

#### **H-03 · The demo/seed dataset uses non-RFC UUIDs, so `z.uuid()` routes reject it outright**

Affects `POST /api/v1/center/checkin`, `POST /api/v1/center/subscriptions`,
`POST /api/v1/subscriptions/checkout`, `POST /api/v1/payments/initiate`,
`POST /api/v1/messages/conversations`, `POST /api/v1/messages/reports`, and
every other body field declared `z.uuid()`.

**Exact request**

```
POST /api/v1/center/checkin   (receptionist)
{"studentId":"0b627da3-…","sessionId":"8a0f946b-50c3-2304-1d26-fecd09ce863d"}

HTTP 400 {"code":"validation_error","fields":{"sessionId":["Invalid UUID"]}}
```

**Diagnosis.** `prisma/preview-seed.ts` and `prisma/messaging-demo-seed.ts` mint
*deterministic* UUID-shaped ids whose version/variant nibbles are not RFC-valid.
zod 4's `z.uuid()` enforces RFC 9562, so those ids fail validation. Measured on
the current seed:

| Seeded fixture | Id | RFC-valid? |
|---|---|---|
| NILE scheduled session | `95dc5203-55f8-087f-8fb6-aa5952a69773` | ✗ |
| NILE completed session | `8a0f946b-50c3-2304-1d26-fecd09ce863d` | ✗ |
| NILE course (البلاغة) | `4d1da783-79dc-f1b8-a948-c3e90e460997` | ✗ |
| NILE room | `2e3eb8fb-56ab-f1e7-9eff-31dc0ae2a464` | ✗ |
| demo conversation | `4a747023-75a3-d394-36a5-d1bf5ef4f0da` | ✗ |
| demo group | `225522a5-3151-9a06-81be-4d3ef31059ef` | ✗ |
| **6 of the 19 messaging demo users** | e.g. `2dfbea05-4c2b-21de-66c7-1da369e7a5a9` | ✗ |
| a course created via the API | `a90a7d39-d12f-4a90-a1fd-4e3f907e247c` | ✓ |

Production ids come from `gen_random_uuid()` and are fine, so this is **not** a
runtime bug — but it means the seeded preview **cannot demonstrate the flows it
was seeded for**: counter check-in, walk-in cash, checkout, and starting a
conversation with a demo user all 400 on the demo data. That contradicts the
CLAUDE.md convention "seed enough realistic demo data … so I can view and test
it as if it were real". Recreating the same flow on *freshly created* entities
worked end-to-end (see §4).

---

#### **H-04 · Blacklist side effects are not reversed when the blacklist is lifted**

`POST /api/v1/admin/users/[id]/blacklist`, `POST /api/v1/admin/centers/[id]/blacklist` · **data integrity**

Discovered as collateral damage from this sweep, then confirmed:

* Platform-blacklisting demo student *Lina Hassan* flipped **all 6** of her
  enrollments (across 3 centers) to `unenrolled` with a single
  `unenrolled_at` timestamp. `POST /api/v1/admin/blacklist/[id]/remove`
  returned **200** and cleared the entry — but left every enrollment
  `unenrolled`. They had to be restored by direct SQL.
* Center-blacklisting the NILE center left `admin@nile-academy.eg` at
  `status = 'suspended'` after the blacklist was removed and the center returned
  to `active`.

CLAUDE.md and the endpoint's own semantics describe the blacklist as
**reversible**. The gating flag is reversible; its cascade is not. In production
this silently destroys enrollment history and locks out a center owner.

---

### 2.3 MEDIUM

---

#### **M-01 · Assistant delegation is asymmetric on attendance mode**

```
GET   /api/v1/teacher/attendance-mode  (assistant) -> 403
      {"code":"forbidden","message":"Role 'assistant' is not allowed (need one of: teacher)"}
PATCH /api/v1/teacher/attendance-mode  (assistant) -> 200   ← write succeeds
```

`GET` uses `requireRole("teacher")` while `PATCH` uses `delegated(...)`. Approved
decision #9 puts the attendance-mode setting **inside** the delegation. An
assistant can therefore change the setting but cannot read its current value, so
the assistant portal renders a broken control.

---

#### **M-02 · A rejected teacher or center can never be approved — one-way door**

```
POST /api/v1/admin/teachers/<id>/reject  {"reason":"…"}  -> 200   (status → 'suspended')
POST /api/v1/admin/teachers/<id>/approve {}              -> 422
     {"code":"business_rule","message":"Teacher is already suspended"}

POST /api/v1/admin/centers/<id>/reject   {"reason":"…"}  -> 200   (status → 'rejected')
POST /api/v1/admin/centers/<id>/approve  {}              -> 422
     {"code":"business_rule","message":"Center is already rejected"}
```

`rejectTeacher` writes `status = 'suspended'` while `approveTeacher` insists on
`status = 'pending'` (`apps/superadmin/src/lib/services/admin/platform.ts:273-310`).
A mis-click on the registrations queue is unrecoverable without direct DB access.

---

#### **M-03 · `POST /api/v1/courses` cannot set plan prices, so a new course is unpayable**

The create schema exposes only `price`. `pricePerMonth` / `pricePerSession` exist
**only on `PATCH /api/v1/courses/[id]`**. A course created in one call therefore
has no plan enabled, and every downstream money endpoint refuses it:

```
POST /api/v1/center/subscriptions … -> 422 {"message":"Per-session plan is not enabled for this course"}
POST /api/v1/center/checkin       … -> 402 {"code":"needs_payment","details":{"pricePerSession":null}}
```

Adding the follow-up `PATCH` made the whole counter workflow pass (§4). Approved
decision #2 requires "at least one enabled" plan at configuration time; the
create endpoint cannot express that.

---

#### **M-04 · `/api/v1/admin/students/[id]` is keyed by a different id than its siblings**

```
GET /api/v1/admin/students/<student_profiles.id>  -> 200
GET /api/v1/admin/students/<users.id>             -> 404 {"message":"Student not found"}
```

`getStudent()` takes a **student-profile id**, while
`/api/v1/admin/students/[id]/blacklist`, `/link-parent`, `/unlink-parent` and
`/api/v1/admin/points/students/[id]/…` all take a **user id** — the same `[id]`
segment meaning two different entities. `grep` finds **no caller anywhere in
`apps/superadmin/src`**, so the detail endpoint is currently dead code that
would break the moment a screen used it.

---

#### **M-05 · Validation runs before authorization on ~20 endpoints**

An anonymous or wrong-role caller receives **400 / 422** instead of **401 / 403**,
which confirms the payload shape to an unauthenticated caller. Confirmed on
`POST /api/v1/messages`, `/messages/conversations`, `/messages/blocks`,
`/messages/groups`, `/messages/reports`, `/payments/initiate`,
`/payments/wallet-topup/initiate`, `/payments/intents/[id]/mock-complete`,
`/subscriptions/checkout`, `/me/device-tokens`, `/me/push-subscription`,
`/me/onboarding`, `/me/delete-request`, `/me/credentials`, `/me/subject-requests`,
`/parent-links`, `/enrollment-requests`, `/reviews`, and `PATCH /reviews/[id]`.
No data leaks, but the guard order should be auth → validate.

---

### 2.4 LOW / cosmetic

| # | Endpoint | Observation |
|---|---|---|
| **L-01** | `GET /api/v1/courses`, `GET /api/v1/courses/[id]` | Readable **anonymously** (200 with full course rows including `centerId`, `teacherId`, price). Every other listing requires a session. Needs a yes/no decision: is this the intended public catalog? |
| **L-02** | `DELETE /api/v1/center/blacklist/[id]`, `DELETE /api/v1/teacher/blacklist/[id]`, `DELETE /api/v1/admin/messaging/messages/[id]` | Require a JSON body; a bodyless `DELETE` returns `400 {"message":"Invalid JSON body"}` instead of `400 {"fields":{"reason":…}}`. Unusual for `DELETE` and the error does not say what is missing. |
| **L-03** | `PATCH /api/v1/centers/me` | `{"description": null}` → **400** ("expected string, received null"); `{"description": ""}` → 200. An existing description cannot be cleared with an explicit null. |
| **L-04** | `GET /api/v1/catalog/tree`, `GET /api/v1/catalog/subjects`, `GET /api/v1/centers/[id]/rooms` | Require a session. Fine if onboarding is always post-login — flagged only to confirm the intent. |
| **L-05** | `GET /api/v1/centers/[id]/rooms` | `center_admin` gets **403** ("need one of: teacher, assistant") on **its own** center's rooms. Intentional per the route comment (centers use `/api/v1/rooms`), but the error message is misleading. |
| **L-06** | `POST /api/v1/center/walk-in` | Called twice with the same phone produced **two** user rows sharing `+201026794016` (`… WalkIn` and `… WalkIn dup`), both `201`. The documented behaviour is "duplicate phone → reminder, never a second account". Worth a second look — the second call may have normalised the number differently before the duplicate check. |
| **L-07** | `apps/realtime` `pnpm dev` | `tsx watch src/server.ts` loads `.env`, not `.env.local`, so the server exits at boot with `REALTIME_JWT_SECRET or NEXTAUTH_SECRET must be set (development)`. Dev-tooling only; `--env-file=.env.local` works. |

---

## 3. What was verified as HEALTHY

These are the hardened invariants you asked to be re-proven. All held under live
HTTP.

### Center-vs-center isolation — 14/14

| Probe | Result |
|---|---|
| Foreign admin reads a NILE session | `403 {"message":"Session not in your center"}` |
| Foreign admin reads NILE attendance / grade / roster student / payment / receipt PDF / material download | `403` / `404` on all six |
| `GET /rooms`, `/roster/students`, `/enrollments`, `/payments`, `/dashboards/admin` as the foreign admin | `200` but **scoped** — zero NILE rows in any response body |
| Foreign admin edits a NILE room / expense / course / staff row / broadcast / checkin / walk-in subscription | `403` / `404` on all |

### Assistant & center-staff boundaries

* assistant → `/teacher/wallet`, `/teacher/wallet/payouts`, `/teacher/wallet/transactions`, `/teacher/assistants`, `POST /teacher/wallet/payout-request` → **403** (decision #9 exclusions hold).
* assistant → `/dashboards/teacher`, `/sessions`, session attendance `PUT`, `POST /grades`, door check-in → **200/201** (delegation works).
* receptionist → `/center/wallet`, `/center/staff`, `/centers/me/admins`, `/reports/revenue`, `/expenses`, `POST /door-checkin`, `POST /center/wallet/payout-request` → **403**.
* manager → `POST /center/staff` → **403** (staff management is owner-only).
* `center_accountant` → `POST /center/temp-students` → **403**; `GET /messages/contacts` → **200 `[]`** (on no messaging edge, reaches nobody).

### Messaging relationship scoping & child safety

| Probe | Result |
|---|---|
| student → own teacher (new matrix rule) | `201` |
| student → a teacher who does not teach them | `400` |
| student → student | `403` |
| `center_accountant` → anyone | `403` |
| foreign center admin → student | `403` |
| non-participant posts into a thread / marks it read / reports it | `403` on all three |
| block halts **both** directions | `403` both ways; thread still readable (`200`) — history preserved |
| **adult blocks a minor** | auto `safety_concern` report filed (`2 → 3`) |
| group `owner_only` policy; non-member post; non-owner creates a course channel | `403` on all three |
| **parent oversight is strictly read-only** | unread counters and read receipts **byte-identical** before/after a parent view |
| oversight `POST` write attempt | `405` — there is no write path |
| oversight of a child that is not theirs | `403` |
| super-admin opens a thread | `messaging.thread_viewed` audit row written (`0 → 1`) |
| super-admin soft-deletes a message | body **preserved** for the log, `deletedAt` set |
| accountant → messaging log / message delete / report triage | `403` on all three |

### Exactly-once settlement

| Probe | Result |
|---|---|
| Same `idempotencyKey` on `/payments/initiate` | returns the **same** intent id |
| Re-settling a paid intent (`mock-complete`, `outcome:"success"`) | **no** extra Payment/Transaction rows |
| Flipping a paid intent to `outcome:"failure"` | no rows written, settlement immutable |
| Replaying a wallet top-up settlement | wallet unchanged (`45000 → 45000`) |
| `outcome:"failure"` on a fresh intent | **zero** Payment/Transaction rows |
| Re-completing a settled session | `distributedAt` gate holds — no extra ledger or settlement rows |
| Cash payment (Step 4 reconciliation) | mirrors to the ledger in the same tx: `payments 4→5`, `transactions 254→255` |

### Money guards

* client-supplied `amount` on `/payments/initiate` → **400** (server-side price only)
* negative top-up → **400**; over-cap top-up → **422**
* pay-from-wallet with insufficient funds → **422**, wallet never negative
* teacher/center payout request above balance → **422**; negative → **400**
* `transactions_one_refund_per_payment`: **0** payments carry more than one refund row
* student wallets below zero: **0**; teacher wallets below zero: **0**

### Secrets, webhooks, cross-app separation

* Paymob webhook with no HMAC / a forged HMAC / an HMAC signed with the wrong key → **401** on all three.
* `/api/v1/cron/[job]` with a wrong secret → **401**; with the right secret → **200** for all four jobs; **`GET` → 405** (M7's side-effectful alias is gone); unknown job → **422**.
* `/api/v1/internal/chat-notify` with a wrong secret → **401**; realtime `/internal/*` with a wrong secret → **401**.
* A www session cookie replayed against `apps/superadmin` → **401** on every superadmin GET. A superadmin token replayed against www → **401/403/404**.
* `super_admin` credentials at `POST /api/v1/auth/login` → **401** (staff cannot mint a www session).
* accountant → every `/api/v1/admin/**` route → **403**.

### Rate limiting

My first (sequential) burst wrongly suggested the chat limiter was inert. A
**concurrent** burst proves it fires exactly at the configured capacity:

```
60 concurrent POST /api/v1/messages          -> {"201":25,"429":35}   (capacity 30, refill 20/min)
25 concurrent POST /api/v1/messages/conversations, distinct recipients
                                             -> {"404":10,"429":15}   (capacity 10, refill 3/min)
```

The new-conversation bucket is consumed **before** the relationship lookup, so a
directory-probing flood is throttled — as designed.

---

## 4. The counter → door → settlement workflow, end to end

Because the seeded ids are unusable (H-03), the flow was rebuilt on freshly
created demo entities. With M-03's follow-up `PATCH` applied it passes completely:

```
POST /api/v1/courses                    (center_admin)  -> 201   id = a90a7d39-… (RFC-valid), 8 sessions generated
PATCH /api/v1/courses/[id]              (center_admin)  -> 200   pricePerSession=5000, pricePerMonth=20000
POST /api/v1/enrollments                (center_admin)  -> 201
POST /api/v1/center/checkin             (receptionist)  -> 402   needs_payment  ← uncovered student
POST /api/v1/center/subscriptions       (receptionist)  -> 201   cash + check-in in ONE step
     └─ ledger: transactions 254→255, payments 4→5, subscriptions 0→1
POST /api/v1/center/subscriptions       (foreign admin) -> 404   cross-tenant refused
POST /api/v1/center/checkin             (receptionist)  -> 200   now covered
PATCH /api/v1/teacher/attendance-mode   (teacher)       -> 200   counter_and_door
GET  /api/v1/door-checkin?sessionId=…   (assistant)     -> 200   counter-passed vs door-confirmed roster
POST /api/v1/door-checkin               (assistant)     -> 200   attendance = present
POST /api/v1/door-checkin               (assistant)     -> 200   idempotent
POST /api/v1/door-checkin               (receptionist)  -> 403   front desk must not do the door stage
POST /api/v1/sessions/[id]/complete     (foreign teacher) -> 403
POST /api/v1/sessions/[id]/complete     (teacher)       -> 500   ← C-01 (no-room course, center wallet 0)
```

With a **room-based** course the final step returns 200 and writes the expected
three ledger rows (`payment 2500`, `commission 375` teacher-side, `commission 0`
center-side) crediting center +375 and teacher +1750.

---

## 5. Coverage gaps in this sweep

Nine endpoint-methods were exercised **only** at the guard level (anonymous +
wrong-role) because their happy path needs a fixture that does not exist in the
post-wipe database — there are **0 invoices, 0 payouts, 0 expenses, and 0
subscriptions** in the DB. For those, a `404` on a well-formed request by the
correct role is the recorded result, which proves routing and authorization but
not the success body:

`finance/invoices/[id]`, `finance/invoices/[id]/pdf`, `finance/invoices/[id]/send-email`,
`finance/subscriptions/[id]`, `finance/payouts/[id]/approve`,
`finance/payouts/[id]/reject`, `finance/payouts/[id]/receipt`,
`admin/subscriptions/[id]`, `subscriptions/[id]/cancel`.

`POST /api/v1/materials` was exercised with an external URL and with a
magic-byte probe, but **not** with a real Cloudinary upload.

---

## 6. Full endpoint table

Legend — **anon**: status for an unauthenticated request · **wrong**: status for
a deliberately wrong-role session · **happy**: `case:status` pairs for the
correct role · **Verdict**: `PASS` (all checks green) · `FAIL` (at least one red
— see §1.3 before treating it as a defect) · `SUSPICIOUS` · `GUARD-ONLY` (auth
verified, success body not reachable).

| App | Method | Path | anon | wrong | happy cases | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| www | `PATCH` | `/api/v1/attendance/[id]` | 401 | 403 | cross-teacher:403 | **PASS** |  |
| www | `POST` | `/api/v1/payments/paymob/webhook` | 401 | — | no-hmac:401, bad-hmac:401, wrong-key-hmac:401 | **PASS** |  |
| www | `POST` | `/api/v1/payments/wallet-topup/initiate` | 401 | 400 | happy:201, happy:201, negative-amount:400 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/payments` | 401 | 200 | happy:200, happy:200, ISO-12:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/payments` | 401 | 403 | cash-happy:201, cross-tenant:422, staff-tier:403 | **PASS** |  |
| www | `POST` | `/api/v1/payments/initiate` | 401 | 400 | happy:201, happy:201, client-amount-rejected:400 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/payments/intents/[id]` | 401 | 403 | happy:403, not-owner:403, owner:200 | **PASS** |  |
| www | `POST` | `/api/v1/payments/intents/[id]/mock-complete` | 401 | 400 | settle-success:200, exactly-once-replay:200, flip-to-failure:200 | **FAIL** | [F] happy→400; [F] exactly-once-replay→400 |
| www | `GET` | `/api/v1/payments/[id]/receipt` | 401 | 403 | happy:404, pdf:200 | **PASS** |  |
| www | `GET` | `/api/v1/payments/[id]` | 401 | 403 | happy:404 | **PASS** |  |
| www | `PATCH` | `/api/v1/payments/[id]` | 401 | 403 | cross-tenant:400 | **FAIL** | [F] cross-tenant→400 |
| www | `GET` | `/api/v1/grades` | 401 | 200 | happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/grades` | 401 | 403 | happy:201, cross-teacher:403, delegated:201 | **PASS** |  |
| www | `PUT` | `/api/v1/grades/[id]/scores` | 401 | 403 | happy:200, score-over-max:422 | **PASS** |  |
| www | `DELETE` | `/api/v1/grades/[id]` | 401 | 403 | cross-teacher:403, happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/grades/[id]` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `PATCH` | `/api/v1/grades/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/%5Fping` | 404 | — | happy:404 | **FAIL** | [F] happy→404 |
| www | `GET` | `/api/v1/materials` | 401 | 200 | happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/materials` | 401 | 403 | happy(external):422, M6-magic-bytes:422 | **PASS** |  |
| www | `GET` | `/api/v1/materials/[id]/download` | 401 | 403 | happy:403 | **FAIL** | [F] happy→403 |
| www | `DELETE` | `/api/v1/materials/[id]` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `PATCH` | `/api/v1/materials/[id]` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `DELETE` | `/api/v1/messages/blocks` | 401 | 400 | unblock-idempotent:200 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/messages/blocks` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/messages/blocks` | 401 | 400 | student-blocks-teacher:201, adult-blocks-minor:201 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/messages/contacts` | 401 | 200 | happy:200, happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/messages/groups` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/messages/groups` | 401 | 400 | teacher-owns-course:201, not-course-owner:403, student-cannot-create:403 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/messages/groups/[id]/mute` | 401 | 400 | member:200, non-member:403 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/messages/groups/[id]/read` | 401 | 403 | member:200 | **PASS** |  |
| www | `GET` | `/api/v1/messages/groups/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/messages/groups/[id]` | 401 | 400 | owner-posts:201, owner_only-policy:403, non-member:403 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/messages/conversations` | 401 | 200 | happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/messages/conversations` | 401 | 400 | new-conversation-rate-limit:0, student->own-teacher:201, student->unrelated-teacher:400 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/messages/conversations/[id]/read` | 401 | 403 | happy:200, non-participant:403 | **PASS** |  |
| www | `GET` | `/api/v1/messages/conversations/[id]` | 401 | 403 | happy:200, block-preserves-history:0 | **PASS** |  |
| www | `POST` | `/api/v1/messages` | 401 | 400 | send-rate-limit:0, happy:201, non-participant:403 | **SUSPICIOUS** | [S] chat-rate-limit→0; [S] wrong-role→400 |
| www | `POST` | `/api/v1/messages/reports` | 401 | 400 | happy:201, non-participant-report:403 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/enrollments` | 401 | 200 | happy:200, happy:200, ISO-11:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/enrollments` | 401 | 403 | enroll:201, happy:403, duplicate-active:403 | **FAIL** | [F] happy→403; [F] duplicate-active→403 |
| www | `DELETE` | `/api/v1/enrollments/[id]` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `GET` | `/api/v1/collaboration-requests` | 401 | 403 | happy:200, happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/collaboration-requests` | 401 | 403 | happy:201 | **PASS** |  |
| www | `POST` | `/api/v1/collaboration-requests/[id]/cancel` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/collaboration-requests/[id]/accept` | 401 | 403 | initiator-cannot-accept:403 | **PASS** |  |
| www | `POST` | `/api/v1/collaboration-requests/[id]/reject` | 401 | 403 | wrong-center:403 | **PASS** |  |
| www | `GET` | `/api/v1/door-checkin` | 401 | 403 | happy:422, happy:422, FIX-02:200 | **FAIL** | [F] happy→422; [F] happy→422 |
| www | `POST` | `/api/v1/door-checkin` | 401 | 403 | door-by-assistant:200, door-idempotent:200, front-desk-denied:403 | **PASS** |  |
| www | `POST` | `/api/v1/affiliations/[id]/accept` | 401 | 403 | not-the-invitee:403 | **PASS** |  |
| www | `DELETE` | `/api/v1/affiliations/[id]` | 401 | 403 | cross-tenant:403 | **PASS** |  |
| www | `POST` | `/api/v1/affiliations/[id]/decline` | 401 | 403 | not-the-invitee:403 | **PASS** |  |
| www | `POST` | `/api/v1/roster/teachers/lookup` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/roster/teachers/invite` | 401 | 403 | happy:201 | **PASS** |  |
| www | `GET` | `/api/v1/roster/teachers` | 401 | 403 | happy:200 | **PASS** |  |
| www | `DELETE` | `/api/v1/roster/teachers/[teacherId]` | 401 | 403 | not-affiliated:404 | **PASS** |  |
| www | `DELETE` | `/api/v1/roster/students/[studentId]` | 401 | 403 | cross-tenant:404, happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/roster/students/[studentId]` | 401 | 403 | happy:404 | **FAIL** | [F] happy→404 |
| www | `PATCH` | `/api/v1/roster/students/[studentId]` | 401 | 403 | cross-tenant:404 | **PASS** |  |
| www | `POST` | `/api/v1/roster/students/lookup` | 401 | 403 | happy:200, reception-tier:200 | **PASS** |  |
| www | `POST` | `/api/v1/roster/students/invite` | 401 | 403 | happy:201 | **PASS** |  |
| www | `GET` | `/api/v1/roster/students` | 401 | 403 | happy:200, ISO-10:200, STF-07:200 | **PASS** |  |
| www | `POST` | `/api/v1/roster/students` | 401 | 403 | happy:201 | **PASS** |  |
| www | `POST` | `/api/v1/auth/password/reset` | 400 | — | bad-token:404 | **PASS** |  |
| www | `POST` | `/api/v1/auth/password/forgot` | 400 | — | happy:200, unknown-email:200 | **PASS** |  |
| www | `POST` | `/api/v1/auth/invite/accept` | 400 | — | bad-token:410 | **PASS** |  |
| www | `POST` | `/api/v1/auth/register/center` | 400 | — | happy:201 | **PASS** |  |
| www | `POST` | `/api/v1/auth/register/student` | 400 | — | happy:201, duplicate-email:409, weak-password:400 | **PASS** |  |
| www | `POST` | `/api/v1/auth/register/parent` | 400 | — | happy:201 | **PASS** |  |
| www | `POST` | `/api/v1/auth/login` | 400 | — | happy:200, wrong-password:401, unknown-email:401 | **PASS** |  |
| www | `GET` | `/api/v1/expenses` | 401 | 403 | happy:200, STF-09:403 | **PASS** |  |
| www | `POST` | `/api/v1/expenses` | 401 | 403 | happy:201, negative-amount:400 | **PASS** |  |
| www | `DELETE` | `/api/v1/expenses/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `PATCH` | `/api/v1/expenses/[id]` | 401 | 403 | happy:200, cross-tenant:404 | **PASS** |  |
| www | `POST` | `/api/v1/center/temp-students` | 401 | 403 | happy:201, wrong-staff-tier:403 | **PASS** |  |
| www | `GET` | `/api/v1/center/subscriptions` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/subscriptions` | 401 | 403 | walk-in-cash+checkin:201, cross-tenant:404, walk-in-cash+checkin:400 | **FAIL** | [F] walk-in-cash+checkin→400; [F] cross-tenant→400 |
| www | `POST` | `/api/v1/center/walk-in` | 401 | 403 | happy:200, duplicate-phone:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/walk-in/resend` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/wallet-topup` | 401 | 403 | happy:201, negative:400, cross-tenant:422 | **PASS** |  |
| www | `GET` | `/api/v1/center/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/blacklist` | 401 | 403 | happy:404, reason-required:400 | **FAIL** | [F] happy→404 |
| www | `DELETE` | `/api/v1/center/blacklist/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/center/wallet/transactions` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/center/wallet` | 401 | 403 | happy:200, STF-01:403, STF-02:200 | **PASS** |  |
| www | `GET` | `/api/v1/center/wallet/payouts` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/wallet/payout-request` | 401 | 403 | over-balance:422, staff-excluded:403, negative:400 | **PASS** |  |
| www | `GET` | `/api/v1/center/staff` | 401 | 403 | happy:200, STF-03:403, STF-04:403 | **PASS** |  |
| www | `POST` | `/api/v1/center/staff` | 401 | 403 | happy:201, manager-cannot-manage-staff:403 | **PASS** |  |
| www | `GET` | `/api/v1/center/staff/me` | 401 | 403 | happy:200, happy:200 | **PASS** |  |
| www | `DELETE` | `/api/v1/center/staff/[id]` | 401 | 403 | cross-tenant:404, happy:200 | **PASS** |  |
| www | `PATCH` | `/api/v1/center/staff/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/center/checkin/suggest` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/center/checkin/lookup` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/center/checkin` | 401 | 403 | uncovered-student:402, covered-student:200, happy-or-needs-payment:400 | **FAIL** | [F] happy-or-needs-payment→400; [F] cross-tenant→400 |
| www | `GET` | `/api/v1/catalog/tree` | 401 | — | happy:200 | **SUSPICIOUS** | [S] anon→401 |
| www | `GET` | `/api/v1/catalog/subjects` | 401 | — | happy:200 | **SUSPICIOUS** | [S] anon→401 |
| www | `POST` | `/api/v1/internal/chat-notify` | 403 | — | bad-secret:403, authed-invalid-body:400 | **PASS** |  |
| www | `POST` | `/api/v1/centers/me/admins/invite` | 401 | 403 | happy:201 | **PASS** |  |
| www | `GET` | `/api/v1/centers/me/admins` | 401 | 403 | happy:200, STF-05:403 | **PASS** |  |
| www | `DELETE` | `/api/v1/centers/me/admins/[userId]` | 401 | 403 | cannot-remove-self:403 | **PASS** |  |
| www | `DELETE` | `/api/v1/centers/me/logo` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/centers/me/logo` | 401 | 403 | invalid-body:400 | **PASS** |  |
| www | `GET` | `/api/v1/centers/me` | 401 | 403 | happy:200 | **PASS** |  |
| www | `PATCH` | `/api/v1/centers/me` | 401 | 403 | happy:200, restore:200, staff-tier:403 | **PASS** |  |
| www | `GET` | `/api/v1/centers/[id]` | 200 | — | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/centers/[id]/rooms` | 401 | — | happy:403 | **FAIL** | [F] happy→403; [S] anon→401 |
| www | `DELETE` | `/api/v1/teachers/me/photo` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/teachers/me/photo` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/teachers/me/photo` | 401 | 403 | invalid-body:400 | **PASS** |  |
| www | `GET` | `/api/v1/teachers/[teacherId]` | 200 | — | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/temp-students` | 401 | 403 | happy:201 | **PASS** |  |
| www | `POST` | `/api/v1/temp-students/[id]/send-invite` | 401 | 403 | M5-ownership:404 | **PASS** |  |
| www | `POST` | `/api/v1/temp-students/claim` | 401 | — | bad-code:400 | **SUSPICIOUS** | [S] anon→401 |
| www | `POST` | `/api/v1/subscriptions/checkout` | 401 | 400 | pay-from-wallet:422, wallet-insufficient:422 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/subscriptions/[id]/cancel` | 401 | 404 | subscriptions/[id]/cancel:0 | **PASS** |  |
| www | `GET` | `/api/v1/search/centers` | 200 | — | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/search/teachers` | 200 | — | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/search/courses` | 200 | — | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/realtime/token` | 401 | 200 | happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/courses` | 200 | 200 | happy:200, happy:200 | **FAIL** | [F] anon→200; [F] wrong-role→200 |
| www | `POST` | `/api/v1/courses` | 401 | 403 | C-fresh-course:409, fresh-course:201, happy:201 | **FAIL** | [F] C-fresh-course→409 |
| www | `POST` | `/api/v1/courses/[id]/cancel` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/courses/[id]` | 200 | 200 | happy:200 | **FAIL** | [F] anon→200; [F] wrong-role→200 |
| www | `PATCH` | `/api/v1/courses/[id]` | 401 | 403 | enable-plans:200, cross-tenant:404, happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/courses/[id]/reassign-teacher` | 401 | 403 | unaffiliated-teacher:422 | **PASS** |  |
| www | `GET` | `/api/v1/sessions` | 401 | 200 | happy:200, happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/sessions/[id]/attendance` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `PUT` | `/api/v1/sessions/[id]/attendance` | 401 | 403 | cross-teacher:403, happy:200, delegated:200 | **PASS** |  |
| www | `POST` | `/api/v1/sessions/[id]/cancel` | 401 | 403 | cross-teacher:403, reason-required:400 | **PASS** |  |
| www | `POST` | `/api/v1/sessions/[id]/complete` | 401 | 403 | cross-teacher:403, complete:500, exactly-once-replay:500 | **FAIL** | [F] complete→500; [F] exactly-once-replay→500 |
| www | `POST` | `/api/v1/sessions/[id]/postpone` | 401 | 403 | cross-teacher:403, past-date:400 | **PASS** |  |
| www | `GET` | `/api/v1/sessions/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/dashboards/student` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/dashboards/admin` | 401 | 403 | happy:200, happy:200, ISO-14:200 | **PASS** |  |
| www | `GET` | `/api/v1/dashboards/teacher` | 401 | 403 | happy:200, happy:200, AST-05:200 | **PASS** |  |
| www | `GET` | `/api/v1/subjects` | 200 | — | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/deletion-requests` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/deletion-requests/[id]/reject` | 401 | 403 | happy:404 | **PASS** |  |
| www | `POST` | `/api/v1/deletion-requests/[id]/approve` | 401 | 403 | cross-tenant:404 | **PASS** |  |
| www | `GET` | `/api/v1/parent/oversight/children/[studentId]/conversations` | 401 | 403 | happy:200, happy:200, not-my-child:403 | **PASS** |  |
| www | `GET` | `/api/v1/parent/oversight/children/[studentId]/conversations/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/parent/oversight/children` | 401 | 403 | happy:200, happy:200, CS-01:500 | **FAIL** | [F] CS-01→500 |
| www | `GET` | `/api/v1/me/attendance` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/me/prefs` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `PATCH` | `/api/v1/me/prefs` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `DELETE` | `/api/v1/me/push-subscription` | 401 | 400 | happy:200 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/me/push-subscription` | 401 | 400 | happy:201 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/me/affiliations` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/me/roster/choice` | 401 | 403 | invalid-body:400 | **PASS** |  |
| www | `POST` | `/api/v1/me/delete-request` | 401 | 400 | happy:201 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/me/family-code/rotate` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/family-code` | 401 | 403 | happy:200 | **PASS** |  |
| www | `DELETE` | `/api/v1/me/device-tokens/[token]` | 401 | 404 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/me/device-tokens` | 401 | 400 | happy:201 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/me/subscriptions` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/subjects` | 401 | 200 | happy:403, happy:403, happy:403 | **FAIL** | [F] happy→403; [F] happy→403 |
| www | `GET` | `/api/v1/me` | 401 | 200 | happy:200, happy:200, happy:200 | **FAIL** | [F] A2-blacklist-does-not-revoke-session→0; [S] suspension-takes-effect→0 |
| www | `PATCH` | `/api/v1/me` | 401 | 200 | happy(no-op-name):200, invalid-phone:400 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/me/points` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/points/history` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/wallet` | 401 | 403 | happy:200, OWN-05:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/wallet/history` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/me/children` | 401 | 403 | happy:200, OWN-06:403 | **PASS** |  |
| www | `POST` | `/api/v1/me/subject-requests` | 401 | 400 | happy:403, happy:201 | **FAIL** | [F] happy→403; [S] wrong-role→400 |
| www | `GET` | `/api/v1/me/onboarding` | 401 | 200 | happy:200, happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `PATCH` | `/api/v1/me/onboarding` | 401 | 400 | save-draft:200 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/me/onboarding` | 401 | 400 | invalid-body:400 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/me/credentials` | 401 | 400 | already-has-password:400 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `GET` | `/api/v1/parent-links` | 401 | 200 | happy:200, happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/parent-links` | 401 | 400 | student-initiated(email):409, family-code:400, bad-code:400 | **FAIL** | [F] family-code→400; [S] wrong-role→400 |
| www | `POST` | `/api/v1/parent-links/[id]/reject` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `POST` | `/api/v1/parent-links/[id]/approve` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `DELETE` | `/api/v1/parent-links/[id]` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `GET` | `/api/v1/enrollment-requests` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/enrollment-requests` | 401 | 400 | happy:409, already-enrolled:409 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `POST` | `/api/v1/enrollment-requests/[id]/approve` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `DELETE` | `/api/v1/enrollment-requests/[id]` | 401 | 404 | — | **GUARD-ONLY** |  |
| www | `POST` | `/api/v1/enrollment-requests/[id]/decline` | 401 | 403 | — | **GUARD-ONLY** |  |
| www | `GET` | `/api/v1/rooms` | 401 | 403 | happy:200, ISO-09:200 | **PASS** |  |
| www | `POST` | `/api/v1/rooms` | 401 | 403 | happy:201 | **PASS** |  |
| www | `DELETE` | `/api/v1/rooms/[id]` | 401 | 403 | cross-tenant:404, happy(soft):200 | **PASS** |  |
| www | `PATCH` | `/api/v1/rooms/[id]` | 401 | 403 | happy:200, cross-tenant:404, staff-tier:403 | **PASS** |  |
| www | `POST` | `/api/v1/rooms/[id]/photos` | 401 | 403 | invalid-body:400 | **PASS** |  |
| www | `POST` | `/api/v1/teacher/attendance/sync` | 401 | 403 | happy:200, idempotent-replay:200, cross-teacher:200 | **PASS** |  |
| www | `GET` | `/api/v1/teacher/attendance-mode` | 401 | 403 | happy:200, happy:403, AST-06:403 | **FAIL** | [F] happy→403; [F] AST-06→403 |
| www | `PATCH` | `/api/v1/teacher/attendance-mode` | 401 | 403 | switch-to-door-mode:200, delegated-write:200, restore:200 | **PASS** |  |
| www | `GET` | `/api/v1/teacher/assistants` | 401 | 403 | happy:200, AST-04:403 | **PASS** |  |
| www | `POST` | `/api/v1/teacher/assistants` | 401 | 403 | happy:201, assistant-cannot-manage:403 | **PASS** |  |
| www | `DELETE` | `/api/v1/teacher/assistants/[id]` | 401 | 403 | cross-teacher:404, happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/teacher/temp-students` | 401 | 403 | happy:201 | **PASS** |  |
| www | `GET` | `/api/v1/teacher/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| www | `POST` | `/api/v1/teacher/blacklist` | 401 | 403 | happy:201 | **PASS** |  |
| www | `DELETE` | `/api/v1/teacher/blacklist/[id]` | 401 | 403 | cross-teacher:400, happy:400, cross-teacher:403 | **FAIL** | [F] cross-teacher→400; [F] happy→400 |
| www | `GET` | `/api/v1/teacher/wallet/transactions` | 401 | 403 | happy:200, AST-03:403 | **PASS** |  |
| www | `GET` | `/api/v1/teacher/wallet` | 401 | 403 | happy:200, TCH-04:200, AST-01:403 | **PASS** |  |
| www | `GET` | `/api/v1/teacher/wallet/payouts` | 401 | 403 | happy:200, AST-02:403 | **PASS** |  |
| www | `POST` | `/api/v1/teacher/wallet/payout-request` | 401 | 403 | over-balance:422, assistant-excluded:403 | **PASS** |  |
| www | `POST` | `/api/v1/notifications/read-all` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `GET` | `/api/v1/notifications` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/notifications/[id]/read` | 401 | 404 | happy:200, not-owner:404 | **PASS** |  |
| www | `POST` | `/api/v1/notifications/broadcast` | 401 | 403 | happy:200, cross-tenant:404 | **PASS** |  |
| www | `POST` | `/api/v1/cron/[job]` | 401 | — | bad-secret:lesson-reminders:401, happy:lesson-reminders:200, bad-secret:expire-payment-intents:401 | **PASS** |  |
| www | `GET` | `/api/v1/reports/expenses-timeseries` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/expenses` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/revenue-timeseries` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/enrollment-funnel` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/attendance-by-course` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/course-fill-rates` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/net-profit` | 401 | 403 | happy:200 | **PASS** |  |
| www | `GET` | `/api/v1/reports/revenue` | 401 | 403 | happy:200, STF-08:403 | **PASS** |  |
| www | `GET` | `/api/v1/reviews` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| www | `POST` | `/api/v1/reviews` | 401 | 400 | happy:409, rating-out-of-range:400, not-eligible:403 | **SUSPICIOUS** | [S] wrong-role→400 |
| www | `PATCH` | `/api/v1/reviews/[id]` | 401 | 422 | happy:422, not-author:403 | **FAIL** | [F] happy→422; [S] wrong-role→422 |
| www | `GET` | `/api/v1/reviews/eligible` | 401 | 200 | happy:200 | **FAIL** | [F] wrong-role→200 |
| superadmin | `POST` | `/api/v1/admin/accountants` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/session-settlements` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/collaboration-requests` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/collaboration-requests/[id]` | 401 | 403 | happy:404 | **FAIL** | [F] happy→404 |
| superadmin | `GET` | `/api/v1/admin/whatsapp-messages` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/offerings` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/offerings` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/catalog/offerings/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/catalog/offerings/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/stages` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/stages` | 401 | 403 | happy:400, happy:201 | **FAIL** | [F] happy→400 |
| superadmin | `PATCH` | `/api/v1/admin/catalog/stages/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/grade-tracks` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/catalog/grade-tracks/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/tracks` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/tracks` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/catalog/tracks/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/subjects` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/subjects` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/catalog/subjects/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/systems` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/systems` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/catalog/systems/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/subject-requests` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/subject-requests/[id]/reject` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/subject-requests/[id]/approve` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/catalog/grade-levels` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/catalog/grade-levels` | 401 | 403 | D-happy:201, happy:400 | **FAIL** | [F] happy→400 |
| superadmin | `PATCH` | `/api/v1/admin/catalog/grade-levels/[id]` | 401 | 403 | D-patch:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/payment-intents` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/payment-intents/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/centers` | 401 | 403 | happy:200, SA-02:403 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/centers/[id]/split` | 401 | 403 | clear:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/centers/[id]/split` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/centers/[id]/split` | 401 | 403 | happy:200, bad-sum:400 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/centers/[id]/per-student-rate` | 401 | 403 | clear:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/centers/[id]/per-student-rate` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/centers/[id]/reject` | 401 | 403 | B-reject:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/centers/[id]/affiliations` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/centers/[id]/affiliations/[affiliationId]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/centers/[id]/toggle` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/centers/[id]/approve` | 401 | 403 | B2-center-reject-then-approve:0 | **FAIL** | [F] B2-center-reject-then-approve→0 |
| superadmin | `POST` | `/api/v1/admin/centers/[id]/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/centers/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | 401 | 403 | clear:404 | **FAIL** | [F] clear→404 |
| superadmin | `PUT` | `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | 401 | 403 | happy:404, center-cannot-set-own-split:401 | **FAIL** | [F] happy→404 |
| superadmin | `DELETE` | `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | 401 | 403 | clear:404 | **FAIL** | [F] clear→404 |
| superadmin | `PUT` | `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | 401 | 403 | happy:404 | **FAIL** | [F] happy→404 |
| superadmin | `PATCH` | `/api/v1/admin/centers/[id]/rooms/[roomId]` | 401 | 403 | happy:404 | **FAIL** | [F] happy→404 |
| superadmin | `GET` | `/api/v1/admin/centers/[id]/rooms` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/teachers` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/teachers/[id]/attendance-mode` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/teachers/[id]/link-center` | 401 | 403 | already-linked:409 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/teachers/[id]/reject` | 401 | 403 | B-reject:200, happy:200 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/teachers/[id]/unlink-center` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/teachers/[id]/approve` | 401 | 403 | B-reject-then-approve:0, happy:422 | **FAIL** | [F] B-reject-then-approve→0; [F] happy→422 |
| superadmin | `POST` | `/api/v1/admin/teachers/[id]/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/subscriptions` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/subscriptions/[id]` | 401 | 403 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/dashboard/user-growth-chart` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/dashboard/kpis` | 401 | 403 | happy:200, happy:403, SA-01:403 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/dashboard/revenue-chart` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/students` | 401 | 403 | happy:200, SA-03:403 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/students/[id]/unlink-parent` | 401 | 403 | missing-linkId:422 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/students/[id]/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/students/[id]` | 401 | 403 | happy:404 | **FAIL** | [F] happy→404 |
| superadmin | `POST` | `/api/v1/admin/students/[id]/link-parent` | 401 | 403 | already-linked:409 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/revenue-split/per-student-rate` | 401 | 403 | clear:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/revenue-split/per-student-rate` | 401 | 403 | happy:200, both-set:400 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/revenue-split` | 401 | 403 | happy:200, before:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/revenue-split` | 401 | 403 | invalid-sum:400, idempotent-write:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/blacklist` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/blacklist/[id]/remove` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/users/[id]/permissions` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/users/[id]/permissions` | 401 | 403 | suspend:200, restore:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/users/[id]/blacklist` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/points/students/[id]/ledger` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/points/students/[id]/adjust` | 401 | 403 | happy:200, revert:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/points/rules` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/admin/points/rules` | 401 | 403 | happy:201 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/points/rules/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/points/rules/[id]` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/commission-settings` | 401 | 403 | happy:200, before:200 | **PASS** |  |
| superadmin | `PUT` | `/api/v1/admin/commission-settings` | 401 | 403 | idempotent-write:200, bp-over-100pct:400 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/messaging/blocks` | 401 | 403 | happy:200, happy:200 | **PASS** |  |
| superadmin | `DELETE` | `/api/v1/admin/messaging/messages/[id]` | 401 | 403 | soft-delete:200, accountant-denied:403, soft-delete:400 | **FAIL** | [F] soft-delete→400 |
| superadmin | `GET` | `/api/v1/admin/messaging/conversations` | 401 | 403 | happy:200, SA-04:403, accountant-denied:403 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/messaging/conversations/[id]` | 401 | 403 | thread-viewer:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/messaging/reports` | 401 | 403 | happy:200, happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/admin/messaging/reports/[id]` | 401 | 403 | triage:200, accountant-denied:403, triage:400 | **FAIL** | [F] triage→400 |
| superadmin | `GET` | `/api/v1/admin/notifications/history` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/admin/registrations` | 401 | 403 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/me` | 401 | 401 | happy:200, happy:200 | **PASS** |  |
| superadmin | `PATCH` | `/api/v1/me` | 401 | 401 | no-op:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/invoices` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/finance/invoices` | 401 | 401 | invalid-body:400 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/invoices/[id]/pdf` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `POST` | `/api/v1/finance/invoices/[id]/send-email` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/invoices/[id]` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/payment-intents` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/payment-intents/[id]` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/subscriptions` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/subscriptions/[id]` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/alerts` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/dashboard` | 401 | 401 | happy:200, happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/dashboard/revenue-chart` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/transactions` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/transactions/[id]` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/commission-settings` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/refunds` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/finance/refunds` | 401 | 401 | invalid-body:400, reason-required:400, no-charge-to-refund:400 | **FAIL** | [F] no-charge-to-refund→400 |
| superadmin | `POST` | `/api/v1/finance/payouts/bulk-approve` | 401 | 401 | empty:400 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/payouts` | 401 | 401 | happy:200, SA-05:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/finance/payouts` | 401 | 401 | generate:500, generate-as-superadmin:500, generate:500 | **FAIL** | [F] generate→500; [F] generate-as-superadmin→500 |
| superadmin | `POST` | `/api/v1/finance/payouts/[id]/reject` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `POST` | `/api/v1/finance/payouts/[id]/approve` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/payouts/[id]/receipt` | 401 | 401 | nonexistent-id:404 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/reports/trial-balance` | 401 | 401 | happy:200, SA-06:200, trial-balance-formula:0 | **FAIL** | [F] trial-balance-formula→0 |
| superadmin | `GET` | `/api/v1/finance/reports/teacher-statement/[teacherId]` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/reports/center-statement/[centerId]` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/reports/refunds` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/finance/reports/revenue` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/notifications/read-all` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `GET` | `/api/v1/notifications` | 401 | 401 | happy:200 | **PASS** |  |
| superadmin | `POST` | `/api/v1/notifications/[id]/read` | 401 | 401 | happy:200 | **PASS** |  |

---

## 7. Suggested fix order

| Order | Finding | Why first |
|---|---|---|
| 1 | **C-01** session-completion 500 | The money engine cannot settle a lesson for the default course shape. Blocks launch. |
| 2 | **C-03** status changes don't revoke sessions | A suspended or blacklisted user keeps write access for 30 days. |
| 3 | **C-02** payout generation 500 | The accountant cannot pay anyone. |
| 4 | **C-04** `center_staff` login allowlist | An entire built feature is unreachable through the REST login door. |
| 5 | **H-04** blacklist cascade not reversed | Silent, irreversible data loss on a "reversible" action. |
| 6 | **H-01** trial-balance formula | Wrong headline money number for the accountant. |
| 7 | **H-02** 20 s transaction ceiling | Intermittent 500s on a child-safety read path. |
| 8 | **H-03** seed UUIDs | Blocks demoing/QA of the counter and messaging flows. |
| 9 | **M-01 … M-05** | Workflow and consistency defects, no data at risk. |
| 10 | **L-01 … L-07** | Cosmetic / needs-a-decision. |
