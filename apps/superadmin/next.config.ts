import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. The back-office is the highest-value surface, so it is
// stricter than the ERP: never framable, no cross-origin frames or sockets.
// The CSP now ENFORCES by default and reports what it blocks (CSP_MODE below).
//
// STILL OPEN, deliberately: script-src keeps 'unsafe-inline' — a nonce needs a
// middleware.ts this app does not have. See the longer note in apps/erp.
const isDev = process.env.NODE_ENV !== "production";

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

// The ONE cross-origin destination this app may post a form to: the ERP's
// claim endpoint for a "view as" handoff.
//
// WHY THIS IS HERE AT ALL. `form-action 'self'` blocks a cross-origin form
// submit SILENTLY — no request, no console error the code can catch, nothing.
// The handoff is delivered as a top-level form POST precisely so the token
// never touches a URL (history, Referer, proxy logs), and that delivery is
// exactly what the directive refuses by default. Found by clicking the button
// in a real browser; every curl proof passed, because curl has no CSP.
//
// NARROW ON PURPOSE. One origin, read from the same variable the mint route
// posts to, so the allowlist cannot drift from the destination. Empty in
// development when unset — the dev fallback resolves to a localhost origin
// which `'self'` may not cover, so the value is included whenever it is known.
const erpFormAction = (process.env.ERP_BASE_URL || process.env.APP_BASE_URL || "")
  .replace(/\/+$/, "");

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'${erpFormAction ? ` ${erpFormAction}` : ""}`,
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
  { key: "X-Frame-Options", value: "DENY" },
  // `report-to` above is inert without this header — it names the group.
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
  { key: cspHeaderName, value: csp },
];

const nextConfig = {
  // Next 16.3 writes an AGENTS.md + CLAUDE.md into the app on every dev boot.
  // This repo already carries its own agent instructions at the root, and a
  // generated per-app CLAUDE.md is loaded on top of them; keep the upgrade
  // behaviour-neutral and let those files stay authored, not emitted.
  agentRules: false,

  reactStrictMode: true,

  experimental: {
    // TypeScript 7 (the native Go compiler) ships `tsc` and the new
    // `typescript/unstable/*` API, not the classic JS compiler API Next
    // reaches for. Without this flag `next build` refuses to start; with it,
    // Next shells out to the `tsc` binary for the type check.
    useTypeScriptCli: true,
  },

  // Same as apps/www: pin the workspace root so Turbopack never infers it from
  // a SIBLING checkout's lockfile inside a git worktree (see the comment in
  // apps/www/next.config.ts for the incident this prevents).
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },

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
/* A PRODUCTION DEPLOY WITHOUT BROWSER TELEMETRY FAILS HERE RATHER THAN SHIPPING
 * A SILENT SDK.
 *
 * Measured 2026-08-27: the live bundle carried @sentry and the tracing
 * integration in a 482 kB chunk and NOT ONE DSN string. Every visitor downloaded
 * ~160 kB of an SDK that could not transmit, and nobody found out, because an
 * SDK with no DSN reports nothing — including its own uselessness.
 *
 * `VERCEL_ENV`, NOT `NODE_ENV`. `next build` sets NODE_ENV to "production" for
 * EVERY build — CI, a local `bun run build`, and preview deploys — so guarding on
 * it would turn CI red and break local builds. VERCEL_ENV is "production" only
 * for a real production deploy, "preview" for previews, and unset everywhere
 * else. The consequence, stated rather than hidden: this guard protects the
 * Vercel path only.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` BY NAME, not `sentryEnabled`. That flag accepts
 * `SENTRY_DSN` too, but only a NEXT_PUBLIC_ variable is inlined into the client
 * bundle — a deploy setting just `SENTRY_DSN` gets server and edge reporting and
 * a blind browser, and would pass a check written against the flag. Web Vitals
 * and client spans are exactly what this is here to protect.
 */
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
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
};

const baseConfig = withNextIntl(nextConfig);

export default sentryEnabled
  ? withSentryConfig(baseConfig, sentryBuildOptions)
  : baseConfig;
