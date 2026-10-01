import { presentedSessionTokenIds } from "@repo/server-core/auth/session-cookies";
import { platformDb } from "@repo/server-core/db/scope";
import { SESSION_COOKIE_PREFIX } from "@repo/server-core/erp-auth/cookie-prefix";
import { erpAuth } from "@repo/server-core/erp-auth/instance";

// better-auth's own HTTP handler, as toNextJsHandler(auth) mounted it in the
// Next app: that helper is `(request) => auth.handler(request)` under GET,
// POST, PATCH, PUT and DELETE, and the ERP route exported GET plus its own
// POST — so those two are served here and the rest stay 405, as Next answered
// them. The instance is resolved per request because each host registers its
// own after this module loads: the Next app's carries nextCookies(), the
// service's carries serviceCookies(); neither plugin acts on the router path.
export const GET = (req: Request): Promise<Response> => erpAuth().handler(req);

export async function POST(req: Request): Promise<Response> {
  const isSignOut = new URL(req.url).pathname.endsWith("/sign-out");
  const presented = isSignOut
    ? presentedSessionTokenIds(req.headers.get("cookie"), SESSION_COOKIE_PREFIX)
    : [];

  const response = await erpAuth().handler(req);

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
