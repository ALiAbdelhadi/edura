import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getThread } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (admin, req, ctx) => {
  const { id } = await ctx.params;
  const p = new URL(req.url).searchParams;
  const beforeSeq = p.get("beforeSeq");
  const limit = p.get("limit");
  return ok(
    await getThread(admin.id, id ?? "", {
      beforeSeq: beforeSeq ? Number(beforeSeq) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  );
});
