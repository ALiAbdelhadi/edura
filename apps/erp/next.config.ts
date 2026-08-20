import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. The CSP now ENFORCES by default and reports what it
// blocks (see the CSP_MODE block below). HSTS / nosniff / frame options /
// Referrer-Policy are enforced as they always were.
//
// STILL OPEN, deliberately: script-src keeps 'unsafe-inline'. Replacing it
// with a per-request nonce + 'strict-dynamic' needs a middleware.ts to mint
// the nonce, and neither app has one — introducing that layer is an
// architectural decision, not a header tweak. Enforcing THIS policy is still
// a real gain over Report-Only: it blocks unlisted script origins, eval in
// production, object/embed, base-uri hijacking, form-action exfiltration and
// cross-origin framing. The nonce is the next tightening, not a prerequisite.
const isDev = process.env.NODE_ENV !== "production";

// The chat client (socket.io) connects to the realtime server over HTTP
// polling + a WS upgrade, so both the http(s) and ws(s) origins are allowed.
const realtimeHttp = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005";
const realtimeWs = realtimeHttp.replace(/^http/, "ws");

// ---------------------------------------------------------------------------
// CSP MODE — enforce or observe, chosen by env, not by editing this file.
//
// The policy shipped Report-Only "until real traffic confirms nothing legit is
// flagged" — but it carried no report-uri and no report-to, so no traffic was
// ever confirmed by anything. It observed nothing for months. Reporting is now
// wired to /api/v1/security/csp-report, and the disposition is a switch:
//
//   CSP_MODE=enforce      (default) the policy BLOCKS, and reports what it blocks
//   CSP_MODE=report-only            the policy only reports
//
// Being an env var and not a constant is the point: a policy that turns out to
// break a real screen is rolled back by changing a variable and restarting,
// not by shipping a code change through a build — which is the difference
// between a minute and an hour while users are locked out.
// ---------------------------------------------------------------------------
const cspReportOnly = process.env.CSP_MODE === "report-only";
const cspHeaderName = cspReportOnly
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'self'`,
  `form-action 'self'`,
  // Cloudinary delivers material/receipt images; data:/blob: for inline SVGs
  // and generated previews.
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  // 'unsafe-inline' covers Next's injected critical CSS + style attributes.
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the theme-bootstrap script + Next's inline
  // hydration/streaming scripts; 'unsafe-eval' only in dev (HMR). Tightening
  // to a nonce-based script-src is a recommended follow-up.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // 'self' + the realtime socket origins (chat) + observability ingest.
  //
  // Sentry and PostHog are added here even though the CSP is still
  // Report-Only: the point of Report-Only is that the report reflects what
  // enforcing WOULD do. Leaving legitimate ingest out would fill the report
  // with violations that are not problems and hide the ones that are — and
  // the day the header flips to enforce, error reporting would go dark
  // exactly when it is most needed.
  //
  // PostHog is proxied same-origin through /ingest (see the rewrites below),
  // so only Sentry needs a cross-origin entry. `*.ingest.sentry.io` and
  // `*.ingest.de.sentry.io` cover both the US and EU regions.
  `connect-src 'self' ${realtimeHttp} ${realtimeWs} https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
  // Same-origin mock checkout + the real Paymob card iframe.
  `frame-src 'self' https://accept.paymob.com`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  // Where violations go. BOTH spellings on purpose: `report-uri` is deprecated
  // but is still the only one Safari and older Chrome honour, while `report-to`
  // is what current Chrome uses and is the only one that will survive. Sending
  // both means no browser is silently unreported. `report-to` names a group
  // declared by the Reporting-Endpoints header below.
  `report-uri /api/v1/security/csp-report`,
  `report-to csp-endpoint`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // `report-to` above is inert without this header — it names the group.
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
  { key: cspHeaderName, value: csp },
];

/** Content hash of a file in `public/`, used as its precache revision. */
function publicFileRevision(url: string): string {
  const file = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  return createHash("sha256")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 16);
}

const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  exclude: [/.*/],
  // THE REVISION MUST BE A CONTENT HASH, and this was a literal "v1".
  //
  // A precached entry is re-fetched only when its revision changes, so with a
  // constant every already-installed client kept serving the offline page it
  // first cached — for good. Editing offline.html shipped nothing: the new file
  // sat on the server while phones showed the old one, and the only way to
  // notice was to install the app, edit the page, and look. (Observed exactly
  // that way, 2026-08-11: a rebuilt offline.html did not reach an installed
  // client until this changed.)
  //
  // Serwist hashes files itself when it is left to glob `public/`; naming the
  // entries by hand opted out of that, so the hash has to be computed here.
  additionalPrecacheEntries: [
    "/offline.html",
    "/edura-mark.svg",
    "/edura-maskable.svg",
  ].map((url) => ({ url, revision: publicFileRevision(url) })),
});

const nextConfig = {
  // Next 16.3 writes an AGENTS.md + CLAUDE.md into the app on every dev boot.
  // This repo already carries its own agent instructions at the root, and a
  // generated per-app CLAUDE.md is loaded on top of them; keep the upgrade
  // behaviour-neutral and let those files stay authored, not emitted.
  agentRules: false,

  reactStrictMode: true,

  // Next refuses a second `next dev` against the same build directory, and this
  // repo routinely has more than one agent session working in it at once — the
  // second one cannot start a server to verify anything in a browser. Unset
  // everywhere that matters (CI, Vercel, ordinary local dev), so the default
  // `.next` is what actually ships; set it to build into a scratch directory
  // alongside a running server instead of on top of it.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // `next build` runs tsc a SECOND time, inside the build container. On
  // Vercel's standard 2-core/8GB builder that step ran for eight minutes and
  // then the container SIGKILLed the worker: "At least one Out of Memory (OOM)
  // event was detected during the build". It is the last thing standing
  // between www and a production deploy — see the Sentry note further down for
  // the first.
  //
  // The memory is not this app's code, it is `@prisma/client`: the generated
  // `index.d.ts` alone is 5.3 MB, and type-checking against it is a known
  // tsc memory spike. Locally, with room to breathe, the identical check takes
  // ~19s.
  //
  // TYPES ARE STILL CHECKED, and by the same command — `bun run check-types`
  // is its own required step in .github/workflows/ci.yml and passes 9/9 on a
  // runner that is not memory-starved. This turns off the DUPLICATE run, not
  // the guarantee.
  //
  // What it does cost, stated plainly: Vercel deploys on push without waiting
  // for CI, so a commit with a type error can now reach production in the
  // window before CI reports it, where previously the build would have failed
  // instead. That window is minutes and CI goes red in it. The alternative was
  // an app that has not deployed since 2026-08-02, which is the worse trade.
  // The clean fix is a build machine with more memory; this is what does not
  // require one.
  typescript: { ignoreBuildErrors: true },

  // Pin the workspace root EXPLICITLY. Without it, Turbopack infers the root
  // from "the directory of the nearest lockfile" — and inside a git WORKTREE
  // (each carries its own bun.lock, and the main checkout's is also visible)
  // it picked the MAIN checkout, warning "multiple lockfiles" on every boot.
  // A root that points at a sibling repo where other dev servers are
  // concurrently compiling is exactly the kind of cross-worktree interference
  // that produced the one-off "every route 500s with a JSON.parse error until
  // restart" boot (2026-08-04, center-role review). `import.meta.dirname` is
  // apps/www; the monorepo root is two levels up — of THIS checkout, whichever
  // worktree it is.
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },

  experimental: {
    // TypeScript 7 is the native (Go) compiler: it ships `tsc` and the new
    // `typescript/unstable/*` API, and no longer exposes the classic JS
    // compiler API Next reaches for. Without this flag Next refuses to build
    // at all — even here, where `ignoreBuildErrors` is on, because the setup
    // step that writes next-env.d.ts loads the API too. With it, Next shells
    // out to the `tsc` binary instead.
    useTypeScriptCli: true,

    // Enables the `"use cache"` directive ONLY. This is deliberately NOT
    // `cacheComponents` (Next 16's renamed dynamicIO): that flag changes
    // caching semantics for all 303 route handlers at once, which is the
    // repo-wide sweep docs/reports/rendering-optimization-plan.md §5 P5 rules
    // out. `useCache` leaves every existing route's behaviour untouched and
    // only lets an explicitly-marked function opt in.
    //
    // The only functions marked so far read the permanent Egyptian education
    // catalog (see src/lib/services/catalog/catalog-read.ts). Money, wallet,
    // attendance, messaging, auth and per-user reads stay dynamic.
    useCache: true,
  },

  // Mirror the Cloudinary cloud name to the browser so @repo/ui/lib/cloudinary
  // can build delivery/transformation URLs client-side. Only the cloud name is
  // exposed — it appears in every delivery URL anyway; the API key and secret
  // stay server-only. Derived from CLOUDINARY_CLOUD_NAME so deployments set
  // one variable, not two.
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // PostHog is reverse-proxied through our own origin. Two reasons, and the
  // first is the one that matters in this market: `*.i.posthog.com` is on every
  // major blocklist, so direct ingest silently loses a large slice of Egyptian
  // traffic and the funnel under-reports without any error to notice. Second,
  // same-origin keeps `connect-src 'self'` sufficient for analytics.
  //
  // Sentry is deliberately NOT proxied this way: an error tracker has to keep
  // working when this server is unhealthy, which is precisely when a
  // self-hosted tunnel would be down too. Hence its explicit connect-src entry.
  async rewrites() {
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
    const assetHost = posthogHost.replace("//eu.i.", "//eu-assets.i.").replace("//us.i.", "//us-assets.i.");
    return [
      { source: "/ingest/static/:path*", destination: `${assetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  // PostHog's ingest paths are trailing-slash sensitive; Next's default
  // redirect would break them.
  skipTrailingSlashRedirect: true,

  images: {
    // `as const` is load-bearing: `remotePatterns` is typed `(RemotePattern | URL)[]`,
    // and RemotePattern.protocol is the union "http" | "https". Without it the literal
    // widens to `string`, matches neither member, and the whole config fails to typecheck.
    remotePatterns: [
      { protocol: "https" as const, hostname: "res.cloudinary.com" },
      // Placeholder photos used by the room demo seed (preview-seed.ts) only.
      { protocol: "https" as const, hostname: "picsum.photos" },
    ],
  },

  transpilePackages: [
    "@repo/database",
    "@repo/ui",
    "@repo/server-core",
    "@repo/notifications",
    "@repo/observability",
  ],
  serverExternalPackages: [
    "bcryptjs",
    "@prisma/client",
    ".prisma/client",
    "@prisma/client-runtime-utils",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
    "ioredis",
    "nodemailer",
  ],
};

// ============================================================================
// Sentry wraps OUTERMOST so its webpack plugin sees the final config, including
// the Serwist service-worker build.
//
// SOURCE MAPS: uploaded only when SENTRY_AUTH_TOKEN is set — i.e. in CI. A
// local `bun run build` neither uploads nor needs credentials, and
// `deleteSourcemapsAfterUpload` means the .map files never ship to the CDN. A
// publicly-served source map is a free copy of the entire server-side codebase,
// which on this app includes the money engine.
// ============================================================================
// Sentry's Next plugin instruments the WHOLE build — module wrapping plus the
// widened client-file sweep below — and it does that whether or not Sentry is
// actually configured. Production has no DSN set, so the build was paying the
// entire cost for an integration that is inert at runtime.
//
// On Vercel's 2-core/8GB builder that was the difference between finishing and
// not. Every www production deploy from `6a8fa73f` (the operational-layer
// merge that introduced Sentry, 2026-08-02) onward died with
// BUILD_EXCEEDED_MAXIMUM_TIME at the 45-minute ceiling — 36 failures — while
// superadmin, which builds with Turbopack, was unaffected. Production served
// 2026-08-02 code for four days and nothing said so.
//
// docs/runbooks/observability.md already promises this: "with none of them set,
// Sentry and PostHog are inert". That was true of the runtime and false of the
// build. Now it is true of both — no DSN, no plugin. Set NEXT_PUBLIC_SENTRY_DSN
// (or SENTRY_DSN) and everything below applies exactly as before.
const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
);

const withOptionalSentry = <T,>(cfg: T) =>
  sentryEnabled ? withSentryConfig(cfg, sentryBuildOptions) : cfg;

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Quiet locally, verbose in CI where the log is the only way to see it work.
  silent: !process.env.CI,

  sourcemaps: {
    // Never leave maps on the CDN.
    deleteSourcemapsAfterUpload: true,
    // No token (local/preview builds) => no upload attempt, no build failure.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Covers files served from static chunks that the default glob misses —
  // without it, client stack traces stay minified.
  widenClientFileUpload: true,

  // Strips Sentry's own debug logging from the production bundle.
  disableLogger: true,

  // We are on Vercel, but cron monitoring is not set up and the automatic
  // instrumentation would create check-ins nobody watches.
  automaticVercelMonitors: false,
};

export default withOptionalSentry(withSerwist(withNextIntl(nextConfig)));
