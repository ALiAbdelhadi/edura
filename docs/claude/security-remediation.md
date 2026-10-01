# Security remediation progress and required production env vars (full text)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## Security remediation progress (BATCH 1 + BATCH 2, from docs/security/security-audit.md)

Findings fixed one-at-a-time, each with a proof, stop-per-fix. See
docs/security/security-audit.md for the full report and severities.

**DONE (reviewed + accepted):**
- **C1** — mock payment gateway can't settle real money in prod (PAYMENTS_MODE
  must be explicit; PAYMOB_HMAC_SECRET required, no fallback; mock-complete
  404s in prod; timingSafeEqual HMAC compare).
- **C2 + H5** — login rate-limiting + dummy-hash constant-time compare in BOTH
  apps' sign-in path (NextAuth authorize() at the time; better-auth since
  2026-08-01) (closes brute-force + email enumeration).
- **H1** — payout-request TOCTOU: `SELECT … FOR UPDATE` on the beneficiary in
  teacher/center wallet + generatePayouts.
- **H2** — payout-settlement floor: conditional decrement (updateMany where
  balance >= net) + DB `CHECK (wallet_balance >= 0)`.
  **[dev, verified 2026-07-26]** DONE — `centers_wallet_balance_nonneg` is
  `convalidated = true`, zero negative rows, minimum balance 0. The legacy
  -2600 row is gone (the Step 9 wipe removed it) and the constraint was
  validated afterwards.
  **[superseded — VALIDATED at the 2026-07-31 production bootstrap; verify-db
  asserts `convalidated` since 2026-08-20.]**
  **[production, verified 2026-07-26]** the constraint
  exists but is still `NOT VALID` — validating it there is part of the
  production bootstrap, not a leftover from the wipe. The note that previously
  stood here ("NOT VALID — one legacy -2600 row left; VALIDATE after") read as a
  pending dev TODO and was wrong in both directions.
- **H3** — refund double-refund TOCTOU: partial unique
  `transactions_one_refund_per_payment` on (reversal_of_id) WHERE type='refund'.
- **H4** — security headers on both apps (HSTS, nosniff, Referrer-Policy,
  X-Frame-Options DENY/superadmin + SAMEORIGIN/www) + a **Report-Only** CSP
  (allows Cloudinary img, the realtime socket connect-src on www, Paymob
  frame-src on www; self-hosted fonts). CSP still needs tightening to a
  nonce-based script-src before flipping to enforce.
  **[superseded 2026-09-06 — M-09 made script-src nonce-based and the CSP ENFORCES
  by default in both apps; `CSP_MODE=report-only` is the opt-out. See
  `lib/security/csp.ts`.]**
- **M1** — webhook claim + settlement in ONE transaction (self-heals on
  redelivery; no charged-but-empty intent); idempotent replay preserved.
- **M2** — split the shared secret: REALTIME_JWT_SECRET + INTERNAL_API_SECRET
  are dedicated + required in prod (fail closed); NEXTAUTH_SECRET fallback is
  dev-only.

**REMAINING at the time (in priority order) — [2026-09-24] every item below is
marked Done except M3 (awaiting review) and Step 10:**
- **M3** — shared-store (Redis) rate limiter + trusted client-IP hop.
  *Implemented + proven, awaiting review* (adds REDIS_URL / TRUSTED_PROXY_HOPS /
  TRUSTED_CLIENT_IP_HEADER; falls back to in-memory when REDIS_URL unset —
  outside production only; since 2026-08-29 production refuses to boot
  without it, see `REDIS_URL` below).
- **M4** — *Done (verified 2026-08-26):* `toErrorResponse` in the shared kernel
  (`packages/server-core/src/errors/http.ts`, both apps' `@/lib/errors/http`
  re-export it) logs the real error server-side in every environment and
  returns a fixed "Internal error" for the unhandled branch in production;
  AppError / mapped-Prisma messages stay intentional. Proof:
  apps/erp/tests/unit/m4-error-messages.test.ts (4/4).
- **M7** — cron auth: require CRON_SECRET unconditionally (fail closed if
  unset) and drop the side-effectful GET alias.
  *Done (2026-07-20):* `authorized()` returns false when CRON_SECRET is unset
  in EVERY env (no `NODE_ENV` bypass); `GET = POST` alias removed so the
  data-mutating jobs are POST-only (plain GET → 405). Proof in
  apps/erp/tests/unit/m7-cron-auth.test.ts.
- **Dependency overrides** — root `package.json` `overrides`, to clear
  dev/build-time advisories in transitive tooling.
  **[2026-08-27] READ THIS BEFORE WRITING AN OVERRIDE. The mechanism this bullet
  described for a month does not exist.**

  **`bun` (measured on 1.3.12; not re-measured on 1.4.2 — assume it still holds)
  SILENTLY IGNORES `"pkg@major"` OVERRIDE KEYS.** Not a warning,
  not an error — the key is accepted, written into `bun.lock`'s overrides block,
  and never applied. It also ignores npm-style nested overrides
  (`{"eslint": {"brace-expansion": "…"}}`). **Only a flat, unversioned key
  works.** Consequence: the seven keys this bullet used to credit for the
  2026-07-20 cleanup — `minimatch@3`, `brace-expansion@1`, `brace-expansion@2`,
  `picomatch@2`, `picomatch@4`, `postcss@8`, `uuid@8` — **never did anything at
  all.** Those advisories cleared because the packages moved on their own. All
  seven have been REMOVED (2026-08-27): a key that does nothing while looking
  like protection is worse than no key. Proof it was safe: removing the six
  survivors and re-resolving left all **1296** lock resolutions byte-identical.

  **`bun install` ALONE DOES NOT RELINK CONSUMERS — `bun install --force` DOES.**
  After a plain install, the patched version is added at the TOP of the tree
  while every transitive consumer stays linked to the vulnerable one. Measured
  2026-08-27: `bun audit` moved 9 → 7 and both versions sat in
  `node_modules/.bun`, while `posthog-js` still linked `dompurify@3.4.12` and
  `ajv@8.20.0` still linked `fast-uri@3.1.4`. `--force` relinked both.

  **SO VERIFY AT THE CONSUMER, NEVER BY LISTING `node_modules`.** The patched
  version being present proves nothing — an orphan copy nothing imports looks
  exactly the same. Check the edge that matters:

  ```bash
  bun -e "console.log((await Bun.file('node_modules/.bun/posthog-js@1.409.5/node_modules/dompurify/package.json').json()).version)"
  ```

  *Current state (2026-08-27):* overrides are `flatted`, `@hono/node-server`,
  `sharp`, `valibot`, `find-my-way`, plus the four added this day — `nanoid`
  (^3.3.18), `js-yaml` (^4.3.2), `fast-uri` (^3.1.6), `dompurify` (^3.4.14) —
  all unversioned, all verified at the consumer link. `bun audit` **9 → 5**;
  check-types 9/9, `bun run build` 3/3 apps, erp route census unchanged at
  342 ƒ / 3 ○ / 31 ●. The five that remain are documented as STAYING, with
  reasons, in [docs/follow-ups.md](../follow-ups.md) entry 2 and
  [docs/security/dependency-audit-2026-08-27.md](../security/dependency-audit-2026-08-27.md):
  `brace-expansion` ×3 cannot be expressed at all (its two vulnerable copies need
  opposite majors and bun offers only one tree-wide key — forcing either breaks
  the other's API), and `uuid` / `deepmerge-ts` are Tier B (unreachable, and no
  in-major fix, respectively).

  **`brace-expansion` IS ALSO A ROOT `dependency` (^5.0.9).** It is not
  application code and no file imports it, so `knip` and `depcheck` report it
  dead every time. **The old rationale here — that it "anchors" the
  `brace-expansion@1`/`@2` pins — is void, because those pins never held
  anything.** Its real effect is now unverified. Leave it for the moment, but
  treat re-checking it as its own small task, not as settled fact.

  **[2026-08-28] SUPERSEDED — a since-removed sentence here is no longer
  true.** It said no
  security-sensitive runtime dep had been bumped. On 2026-08-28 `node_modules`,
  every `.next`/`.turbo` and `bun.lock` were deleted and reinstalled from
  scratch, and re-resolution moved four of them inside the ranges package.json
  already declared: **next 16.2.12 → 16.3.0**, **prisma and @prisma/client
  7.9.0 → 7.10.0**, **jose 6.2.4 → 6.2.10**, **nodemailer 9.0.3 → 9.0.6**. The
  first two are MINOR, not patch. `react`, `bcryptjs`, `zod`, `socket.io`,
  `better-auth`, `ioredis` and `typescript` did not move.

  **`bun audit` is now 2 (1 high, 1 moderate), not 5.** Three of the five
  documented above as STAYING were resolved by the newer transitive versions
  that clean install picked up — so read that list as a snapshot of
  2026-08-27, not as current. No manifest was edited to achieve any of this;
  1217 → 1223 resolutions, 230 version changes, 6 additions, nothing removed.

  Verified on the new set the same day: prisma client generates, check-types
  9/9, `bun run build` 3/3 apps, erp unit suite 1447 passed / 1 skipped —
  identical counts to before. The DB suites and E2E were NOT run locally
  against it; CI is what covers those.
- **M5** — *Done (2026-08-29).* `sendTempStudentInvite` already refused a foreign
  centre and an unrelated teacher; measured, that half was never missing and this
  list was stale about it. What WAS missing is that neither branch required
  membership to be CURRENT: the centre check read the roster row without
  `leftAt IS NULL`, and the teacher check accepted any enrollment regardless of
  `status`. So a centre a child had left, and a teacher a child had unenrolled from,
  could both still send that child's invite code — which is a claim credential: it
  merges the temp student's history into whoever redeems it. Both branches now
  require current membership, the centre one through the shared
  `services/center/roster-membership.ts`. Proof:
  apps/erp/tests/db/temp-student-invite-ownership.test.ts (9/9; the two holes are
  `<<SUCCEEDED>>` against the previous service).
- **M6** — *Done, and this list was stale (verified 2026-08-29).* The magic-byte
  check exists and guards BOTH upload paths — `assertPdfBytes` at
  packages/server-core/src/services/materials/materials.ts:121 (create) and :326 (replace) —
  each alongside a declared-content-type check and the 10 MB cap. It is covered by
  apps/erp/tests/unit/m6-materials-magic-bytes.test.ts (4/4: spoofed and genuine, on
  both paths). No code change was needed; only this entry was wrong.
- **M8** — *Done (2026-08-26):* the last `$queryRawUnsafe` (a fully static
  query in `packages/database/scripts/reconcile-wallets.ts`) converted to the
  tagged-template `$queryRaw` (byte-identical behaviour, proven by a dry run
  against dev), and `apps/erp/tests/unit/m8-no-raw-unsafe.test.ts` scans
  apps + packages so `$queryRawUnsafe` / `$executeRawUnsafe` can never
  reappear without a red test.
- Then **Step 10** — final cleanup pass (batch the remaining L-findings).
  [2026-09-24: "flip the CSP to enforce" was done by M-09; the centers wallet CHECK
  is VALIDATED on every environment and verify-db asserts it.]

### BATCH 3 (L-findings)
- **L1** — password reset/change now invalidates pre-existing 30-day JWT
  sessions (server-side revocation for otherwise-stateless tokens).
  *Done (2026-07-20 — awaiting review):*
  [HISTORY — mechanism replaced 2026-08-01: JWTs and the NextAuth `jwt` callback are
  gone; better-auth DB sessions are hard-revoked by the `users_revoke_sessions` trigger
  that fires on the `token_version` bump — see better-auth-migration.md.]
  new `users.token_version` int
  (migration `20260720180000_user_token_version`, default 0, backfilled 0 so
  no one is logged out on deploy). Every JWT records `ver` at issue time (both
  apps' `authorize` return it + the manual `/api/v1/auth/login` encode); the
  NextAuth `jwt` callback re-reads `token_version` on EVERY request and strips
  all claims (→ no session user → logged out) when the token's `ver` trails the
  column or the user row is gone. `resetPassword` bumps `token_version` in the
  SAME tx as the new hash. The check lives in BOTH apps' callbacks, and the
  column is shared, so a reset also revokes a stolen super_admin/accountant
  session. Cost: one indexed PK lookup per request (cacheable later). Proof
  (live DB, real authorize + jwt/session callbacks + real resetPassword),
  12/12: apps/erp/tests/db/l1-session-invalidation.test.ts — pre-reset token
  accepted → reset bumps ver → same token now rejected → unrelated session
  still valid → old password stops working → fresh login (ver 1) accepted.
  Note: `me/credentials` (set-once first password for walk-ins) deliberately
  NOT bumped — no prior password to revoke.

### Env vars now REQUIRED in production (deployment must set these)
Missing any of these fails closed (refuse to boot / hard error) — by design.
- `PAYMENTS_MODE` — must be explicit: `mock` | `sandbox` | `live` (C1).
- `PAYMOB_HMAC_SECRET` — required in prod, no fallback (C1).
- `PAYMOB_INTEGRATION_IDS` — comma-separated Paymob integration ids this
  deployment settles for (docs/security/security-audit-2026-09-06.md H-04). When `PAYMENTS_MODE` is not
  `mock` and this is unset, EVERY capture is parked as `needs_review` with
  `unknown_integration` — it fails closed rather than settling a callback from
  an integration nobody here owns. In mock mode an unset value means "any".
- `REALTIME_JWT_SECRET` — dedicated realtime handshake secret (M2).
- `INTERNAL_API_SECRET` — dedicated server↔server bridge secret (M2).
- `CRON_SECRET` — guards `/api/v1/cron/[job]`; required in EVERY environment
  (endpoint fails closed / rejects all requests when unset, no bypass) (M7).
- `STUDENT_QR_SECRET` — signs every student ID card's QR. Required in prod, no
  fallback: a card signed with a guessable value is forgeable, and nobody finds
  out until someone is marked present at a lesson they never attended. **Both
  apps must be given the SAME value** — a card rendered in the back office has
  to verify at a www counter. In development it falls back to a fixed literal
  (deliberately NOT the app secret, whose value differs per app). Rotating it
  invalidates every printed card at once; reissue is per-student and is the
  intended tool.

- `VIEW_AS_SECRET` — signs the back-office "view as" handoff token. Required in
  prod, no fallback (same posture as `STUDENT_QR_SECRET`, and the same hazard:
  a handoff signed with a guessable value is a forgeable session). **Both apps
  must be given the SAME value** — apps/superadmin signs and apps/erp verifies,
  so a mismatch is indistinguishable from a forgery. Rotating it invalidates
  only tokens in flight, which live 60 seconds, so rotation is cheap.
- `ERP_BASE_URL` — on **apps/superadmin only**: where a handoff is posted. Its
  own variable because the deploy runbook overrides `APP_BASE_URL` on that
  project with its own host, so every generic resolver there would answer "the
  back office" and send a live credential to a route that does not exist in it.
  Throws in production rather than misdirecting.
- `SUPERADMIN_BASE_URL` — on **apps/erp only**: where "end view-as" returns the
  browser. Falls back to localhost in development.
- `NEXTAUTH_URL` — must be an `https://` URL on Vercel production
  (`VERCEL_ENV=production`), or the app refuses to boot: an http base URL
  would mint auth cookies without `Secure` (AUTH-09, 2026-09-11 audit;
  `apps/erp/src/lib/auth/auth.ts`).

- `TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` — how the client IP is read.
  On Vercel in production, `assertSharedRateLimitStore` REFUSES to boot unless one
  of them is set (L-12). **[2026-09-20] The code no longer depends on getting the
  hop count right.** `trustedClientIp` reads a platform-set header first — the
  configured one, else `x-vercel-forwarded-for` when `VERCEL` is set — and only
  then does XFF arithmetic, because `TRUSTED_PROXY_HOPS=1` (what production sets)
  is correct ONLY while the edge appends to `x-forwarded-for`, which nothing
  inside the app can verify. It also now returns an IP or `"unknown"` and nothing
  else: the value lands in a Redis key, `audit_logs.ip_address` and
  `contact_submissions.ip`, so an unparseable header used to mean an unbounded key
  and free text in an audit column. Proof:
  `apps/erp/tests/unit/m3-rate-limit.test.ts` — three of its cases fail against the
  previous implementation.
- `EDURA_PROXY_SECRET` — **[2026-09-30, backend separation phase 2]** the client-IP
  trust chain between the ERP frontend and `apps/api`. `apps/erp/src/proxy.ts`
  deletes any inbound `x-edura-client-ip` / `x-edura-proxy-auth` on every `/api/**`
  request on the canonical host and, when the secret is set, stamps the IP
  `trustedClientIp` derives there plus the secret. `apps/api` accepts the stamp only
  on a constant-time secret match (`resolveProxiedClientIp`), writes it into the one
  slot `trustedClientIp` reads first, and strips both headers before any handler;
  without a match it falls back to its own edge headers. REQUIRED in production for
  `apps/api` (boot refuses without it) and set to the SAME value on `apps/erp`;
  rotate both together. NOT yet proven: that Vercel forwards middleware-set request
  headers across the external rewrite to Railway, and which header Railway's edge
  sets — both need a staging deploy. An `/api` URL containing a dot skips the
  proxy matcher and so reaches the service unstamped (fallback path; no route has
  one today).
- `REDIS_URL` — the shared rate-limit store. **Required in production since
  2026-08-29 (M-C)**: without it the limiter falls back to a per-process in-memory
  bucket, and on serverless every concurrent lambda holds its own, so the login caps
  that exist to stop brute-forcing a child's account are decorative. Asserted at BOOT
  (`assertSharedRateLimitStore`, called from each app's `instrumentation.ts`), so a
  missing store fails the deploy rather than a request. Must be `rediss://`;
  plaintext `redis://` needs `ALLOW_PLAINTEXT_REDIS=1`, and a deliberate
  single-instance deploy can accept the weaker guarantee with
  `ALLOW_UNSHARED_RATE_LIMIT=1`. `TRUSTED_PROXY_HOPS` should match the deploy's proxy
  depth. **[2026-09-30, backend separation phase 3]** the same store now also
  holds the PUBLIC-data cache (`server-core/src/cache/public-store.ts`: catalog,
  discovery rows, public profiles, nothing else) under
  `pubcache:v1:<env>:<tag>:<gen>:<sha256>`, replacing Next's data cache so that
  apps/erp and apps/api read and expire one copy. A Redis failure serves the read
  from the database, never an error. Money, wallets, subscriptions, attendance,
  messaging, auth/session and per-user data are never put there
  (`apps/erp/tests/unit/use-cache-scope.test.ts` keeps the reviewed caller list).
- `API_SERVICE_URL` — **[2026-09-30 phase 3; REQUIRED since 2026-10-01, phase 4]**
  apps/erp only: the `apps/api` origin. The ERP holds no route of its own, so
  every prefix in `apps/erp/src/lib/http/service-routes.ts` (now including
  `/api/health`) is always rewritten there (`beforeFiles`), and server components
  call it through `src/lib/server/service-fetch.ts`. Unset: development targets
  `http://localhost:${API_PORT ?? 3006}`; a production server throws; a Vercel
  production build is refused. Must be `http(s)://`. There is no variable-level
  rollback any more — rollback is reverting the phase 4 commit. Proven locally
  (dev) through a capturing hop: a browser-set `x-edura-client-ip` is stripped and
  the real IP stamped with the proxy secret, the query string arrives unchanged,
  and a signed-in request is answered 200 on the service. Still unproven on
  Vercel → Railway (see `EDURA_PROXY_SECRET`).
- `ADMIN_API_SERVICE_URL` — **[2026-10-01, phase 5] REQUIRED**, apps/superadmin
  only: the `apps/admin-api` origin. The back office holds no route of its own;
  every prefix in `apps/superadmin/src/lib/http/service-routes.ts` is rewritten
  there (`beforeFiles`) and the dashboard layout reads its session through
  `src/lib/server/service-fetch.ts`. Unset: development targets
  `http://localhost:${ADMIN_API_PORT ?? 3007}`; a production server throws; a
  Vercel production build is refused. `apps/superadmin/src/proxy.ts` now runs on
  `/api/*` and strips a browser-set `x-edura-client-ip` / `x-edura-proxy-auth`
  before stamping with `EDURA_PROXY_SECRET`, which must be the SAME value on
  `apps/superadmin` and `apps/admin-api`. `apps/admin-api` refuses to boot in
  production without that secret, `SUPERADMIN_NEXTAUTH_SECRET`, an `https://`
  `NEXTAUTH_URL` and the shared rate-limit store. Rollback is reverting the
  phase 5 commit. Unproven on Vercel → Railway.
