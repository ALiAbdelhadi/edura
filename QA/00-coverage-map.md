# QA Coverage Map — Edura ERP

**Phase 0 deliverable.** Target: commit `ac5e941`, branch `main`.
Everything here is **[STATIC]** — derived from reading source as committed.
No app was started, no request was sent, no database was touched.

Companion files:
- [`QA/raw/endpoint-inventory.md`](raw/endpoint-inventory.md) — all 526 method+path rows with resolved roles.
- [`QA/raw/route-gates.tsv`](raw/route-gates.tsv) — machine-readable source of the above.
- [`QA/raw/extract.py`](raw/extract.py) — the extractor, so this map is reproducible.
- [`QA/progress.md`](progress.md) — running log.

---

## A. System topology

Bun-only monorepo (Bun 1.3.12), Turborepo, Next.js 16.3, Prisma + Neon Postgres.

| App | Role in system | Dev port | Auth |
|---|---|---|---|
| `apps/erp` | **The product.** All 6 public roles. Confusingly named — this is what CLAUDE.md calls "www". | 3002 | better-auth, cookie prefix per app |
| `apps/superadmin` | Back office. `super_admin` + `accountant` only. | 3004 | better-auth, separate cookie namespace |
| `apps/www` | Public marketing/landing site. 2 API routes only. | 3010 | none (public) |
| `apps/realtime` | Socket.IO chat server, long-running Bun process. | 3005 | JWT (`REALTIME_JWT_SECRET`) + `x-internal-secret` bridge |

**Route counts:** 526 method+path rows over ~425 route files —
erp 219 files, superadmin 204, www 2.

---

## B. Roles and permissions

### B.1 The `Role` enum (`packages/database/prisma/schema.prisma:14`)

| Role | App | What it is |
|---|---|---|
| `super_admin` | superadmin | Full platform control |
| `accountant` | superadmin | Platform finance only, restricted portal |
| `center_admin` | erp | Owner of a teaching center |
| `center_staff` | erp | Acts **on behalf of** a center; never co-equal to owner |
| `teacher` | erp | Teaches; may own teacher-direct courses |
| `assistant` | erp | Serves **exactly one** teacher, acts on their behalf |
| `parent` | erp | Guardian; oversight over linked children |
| `student` | erp | End user |

### B.2 `CenterStaffRole` sub-tiers (`schema.prisma:31`)

| Sub-role | Capability |
|---|---|
| `receptionist` | Counter check-in, walk-in registration, cash top-ups, student lookup |
| `manager` | Receptionist **superset** + rooms + collaboration accept/reject + operational reports |
| `center_accountant` | **READ-ONLY** view of its own center's finance. Blocked from every mutating method. |

### B.3 Login partition — enforced in one place

`packages/server-core/src/auth/login-policy.ts` holds an exhaustive
`Record<Role, LoginApp>`. A role belongs to exactly one app **by construction**,
so www and superadmin can never both claim (or both drop) a role. Adding a Role
to the enum fails typecheck until classified. `canSignIn` is default-deny.

- **superadmin door:** `super_admin`, `accountant`
- **erp door:** `center_admin`, `center_staff`, `teacher`, `assistant`, `parent`, `student`

> Back-office staff can **never** mint an erp session, and no erp role can reach
> the back office. This is the strongest boundary in the system. **Phase 1 must
> still probe it at runtime** — a documented invariant is not a verified one.

### B.4 The two `requireRole` implementations differ — this matters

| | erp | superadmin |
|---|---|---|
| File | `apps/erp/src/lib/authz/require-role.ts:19` | `apps/superadmin/src/lib/authz/require-role.ts:5` |
| Behavior | Strict positive allow-list. **No bypass.** | **`super_admin` short-circuits before the allow-list check** (line 7) |

So in superadmin, `requireRole("accountant")` admits `accountant` **and**
`super_admin`. Marked `super_admin*` in the inventory. Deliberate, but it means
every "accountant-only" route is really "accountant + super_admin".

### B.5 Delegation gates

| Gate | Resolves to | Rows |
|---|---|---|
| `centerStaff(h, {allow: RECEPTION})` | center_admin + staff[receptionist, manager] | 25 |
| `centerStaff(h, {allow: MANAGER})` | center_admin + staff[manager] | 13 |
| `centerStaff(h, {allow: ACCOUNTANT})` | center_admin + staff[center_accountant], read-only | 8 |
| `centerStaff(h)` no allow | **center_admin only** (owner) | 9 |
| `delegated(...)` | teacher + assistant | 19 |
| `delegatedWithCenter(...)` | teacher + assistant + center side per `staffAllow` | 16 |

**Fail-closed by omission** is the core design: exclusions are never written as a
denylist. A route not wrapped in `centerStaff` keeps `requireRole("center_admin")`,
and because that is a positive allow-list, staff get 403 automatically. A
forgotten route fails **closed**. Two independent defenses back it: the
`center_accountant` read-only check runs regardless of a route's `allow`
(`center-actor.ts:167`), and the staff link is re-read live per request
(`WHERE removed_at IS NULL`), so a removed staff member loses access on the next
request no matter what their 30-day JWT says.

---

## C. Roles × endpoints matrix (the test surface)

Full per-endpoint detail: [`QA/raw/endpoint-inventory.md`](raw/endpoint-inventory.md).
Aggregate shape:

| Gate | Rows | Resolved roles |
|---|---:|---|
| `requireRole(super_admin)` | 203 | super_admin |
| `requireSession` (erp) | 59 | any of the 6 erp roles — **self-scoped, tenancy lives in the service** |
| `centerStaff` (all tiers) | 55 | center_admin ± staff tiers |
| `requireRole(center_admin)` | 51 | center_admin only (staff excluded by omission) |
| `requireRole(accountant, super_admin)` | 30 | accountant + super_admin |
| **`NONE` — unauthenticated** | **27** | **PUBLIC** |
| `delegated` / `delegatedWithCenter` | 35 | teacher + assistant (+ center side) |
| `requireRole(student)` / `(parent)` / `(student,parent)` | 35 | the named role(s) only |
| `requireRole(teacher)` / `(teacher,assistant)` | 19 | the named role(s) only |
| `requireSession` (superadmin) | 7 | super_admin + accountant |
| `getSessionUser` | 3 | authenticated, no role check |
| `requireRole(center_staff)` | 1 | center_staff |

### C.1 The 27 unauthenticated endpoints — the outside attack surface

This is where Phase 1 starts, because it needs no credentials at all.

| Endpoint | Protection | RL | Assessment |
|---|---|---|---|
| `POST /api/v1/auth/login` | credential check, H5 timing, C2 limits | ✅ | by design |
| `POST /api/v1/auth/register/{student,parent,teacher,center}` | — | ✅ | by design |
| `POST /api/v1/auth/password/{forgot,reset}` | token | ✅ | by design |
| `POST /api/v1/auth/invite/accept` | invite token | ✅ | by design |
| `POST /api/v1/guardian/verify` | single-use token; identical error for every failure | ✅ | by design, well reasoned |
| `POST /api/v1/payments/paymob/webhook` | **HMAC**; amount never read from payload; idempotent replay | ✅ | by design |
| `POST /api/v1/cron/[job]` | `CRON_SECRET`, **fails closed in every env**, POST-only | ❌ | see F |
| `POST /api/v1/internal/chat-notify` | `INTERNAL_API_SECRET` | ❌ | see F |
| `POST /api/v1/contact`, `www POST /api/contact` | — | ✅ | two implementations — compare |
| `GET/POST /api/auth/[...all]` (both apps) | better-auth internals | — | mounts admin/2FA endpoints |
| `GET /api/health` (both apps) | — | ❌ | check what it discloses |
| `GET /api/v1/_ping` | — | ❌ | check what it discloses |
| `GET /api/v1/search/{centers,teachers}` | — | ✅ | public directory |
| `GET /api/v1/subjects`, `GET /api/v1/courses/[id]`, `GET /api/v1/teachers/[teacherId]` | — | ❌ | public catalog — verify no PII |
| **`GET /api/v1/centers/[id]`** | **none** | ❌ | **flagged — see F.1** |

---

## D. How to run, test, and seed

### D.1 Run the apps

```bash
bun install
```

```bash
bun run dev
```

Individually: `bun run --filter edura dev` (erp, :3002),
`bun run --filter superadmin dev` (:3004), `bun run --filter realtime dev`.

> **Do not flip dev to `--bun`.** Under `bun --bun`, `next dev` Turbopack fails to
> resolve hashed external server modules (bcryptjs, @prisma/adapter-neon, ws, pg)
> and every `/api/auth/*` route 500s. Production `start` scripts *do* use
> `bun --bun` and are proven fine. (CLAUDE.md, 2026-07-31.)

### D.2 Existing tests

| Suite | Command | Count | Needs DB |
|---|---|---:|---|
| erp unit | `bun run --filter edura test:unit` | 75 files | no |
| superadmin unit | `bun run --filter superadmin test:unit` | 7 files | no |
| erp DB proofs | `bun run --filter edura test:db` | 39 files | **yes** |
| superadmin DB proofs | `bun run --filter superadmin test:db` | 23 files | **yes** |
| erp E2E (Playwright) | `bun run --filter edura test:pw` | 8 specs | yes + running app |

DB suites are discovered, not listed, so a new suite runs the day it lands.
`assertDbEnv(["test"])` runs in-process before the first suite spawns, and every
suite calls it itself — so a hand-typed `--env-file=.env.local` is refused.

**The DB suites do not use HTTP.** They import service and handler functions
directly and inject the session through a test-only seam,
`__setSessionOverrideForTests` (`apps/erp/src/lib/auth/session.ts:33`), which
throws if `NODE_ENV === "production"`. This is the fastest path to real RBAC
execution in Phase 1 — but it **bypasses middleware, cookie handling, and the
rate limiter**, so HTTP-layer behavior must be probed over real HTTP separately.

### D.3 Seeding

```bash
bun run --filter @repo/database seed
```

`seed --no-demo` = production-equivalent (catalog + 2 staff accounts + points
rules, zero demo rows). Plain `seed` adds demo entities. ~20 feature-specific
demo seeds exist (`seed:counter-demo`, `seed:parentpay-demo`, …). All demo data
is flagged `is_demo = true`. Staff accounts come from `SEED_*` env vars.

### D.4 🔴 Phase 1 blocker — there is no test database

**The repo's `.env.test` files point at the DEV database.**

- Both resolve to `ep-patient-scene-as0gnsfy` and set `EDURA_ALLOW_DB_ENVS=dev`.
- `db-guard` reports them as `labelled 'dev'`.
- CLAUDE.md confirms: *"[test] THERE IS NO TEST DATABASE"* — a deliberate
  decision from 2026-08-03, taken because the old test branch became unreachable.

So **running the existing DB suites as documented would mutate dev**, which
violates the ground rules for this audit. Measured residue is small but real
(the wallet suites leave an `audit_logs` row each run, and `audit_logs` is
append-only).

**Plan:** stand up a **disposable local Postgres** (docker + psql confirmed
available on this machine), label it `edura-env:test`, `prisma migrate deploy`,
seed it, and point a scratch env file at it. Never reuse the repo's `.env.test`.
Production is never widenable — naming it in `EDURA_ALLOW_DB_ENVS` is a hard
error by design.

---

## E. Payment gateway — hook points (out of scope, flagged as required)

`PAYMENTS_MODE` must be explicit (`mock` | `sandbox` | `live`); the mock driver
cannot settle in production; `PAYMOB_HMAC_SECRET` is required with no fallback.
The paymob driver is a **deliberate empty stub**. Where the real one will hook in:

| Hook | Location | Current state |
|---|---|---|
| Auth token → order → payment key → iframe | `lib/services/payments/gateway.ts` (driver stub) | TODOs mark each step |
| Webhook signature | `resolveDriver().verifyWebhook(rawBody, query)` | HMAC, `timingSafeEqual` |
| Webhook processing | `processWebhookEvent` ← `payments/paymob/webhook/route.ts:33` | claim + settle in **one** transaction (M1); replay returns 200 without re-settling; unknown order → 200 `{ignored:true}` so the gateway stops retrying |
| Amount authority | server-side intent only | **never read from the payload** |
| Intent expiry | `expirePaymentIntents` via `POST /api/v1/cron/expire-payment-intents` | idempotent |
| Refund | superadmin finance | guarded by partial unique `transactions_one_refund_per_payment` (H3) |
| Payout settle | `finance/payouts` | `SELECT … FOR UPDATE` (H1) + conditional decrement + DB CHECK (H2) |
| Mock completion | `POST /api/v1/payments/intents/[id]/mock-complete` | **404s in production** |

Phase 1 will exercise these in `mock` mode and verify the state machine,
idempotency, and that no path lets a client dictate an amount.

---

## F. Candidate findings from discovery

Recorded now so they survive. **None is confirmed** — each needs runtime
execution in Phase 1. All tagged **[STATIC]**.

**F.1 `GET /api/v1/centers/[id]` — unauthenticated, no rate limit.**
`apps/erp/src/app/api/v1/centers/[id]/route.ts:8`. Runs under `platformDb`
(RLS bypass) and returns center contact details, **course prices**, teacher
names, **per-course `enrolledCount`**, and **`totalStudents`**. If this is the
public center profile it may be intended — but it hands a competitor a live
revenue-proxy feed, unauthenticated and unthrottled. **Needs a product ruling,
not just a code fix.**

**F.2 `GET /api/v1/materials/[id]/download` — possible broken access control.**
`getMaterialDownloadUrl` (`lib/services/materials/materials.ts:230`) branches on
student / parent / center_admin / teacher and has **no `else` / default-deny**.
`assistant`, `center_staff` and any future role fall through with **no ownership
check** and receive a signed Cloudinary URL. Open question Phase 1 must settle:
does `scopedDb` RLS independently filter the `findUnique` for those roles? If
not, this is an IDOR on every material in the platform.

**F.3 `getGrade` may leak grade metadata** to unrelated students/parents —
scores are filtered, the grade record itself appears not to be.

**F.4 `attendance/sync` bypasses the on-behalf-of audit choke point** — assistant
actions may go unattributed, weakening the Step 8 audit guarantee.

**F.5 Teacher blacklist POST has no student-relationship check** — a teacher may
be able to blacklist/notify an arbitrary student id. Harassment / spam vector.

**F.6 Cash wallet top-up has no replay guard** noted on a money path.

**F.7 `PATCH /api/v1/admin/users/[id]/permissions` is a second suspension path.**
It mutates `users.status` via `updateUserStatus` with **no reason argument**,
duplicating `PATCH …/status` (`setUserSuspended`, reason mandatory), which
CLAUDE.md calls *the* one suspension mechanism. Verify whether the `/permissions`
path bumps `token_version` and fires `users_revoke_sessions` — **if it does not,
a "suspended" user keeps a live session.** Highest-value probe in this list.

**F.8 `POST /api/v1/admin/impersonation/stop` has no `requireRole`** — only
`getSessionUser()`. Deliberate and documented (while impersonating, the effective
role is the impersonated one, so the guard would trap the admin inside). Real
gate delegated to better-auth's `stopImpersonating`. Verify a plain
non-impersonating session gets an error, not a silent no-op; the audit row is
written only `if (impersonatedBy)`.

**F.9 `DELETE /api/v1/admin/students/[id]/unlink-parent` ignores the path id** —
selects the link by `linkId` query param alone, with no check that it belongs to
student `[id]`. super_admin-only, so a hygiene bug rather than a privilege hole.

**F.10 Internal secrets compared with `===`, not constant-time.**
`cron/[job]/route.ts:26` and `internal/chat-notify/route.ts:27`. Both fail closed
and both secrets are high-entropy, so this is Low — but the login path already
uses `timingSafeEqual`, so the codebase is inconsistent with itself.

**F.11 `center-actor.ts` capability-map docblock is stale.** The external-teacher
staff surface (including RECEPTION-level grade mutations and PII lookup),
guardian-contact, bulk import and logo routes are opened via `centerStaff` but
absent from the map that calls itself *"the single auditable reference for the
whole matrix"* (`center-actor.ts:50`). Doc drift — but this map is what a
reviewer trusts, so it is worth fixing.

**F.12 Device-token / push-subscription hijack pattern.** `me/device-tokens` POST
and `me/push-subscription` POST upsert on a unique key (`token` / `endpoint`) and
overwrite `userId` to the caller **without checking existing row ownership**. A
caller who learns another user's token could redirect that device's push
notifications to themselves.

---

## G. What Phase 1 will do

1. Stand up a disposable local Postgres, label `edura-env:test`, migrate, seed.
2. Run the existing 62 DB proof suites + 82 unit files against it — establish a
   baseline and see what already fails.
3. Boot erp + superadmin against the throwaway DB; create one live account per
   role (8 roles + 3 staff sub-tiers = 11 principals).
4. Drive **real HTTP** through the matrix: happy path, then RBAC (every role
   against every module boundary), then IDOR pairs (user A vs user B), then
   contract, negative/edge, data integrity, injection, error handling.
5. Verify or refute each of F.1–F.12 by execution, and mark every result
   `[VERIFIED]` or `[STATIC]` — never blurred.

**Priority order** (highest risk first, per your scope note): auth → permissions
→ money writes (settlement, payouts, refunds, wallet) → attendance → messaging
and child-safety gates → everything else.

**Known coverage limits to declare up front:** 526 rows is more than one pass can
execute exhaustively. I will drive every *distinct gate pattern* and every money
and child-safety path, and sample the 203 uniform `requireRole(super_admin)`
rows rather than hit all of them individually — and I will state exactly which
rows were sampled rather than executed.

---

## ⏸️ Awaiting your confirmation before Phase 1

Two decisions I need from you:

1. **Disposable local Postgres — OK?** The repo's `.env.test` points at dev, so I
   cannot use the documented path without breaking your ground rule. My plan is a
   throwaway local DB. Alternative: you create a fresh Neon test branch and I
   point at that instead.
2. **Is `GET /api/v1/centers/[id]` public by design?** (F.1) That is a product
   call, not a code call — it changes whether F.1 is a finding or a non-issue.
