import { erpAuth } from "@repo/server-core/erp-auth/instance";
import { erpPublicOrigin } from "@repo/server-core/erp-auth/public-origin";
import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { getViewAsContext, superadminBaseUrl, viewAsRedirect } from "@repo/server-core/erp-auth/view-as";
import { VIEW_AS_ENDED } from "@repo/server-core/erp-auth/view-as-plugin";
import { trustedClientIp } from "@repo/server-core/rate-limit/token-bucket";
import { recordViewAsEnded } from "@repo/server-core/services/auth/view-as-audit";

export async function POST(req: Request): Promise<Response> {
  const back = () => viewAsRedirect(`${superadminBaseUrl()}/dashboard`);

  const context = await getViewAsContext();
  if (!context) {
    return viewAsRedirect(new URL("/dashboard", erpPublicOrigin()));
  }
  const current = await getSessionUser();

  if (current) {
    const ip = trustedClientIp((n) => req.headers.get(n));
    await recordViewAsEnded({
      actorId: context.actorId,
      action: VIEW_AS_ENDED,
      targetId: current.id,
      targetRole: current.role,
      app: "erp",
      ipAddress: ip === "unknown" ? null : ip,
    }).catch(() => {
    });
  }

  const { headers } = await erpAuth().api.signOut({
    headers: req.headers,
    returnHeaders: true,
  });

  const res = back();
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
