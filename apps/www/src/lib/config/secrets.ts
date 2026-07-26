export function requireDedicatedSecret(
  name: "REALTIME_JWT_SECRET" | "INTERNAL_API_SECRET",
): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production (no NEXTAUTH_SECRET fallback)`);
  }
  const fallback = process.env.NEXTAUTH_SECRET;
  if (!fallback) {
    throw new Error(`${name} or NEXTAUTH_SECRET must be set (development)`);
  }
  return fallback;
}
