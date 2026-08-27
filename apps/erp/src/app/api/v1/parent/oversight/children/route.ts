import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listOversightChildren } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  return ok(await listOversightChildren(user));
});
