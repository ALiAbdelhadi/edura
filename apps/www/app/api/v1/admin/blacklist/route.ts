import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listPlatformBlacklist } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

// All blacklist entries across every level (super_admin oversight).
export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await listPlatformBlacklist());
});
