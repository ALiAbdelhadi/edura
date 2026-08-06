import { authSecret } from "@repo/server-core/auth/auth-env";

export function dedicatedSecret(
  name: "REALTIME_JWT_SECRET" | "INTERNAL_API_SECRET",
): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production (no app-secret fallback)`);
  }
  const fallback = authSecret();
  if (!fallback) {
    throw new Error(`${name} or BETTER_AUTH_SECRET must be set (development)`);
  }
  return fallback;
}
