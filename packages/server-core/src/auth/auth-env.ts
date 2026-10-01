import { firstSet } from "@repo/shared/app-url";

export { authBaseUrl } from "@repo/shared/app-url";

export function authSecret(): string | undefined {
  return firstSet("BETTER_AUTH_SECRET", "NEXTAUTH_SECRET");
}

export function superadminAuthSecret(): string | undefined {
  return firstSet("SUPERADMIN_BETTER_AUTH_SECRET", "SUPERADMIN_NEXTAUTH_SECRET");
}

export function usingLegacyAuthEnvNames(): boolean {
  const legacy = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "SUPERADMIN_NEXTAUTH_SECRET"];
  const modern = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "SUPERADMIN_BETTER_AUTH_SECRET"];
  return legacy.some((n, i) => !!process.env[n] && !process.env[modern[i]!]);
}
