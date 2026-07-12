import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listChildren } from "@/lib/services/parentLinks/parentLinks";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  const children = await listChildren(user);
  return ok(children);
});
