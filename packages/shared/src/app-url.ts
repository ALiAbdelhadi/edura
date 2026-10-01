// Environment-only (process.env, no Node module), so the ERP's layout and the
// edge can read it as well as the service. Moved unchanged from
// @repo/server-core/http/app-url.ts and auth/auth-env.ts (authBaseUrl, firstSet).
export function firstSet(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

export function authBaseUrl(): string | undefined {
  return firstSet("BETTER_AUTH_URL", "NEXTAUTH_URL");
}

export function appBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base =
    process.env.APP_BASE_URL ||
    (vercel ? `https://${vercel}` : "") ||
    authBaseUrl() ||
    "http://localhost:3002";
  return base.replace(/\/+$/, "");
}
