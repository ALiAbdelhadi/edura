import { withPlatformContext } from "@repo/database";
import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/session";
import { VIEW_AS_ENDED } from "@/lib/auth/view-as-plugin";
import { getViewAsContext, superadminBaseUrl } from "@/lib/auth/view-as";
import { trustedClientIp } from "@/lib/rate-limit/token-bucket";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * END a view-as session and go back to the back office.
 *
 * Deliberately NOT `requireRole`-guarded: while viewing as, the caller's
 * effective role IS the target's, so any role guard here would lock them inside
 * the session it exists to leave. The real gate is `impersonated_by` — a
 * session without it is an ordinary sign-in and this route refuses to touch it,
 * because "stop" must never become a hidden second logout button on a real
 * user's screen.
 *
 * Ending it SIGNS OUT rather than restoring anything: there is nothing to
 * restore. The admin's own back-office session was never replaced — it is still
 * sitting in a different cookie on a different origin, untouched, which is the
 * whole benefit of the two apps staying separate.
 */
export async function POST(req: NextRequest) {
  const back = () => NextResponse.redirect(`${superadminBaseUrl()}/dashboard`, 303);

  const context = await getViewAsContext();
  if (!context) {
    // Not a view-as session — leave it completely alone.
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  }
  const current = await getSessionUser();

  // Recorded BEFORE the session dies, and attributed to the SUPER ADMIN rather
  // than to the account being viewed — the pair `view_as_claimed` /
  // `view_as_ended` on one actor is what makes the window auditable.
  if (current) {
    await withPlatformContext((tx) =>
      tx.auditLog.create({
        data: {
          actorId: context.actorId,
          action: VIEW_AS_ENDED,
          targetType: "user",
          targetId: current.id,
          afterState: { targetRole: current.role, app: "erp" } as never,
          ipAddress: (() => {
            const ip = trustedClientIp((n) => req.headers.get(n));
            return ip === "unknown" ? null : ip;
          })(),
          onBehalfOf: null,
        },
      }),
    ).catch(() => {
      // An audit write must not strand someone inside an impersonated session.
      // The claim row already proves the window opened; losing the close row is
      // strictly better than refusing to close it.
    });
  }

  const { headers } = await auth.api.signOut({
    headers: req.headers,
    returnHeaders: true,
  });

  const res = back();
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
