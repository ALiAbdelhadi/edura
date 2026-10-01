import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listChildConversations } from "@repo/server-core/services/messages/messages";

export const GET = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("parent");
    const { studentId } = await ctx.params;
    return ok(await listChildConversations(user, studentId ?? ""));
  },
);
