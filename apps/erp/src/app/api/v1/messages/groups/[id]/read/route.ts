import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { markGroupRead } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const POST = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireSession();
    const { id } = await ctx.params;
    return ok(await markGroupRead(user, id ?? ""));
  },
);
