import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/session";
import { getViewAsContext, superadminBaseUrl } from "@/lib/auth/view-as";
import { VIEW_AS_ENDED } from "@/lib/auth/view-as-plugin";
import { trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { withPlatformContext } from "@repo/database";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const back = () => NextResponse.redirect(`${superadminBaseUrl()}/dashboard`, 303);

  const context = await getViewAsContext();
  if (!context) {
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  }
  const current = await getSessionUser();

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
