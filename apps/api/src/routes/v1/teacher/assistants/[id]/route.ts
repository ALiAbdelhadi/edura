import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { removeAssistant } from "@repo/server-core/services/teacher/assistants";

export const DELETE = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("teacher");
    const { id } = await ctx.params;
    return ok(await removeAssistant(user, id ?? ""));
  },
);
