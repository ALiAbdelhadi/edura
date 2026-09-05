import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireSession();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const readParam = url.searchParams.get("read");
  const { page, limit } = parsePageLimit(
    {
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit") ?? url.searchParams.get("pageSize"),
    },
    20,
  );

  const where: Prisma.NotificationWhereInput = { userId: user.id };
  if (type) where.type = type as Prisma.NotificationWhereInput["type"];
  if (readParam !== null) where.read = readParam === "true";

  const [notifications, total] = await scopedDb(user, (tx) =>
    Promise.all([
      tx.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.notification.count({ where }),
    ]),
  );

  return ok(notifications, { meta: { total, page, limit } });
});
