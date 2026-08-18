import { platformDb } from "@/lib/db/scope";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { acceptInvite } from "@/lib/services/auth/invite-accept";
import { passwordSchema } from "@/lib/validation/common";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token, password } = await parseJson(req, bodySchema);
    const { userId } = await acceptInvite(token, password);

    const { user, affiliationId } = await platformDb(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, role: true, status: true, name: true, locale: true },
      });

      let affiliationId: string | undefined;
      if (user?.role === "teacher") {
        const aff = await tx.centerTeacherAffiliation.findFirst({
          where: { teacherId: userId, status: "pending" },
          select: { id: true },
        });
        affiliationId = aff?.id;
      }
      return { user, affiliationId };
    });

    return ok({
      user: {
        id: userId,
        email: user?.email ?? "",
        role: user?.role ?? "",
        status: user?.status ?? "active",
        name: user?.name ?? "",
        locale: user?.locale ?? "ar",
      },
      ...(affiliationId ? { affiliationId } : {}),
    });
  }),
  20,
  30,
);
