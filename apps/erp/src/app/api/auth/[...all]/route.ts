import { auth } from "@/lib/auth/auth";
import { SESSION_COOKIE_PREFIX } from "@/lib/auth/cookie-prefix";
import { platformDb } from "@/lib/db/scope";
import { presentedSessionTokenIds } from "@repo/server-core/auth/session-cookies";
import { toNextJsHandler } from "better-auth/next-js";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

/**
 * SIGNING OUT MUST END EVERY SESSION THIS BROWSER PRESENTED — not the one the
 * framework happened to resolve.
 *
 * better-auth revokes the session it read, and a cookie name is not unique in a
 * jar (see @repo/server-core/auth/session-cookies). Measured on dev, 2026-08-09,
 * with two real sessions sent on one request: sign-out returned 200, cleared the
 * cookie, deleted the FIRST session — and left the second one live and usable.
 * The refine auth provider already worked around the symptom by calling
 * `signOut()` a second time; a person pressing «تسجيل الخروج» on a shared
 * computer has no such workaround, and no way to know.
 *
 * So after better-auth has done its half, every OTHER token the request carried
 * is deleted by token id, in one statement. Note what this does NOT do: it
 * never touches sessions the request did not present, so signing out on one
 * device still leaves the others alone. Only what this browser was holding is
 * revoked — which is exactly what the person pressing the button meant.
 *
 * Failure here is swallowed on purpose. Sign-out is the one action that must
 * never appear to fail: better-auth's own response is already sound for the
 * resolved session, and the surplus rows are covered by their own expiry.
 * Filed under docs/reports/session-identity-mismatch.md.
 */
export async function POST(req: Request): Promise<Response> {
  const isSignOut = new URL(req.url).pathname.endsWith("/sign-out");
  const presented = isSignOut
    ? presentedSessionTokenIds(req.headers.get("cookie"), SESSION_COOKIE_PREFIX)
    : [];

  const response = await handlers.POST(req);

  if (isSignOut && presented.length > 0) {
    try {
      await platformDb((tx) =>
        tx.authSession.deleteMany({ where: { token: { in: presented } } }),
      );
    } catch (err) {
      console.error("[sign-out] surplus session revocation failed", err);
    }
  }

  return response;
}
