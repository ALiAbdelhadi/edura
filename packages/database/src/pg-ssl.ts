/**
 * ============================================================================
 * PIN THE SSL MODE BEFORE `pg` PARSES IT
 * ============================================================================
 * `pg-connection-string` (bundled by `pg` 8.22, reached through
 * `@prisma/adapter-pg` and every script that opens its own pool) prints a
 * process-level SECURITY WARNING for any connection string carrying
 * `sslmode=prefer|require|verify-ca`:
 *
 *     SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'
 *     are treated as aliases for 'verify-full'. In the next major version
 *     (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt
 *     standard libpq semantics, which have weaker security guarantees.
 *
 * The warning is not noise: today those three modes verify the certificate
 * chain AND the hostname; after the next major they will not. Neon hands out
 * `?sslmode=require` in its console, so that string is what every environment
 * here was configured with — meaning a `pg` bump alone, with no change to any
 * env var, would silently downgrade the TLS guarantee on the connection that
 * carries the money ledger.
 *
 * So this is a pin, not a mute. Rewriting `require` -> `verify-full` is a
 * no-op against the current behaviour (they are aliases *now*) and keeps that
 * behaviour when the alias goes away. It is exactly the first remedy the
 * warning itself recommends; the other one (`uselibpqcompat=true`) is the
 * opt-in to the weaker semantics, which is why a string that already sets it
 * is left alone — that is a deliberate choice by whoever wrote it.
 *
 * Applied to BOTH driver paths, not just the `pg` one that emits the warning.
 * The Neon serverless driver tunnels over WSS and does not consult `sslmode`,
 * so normalizing there changes nothing today — but it means flipping
 * `DATABASE_DRIVER` can never change what TLS we get, which is a property
 * worth having over a saved line.
 */

/** The three modes that are aliases today and will not be after pg v9. */
const ALIASED_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Returns `connectionString` with an aliased `sslmode` replaced by the
 * explicit `verify-full` it currently means. Everything else — `disable`,
 * `no-verify`, an already-explicit `verify-full`, no `sslmode` at all, a
 * libpq keyword/value string, or anything unparseable — is returned untouched.
 */
export function pinSslMode(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Not a URL (libpq `host=... sslmode=...` form, or malformed). Handing it
    // back verbatim keeps the failure the caller's to report, with its own
    // error message, rather than this helper's.
    return connectionString;
  }

  // An explicit libpq-compat opt-in means the author WANTS the new semantics.
  // Keyed on PRESENCE, not on the value: `uselibpqcompat=1` is the same
  // deliberate choice as `=true`, and quietly overriding a deliberate choice is
  // the exact failure this module exists to prevent.
  if (url.searchParams.has("uselibpqcompat")) return connectionString;

  const mode = url.searchParams.get("sslmode");
  if (!mode || !ALIASED_MODES.has(mode.toLowerCase())) return connectionString;

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
