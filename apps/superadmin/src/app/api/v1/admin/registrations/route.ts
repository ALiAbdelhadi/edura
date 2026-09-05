import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listRegistrations } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const status = p.get("status") ?? "pending";
  const allowed = ["pending", "active", "rejected"] as const;
  const s = (allowed as readonly string[]).includes(status) ? (status as (typeof allowed)[number]) : "pending";
  return ok(await listRegistrations(s, { page: p.get("page"), limit: p.get("limit") }));
});
