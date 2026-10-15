// Phase 5 (docs/decisions/backend-separation.md, "Routing"). Every /api prefix
// listed here is proxied to apps/admin-api, unconditionally, through a
// `beforeFiles` rewrite: ADMIN_API_SERVICE_URL in production (the build refuses
// without it), the service's dev port otherwise. /api/health is rewritten too —
// the service's answer is the one the back office used to give.
export const SERVICE_PREFIXES: readonly string[] = [
  "/api/auth",
  "/api/health",
  "/api/v1/admin",
  "/api/v1/finance",
  "/api/v1/me",
  "/api/v1/notifications",
  "/api/v1/search",
  "/api/v1/security",
];

export type Rewrite = { source: string; destination: string };

// Where apps/admin-api answers. Set by ADMIN_API_SERVICE_URL; in development it
// defaults to the service's own dev port (apps/admin-api/src/env.ts: PORT ??
// 3007). A production SERVER never guesses: a missing value throws at the first
// read rather than calling localhost. A production BUILD without it (CI's smoke
// build) still resolves, so the rewrite table can be written; next.config.ts
// refuses the Vercel production build itself, next to its Sentry check.
export type ServiceEnv = {
  ADMIN_API_SERVICE_URL?: string;
  ADMIN_API_PORT?: string;
  NODE_ENV?: string;
  NEXT_PHASE?: string;
  EDURA_SERVICE_BINDINGS?: string;
};

export function serviceUrl(env: ServiceEnv = process.env): string {
  const configured = env.ADMIN_API_SERVICE_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    if (!/^https?:\/\//.test(configured)) throw new Error("ADMIN_API_SERVICE_URL must be an http(s) URL");
    return configured;
  }
  const building = env.NEXT_PHASE === "phase-production-build";
  if (env.NODE_ENV === "production" && !building) {
    throw new Error("ADMIN_API_SERVICE_URL is required in production");
  }
  return `http://localhost:${env.ADMIN_API_PORT ?? 3007}`;
}

export function serviceRewrites(env: ServiceEnv = process.env): Rewrite[] {
  // Vercel Services mode (vercel.json at the project root): the platform routes
  // /api straight to the backend service, and ADMIN_API_SERVICE_URL is a service binding
  // that resolves at runtime only, so there is nothing to rewrite at build time.
  if (env.EDURA_SERVICE_BINDINGS === "1") return [];
  const base = serviceUrl(env);
  // `:path*` also matches the prefix itself; the query string is forwarded as is.
  return SERVICE_PREFIXES.map((prefix) => ({
    source: `${prefix}/:path*`,
    destination: `${base}${prefix}/:path*`,
  }));
}
