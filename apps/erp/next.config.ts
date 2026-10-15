import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();


// SECURITY_AUDIT.md M-09: the PAGE policy is minted per request in src/proxy.ts
// with a nonce (script-src has no 'unsafe-inline' any more). This file keeps
// the transport headers for every path and a locked-down CSP for the API
// routes the middleware does not match.
import { buildApiCsp, cspHeaderName as resolveCspHeaderName } from "./src/lib/security/csp";
import { serviceRewrites } from "./src/lib/http/service-routes";
import { mediaImageRemotePatterns } from "@repo/shared/media-delivery";

const cspHeaderName = resolveCspHeaderName();
const apiCsp = buildApiCsp();

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()" }, // NET-01
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
];

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
  disable:
    process.env.SERWIST_DISABLE === "1" ||
    (process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1"),
  exclude: [/.*/],
  additionalPrecacheEntries: [
    "/offline.html",
    "/edura-mark.svg",
    "/edura-maskable.svg",
  ].map((url) => ({ url, revision: publicFileRevision(url) })),
});

// Next sets process.env.NEXT_PHASE only AFTER it has loaded this file and read
// rewrites(), so serviceUrl()'s "is this a build?" test would never be true
// here. The phase Next hands the exported function is the same value, in time.
let configPhase: string | undefined;

const nextConfig = {
  agentRules: false,

  reactStrictMode: true,

  distDir: process.env.NEXT_DIST_DIR || ".next",

  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },

  experimental: {
    useTypeScriptCli: true,

    webpackMemoryOptimizations: true,

    ...(process.env.SERWIST_DISABLE === "1" ? { webpackBuildWorker: false } : {}),
  },

  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: cspHeaderName, value: apiCsp }] },
    ];
  },

  async rewrites() {
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
    const assetHost = posthogHost.replace("//eu.i.", "//eu-assets.i.").replace("//us.i.", "//us-assets.i.");
    return {
      beforeFiles: serviceRewrites({
        ...process.env,
        NEXT_PHASE: process.env.NEXT_PHASE ?? configPhase,
      }),
      afterFiles: [
        { source: "/ingest/static/:path*", destination: `${assetHost}/static/:path*` },
        { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
      ],
      fallback: [],
    };
  },
  skipTrailingSlashRedirect: true,

  images: {
    // SECURITY_AUDIT.md SUPPLY-01: `/_next/image` fetches and decodes whatever
    // this list allows, unauthenticated. Scoped to OUR Cloudinary account so no
    // other account's upload can be fed to the optimizer; the demo image host
    // is gone. An unset cloud name fails closed (nothing matches) rather than
    // widening to the whole CDN.
    remotePatterns: mediaImageRemotePatterns(process.env.CLOUDINARY_CLOUD_NAME),
  },

  transpilePackages: [
    "@repo/client-core",
    "@repo/ui",
    "@repo/shared",
    "@repo/observability",
  ],
};

// In Vercel Services mode the URL is a runtime-only service binding, absent
// at build time by design (see serviceRewrites).
if (
  process.env.VERCEL_ENV === "production" &&
  process.env.EDURA_SERVICE_BINDINGS !== "1" &&
  !process.env.API_SERVICE_URL
) {
  throw new Error(
    [
      "API_SERVICE_URL is missing, and this is a production deploy.",
      "",
      "Every /api request and every server-rendered page reaches apps/api through",
      "it; without it the ERP has no backend (src/lib/http/service-routes.ts).",
      "Set it to the service origin (https://…, no trailing path) in Vercel >",
      "Project > Settings > Environment Variables, scoped to Production.",
    ].join("\n"),
  );
}

if (process.env.VERCEL_ENV === "production" && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  throw new Error(
    [
      "NEXT_PUBLIC_SENTRY_DSN is missing, and this is a production deploy.",
      "",
      "Without it the Sentry SDK still ships to every visitor (~160 kB) and can",
      "transmit nothing: no browser errors, no Web Vitals, no client spans.",
      "",
      "Set it in Vercel > Project > Settings > Environment Variables, scoped to",
      "Production (and Preview, if previews should report), then redeploy. The",
      "value is the client DSN from Sentry > Project Settings > Client Keys (DSN).",
      "",
      "SENTRY_DSN alone is NOT enough — only NEXT_PUBLIC_ variables reach the",
      "browser. Set both if the server should report to the same project.",
    ].join("\n"),
  );
}

const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
);

const withOptionalSentry = <T,>(cfg: T) =>
  sentryEnabled ? withSentryConfig(cfg, sentryBuildOptions) : cfg;

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,

  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // false since 2026-08-31. This widens the set of client bundles Sentry's
  // webpack plugin processes, and its payoff is better stack traces from
  // uploaded source maps — which are OFF here: `sourcemaps.disable` is
  // `!SENTRY_AUTH_TOKEN`, and no auth token is set on either project. So it was
  // paying the cost with nothing to show for it. The ERP build stalled past 20
  // minutes on Vercel's 2-core box in exactly this phase, while the same commit
  // compiled in 37s locally on 9 workers. Turn it back on the day a
  // SENTRY_AUTH_TOKEN exists and source maps are actually uploaded.
  widenClientFileUpload: false,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
};

const wrappedConfig: unknown = withOptionalSentry(withSerwist(withNextIntl(nextConfig)));

export default function eduraNextConfig(phase: string, context: unknown) {
  configPhase = phase;
  return typeof wrappedConfig === "function" ? wrappedConfig(phase, context) : wrappedConfig;
}
