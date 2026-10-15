import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();


// SECURITY_AUDIT.md M-09: the PAGE policy is minted per request in src/proxy.ts
// with a nonce; this file keeps the transport headers and a locked-down CSP
// for the API routes. `erpFormActionFromEnv` still reads process.env.ERP_BASE_URL.
import {
  buildApiCsp,
  cspHeaderName as resolveCspHeaderName,
  erpFormActionFromEnv,
} from "./src/lib/security/csp";
import { serviceRewrites } from "./src/lib/http/service-routes";

// Next hands the phase to a function-shaped config (below) but sets NEXT_PHASE
// only after loading it; serviceRewrites() reads the phase from here so a
// production BUILD without ADMIN_API_SERVICE_URL still resolves the dev URL
// (the Vercel-production check further down refuses that build itself).
let configPhase: string | undefined;

const cspHeaderName = resolveCspHeaderName();
const apiCsp = buildApiCsp();
const erpFormAction = erpFormActionFromEnv();
void erpFormAction; // the page policy consumes it in src/proxy.ts

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" }, // NET-01
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Reporting-Endpoints", value: `csp-endpoint="/api/v1/security/csp-report"` },
];

const nextConfig = {
  agentRules: false,

  reactStrictMode: true,

  // The hop launch config builds into .next-hop so a parallel `next dev` does
  // not fight the default dev server over one directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",

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
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: cspHeaderName, value: apiCsp }] },
    ];
  },

  // Phase 5 (docs/decisions/backend-separation.md): every /api prefix in
  // src/lib/http/service-routes.ts is proxied to apps/admin-api,
  // unconditionally — this app has no route files. `beforeFiles` so the rewrite
  // wins over any page or static match; src/proxy.ts stamps the client IP on
  // the way through.
  async rewrites() {
    return {
      beforeFiles: serviceRewrites({ ...process.env, NEXT_PHASE: process.env.NEXT_PHASE ?? configPhase }),
      afterFiles: [],
      fallback: [],
    };
  },

  // Server packages left with the routes: the frontend bundles only what the
  // browser and the page shell need.
  transpilePackages: ["@repo/client-core", "@repo/ui", "@repo/shared", "@repo/observability"],
};

// In Vercel Services mode the URL is a runtime-only service binding, absent
// at build time by design (see serviceRewrites).
if (
  process.env.VERCEL_ENV === "production" &&
  process.env.EDURA_SERVICE_BINDINGS !== "1" &&
  !process.env.ADMIN_API_SERVICE_URL
) {
  throw new Error(
    [
      "ADMIN_API_SERVICE_URL is missing, and this is a production deploy.",
      "",
      "apps/superadmin has no API routes (phase 5): every /api prefix in",
      "src/lib/http/service-routes.ts is rewritten to apps/admin-api, and the",
      "dashboard layout reads the session through it. Without the URL the",
      "rewrites would point at localhost.",
      "",
      "Set it in Vercel > Project > Settings > Environment Variables, scoped to",
      "Production, to the apps/admin-api origin (http(s)://, no trailing slash).",
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

const wrappedConfig: unknown = sentryEnabled ? withSentryConfig(baseConfig, sentryBuildOptions) : baseConfig;

// Function-shaped so the phase reaches serviceRewrites() (see configPhase).
export default function superadminNextConfig(phase: string, context: unknown) {
  configPhase = phase;
  return typeof wrappedConfig === "function" ? wrappedConfig(phase, context) : wrappedConfig;
}
