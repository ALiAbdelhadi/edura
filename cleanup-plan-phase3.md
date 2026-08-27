# Cleanup plan — Phase 3: rendering, route by route

**Status: I-3.0, I-3.1, I-3.2 and I-3.3 EXECUTED** on `cleanup/performance`
(2026-08-27). I-3.4 not started — it needs the bundle analyzer, which is Phase 4.
**Gates 3 and 4 have not run on any of it**, so nothing here may reach `main` yet.
See the run report at the end.
Every route in all three Next apps was classified against the build of
`0dec74d` (`bun run build`, 31 s, green).

**This supersedes [docs/reports/rendering-optimization-plan.md](docs/reports/rendering-optimization-plan.md)**
(2026-07-25). That report is now wrong in two ways that matter, both because the
app changed under it — see §2.

---

## 1. Measured baseline

| App | ƒ dynamic | ○ static | ● SSG | pages | `"use client"` pages | `loading.tsx` |
|---|---:|---:|---:|---:|---:|---:|
| erp | 356 | 3 | 0 | 122 | 55 | 14 |
| superadmin | 243 | 1 | 6 | 36 | 7 | 2 |
| www | 1 | 4 | 17 | 8 | 0 | 0 |

www's single ƒ is `/api/contact`; every one of its pages is already ●.
**www is finished. No work is proposed for it.**

---

## 2. What the old report got wrong, and why

**It said 109/109 erp pages are `"use client"`. Today 55 of 122 are.** The app
was restructured after that report (including the rename from `apps/www` to
`apps/erp`, so its paths no longer resolve). Most pages are now server wrappers
around client screens.

**Its Batch B — "drop the blanket `force-dynamic` and prerender ~73 dashboard
shells" — is dead, and must not be revived.** Two things happened:

1. The blanket directive it targeted is already gone. `[locale]/dashboard/layout.tsx`
   carries no `force-dynamic` today.
2. **All six role layouts now `await requirePortal(role, locale)`**, a server-side
   session read, per [docs/decisions/server-side-portal-gate.md](docs/decisions/server-side-portal-gate.md)
   (2026-08-20 — *after* that report). That decision moved the portal gate out of
   the browser precisely so the server decides who you are before it draws
   anything, killing seven sequential round trips on first sign-in.

   Prerendering those shells means deleting that gate. **The safety contract
   forbids it** ("never weaken RoleGuard, requireSession, requireRole"). All 94
   erp pages under `/dashboard` are legitimately dynamic and stay that way.

The same is true in superadmin: `[locale]/dashboard/layout.tsx` calls `headers()`
and `auth.api.getSession`, which is exactly why its `/login`, `/two-factor` and
`/two-factor-setup` are already ● while its 30 dashboard pages are ƒ. **Correct
as it stands. No change proposed.**

**One more thing the old report asserted that is no longer true:** "zero
`loading.tsx` across 109 pages." erp now has 14 and superadmin 2, placed at each
portal root and at the messaging routes. Since a segment's `loading.tsx` wraps
every route nested under it, per-portal coverage is effectively complete; the gap
is narrower than a 14/122 ratio suggests.

**There is no auth in middleware.** `apps/erp/src/proxy.ts` is next-intl only.
Nothing is guarded at the edge, so a page's own layout chain is the whole gate —
which is what makes §3's counts the real answer rather than a heuristic.

---

## 3. Classification

### erp — 122 pages

| Class | Count | Verdict |
|---|---:|---|
| **C — under `/dashboard`** | 94 | **Stay dynamic.** Guarded by `requirePortal` in the six role layouts |
| **C — session or `searchParams` bound** | 13 | **Stay dynamic.** `/`, `/login`, `/register`, `/claim`, `/onboarding`, `/two-factor`, `/c/[payload]`, `/receipts/[paymentId]`, `/student-id/print`, `/reports/print`, `/invite/accept`, `/reset-password`, `/guardian/verify` |
| **A — prerenderable once I-3.0 lands** | 15 | see below |

The 15, and what each needs:

| Route | Today | Blocked by | After I-3.0 |
|---|---|---|---|
| `/[locale]/help`, `/help/[slug]`, `/faq`, `/contact`, `/changelog`, `/privacy`, `/terms` | ƒ | **only the root layout** — each already declares `generateStaticParams` | ● both locales |
| `/[locale]/pricing` | ƒ | its own `force-dynamic` **and** the root layout | ● once the directive goes; it renders a marketing screen and reads no request |
| `/[locale]/receipt-preview` | ƒ | its own `force-dynamic` | verify first — it renders `ReceiptSheet` from params |
| `/[locale]/forgot-password`, `/ui-preview` | ƒ | root layout | ● |
| `/[locale]/[id]`, `/centers/[id]`, `/courses/[id]` | ƒ | root layout; no `generateStaticParams` | shell can be static, but the ids are unbounded — leave on-demand rather than enumerate |
| `/[locale]/[...rest]` | ƒ | root layout | catch-all; verify it is not doing a server redirect |

### superadmin — 36 pages

30 under `/dashboard` (server auth gate — stay ƒ), 6 already ●. **Only work:
`loading.tsx` coverage.**

### www — 8 pages

Already optimal. **No work.**

---

## 4. Batches

### I-3.0 — remove the root-layout session read *(the whole phase turns on this)*

- [ ] `apps/erp/src/app/[locale]/layout.tsx:143`
  - **Action:** REFACTOR. Delete `const actor = await getSessionUser()` and the
    `analyticsSession` it builds; have `AnalyticsProvider` resolve the actor in
    the browser.
  - **Before:**
    ```tsx
    const actor = await getSessionUser();
    const analyticsSession = actor
      ? { id: actor.id, role: actor.role, centerId: actor.centerId ?? null }
      : null;
    // …
    <AnalyticsProvider session={analyticsSession}>
    ```
  - **After:** `<AnalyticsProvider>` with no `session` prop, reading identity
    client-side. Two mechanisms already exist and either will do —
    `authClient.useSession()` (`apps/erp/src/lib/auth/client.ts`) or refine's
    `useGetIdentity`, which `dashboard-shell.tsx:219` already calls. **Prefer
    `useGetIdentity`**: it shares refine's cache with the identity request the
    shell already makes, so this adds no round trip on any authenticated page.
  - **Why:** that one `await` reads cookies in the root layout of the entire app,
    which is why all 122 erp pages build as ƒ despite `generateStaticParams` on
    the layout and on seven pages individually. `apps/superadmin`'s root layout
    does not make the call, and its login pages prerender — the pattern is
    already running in this repo.
  - **Cost, stated plainly:** PostHog identifies one client round trip later
    instead of during the first render. `AnalyticsProvider` already re-identifies
    on `session?.id` change, so the code path exists. On a signed-out page there
    is nothing to identify and nothing is lost.
  - **What it does NOT do:** it does not make one dashboard page static. Those are
    held by `requirePortal`, which is untouched.
  - **Dependencies:** none. Everything else in this phase waits on it.
  - **Verification:** the four gates in §5.

### I-3.1 — drop `force-dynamic` where nothing needs it

- [ ] `apps/erp/src/app/[locale]/pricing/page.tsx:7` — remove the directive.
- [ ] `apps/erp/src/app/[locale]/receipt-preview/page.tsx:6` — **read the page
      first.** If it renders purely from route params it can go static; if it
      reads `searchParams`, it is dynamic by nature and the directive is
      redundant rather than wrong. Report before changing.
- [ ] `/[locale]/guardian/verify` and `/[locale]/dashboard` keep theirs —
      `/dashboard` runs `resolvePortalEntry` (a server session read) and
      `guardian/verify` consumes `searchParams`.
- **Dependencies:** I-3.0, otherwise the change is invisible.

### I-3.2 — `generateStaticParams` audit for the newly-static set

- [ ] Confirm the seven pages that already declare it emit both locales as ●.
- [ ] `/forgot-password` and `/ui-preview` inherit the root layout's — confirm.
- [ ] **Do not** add `generateStaticParams` to `/[id]`, `/centers/[id]`,
      `/courses/[id]`. Their ids are unbounded (every center, every course), and
      enumerating them at build time turns a content change into a redeploy.
- [ ] `/[locale]/ui-preview` is a design-token gallery with no auth gate, publicly
      routable in production. Making it static makes it *more* reachable.
      **Recommend gating it behind `NODE_ENV !== "production"`** in the same
      batch — it was flagged in the 2026-07 report as P6 and never actioned.

### I-3.3 — streaming coverage

- [ ] Add `loading.tsx` where a portal segment has none, and a `<Suspense>`
      boundary around any screen that mounts a chart or a socket
      (`recharts`, `chat-screen`) so a slow widget cannot hold its page.
- [ ] superadmin: 2 of 36 today. Its dashboard pages stay ƒ, so a skeleton is the
      only perceived-performance lever it has.
- **Risk:** none to data. This is the one batch that touches no rendering mode.

### I-3.4 — code splitting *(carried from the old report's Batch D)*

- [ ] **Zero `next/dynamic` and zero `React.lazy` exist in either app.** `recharts`
      is in the shared graph for anyone who loads a chart page.
- [ ] Candidates by size: `admin-classes-screen.tsx`, `chat-screen.tsx` +
      `socket.io-client`, `collaboration-panel.tsx`, `centers-screen.tsx`,
      `admin-fees-screen.tsx`.
- **Gate:** First Load JS per route must fall or hold. Needs
  `@next/bundle-analyzer`, which is Phase 4.

### Explicitly NOT in this phase

- Prerendering any `/dashboard` shell in either app. It requires deleting a
  server-side auth gate.
- `cacheComponents` / `dynamicIO`. A repo-wide semantic change to ~450 route
  handlers; its own plan, its own approval.
- Any `/api/**` handler. All keep `force-dynamic`.
- The i18n payload trim (old Batch C). It is a payload item, not a rendering one,
  and `baseMessages()` in `lib/i18n/scope.ts` already scopes what the layout
  ships — the old report's 70–90 KB figure predates it and needs re-measuring
  before anyone acts on it.

---

## 5. Proof gates — every rendering batch, all four

1. **Route-table diff.** `bun run --filter edura build:light`, diff the ○/ƒ/●
   census against the baseline in §1. Every flip listed and intended; an
   unintended flip reverts the batch.
2. **Static-leak grep.** Every emitted `.next/server/app/**/*.{html,rsc}` scanned
   for a sentinel list — the seeded super-admin email, seeded student names and
   phones, `wallet`, `balance`, and the session cookie name. **Zero hits.**
   Define the list once, in I-3.0.
3. **Two-user smoke.** For every flipped route: sign in as user A, then user B of
   the same role, and assert B never sees A's data. Non-negotiable wherever a
   render becomes shared.
4. **Per-role smoke.** The affected portal's Playwright flow green in `ar` and `en`.

The build itself is the fifth safety net and the cheapest: Next **errors** when a
statically-rendered page reaches for `cookies()` or `headers()`. A page that
still needs the request fails the build rather than leaking — which is why
I-3.0 is safe to attempt at all.

---

## 6. Honest expected benefit

**15 of 122 erp pages move from per-request render to prerendered.** That is the
whole rendering win, and it is smaller than the old report promised — because the
73 shells it counted on are now held by an auth gate that did not exist when it
was written.

Those 15 are the marketing, help, legal and password-recovery surfaces: the pages
an unauthenticated visitor and a search engine actually hit, where TTFB is the
whole experience. The 94 dashboard pages get streaming, not prerendering.

Nothing in this phase changes what any authenticated user sees, and nothing
changes when their data is read: every screen still fetches from a
`force-dynamic` route on every mount.


---

## Run report — 2026-08-27

| Item | Commit | Result |
|---|---|---|
| I-3.2 ui-preview gate | `46105b1` | route 404s in production; gallery moved to `features/dev/` |
| I-3.0 root-layout session read | `36a6ad8` | **erp 356 dynamic → 341**; 15 routes prerender |
| I-3.1 pricing | `6b1f26b` | **no change** — the directive is load-bearing |
| I-3.3 streaming | `3edbbfb` | 9 `loading.tsx`, census unmoved |

### Where the plan was wrong, corrected by the build

1. **Six routes I classified as permanently dynamic now prerender** — `claim`,
   `invite/accept`, `login`, `register`, `reset-password`, `two-factor`. I called
   them dynamic because they consume `searchParams`; they read them client-side
   through `useSearchParams` under a Suspense boundary, which does not force a
   dynamic render.
2. **`/pricing` was NOT the easy win the plan called it.** It reads the live
   `commission_settings` row through `getPricingExamples()` — the same row the
   settlement engine reads. Prerendering it would bake a commission rate into
   static HTML and a back-office rate change would silently stop reaching the
   public page. The directive stays and now carries the reason.
3. **`loading.tsx` coverage was already complete under `/dashboard`.** All 94
   routes resolve to one of the fourteen that existed. The real gap was outside
   `/dashboard`, and 15 of those routes no longer need one because I-3.0 made
   them static.

Net: the 15-page win Ali approved is real and landed. The two items the plan
expected to add to it (pricing, dashboard streaming) turned out to be a hazard
and a non-issue respectively.

### Gate status

| Gate | I-3.0 | I-3.1 | I-3.3 |
|---|---|---|---|
| 1 route-table diff | ✅ 15 intended flips, 0 unintended, 0 under `/dashboard` | ✅ census unmoved | ✅ census unmoved |
| 2 static-leak scan | ✅ 0 hits / 589 files / 9 sentinels | ✅ | ✅ |
| 3 two-user smoke | ⏸ pending a free dev database | ⏸ | ⏸ |
| 4 per-role smoke | ⏸ pending a free dev database | ⏸ | ⏸ |

`scripts/static-leak-check.ts` is the gate-2 implementation. It was verified
against a **planted** leak before its green was trusted, which is how a dud
sentinel was found (`@nile-academy.eg` never matched the seeded student logins at
`@student.nile-academy.eg`). 9 of 9 sentinels now fire on synthetic data.

**Merge block, per Ali: gates 3 and 4 must run against all 15 flipped routes —
`/login` and `/register` especially — before any of this reaches `main`.**
