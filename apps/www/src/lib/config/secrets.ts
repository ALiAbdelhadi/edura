// M2: dedicated per-boundary secrets. A single shared secret must NOT silently
// back three trust boundaries (www session signing, realtime handshake JWTs,
// and the server↔server internal bridge) — a leak of one would compromise all.
//
// Each dedicated secret is REQUIRED in production (fail closed). Dev falls back
// to NEXTAUTH_SECRET so local runs need no extra config, mirroring the
// superadmin secret + the C1 production guards. Keep this in lockstep with
// apps/realtime/src/secrets.ts — both ends must resolve the same secret.
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
