import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV !== "production";

const realtimeHttp = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005";
const realtimeWs = realtimeHttp.replace(/^http/, "ws");

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
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' ${realtimeHttp} ${realtimeWs} https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
  `frame-src 'self' https://accept.paymob.com`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  `report-uri /api/v1/security/csp-report`,
  `report-to csp-endpoint`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
  { key: cspHeaderName, value: csp },
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

const nextConfig = {
  agentRules: false,

  reactStrictMode: true,

  distDir: process.env.NEXT_DIST_DIR || ".next",

  typescript: { ignoreBuildErrors: true },

  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },

  experimental: {
    useTypeScriptCli: true,

    webpackMemoryOptimizations: true,

    ...(process.env.SERWIST_DISABLE === "1" ? { webpackBuildWorker: false } : {}),

    // Next 16.3 deprecates this in favour of the top-level cacheComponents,
    // but that option REFUSES any route exporting `dynamic`, and ~340 routes
    // here do — deliberately, because money, wallets, subscriptions,
    // attendance, messaging and auth must never be cached. Migrating is a
    // per-route rendering review, not a rename. Left on the deprecated option
    // until that review happens.
    useCache: true,
  },

  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  async rewrites() {
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
    const assetHost = posthogHost.replace("//eu.i.", "//eu-assets.i.").replace("//us.i.", "//us-assets.i.");
    return [
      { source: "/ingest/static/:path*", destination: `${assetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,

  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "res.cloudinary.com" },
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

  widenClientFileUpload: true,

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
};

export default withOptionalSentry(withSerwist(withNextIntl(nextConfig)));
