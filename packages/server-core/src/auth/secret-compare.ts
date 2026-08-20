import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ============================================================================
 * CONSTANT-TIME COMPARISON FOR SHARED SECRETS
 * ============================================================================
 * The three server-to-server doors — the cron runner, the internal chat-notify
 * bridge, and the realtime server's own end of that bridge — each authenticated
 * with a plain `===` / `!==` against an environment secret. `===` on strings
 * short-circuits at the first differing byte, so how long it takes to fail
 * depends on how much of the secret the caller got right. That is the classic
 * shape of a byte-at-a-time recovery oracle.
 *
 * Exploitability over a network is low: these secrets are high-entropy, the
 * doors already fail closed when the variable is unset, and jitter usually
 * swamps a few nanoseconds. Low is not the same as zero, and the codebase
 * already compares its OTHER secrets in constant time — the Paymob HMAC
 * (`mock-driver.ts`), the student QR signature (`student-qr.ts`), the guardian
 * verification token (`guardian-verification.ts`). Three doors doing it the
 * unsafe way was an inconsistency, not a considered exception.
 *
 * WHY HASH FIRST rather than the length-guarded compare used for the HMACs.
 * `timingSafeEqual` throws on unequal lengths, so callers must either guard the
 * length (leaking it) or guarantee it. The HMAC call sites can guarantee it —
 * a digest has a fixed width. These secrets cannot: they are arbitrary operator
 * strings. Hashing both sides to a 32-byte digest makes the lengths equal by
 * construction, so nothing about the real secret's length is observable and the
 * comparison never throws.
 *
 * The existing HMAC/QR/token call sites are deliberately left alone: their
 * fixed-width guards are correct, they carry their own proofs, and rewriting
 * working money and child-safety paths to share this helper would be risk
 * without benefit.
 * ============================================================================
 */

/**
 * True when `provided` matches `expected`, in time independent of how many
 * leading bytes are correct.
 *
 * A missing, empty, or non-string value is always false — an absent header must
 * never authenticate, and an unset secret must never make every caller valid.
 */
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

/**
 * The `Authorization: Bearer <secret>` form of the same check.
 *
 * The scheme prefix is not secret, so matching it with `startsWith` is fine;
 * only the token itself goes through the constant-time path.
 */
export function bearerEquals(
  header: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  return secretEquals(header.slice("Bearer ".length), expected);
}
