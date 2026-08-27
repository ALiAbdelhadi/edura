import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listChildConversations } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("parent");
    const { studentId } = await ctx.params;
    return ok(await listChildConversations(user, studentId ?? ""));
  },
);
