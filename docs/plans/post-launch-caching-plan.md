# Fewer requests to the server and the database — execution plan

**Goal, as stated:** reduce the number of requests that reach the server and the
database, efficiently, with no negative effect on the site.

**Status:** plan only. CLAUDE.md puts the Next.js 16 rendering/caching pass under
"Post-launch improvements (do NOT implement now)". Tiers 0 and 1 below are NOT that
pass — see each tier's note — but nothing here is executed until it is approved.

**Supersedes nothing.** It extends
[api-modernization-audit.md](../reports/api-modernization-audit.md) §4 against the
current 453-route surface (the audit measured 410 on 2026-08-08).

---

## The correction that reordered this plan

The first version of this document ranked `"use cache"` candidates. Re-checked
against the goal, that is the SMALLEST of the available wins and the riskiest,
because every one of them trades freshness for speed.

The measurements below say the large, free wins are elsewhere: the same session is
resolved from the database two or three times inside a single page render, and the
client refetches every query on every mount and every window focus. Neither is a
caching trade-off. Both are duplicate work with one correct answer, so removing them
cannot make any screen stale.

So the tiers are ordered by **requests removed ÷ risk taken**, and `"use cache"` is
last, not first.

---

## Tier 0 — per-request deduplication (zero staleness risk)

**Not the post-launch caching pass.** React's `cache()` memoises within ONE request
and is discarded when that request ends. Two calls in the same render cannot
legitimately return different answers, so there is no freshness to trade. This does
not touch money, attendance or session semantics — it removes a repeated query, not
a fresh one.

### 0.1 `getSessionUser` is not deduped

`apps/erp/src/lib/auth/session.ts:32` calls `auth.api.getSession`, which is a real
database read — `apps/erp/src/lib/auth/auth.ts` sets no `cookieCache`, deliberately,
because the product's hard session revocation depends on reading the row.

Measured call sites in a single render:

| Portal render | Calls | Where |
|---|---|---|
| student / teacher / parent / admin / assistant | **2** | the portal `layout.tsx` via `requirePortal`, plus `<ViewAsBanner />` in `components/i18n/portal-intl.tsx:20` (18 call sites mount that chrome) |
| staff | **3** | `dashboard/staff/layout.tsx:17` AND `dashboard/staff/page.tsx:16` both call `requirePortal`, plus the banner |
| onboarding | **2** | `onboarding/page.tsx` plus the banner in `onboarding/layout.tsx:19` |

**Fix:** wrap the exported `getSessionUser` in `cache()` from `react`. One line, one
import. Every portal render drops 1–2 session round trips; the staff portal drops 2.

**`cache()` memoises in a Server Component render and NOT in a Route Handler.**
Measured, not assumed: the same three consumer calls produced **1** underlying
session read inside an RSC render and **3** inside a route handler. That costs
nothing here — every API route resolves the session once anyway — but do not plan a
Tier 0 dedupe for a route handler on the strength of this one.

**Watch:** the `testOverride` branch stays OUTSIDE the memoised body, or a test that
swaps it mid-run has its first answer pinned for the rest of the request.

### 0.2 `resolvePublicProfile` runs twice per public page request

`app/[locale]/p/[handle]/page.tsx` calls it at line 22 (`generateMetadata`) and again
at line 52 (the page body). Same handle, same request, two full profile reads.

**Fix:** `cache()` on `resolvePublicProfile`. This is the correct fix even if Tier 3
Batch 1 never happens, and it composes with it.

**Proof for the whole tier (run 2026-09-21, `next dev`, instrumented render):**
`auth.api.getSession` wrapped with a counter, then one render performing exactly what
a portal render performs — `requirePortal`, `requirePortal` again (the staff case),
and the view-as banner:

```
{"consumers":1,"control":3,"scopeRuns":1}
```

`consumers` is the three call sites after the change; `control` is three direct reads
in the same render, which is the shape before it. **3 → 1.** `scopeRuns` proves
`generateMetadata` and the page body share one cache scope — it increments by exactly
1 per request over repeated hits — which is what makes 0.2 hold.

---

## Tier 1 — stop the client re-asking (largest reduction in requests SENT)

Every query in the app runs through Refine's React Query client
(`packages/client-core/src/refine/query-client.ts`). That config sets `networkMode`
and `retry` and **nothing else**, so React Query v5's defaults apply:
`staleTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`,
`refetchOnReconnect: true`.

In practice: every navigation back to a screen refetches it, and **every alt-tab
refetches everything currently mounted**. A grep across the whole repo finds exactly
one query that sets `staleTime` — `packages/client-core/src/hooks/use-global-search.ts:48`
(30s). Everything else re-asks the server at every opportunity.

This is the biggest single source of redundant requests, and it is configuration, not
architecture.

### The boundary — decided, not deferred

A blanket global `staleTime` is the wrong fix: CLAUDE.md forbids stale money, wallet
balances, subscriptions, attendance and messaging, and a global default would apply
to exactly those screens. The boundary is per-class, and it is this:

| Class | `staleTime` | `refetchOnWindowFocus` | Examples |
|---|---|---|---|
| Reference data | 5 min | false | catalog tree, subjects, grade levels, tracks, rooms list |
| Discovery / public profiles | 60s | false | search centres / teachers / courses / teacher-days, public centre and teacher pages |
| Ordinary lists | 30s | false | roster, materials, grades, team notes, collaboration requests |
| **Money, attendance, messaging, counter, wallet, notifications** | **0 (unchanged)** | **true (unchanged)** | everything the hard constraint names |

Implementation: keep the global default at `staleTime: 0` so the safe class is the
default and a new screen cannot silently inherit staleness, then set the value
explicitly per query for the first three classes. The money class needs no edit at
all — which is what makes this safe to ship in batches.

**Batch 1 — DONE 2026-09-21: the reference and discovery classes.**
`packages/client-core/src/refine/freshness.ts` holds the presets; ten query call
sites opted in — the four `catalog/subjects` readers and `catalog/tree`
(reference), and `search/courses` ×2, `search/teacher-days`, the collaboration
target search and the public centre profile (discovery). Every one of them either
is read-only or already calls `query.refetch()` explicitly after the action that
changes it, and an explicit refetch ignores `staleTime`.

`apps/erp/src/app/[locale]/courses/[id]/page.tsx` was deliberately LEFT OUT: it
posts an enrollment request and never refetches the course afterwards, so today a
remount is what shows the new state. Give it a preset only together with a refetch.

The guard is `apps/erp/tests/unit/query-freshness-scope.test.ts`: it parses every
`useList`/`useCustom` call site in the app and fails if a preset appears on
anything outside the `catalog/` `search/` `centers/` allowlist, or on any query
whose target names money, wallet, subscriptions, attendance, messaging or
notifications. Proven non-vacuous — a preset temporarily added to
`teacher/wallet` turned BOTH assertions red.

**Batch 2 — DONE 2026-09-21: the `list` class, and the guard that replaced the
question.** Twenty-three more queries opted in — courses, materials, grades,
reviews, rooms, teachers, enrollments, parent-links, collaboration-requests and
the enrollment-request badge — for 33 cached of 103 query call sites. Not one is
money, attendance, a session, messaging or a notification.

The question this batch opened with — *does anything on this screen change the
data without an explicit refetch?* — was the wrong thing to answer by hand. An
answer given in review is true on the day it is given; the next edit to that
screen is what breaks it, and nothing would have noticed. So the question is
machine-checked now, and two findings reshaped it:

1. **"This file contains a mutation" decides nothing.** The collaboration panel
   searches centres and then creates a collaboration REQUEST — which changes
   nothing about the centres it listed. The invariant has to compare the resource
   WRITTEN with the resource CACHED, not merely notice that both exist in one
   file.
2. **Refine's own mutation hooks already invalidate the list.** Measured in
   `@refinedev/core` 5.0.12: `useCreate` defaults to `invalidates: ["list",
   "many"]`, `useUpdate` to `["list", "many", "detail"]`, `useDelete` to
   `["list", "many"]`. A write through them is safe with a `staleTime` BY
   CONSTRUCTION. What is not safe is a raw `useCustomMutation` or a bare ky
   `.post()`, which refresh nothing — and those are the writes the invariant is
   actually about. `admin-classes-screen` shows the better idiom already:
   `invalidate({ resource: "courses", invalidates: ["list"] })` clears that
   resource for EVERY component, where `query.refetch()` only helps the one that
   called it. Prefer `invalidate` in new code.

So `apps/erp/tests/unit/query-freshness-scope.test.ts` now enforces four things
over every `useList`/`useCustom` call site in the app: never on money, attendance,
sessions, messaging or notifications; `reference`/`discovery` only on data that is
not per-user; no preset may re-enable window-focus refetching; and **a cached
query must be refreshed — by its own handle or by `invalidate({resource})` — on
any screen that writes that same resource through a raw mutation.** Writes it
cannot attribute to a resource count as writing everything, so an unreadable
mutation makes the rule stricter rather than weaker.

Proven non-vacuous twice: a preset on `teacher/wallet` turns the money rule red,
and a raw `{ url: "grades", method: "post" }` added to a screen holding a cached
`grades` list turns the refetch rule red. Both were reverted. The first draft of
the rule also caught a real mistake in this batch — a preset on
`me/family-code`, which is per-user — before it could ship.

`app/[locale]/courses/[id]/page.tsx` stays excluded for the reason given above,
and `grades-screen`, `latest-grade-card` and the dashboard badge are cached
without a `query` handle because they write nothing at all; the moment one of
them gains a write, the invariant demands the handle.

`refetchOnWindowFocus: false` on the first three classes is the half that removes the
most requests, because it fires on a behaviour (alt-tabbing) that has nothing to do
with the data changing.

---

## Tier 2 — let the CDN answer, so the request never reaches the server

`grep` finds **no `Cache-Control` header anywhere** in `apps/erp/src`. Every response
is served by the origin, including the fully public ones.

For the session-less public GETs, an explicit
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300` means Vercel's edge
answers repeat requests **without invoking the function and without touching the
database at all**. That is strictly larger than any server-side cache, which still
runs the server.

**Scope — allowlist only, and it must be derived from the existing one.** The
candidates are exactly the `getOnly` public entries already pinned in
`apps/erp/tests/unit/route-conventions.test.ts`: `v1/centers/[id]`,
`v1/teachers/[teacherId]`, `v1/search/centers`, `v1/search/teachers`,
`v1/payments/availability`, plus the public branches of `v1/search/courses`,
`v1/search/teacher-days` and `v1/courses`.

**This is the one tier where a mistake is a security incident.** A public cache
header on a route that varies by session lets a CDN hand one user's data to another.
Three rules, all of which must be enforced by a test, not by review:

1. The header is set from a single shared helper, never inline per route.
2. The helper refuses any response produced under a session — the allowlist is
   asserted against the convention suite's own public list, so the two cannot drift.
3. Anything that varies by cookie, role or locale-dependent private data keeps
   `no-store`. `Vary` is not a substitute; do not try to make an authed route
   cacheable with it.

`v1/courses`' public branch redacts `onlineUrl` (`route.ts:134`) — a paid credential.
A cached public response must be the redacted shape, and the public and authenticated
branches must never share a cache key. Tier 3 Batch 2 restates this for the same
reason.

**DONE 2026-09-21 — and the scope above was wrong in one place.** The "public
branches" of `search/courses`, `search/teacher-days` and `v1/courses` are NOT
eligible, and no branch of any session-reading route ever is. A CDN looks up its
cache before the function runs, keyed on the URL and not the cookie, so an
anonymous request would fill the cache and a signed-in caller at the same URL
would be served the anonymous answer — the wrong catalog scope, and on
`v1/courses` a meeting link silently withheld. The test is "is the response
identical for every caller", not "is the route public".

Five routes carry it: `v1/centers/[id]`, `v1/teachers/[teacherId]`,
`v1/search/centers`, `v1/search/teachers` (profile `discovery`: `s-maxage=60`,
`stale-while-revalidate=60`, so a suspended centre is gone within about two
minutes) and `v1/payments/availability` (profile `deployment`: `s-maxage=3600` —
it reads env only, and a deploy starts the CDN cache from empty).

- One helper: `packages/server-core/src/http/public-cache.ts`. It marks only a
  200, never a response with `Set-Cookie`, and always sends `max-age=0` so the
  browser keeps nothing — client freshness stays React Query's job. On the two
  rate-limited searches `withRateLimit` stays OUTERMOST, so its 429 never passes
  through the wrapper.
- The allowlist IS the existing one: a `cdnCache: true` flag on
  `PUBLIC_ROUTES` in `apps/erp/tests/unit/route-conventions.test.ts`, whose
  members are already proven free of every session token. The suite fails if the
  wrapper appears on any other route, if an entry is stale, if an entry is not
  `getOnly`, if the route reads `next/headers` or cookies, or if it appears
  anywhere in `apps/superadmin`. Proven non-vacuous: a `withPublicCache(` added to
  `search/courses` turned it red.
- `apps/erp/tests/unit/public-cache.test.ts` pins the wrapper: 404, 500, 429 and
  201 stay `no-store`, a cookie-setting 200 stays `no-store`.
- Proven on a PRODUCTION build (`next build --webpack` then `bun --bun next
  start`), because dev can differ: all five return 200 with the public header;
  an unknown centre 404s with `no-store`; `search/courses` (session-reading) and
  `v1/me` stay `no-store`; none sets a cookie.

Not verified here, and it cannot be from this machine: the Vercel edge actually
serving hits. Check once after deploy — a repeat request to one of the five should
come back with `x-vercel-cache: HIT`.

---

## Tier 3 — `"use cache"` on the server (the post-launch pass proper)

This tier IS the CLAUDE.md post-launch work: it trades freshness for speed and so
needs its traffic measurement first.

### STARTED 2026-09-21 on Ali's explicit instruction — read this first

Ali asked to start this tier before launch, overriding the CLAUDE.md
"Post-launch improvements — do NOT implement now" entry for it. The hard
constraints still hold, unchanged. Four findings from doing it correct what is
written further down this section; where they disagree, these win.

1. **There is no gate.** The "flag migration" below is NOT a prerequisite.
   `experimental.useCache: true` already enables `"use cache"` — the catalog
   readers run on it in production. And `cacheComponents` would REFUSE every
   route that exports `dynamic` (about 340 of them, per the comment in
   `apps/erp/next.config.ts`), so flipping it is a per-route rendering review,
   not a step. Not flipped.
2. **The default `"use cache"` handler is an in-memory LRU per process**
   (Next 16.3.5, `dist/server/lib/cache-handlers/default.js`), and in production
   it treats an entry past `revalidate` as missing. So the freshness bound is
   `revalidate`, not `expire`; and `revalidateTag` from a write clears only the
   instance that served that write. Invalidate-on-write is therefore NOT
   available as a correctness tool on Vercel today. Every cached value here must
   be one whose staleness up to `revalidate` is acceptable to everybody —
   including the person who just edited it.
3. **Tier 3 can silently break Tier 1.** Tier 1 is safe because a screen calls
   `query.refetch()` after its own action. If the server caches the value that
   action changed, that refetch returns the pre-action value. So nothing a user
   can change by acting on the same screen may be cached here — seat counts in
   particular.
4. **A session-reading route CAN share a server cache** where it could not share
   the CDN (Tier 2), because the key is the function's arguments, not the URL.
   The course searches read the session only to resolve a scope, and the scope is
   `{ gradeLevelId, trackId }` — not a person. So the cached rows are shared by
   every student in the same grade and track, which covers signed-in students on
   their main screen, not just the anonymous branch this section originally
   limited it to.

**Batch "discovery" — DONE 2026-09-21.** `search/courses` and
`search/teacher-days`.

- `discovery.ts` was split at the seam in finding 3: `searchCourseRows` /
  `searchTeacherDayRows` (which courses match, schedule, price, centre, teacher
  name, rating) and `courseLiveState` (active enrollment count, remaining seats,
  upcoming sessions — read fresh every request). `searchCourses` and
  `searchTeachersByDay` keep their exact signature and output, composed from the
  two halves, uncached; the DB suites keep calling them.
- `discovery-cache.ts` memoises ONLY the rows (`revalidate: 60`, tag
  `discovery`), keyed on the filters plus a scope rebuilt field-by-field so
  nothing else can ride into the key. Only the two search routes import it; the
  session read and `assertApprovedChild` stay in the route, on every request.
- 60 seconds is the same bound the CDN and `QUERY_FRESHNESS.discovery` already
  give every other public listing. No revalidator was written, on purpose (see
  finding 2).
- Guard: `apps/erp/tests/unit/use-cache-scope.test.ts` — only the catalog and
  discovery modules may contain `"use cache"`, neither may import session or
  request state, the discovery cache is imported by exactly the two routes, and
  no DB suite imports it. Proven non-vacuous: `"use cache"` added to
  `parent-wallet.ts` turned it red.
- Behaviour: `course-delivery-and-teacher-day` 20/20 on the local test DB.
  `catalog-onboarding` fails identically before and after (its known demo-seed
  dependency) — compared by swapping the pre-change file back in.
- Measured on a production build against the dev branch, 12 samples each, all
  200 (distinct `X-Forwarded-For` per request so the per-IP limiter could not
  fake a fast "hit" with a 429), misses forced by a new key over the SAME rows:
  `search/courses` median **859 → 329 ms**, `search/teacher-days`
  **1147 → 321 ms**. A hit is not ~0 because the live half still runs — which is
  the point. Hit and miss payloads compared equal; `onlineUrl` absent from both.

**Deliberately NOT done — and why.**

- **`/p/[handle]` for everyone.** Its owner opens it from settings right after
  editing; with finding 2 they could see their old profile for up to a minute and
  conclude the save failed. Done instead as anonymous-only — next entry.

**Batch "public profile, anonymous only" — DONE 2026-09-21.**

- `public-profile-for-request.ts` picks the read per request: a visitor carrying
  NO session cookie gets `resolvePublicProfileAnonymous` (cached 60s); anyone with
  one — valid, expired or garbage — gets the fresh read, exactly as before. The
  check is cookie PRESENCE via `presentedSessionTokens`, the one existing
  definition of a session cookie: it costs no query, so a signed-in visitor pays
  nothing extra, and it fails toward freshness. Wrapped in React `cache()`, so
  `generateMetadata` and the page still resolve once per request.
- `public-profiles-cache.ts` memoises `readPublicProfile` (the old body, now
  exported; `resolvePublicProfile` is `cache(readPublicProfile)` as in Tier 0)
  and overlays `withLiveEnrollment`: `enrolledCount` and `totalStudents` are
  re-read by one groupBy on every request. No enrollment-derived number is served
  from a cache anywhere — the use-cache guard now asserts that for both cached
  modules, and that the profile cache is imported only by the gate.
- `public-profile-for-request.test.ts` pins the gate: no cookies and unrelated
  cookies are cached; a session cookie, its `__Secure-` form and a garbage one
  are fresh. Proven non-vacuous: flipping the predicate turned the three fresh
  cases red.
- `public-handles` DB suite 45/45.
- Production build, 12 samples each, all 200, cached path vs fresh path:
  `/ar/p/nile-academy` (centre) median **1072 → 446 ms**, `/ar/p/hossam-aziz`
  (teacher) **1031 → 305 ms**. The rendered HTML is byte-identical between the
  two paths once each page's CSP nonce is normalised (a plain regex left escaped
  copies of it inside the RSC payload and made them look different — they were
  equally different between two anonymous requests).
- Known and accepted: a handle that was unknown when first requested can 404 for
  up to 60s after it becomes valid; a suspended owner can stay visible to
  anonymous visitors for up to 60s. When the dormant `<handle>.<root>` subdomain
  resolver is switched on, EVERY visitor there is anonymous (auth never lives on
  a subdomain), so an owner viewing their own subdomain would be on the cached
  path — the 60s bound applies to them there.
- **The profile API routes.** Already CDN-cached by Tier 2; a server cache behind
  the CDN only helps CDN misses. Not worth a second staleness layer.

**A narrow regression from Tier 2, recorded rather than patched.** A centre admin
who edits their profile and then reaches `/centers/<id>` (only linked from course
pages) can see the old version for up to 60s, because that page reads the
CDN-cached `v1/centers/[id]`. Their own entry point — the settings link — goes to
`/p/<handle>`, which is server-rendered and fresh. Busting the URL for the owner
would need identity on a CDN-cached page, and busting it for everyone would undo
Tier 2, so it is left as a known 60-second bound.

### Batch "editors, the centre API, and invalidation" — DONE 2026-09-21

The three items the previous batches deliberately left out, done on Ali's
instruction. **One correction first:** the Tier 3 summary said no
enrollment-derived number was served from any cache. That was true of the server
cache only — Tier 2 had put `v1/centers/[id]` on the CDN, and the public centre
page shows `enrolledCount/maxStudents` per course and `totalStudents`, so those
could be up to two minutes old. Fixed here (item 1).

**1. `v1/centers/[id]` — CDN replaced by the server cache.** It serves
`getCenterPublicProfileShared`: the profile from `"use cache: remote"` (60s) with
`withLiveEnrollment` overlaid, so the counts are live. The `cdnCache` flag was
removed from its PUBLIC_ROUTES entry. Two reasons it could not stay on the CDN:
the counts, and that no revalidation can reach a CDN copy. The request reaches
the function again, but a hit costs one groupBy instead of the full profile read.
- **Found while building it: an error thrown inside a `"use cache"` function
  leaves it RSC-serialized, and in production it arrives as a generic Error with
  a digest — not a `NotFoundError` — so `withErrors` would have answered 500 for
  an unknown or suspended centre.** The cached function now returns `null` for a
  hidden centre and the real `NotFoundError` is thrown outside it. Proven on a
  production build: 404 with the standard envelope, twice (the second from cache).
  `catalog-read.ts` was checked for the same trap: its `NotFoundError` is thrown by
  `getStudentOwnSubjects`, which is per-user and correctly NOT cached.
- `v1/teachers/[teacherId]` was NOT given a server cache: nothing in the app calls
  it, and its payload has no live numbers. It stays on the CDN.

**2. `/p/[handle]` for signed-in visitors too.** `public-profile-for-request.ts`
now serves everyone from the shared cache EXCEPT people who may have just edited
the profile — `mayEditProfile`: the centre's admin and staff (or a centre role
whose centre is unknown), the teacher, and any assistant. It reads the shared
entry first (it carries the profile's kind and id, so ownership costs no extra
query), then resolves the session only when a session cookie is present. A
session cookie meeting a handle the cache says is missing reads fresh, so an owner
who just claimed a handle is never shown a 404. Owners stay correct WITHOUT
depending on invalidation.

**3. `"use cache: remote"` + invalidation on write.**
- Next 16.3.5 resolves the `remote` handler from
  `globalThis[Symbol.for('@next/cache-handlers')].RemoteCache`, which the hosting
  platform sets; when nothing sets it, `remote` IS the default in-memory handler
  (`dist/server/use-cache/handlers.js`). So locally nothing changes, and on Vercel
  the cache is either shared across instances or exactly what it was. All six
  cached readers switched.
- `@repo/server-core/cache/public-data` is the one vocabulary: three datasets,
  their tags, and which audited back-office writes touch which. Every cached
  module takes its tag from it (guarded — a literal tag turned the guard red).
- ERP writes: 22 write handlers in 17 routes are wrapped in
  `invalidatesPublicData` (courses, collaboration accept, centre profile and logo,
  teacher photo, `/me`, onboarding, public handle, reviews, external teachers). It
  runs the handler and, on a status below 400, `revalidateTag(tag, { expire: 0 })`
  — after the handler returned, so after its commit, and never throwing: a saved
  change is never reported as an error because a cache could not be told. Model-
  level hooks were rejected: the kernel services also write `centers` for wallet
  balances and receipt counters, which would have cleared the cache on every
  payment.
- Back-office writes: a listener on `writeAdminAudit` (a globalThis registry in
  server-core, empty unless an app registers — so the ERP, the DB suites and
  scripts are unaffected), registered from `apps/superadmin/instrumentation.ts`,
  coalesces a request's datasets and POSTs them in `after()` — after the commit —
  to the new `POST /api/v1/internal/revalidate` (INTERNAL_API_SECRET, body limited
  to the three datasets). Best-effort: a missing secret, an unreachable ERP or a
  throwing listener never fails the admin's write (all tested).
- Over-invalidation is accepted: `/me` and onboarding are shared by every role, so
  a student editing their own profile also expires discovery. Each such write
  costs one refill, never a wrong answer.

**Guards.** `use-cache-scope.test.ts` adds: tags only from the vocabulary; every
listed write route's write methods are wrapped; the profile cache is imported
only by the editor gate and the centre route; the gate uses
`presentedSessionTokens` and `mayEditProfile`. Mutation-tested: unwrapping
`reviews` POST, a literal tag, and posting before `after()` each turned their test
red. New suites: `public-data-invalidation`, `route-internal-revalidate`,
`public-profile-for-request` (rewritten for editors), and in superadmin
`erp-revalidate` (7).

**Proven.** erp unit 1635 passed / 1 skipped (119 files); superadmin unit 175/175
(16 files); full local DB suites erp 91 suites / 2056 assertions and superadmin
38 / 1007, all green (tx-retry-boundary declines itself locally, as documented);
check-types clean in erp, superadmin and server-core; both apps build. On an ERP
production build: a revalidate with the wrong secret is 403 and leaves the entry
cached; with the right one the next read misses (1.16 s fill, 0.35 s hit, 0.84 s
after revalidate) and then hits again; revalidating `catalog` leaves `discovery`
cached. Centre API: `no-store`, hit 277 ms vs 934 ms after revalidate, live counts
present. `/p/nile-academy` with a session cookie for no user: 274 ms (shared) vs
~1072 ms on the old fresh path, page identical.

**Not proven here, and why.**
- An EDITOR taking the fresh path at runtime: that needs a real signed-in session,
  which would mean authenticating with a password. Covered by unit tests only.
- The back office -> ERP call end to end: it needs a superadmin sign-in (2FA). The
  listener is unit-tested and the ERP endpoint is proven at runtime, separately.
- Cross-instance sharing and cross-instance invalidation: only Vercel can show
  it. After deploy, run the same sequence against production search — fill, hit,
  revalidate, miss — from two different regions or after forcing a cold start,
  and compare.

**Before deploying.** `INTERNAL_API_SECRET` must be set on the superadmin project
with the ERP's value (the recreate runbook already lists it), and `ERP_BASE_URL`
there must be the ERP host. Without the secret the back office logs one warning
and edits fall back to the 60s bound. **Check what Vercel charges for the remote
cache (Runtime Cache) before relying on it at volume** — that was not verified.

### Phase 0 — make the ranking real

CLAUDE.md requires measuring real traffic first, and there is none to measure:
production held **2 users / 0 courses / 0 payments** at the last census (2026-09-06).
A live ranking cannot be computed from an empty environment.

1. **Per-route counts** from Vercel's own analytics — no code change; prefer it to an
   in-app counter, which is a write on every request.
2. **Per-route p95** from Sentry, already wired
   (`packages/observability/src/sentry-options.ts`). Read the tail, not the average.
3. **The bar:** a candidate earns a batch only if it is BOTH high-count and has a p95
   worth removing. High-count-but-fast is a Tier 1 or Tier 2 problem, not this one.

Cost per request is measurable today, on localhost only
(`tests/load/README.md` — never point it at Vercel or any Neon branch):

```bash
TARGET=api k6 run tests/load/cost-split.js
bun tests/load/lib/report.mjs <run-id> student
```

### What was measurable today — call sites

| Surface | Endpoint / function | Caller | Expected volume |
|---|---|---|---|
| `/p/[handle]` | `resolvePublicProfile` | server component, twice per request | Highest — anonymous, shareable, indexable |
| Public centre page | `v1/centers/[id]` → `getCenterPublicProfile` | `app/[locale]/centers/[id]/page.tsx` via `useCustom` | High, anonymous |
| Public teacher page | `v1/teachers/[teacherId]` → `getTeacherPublicProfile` | discovery/browse | High, anonymous |
| Student subjects screen | `v1/search/courses` | `features/student/student-subjects-screen.tsx:79`, `features/parent/parent-pay-screen.tsx:99` | High — the student's primary screen |
| Find a teacher | `v1/search/teacher-days` | `features/student/find-teacher-screen.tsx:101` | Medium |
| Onboarding wizard | `v1/catalog/tree` | `features/onboarding/use-onboarding.ts:31` | High — **already cached**, verify only |
| Every checkout surface | `v1/payments/availability` | `lib/payments/use-online-checkout.ts:11` | High count, near-zero cost |
| Collaboration panel | `v1/search/centers`, `v1/search/teachers` | `features/collaboration/collaboration-panel.tsx:469` | Low — staff only |
| — | `v1/subjects` | **no caller anywhere in `apps/erp/src`** | Zero |

### The gate: flag migration (blocks every batch in this tier)

`apps/erp/next.config.ts:76` still sets `experimental.useCache: true`. The target is
top-level `cacheComponents: true`, and it is the gate because it changes the
prerendering model for GET route handlers app-wide. The mitigation is already
enforced: every route exports `force-dynamic`, and both apps' `route-conventions`
suites fail if one does not, so the flip cannot silently make an API route
prerenderable.

Must all pass after the flip, before any batch: `check-types` 9/9, `build` 3/3, both
unit suites, `test:db:local` in both apps, and the ERP route census re-counted and
compared. `catalog-onboarding` is the canary — its known `cacheTag()` env failure is
the suite to watch. Roll back = revert the flag.

### Batch 1 — public profile reads

Three data functions, four surfaces, all anonymous, none per-user, none money. The
route stays `force-dynamic` and the auth wrapper still runs every request; only the
data function is memoised — the pattern already in
`lib/services/catalog/catalog-read.ts`.

| Function | File | Tag | Life |
|---|---|---|---|
| `getCenterPublicProfile` | `lib/services/public-handles/public-profiles.ts:151` | `center-profile:{centerId}` | stale 60 / revalidate 300 / expire 900 |
| `getTeacherPublicPage` | `lib/services/public-handles/public-profiles.ts:215` | `teacher-profile:{userId}` | same |
| `getTeacherPublicProfile` | `lib/services/reviews/reviews.ts` | `teacher-profile:{userId}` | same |

- **The teacher has TWO readers.** `v1/teachers/[teacherId]` reads
  `getTeacherPublicProfile` from `reviews.ts`; `/p/[handle]` reads
  `getTeacherPublicPage` from `public-handles`. Different functions, same subject.
  Cache both under the SAME tag so one invalidation clears both; do not merge them
  here.
- **The status gate is inside the cached value.** Both filter `status: "active"`, so
  a suspended centre or teacher must vanish from the public page. A status write must
  invalidate the tag; until §Invalidation is wired, `expire` is the only guarantee —
  which is the argument for 900s and not longer.

### Batch 2 — discovery search, anonymous branch only

`v1/search/courses` and `v1/search/teacher-days`, tag `discovery`,
stale 30 / revalidate 60 / expire 300, **anonymous / `scope=all` branch only**.

Both read `getSessionUser()` (`search/courses/route.ts:36`; `search/teacher-days`
via `assertApprovedChild`) and resolve a student's or an approved child's catalog
scope. The per-student branch is never cached. Split the handler so the cached
function receives only the normalized anonymous filters. **If the session ever
reaches the cached function's arguments, the cache is poisoned across users** — that
is this batch's single failure mode and what its tests must pin.

`onlineUrl` stays redacted in any cached shape, and the public and authenticated
branches never share a key.

### Batch 3 — collaboration search

`v1/search/centers`, `v1/search/teachers`, tag `discovery`, same short life. Reachable
only from `collaboration-panel.tsx` — staff, low volume. **Do this only if Phase 0
says the counts justify it.** Listed for completeness, not recommended on today's
evidence.

### Batch 4 — `payments/availability`

One boolean from config, called on every checkout surface. High count, near-zero
cost: the win is real only if the underlying predicate does database work. Measure
first. Tier 2 probably serves this better than Tier 3 does.

### Not a batch — `v1/subjects`

Public, session-less, still a direct `findMany` — and it has **zero callers** in
`apps/erp/src`. Caching an endpoint nobody calls buys nothing. Triage it: if it is
unused, deleting it is the better change; if something outside the app depends on it,
route it through the existing cached catalog reader under the `catalog` tag with its
existing `CATALOG_CACHE_LIFE`.

### Already done — verify, do not redo

`v1/catalog/tree` and `v1/catalog/subjects` read through the `"use cache"` readers in
`lib/services/catalog/catalog-read.ts` (`CATALOG_CACHE_TAG`, `CATALOG_CACHE_LIFE`).

### Invalidation, and the gap that is already documented

`revalidateTag` invalidates the cache of the process that runs it. The catalog is
written only by `apps/superadmin`, so a back-office edit can never reach the ERP's
cache — written down in `lib/services/catalog/catalog-cache.ts` and accepted on
purpose (docs/follow-ups.md #8); the 300s `expire` is today's real guarantee.

**Every tag this plan adds inherits that gap**, and `center-profile` /
`teacher-profile` inherit it worse, because both apps write those rows including the
status changes the public page must respect. So Batch 1 carries a prerequisite: an
internal revalidate endpoint in the ERP, called by the back office over
`INTERNAL_API_SECRET` exactly as `v1/internal/chat-notify` already is. Build it with
Batch 1, or accept `expire` as the only guarantee and say so in the commit — do not
leave it implicit.

Next 16 requires the two-argument form: `revalidateTag(tag, 'max')` for ordinary
content writes, `revalidateTag(tag, { expire: 0 })` only for immediate expiry.
`updateTag` is Server Actions only and does not apply here.

Never use `export const revalidate` or `force-static` — that is the legacy segment
model and it mixes badly with Cache Components. One model only.

---

## Discipline, every tier, no exceptions

1. One batch per branch. Never a repo-wide sweep — CLAUDE.md is explicit.
2. Write the proof before the change: for Tiers 0–1 a query/request count; for Tiers
   2–3 a test that fails on the staleness the batch is about to introduce.
3. Run the gauntlet: `check-types`, `build`, both unit suites, `test:db:local`.
4. Measure the same path with the same k6 command before and after and record both
   numbers in the commit. A batch with no measured improvement is reverted, not kept
   because it should have helped.
5. Stop for review. Then the next batch.

**Rollback** is per-batch and cheap. Tier 0: remove the `cache()` wrapper. Tier 1:
remove the per-query option. Tier 2: remove the header helper's allowlist entry.
Tier 3: delete the `"use cache"` directive and its `cacheTag`/`cacheLife` lines; the
tag becomes inert.

---

## Out of scope, permanently

Per the CLAUDE.md hard constraint, restated so no future batch re-litigates it: every
`v1/me/*`; wallet, payments, payouts, finance, refunds; attendance, check-in, door
check-in, counter, shifts; messaging and notifications; dashboards, reports and
exports; roster, enrollments, subscriptions, sessions; `v1/search` (the global palette
— it returns what the CALLER's role can reach, so a shared entry is a cross-tenant
leak); health, cron, webhooks and auth; and the whole of `apps/superadmin`, which is
per-actor, low-traffic and audit-sensitive.

Tier 1's money/attendance/messaging class is the same list, and it is the class that
stays at `staleTime: 0`.
