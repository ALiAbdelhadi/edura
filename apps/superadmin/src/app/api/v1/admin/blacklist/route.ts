import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listPlatformBlacklist } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

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
