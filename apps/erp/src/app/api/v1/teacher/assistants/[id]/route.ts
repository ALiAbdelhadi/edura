import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { removeAssistant } from "@/lib/services/teacher/assistants";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("teacher");
    const { id } = await ctx.params;
    return ok(await removeAssistant(user, id ?? ""));
  },
);
