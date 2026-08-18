import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

export const POST = withErrors(async () => {
  const user = await requireSession();

  const result = await scopedDb(user, (tx) =>
    tx.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    }),
  );

  return ok({ updated: result.count });
});
