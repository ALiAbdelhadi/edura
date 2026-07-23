import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getThread } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

// Full thread INCLUDING soft-deleted bodies. The service writes a
// `messaging.thread_viewed` audit row in the same call — reading a private
// conversation is itself an audited act.
export const GET = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const admin = await requireRole("super_admin");
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
  },
);
