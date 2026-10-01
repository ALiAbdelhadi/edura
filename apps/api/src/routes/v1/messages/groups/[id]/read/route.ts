import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { markGroupRead } from "@repo/server-core/services/messages/messages";

export const POST = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireSession();
    const { id } = await ctx.params;
    return ok(await markGroupRead(user, id ?? ""));
  },
);
