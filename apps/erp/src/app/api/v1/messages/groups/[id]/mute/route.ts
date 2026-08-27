import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setGroupMuted } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const POST = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireSession();
    const { id } = await ctx.params;
    const { muted } = await parseJson(req, z.object({ muted: z.boolean() }));
    return ok(await setGroupMuted(user, id ?? "", muted));
  },
);
