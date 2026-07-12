import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getThreadMessages } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const user = await requireSession();

  const messages = await getThreadMessages((await ctx.params).id, user);
  return ok(messages);
});
