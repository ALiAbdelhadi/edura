# QA Findings — Edura ERP

**Commit:** `ac5e941` · **Date:** 2026-08-18 · **Environment:** disposable local
Postgres 17.10 (`edura-env:test`, port 55432), erp app built and run in
**production mode** on port 3102. No dev or production database was ever in scope
— all three connection URLs were verified to resolve to `localhost:55432` before
the first write.

**Evidence tags:** `[VERIFIED]` = I executed it and saw the result.
`[STATIC]` = read from code, not executed. Never blurred.

**Volume of evidence:** 2222 assertions from the project's own proof suites
(erp 1428 pass / 7 fail, superadmin 794 pass / 2 fail), plus ~120 HTTP requests
I issued directly against the running app across 9 principals.

---

## Executive summary

The authorization model is **genuinely well built**. I attacked it from nine
principals across every gate class and it held everywhere except one endpoint.
Tier inheritance, hard exclusions, the read-only accountant, teacher/assistant
delegation limits, the app partition, and hard session revocation all behave
exactly as documented. SQL injection is not possible anywhere I probed, and
production-mode error handling leaks nothing.

**One HIGH — now FIXED** (cross-tenant access to materials, on both the
by-ID download and, discovered during the fix, the list endpoint). Two MEDIUMs
remain open and are worth fixing, though partly deployment-dependent.

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 1 | ✅ **fixed + regression test (2026-08-18)** |
| Medium | 2 | ✅ **both resolved** (M-2 fixed; M-1 door retired) |
| Low | 7 | 2 ✅ **fixed (L-6, L-7)**, 5 open, non-blocking |
| Info | 5 | 2 ✅ fixed (I-4, I-5), 3 open |

---

## 🔴 HIGH

### H-1 — Cross-tenant access to materials: any center staff or assistant reaches **any** material on the platform `[VERIFIED]` — ✅ **FIXED 2026-08-18**

> **Status: fixed and verified.** Scope grew during the fix: the **list**
> endpoint leaked too (see "Second instance" below). Both are closed, proven by
> a new regression suite (`apps/erp/tests/db/materials-access.test.ts`, 12/12)
> that was confirmed to FAIL 4/12 with the fix reverted, and by re-running the
> original attack over HTTP against a rebuilt server.

**Endpoint:** `GET /api/v1/materials/[id]/download`
**Roles affected:** `center_staff` (all three sub-tiers: receptionist, manager,
center_accountant) and `assistant`.

**Repro** — as an authenticated `assistant` (or any center_staff), request a
material belonging to a **different center**:

```bash
curl -s -b assistant.jar http://localhost:3102/api/v1/materials/008485de-2e0e-5e49-8679-3b072b01172b/download
```

**Expected:** `403` (or `404`) — the material belongs to center
`af9baa69-…`, the caller belongs to center `70aaa88e-…`.

**Actual:** `200 {"data":{"url":"https://example.com/preview.pdf"}}` — a usable
download URL. In production this is a **signed Cloudinary URL** to the real file.

Measured across all roles, same two materials (own center vs. another center):

| Role | Own center | **Other center** |
|---|---|---|
| center_admin | 200 | **404** ✅ |
| teacher | 200 | **403** ✅ |
| student | 403 | 403 ✅ |
| staff_manager | 200 | **200** ❌ |
| staff_reception | 200 | **200** ❌ |
| center_accountant | 200 | **200** ❌ |
| assistant | 200 | **200** ❌ |

**Root cause** — `getMaterialDownloadUrl`
(`packages/server-core/src/services/payments/…` → actually
`apps/erp/src/lib/services/materials/materials.ts:230`) is an `if/else if` chain
over `student` → `parent` → `center_admin` → `teacher` **with no final `else`**.
Any other role falls off the end of the chain with **no ownership check at all**
and reaches the signed-URL generation. RLS does not save it: these roles are not
center-scoped in `scopedDb`, so the `findUnique` returns the row.

This is the one place in the codebase where the otherwise-universal
"fail closed by omission" discipline is inverted: here, omission means **allow**.

**Scope note — CORRECTED during the fix.** Phase 1 reported that the *list*
endpoint was correctly scoped, because the assistant I tested saw `[]` and the
staff member's first page looked own-centre. Re-measuring properly during the
fix showed that was wrong: `listMaterials` has the same missing-`else` and every
center_staff tier saw **all 4 materials across 3 centers**. The assistant's `[]`
was a coincidence — the teacher they serve simply owns no materials. See
"Second instance" below.

**Suggested fix** — add the default-deny branch, matching the pattern the same
codebase already uses in `listPayments`:

```ts
} else if (user.role === "teacher") {
  if (found.teacherId !== user.id) throw new ForbiddenError();
} else {
  throw new ForbiddenError();   // <-- default-deny, as listPayments does
}
```

If assistants/staff legitimately need materials, add an explicit branch that
checks the teacher link / center id — never a fall-through.

**Second instance, found while fixing — the list endpoint leaked more broadly.**
`GET /api/v1/materials` has the identical missing-`else` shape in
`listMaterials`, so `where` stayed `{}` and every center_staff tier received
**all 4 materials across all 3 centers** — enumeration, no UUID guessing needed.
That is strictly worse than the download IDOR and was not in the Phase-1 report.

| Role | list before | list after |
|---|---|---|
| center_staff ×3 | **4 items / 3 centers** | `403 forbidden` |
| assistant | 0 | 0 (unchanged) |
| teacher | 2 / 1 centre | 2 (unchanged) |
| center_admin | 2 / 1 centre | 2 (unchanged) |

**Fix applied:**
1. `apps/erp/src/lib/services/materials/materials.ts` — a default-deny `else`
   on **both** `listMaterials` and `getMaterialDownloadUrl`, matching the
   pattern `listPayments` already uses. Roles are now admitted by name only.
2. `apps/erp/src/app/api/v1/materials/[id]/download/route.ts` — added
   `toActingUser(await requireSession())`, the resolution its sibling list route
   already had and this route was missing. An assistant now acts as the teacher
   it serves, so **delegation is preserved rather than removed**.

Deciding that `center_staff` gets `403` rather than own-centre scoping was not
arbitrary: the `center-actor.ts` CAPABILITY MAP grants staff no materials
capability, and there is no staff-facing materials screen (only teacher,
assistant and student portals have one). Denying restores the intended design.

**Verified after fix `[VERIFIED]`:**

| Role | download own centre | download other centre |
|---|---|---|
| center_admin | 200 | 404 |
| teacher | 200 (own) | 403 |
| **assistant** | **200 for its OWN teacher's material** | 403 |
| center_staff ×3 | **403** | **403** |
| student | 403 (unenrolled) | 403 |

Full erp suite after the fix: **41 suites, 1440 assertions passed, 7 failed** —
the same 5 pre-existing artifact suites as the baseline (1428 + 12 new = 1440),
so no regression. `center-staff-delegation` and the assistant suites still pass.
`tsc --noEmit` clean.

---

## 🟠 MEDIUM

### M-1 — Brute-force protection on the erp **REST login door** is bypassable by rotating `X-Forwarded-For` `[VERIFIED]` — ✅ **RESOLVED BY RETIREMENT 2026-08-18**

> **The door was deleted.** `POST /api/v1/auth/login` is gone
> (`404`), so the bypass has no surface left. Option (c) from the suggested
> fixes below was the one taken. Detail in "Retirement" at the end of this
> finding.

> **Correction after the superadmin HTTP pass.** I originally wrote this as
> "login brute-force protection is bypassable, no per-account lockout". That
> over-generalised from the one door I had tested. Re-measured:
>
> | Door | Limiter | Survives XFF rotation? |
> |---|---|---|
> | erp `POST /api/v1/auth/login` (custom REST) | `withRateLimit`, key = `pathname:ip` | ❌ **No — bypassable** |
> | `POST /api/auth/sign-in/email` (better-auth, the real browser door) | **per-account** | ✅ **Yes — holds** |
>
> Proven on the back office: 20 failed logins with a rotating XFF all returned
> `429`, and the *correct* password was still refused while the account stayed
> throttled. It is per-account and not door-wide — a different account logged in
> normally from a fresh IP at the same moment (`200`).
>
> **apps/superadmin has no custom REST login door at all** (better-auth only), so
> the back office is NOT exposed to this bypass. The finding is real but confined
> to erp's legacy REST door.

**Endpoint:** `POST /api/v1/auth/login`

**Repro** — 20 failed logins against **one** account, rotating the header:

```bash
for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:3102/api/v1/auth/login -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$i.$i" -d '{"email":"victim@x.io","password":"wrong"}'; done
```

**Expected:** throttling after ~11 attempts.
**Actual:** `401 ×20` — **zero 429s**. Unlimited password guessing against a
single account.

Control (fixed IP) throttles correctly: `401 ×11` then `429`, with
`Retry-After: 60`, and an unrelated IP is unaffected — so the limiter itself
works; only its **key** is attacker-controlled.

**Root cause** — `trustedClientIp` (`packages/server-core/src/rate-limit/token-bucket.ts:312`)
takes `xff[length - hops]` with `hops = TRUSTED_PROXY_HOPS ?? 1`, i.e. the
**last** XFF entry. With no real proxy in front, the client supplies that entry.
`TRUSTED_PROXY_HOPS` is **not set** in production (CLAUDE.md lists it as merely
"recommended"). Separately, the bucket is per-IP only — there is **no per-account
attempt limit**, so defeating the IP key removes brute-force protection entirely.

**Deployment caveat, stated honestly:** behind Vercel the platform appends the
real client IP as the last entry, so with `hops=1` the key is trustworthy and
**production is probably not exposed today**. The risk is that this is a silent,
config-dependent property: any preview URL, self-host, direct origin access, or
change in proxy depth removes brute-force protection with no visible signal.

**Suggested fix** — (a) set `TRUSTED_PROXY_HOPS` explicitly per deployment and
fail loudly if it disagrees with the observed XFF length; (b) give the REST door
the same **per-account** bucket the better-auth door already has — the mechanism
exists and is proven, this door simply does not use it; or (c) retire the REST
door if its only remaining callers are E2E and tooling, which its own comment
suggests.

**Retirement (2026-08-18).** Before deleting anything I mapped every dependent.
The door turned out to be deader than its own comment claimed — that comment
said "callers (E2E, tooling)", but **the Playwright E2E suite drives the real
login form**, and **no application code called it at all**. Its real dependents
were four test files, two generated tooling artifacts and a runbook recipe.

What changed:

| File | Change |
|---|---|
| `apps/erp/src/app/api/v1/auth/login/route.ts` | **deleted** |
| `tests/db/c04-login-parity.test.ts` | REST half removed; reframed as the single-door C-04 + hardening proof |
| `tests/unit/route-auth-doors.test.ts` | REST describe-block removed |
| `tests/unit/c04-login-allowlist.test.ts` | `REST_DOOR` structural assertions removed |
| `tests/unit/route-conventions.test.ts` | route entry removed |
| `scripts/api-smoke.sh`, `scripts/gen-bruno.mjs` | repointed at `/api/auth/sign-in/email`; Bruno collection regenerated (219 → 218 route files) |
| `docs/guides/runbook.md` | curl recipe + login-flow line repointed |
| `packages/server-core/src/auth/login-policy.ts` | docblock: three doors → two, with the reason |

**Verified after retirement `[VERIFIED]`, over live HTTP:**

| Probe | Result |
|---|---|
| `POST /api/v1/auth/login` | **404** |
| `POST /api/auth/sign-in/email` | **200** |
| session from it → `GET /api/v1/me`, `/api/v1/centers/me` | **200, 200** |
| `POST /api/v1/auth/register/student`, `/auth/password/forgot` | **400** (validation), not 404 — untouched |

Suites: `c04-login-parity` **48/48**, and **stable across three consecutive runs**
— which also **fixes I-4**: that suite's flakiness came from its own per-IP burst
test saturating the shared in-memory limiter, and that test went with the door.
erp unit suites 75 files / 1172 passed. `tsc --noEmit` clean; production build
succeeds with the route absent from the manifest and the other 7 `/api/v1/auth/*`
routes intact.

**Related, worth knowing:** per-account throttling means an attacker who knows a
back-office email can lock that admin out of logging in by burning the bucket
(observed above — the correct password returned `429`). That is the accepted
trade-off of identity-based lockout, not a defect, but it is worth an ops runbook
note for a `super_admin` account.

### M-2 — Device-token ownership hijack `[VERIFIED]` — ✅ **FIXED 2026-08-18**

> **Status: fixed and verified.** The sibling `POST /api/v1/me/push-subscription`
> was confirmed to share the bug (it also rewrote the channel's `p256dh`/`auth`
> encryption keys) and is fixed by the same shared service. Regression suite
> `apps/erp/tests/db/push-registration-ownership.test.ts` (16 assertions),
> confirmed to fail against the old implementation.

**Endpoint:** `POST /api/v1/me/device-tokens`

**Repro:**
```bash
curl -b student.jar -X POST .../api/v1/me/device-tokens -d '{"token":"T","platform":"web"}'   # 201, owner = student
curl -b teacher.jar -X POST .../api/v1/me/device-tokens -d '{"token":"T","platform":"web"}'   # 201, owner = teacher
```

**Expected:** the second call rejects, or creates a separate row.
**Actual:** `201` — `user_device_tokens.user_id` silently flips to the teacher.

**Impact:** any authenticated user who learns another user's device token can
seize that registration. The victim **silently stops receiving push
notifications** — which for a parent means missing attendance and child-safety
alerts — and the victim's device begins receiving the attacker's notifications.

**Root cause** — the handler upserts on the unique `token` key and overwrites
`userId` with the caller's id, with no check that the existing row belongs to the
caller.

**Exploitability, stated fairly:** neither the token nor the push endpoint is
returned by any API — both DELETE routes are ownership-scoped and nothing exposes
the credential — so an attacker needs an out-of-band leak (logs, a backup, the
device itself) to know the string. This is a missing ownership check worth
closing, not a remotely reachable takeover.

**Fix applied** — the ownership rule moved into one shared service,
`apps/erp/src/lib/services/notifications/push-registration.ts`, used by **both**
channels so they cannot drift apart:

- same owner re-registering → **scoped `updateMany`** on their own row, in place
  (matching what both DELETE routes already did);
- anyone else, or an unknown credential → the existing row is **deleted** and a
  fresh one created for the caller.

Both routes are now thin wrappers over that service.

**A transfer is still permitted, deliberately.** A device genuinely changes
hands — a shared family phone, a resold handset — and refusing would strand
those users, which matters for this market specifically. So the residual
notification-DoS vector (someone who *already knows* a token can take it over
and the previous owner stops receiving pushes) is **reduced, not eliminated**:
what is gone is the silent repoint that left the previous owner's row, platform,
`lastSeenAt` and encryption keys attached to another account. **If you would
rather refuse cross-account transfers outright, that is a one-line change in the
service — but it is a product call about shared devices, so I did not make it
for you.**

**Verified after fix `[VERIFIED]`, over HTTP against a rebuilt server:**

| Step | Result |
|---|---|
| student registers token | `201`, row `d98f2786`, owner = student |
| student re-registers (platform change) | `201`, **same row id**, platform updated → scoped-update path |
| teacher claims the same token | `201`, **new row id `b1f25205`**, owner = teacher |
| rows for that token | exactly **1** |

Suite after the fix: **42 suites, 1453 assertions passed** (materials-access
12/12, push-registration-ownership 16/16). `tsc --noEmit` clean. The 10 failures
are the same pre-existing artifact suites; `c04-login-parity` fluctuates between
2 and 5 failures run-to-run, all in the rate-limiter/door family — see I-4.

---

## 🟡 LOW

### L-1 — The H2 wallet-floor CHECK is left **NOT VALIDATED** by the documented bootstrap, and `verify-db` still reports green `[VERIFIED]`

On a freshly bootstrapped environment (`label → bootstrap-app-role →
migrate deploy → seed → verify-db`):

```
SELECT conname, convalidated FROM pg_constraint WHERE conname='centers_wallet_balance_nonneg';
 centers_wallet_balance_nonneg | f
```

Every other `*_nonneg` CHECK is `t`; only the centers wallet floor is `f` — and
**`verify-db` reported ALL 27 CHECKS PASSED anyway**. The `c01-lesson-settlement`
proof suite does catch it ("all 3 CHECKs remain present and validated (2/3)"),
but the bootstrap runbook has no VALIDATE step.

**Mitigating:** `NOT VALID` still enforces on every INSERT/UPDATE; only
pre-existing rows go unchecked, and a fresh DB has none. CLAUDE.md records
production's copy as VALIDATED (2026-07-31), so **production is believed fine**.
The gap is in the procedure and the verifier — i.e. it bites the *next*
environment someone builds.

**Fix:** add `VALIDATE CONSTRAINT` to the bootstrap order, and make `verify-db`
assert `convalidated` for it.

### L-2 — There is no safe way to run the DB test suites as shipped `[VERIFIED]`

Two independent facts combine badly:
1. Both `.env.test` files point at the **dev** database (`EDURA_ALLOW_DB_ENVS=dev`);
   CLAUDE.md confirms *"THERE IS NO TEST DATABASE"*.
2. All 62 suites hardcode `import { Pool } from "@neondatabase/serverless"`, and
   `@prisma/adapter-neon` needs `types` from it — so against any non-Neon
   Postgres they die with `NeonWebSocketError … ECONNREFUSED`.

So the only executable path for the project's 2222-assertion safety net is
**against dev**, which mutates it (measurably: `h03` leaks a row per run, and the
suites append `audit_logs` rows permanently).

**Fix:** either restore a real Neon test branch, or decouple fixtures from the
Neon driver (build the admin pool behind the same `DATABASE_DRIVER` switch the
app already has) so a local Postgres works. I proved the second is viable — see
`QA/shim/`.

### L-3 — Two suspension paths, only one records a reason `[VERIFIED — not a security hole]`

`PATCH /api/v1/admin/users/[id]/permissions` mutates `users.status` via
`updateUserStatus` (no reason argument), duplicating
`PATCH /api/v1/admin/users/[id]/status` (`setUserSuspended`, reason mandatory),
which CLAUDE.md calls *the* one suspension mechanism.

I suspected a live-session hole and **disproved it**: revocation is enforced by
the DB trigger `users_revoke_sessions`, which fires `AFTER UPDATE OF status`
regardless of code path. Proven end-to-end — after a plain `UPDATE users SET
status='suspended'`, `auth_sessions` went **1 → 0** and an authenticated request
went **200 → 401** immediately.

So this is **audit-trail hygiene only**: a suspension via `/permissions` is
recorded without a reason. Fix by routing both routes through `setUserSuspended`.

### L-6 — `POST /api/v1/admin/impersonation/stop` returns **500** for a client error `[VERIFIED]` — ✅ **FIXED 2026-08-18**

Calling it without an active impersonation (the ordinary case if a UI button is
clicked twice, or a stale tab) produces:

```
HTTP/1.1 500 Internal Server Error
{"error":{"code":"internal","message":"Internal error"}}
```

Server log: `[unhandled] [Error [APIError]: You are not impersonating anyone] … statusCode: 400`.

better-auth raises a typed `APIError` with **statusCode 400**; the route does not
catch it, so `withErrors` falls through to its generic 500 branch.

**This resolves F.8 from Phase 1 — the security question is answered: the gate is
real.** better-auth genuinely refuses a non-impersonating session; it is not a
silent no-op, so the missing `requireRole` costs nothing. The impersonation
design is sound (see the verified table below). What is wrong is only the error
mapping: a well-defined 400 is served as a 500 and logged as `[unhandled]`,
which will generate false Sentry alerts on a security-relevant endpoint and
train people to ignore them. No internals leak (M4 holds).

**Fix applied** — catch `APIError` and re-throw a typed `ValidationError`,
mirroring `apps/erp/src/app/api/v1/auth/login/route.ts:35`. Our own message is
used rather than forwarding better-auth's, so no library internals reach the
client; anything that is *not* an `APIError` is genuinely unexpected and still
becomes a 500.

**Verified after fix `[VERIFIED]`, over HTTP:**

| Probe | Before | After |
|---|---|---|
| stop with no active impersonation | `500` `{"code":"internal"}` | **`400` `{"code":"validation_error","message":"No impersonation is active for this session"}`** |
| `[unhandled]` entries in the server log | 1 per call | **0** |
| stop DURING a real impersonation (happy path) | 200 | **200**, identity restored to `super_admin` |

### L-7 — `DELETE /api/v1/admin/students/[id]/unlink-parent` ignores the student in the URL `[VERIFIED]` — ✅ **FIXED 2026-08-18**

Phase 1 flagged this statically (F.9); it is now confirmed by execution.

**Repro** — as super_admin, name student **A** in the path but pass a `linkId`
belonging to student **B**:

```bash
curl -X DELETE -b sa_super.jar \
  "http://localhost:3104/api/v1/admin/students/5f7dcd6d-…/unlink-parent?linkId=c249124d-…"
```

**Expected:** `404`/`400` — that link does not belong to that student.
**Actual:** `200`. Student **B**'s parent link moved to `status='revoked'`, and an
audit row `student.unlinked_parent` was written for an action whose URL names a
different child.

Not a privilege escalation — super_admin may unlink any link anyway — but it is a
data-integrity and **audit-accuracy** bug: the recorded action and the URL that
produced it disagree, so the audit trail cannot be trusted to reconstruct what
was intended. It also touches a child-safety record: a parent link is what the
messaging guardian gate consults, so severing the wrong one has consequences
beyond tidiness.

**Fix applied** — the route now passes the path student id to
`unlinkParent(linkId, studentId, adminId)`, which asserts
`link.studentId === studentId`. A mismatch is reported as **404, not 403**: from
that student's position the link does not exist, and saying so avoids confirming
the existence of another student's link.

**Verified after fix `[VERIFIED]`, over HTTP:**

| Probe | Before | After |
|---|---|---|
| wrong student in path + valid `linkId` | `200`, link **revoked**, audit row written | **`404`**, link still `approved`, **no audit row** |
| correct student in path | 200, revoked | **200, revoked** (unchanged) |

Regression suite `apps/superadmin/tests/db/unlink-parent-scope.test.ts` (7
assertions) — fails 3/7 with the guard removed. Full superadmin suite after the
fix: **24 suites, 801 assertions passed** (794 baseline + 7 new), same 2
pre-existing artifact suites.

**Noted, not fixed:** `revokedBy` is the `link_actor` enum whose only values are
`parent` and `student`, so an admin revocation is still recorded as `parent`.
Widening that enum is a migration and needs its own approved plan under the
project's schema rules; the `audit_logs` row is the accurate record of who acted.

### L-4 — Internal secrets compared with `===`, not constant-time `[STATIC]`

`apps/erp/src/app/api/v1/cron/[job]/route.ts:26` and
`apps/erp/src/app/api/v1/internal/chat-notify/route.ts:27`. Both fail closed and
both secrets are high-entropy, so exploitability is very low — but the login path
already uses `timingSafeEqual`, so the codebase is inconsistent with itself.

### L-5 — `completeSession` return-shape drift `[VERIFIED]`

`center-share-admin.test.ts` asserts `dist.distribution.centerShare === 2500` and
receives `undefined`; `completeSession` returns
`{distributed, presentCount, perSessionPrice, teacherNetTotal, centerNetTotal,
platformEarned}` — no `distribution` key. **The money is correct** (center +2300
= 2500 share − 200 fee, teacher +17300, 3 ledger rows) and no production caller
reads that path, so this is a stale test, not a defect.

---

## ⚪ INFO

### I-5 — `preview-seed.ts` was broken by a sibling schema change `[VERIFIED]` — ✅ **FIXED 2026-08-18**

**Symptom:** `bun run --filter @repo/database seed:preview` (and any rebuild of a
preview environment) died with:

```
Invalid `tx.review.upsert()` invocation — Unknown argument `studentId_teacherId`
```

The whole seed runs in ONE transaction, so a single bad call site took down every
fixture it creates — 4 centers, 5 teachers, 5 students, 5 courses, 7 sessions.

**Root cause — not a typo.** `Review` deliberately **no longer has**
`@@unique([studentId, teacherId])`. Migration
`20260818120000_review_per_lesson_unique` replaced it with two **partial** unique
indexes, because a plain compound unique made the documented `lessonId` column
unusable (the second lesson a student rated collided with the first):

```
reviews_one_overall_per_teacher  UNIQUE (student_id, teacher_id) WHERE lesson_id IS NULL
reviews_one_per_lesson           UNIQUE (student_id, lesson_id)  WHERE lesson_id IS NOT NULL
```

Prisma cannot express a `WHERE` on a unique index, so those indexes are invisible
to the model and the generated `studentId_teacherId` key **ceased to exist**. The
seed's `upsert` was a stale call site left behind by that change.

That migration is dated **today** and the database carries **53** migrations
where CLAUDE.md records 52 — i.e. this regression landed during this session, from
sibling work, and nothing caught it: **no CI job runs the demo seeds.**

**Fix applied** — mirror what `services/reviews/reviews.ts` already does for the
same constraint: `findFirst({ studentId, teacherId, lessonId: null })` then
update-or-create. Idempotency becomes application-level, which is what the schema
comment says it must be. I swept the repo for other `studentId_teacherId` /
`review.upsert` call sites — this was the only one.

**Verified `[VERIFIED]`:**

| Probe | Result |
|---|---|
| `preview-seed.ts` | completes: 4 centers / 5 teachers / 5 students / 5 courses / 7 sessions |
| run twice more (idempotency — the point of the original upsert) | `reviews` stays **1**, `users` stays **18** |
| duplicate OVERALL review inserted directly | refused by `reviews_one_overall_per_teacher` |
| per-lesson review for the same pair | **allowed** — the behaviour the migration existed to enable |
| suites unblocked by restored fixtures | `profile-images` **now passes** (was 2 failures); `c01` and `h03` now run instead of crashing |

erp DB suites after the fix: **44 suites, 1407 assertions passed** (up from 1371
with the seed broken), leaving only the known artifact failures.

- **I-1** `catalog-onboarding.test.ts` cannot run standalone — dies with
  `cacheTag() is only available with the cacheComponents config`. It would fail
  on Neon too, so one of the 62 suites is **permanently red / not a real signal**.
- **I-2** `h03-seed-uuid-flows.test.ts` leaks one parent-link row per run
  (delta grew 14→8 then 15→9 across consecutive runs) — cumulative fixture
  residue in whatever DB it runs against.
- **I-4** ~~`c04-login-parity.test.ts` is flaky~~ — ✅ **RESOLVED 2026-08-18 as a
  side effect of the M-1 retirement.** The flakiness came from that suite's own
  per-IP burst test saturating the shared in-memory limiter for the assertions
  after it. That test belonged to the retired REST door and went with it: the
  suite now passes 48/48 on three consecutive runs.
- **I-3** `GET /api/v1/centers/[id]` is unauthenticated and **unthrottled**.
  You ruled the *disclosure* public by design, which closes that question; the
  remaining note is only that it has no rate limit while its siblings
  (`/search/centers`, `/search/teachers`) do — a scraping/cost concern, not a
  disclosure one.

---

## RBAC matrix — executed results `[VERIFIED]`

9 principals × 21 endpoints over real HTTP. `✅` = behaved exactly as the design
intends. Codes are actual observed HTTP status.

| Endpoint | Gate class | c_admin | mgr | recep | c_acct | teach | asst | parent | student | anon | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `GET /me` | self | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 401 | ✅ |
| `GET /notifications` | self | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 401 | ✅ |
| `GET /centers/me` | owner-only | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ |
| `PATCH /centers/me` | owner-only write | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /center/staff` | owner-only | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /center/checkin/lookup` | RECEPTION | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ inheritance |
| `GET /rooms` | MANAGER | 200 | 200 | **403** | 403 | 403 | 403 | 403 | 403 | 401 | ✅ tier split |
| `GET /reports/attendance-by-course` | MANAGER | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /reports/revenue` | ACCOUNTANT | 200 | 403 | 403 | **200** | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /center/wallet` | ACCOUNTANT | 200 | 403 | 403 | **200** | 403 | 403 | 403 | 403 | 401 | ✅ |
| `POST /center/wallet/payout-request` | HARD EXCLUSION | 422¹ | 403 | 403 | **403** | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /teacher/wallet` | teacher-only | 403 | 403 | 403 | 403 | 200 | **403** | 403 | 403 | 401 | ✅ delegation limit |
| `GET /teacher/assistants` | teacher-only | 403 | 403 | 403 | 403 | 200 | **403** | 403 | 403 | 401 | ✅ delegation limit |
| `GET /payments` | requireSession + service scope | 200 | 403 | 403 | 403 | 403 | 403 | 422² | 200³ | 401 | ✅ |
| `GET /me/subscriptions` | self | 403 | 403 | 403 | 403 | 403 | 403 | 422 | 200 | 401 | ✅ |
| `GET /dashboards/student` | student-only | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 200 | 401 | ✅ |
| `GET /dashboards/admin` | center-side | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 401 | ✅ |
| `GET /subjects` | PUBLIC | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ✅ |
| `GET /search/centers` | PUBLIC | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ✅ |
| **`GET /materials/[id]/download`** | requireSession + service scope | 404⁴ | **200** | **200** | **200** | 403⁴ | **200** | 200⁵ | 403 | 401 | ❌ **H-1** |

¹ 422 = reached the handler and failed validation on an empty body — i.e. authorized, as intended for the owner.
² 422 = `studentId is required for parents` — the parent branch demands an explicit child and verifies an approved link.
³ Student sees **only their own** payments: the service sets `where.studentId = user.id` and **ignores** any client-supplied `studentId` (verified with `?studentId=' OR '1'='1` → `{"data":[]}`).
⁴ Against a **foreign-center** material — correctly refused.
⁵ Parent 200 is **correct, not a finding**: I checked the DB and that parent's child is genuinely enrolled in that course.

---

## Superadmin RBAC matrix — executed results `[VERIFIED]`

Run 2026-08-18 against the superadmin app built and started in production mode on
port 3104, same disposable DB. 36 endpoints × 3 principals.

**The headline: `accountant` is refused on every single `/api/v1/admin/**` route
— reads and writes alike — so "finance screens ONLY, enforced at the API layer,
not just navigation" is verified, not merely claimed.**

| Endpoint group | Examples | super_admin | accountant | anon |
|---|---|---|---|---|
| Platform reads (15) | `/admin/users`, `/admin/students`, `/admin/teachers`, `/admin/subscriptions`, `/admin/payment-intents`, `/admin/messaging/*`, `/admin/deletion-requests`, `/admin/registrations`, `/admin/whatsapp-messages` | 200 | **403** | 401 |
| Money-config reads | `/admin/revenue-split`, `/admin/wallet-settings` | 200 | **403** | 401 |
| Money-config writes | `PUT /admin/revenue-split`, `PUT /admin/wallet-settings` | 400¹ | **403** | 401 |
| Admin writes | `PUT /admin/feature-flags`, `POST /admin/points/rules`, `PATCH /users/[id]/status`, `POST /users/[id]/revoke-sessions`, `POST /teachers/[id]/approve` | 400/422¹ | **403** | 401 |
| Finance portal | `GET /finance/payouts`, `GET /finance/invoices`, `POST /finance/payouts` | 200/201² | 200/201 | 401 |
| Settlement export | `GET /admin/session-settlements/export` | 200 | 200 | 401 |
| Self | `/api/v1/me`, `/notifications`, `/search` | 200 | 200 | 401 |

¹ 400/422 = reached the handler and failed body validation on `{}` — i.e. authorized.
² The `super_admin` short-circuit (`require-role.ts:7`) is confirmed live: super_admin passes every `requireRole("accountant", …)` route without being named. Documented behaviour, now measured.

### Impersonation — target rules and containment both hold `[VERIFIED]`

| Probe | Result |
|---|---|
| impersonate an `accountant` | `200` — session swaps, `/api/v1/me` reports role `accountant` |
| impersonate **self** | refused — *"You cannot impersonate your own account"* |
| impersonate a **www student** | refused — *"Only back-office accounts can be impersonated — a session minted here is not valid in www"* |
| impersonated session → `/admin/users` | **403** — super_admin power genuinely dropped |
| impersonated session → `/finance/payouts` | 200 — correctly scoped to the impersonated role |
| `POST /admin/impersonation/stop` | `200`, identity restored to `super_admin` |
| audit | `user.impersonation_started` + `user.impersonation_stopped` both written |

Containment is the part worth stating plainly: an impersonated session is **not**
a super_admin session wearing a different name — it loses the admin surface
entirely. That is also why the stop route cannot use `requireRole("super_admin")`
(see L-6).

### Money write-protection at the DB layer `[VERIFIED]`

Tested as the application's own role (`edura_app`, NOBYPASSRLS):

| Table | UPDATE | DELETE |
|---|---|---|
| `transactions` | **permission denied** | **permission denied** |
| `points_ledger` | **permission denied** | **permission denied** |
| `audit_logs` | **permission denied** | **permission denied** |
| `payments` | allowed | allowed |
| `wallet_ledger` | allowed | allowed |

This matches `verify-db`'s own declared expectations exactly (it asserts the
append-only set and puts the other 70 tables in "full CRUD"), so it is **design,
not a gap** — `payments` must be updatable for the paid→refunded transition. The
double-entry ledger, the points ledger and the audit log are genuinely
append-only at the database, for super_admin too.

## Things I tried to break and could not `[VERIFIED]`

Worth recording, because a launch decision rests as much on these as on the bugs.

| Attack | Result |
|---|---|
| SQL injection — 5 vectors (`' OR '1'='1`, `; DROP TABLE users--`, `UNION SELECT`, on payments/notifications/search) | All treated as literal values. 30 users intact. Prisma parameterizes throughout. |
| IDOR on `/payments` via `?studentId=<other>` | Ignored — student branch pins `studentId = user.id`. |
| Cross-tenant material **listing** | Correctly scoped (assistant `[]`, accountant own-center only). |
| Back-office account signing into the erp app | `401` generic for both `super_admin` and `accountant` — the `canSignIn` partition holds, and the message does not reveal the account exists elsewhere (H5). |
| Session survival after suspension | Sessions hard-deleted by DB trigger; request `200 → 401` immediately. |
| Privilege escalation via staff sub-tier | Receptionist blocked from MANAGER routes; accountant blocked from every mutation; all staff blocked from the four hard exclusions. |
| Assistant reaching teacher money/assistant-management | `403` on `/teacher/wallet` and `/teacher/assistants`. |
| Stack traces / internals in errors (production mode) | Clean envelopes only: `{"error":{"code":"not_found","message":"Resource not found"}}`. |
| Malformed JSON / wrong content-type / 20 KB email | `400` / `400` / `401`. No 500s. |
| Health endpoint disclosure | `{"status","db","rateLimiter","time"}` only — no version, host, or env names. |
| Cron door | Fails closed with no `CRON_SECRET`, POST-only, GET → 405 `[STATIC]`. |
| **Back-office privilege escalation** | `accountant` refused on all 29 probed `/admin/**` endpoints, reads and writes. |
| **Impersonation escalation** | Impersonated session loses the admin surface; cannot target self, another super_admin, or any www role. |
| **Cross-app login, both directions** | Back-office creds at the erp door → 401; erp-role creds (correct passwords) at the superadmin door → *"Invalid email or password"*. The `canSignIn` partition holds bidirectionally. |
| **Injection on back-office search** | `/admin/users?q=` and `/search?q=` with `' OR '1'='1`, `'; DROP TABLE users--`, `UNION SELECT` → all 200, treated as literals; 18 users intact. |
| **Brute force on the back-office door** | Per-account throttle: 429 after 5 attempts, survives XFF rotation (20/20 refused), and is not door-wide — another account signed in normally at the same moment. |

---

## Payment gateway — hook points (out of scope, as instructed)

The Paymob driver is a deliberate empty stub; `PAYMENTS_MODE=mock`. Where the
real integration will land, all `[STATIC]` unless noted:

| Hook | Location | State |
|---|---|---|
| Webhook signature | `resolveDriver().verifyWebhook(rawBody, query)` | HMAC + `timingSafeEqual`; `PAYMOB_HMAC_SECRET` required in prod, no fallback |
| Webhook processing | `payments/paymob/webhook/route.ts:33` → `processWebhookEvent` | Claim + settle in **one transaction** (M1); replay returns 200 without re-settling; unknown order → 200 `{ignored:true}` |
| Amount authority | server-side intent | **Never** read from the payload |
| Order/invoice transitions | `payment_intents` state machine | expiry via `POST /api/v1/cron/expire-payment-intents`, idempotent |
| Refund | superadmin finance | partial unique `transactions_one_refund_per_payment` (H3) — proven by `h3-refund-race` 6/6 `[VERIFIED]` |
| Payout settle | `finance/payouts` | `FOR UPDATE` (H1) + conditional decrement + CHECK (H2) — `h2-payout-floor` 7/7 `[VERIFIED]` |
| Mock completion | `POST /api/v1/payments/intents/[id]/mock-complete` | 404s in production |

**Idempotency to re-verify once the real driver lands:** replayed webhooks,
double-submit of `/payments/initiate`, and the cash top-up path (which I flagged
statically as having no replay guard and did **not** get to test).

---

## Launch readiness verdict

**Updated 2026-08-18 (after the superadmin HTTP pass): still no blocking
defect.** The back-office pass found nothing above Low: the accountant boundary,
impersonation containment, cross-app partition and append-only ledger all held
under direct attack. Two Low findings were added (L-6, L-7) and M-1's scope was
corrected *narrower*.

**Original verdict, retained for the record:** the blocking item is cleared. With H-1 fixed, no
blocking defect remains from this pass — subject to the coverage limits below
(most importantly, the superadmin app was never exercised over HTTP).

**Blocking:**
- ~~**H-1** (materials cross-tenant access)~~ — ✅ **FIXED and verified
  2026-08-18**, including a second instance on the list endpoint found during
  the fix. Regression suite added and confirmed to fail without the fix.

**Fix or consciously accept before launch:**
- **M-1** — confirm `TRUSTED_PROXY_HOPS` for the actual Vercel deployment and add
  a per-account lockout. Probably not exploitable in production today, but it is
  a silent property, and "probably" is doing a lot of work in a sentence about
  brute-forcing accounts.
- ~~**M-2** — device-token hijack~~ — ✅ **FIXED 2026-08-18** (both channels).

**Should not block launch:** L-1 through L-5 and all INFO items — though **L-1**
should be fixed before the *next* environment is built, and **L-2** is the reason
this audit needed a bespoke harness at all.

**My overall read:** the security architecture here is stronger than most
pre-launch codebases I would expect to audit. The invariants in CLAUDE.md are not
aspirational — I tested them and they hold, structurally (DB triggers, positive
allow-lists, fail-closed-by-omission), not just by convention. H-1 is notable
precisely because it is the one place that discipline inverts.

---

## Coverage — what I did NOT test

Stated plainly so this report is not read as more complete than it is.

- ~~The superadmin app was never booted over HTTP.~~ **Done 2026-08-18** — see
  the superadmin matrix above. 36 endpoints × 3 principals, plus impersonation,
  DB-level money protection, cross-app login and injection. The `super_admin`
  short-circuit is now **measured**, not inferred. Still sampled rather than
  exhaustive: 29 of the 203 `requireRole(super_admin)` rows were probed
  individually, chosen to cover every distinct gate class and every money-config
  and identity-mutating surface; the remainder are uniform repetitions of the
  same one-line gate.
- **Money write paths were exercised only through the proof suites**, not through
  HTTP with real sessions. Settlement, payouts and refunds pass their suites
  (2222 assertions) but I did not drive them end-to-end as a user.
- **Concurrency/duplicate-submit** was not tested over HTTP (the suites cover
  double-spend and refund races in-process).
- **Realtime socket server** (`apps/realtime`) — not started, not tested.
- **Playwright E2E** (8 specs) — not run.
- **Attendance/counter flows, messaging, and the child-safety guardian gate** —
  covered by suites, not by my own HTTP probes.
- **`POST /api/v1/me/push-subscription`** — flagged as sharing M-2's shape,
  **not tested**.
- Neon-transport behavior (the WS-drop retry proofs) is **out of reach** of my
  harness by construction.

Highest-value next pass, in order: drive money writes end-to-end over HTTP
(settlement → payout → refund as real users, not through the suites); then
concurrency and duplicate-submit; then the realtime socket server.

---

## Environment teardown

```bash
bash QA/shim/restore.sh          # ⚠️ REQUIRED — restores @neondatabase/serverless
pg_ctl -D /Users/ali/.edura-qa-pg/data stop && rm -rf /Users/ali/.edura-qa-pg
kill <pid on :3102>              # the QA app server (NOT your dev server on :3002)
```

Your own dev server (PID 5602, port 3002) was **never touched** — Next.js refused
a second dev server in that directory, so I built and ran on port 3102 instead.
One read-only `GET /api/health` reached it before I noticed; no writes.
