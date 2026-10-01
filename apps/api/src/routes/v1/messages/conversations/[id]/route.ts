import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { getConversationThread } from "@repo/server-core/services/messages/messages";

export const GET = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireSession();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const beforeSeq = url.searchParams.get("beforeSeq");
    const limit = url.searchParams.get("limit");
    const result = await getConversationThread(user, id ?? "", {
      beforeSeq: beforeSeq ? Number(beforeSeq) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return ok(result);
  },
);
