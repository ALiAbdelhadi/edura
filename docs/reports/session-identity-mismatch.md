# The screen said one person, the server said another

> **Filed 2026-08-09** from a browser session on **dev** (`localhost:3002`, `next dev`).
> **Status (2026-08-10): CLOSED — reproduced, cause established, A + B + C done
> and verified on the wire.**
> The flip is real and is decided by cookie ORDER (§1). The mechanism the ticket
> first guessed at was wrong, and the correction is the useful part: parallel dev
> servers REPLACE the cookie rather than duplicate it (§2), so the
> `session_conflict` guard cannot catch the case that actually caused this — the
> port-scoped dev prefix (§4) is what covers that half, and the two together
> cover both. The sign-out finding turned out to be the same root cause and is
> fixed (§5). Judged **dev-only** for the flip itself (§3): production has one
> www hostname and one cookie. Everything shipped is production-safe and two of
> the three are production-relevant on their own.

## What happened

While verifying a copy change on the parent Fees screen, the portal rendered as
**ولي الأمر «أ. سامي عبد الرحمن»** — his name in the sidebar, his children in the
selector, his wallet balance — while the **server was serving a different
person**. Paying from the wallet was refused with:

```
Role 'center_admin' is not allowed (need one of: student, parent)
```

`GET /api/v1/me`, fetched from that same page, returned:

```json
{ "email": "admin@nile-academy.eg", "role": "center_admin" }
```

The identity then **flipped back and forth across navigations** without any
sign-in or sign-out in between. At one point four consecutive `/api/v1/me`
probes returned the parent; one full page navigation later, the shell rendered
**«Demo Admin — مسؤول»** and the center portal.

## Why this is worth a ticket rather than a shrug

The observation is on a developer machine with several accounts used in one
browser, and it may well be a local artifact. It is filed anyway because the
failure mode — **the interface naming one account while the server acts as
another** — is the one class of bug this product cannot absorb quietly:

- Every money action is authorised server-side against the *session*, and every
  money screen is labelled client-side from `me`. A mismatch means a person can
  be looking at one family's balance while their next click is executed as
  somebody else.
- Two of the roles involved (`center_admin`, `center_staff`) hold cash-drawer
  and roster authority over other people's children.
- The refusal the user actually saw ("Role 'center_admin' is not allowed") is
  unintelligible to a parent. Whatever the cause, the app should not answer a
  parent's payment with the name of a role they have never heard of.

It was **not** a product data problem: the payment that eventually succeeded
wrote correctly (`RCP-PAYDEMOSADA-2026-00001`, 300.00 EGP, `payer_user_id` set,
wallet 750 → 450, one subscription, one enrolment, one ledger transaction).

## What is proven, and what is not

**Proven, from this session:**

- Two different `edura.session_token`-bearing identities were live in one
  browser profile against one origin, and the server resolved *different ones*
  for requests issued seconds apart from the same page.
- A single `POST /api/auth/sign-out` returned `/api/v1/me` to 401, and yet the
  other identity re-appeared afterwards. Only **four** sign-outs in a row, then
  a fresh sign-in, produced a session that stayed stable.
- Both apps' cookie prefixes are distinct — `edura` (www) and `edura-superadmin`
  (superadmin) — so this is **not** a www/back-office collision.
  (`apps/www/src/lib/auth/auth.ts:80`, `apps/superadmin/src/lib/auth/auth.ts:66`.)
- Only one www dev server was running (port 3002). Cookies ignore ports, so a
  session minted earlier by another www dev server on the same host (the
  `launch.json` entries use 3021 / 3042 / 3051) shares this cookie jar.

**Not established:**

- Whether two cookies of the same name coexisted (differing in `Path` or
  `Domain`), or one cookie was being overwritten and re-sent.
- Whether the shell's identity came from a *stale response* rather than a
  different session — no service worker and no Cache Storage were registered at
  the time, which rules out the PWA layer but not HTTP or router caches.
- **Whether any of this can happen in production at all.**

## Candidate causes, and the test that settles each

1. **Two cookies, one name.** Two `edura.session_token` entries differing by
   `Path` or `Domain`; the server reads whichever the browser lists first, and
   that order can change.
   *Test:* reproduce, then read the raw `Cookie:` request header server-side
   (or DevTools → Application → Cookies) and count entries by that name.
2. **Cross-port bleed on `localhost`.** A session minted by a www dev server on
   another port lands in the same jar under the same name.
   *Test:* sign in on `:3042`, then load `:3002` without signing in, and see
   whose session answers.
3. **A cached identity response.** `GET /api/v1/me` is `force-dynamic`, but the
   JSON envelope sets **no `Cache-Control: no-store`**
   (`apps/www/src/lib/http/envelope.ts`). Nothing proves a cache was involved
   here — but an identity response with no cache directive is a hazard on its
   own once a CDN or a corporate proxy sits in front of the app.
   *Test:* `curl -i` the endpoint with a valid session and read the headers.

## Proposed work

**A. Add `Cache-Control: no-store` to every authenticated API response**
(the envelope helper is the single place). Do this regardless of the root
cause: it is one line, it cannot regress anything, and it removes an entire
class of "someone else's data was served to me" from consideration.

**B. Make a role mismatch self-correcting instead of cryptic.** When a route
refuses with `forbidden` *because the session's role is not the one the screen
was built for*, the client should treat it as "your session is not who this
screen thinks you are": re-fetch `me`, and if the role differs from the portal
being rendered, sign out and send the user to the login screen with a plain
sentence. Today it surfaces an internal string in English to an Arabic-first
parent, and leaves them staring at a screen that still has their name on it.

**C. Then reproduce (2) and (1) and fix the cause.** If it turns out to be
cross-port dev bleed only, the cheapest durable fix is to include the port in
the dev cookie prefix so parallel www dev servers cannot share a session — and
this report can be closed as dev-only, with A and B kept.

## Diagnostic recipe

```bash
# 1. sign in as two different roles in the same browser profile, on two ports
#    (e.g. :3002 and :3042), then load one of them and read:
#      DevTools → Application → Cookies → count entries named edura.session_token
# 2. from the page console, probe identity repeatedly across navigations:
#      for (let i=0;i<5;i++) console.log(await (await fetch('/api/v1/me',{credentials:'include'})).json())
# 3. check the response headers of an authenticated call:
#      curl -i -H "Cookie: edura.session_token=…" http://localhost:3002/api/v1/me | head -20
```

## Reproduced — 2026-08-10, independently, against dev

Everything below was measured against `apps/www` on `localhost:3002`, with two
real sessions minted through the real sign-in door. Two accounts from the dev
quick-login tiles (`admin@nile-academy.eg` = `center_admin`,
`lina.hassan@student.nile-academy.eg` = `student`, `mona.hassan@email.eg` =
`parent`).

### 1. The flip is real, and it is decided by COOKIE ORDER

Presenting both session tokens on one request, to better-auth's own
`/api/auth/get-session` (the primitive under `getSessionUser`):

| `Cookie:` header | who answered |
| --- | --- |
| `…=A` | `admin@nile-academy.eg` (`center_admin`) |
| `…=B` | `mona.hassan@email.eg` (`parent`) |
| `…=A; …=B` | **`admin@nile-academy.eg`** |
| `…=B; …=A` | **`parent`** |

Same browser, same origin, same second — the identity the platform serves is
whichever token the header happens to list first. This confirms candidate cause
(1) and it is a property of the framework's cookie read, not of dev.

### 2. But cross-port bleed CANNOT produce that header — candidate (2) is wrong

Candidate (2) assumed two dev servers on `localhost` leave two cookies in the
jar. They do not. A cookie's identity is **name + domain + path** (RFC 6265
§5.3); **the port is not part of it**. Two www dev servers therefore mint
cookies with an *identical key*, and the jar **replaces** rather than
accumulates. Probed with the byte-identical `Set-Cookie` this app sends
(`edura.session_token=…; Path=/; HttpOnly; SameSite=Lax`) served from two ports
into one jar:

```
entries named edura.session_token in the jar: 1
   edura.session_token = SESSION_FROM_PORT_3042_parent
* Replaced cookie edura.session_token="SESSION_FROM_PORT_3002_admin"
      for domain localhost, path /
```

So parallel dev servers do not give you two identities to choose between — they
give you **one cookie whose owner silently changes underneath you**. That still
produces the reported symptom (identity flips across navigations with no
sign-in and no sign-out), by a different route than the ticket assumed.

**Consequence — this is why there are two fixes and not one:** the
`session_conflict` guard fires only when *two* tokens are presented. Under
replacement there is exactly one cookie, perfectly valid, belonging to the wrong
person — **the guard never fires, and cannot**. Fix C as originally written (put
the port in the dev cookie prefix) is what covers this half, and it is now
implemented (§4). Neither fix is redundant; they catch different failures.

### 3. Where two cookies *can* come from — and whether production is exposed

Two entries require a differing `Domain` or `Path`. This app sets neither:
better-auth issues host-only cookies at `Path=/` (observed above). So within one
host, the app cannot mint the ambiguous header by itself. The realistic sources
are a cookie left by a *different* configuration of the same host — a
`Domain=.edura.eg` cookie if www is ever served from both the apex and
`app.edura.eg`, or a stale non-`__Secure-` cookie surviving a scheme change.
Neither exists today.

**Assessment: the flip as reported is dev-only** — it needs more than one www
instance on one hostname, which is a `launch.json` fact, not a production one.
The guard is still worth keeping: it is the difference between "two identities
and we picked one" and "two identities so we refused", and the day a second
hostname appears it is already there.

### 4. The gap is now closed — the dev cookie prefix carries the port

`devScopedCookiePrefix` (`@repo/server-core/auth/session-cookies`) appends the
running port in development only, and **both** apps use it — www through
`lib/auth/cookie-prefix.ts`, the back office through a new file of the same name,
because `.claude/launch.json` runs superadmin on 3004 **and** 3037 and the hole
there was identical. `PORT` is what Next's dev server exports for `-p`; that was
not assumed but checked — a server started with `next dev -p 3002` now issues:

```
set-cookie: edura-3002.session_token=…
```

Production is untouched by construction (`NODE_ENV !== "development"` returns
the bare name), which matters: a cookie name that varied per instance would sign
people out whenever a request landed on a different serverless box.

Proof: `apps/www/tests/unit/session-cookie-prefix.test.ts` — both branches, the
www/back-office separation holding at every port, junk `PORT` falling back
rather than producing a malformed name, and the assertion that ties the two
fixes together: **after a replacement there is exactly one token, so
`isSessionAmbiguous` is `false`** — the case the conflict guard cannot see.

### 5. Verified as fixed

- `cache-control: no-store` is on a live authenticated response
  (`GET /api/v1/me`, checked on the wire, not in the source).
- Two cookies now get `401 {"code":"session_conflict","message":"Multiple
  sessions present"}` instead of a coin-flip identity.
- **The sign-out finding is fixed and I confirmed it.** One `POST
  /api/auth/sign-out` presenting two live tokens now returns 200 and leaves
  **both** dead (each re-probed individually afterwards). Before the fix,
  better-auth revoked only the token it resolved — which is the whole of the
  "four sign-outs were needed" note below.
- **The refusal the parent actually saw now carries a machine-readable reason.**
  Live, from a teacher session against a parent-only route:

  ```
  403  cache-control: no-store
  {"error":{"code":"forbidden",
            "message":"Role 'teacher' is not allowed (need one of: parent)",
            "details":{"reason":"role_mismatch","role":"teacher",
                       "allowed":["parent"]}}}
  ```

  The English string stays (proofs and call sites read it) — what is new is
  `details.reason`, which is what lets the client tell this apart from every
  other 403 without parsing prose.

- **The notice now states the RIGHT fact.** `SessionIntegrityGuard` was
  redirecting *both* causes to `?reason=session_conflict`, whose copy reads
  "this browser was holding more than one session". For a role mismatch that is
  simply untrue — the browser held exactly one, belonging to someone else — and
  a safety notice that misdescribes what happened is worse than a vague one. A
  role mismatch now sends `?reason=session_mismatch` with its own ar/en string
  ("الصفحة التي كنت فيها لا تخص الحساب المسجَّل دخوله في هذا المتصفح. لم يتغيّر
  أي شيء."). Both variants checked in the browser, ar/RTL and en/LTR.

### Two things that bit me, worth knowing before you re-run any of this

- **`edura-sidebar-preview` (3042) and `edura-www` (3002) are the same app
  directory**, so two `next dev` processes contend for one `apps/www/.next`.
  Starting the second took the first down. Use `next dev -p … --turbo` against a
  separate dist dir, or do not run both.
- **The dev DB is shared with other sessions.** Mid-experiment, two sessions I
  had just minted were dead before I revoked them — a concurrent suite or a
  `users.status`/`token_version` write fires `users_revoke_sessions` and deletes
  rows out from under you. Every measurement above was re-run with a control
  probe immediately before the action, and only those are reported.

## What shipped

| | Change | Where |
| --- | --- | --- |
| A | `Cache-Control: no-store` on every enveloped API response | `packages/server-core/src/http/envelope.ts` (both apps) |
| B | `requireRole` marks a refusal `details.reason = "role_mismatch"`; the client confirms with `me` and only then ends the session | `lib/authz/require-role.ts`, `lib/api/client.ts`, `components/providers/session-integrity-guard.tsx`, login-page notice + ar/en copy |
| C₁ | Ambiguous request (two tokens) fails closed with `401 session_conflict` instead of resolving one | `@repo/server-core/auth/session-cookies`, both apps' `lib/auth/session.ts` |
| C₂ | Port-scoped dev cookie prefix, so parallel dev servers cannot overwrite each other | `devScopedCookiePrefix`, both apps' `lib/auth/cookie-prefix.ts` |
| C₃ | Sign-out revokes **every** session the browser presented, not just the resolved one | both apps' `app/api/auth/[...all]/route.ts` |

Proofs: `session-cookie-prefix.test.ts` (prefix branches, the ambiguity/replacement
split, and the cookie-value → `auth_sessions.token` mapping the revoke depends
on), `session-integrity.test.ts` (all five branches of the end-session decision,
including the two that must NOT end it), `http-envelope.test.ts` (no-store on
success and on refusal, and specifically not `no-cache`/`private`).
www unit **665 pass / 1 skip**, superadmin **19/19**, root `check-types` **9/9**.
Re-verified on the wire after the final refactor: both cookie orders → `401
session_conflict`; one sign-out with two live tokens → both dead; `no-store` on
a 200 and on a 401.

**Full www DB sweep against dev, after these changes: 39 suites, 1271
assertions passed, 0 failed.** The auth doors specifically — the ones this
change could plausibly have broken — match their recorded baselines:
`c04-login-parity` **76/76**, `c03-status-revocation` **30/30**,
`registration-doors` **17/17**, `rbac-isolation` **11/11**,
`center-staff-delegation` **55/55**, `invite-claim` and the money suites green.

Three suites never reached an assertion, and all three are ENVIRONMENT, not
this change — each refuses at its own preflight and prints why:

| suite | its own message |
| --- | --- |
| `catalog-onboarding` | `` `cacheTag()` is only available with the `cacheComponents` config `` — the pre-existing failure already excluded from `test:db:ci` |
| `h03-seed-uuid-flows` | `Missing seeded fixtures. Run: … prisma/seed.ts …` — dev was reseeded without the demo seeds |
| `profile-images` | `CLOUDINARY_* not configured — this suite proves the real upload path` |

Worth knowing for the next person: `bun run test:db <path>` **ignores the path
argument** and runs all 39 suites (~18 min against dev). There is no
single-suite form.

## Notes for whoever picks this up

- ~~Sign-out had to be issued **four times** before the session stayed dead.~~
  **Resolved, and it was the same root cause.** better-auth revokes only the
  token it resolves; each sign-out killed one credential, so N credentials
  needed N presses while every one of them reported success. The route wrapper
  now revokes all presented tokens (C₃). The double `signOut()` in
  `lib/refine/auth-provider.ts` was the workaround for it and **has been
  removed** (Ali, 2026-08-10) — re-verified afterwards on the wire: two live
  sessions, **one** `POST /api/auth/sign-out` carrying both, and both probe 401
  after (control: both 200 before). A second call on the way to `/login` only
  raced the first.
- The login rate limiter behaved correctly throughout (C2: 5/minute per email,
  a 429 after repeated attempts) — it is not implicated here, but it will slow
  down anyone reproducing this. Wait ~60s between attempts.
- Querying dev from a script **without** `withPlatformContext` returns false
  zeroes: RLS hides the rows. The first check in this session reported
  `payments 0` for a payment that existed.
