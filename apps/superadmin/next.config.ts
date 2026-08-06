import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. The back-office is the highest-value surface, so it is
// stricter than www: never framable and no cross-origin frames/sockets. CSP
// ships Report-Only first (observe, don't block); the rest is enforced.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  // Cloudinary delivers material/receipt images shown in the back-office.
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the theme-bootstrap + Next inline hydration scripts;
  // 'unsafe-eval' only in dev (HMR). Nonce-based tightening is a follow-up.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // 'self' + Sentry ingest. Added while the CSP is still Report-Only on
  // purpose: the report only means something if legitimate traffic is
  // allowed, and the day this flips to enforce, error reporting must not go
  // dark. NO PostHog entry — product analytics does not run in the back
  // office (see the note in apps/www/next.config.ts).
  `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
  `frame-src 'none'`,
  `worker-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig = {
  reactStrictMode: true,

  // Cloud name only (public by construction — it is in every delivery URL);
  // the API key/secret stay server-side. Lets @repo/ui/lib/cloudinary build
  // transformation URLs in the back-office too.
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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

// Sentry wraps outermost. Source maps upload only when SENTRY_AUTH_TOKEN is
// set (CI) and are deleted afterwards — a public source map of the back office
// would hand out the whole admin surface. Identical policy to apps/www.
// Same gate as apps/www: the plugin instruments the whole build even with no
// DSN configured, and production has none. This app builds with Turbopack and
// so never hit the 45-minute ceiling www did — the gate is here because the
// two configs must not disagree about when Sentry is on, not because this
// build was failing.
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
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
};

const baseConfig = withNextIntl(nextConfig);

export default sentryEnabled
  ? withSentryConfig(baseConfig, sentryBuildOptions)
  : baseConfig;
