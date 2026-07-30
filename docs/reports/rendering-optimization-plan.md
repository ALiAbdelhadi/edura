# Next.js 16 Rendering + Caching Optimization Plan

**Status:** PHASE 1 — ANALYSIS ONLY. No code was changed to produce this document.
**Date:** 2026-07-25
**Scope:** `apps/www` (109 pages incl. superadmin) + `apps/superadmin`, Next.js **16.2.10** on both.
**Authority:** CLAUDE.md → "Post-launch improvements" §1. Hard constraints from that section are
treated as binding and are restated in §2 below.

---

## 0. Executive summary — read this first

The premise of the original note ("apply the right rendering strategy and selective `'use cache'`")
needs one correction before any work starts, because it changes what the batches should contain.

**This is not a server-rendered app.** It is a client-rendered SPA served by Next.js:

| Fact | Measured value |
|---|---|
| Pages that are `"use client"` (or a 7-line wrapper around a `"use client"` screen) | **109 / 109** |
| Pages that fetch data in a Server Component | **0** |
| API route handlers | **303** |
| Route handlers carrying `export const dynamic = "force-dynamic"` | **301 / 303** — the 2 exceptions are the NextAuth catch-alls, which are inherently dynamic |
| `'use cache'` / `cacheLife` / `cacheTag` / `unstable_cache` in source | **0** |
| `cacheComponents` (Next 16 flag) enabled | **No** (neither app) |
| Route segment config in the page tree | **1** — `force-dynamic` on `apps/www/.../dashboard/layout.tsx` |

The consequence: **adding `'use cache'` to pages would be a no-op**, because no page performs a
server-side fetch. There is nothing on the page to cache. All data arrives client-side from
`/api/v1/**`, and all 301 of those handlers are already `force-dynamic`.

This is *good news for safety* — the money/wallet/attendance/messaging/auth surfaces are already
maximally fresh and there is no existing cache to audit. It also means the real wins are elsewhere.
The four genuine opportunities, ranked by benefit ÷ risk:

| # | Opportunity | Where | Risk | Est. benefit |
|---|---|---|---|---|
| **A** | Cache the **education catalog** reference data at the *service-function* level | 3 www functions + 8 superadmin routes | Very low | Removes 3–5 DB round-trips from every onboarding/subjects page load |
| **B** | Let dashboard **page shells prerender statically** (drop the blanket `force-dynamic` layout) | `apps/www/.../dashboard/layout.tsx` | Low | Shell TTFB → CDN-speed on ~73 routes; no server render per navigation |
| **C** | Trim the **i18n payload** shipped to every client | both apps' `[locale]/layout.tsx` | Low–medium | ~70 KB (en) / ~89 KB (ar) of JSON currently serialized into *every* page's RSC payload |
| **D** | **Code-split** heavy client screens + `recharts` | 8 chart files, 4 screens >800 lines | Low | `recharts` is currently in the main bundle for anyone loading a chart page |

**A and B are the only items that touch rendering/caching semantics. C and D are payload work.**
Nothing in any batch caches money, wallet, balance, subscription, attendance, messaging, auth, or
per-user data — see §2.

---

## 1. Method

Classification was derived mechanically, not by inspection guesswork:

1. Every `page.tsx` / `layout.tsx` was tested for `"use client"`.
2. Server-component pages were read in full — **all 16 in www and 16 in superadmin turned out to be
   7-line wrappers** (`import Screen; export metadata; return <Screen/>`) or `redirect()` shims.
   None fetches data.
3. Every `route.ts` was grepped for segment config.
4. Every service function reachable from a candidate route was read to confirm what it touches.
5. **Tie-break rule applied throughout: unsure → MUST STAY DYNAMIC.**

---

## 2. Safety contract (binding, restated from CLAUDE.md)

> **NEVER cache:** money, wallet balances, subscriptions, attendance, messaging, auth/session, or any
> per-user or stateful data. Those stay dynamic and fresh every request.

Operationalised as three rules that every batch below obeys:

**R1 — Auth is never cached, ever.** `requireSession()` / `requireRole()` read cookies and therefore
force a dynamic render of the *request*. Batch A caches only the pure-data function that runs
**after** the auth check. The route stays `force-dynamic`; the auth gate still runs on every single
request. Caching a *function* is not caching a *response*.

**R2 — A cached function may not receive a user identifier.** Any function whose arguments include
`userId`, `studentId`, `centerId`, `teacherId`, or a session object is disqualified on sight. This
is why `getStudentOwnSubjects(userId)` is excluded from Batch A even though its siblings qualify.

**R3 — A cached function may only read permanent reference tables.** Concretely:
`education_systems`, `education_stages`, `grade_levels`, `tracks`, `grade_tracks`, `subjects`,
`subject_offerings`. CLAUDE.md already designates these as *permanent reference data* that survives
the pre-launch wipe and is not `is_demo`-flagged. Any query touching `transactions`, `wallets`,
`payments`, `subscriptions`, `attendance`, `sessions`, `messages`, `conversations`, `users`,
`enrollments`, or `commission_settings` is disqualified.

**Money note:** `commission_settings` looks like reference data and is deliberately **excluded**.
It is a rate that multiplies money. A stale commission rate silently mis-splits revenue. It stays
dynamic.

---

## 3. Page-by-page classification

Legend — **Current**: what Next.js does today. **Ideal**: recommended target.
**Class**: `SAFE` = safe to cache/prerender per §2 · `DYNAMIC` = must stay fresh every request.

Because 109/109 pages render zero server data, the "Class" column below is about the **HTML shell**,
not about data. A `SAFE` shell still fetches its live data client-side from a `force-dynamic` API
route on every mount — the freshness of money/attendance/messaging is unaffected by anything here.

### 3.1 `apps/www` — public / unauthenticated (9 pages)

| Route | Kind | Current | Ideal | Class | Benefit |
|---|---|---|---|---|---|
| `/[locale]` | client, `localStorage` redirect | Static shell | Static | **SAFE** | Already optimal |
| `/[locale]/login` | client | Static shell | Static | **SAFE** | Already optimal; 274 lines, split candidate |
| `/[locale]/register` | client | Static shell | Static | **SAFE** | Already optimal; 505 lines, **split candidate** |
| `/[locale]/forgot-password` | client | Static shell | Static | **SAFE** | Already optimal |
| `/[locale]/reset-password` | client, `useSearchParams` + Suspense | Static shell | Static | **SAFE** | Already correct (Suspense present) |
| `/[locale]/claim` | client, walk-in token | Static shell | Static | **SAFE** | Shell only — token handled client-side |
| `/[locale]/invite/accept` | client | Static shell | Static | **SAFE** | Already optimal |
| `/[locale]/onboarding` | client wizard | Static shell | Static | **SAFE** | Shell only; consumes Batch A catalog |
| `/[locale]/ui-preview` | client, design tokens | Static shell | Static | **SAFE** | Dev-only surface; see §5 proposal P6 |

> These 9 rows are **already** statically prerendered (they sit outside the `force-dynamic` dashboard
> layout and `generateStaticParams` emits both locales). **No change proposed. Nothing to win here.**

### 3.2 `apps/www` — public detail pages (3 pages)

| Route | Kind | Current | Ideal | Class | Notes |
|---|---|---|---|---|---|
| `/[locale]/[id]` | client, affiliation invite by short-id | Static shell | Static | **SAFE (shell)** | Data = affiliation status → **DYNAMIC**, unchanged |
| `/[locale]/centers/[id]` | client, `useCustom` | Static shell | Static | **SAFE (shell)** | Data includes course **prices** → **DYNAMIC**, unchanged |
| `/[locale]/courses/[id]` | client, `useCustom` + enroll mutation | Static shell | Static | **SAFE (shell)** | Data includes **pricing + enrollment** → **DYNAMIC**, unchanged |

> Tempting but rejected: "these are public marketing-ish pages, cache them." They render **course
> pricing** and an **enrollment CTA**. Under R3 that is money. The shells already prerender; the data
> stays live. **No change proposed.**

### 3.3 `apps/www` — dashboard, all roles (73 pages)

All 73 sit under `apps/www/src/app/[locale]/dashboard/layout.tsx`, which carries
`export const dynamic = "force-dynamic"`. That layout's body is `<>{children}</>` — it renders
nothing, reads nothing, and has no comment explaining the directive.

**Effect today:** all 73 shells are server-rendered on every request despite containing zero
server data. The role guard (`RoleGuard`), the nav shell (`DashboardShell`) and the onboarding gate
(`OnboardingGate`) are all `"use client"` and run in the browser regardless.

| Role | Pages | Current | Ideal | Class (shell) | Class (data) |
|---|---|---|---|---|---|
| **Center admin** `/dashboard/admin/*` | 15 — `page`, `checkin`, `classes`, `enrollment-requests`, `expenses`, `fees`, `messages`, `notifications`, `reports`, `rooms`, `settings`, `staff`, `students`, `students/[studentId]`, `teachers` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — fees, expenses, checkin, messages |
| **Teacher** `/dashboard/teacher/*` | 14 — `page`, `assignments`, `attendance`, `centers`, `classes`, `door`, `grades`, `materials`, `messages`, `notifications`, `reviews`, `settings`, `team`, `wallet` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — wallet, attendance, door, messages |
| **Student** `/dashboard/student/*` | 14 — `page`, `assignments`, `attendance`, `courses`, `family`, `grades`, `materials`, `messages`, `notifications`, `reviews`, `schedule`, `settings`, `subjects`, `wallet` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — wallet, attendance, messages |
| **Parent** `/dashboard/parent/*` | 9 — `page`, `attendance`, `children`, `fees`, `messages`, `notifications`, `oversight`, `progress`, `settings` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — fees, attendance, **oversight (child safety)** |
| **Assistant** `/dashboard/assistant/*` | 10 — `page`, `attendance`, `classes`, `collaborations`, `door`, `grades`, `materials`, `messages`, `notifications`, `settings` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — attendance, door, messages |
| **Center staff** `/dashboard/staff/*` | 10 — `page`, `checkin`, `finance`, `messages`, `notifications`, `reports`, `rooms`, `settings`, `students`, `students/[studentId]` | force-dynamic | **Static shell** | **SAFE** | **DYNAMIC** — finance, checkin, messages |
| **Router** `/dashboard` | 1 — client role-router | force-dynamic | **Static shell** | **SAFE** | n/a |

**Why the shell is safe to prerender:** the prerendered HTML for e.g.
`/ar/dashboard/student/wallet` contains the `<html>`/`<body>`, fonts, theme bootstrap, the i18n
dictionary, and a loading skeleton. **It contains no balance, no session, no user identity** —
because the page component is a 7-line wrapper that renders `<StudentWalletScreen/>`, a client
component that calls `/api/v1/me/wallet` after hydration. That API call is, and remains,
`force-dynamic` and auth-gated.

**Verification required before this ships** (Batch B gate, §4.2): prove by build output +
byte-level HTML inspection that no prerendered shell contains user data.

### 3.4 `apps/superadmin` (24 pages)

| Route group | Pages | Current | Ideal | Class (shell) | Class (data) |
|---|---|---|---|---|---|
| `/[locale]/login` | 1 | Static | Static | **SAFE** | n/a |
| `/[locale]` (redirect shim) | 1 | Dynamic (`getLocale`) | Leave as-is | **SAFE** | n/a |
| `/[locale]/dashboard` | 1 | Static shell | Static | **SAFE** | **DYNAMIC** |
| `/dashboard/superadmin/*` | 15 — `page`, `catalog`, `centers`, `collaborations`, `commission`, `messaging`, `notifications`, `payments`, `payouts`, `registrations`, `settlements`, `subscriptions`, `teachers`, `wallet`, `whatsapp` | Static shell | Static | **SAFE** | **DYNAMIC** — every one: payments, payouts, settlements, commission, messaging log, wallet policy |
| `/dashboard/finance/*` | 6 — `page`, `commission`, `notifications`, `payments`, `payouts`, `subscriptions` | Static shell | Static | **SAFE** | **DYNAMIC** — accountant portal, 100% money |

> **superadmin has no `force-dynamic` layout**, so its shells already prerender. **No rendering
> change proposed for superadmin pages.** Its only item is Batch A (catalog routes) and Batch D.

### 3.5 Layouts and shared components

| File | Kind | Current | Ideal | Class | Note |
|---|---|---|---|---|---|
| `www/[locale]/layout.tsx` | server | Static (`generateStaticParams`) | Static + trimmed messages (Batch C) | **SAFE** | Ships full dictionary to client |
| `www/[locale]/dashboard/layout.tsx` | server, `force-dynamic` | Dynamic | **Remove directive** (Batch B) | **SAFE** | Renders `<>{children}</>` only |
| `www/.../dashboard/{admin,teacher,student,parent,assistant,staff}/layout.tsx` | client ×6 | Client | Unchanged | **SAFE** | Nav + `RoleGuard`; client is correct here |
| `superadmin/[locale]/layout.tsx` | server | Static | Static + trimmed messages (Batch C) | **SAFE** | Same dictionary issue |
| `superadmin/.../dashboard/{superadmin,finance}/layout.tsx` | client ×2 | Client | Unchanged | **SAFE** | — |
| `components/providers/app-providers.tsx` | client | Client | Unchanged | **SAFE** | Refine + SessionProvider + theme; must be client |
| `components/refine/dashboard-shell.tsx` (342 / 329 lines) | client | Client | Unchanged | **SAFE** | — |
| `components/refine/role-guard.tsx` | client | Client | **Unchanged — do not touch** | **DYNAMIC (auth)** | Authorization boundary |
| `components/charts/*.tsx` ×8 | client, `recharts` | Eager | **`next/dynamic`, ssr:false** (Batch D) | **SAFE** | Presentation only |
| `features/messaging/chat-screen.tsx` (1022 lines) | client, socket.io | Client | Unchanged rendering; split only | **DYNAMIC (messaging)** | Never cache |
| `features/**/*-screen.tsx` (all others) | client | Client | Unchanged rendering | **DYNAMIC (data)** | Shell is SAFE, data is not |

---

## 4. Proposed batches — smallest and safest first

Each batch is independently shippable, independently revertible, and ends with a stated proof.
**Nothing proceeds to the next batch until you have reviewed the previous one.**

### Batch 1 — Catalog reference-data caching *(the only true `'use cache'` work)*

**Files:** `apps/www/src/lib/services/catalog/catalog-read.ts` (3 of 6 functions) — plus, optionally,
a follow-up for the 8 read-only `apps/superadmin/.../admin/catalog/*` GET routes.

| Function | Reads | Args | Verdict |
|---|---|---|---|
| `getCatalogTree()` | `education_systems → stages → grade_levels → grade_tracks → tracks`, all `isActive` | **none** | ✅ **CACHE** — `cacheLife("hours")` |
| `getAllActiveSubjects()` | `subjects` where `isActive` | **none** | ✅ **CACHE** — `cacheLife("hours")` |
| `getSubjectsForGradeLevels(ids)` | `subject_offerings` by grade level | reference UUIDs only | ✅ **CACHE** — `cacheLife("hours")` |
| `getSubjectsForSelection(gradeLevelId, trackId?)` | `subject_offerings` | reference UUIDs only | ⚠️ **Batch 1b** — verify no student-specific filtering first |
| `getSecondLanguageOptions(gradeLevelId)` | offerings + `second-language.ts` | reference UUID | ⚠️ **Batch 1b** — `filterStudentSecondLanguage` name implies per-student logic; **read before deciding** |
| `getStudentOwnSubjects(userId)` | joins the **student profile** | **`userId`** | 🚫 **NEVER** — violates R2 |
| `/api/v1/subjects` (inline query) | `subjects` where `isActive` | none | ✅ **CACHE** |

**What changes:** `'use cache'` + `cacheLife` inside the three green functions. **The route handlers
keep `export const dynamic = "force-dynamic"` and keep `await requireSession()`.** Auth runs on
every request, unchanged; only the catalog query result is memoised.

**What does NOT change:** any route, any auth gate, any response envelope, any client code.

**Invalidation:** superadmin catalog mutations (`POST`/`PATCH`/`DELETE` under
`/api/v1/admin/catalog/*`) must call `revalidateTag("catalog")`. **This is mandatory, not optional** —
without it a superadmin edit to the catalog would not appear for up to an hour. Batch 1 ships the
`cacheTag("catalog")` + `revalidateTag` pair together or not at all.

**Benefit:** the catalog tree is a 4-level nested query with 5 joins, hit on every onboarding wizard
step and every Subjects page load. This is the single most expensive read-only query in the app.

**Proof:** (a) a test asserting a repeated `getCatalogTree()` issues one DB query, not two;
(b) a test asserting a superadmin catalog write is visible on the next read (revalidation works);
(c) a grep-based test asserting no cached function's signature accepts a user id (guards R2 against
future drift).

**Risk:** Very low. Worst case = stale catalog for `cacheLife` duration, which the revalidation
hook prevents. No money path touched.

---

### Batch 2 — Dashboard shell prerendering

**File:** `apps/www/src/app/[locale]/dashboard/layout.tsx` — one line.

**Change:** remove `export const dynamic = "force-dynamic"`.

**Effect:** ~73 dashboard shells move from per-request SSR to build-time prerender.

**Why it is safe:** the layout renders `<>{children}</>`; every page under it is a client component
or a 7-line wrapper; no server data is read anywhere in the subtree.

**Why it needs a gate anyway:** this is the only batch that changes what gets written to disk at
build time. It ships **only** after this three-part proof:

1. `bun run build` output shows the 73 routes as `○ (Static)` with no build error. Any route that
   still needs request data will *fail the build* rather than leak — Next 16 errors on
   `cookies()`/`headers()` in a static render. That failure mode is the safety net.
2. **Byte-level inspection**: grep every emitted `.next/server/app/**/*.html` for the launch
   super-admin email, any `session`/`token`/`balance` token, and any seeded student name.
   Expected: zero hits.
3. A live smoke test per role confirming the role guard still redirects an unauthorised user.

**If any of the three fails, revert the one line.** The directive is restored and nothing else in
the repo has changed.

**Benefit:** removes a full server render from every dashboard navigation and cold load; the shell
becomes CDN-cacheable. Largest single TTFB win available.

**Explicitly NOT in this batch:** no change to any API route, no change to `RoleGuard`, no change
to any `force-dynamic` on a handler.

---

### Batch 3 — i18n payload reduction

**Files:** both apps' `[locale]/layout.tsx`, both `src/lib/i18n/index.ts`.

**Finding:** `<NextIntlClientProvider>` is used with no `messages` prop, so next-intl serialises the
**entire merged dictionary** into every page's RSC payload: **70,142 bytes (en) / 91,037 bytes (ar)**
of JSON, on every single page, for every user, including pages that use a dozen keys.

**Proposal:** scope messages per route segment (e.g. the student dashboard ships `student` +
`shared`, not `adminManage` + `teacher` + `parent`). next-intl supports passing an explicit
`messages` subset to the provider.

**Class:** SAFE — translations are static build-time assets, no user data.

**Benefit:** the largest single payload item on every page. Realistically 60–80 % reduction of it.

**Risk:** Low–medium *mechanically* (a missing key renders the key name, visible but not dangerous)
— which is why it is Batch 3, not Batch 1. Needs a per-locale render pass over every route to
confirm no missing keys. RTL/Arabic must be checked explicitly.

---

### Batch 4 — Code splitting

**Zero `next/dynamic` and zero `React.lazy` exist in either app today.**

| Target | Files | Change |
|---|---|---|
| `recharts` chart wrappers | 8 files (4 per app) | `next/dynamic` with `ssr: false` + skeleton |
| `admin-classes-screen.tsx` | 1439 lines | split modals/dialogs out (see §5 P1) |
| `chat-screen.tsx` + `socket.io-client` | 1022 lines | lazy-load the socket transport |
| `collaboration-panel.tsx` | 1021 lines | split |
| `register/page.tsx` | 505 lines | split the 4 role sub-forms |

**Class:** SAFE — presentation-layer only, no rendering or caching semantics change, no data path
touched.

**Benefit:** `recharts` is a large dependency currently pulled into the main graph. Reports and
dashboard-home pages are the heaviest client bundles in the app.

---

## 5. Separate proposals — NOT part of the batches above, no action taken

These are things the audit surfaced that are worth your decision. **They are listed here precisely
so they do not get smuggled into a caching batch.**

**P1 — Components that should be split.** By size, in order:
`admin-classes-screen.tsx` (1439), `chat-screen.tsx` (1022), `collaboration-panel.tsx` (1021),
`centers-screen.tsx` (813, superadmin), `admin-fees-screen.tsx` (806), `admin-rooms-screen.tsx` (754),
`admin-student-detail-screen.tsx` (694), `teacher-gradebook-screen.tsx` (646). These are maintenance
concerns as much as bundle concerns.

**P2 — Genuinely missing: zero `loading.tsx` across 109 pages.** Next.js streaming is entirely
unused. Every navigation shows a blank frame until the client screen mounts and paints its own
spinner. Adding `loading.tsx` per role segment is the cheapest perceived-performance win in the
repo and is **completely independent of caching** — it touches no data path. Arguably this should
be Batch 0.

**P3 — Genuinely missing: zero `error.tsx` across 109 pages.** An unhandled render error currently
falls through to Next's default error page. This intersects with pending security finding **M4**
("return a generic Internal error in prod; stop leaking raw `err.message`") — a route-level
`error.tsx` is where the client-side half of M4 belongs. **Recommend folding this into M4 rather
than into this optimization**, so the security fix stays in the security workstream.

**P4 — Genuinely missing: zero `not-found.tsx`.** Same rationale, lower priority.

**P5 — `cacheComponents` (Next 16's flag, formerly `dynamicIO`) is off.** Turning it on makes
uncached data access opt-in-explicit and would give much stronger *compile-time* guarantees that
money data is never cached. That is genuinely attractive for this codebase's threat model. But it
is a **repo-wide semantic change** to 303 route handlers, which is exactly the "repo-wide sweep in
one shot" you ruled out. **Recommendation: leave off for now.** Revisit only after Batches 1–4 have
landed and only as its own dedicated, separately-approved plan.

**P6 — `/[locale]/ui-preview` is publicly routable in production.** It is a design-token gallery
with no auth gate. It leaks no data, so this is hygiene not a vulnerability — but it should
probably be gated behind `NODE_ENV !== "production"` like the quick-login buttons already are.
Flagging only; not acting.

**P7 — The one-line `dashboard/layout.tsx` `force-dynamic` has no explanatory comment.** Whatever
Batch 2 concludes, that file should end up with a comment stating *why* it is or is not dynamic, so
the next person does not have to re-derive this analysis.

---

## 6. Explicit non-goals — what this plan will never do

For the record, so no future batch drifts into them:

- ❌ Never cache any `/api/v1/**` **response**. All 301 handlers keep `force-dynamic`.
- ❌ Never cache anything reading `wallets`, `transactions`, `payments`, `payment_intents`,
  `subscriptions`, `payouts`, `commission_settings`, `session_settlements`.
- ❌ Never cache attendance, check-in, or door-scan reads.
- ❌ Never cache messaging, conversations, contacts, blocks, reports, or **parent oversight**.
- ❌ Never cache anything reading `cookies()`, `headers()`, or a NextAuth session.
- ❌ Never cache anything taking a user/student/center/teacher id as an argument.
- ❌ Never weaken `RoleGuard`, `requireSession`, `requireRole`, `scopedDb`, or RLS.
- ❌ No repo-wide sweep. One batch, one review, one proof.

---

## 7. Recommended order

| Order | Batch | Gate before proceeding |
|---|---|---|
| 0 | **P2 — `loading.tsx`** (optional, cheapest win, zero data risk) | Visual check per role |
| 1 | **Batch 1 — catalog `'use cache'`** | 3 proofs (§4.1) |
| 2 | **Batch 2 — dashboard shell prerender** | 3-part proof incl. byte-level HTML grep (§4.2) |
| 3 | **Batch 4 — code splitting** | Bundle-size before/after; `bun run build` green |
| 4 | **Batch 3 — i18n trim** | Per-locale render pass, ar + en, RTL checked |
| — | P5 `cacheComponents` | Deferred — needs its own approved plan |

Batch 4 is deliberately placed **before** Batch 3: it is lower-risk and its proof (bundle size) is
mechanical, whereas the i18n trim needs a human render pass in two locales.

---

## 8. Honest expected benefit

To set expectations correctly — **this is a payload and TTFB optimization, not a database-load
optimization.** Because every page fetches its data client-side from dynamic APIs, the number of
DB queries per user session is essentially unchanged by Batches 2–4. Only Batch 1 removes DB work,
and only for the catalog.

| Batch | What actually gets faster |
|---|---|
| 1 | Onboarding wizard + Subjects page: the heaviest read-only query stops re-running |
| 2 | Every dashboard navigation: one server render removed from the critical path |
| 3 | Every page: ~70–90 KB less JSON in the RSC payload |
| 4 | Reports/dashboard-home pages: `recharts` no longer in the initial graph |

Per CLAUDE.md, the intended approach is *"measure real traffic first to find actual slow paths."*
No production traffic data exists yet. **Batches 1, 2 and 4 are safe to do without it** because
they are structurally correct regardless of traffic shape. **Batch 3's sizing should ideally wait
for real traffic** — but its direction is right either way.

---

*End of Phase 1. No code, page, component, or caching config was modified in producing this
document.*
