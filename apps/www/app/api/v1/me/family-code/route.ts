import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getFamilyCode } from "@/lib/services/parentLinks/parentLinks";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const data = await getFamilyCode(user);
  return ok(data);
});
