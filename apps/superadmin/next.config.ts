import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV !== "production";

const cspReportOnly = process.env.CSP_MODE === "report-only";
const cspHeaderName = cspReportOnly
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

const erpFormAction = (process.env.ERP_BASE_URL || process.env.APP_BASE_URL || "")
  .replace(/\/+$/, "");

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'${erpFormAction ? ` ${erpFormAction}` : ""}`,
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
  `frame-src 'none'`,
  `worker-src 'self'`,
  `report-uri /api/v1/security/csp-report`,
  `report-to csp-endpoint`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
  { key: cspHeaderName, value: csp },
];

const nextConfig = {
  agentRules: false,

  reactStrictMode: true,

  experimental: {
    useTypeScriptCli: true,

    // `@repo/ui/components/charts` is a barrel re-exporting all 8 chart files,
    // so one `import { LineChart }` pulls every recharts module into the
    // importing route's bundle. Next rewrites barrel imports to deep ones here.
    optimizePackageImports: ["@repo/ui"],
  },

  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },

  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  transpilePackages: [
    "@repo/client-core",
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

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_SUPERADMIN ?? process.env.SENTRY_PROJECT,
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

const baseConfig = withNextIntl(nextConfig);

export default sentryEnabled
  ? withSentryConfig(baseConfig, sentryBuildOptions)
  : baseConfig;
