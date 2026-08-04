import { authBaseUrl } from "../auth/auth-env";
/**
 * The public origin of the www app — the single source of truth for every
 * externally-visible absolute URL: emailed password-reset links, invite links,
 * invoice PDF/QR URLs persisted in the database, canonical tags and the sitemap.
 *
 * This lived duplicated in five places, each with its own
 * `?? "http://localhost:3002"` fallback. On Vercel none of them had
 * APP_BASE_URL set, so production served `<link rel="canonical"
 * href="http://localhost:3002/…">` and — far worse — *stored* localhost URLs
 * inside invoice rows, where they are permanent.
 *
 * Resolution order:
 *   1. APP_BASE_URL — the explicit, dedicated knob; always wins.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — injected by Vercel on every deployment
 *      (preview included) and set to the shortest production custom domain,
 *      falling back to the *.vercel.app one. Attaching a real domain to the
 *      project therefore fixes every link with no code or config change.
 *      Vercel omits the scheme, so https:// is prepended.
 *   3. NEXTAUTH_URL — already required for auth to work at all.
 *   4. localhost — development only.
 *
 * APP_ORIGIN is deliberately NOT consulted: it configures the realtime server's
 * allowed CORS origins, which is a different question from "where do public
 * links point". Conflating them is how a stale value silently poisons emails.
 */
export function appBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base =
    process.env.APP_BASE_URL ||
    (vercel ? `https://${vercel}` : "") ||
    authBaseUrl() ||
    "http://localhost:3002";
  // Trailing slashes would produce `//path` once callers append a segment.
  return base.replace(/\/+$/, "");
}
