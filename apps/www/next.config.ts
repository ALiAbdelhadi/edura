import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. CSP ships as Report-Only first (observe, don't block)
// so it can be tightened to enforce once real traffic confirms nothing legit
// is flagged. HSTS / nosniff / frame options / Referrer-Policy ARE enforced.
const isDev = process.env.NODE_ENV !== "production";

// The chat client (socket.io) connects to the realtime server over HTTP
// polling + a WS upgrade, so both the http(s) and ws(s) origins are allowed.
const realtimeHttp = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005";
const realtimeWs = realtimeHttp.replace(/^http/, "ws");

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
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  exclude: [/.*/],
  additionalPrecacheEntries: [
    { url: "/offline.html", revision: "v1" },
    { url: "/edura-mark.svg", revision: "v1" },
    { url: "/edura-maskable.svg", revision: "v1" },
  ],
});

const nextConfig = {
  reactStrictMode: true,

  experimental: {
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
