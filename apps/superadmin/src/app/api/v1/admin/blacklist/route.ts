import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listPlatformBlacklist } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await listPlatformBlacklist());
});
