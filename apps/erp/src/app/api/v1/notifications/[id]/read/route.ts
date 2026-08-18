import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;

  const notification = await scopedDb(user, async (tx) => {
    const existing = await tx.notification.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new NotFoundError("Notification not found");
    return tx.notification.update({ where: { id }, data: { read: true } });
  });

  return ok(notification);
});
