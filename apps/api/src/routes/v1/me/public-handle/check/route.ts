import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { checkHandleAvailability } from "@repo/server-core/services/public-handles/public-handles";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin", "teacher");
  const handle = new URL(req.url).searchParams.get("handle") ?? "";
  return ok(await checkHandleAvailability(user, handle));
});
