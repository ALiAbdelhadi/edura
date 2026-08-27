import { createHash, timingSafeEqual } from "node:crypto";

export function secretEquals(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (provided.length === 0 || expected.length === 0) return false;

  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function bearerEquals(
  header: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  return secretEquals(header.slice("Bearer ".length), expected);
}
