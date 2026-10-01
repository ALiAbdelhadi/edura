import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listPlatformBlacklist } from "@repo/server-core/services/blacklist/blacklist";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const active = sp.get("active");
  const { data, total, page, limit } = await listPlatformBlacklist({
    level: sp.get("level") ?? undefined,
    active: active === null ? undefined : active === "true",
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  return ok(data, { meta: { total, page, limit } });
});
