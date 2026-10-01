# What Sentry costs in the browser bundle

**Analysis only — 2026-08-27. Nothing was changed.** Measured from source maps of
a production build of `apps/erp` (`analysis/sentry-bundle`, sourcemaps enabled
temporarily and reverted).

## The number in context

First Load JS for `/[locale]/dashboard/student` is **857.6 kB raw / 272.8 kB
gzipped**. Of that, `@sentry/*` is **159.9 kB raw, ~48.9 kB gzipped** — 21.5% of
the attributed bytes, on every page in the app.

For scale: the application's own code in that first load is ~7 kB.

## Where Sentry's 159.9 kB goes

| Area | raw | ~gz | share |
|---|---:|---:|---:|
| SDK core (client, scope, transport, envelope, event prep) | 68.2 kB | 20.8 kB | 42.7% |
| **Tracing / performance** | **60.8 kB** | **18.6 kB** | **38.0%** |
| Breadcrumb instrumentation (fetch, xhr, history, console, DOM) | 19.5 kB | 6.0 kB | 12.2% |
| Other default integrations | 11.4 kB | 3.5 kB | 7.1% |
| **Session Replay** | **0 kB** | **0 kB** | **absent** |

gz figures are the chunk's own 30.6% gzip ratio applied to each slice — a good
estimate, not a separate measurement, because measuring each exactly would mean
building variants, which this pass does not do.

Largest single modules: `@sentry/core/client.js` 9.4 kB,
`browser-utils/metrics/browserMetrics.js` 7.5 kB,
`browser/tracing/browserTracingIntegration.js` 6.3 kB, `core/scope.js` 5.8 kB,
`core/tracing/sentrySpan.js` 4.9 kB.

## Session Replay: already off, and it ships nothing

**Turning replay off in production would save zero bytes and lose nothing,
because it is already off and its code is not in the bundle.** No
`replayIntegration` is configured, and no `@sentry-internal/replay` module
appears in any of the 109 client chunks — the SDK tree-shakes what is never
imported.

It is off deliberately, and the reason is not bundle size.
`apps/erp/instrumentation-client.ts` states it: replay records the DOM, and on
this platform the DOM contains a minor's name, their grades and a guardian's
email. That reasoning outranks any number in this document, and nothing here
argues for revisiting it.

## Tracing: enabled, sampled at 10% in production, 60.8 kB

`packages/observability/src/sentry-options.ts` sets `tracesSampleRate` to **0.1
in production and 0 everywhere else** (overridable via
`SENTRY_TRACES_SAMPLE_RATE`).

**The sample rate governs how many traces are SENT, not how much code is
SHIPPED.** At 0.1 the browser still downloads and initialises the whole tracing
stack — `browserTracingIntegration`, `sentrySpan`, `idleSpan`, `spanUtils`,
`browserMetrics`, the fetch/xhr request instrumentation and the Next App Router
navigation instrumentation — and then discards 90% of what it measures. In
development and CI, where the rate is 0, those 60.8 kB are downloaded and do
nothing at all.

The 14 default integrations currently active: breadcrumbs, browserapierrors,
browsersession, conversationId, culturecontext, dedupe, eventFilters,
fetchStreamPerformance, functiontostring, globalhandlers, httpcontext,
linkederrors, rewriteframes, webVitals.

## One more thing worth knowing

The build measured here had **no DSN set**, so `isSentryEnabled()` was false and
the SDK was initialised inert — and all 159.9 kB shipped anyway.
`instrumentation-client.ts` imports `@sentry/nextjs` unconditionally, so the
bundle cost does not depend on whether Sentry is switched on. Any local or
preview build carries it.

## What could be done (not proposed, not costed as a decision)

1. **Drop tracing from the client** — the largest single lever at ~18.6 kB
   gzipped. Cost: no browser performance traces, no Web Vitals to Sentry, no
   client spans linking a slow page to a slow API call. Server tracing is
   unaffected. Whether 10%-sampled browser traces are worth 18.6 kB on every
   page is a product question, not a technical one.
2. **Trim default integrations** — a few kB each, and each removal loses a
   specific diagnostic (breadcrumbs are usually the difference between a
   reproducible bug report and a stack trace with no story).
3. **Load Sentry lazily** — defer the SDK until after first paint. Keeps every
   capability, moves the bytes off the critical path, and loses the errors that
   happen during those first moments, which are often the ones worth catching.

None of these is recommended here. The measurement is the deliverable.

---

# Addendum — making the import conditional on the DSN

**Analysis only, 2026-08-27. Nothing changed.**

## First, the thing that outranks the question

**Production is serving the Sentry SDK with no DSN.** I fetched the live bundle
from `https://edura-erp.vercel.app/en/login` and read it: chunk
`27610-*.js`, 482 kB, contains `@sentry` and the tracing integration
(`browserTracingIntegration`, `idleSpan`), and contains **zero DSN-shaped
strings** — no `…@…ingest.sentry.io/…` anywhere in the 12 chunks that page loads,
690 kB in total.

No `NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN` is set in `.env`, in `.env.production`,
or in any CI workflow either.

So today every visitor downloads ~160 kB of an SDK that cannot transmit, and
**the Web Vitals and client spans you want after launch are not being collected
at all**. Setting the DSN is the prerequisite; this bundle question is secondary
to it.

## Can the import be made conditional? Yes — two shapes, only one of them safe

`NEXT_PUBLIC_SENTRY_DSN` is inlined at build time, so a condition on it is a
compile-time constant and a bundler can eliminate the dead branch. But a
top-level `import` cannot be placed inside an `if`, so the question is which
shape replaces it.

**Shape A — guarded dynamic import.**

```ts
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({ ...sharedSentryOptions("client") });
}
```

Eliminates cleanly when the DSN is absent. **But it changes production
behaviour**, which is the part that matters: init stops being synchronous with
module evaluation and happens a chunk-load later. Errors thrown in that window —
hydration failures, the first render of a portal — are exactly the ones worth
catching, and they would land before the SDK exists. `onRouterTransitionStart`
also has to become a forwarding wrapper, because Next reads that export at module
evaluation and it would not yet be resolved.

**Shape B — build-time alias, and this is the one I would propose.**

`next.config.ts` already computes `sentryEnabled` from the DSN. When it is false,
point the module specifier at a small stub:

```ts
// webpack (apps/erp builds with --webpack)
config.resolve.alias["@sentry/nextjs"] = require.resolve("./sentry-stub");
// and turbopack.resolveAlias for `next dev`, which does not use webpack
```

The import in `instrumentation-client.ts` stays exactly as written — static,
synchronous, same timing — and simply resolves to a stub exporting `init`,
`captureRouterTransitionStart` and the handful of functions the app calls. When
the DSN IS set the alias is not applied and the real SDK is used, byte for byte
as today.

## What it saves

| Where | Saving |
|---|---|
| Any build with no DSN — local, CI, preview, **and production as it stands today** | **159.9 kB raw / ~48.9 kB gzipped** off every page's first load |
| Same builds, CDN weight | a second copy of the SDK sits in `main-*.js` (299.8 kB chunk, ~83% Sentry). App-router routes never load it, so users do not download it, but it is built and deployed |
| Production once a DSN is set | **nothing** — the alias is not applied and the bundle is unchanged |

## Does it risk anything in production?

**Shape B: no.** With a DSN present nothing about the build changes. With no DSN
you lose an SDK that could not transmit anyway.

**Shape A: yes** — the init-timing window described above, in exchange for the
same bytes. Not worth it.

The one hazard either shape shares is a deploy that forgets the DSN: you would
get no Sentry, quietly. That is **already true today** and is not made worse —
the difference is only whether you also pay 160 kB for the silence. If you want
that failure to be loud, the check belongs next to the other production env
guards (`STUDENT_QR_SECRET`, `VIEW_AS_SECRET`) which throw when unset, not in the
bundler.

## Two notes for whoever implements it

- `apps/erp` builds with `next build --webpack` but `next dev` runs Turbopack, so
  an alias has to be declared for both or development and production diverge in
  what they resolve.
- `error.tsx`, `global-error.tsx`, `sentry-user.ts` and `csp-report.ts` all import
  `@sentry/nextjs` directly. The stub has to satisfy every one of them, or the
  alias trades a bundle saving for a build error.

---

# Addendum 2 — what a `NEXT_PUBLIC_SENTRY_DSN` production guard would touch

**Analysis only, 2026-08-27. Nothing changed. For approval before implementing.**

## It cannot take the shape of the guards it would sit alongside

`STUDENT_QR_SECRET` and `VIEW_AS_SECRET` are guarded by the same pattern
(`student-qr.ts:92`, `view-as-token.ts:65`): a **lazy, point-of-use, server-only**
check that throws when the feature is exercised in production without the secret.
Both are server secrets read inside a server function, so throwing costs one
request and names the cause.

`NEXT_PUBLIC_SENTRY_DSN` fits none of that:

- **It has no server point of use.** Its consumer is
  `apps/erp/instrumentation-client.ts`, which runs **in the browser**. A throw
  there does not fail a deploy — it breaks the app for every visitor.
- **`isSentryEnabled()` is shared.** It lives in
  `packages/observability/src/sentry-options.ts` and is imported by client,
  server and edge alike. A throw inside it would fire in the browser too.
- **It is a build-time value.** `NEXT_PUBLIC_*` is inlined into the client bundle
  when the bundle is compiled. A runtime check on the server therefore proves
  nothing about the shipped JavaScript: it passes while the browser bundle is
  blind (env set after the build), and fails after the env is fixed until
  something rebuilds.

## Where it does belong: the build

`apps/erp/next.config.ts:336` already computes the exact condition:

```ts
const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
);
```

A throw beside that line fails the build before anything can deploy, which is the
loudness you asked for, at the only moment the value is actually decided.

**Files touched: two.** `apps/erp/next.config.ts` and
`apps/superadmin/next.config.ts` — the block is mirrored in both. Nothing else
changes: the nine files per app that import `@sentry/nextjs` are untouched, and
so is every runtime path.

## The trap that decides the condition

**`NODE_ENV` is `production` for every `next build`** — including CI, including a
local production build, including Vercel preview deployments. `.github/workflows/ci.yml:261`
runs `bun run build` with no DSN set anywhere in the repo.

So a guard written as `NODE_ENV === "production"` turns CI red on the next
commit, and breaks every local `bun run build` (including the ones this cleanup
has been running all day).

The discriminator has to be a real production deploy — `VERCEL_ENV === "production"`,
which Vercel sets to `preview` for preview builds and leaves unset locally and in
CI. **Nothing in this repo reads `VERCEL_ENV` today** (no hits anywhere in
`apps/` or `packages/`), so it would be a new environment signal, and it is worth
saying out loud that the guard then only protects the Vercel path — a deploy by
any other route is unguarded.

## One subtlety worth deciding at the same time

`sentryEnabled` accepts **either** `NEXT_PUBLIC_SENTRY_DSN` **or** `SENTRY_DSN`.
Only the first reaches the browser. So a deploy that sets only `SENTRY_DSN` gets
server and edge reporting, a blind browser — and would **pass** a guard written
against `sentryEnabled`.

If the goal is the browser telemetry you want after launch (Web Vitals, client
spans), the guard has to require `NEXT_PUBLIC_SENTRY_DSN` specifically, not
"either DSN". They are not interchangeable and the current expression treats them
as if they were.

## Summary for approval

| | |
|---|---|
| Files changed | 2 (`apps/{erp,superadmin}/next.config.ts`) |
| Shape | build-time `throw`, beside the existing `sentryEnabled` |
| Condition | `VERCEL_ENV === "production" && !NEXT_PUBLIC_SENTRY_DSN` |
| Breaks CI? | No — `VERCEL_ENV` is unset there. It WOULD break CI if written against `NODE_ENV` |
| Breaks local production builds? | No, same reason |
| Covers non-Vercel deploys? | No — a new limitation, stated rather than hidden |
| Requires | the DSN set in Vercel first, or the next production deploy fails by design |
