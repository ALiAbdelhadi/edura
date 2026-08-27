import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getChildThread } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("parent");
    const { studentId, id } = await ctx.params;
    const url = new URL(req.url);
    const beforeSeq = url.searchParams.get("beforeSeq");
    const limit = url.searchParams.get("limit");
    return ok(
      await getChildThread(user, studentId ?? "", id ?? "", {
        beforeSeq: beforeSeq ? Number(beforeSeq) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  },
);
