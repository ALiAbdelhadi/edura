import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listChildren } from "@repo/server-core/services/parent-links/parent-links";

export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  const children = await listChildren(user);
  return ok(children);
});
