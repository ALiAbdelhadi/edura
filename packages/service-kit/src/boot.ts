import { assertSharedRateLimitStore } from "@repo/server-core/rate-limit/require-shared-store";

export type ServiceBootEnv = {
  isProduction: boolean;
  proxySecret: string | undefined;
  // The env var holding this service's better-auth signing secret
  // (`NEXTAUTH_SECRET` for the ERP service, `SUPERADMIN_NEXTAUTH_SECRET` for the
  // back office).
  secretVar: string;
};

// Fails the boot, not the request — the same posture as apps/erp/instrumentation.ts.
export function assertServiceBootEnv(env: ServiceBootEnv): void {
  assertSharedRateLimitStore();
  if (env.isProduction && !env.proxySecret) {
    throw new Error(
      "EDURA_PROXY_SECRET is required in production: without it the service cannot " +
        "tell the frontend proxy's client-IP stamp from a browser header, and every " +
        "per-IP rate limit behind the rewrite would key on the rewrite's own address.",
    );
  }
  // create-auth.ts refuses a non-https NEXTAUTH_URL only when VERCEL_ENV says
  // production, which Railway never sets. The service holds the same line on
  // NODE_ENV, and on the signing secret better-auth would otherwise default.
  if (env.isProduction) {
    if (!process.env.NEXTAUTH_URL?.startsWith("https://")) {
      throw new Error("NEXTAUTH_URL must be an https URL in production — cookies would otherwise be minted without Secure");
    }
    if (!process.env[env.secretVar]?.trim()) {
      throw new Error(`${env.secretVar} is required in production`);
    }
  }
}
