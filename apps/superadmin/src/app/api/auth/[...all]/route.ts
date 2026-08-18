import { auth } from "@/lib/auth/auth";
import { SESSION_COOKIE_PREFIX } from "@/lib/auth/cookie-prefix";
import { platformDb } from "@/lib/db/scope";
import { presentedSessionTokenIds } from "@repo/server-core/auth/session-cookies";
import { toNextJsHandler } from "better-auth/next-js";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

/**
 * Mirror of apps/www — signing out ends EVERY session this browser presented,
 * not only the one better-auth resolved. The reasoning is in the www copy and
 * in docs/reports/session-identity-mismatch.md; it applies harder here, because
 * a surviving back-office session can read every centre's money.
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
