import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { token } = await ctx.params;

  const result = await scopedDb(user, (tx) =>
    tx.userDeviceToken.deleteMany({
      where: { token, userId: user.id },
    }),
  );

  if (result.count === 0) throw new NotFoundError("Device token not found");
  return ok({ unregistered: true });
});
