# "View as" — the back office reaches every ERP role (built 2026-08-20 — awaiting review)

Ali asked for the superadmin app to have "the ultimate access to everything that
ERP and every role does". This is what that turned into, why it is a handoff
token rather than the two obvious alternatives, and what it costs.

## The question was never about permissions

`super_admin` already bypasses every role check inside the back office —
`apps/superadmin/src/lib/authz/require-role.ts:7` returns before the allowlist is
consulted. Nothing there refuses a super admin anything.

What was missing is that the ERP's **218 API routes and six role portals do not
exist in that app**, and by construction could not be reached from it:

- `packages/server-core/src/auth/login-policy.ts` maps every role to exactly one
  app. `canSignIn("www", "super_admin")` is false.
- The two apps carry different cookie names (`edura` vs `edura-superadmin`) over
  **different signing secrets**, so a back-office session is unreadable by the
  ERP by construction.
- The existing impersonation (`admin/users/[id]/impersonate`) refuses ERP roles
  in as many words: *"a session minted here is not valid in the main app"*.

So this was a reach problem, not an authorization problem, and the three ways to
solve it are not equally good.

## What was rejected

**Mirroring the ERP inside the back office.** 218 routes and six portals either
duplicated or lifted into a shared package. It fails on two counts: the
duplication drifts, and the drift is discovered in production; and it would give
one stolen back-office session full write access to every centre on the platform
without anybody having to pass through a second door.

**Stretching the back-office cookie across the boundary.** This is the thing the
cookie/secret separation exists to prevent. Undoing it to build a convenience
feature would undo it for everything else too.

## What was built

A signed handoff. The back office mints a token; **the ERP mints its own
ordinary session.** Neither app takes the other's word for anything.

```
superadmin                          browser                         erp
──────────                          ───────                         ───
assertViewAsTarget()  ──token──▶  form POST (top-level nav)  ──▶  claimViewAs()
startViewAs()  (audit row)                                        6 gates
                                                                  real session
                                  ◀── 303 + Set-Cookie ──────────  + impersonated_by
```

- **The token** (`packages/server-core/src/auth/view-as-token.ts`) is
  HMAC-SHA256 over the payload with a dedicated `VIEW_AS_SECRET`, lives **60
  seconds**, names both the target and the actor, and carries a `jti` for a
  single-use backstop. Compare is `timingSafeEqual`; every failure returns the
  same opaque `null`.
- **The claim** (`apps/erp/src/lib/auth/view-as-plugin.ts`) re-decides
  everything: rate limit, signature, replay, **the actor is still a live
  `super_admin`** (re-read, not taken from the token), the target is an ERP role,
  `active` and not soft-deleted. Then a real session via the same
  `internalAdapter.createSession` the invite-token door uses — so the `centerId`
  enrichment hook runs and a centre owner lands with their centre.
- **The window is one hour**, and it is NOT enforced by `expires_at`. See below.
- **The banner** (`apps/erp/src/components/ui/view-as-banner.tsx`) is a *server*
  component reading `auth_sessions.impersonated_by`, so the warning is in the
  first byte of HTML, and its stop control is a plain `<form method="post">` that
  works before hydration.

## The bug the unit proofs could not see

The DB suite was green at 32/32 while **both** things that read
`impersonated_by` were dead.

better-auth returns only the session fields an app **declares** in
`session.additionalFields`. `impersonatedBy` is declared by the admin plugin —
which lives in the *other* app. So on the ERP the column was written correctly to
`auth_sessions` and then silently dropped from `getSession()`. The one-hour cap
never fired, and the banner never rendered. Both failed **open**, and neither
said anything.

The suite passed because `isViewAsExpired` is a correct predicate that was simply
never handed the value, and the banner is not exercised by a DB suite at all. It
took driving the real HTTP path — POST a token, follow the cookie, read the
returned HTML — to find it. The fix is one line in `auth.ts`; the guard against
it coming back is `rawSessionFor` in the test helpers plus the assertion *"
getSession() RETURNS impersonatedBy — the field is declared, not just stored"*.

**The general lesson, worth more than the fix:** a helper that narrows a result
before a test sees it can hide a whole class of bug. `sessionFor()` returns four
chosen fields, so no proof written through it could ever have noticed a fifth
going missing.

## Three more found by looking at the screen

**CSP `form-action 'self'` blocked the handoff, silently.** The back office ships
an ENFORCED `Content-Security-Policy`, and a cross-origin form POST is exactly
what `form-action 'self'` refuses — with no request, no catchable error, nothing
in the console the page can act on. Every curl proof passed, because curl has no
CSP. The fix is a narrow allowlist in `apps/superadmin/next.config.ts`:
`form-action 'self' ${erpFormAction}`, derived from the **same** env var the mint
route posts to so the policy cannot drift from the destination. The ERP's own
`form-action` stays `'self'` — nothing about this needs relaxing on that side.
Frozen by three assertions in `apps/erp/tests/unit/csp-policy.test.ts`, including
one that fails if anyone widens it to a wildcard.

**The banner was missing on the one screen that most needed it.** It was mounted
on `[locale]/dashboard/layout.tsx` only — but `requirePortal` sends an account
with incomplete onboarding to `/onboarding` BEFORE it ever reaches a portal, so
a view-as into a half-set-up centre landed on the wizard with no bar at all,
while the operator typed that centre's real name, governorate and phone. It is
now mounted on the onboarding layout too. Nothing found this but opening a centre
owner's session and watching where it went.

**The banner named the wrong person.** Heading and subtitle both read from
`context.actorName`, so it announced *"viewing as &lt;the super admin&gt;"* while the
sidebar named the teacher — two names for one screen, and the wrong one in the
larger type. The heading now names the account being used (from the session) and
the line beneath it names the admin who opened it. No test would have caught
this; it needed a screenshot.

## Three things that are load-bearing and non-obvious

**1. `expires_at` cannot cap a view-as session.** The claim endpoint writes a
one-hour expiry, and better-auth's rolling refresh (30-day `expiresIn`, 1-day
`updateAge`) pushes it straight back out on the first read. Measured, not
guessed: the proof suite asserted 3600 seconds and read **2592000**. The cap
therefore lives in `session.ts` via `isViewAsExpired`, measured from
`created_at`, which nothing refreshes. The one-hour stamp stays on the row
because it is the honest value at creation, but it is not the enforcement point.

**2. The claim is a plain Next route, not better-auth's HTTP handler.**
better-auth enforces `trustedOrigins` on its own endpoints, and this request
legitimately arrives from the other app's origin — exactly the shape that check
exists to refuse. `apps/erp/src/app/api/v1/auth/view-as/claim/route.ts` calls
`auth.api.claimViewAs` server-side instead, the same pattern the back office
already uses for `impersonateUser`. **The token signature authenticates the
request; the Origin header was never going to.** The token travels as a form
field, never a query parameter, so it stays out of history, referrers and proxy
logs.

**3. `ERP_BASE_URL` is its own variable.** The deploy runbook has the superadmin
project override `APP_BASE_URL` with its own host, so every generic URL resolver
inside the back office answers "the back office" — and a handoff posted there
would send a live credential to a route that only exists in the other app. It
throws in production rather than misdirecting.

## What was NOT weakened

- `login-policy.ts` is untouched. A `super_admin` still cannot type their way
  into the ERP; the proof suite asserts it after everything else has passed.
- The cookie/secret separation is untouched. What crosses is a signed 60-second
  payload, never a session.
- The in-app impersonation is untouched and now has a strict complement: it takes
  back-office targets and refuses ERP roles, `assertViewAsTarget` takes ERP roles
  and refuses back-office ones. **Exactly one mechanism per target, never a
  choice and never an overlap.**

## What this DOES cost — money, stated plainly

Ali was offered "block money routes during view-as" as the recommended option and
**chose full write access including money** (payments, wallets, refunds,
payouts), on 2026-08-20. So:

- The binding invariant **"MONEY IS READ-ONLY IN THE BACK OFFICE, and superadmin
  is NOT exempt"** is now qualified. It still holds *of the back-office app* —
  `admin-users.ts` imports no money service and the proof still reads its import
  list — but a super admin can move money by being an ERP user in the ERP app.
  CLAUDE.md carries the amendment; leaving the old sentence standing unqualified
  would have made the file lie.
- What makes it traceable rather than invisible: every money write already
  carries its own ledger row and audit, the session behind it carries
  `impersonated_by`, and the window is bracketed by `user.view_as_requested`
  (back office, at mint) and `user.view_as_claimed` / `user.view_as_ended` (ERP)
  — three rows naming the same super admin.

## The single-use guard is best-effort, and says so

The `jti` replay check is a read-then-write against `audit_logs`, not a unique
index, so two requests in the same millisecond could both pass. A dedicated
nonce table would have needed a migration for a value that lives sixty seconds.
The real gates are the signature and the TTL; this is a backstop on top of them.
It is written down here rather than left to be discovered.

## Proofs

- `apps/erp/tests/db/view-as.test.ts` — **34/34**, live DB, real better-auth
  pipeline. Token forgery/tamper/expiry; a demoted actor, a suspended actor, a
  teacher or accountant as actor; a back-office, suspended or soft-deleted
  target; the successful claim's role, `centerId`, `impersonated_by` and audit
  row; the one-hour cap; single use; and C-04 still refusing a super admin at the
  password door.
- `apps/superadmin/tests/db/admin-users.test.ts` — **67/67** (was 52). The new
  section 7b covers `assertViewAsTarget`'s five refusals and `startViewAs`'s
  token + audit row, including that the audit row carries the token's own `jti`
  so the request can be tied to the ERP's claim.
- **End-to-end in a real browser**: the button renders in the actions card of
  the user record (and is correctly absent for a `super_admin` target, where the
  in-app impersonation is absent too); its confirm dialog states the money
  consequence; the handoff lands in the teacher portal with the banner sticky
  across screens, naming the teacher as the account and the admin as the opener;
  "end view-as" kills the session (401 afterwards) and writes the closing audit
  row. Repeated for the parent portal (including its wallet screen) and the
  centre portal (overview + counter board). This pass found all three defects
  above.
- **End-to-end over real HTTP** against a running dev server: the form POST
  returns 303 + `Set-Cookie`; `/api/v1/me` with that cookie answers as the
  teacher; the teacher portal renders the banner naming the super admin and the
  money warning; `POST /api/v1/auth/view-as/stop` returns 303 to the superadmin
  host, clears both cookies, and the session is 401 afterwards; `audit_logs`
  shows the `view_as_claimed` / `view_as_ended` pair on the super admin. This is
  the pass that found the `impersonatedBy` bug above.
- Regression: erp `c04-login-parity` 48/48, `c03-status-revocation` 30/30,
  `l1-session-invalidation` 13/13; superadmin `c04-login-boundary` 29/29,
  `c03-status-revocation` 16/16. `check-types` green across all 9 packages.

**No database migration was required** — `auth_sessions.impersonated_by` already
existed.

## Deliberately not built

- **A view-as session cannot start another one.** Nothing enforces it explicitly;
  it falls out of the fact that the mint route requires a `super_admin` session
  in the back office, which a view-as session is not.
- **No read-only mode.** It was offered and declined; if it is ever wanted, the
  hook is one gate in the claim endpoint plus a flag on the session row.
- **No time extension.** Ending and restarting is one click and produces a fresh
  audit pair, which is better than a renewable window.
