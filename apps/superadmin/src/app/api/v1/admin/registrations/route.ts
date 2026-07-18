import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listRegistrations } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const allowed = ["pending", "active", "rejected"] as const;
  const s = (allowed as readonly string[]).includes(status) ? (status as (typeof allowed)[number]) : "pending";
  return ok(await listRegistrations(s));
});
