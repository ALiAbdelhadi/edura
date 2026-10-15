// Phase 4 (docs/decisions/backend-separation.md, "Routing"). Every /api prefix
// listed here is proxied to apps/api, unconditionally, through a `beforeFiles`
// rewrite: API_SERVICE_URL in production (the build refuses without it), the
// service's dev port otherwise. /api/health is rewritten too — the service's
// answer (body, status, HEAD, ?deep=mail) is the one the ERP used to give.
export const SERVICE_PREFIXES: readonly string[] = [
  "/api/auth",
  "/api/health",
  "/api/v1/_ping",
  "/api/v1/affiliations",
  "/api/v1/attendance",
  "/api/v1/auth",
  "/api/v1/catalog",
  "/api/v1/center",
  "/api/v1/centers",
  "/api/v1/collaboration-requests",
  "/api/v1/contact",
  "/api/v1/courses",
  "/api/v1/cron",
  "/api/v1/dashboards",
  "/api/v1/deletion-requests",
  "/api/v1/door-checkin",
  "/api/v1/enrollment-requests",
  "/api/v1/enrollments",
  "/api/v1/expenses",
  "/api/v1/grades",
  "/api/v1/guardian",
  "/api/v1/internal",
  "/api/v1/materials",
  "/api/v1/me",
  "/api/v1/messages",
  "/api/v1/notifications",
  "/api/v1/parent",
  "/api/v1/parent-links",
  "/api/v1/payments",
  "/api/v1/public",
  "/api/v1/realtime",
  "/api/v1/reports",
  "/api/v1/reviews",
  "/api/v1/rooms",
  "/api/v1/roster",
  "/api/v1/search",
  "/api/v1/security",
  "/api/v1/sessions",
  "/api/v1/students",
  "/api/v1/subjects",
  "/api/v1/subscriptions",
  "/api/v1/teacher",
  "/api/v1/teachers",
  "/api/v1/team-notes",
  "/api/v1/temp-students",
];

export type Rewrite = { source: string; destination: string };

// Where apps/api answers. Set by API_SERVICE_URL; in development it defaults to
// the service's own dev port (apps/api/src/env.ts: PORT ?? 3006). A production
// SERVER never guesses: a missing value throws at the first read rather than
// calling localhost. A production BUILD without it (CI's smoke build) still
// resolves, so the rewrite table can be written; next.config.ts refuses the
// Vercel production build itself, next to its Sentry check.
export type ServiceEnv = {
  API_SERVICE_URL?: string;
  API_PORT?: string;
  NODE_ENV?: string;
  NEXT_PHASE?: string;
  EDURA_SERVICE_BINDINGS?: string;
};

export function serviceUrl(env: ServiceEnv = process.env): string {
  const configured = env.API_SERVICE_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    if (!/^https?:\/\//.test(configured)) throw new Error("API_SERVICE_URL must be an http(s) URL");
    return configured;
  }
  const building = env.NEXT_PHASE === "phase-production-build";
  if (env.NODE_ENV === "production" && !building) {
    throw new Error("API_SERVICE_URL is required in production");
  }
  return `http://localhost:${env.API_PORT ?? 3006}`;
}

export function serviceRewrites(env: ServiceEnv = process.env): Rewrite[] {
  // Vercel Services mode (vercel.json at the project root): the platform routes
  // /api straight to the backend service, and API_SERVICE_URL is a service binding
  // that resolves at runtime only, so there is nothing to rewrite at build time.
  if (env.EDURA_SERVICE_BINDINGS === "1") return [];
  const base = serviceUrl(env);
  // `:path*` also matches the prefix itself; the query string is forwarded as is.
  return SERVICE_PREFIXES.map((prefix) => ({
    source: `${prefix}/:path*`,
    destination: `${base}${prefix}/:path*`,
  }));
}
