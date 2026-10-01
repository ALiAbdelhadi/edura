import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parsePageLimit } from "@repo/server-core/validation/common";
import { listNotifications } from "@repo/server-core/services/notifications/inbox";

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

  const { notifications, total } = await listNotifications(user, {
    type,
    read: readParam !== null ? readParam === "true" : undefined,
    page,
    limit,
  });

  return ok(notifications, { meta: { total, page, limit } });
});
