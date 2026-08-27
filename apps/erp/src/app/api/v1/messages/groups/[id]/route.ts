import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { getGroupThread, postToGroup } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<Record<string, string>> };

export const GET = withErrors(async (req: Request, ctx: Ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const beforeSeq = url.searchParams.get("beforeSeq");
  const limit = url.searchParams.get("limit");
  return ok(
    await getGroupThread(user, id ?? "", {
      beforeSeq: beforeSeq ? Number(beforeSeq) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  );
});

const postSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(4000),
  clientId: z.string().max(64).optional(),
});

export const POST = withErrors(async (req: Request, ctx: Ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  const data = await parseJson(req, postSchema);
  return ok(await postToGroup(user, id ?? "", data), { status: 201 });
});
