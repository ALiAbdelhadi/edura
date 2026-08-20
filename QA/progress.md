# QA Audit — Progress Log

_Survives context resets. Newest entries at the bottom of each section._

## Status: Phase 0 (Discover) — COMPLETE, awaiting user confirmation

- Owner: QA/Test Engineer (Claude)
- Target commit: `ac5e941` (branch `main`)
- Ground rule in force: **NEVER touch prod or dev DB.** Repo `.env.test` points at
  the **dev** Neon branch (`ep-patient-scene-as0gnsfy`, `EDURA_ALLOW_DB_ENVS=dev`),
  so the repo's own `test:db` suites mutate dev. Phase 1 must use a **disposable
  local Postgres** instead (docker + psql are available on this machine).

## Evidence-tag discipline

- `[VERIFIED]` = I actually executed it (HTTP request / test run) and saw the result.
- `[STATIC]`   = inferred from reading code only. No runtime confirmation.
- Nothing is blurred between the two. Un-executed = say so.

## Phase 0 work done

- [x] App/runtime topology mapped (4 apps: erp/www-app, superadmin, www-landing, realtime).
- [x] Role model extracted from `schema.prisma` (`Role` + `CenterStaffRole` enums).
- [x] Core authz primitives read: `requireRole` (both apps), `requireSession`,
      `center-actor.ts`, `teacher-actor` (via agents), `withErrors`, `withRateLimit`.
- [x] Full route inventory: **526 method+path rows across ~425 route files**
      (erp 219 files, superadmin 204, www 2, realtime = socket server).
      Superseded an earlier 424-row count that missed multi-method exports.
- [x] Per-route auth gate + allowed-roles resolved first-hand (see the
      2026-08-18 entry below for why the agent pass was discarded).
- [x] Run/seed/test procedure captured (see coverage map §D).
- [x] Coverage map `QA/00-coverage-map.md` written → **STOPPED for user confirm.**
- [x] Full inventory regenerated first-hand into `QA/raw/` (526 method+path rows).

## Candidate risk hotspots found during discovery (UNVERIFIED — for Phase 1/2)

These are recorded now so they are not lost. NONE are confirmed; each needs
runtime execution against the disposable test DB in Phase 1.

1. `[STATIC]` **GET /api/v1/centers/[id]** (erp) — fully unauthenticated, no rate
   limit; returns course prices, teacher names, per-course `enrolledCount`, and
   `totalStudents`. Needs a "public by design" ruling; leaks competitive counts.
2. `[STATIC]` **GET /api/v1/materials/[id]/download** (erp) — `getMaterialDownloadUrl`
   branches only student/parent/center_admin/teacher; **no default-deny** for
   assistant/center_staff/accountant. Possible broken access control (IDOR) on any
   material's signed URL. KEY OPEN QUESTION: does `scopedDb` RLS filter the
   `findUnique` for those roles? Phase 1 must settle this.
3. `[STATIC]` `getGrade` (grades.ts) — grade record metadata may leak to unrelated
   students/parents (scores filtered, grade row not).
4. `[STATIC]` `attendance/sync` bypasses the on-behalf-of audit choke point.
5. `[STATIC]` teacher blacklist POST — no student-relationship check (notification
   spam / harassment vector).
6. `[STATIC]` cash wallet top-up — no replay/idempotency guard noted (money path).
7. `[STATIC]` PATCH /api/v1/admin/users/[id]/permissions — mutates `users.status`
   via `updateUserStatus`, a second suspend path with no reason arg, duplicating
   PATCH .../status (`setUserSuspended`). Check whether it bumps token_version /
   revokes sessions like the canonical path (the "one suspension mechanism"
   invariant).
8. `[STATIC]` `center-actor.ts` capability-map docblock is STALE — external-teacher
   staff surface (incl. RECEPTION grade mutations + PII lookup), guardian-contact,
   bulk import, logo routes are opened via `centerStaff` but absent from the map.
   Doc drift, not necessarily a hole — verify each opened route's `allow`.

## Next actions

- Finalize `QA/00-coverage-map.md`; pause for user confirmation (per Phase 0 rules).
- Phase 1 prerequisite: stand up disposable local Postgres, label it
  `edura-env:test`, `prisma migrate deploy`, `seed --no-demo` + demo seed,
  point a scratch `.env` at it. Do NOT reuse repo `.env.test` (→ dev).

## 2026-08-18 — context/scratchpad loss + rebuild

The /private/tmp scratchpad was wiped overnight, destroying 7 completed agent
inventory reports. Two further agents (money, misc slices) died on a session
limit. **Lesson applied: all audit artifacts now live in the repo under `QA/`,
never in scratchpad.**

Rebuilt the inventory FIRST-HAND instead of re-spawning agents — cheaper, and
first-hand reading is better evidence for an audit than an agent summary.
`QA/raw/extract.py` makes it reproducible: re-run it after any route change.

Result: 526 method+path rows, gate resolved per row, 27 unauthenticated
endpoints identified. Candidate findings F.1-F.12 recorded in the coverage map.

Agent claims that WERE spot-verified against source before the loss (still
trustworthy, all confirmed accurate): superadmin impersonation/stop gate,
permissions-PATCH-mutates-status, finance routes gating accountant+super_admin,
centers/[id] unauthenticated, materials download missing default-deny.

---

# PHASE 1 — EXECUTION (in progress)

## 1.1 Disposable test DB — DONE [VERIFIED]

User approved local Postgres (2026-08-18). Setup, fully isolated from the user's
own clusters and services:

- Throwaway PG 17.10 cluster at `/Users/ali/.edura-qa-pg`, **port 55432**,
  `listen_addresses=localhost`, `fsync=off`. Not a brew service; nothing of the
  user's was touched. Docker was not running, so no container was used.
- DB `neondb`, labelled **`edura-env:test`** (db-guard: *"target database is
  labelled 'test'"*). Role `edura_app` with **NOBYPASSRLS**, mirroring prod.
- Bootstrap order per CLAUDE.md: `label` → `bootstrap-app-role` → `migrate
  deploy` (52 migrations) → `seed` → `verify-db`.
- **verify-db: ALL 27 CHECKS PASSED** — 79 tables, 6 sequences, 38 RLS tables,
  59 policies, 52 migrations, append-only revokes intact.
- Env at `QA/.env.qa` (gitignored). All three URLs verified to resolve to
  `localhost:55432` **before** any write — no Neon host was ever in scope.
- `DATABASE_DRIVER=pg` makes the app's own adapter use node-postgres, so the
  application runs against local PG unmodified.

### Two setup lessons worth keeping

1. `bootstrap-app-role` **refuses to run on a populated DB** — it would re-GRANT
   UPDATE/DELETE that migration `00000000000003` revokes on
   transactions/points_ledger/audit_logs, silently breaking the append-only
   ledger. I hit this by running it after `migrate deploy`; the script caught me.
   Good design, and the documented order exists for exactly this reason.
2. **Timezone matters.** The cluster defaulted to `Africa/Cairo` (+03) while Neon
   runs UTC. That 3-hour skew alone failed 6 token-expiry assertions across two
   suites. After `timezone=UTC`, both suites went green
   (guardian-verification 51/51, invite-claim 107/107). Any future local DB must
   be UTC.

## 1.2 The existing suites cannot run against a non-Neon Postgres [VERIFIED]

All 62 DB proof suites hardcode `import { Pool } from "@neondatabase/serverless"`
for their admin fixtures, and `@prisma/adapter-neon` needs `types` from the same
package. Against local PG they die with `NeonWebSocketError … ECONNREFUSED`.

Combined with "there is no test DB", the shipped state is: **these 62 suites can
only run against the dev database.** Recorded as a finding.

To execute them I installed a contained shim mapping `@neondatabase/serverless`
onto `pg` (`QA/shim/`), with **`QA/shim/restore.sh` to undo it**. Only the
transport changes — SQL and business logic are untouched. Anything Neon-transport
specific (the WS-drop retry proofs) is therefore NOT covered by my run.

> ⚠️ RESTORE THE SHIM BEFORE ANY REAL WORK: `bash QA/shim/restore.sh`

## 1.3 Baseline suite run — DONE [VERIFIED]

| Suite | Result |
|---|---|
| erp DB proofs | 40 suites — **1428 assertions passed, 7 failed** (5 suites) |
| superadmin DB proofs | 23 suites — **794 assertions passed, 2 failed** (2 suites) |
| **Total** | **2222 assertions passing** |

Logs: `QA/raw/erp-db-suites-utc.log`, `QA/raw/sa-db-suites.log`.

### Every failure triaged — 8 of 9 are environment artifacts, 1 is real

| Failure | Verdict |
|---|---|
| `c01`: "all 3 CHECKs … validated (2/3)" | **REAL** — see below |
| `c04` ×2: typed ACCOUNT_INACTIVE | **Artifact.** Disproved by direct probe: suspended+correct pw → `403 ACCOUNT_INACTIVE`, suspended+wrong pw → `401` generic. Exactly as asserted. In-suite failure is rate-limiter bleed from the C2 burst tests earlier in the same process. Security behaviour is CORRECT. |
| `tx-retry-boundary` ×2 | **Artifact.** Proves Neon WebSocket drop/retry; my shim removes the WS transport, so the drop cannot be simulated. |
| `catalog-onboarding` | **Artifact-ish / pre-existing.** `cacheTag() is only available with the cacheComponents config` — fails outside a Next runtime, would fail on Neon too. This suite is not really executable standalone → CI signal gap. |
| `h03-seed-uuid-flows`: `pl: 15 -> 9` | **Artifact.** Cumulative fixture residue; the delta grew run to run (14→8, then 15→9), i.e. the suite leaks a parent-link row per run. Test hygiene, not product. |
| `c02-payout-generation` | **Artifact.** A *performance-ceiling* assertion — the "pre-fix" slow path runs in 39 ms on a local unix-socket DB with fsync off, so "must exceed the 20 000 ms ceiling" cannot reproduce. |
| `center-share-admin`: "settlement used the SUPERADMIN share (got undefined)" | **Test/impl drift, Low.** Money is CORRECT (center +2300 = 2500 share − 200 fee, teacher +17300, 3 ledger rows). `completeSession` returns `{distributed, presentCount, perSessionPrice, teacherNetTotal, centerNetTotal, platformEarned}` — no `distribution.centerShare` at the asserted path. No production caller reads that field. |

### 🔴 REAL FINDING from the baseline — H2 wallet floor CHECK is NOT VALIDATED on a fresh environment [VERIFIED]

```
SELECT conname, convalidated FROM pg_constraint WHERE conname='centers_wallet_balance_nonneg';
 centers_wallet_balance_nonneg | f
```

Every other `*_nonneg` CHECK is `t`; only this one is `f`. And **`verify-db`
still reported ALL 27 CHECKS PASSED** — it does not assert `convalidated` for
this constraint, and the documented bootstrap order
(`label → bootstrap-app-role → migrate deploy → seed → verify-db`) has **no
VALIDATE step**. So a newly bootstrapped environment can look fully green while
the money floor is only partially enforced.

Mitigating: `NOT VALID` still enforces on every INSERT/UPDATE — only pre-existing
rows go unchecked, and a fresh DB has none. CLAUDE.md records production's copy
as VALIDATED (2026-07-31), so **production is believed fine** — the gap is in the
bootstrap procedure + the verifier, which is what the next environment will use.

## Next

- HTTP-level RBAC/IDOR/contract execution against booted apps (the core of Phase 1).

## 1.4 HTTP execution — DONE [VERIFIED]

Could not run a second `next dev` in `apps/erp` (the user's own dev server, PID
5602, holds that directory on :3002). **Did not kill it.** Built the app and ran
`next start` in PRODUCTION mode on **:3102** instead — more faithful for a launch
audit anyway (generic errors, prod secret gates). One read-only GET /api/health
reached the user's server before I noticed the port clash; no writes.

- 8 principals logged in over real HTTP (all 6 erp roles + receptionist,
  manager, center_accountant staff tiers). Cookie jars in `QA/raw/jars/`.
- RBAC matrix: 21 endpoints × 9 principals = 189 probes → `QA/raw/rbac-probe.sh`.
- Security battery: SQL injection ×5, malformed/oversized input, invalid UUID,
  error-body inspection, rate limiting, XFF rotation, device-token hijack,
  app-partition boundary, suspension→revocation end-to-end.

### Findings confirmed by execution

| ID | Severity | Status |
|---|---|---|
| H-1 materials download cross-tenant IDOR | HIGH | **CONFIRMED** — staff (3 tiers) + assistant get 200 on another center's material; list endpoint is correctly scoped, only by-ID download leaks |
| M-1 rate-limit bypass via XFF rotation + no per-account lockout | MEDIUM | **CONFIRMED** — 20 failed logins, 0×429 |
| M-2 device-token ownership hijack | MEDIUM | **CONFIRMED** — owner silently flips |
| L-1 wallet CHECK not validated on fresh bootstrap | LOW | **CONFIRMED** — verify-db green anyway |
| L-3 duplicate suspension path | LOW | **DOWNGRADED** — not a security hole; DB trigger revokes on any status change (1→0 sessions, 200→401) |
| F.1 centers/[id] public | — | **CLOSED** by user ruling (public by design) |
| F.2 parent branch on materials | — | **FALSE POSITIVE** — that parent's child really is enrolled |

### Verified-safe (attacked, held)

SQL injection (5 vectors, 30 users intact) · payments IDOR via `?studentId=`
· cross-tenant material LISTING · back-office→erp login partition · session
revocation on suspend · staff tier inheritance + hard exclusions · assistant
blocked from teacher wallet/assistants · no stack traces in prod · health
endpoint minimal · malformed input 400/401 with no 500s.

## Phase 2 report — WRITTEN

`QA/01-findings.md` — severities, repros, root causes, fixes, the executed RBAC
matrix, payment-gateway hook points, launch verdict, and an explicit
"what I did NOT test" section.

**Verdict: not launch-ready until H-1 is fixed** (one `else` clause + regression
test). M-1/M-2 fix-or-accept. Everything else non-blocking.

## ⚠️ TEARDOWN OWED

1. `bash QA/shim/restore.sh` — REQUIRED, restores `@neondatabase/serverless`.
2. `pg_ctl -D /Users/ali/.edura-qa-pg/data stop && rm -rf /Users/ali/.edura-qa-pg`
3. Kill the QA app server on :3102 (NOT the user's dev server on :3002).

---

# PHASE 3 — FIX (H-1) — DONE [VERIFIED]

## Scope grew during the fix

Investigating H-1 revealed a **second, larger instance of the same bug**:
`GET /api/v1/materials` (list) had the identical missing-`else`, so every
center_staff tier saw **all 4 materials across 3 centers** — enumeration, no
UUID needed. Phase 1 had called the list "correctly scoped"; that was wrong,
based on an assistant seeing `[]` (coincidence — their teacher owns no
materials). `QA/01-findings.md` now carries the correction explicitly rather
than quietly restating.

## Root cause (exact)

`scopedDb` (`packages/server-core/src/db/scope.ts:24`) applies `withTenant()`
(RLS) **only** for `center_admin` with a centerId. Every other role runs under
`withPlatformContext` — RLS bypassed. So in `materials.ts` the `if/else if`
chain WAS the only protection, and it had no final `else`.

## Changes (3 files)

1. `apps/erp/src/lib/services/materials/materials.ts` — default-deny `else` on
   **both** `listMaterials` and `getMaterialDownloadUrl`.
2. `apps/erp/src/app/api/v1/materials/[id]/download/route.ts` — added
   `toActingUser(...)`, which the sibling list route already had and this route
   was missing. Assistants act as their teacher, so **delegation is preserved,
   not removed**.
3. `apps/erp/tests/db/materials-access.test.ts` — NEW regression suite, 12
   assertions, written in the project's existing suite style (tag + sweep +
   `assertDbEnv` + `runGuarded`).

center_staff → 403 (rather than own-centre scoping) is deliberate: the
`center-actor.ts` CAPABILITY MAP grants staff no materials capability and no
staff-facing materials screen exists (teacher/assistant/student only).

## Verification

- New suite **12/12 pass**; with the fix reverted it fails **4/12** — and
  exactly the 4 leak assertions, the other 8 still passing. A regression test
  that cannot fail is worthless, so this was checked explicitly.
- Full erp suite after fix: **41 suites, 1440 assertions passed, 7 failed** —
  1428 baseline + 12 new, and the *same 5* pre-existing artifact suites.
  No regression. `center-staff-delegation` still passes.
- `tsc --noEmit` clean.
- Rebuilt + re-ran the original HTTP attack: staff ×3 and assistant now **403**
  on both own- and other-centre materials; list returns `403 forbidden` for
  staff. center_admin/teacher/student unchanged.
- Proved delegation intact over HTTP with a purpose-made fixture: an assistant
  fetching **its own teacher's** material still gets **200**, while
  staff_manager gets 403 on the same id. Fixture deleted afterwards.

## Note: the Neon shim was wiped mid-phase

Something reinstalled node_modules (the shim and its `.qa-backup` files
vanished), which made 32 suites fail with `NeonWebSocketError` — nothing to do
with the code change. Verified the real package is intact (147 KB genuine
bundle), re-applied the shim, and re-ran clean. **Teardown still owed.**

## ⚠️ TEARDOWN STILL OWED

1. `bash QA/shim/restore.sh` — REQUIRED (shim is currently RE-APPLIED).
2. `pg_ctl -D /Users/ali/.edura-qa-pg/data stop && rm -rf /Users/ali/.edura-qa-pg`
3. Kill the QA server on :3102 (NOT the user's dev server on :3002).

## Next candidates (not started)

M-2 (device-token hijack) is the smallest remaining fix. M-1 needs a product/infra
decision on `TRUSTED_PROXY_HOPS` + a per-account lockout.

---

# PHASE 3 — FIX (M-2) — DONE [VERIFIED]

## Confirmed the sibling shared the bug

`POST /api/v1/me/push-subscription` had the identical `upsert`-on-unique shape
AND rewrote the channel's `p256dh`/`auth` encryption keys. Phase 1 flagged it
`[STATIC], not tested`; it is now confirmed and fixed by the same change.

Useful context found while fixing: **both DELETE routes were already
ownership-scoped** (`where: { token/endpoint, userId: user.id }`), and neither
credential is returned by any API. So the POSTs were the lone outlier — an
oversight, not a design — and exploitation needs an out-of-band leak.

## Changes (4 files)

1. NEW `apps/erp/src/lib/services/notifications/push-registration.ts` — the
   ownership rule in ONE place for both channels:
   same owner → scoped `updateMany` in place; anyone else → delete + create.
2. `apps/erp/src/app/api/v1/me/device-tokens/route.ts` — thin wrapper.
3. `apps/erp/src/app/api/v1/me/push-subscription/route.ts` — thin wrapper.
4. NEW `apps/erp/tests/db/push-registration-ownership.test.ts` — 16 assertions.

## A test-quality correction I made on myself

The first draft of the regression suite **re-implemented** the three statements
inline instead of importing the route's logic, so it would have kept passing had
the route regressed — regression-test theatre. That is why the ownership rule was
extracted into a service: the suite now imports the SHIPPED function. Confirmed
it fails 2/16 against the old `upsert` implementation.

## Deliberate residual (product call, NOT silently made)

Cross-account transfer is still ALLOWED — a shared family phone or resold handset
genuinely changes hands, and refusing would strand those users in this market.
So the notification-DoS vector is reduced, not eliminated: what is gone is the
silent repoint leaving the previous owner's row/keys attached to another account.
Refusing transfers outright is a one-line change in the service; flagged to Ali
rather than decided unilaterally.

## Verification

- New suite 16/16; fails 2/16 against the vulnerable implementation.
- Full erp suite: **42 suites, 1453 assertions passed**, same 5 pre-existing
  artifact suites. `tsc --noEmit` clean.
- HTTP against a rebuilt production-mode server: same-owner re-register keeps the
  SAME row id (d98f2786) with platform updated; a different account produces a
  NEW row id (b1f25205); exactly 1 row per token throughout. Fixture cleaned.

## New INFO finding recorded

**I-4** — `c04-login-parity.test.ts` is flaky (2–5 failed assertions run-to-run,
always rate-limiter/door family) because its own C2 burst tests saturate the
in-memory limiter that later assertions depend on. Behaviour is correct (proven
by direct probe); the SUITE is the unreliable part.

## ✅ TEARDOWN — DONE 2026-08-18 [VERIFIED]

1. **Neon shim restored.** `QA/shim/restore.sh` run; 0 `QA AUDIT SHIM` markers
   left, both files back to the genuine 147 KB bundle with the correct
   `@ts-self-types` header. `tsc --noEmit` passes afterwards, proving
   node_modules is healthy.
2. **QA app server killed** (PID 13732 on :3102). **The user's own dev server
   (PID 5602 on :3002) was verified still listening afterwards** — it was never
   touched at any point.
3. **Disposable cluster stopped and deleted** — `pg_ctl stop -m fast` on the
   port-55432 cluster (confirmed by reading its `postgresql.conf` before
   acting), then `rm -rf /Users/ali/.edura-qa-pg` (73 MB). Port 55432 now
   refuses connections. The user's own `postgresql@17` / `postgresql@18` brew
   services remain `none`, exactly as before — they were never started.
4. **Secrets and session state removed** — `QA/.env.qa` (gitignored, throwaway
   local creds) and `QA/raw/jars/` (session cookies) deleted, plus the /tmp
   scratch files.

Left in place deliberately: the `.gitignore` entry for `QA/.env.qa` (inert, and
correct if anyone recreates a local QA env), and `QA/shim/` — which is the
working proof for finding L-2 that the suites CAN be decoupled from the Neon
driver.

## Remaining open

M-1 (XFF rate-limit bypass + no per-account lockout) — needs a deployment
decision on `TRUSTED_PROXY_HOPS`. L-1..L-5, I-1..I-4 non-blocking.

---

# PHASE 1 (cont.) — SUPERADMIN HTTP PASS — DONE 2026-08-18 [VERIFIED]

Environment rebuilt from scratch (teardown had removed it). **No shim needed
this time** — an HTTP pass does not touch the DB test suites, so node_modules was
never modified. Cluster created UTC-first; verify-db 27/27. superadmin built and
started in production mode on **:3104** (own port, isolated from the user's
:3002 dev server, which was again never touched).

## Results

- **36 endpoints × 3 principals.** `accountant` is refused on EVERY probed
  `/api/v1/admin/**` route — 15 reads and 10 writes — 403 across the board.
  The "finance screens only, enforced at the API layer" claim is now measured.
- **super_admin short-circuit confirmed live**: passes `requireRole("accountant",…)`
  finance routes without being named.
- **Impersonation is sound**: cannot target self, another super_admin, or any www
  role; the impersonated session LOSES the admin surface (403) while keeping
  finance (200); stop restores identity; start+stop both audited.
- **DB money protection**: `transactions`/`points_ledger`/`audit_logs` are
  permission-denied for UPDATE/DELETE even as the app role; `payments`/
  `wallet_ledger` are CRUD — which is exactly what verify-db declares, so design
  rather than gap.
- **Cross-app partition verified in the second direction**: erp-role credentials
  (correct passwords) are refused at the superadmin door with a generic message.
- Injection safe on `/admin/users` and `/search`; 18 users intact.

## Findings

- **L-6 (new)** `POST /admin/impersonation/stop` returns **500** for a client
  error — better-auth raises `APIError` 400 ("You are not impersonating anyone"),
  the route does not catch it, `withErrors` falls through to the generic 500 and
  logs `[unhandled]`. No leakage. **This RESOLVES F.8: the gate is real, not a
  silent no-op** — only the error mapping is wrong.
- **L-7 (new, was F.9 [STATIC])** `DELETE /admin/students/[id]/unlink-parent`
  ignores the path student id — CONFIRMED: revoked a link belonging to a
  *different* student and wrote an audit row whose URL names the wrong child.
  Audit-accuracy + child-safety adjacency (parent links feed the guardian gate).

## ⚠️ CORRECTION TO M-1 — I had over-generalised it

Phase 1 said "login brute-force protection is bypassable, no per-account
lockout". That generalised from the ONE door I had tested. Re-measured:

| Door | Limiter | Survives XFF rotation? |
|---|---|---|
| erp `POST /api/v1/auth/login` (custom REST) | `withRateLimit`, key `pathname:ip` | **No — bypassable** |
| `POST /api/auth/sign-in/email` (better-auth) | **per-account** | **Yes — holds** |

Proven: 20 rotating-IP failures all 429; the correct password also 429 while the
account stayed throttled; a DIFFERENT account signed in fine from a fresh IP at
the same moment (so per-account, not door-wide). **superadmin has no custom REST
login door at all**, so the back office is not exposed. M-1 is real but confined
to erp's legacy REST door — narrower than reported.

## Teardown owed again

1. Kill superadmin server on :3104 (NOT the user's :3002).
2. `pg_ctl -D /Users/ali/.edura-qa-pg/data stop && rm -rf /Users/ali/.edura-qa-pg`
3. `rm -f QA/.env.qa QA/raw/jars/*` — no shim to restore this time.

---

# PHASE 3 — FIX (L-6, L-7) — DONE 2026-08-18 [VERIFIED]

## L-6 — impersonation/stop served a client error as 500

`apps/superadmin/src/app/api/v1/admin/impersonation/stop/route.ts` — catch
better-auth's typed `APIError` (statusCode 400, "You are not impersonating
anyone") and re-throw `ValidationError`, mirroring the erp login route. Our own
message, not better-auth's, so no library internals reach the client; non-APIError
failures still become 500.

Verified over HTTP: `500 {"code":"internal"}` -> **`400`
`{"code":"validation_error","message":"No impersonation is active for this
session"}`**, and `[unhandled]` log entries went 1-per-call -> **0**. The real
happy path still works: impersonate -> role `accountant` -> stop -> 200 ->
restored to `super_admin`.

## L-7 — unlink-parent ignored the path student id

`unlinkParent(linkId, studentId, adminId)` now asserts
`link.studentId === studentId`; the route passes the path id instead of awaiting
and discarding it. Mismatch returns **404 not 403** — from that student's
position the link does not exist, and 404 avoids confirming another student's
link exists.

Verified over HTTP: wrong student + valid linkId went `200` + revoked + audit row
-> **404, link untouched, no audit row**. Correct student still 200 + revoked.

NEW suite `apps/superadmin/tests/db/unlink-parent-scope.test.ts` — 7 assertions,
fails 3/7 with the guard removed. It needs NO shim (it uses `withPlatformContext`,
not the Neon `Pool` directly).

**Noted, deliberately NOT fixed:** `revokedBy` is the `link_actor` enum with only
`parent`/`student`, so an admin revocation is still recorded as `parent`.
Widening it is a migration requiring an approved plan; `audit_logs` is the
accurate record of who acted.

## Verification

- superadmin full suite: **24 suites, 801 assertions passed** (794 baseline + 7
  new), same 2 pre-existing artifact suites (c02 perf ceiling, center-share-admin
  drift). No regression. `tsc --noEmit` clean.
- Shim was applied ONLY for that full-suite run and restored immediately
  afterwards (verified: 0 markers, 147 KB genuine files).

## Cumulative fix status

| ID | Severity | Status |
|---|---|---|
| H-1 materials cross-tenant (download + list) | HIGH | ✅ fixed + 12-assertion suite |
| M-2 push registration ownership (both channels) | MEDIUM | ✅ fixed + 16-assertion suite |
| L-6 impersonation/stop 500 | LOW | ✅ fixed + HTTP proof |
| L-7 unlink-parent path id | LOW | ✅ fixed + 7-assertion suite |
| M-1 erp REST door XFF bypass | MEDIUM | OPEN — needs a deployment decision |
| L-1,2,4,5 + I-1..I-4 | LOW/INFO | OPEN, non-blocking |

## ✅ TEARDOWN — DONE 2026-08-18 (second and final) [VERIFIED]

1. **Shim: already clean before teardown began** — 0 markers, genuine 147 KB
   files, 0 leftover `.qa-backup` files. It had been restored immediately after
   the one full-suite run that needed it.
2. **Superadmin QA server killed** (PID 23134 on :3104); :3102 already empty
   from the previous round. **The user's dev server (PID 5602 on :3002) verified
   still listening** — never touched across the whole audit.
3. **Cluster stopped and deleted** — port confirmed as 55432 by reading its own
   `postgresql.conf` first, then `pg_ctl stop -m fast` and
   `rm -rf /Users/ali/.edura-qa-pg` (71 MB). Port now refuses connections. The
   user's `postgresql@17`/`@18` brew services remain `none` — never started.
4. **Secrets/session state removed** — `QA/.env.qa`, `QA/raw/jars/`, /tmp scratch.
5. **Final health check: `tsc --noEmit` passes in BOTH apps**, confirming
   node_modules and all source edits are consistent.

No QA process or port remains. Everything left in the repo is deliberate work
product: the four source fixes, three regression suites, and the QA/ docs.

---

# PHASE 3 — RETIRE THE erp REST LOGIN DOOR (M-1) — DONE 2026-08-18 [VERIFIED]

Ali asked for retirement rather than a fix. Mapped every dependent BEFORE
deleting anything, and the door was deader than its own comment claimed: that
comment said "callers (E2E, tooling)", but the Playwright E2E suite drives the
real login form and NO application code called it. Real dependents were 4 test
files, 2 generated tooling artifacts, and a runbook recipe.

## Changes

- **deleted** `apps/erp/src/app/api/v1/auth/login/route.ts`
- `tests/db/c04-login-parity.test.ts` — REST half removed (13 call sites), suite
  reframed: it was a PARITY proof between two doors; with one door left, what
  survives is the C-04 partition + the hardening (H5, L1, C-03, invite door)
  proved behaviourally against the live DB. Docblock now states this history
  explicitly rather than pretending nothing changed.
- `tests/unit/route-auth-doors.test.ts` — REST describe-block removed
- `tests/unit/c04-login-allowlist.test.ts` — REST_DOOR structural assertions removed
- `tests/unit/route-conventions.test.ts` — route entry removed
- `scripts/api-smoke.sh` + `scripts/gen-bruno.mjs` — repointed at
  `/api/auth/sign-in/email`; Bruno collection regenerated (219 → 218 route files)
- `docs/guides/runbook.md` — curl recipe + login-flow line repointed
- `packages/server-core/src/auth/login-policy.ts` — docblock: three doors → two

## Verification [VERIFIED]

Live HTTP against a rebuilt production-mode server:
- `POST /api/v1/auth/login` -> **404**
- `POST /api/auth/sign-in/email` -> **200**; its session then authenticates
  `/api/v1/me` and `/api/v1/centers/me` (200, 200)
- `/api/v1/auth/register/student` and `/auth/password/forgot` -> 400 (validation),
  NOT 404 — the other 7 `/api/v1/auth/*` routes are untouched
- production build succeeds, route absent from the manifest

Suites: `c04-login-parity` **48/48**, stable over THREE consecutive runs.
erp unit: 75 files / 1172 passed / 1 skipped. `tsc --noEmit` clean (source; the
only errors were stale `.next` type artifacts, cleared by the rebuild).

## Side effect: I-4 is fixed

The c04 flakiness (2–5 failing assertions run-to-run) came from that suite's own
per-IP burst test saturating the shared in-memory limiter for everything after
it. That test belonged to the retired door and went with it. Three clean runs.

## Environment note (NOT caused by this change)

This rebuild's `preview-seed.ts` FAILED with
`Invalid tx.review.upsert(): Unknown argument studentId_teacherId` — a
pre-existing bug in the demo seed. With those fixtures missing, `c01-lesson-
settlement` and `h03-seed-uuid-flows` crash ("Missing seeded fixtures"), and
`profile-images` fails 2 Cloudinary-dependent assertions. None touch auth.
Worth its own look: the documented "populate a preview" path is broken.

## Cumulative status

| ID | Severity | Status |
|---|---|---|
| H-1 materials cross-tenant | HIGH | ✅ fixed + suite |
| M-1 REST door XFF bypass | MEDIUM | ✅ **door retired** |
| M-2 push registration ownership | MEDIUM | ✅ fixed + suite |
| L-6 impersonation/stop 500 | LOW | ✅ fixed |
| L-7 unlink-parent path id | LOW | ✅ fixed + suite |
| I-4 c04 flakiness | INFO | ✅ resolved by the retirement |
| L-1, L-2, L-4, L-5, I-1..I-3 | LOW/INFO | open, non-blocking |

**Every Critical/High/Medium finding from this audit is now closed.**

## ✅ TEARDOWN — DONE 2026-08-18 (final)

Shim verified clean BEFORE teardown (0 markers, genuine 147 KB files); QA server
on :3102 killed and the user's own dev server confirmed still listening (its PID
had changed from 5602 to 28944 — the user restarted it mid-session; untouched
either way). Cluster stopped after confirming port 55432 from its own config,
then removed. `QA/.env.qa`, cookie jars and /tmp scratch deleted. The user's
`postgresql@17`/`@18` brew services remain `none`.

---

# PHASE 3 — FIX preview-seed (I-5) — DONE 2026-08-18 [VERIFIED]

## Root cause — a stale call site, not a typo

`Review` deliberately no longer has `@@unique([studentId, teacherId])`. Migration
`20260818120000_review_per_lesson_unique` replaced it with two PARTIAL unique
indexes (overall-per-teacher WHERE lesson_id IS NULL; one-per-lesson WHERE
lesson_id IS NOT NULL), because a plain compound unique made the documented
`lessonId` column unusable. Prisma cannot express a `WHERE` on a unique index, so
`studentId_teacherId` ceased to exist as a generated key — and preview-seed's
`review.upsert` still referenced it. The whole seed is ONE transaction, so that
single call site destroyed every fixture it creates.

**The migration is dated today and the DB now carries 53 migrations where
CLAUDE.md records 52** — this regression landed during this session from sibling
work, and nothing caught it because **no CI job runs the demo seeds**.

## Fix

`packages/database/prisma/preview-seed.ts` — replace the upsert with the pattern
`services/reviews/reviews.ts` already uses for the same constraint:
`findFirst({ studentId, teacherId, lessonId: null })` then update-or-create.
Swept the repo for other `studentId_teacherId` / `review.upsert` call sites —
this was the only one.

## Verification [VERIFIED]

- preview-seed completes: 4 centers / 5 teachers / 5 students / 5 courses / 7 sessions
- **idempotent across three consecutive runs** (reviews stays 1, users stays 18) —
  idempotency was the whole point of the original upsert, so it had to survive
- the DB constraints behave as the migration intended: a duplicate OVERALL review
  is refused by `reviews_one_overall_per_teacher`, while a PER-LESSON review for
  the same student+teacher is allowed
- suites unblocked by restored fixtures: `profile-images` now PASSES (was 2
  failures), `c01` and `h03` now RUN instead of crashing
- erp DB suites: **44 suites, 1407 assertions passed** (up from 1371 with the seed
  broken); remaining failures are the known artifacts only

## Worth raising separately — and CORRECTED

I first wrote "no CI job runs the demo seeds". WRONG, and the truth is worse:
`ci.yml`'s `db` job DOES run all four seeds, but the whole job is gated on
`secrets.TEST_DATABASE_URL` / `TEST_ADMIN_URL`, which are not set. The seed step
has therefore never executed on a PR. A guard that cannot run is not a guard.

## ✅ TEARDOWN — DONE 2026-08-18 (after the seed fix)

Shim clean (0 markers, 147 KB genuine, 0 backups); no QA port listening; the
user's dev server (PID 28944 on :3002) still up and untouched; cluster stopped
after confirming port 55432 from its own config, then removed; `QA/.env.qa`,
jars and /tmp scratch deleted; brew services still `none`.


---

# PHASE 3 — CI SEED GUARD — DONE 2026-08-18 [VERIFIED]

## What was actually wrong

`ci.yml` already had a seed step (in the `db` job) — it just never ran, because
that job is gated on `TEST_DATABASE_URL` / `TEST_ADMIN_URL` and those secrets are
unset. So the fix is not "add a seed step" but "add one that does not depend on
secrets".

## Added

**`seeds` job** in `.github/workflows/ci.yml` (+ `.github/scripts/db-census.sh`):

- **no secrets** -> runs on every PR including forks;
- **own Postgres 17 service container** -> cannot reach dev or production;
- `DATABASE_DRIVER: pg` at job level, overriding the repo-wide `ws` default
  (a plain container cannot answer Neon's WebSocket protocol);
- real bootstrap order: label -> `bootstrap-app-role` -> `migrate deploy`, which
  also exercises the guard refusing to grant on a populated schema;
- BOTH paths: `seed --no-demo` (production bootstrap) and all four demo seeds;
- the whole set AGAIN, then an exact 80-table census diff -> idempotence is
  asserted with no magic numbers, so adding a fixture stays green while a
  duplicating seed names its own table;
- read-only `verify-db` last.

## Why a census instead of row-count ceilings

My first draft used ceilings (`reviews <= 5`, `centers <= 10`, `users <= 60`).
Measured reality: reviews=1, centers=8, users=48 — so a review DOUBLING to 2
would have slipped straight through a ceiling of 5. Exact before/after census is
strictly better and needs no maintenance.

## Verification [VERIFIED]

Executed the job's exact command sequence locally against a throwaway cluster:
- bootstrap -> migrate -> `--no-demo` -> 4 demo seeds -> second pass -> verify-db
  **27/27**; census **byte-identical** across passes (80 tables), and a third
  pass also added nothing;
- `.github/scripts/db-census.sh` works standalone exactly as CI invokes it;
- **decisive:** with the `review.upsert` bug reinstated, the seed step **exits 1**
  with `Unknown argument studentId_teacherId` — the job catches the very
  regression it was written for;
- YAML parses; `seeds` job has 14 steps, no secret gate.

## A slip worth recording

Restoring the reverted file used a path relative to `packages/database` while the
shell was already in that directory, so the `cp` silently failed and the BUG was
briefly left in the working tree. Caught it by re-grepping the file rather than
trusting the command's apparent success. Fixed with an absolute path and
re-verified (0 revert markers, seed runs green, census unchanged).

## TEARDOWN — DONE (final)

Cluster stopped and `/Users/ali/.edura-qa-pg` removed (53 MB); port 55432 refuses
connections. Shim verified clean BEFORE teardown (0 markers, genuine 147 KB
files). `QA/.env.qa`, cookie jars and /tmp scratch gone. The user's brew
`postgresql@17`/`@18` remain `none` — never started; their dev server on :3002 was
never touched.

---

# PHASE 3 — FIX L-1 + L-2 — DONE 2026-08-18 [VERIFIED]

## L-1 — wallet CHECK never validated on a fresh environment

The `VALIDATE CONSTRAINT` in `20260720160000_wallet_nonneg_check` turned out to
be **inside a comment** — a manual follow-up for after the Step 9 wipe removed
the legacy -2600 row. Dev and production had it run by hand; nothing automated
it, so every fresh environment inherited NOT VALID, and verify-db only ever
asked whether constraints EXIST.

Fixed both halves:
- migration `20260818130000_validate_centers_wallet_check`, guarded by
  `IF EXISTS (... AND NOT convalidated)` so it no-ops where the manual step
  already ran and does not pay for a second scan under SHARE UPDATE EXCLUSIVE;
- `verify-db` now asserts EVERY public CHECK is `convalidated` and names any
  offender as `table.constraint`. `expected-db-shape.json` 53 -> 54.

Verified on a fresh DB: `convalidated=t`, verify-db **28/28**; forcing it back
to NOT VALID yields `1 of 28 CHECKS FAILED — NOT VALID:
centers.centers_wallet_balance_nonneg`.

**Independent confirmation it was real, not a test artifact:**
`c01-lesson-settlement` asserts "all 3 CHECKs remain present and validated" and
had been failing 2/3 on every fresh environment. It now passes **36/0** with no
change to the suite.

## L-2 — the suites could only ever run against Neon

New `packages/database/scripts/test-pool.ts` — `testPool()`, the same
`DATABASE_DRIVER` switch `createAdapter()` already uses, with `pinSslMode`
applied on both branches so flipping the driver cannot change the TLS we get.
`TestPool` is typed as node-postgres' `Pool`, the surface the suites already
coded against, so no other line in them changed.

49 of 50 suites rewritten by codemod. The 50th, `tx-retry-boundary.test.ts`,
keeps its own Neon pool because its SUBJECT is the Neon driver — it now SKIPS
loudly under `DATABASE_DRIVER=pg` instead of reporting "body ran 1x, expected 2"
(which reads as a money-safety regression when nothing is wrong). The skip is
narrow and named: on the real target it still runs and can still fail.

Default unchanged: with `DATABASE_DRIVER` unset the Neon driver is used exactly
as before.

Verified with the GENUINE neon package installed and zero node_modules patching:
- erp **44 suites / 1446 assertions passed**, 2 failing (both pre-existing:
  catalog-onboarding cacheTag, h03 fixture residue)
- superadmin **24 suites / 801 assertions passed**, same 2 known artifacts
- both apps `tsc --noEmit` clean

The shim is no longer needed by anything. `QA/shim/` stays only as the record of
how this was originally proven.

## Two pre-existing problems found while verifying — NOT mine, NOT fixed

1. **`packages/database` does not typecheck.** Three demo seeds call
   `assertNotProduction()` with no argument while the signature is
   `assertNotProduction(intent: string)`:
   `prisma/settled-lessons-demo-seed.ts:102`,
   `prisma/showcase-live-demo-seed.ts:107`,
   `prisma/showcase-payments-demo-seed.ts:79`.
   Every other caller passes a name. One word each to fix; left alone because it
   is outside L-1/L-2 and is the user's call.
2. **erp i18n parity is red** — `tests/unit/i18n-parity.test.ts` fails 2 tests
   over 9 missing `gapDetail_*` keys in
   `features/admin/external-teacher-gaps-screen.tsx`. That file and the message
   catalogues were already `M` in git status at session start, i.e. sibling
   work-in-progress. Earlier in this session the erp unit run was fully green
   (1172 passed), so this appeared after a concurrent edit. Not mine — none of
   my files reference those keys.

---

# assertNotProduction typecheck errors — FIXED 2026-08-18 [VERIFIED]

Three demo seeds called `assertNotProduction()` with no argument against
`assertNotProduction(intent: string)`. 15 of the 18 call sites already pass the
file's own basename, so the convention was unambiguous:

- `prisma/settled-lessons-demo-seed.ts:102`
- `prisma/showcase-live-demo-seed.ts:107`
- `prisma/showcase-payments-demo-seed.ts:79`

`intent` is not decoration — db-guard echoes it in the refusal message so it
names what was about to run, so these three would also have produced an
anonymous refusal.

**Verified:** `packages/database` typechecks clean, and `bun run check-types`
across the repo is **9/9 successful** — the whole monorepo is now type-clean.

## What running them revealed — NEW FINDING L-8

These are not pure DB seeds. They sign in to a running app and drive it over
HTTP: `POST /api/v1/sessions/{id}/complete` (THE SETTLEMENT TRIGGER) and
`POST /api/v1/center/subscriptions`. `BASE_URL` is
`process.env.ERP_BASE_URL ?? "http://localhost:3002"`.

So `assertNotProduction()` guards the DB connection while the writes go over
HTTP to an unrelated target — the same class of hole the repo already closed
once (see the historical note in `run-db-suites.ts` about the removed `_*.ts`
probe scripts). Recorded as L-8 with a suggested fix: require `ERP_BASE_URL`
and have the seed check `{BASE_URL}/api/health` before writing.

They also have an undocumented ordering dependency: all three refuse unless
`showcase-demo-seed` ran first (clean message, not a bug).

## Disclosure — I crossed my own boundary

Running those three without `ERP_BASE_URL` set sent one
`POST /api/auth/sign-in/email` each to `localhost:3002` — Ali's dev server,
backed by DEV. All three returned 403 and the seeds aborted before any money
call, so the blast radius was three failed auth attempts and zero rows. It still
breached the "never touch dev" rule I set for this audit; recorded rather than
omitted. I stopped there rather than booting a server to complete the run.

## Teardown

Cluster stopped and removed; 55432 refuses connections; shim clean (0 markers,
147 KB genuine); `QA/.env.qa` gone; Ali's dev server untouched.

---

# PHASE 3 — FIX L-8 — DONE 2026-08-18 [VERIFIED]

New `packages/database/prisma/http-target-guard.ts`, wired into the sign-in
helper of all three seeds so every call site inherits it:

1. **`ERP_BASE_URL` required, no default.** The silent `?? localhost:3002` is
   gone. Resolved lazily so `--dry-run` still needs nothing.
2. **Nonce round-trip proves the app reads THIS database.** Write a random
   notification for the showcase owner through the guarded connection, read
   `GET /api/v1/notifications` back over HTTP as that signed-in user, refuse if
   it is invisible. Probe deleted in a `finally`.

## The design detail that mattered

An id comparison would have proven nothing, and I confirmed it: `seedId()` mints
deterministic UUIDv5, so two independently seeded databases returned the SAME
owner id `5ade025b-…`. Only a freshly generated value distinguishes them.

I did NOT use `/api/health` as I first suggested — it carries no environment
label, and adding one would widen a public unauthenticated endpoint's
disclosure. The notifications probe is caller-scoped and needs no product change.

## Verification [VERIFIED]

| Case | Result |
|---|---|
| ERP_BASE_URL unset | refuses with the "no default" explanation |
| app on a DIFFERENT database | REFUSES before any settlement/subscription call |
| app on the SAME database | passes the guard, proceeds to real work |
| probe cleanup | 0 `seed-target-probe:%` rows in either database |

`bun run check-types` 9/9.

## Limitation — stated rather than glossed

Cases 2 and 3 used a small local stub app (serving sign-in + notifications), one
backed by a second throwaway database and one mirroring the first. The REAL Next
app was not used: its production build would not complete here (repeated
`socket hang up` retries during `next build`, 31 retry lines). The guard's logic
and both verdicts are proven; integration against the real app is not.

## Teardown

Stub killed; both throwaway databases and the cluster removed; shim clean;
`QA/.env.qa` gone; Ali's dev server untouched.

---

# PHASE 3 — FIX L-4 + L-5 — DONE 2026-08-18 [VERIFIED]

## L-4 — constant-time secret comparison (THREE doors, not two)

Phase 1 reported two call sites; the sweep had only covered the two Next apps.
`apps/realtime/src/internal.ts:69` compares the same internal secret with `!==`.
All three now route through one shared helper,
`packages/server-core/src/auth/secret-compare.ts` (`secretEquals`,
`bearerEquals`).

Hash-then-compare rather than the length-guarded form used for the HMACs:
`timingSafeEqual` throws on unequal lengths, and these secrets are arbitrary
operator strings whose length cannot be guaranteed. SHA-256 on both sides makes
the lengths equal by construction — no length leak, no throw.

The existing fixed-width call sites (mock-driver HMAC, student-qr, guardian
verification) were left alone: correct as written, each with its own proof, and
rewriting money/child-safety paths for uniformity is risk without benefit.

**Proof:** new `apps/erp/tests/unit/secret-compare.test.ts`, 13 assertions, in
two halves. Semantic (prefix-only rejected, null/empty rejected both sides, no
throw on unequal length) AND structural — the helper uses timingSafeEqual over a
SHA-256 digest and each door imports it with no raw `===`/`!==` on a secret.
The structural half exists because plain `===` satisfies most semantic
assertions; it follows the precedent in c04-login-allowlist.test.ts. Confirmed
it catches a regression: reverting the realtime door fails it 1/13.
`m7-cron-auth.test.ts` still 7/7, so the cron door's fail-closed behaviour and
both header forms are unchanged.

## L-5 — I had the diagnosis wrong

Phase 1 said `completeSession` "has no `distribution` key". WRONG, and the
typecheck proved it: it returns `{ session, distribution }` and `Distribution`
DOES declare `centerShare?: number`. I had read a different return statement in
the same file.

The real cause: `centerShare` is OPTIONAL and this hall-free legacy path never
sets it — and cannot honestly set one, because `centerShare` comes from
`economicsAt(studentPrice, …)` INSIDE the per-student loop
(`distribution.ts:349`). With two attendees on different prices there is no
single per-session share to report.

So the test now asserts the same fact from values the path does define
(`centerNetTotal`, `presentCount`), with the reasoning inline. I deliberately did
NOT change the engine to emit `centerShare` here: deciding what it means for a
mixed-price lesson is a money-engine decision, and this codebase decides money
semantics explicitly. The comment makes the next person hit the decision rather
than the symptom.

**Proof:** `center-share-admin.test.ts` 11 passed / 0 failed (was 10/1).

## Full verification

- repo `check-types`: **9/9**
- erp unit: 1183 passed, 1 skipped, **2 failed — the pre-existing i18n-parity
  failures from sibling work** (9 missing `gapDetail_*` keys), unchanged by me
- superadmin unit: **106/106**
- superadmin DB suites: **24 suites, 802 assertions passed**, 1 failing —
  only c02's performance-ceiling artifact (center-share-admin now green)
- erp DB suites: **44 suites, 1446 assertions passed**, 2 failing — the known
  catalog-onboarding and h03 artifacts

## Teardown

Cluster stopped and removed; 55432 refuses connections; shim clean; QA/.env.qa
gone; Ali's dev server untouched.

---

# i18n parity — FIXED 2026-08-20 [VERIFIED]

Ali asked me to fix the 9 missing `gapDetail_*` keys. **They were not missing.**
All nine exist, correctly translated, under `externalTeachers` in both `ar.json`
and `en.json`. Adding them — the obvious reading of the failure — would have
created root-level duplicates and left the suite red.

Root cause: `external-teacher-gaps-screen.tsx` holds two translators, root `t`
and scoped `te`. `describeDetail(detail, te)` is called with the scoped one, but
its PARAMETER was named `t`. The parity test binds translator variables per FILE
and knows nothing about a parameter shadowing an outer name, so every
`t("gapDetail_*")` inside that function resolved against the ROOT dictionary.

Fix: rename the parameter to `te` — matching both the argument passed and the
type it already declared. Runtime identical; the same object was always passed.
A comment records why the name is load-bearing.

**Verified:** i18n-parity 57/57; erp unit **76 files / 1185 passed / 1 skipped /
0 failed** — fully green for the first time this audit; check-types 9/9.

No database was needed, so no environment was stood up and nothing needs tearing
down.

---

# CI `db` JOB — TURNED ON 2026-08-20 [VERIFIED]

## What "off" actually meant

The job existed and was gated on `TEST_DATABASE_URL` / `TEST_ADMIN_URL`. Those
secrets were never set, and there is no test branch to point them at (both
`.env.test` files resolve to DEV), so ~60 money/RLS/auth suites had never run on
a single pull request. It also carried a step that FAILED pushes to main when
skipped — right in spirit, inert in practice.

Setting the secrets was not available to me (no test branch exists, and I cannot
set repo secrets). L-2 made the alternative real: the suites no longer require
Neon, so the job can provision its own database.

## Rewritten

`db` now runs against an **ephemeral postgres:17 service container**, needs no
secrets, and therefore runs on every PR including forks. It follows the same
bootstrap order as the `seeds` job (label → bootstrap-app-role → migrate → seed)
and keeps db-guard in the loop by LABELLING the container `edura-env:test`, so
the guard is exercised rather than bypassed.

## Stale references it had accumulated — all fallout from the www → erp rename

Never noticed, because the job never ran:
- `apps/www/.env.test.example` does not exist → the materialise step's `cp` would
  have failed on the first line under `set -euo pipefail`;
- `apps/www` has no `test:e2e` script and no tests → the E2E steps would have
  failed too.
Both repointed to `apps/erp`.

## Suites excluded, each for a stated reason

- `apps/erp` `test:db:ci` gains **profile-images**: it refuses to run without
  real `CLOUDINARY_*` keys ("this suite proves the real upload path"). A
  third-party-credential test does not belong in a job whose point is needing no
  secrets. (Existing exclusions: catalog-onboarding, c01, h03.)
- NEW `apps/superadmin` `test:db:ci` excludes **c02-payout-generation**: a
  LATENCY-dependent proof that asserts the pre-fix payout path breaches a
  20 000 ms ceiling. Against a Postgres on the same machine that path finishes in
  ~45 ms, so it fails for the one reason that does not mean the bug is back.

## Verification [VERIFIED] — the job's sequence run locally, end to end

Fresh database each time, the exact CI steps in order (bootstrap → migrate →
4 seeds → materialise `.env.test` from the committed templates → db-guard →
both suite commands):

| Step | Result |
|---|---|
| bootstrap / migrate / seed | ok |
| materialise + `pretest:db` (both apps) | `db-guard: ok — labelled 'test'` |
| erp `test:db:ci` | **42 suites, 1376 assertions, 0 failed** (×3 consecutive) |
| superadmin `test:db:ci` | **23 suites, 788 assertions, 0 failed** |

Also confirmed every path and script the workflow names now exists, and the YAML
parses with no secret gate anywhere.

## Two honest caveats

1. **One unreproducible flake.** In six erp runs, one reported a single failed
   assertion; five were clean, including three consecutive. I could not identify
   or reproduce it. Worth watching on the first real runs rather than claiming
   the job is perfectly stable.
2. **The E2E half was NOT rehearsed** at the time this was written — see the
   follow-up section below, where it was hardened and partly verified.

## Teardown

Cluster stopped and removed; generated `.env.test` files deleted; shim clean.

---

# CI E2E BLOCK — HARDENED 2026-08-20 [PARTLY VERIFIED]

## What was wrong beyond the apps/www paths

The port `3002` was written out three times — the dev server, the readiness
probe, and `E2E_BASE_URL` — which is three chances to change two of them. It
also made the block impossible to rehearse anywhere 3002 is already taken, which
is precisely why it had never been run.

`bun run dev` is `next dev -p ${WWW_PORT:-3002}`, so the port was already an
input; the workflow just wasn't using it.

## Changes

- job-level `E2E_PORT: "3002"`, threaded through `WWW_PORT`, the readiness
  probe, the `.env.local` overrides and `E2E_BASE_URL`;
- the failure message now names the port (`erp never became ready on 3102`);
- comments record WHY dev mode is required (quick-login tiles are gated on
  `NODE_ENV !== production`) and why the server is backgrounded across steps.

## Verified [VERIFIED]

The substantive risk inside the block was whether the smoke can actually sign
in — it drives the quick-login tiles, which post fixed demo credentials. Against
a database seeded by the CI seed list exactly:

| Check | Result |
|---|---|
| the four tile accounts exist, `active`, with a password hash | yes — center_admin, teacher, student, parent |
| `bcrypt.compare("Passw0rd!", hash)` — the literal the tile submits | **all four AUTHENTICATE** |
| `@playwright/test` resolvable from apps/erp | yes (dependency, ^1.62.0) |
| every path/script the block names | exists |
| YAML | parses; 19 steps |

That confirms the seeds and the tiles agree — the failure mode most likely to
make this block red on its first run, and the one that would have been silent
(`SEED_PASSWORD` is deliberately unset so the seeds fall back to `Passw0rd!`).

## Still NOT verified — and why

The `next dev` boot itself and Playwright driving the UI. Next refuses a second
dev server for the same directory **regardless of port**, and Ali's own dev
server is running from `apps/erp`. Rehearsing would have meant stopping it,
which I was not asked to do and did not do. On a clean CI runner that lock does
not apply.

So: the block's inputs, credentials, paths and plumbing are proven; the
boot-and-drive sequence is not. If the first real run fails, the readiness probe
now prints the port and the last 50 lines of the server log, which is where to
look.
