import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { checkHandleAvailability } from "@/lib/services/public-handles/public-handles";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin", "teacher");
  const handle = new URL(req.url).searchParams.get("handle") ?? "";
  return ok(await checkHandleAvailability(user, handle));
});
