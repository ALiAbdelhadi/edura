import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listChildConversations } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// READ-ONLY. Lists the minor child's conversations with ADULTS (teachers,
// assistants, center admins/staff) only. Requires an APPROVED parent link and
// a child who is a minor under the default-minor rule. Nothing here writes —
// in particular it never marks anything read, so a parent's viewing cannot
// corrupt the child's inbox state or leak the parent's presence.
export const GET = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("parent");
    const { studentId } = await ctx.params;
    return ok(await listChildConversations(user, studentId ?? ""));
  },
);
