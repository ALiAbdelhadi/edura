import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setGroupMuted } from "@repo/server-core/services/messages/messages";

export const POST = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireSession();
    const { id } = await ctx.params;
    const { muted } = await parseJson(req, z.object({ muted: z.boolean() }));
    return ok(await setGroupMuted(user, id ?? "", muted));
  },
);
