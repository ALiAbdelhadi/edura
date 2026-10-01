import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listOversightChildren } from "@repo/server-core/services/messages/messages";

export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  return ok(await listOversightChildren(user));
});
