import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { searchConversations } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

// Read-only message log. Super admin only — `accountant` is a finance-restricted
// portal and gets no messaging surface (requireRole is a positive allow-list, so
// omitting it here is the whole enforcement).
export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const p = new URL(req.url).searchParams;
  return ok(
    await searchConversations({
      q: p.get("q") ?? undefined,
      role: p.get("role") ?? undefined,
      centerId: p.get("centerId") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      minorsOnly: p.get("minorsOnly") ?? undefined,
      page: p.get("page") ?? undefined,
      limit: p.get("limit") ?? undefined,
    }),
  );
});
