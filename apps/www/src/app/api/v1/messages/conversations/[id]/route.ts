import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getConversationThread } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// Conversation history page: newest window by default, `beforeSeq` cursor for
// loading older messages (seq is the server-assigned order key).
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
